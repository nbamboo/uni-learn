const CLOUD_FUNCTION_NAME = 'questionBankUser'
const OUTBOX_STORAGE_KEY = 'uni-learn-practice-cloud-outbox-v1'
const PROGRESS_STORAGE_KEY = 'uni-learn-practice-cloud-progress-v1'
const CHAPTER_POSITION_STORAGE_KEY = 'uni-learn-practice-chapter-position-v1'
const KNOWLEDGE_POSITION_STORAGE_KEY = 'uni-learn-practice-knowledge-position-v1'
const PREFERENCES_STORAGE_KEY = 'uni-learn-practice-preferences-v1'
const PRACTICE_STATE_STORAGE_KEY = 'uni-learn-practice-state-v1'
const SUMMARY_STORAGE_KEY = 'uni-learn-practice-summary-v1'
const MEMBERSHIP_STORAGE_KEY = 'uni-learn-membership-v1'
const MIGRATION_KEY_PREFIX = 'uni-learn-practice-cloud-migration-v1:'
const UNI_ID_STORAGE_KEYS = ['uni_id_token', 'uni_id_token_expired', 'uniIdToken', 'uniIdTokenExpired']
const SYNC_BATCH_SIZE = 50
const SNAPSHOT_CACHE_TTL = 2 * 60 * 1000
const SUMMARY_CACHE_TTL = 10 * 60 * 1000
const PROFILE_CACHE_TTL = 5 * 60 * 1000
const RECORDS_CACHE_TTL = 10 * 60 * 1000
const SMART_CACHE_TTL = 5 * 60 * 1000
const PREFERENCES_CACHE_TTL = 6 * 60 * 60 * 1000
const MEMBER_EXPIRY_GRACE_MS = 6 * 60 * 60 * 1000
const MAX_SNAPSHOT_QUESTION_IDS = 100
const SYNC_BATCH_TRIGGER = 10
const SYNC_DELAY = 15 * 1000
const RETRY_DELAY = 180
const ANSWER_MODES = ['exam', 'practice', 'review']
const PRACTICE_ENTRY_MODES = ['smart', 'chapter', 'knowledge', 'wrong', 'favorite', 'search', 'sequence']
const MAX_PERSISTED_SUMMARIES = 20

const snapshotCache = new Map()
const summaryCache = new Map()
const summaryRefreshRequiredKeys = new Set()
const userProfileCache = new Map()
const recordsCache = new Map()
const smartCache = new Map()
let loginRequest = null
let preferencesRequest = null
let flushRequest = null
let scheduledFlush = null
let scheduledSyncOptions = null
let progressFlushRequested = false
let eventSequence = 0
let observedPreferencesUserId = getCurrentPracticeUser().uid || ''
let preferencesRefreshRequired = false

export class UserPracticeServiceError extends Error {
	constructor(errCode, errMsg, options) {
		super(errMsg)
		this.name = 'UserPracticeServiceError'
		this.errCode = errCode || 'QUESTION_BANK_USER_CLIENT_ERROR'
		this.requestId = options && options.requestId || ''
		this.retryable = Boolean(options && options.retryable)
		this.cause = options && options.cause
	}
}

function storageAvailable() {
	return typeof uni !== 'undefined'
		&& typeof uni.getStorageSync === 'function'
		&& typeof uni.setStorageSync === 'function'
}

function getStorage(key) {
	if (!storageAvailable()) return null
	try {
		return uni.getStorageSync(key)
	} catch (error) {
		return null
	}
}

function setStorage(key, value) {
	if (!storageAvailable()) return false
	try {
		uni.setStorageSync(key, value)
		return true
	} catch (error) {
		return false
	}
}

function removeStorage(key) {
	if (typeof uni === 'undefined' || typeof uni.removeStorageSync !== 'function') return false
	try {
		uni.removeStorageSync(key)
		return true
	} catch (error) {
		return false
	}
}

function userScopedStorageKey(baseKey) {
	const user = getCurrentPracticeUser()
	return `${baseKey}:${user.uid || 'guest'}`
}

function summaryCacheKey(subjectId) {
	const user = getCurrentPracticeUser()
	return `${user.uid || 'guest'}|${subjectId}`
}

export function getKnowledgeScopeKey(chapterId, knowledge) {
	if (chapterId === undefined || chapterId === null || !String(chapterId) || !knowledge) return ''
	return `${String(chapterId)}|${String(knowledge)}`
}

function readPersistedSummaries() {
	const saved = getStorage(userScopedStorageKey(SUMMARY_STORAGE_KEY))
	return saved && saved.version === 1 && isObject(saved.summaries)
		? saved.summaries
		: {}
}

function getPersistedSummaryEntry(subjectId) {
	const entry = readPersistedSummaries()[subjectId]
	if (!entry || !isObject(entry.data)) return null
	const syncedAt = Number(entry.syncedAt) || 0
	const data = cloneValue(entry.data)
	const todayKey = localDayKey()
	const summaryDayKey = data.todayKey || (syncedAt ? localDayKey(syncedAt) : '')
	if (summaryDayKey && summaryDayKey !== todayKey) {
		data.todayAttempts = 0
		data.todayKey = todayKey
	}
	return {
		data,
		syncedAt
	}
}

function savePersistedSummary(subjectId, summary, syncedAt) {
	if (!subjectId || !isObject(summary)) return
	const summaries = Object.assign({}, readPersistedSummaries(), {
		[subjectId]: {
			data: cloneValue(summary),
			syncedAt: Number(syncedAt) || Date.now()
		}
	})
	Object.keys(summaries)
		.sort((left, right) => Number(summaries[right].syncedAt) - Number(summaries[left].syncedAt))
		.slice(MAX_PERSISTED_SUMMARIES)
		.forEach(key => delete summaries[key])
	setStorage(userScopedStorageKey(SUMMARY_STORAGE_KEY), { version: 1, summaries })
}

function removePersistedSummary(subjectId) {
	const storageKey = userScopedStorageKey(SUMMARY_STORAGE_KEY)
	const summaries = Object.assign({}, readPersistedSummaries())
	if (!summaries[subjectId]) return
	delete summaries[subjectId]
	if (Object.keys(summaries).length) setStorage(storageKey, { version: 1, summaries })
	else removeStorage(storageKey)
}

function clearPracticeLogin() {
	UNI_ID_STORAGE_KEYS.forEach(removeStorage)
	loginRequest = null
	preferencesRequest = null
	userProfileCache.clear()
	summaryRefreshRequiredKeys.clear()
	invalidateUserPracticeCache()
}

function loginRequiredError(errCode) {
	return [
		'QUESTION_BANK_LOGIN_REQUIRED',
		'uni-id-token-expired',
		'uni-id-check-token-failed'
	].indexOf(errCode) > -1
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue(value) {
	if (Array.isArray(value)) return value.map(cloneValue)
	if (!isObject(value)) return value
	const result = {}
	Object.keys(value).forEach(key => {
		result[key] = cloneValue(value[key])
	})
	return result
}

function normalizeLocalPracticeState(value) {
	const source = isObject(value) ? value : {}
	return {
		answers: isObject(source.answers) ? source.answers : {},
		favorites: Array.isArray(source.favorites) ? source.favorites : [],
		favoriteSubjects: isObject(source.favoriteSubjects) ? source.favoriteSubjects : {},
		favoriteUpdatedAt: isObject(source.favoriteUpdatedAt) ? source.favoriteUpdatedAt : {},
		dailyAttempts: isObject(source.dailyAttempts) ? source.dailyAttempts : {}
	}
}

function readLocalPracticeState(value) {
	if (isObject(value)) return normalizeLocalPracticeState(value)
	return normalizeLocalPracticeState(getStorage(userScopedStorageKey(PRACTICE_STATE_STORAGE_KEY)))
}

export function practiceCloudSyncEnabled() {
	const membership = getStorage(userScopedStorageKey(MEMBERSHIP_STORAGE_KEY))
	const expiresAt = Number(membership && membership.expiresAt) || 0
	return Boolean(
		membership
		&& membership.isMember
		&& membership.status !== 'revoked'
		&& expiresAt + MEMBER_EXPIRY_GRACE_MS > Date.now()
	)
}

function deactivateCachedMembership() {
	const storageKey = userScopedStorageKey(MEMBERSHIP_STORAGE_KEY)
	const membership = getStorage(storageKey)
	setStorage(storageKey, Object.assign({}, isObject(membership) ? membership : {}, {
		isMember: false,
		status: 'inactive',
		expiresAt: 0,
		entitlements: {
			adFree: false,
			practiceRecords: true,
			advancedAnswerModes: true
		},
		cachedAt: Date.now()
	}))
}

function normalizePracticePreferences(value) {
	const source = isObject(value) ? value : {}
	return {
		answerMode: ANSWER_MODES.indexOf(source.answerMode) > -1
			? source.answerMode
			: 'practice',
		nightMode: Boolean(source.nightMode),
		updatedAt: Number(source.updatedAt) || 0
	}
}

function preferencesStorageKey() {
	if (typeof uniCloud === 'undefined' || typeof uniCloud.getCurrentUserInfo !== 'function') {
		return PREFERENCES_STORAGE_KEY
	}
	const user = uniCloud.getCurrentUserInfo() || {}
	return user.uid ? `${PREFERENCES_STORAGE_KEY}:${user.uid}` : PREFERENCES_STORAGE_KEY
}

function readPreferencesEntry() {
	const storageKey = preferencesStorageKey()
	let saved = getStorage(storageKey)
	if ((!saved || saved.version !== 1) && storageKey !== PREFERENCES_STORAGE_KEY) {
		saved = getStorage(PREFERENCES_STORAGE_KEY)
	}
	if (!saved || saved.version !== 1 || !isObject(saved.preferences)) {
		return {
			preferences: normalizePracticePreferences(),
			dirty: false,
			syncedAt: 0
		}
	}
	return {
		preferences: normalizePracticePreferences(saved.preferences),
		dirty: Boolean(saved.dirty),
		syncedAt: Number(saved.syncedAt) || 0
	}
}

function savePreferencesEntry(preferences, dirty, syncedAt) {
	const normalized = normalizePracticePreferences(preferences)
	const storageKey = preferencesStorageKey()
	setStorage(storageKey, {
		version: 1,
		preferences: normalized,
		dirty: Boolean(dirty),
		syncedAt: Number(syncedAt) || 0
	})
	if (storageKey !== PREFERENCES_STORAGE_KEY) removeStorage(PREFERENCES_STORAGE_KEY)
	return normalized
}

function hashString(value) {
	let hash = 2166136261
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 16777619)
	}
	return (hash >>> 0).toString(36)
}

function delay(milliseconds) {
	return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export function createPracticeEventId(prefix) {
	eventSequence = (eventSequence + 1) % 1679616
	const random = Math.floor(Math.random() * 2176782336).toString(36)
	return `${prefix || 'event'}-${Date.now().toString(36)}-${eventSequence.toString(36)}-${random}`
}

function readOutbox() {
	const saved = getStorage(userScopedStorageKey(OUTBOX_STORAGE_KEY))
	if (!saved || saved.version !== 1 || !Array.isArray(saved.events)) return []
	return saved.events.filter(isObject)
}

function saveOutbox(events) {
	return setStorage(userScopedStorageKey(OUTBOX_STORAGE_KEY), {
		version: 1,
		events: events.slice()
	})
}

function progressScopeKey(progress) {
	if (!progress || !progress.subjectId) return ''
	const mode = progress.mode === 'knowledge' ? 'knowledge' : 'chapter'
	const scope = mode === 'knowledge'
		? getKnowledgeScopeKey(progress.chapterId, progress.knowledge)
		: progress.chapterId
	return scope === undefined || scope === null || scope === ''
		? ''
		: `${progress.subjectId}|${mode}|${scope}`
}

function readPendingProgresses() {
	const saved = getStorage(userScopedStorageKey(PROGRESS_STORAGE_KEY))
	if (!saved || (saved.version !== 1 && saved.version !== 2)) return []
	const progresses = []
	if (isObject(saved.progress)) progresses.push(saved.progress)
	if (isObject(saved.progresses)) {
		Object.keys(saved.progresses).forEach(key => {
			if (isObject(saved.progresses[key])) progresses.push(saved.progresses[key])
		})
	}
	const latestByScope = {}
	progresses.forEach(progress => {
		const key = progressScopeKey(progress)
		if (!key) return
		const savedProgress = latestByScope[key]
		if (!savedProgress || Number(progress.occurredAt) >= Number(savedProgress.occurredAt)) {
			latestByScope[key] = cloneValue(progress)
		}
	})
	return Object.keys(latestByScope)
		.map(key => latestByScope[key])
		.sort((left, right) => Number(left.occurredAt) - Number(right.occurredAt))
}

function writePendingProgresses(progresses) {
	const limited = progresses
		.slice()
		.sort((left, right) => Number(right.occurredAt) - Number(left.occurredAt))
	if (!limited.length) {
		const storageKey = userScopedStorageKey(PROGRESS_STORAGE_KEY)
		if (removeStorage(storageKey)) return true
		return setStorage(storageKey, null)
	}
	const progressMap = {}
	limited.forEach(progress => {
		const key = progressScopeKey(progress)
		if (key) progressMap[key] = cloneValue(progress)
	})
	return setStorage(userScopedStorageKey(PROGRESS_STORAGE_KEY), {
		version: 2,
		progresses: progressMap
	})
}

function savePendingProgress(progress) {
	if (!progress) return writePendingProgresses([])
	const key = progressScopeKey(progress)
	if (!key) return false
	const pending = readPendingProgresses().filter(item => progressScopeKey(item) !== key)
	pending.push(progress)
	return writePendingProgresses(pending)
}

function removePendingProgress(progress) {
	const key = progressScopeKey(progress)
	const remaining = readPendingProgresses().filter(item => {
		return progressScopeKey(item) !== key || item.progressId !== progress.progressId
	})
	return writePendingProgresses(remaining)
}

function readPracticePositions(storageKey) {
	const saved = getStorage(userScopedStorageKey(storageKey))
	if (!saved || saved.version !== 1 || !isObject(saved.positions)) return {}
	return cloneValue(saved.positions)
}

function savePracticePosition(storageKey, positionKey, progress) {
	const positions = readPracticePositions(storageKey)
	positions[positionKey] = {
		subjectId: progress.subjectId,
		chapterId: progress.chapterId,
		knowledge: progress.knowledge || '',
		questionId: progress.questionId,
		updatedAt: progress.occurredAt
	}
	setStorage(userScopedStorageKey(storageKey), { version: 1, positions })
}

function enqueueEvent(event) {
	const events = readOutbox()
	const duplicateIndex = events.findIndex(item => item.eventId === event.eventId)
	if (duplicateIndex > -1) events.splice(duplicateIndex, 1)
	if (event.type === 'favorite') {
		for (let index = events.length - 1; index >= 0; index -= 1) {
			const pending = events[index]
			if (pending.type === 'favorite'
				&& pending.subjectId === event.subjectId
				&& pending.questionId === event.questionId) {
				events.splice(index, 1)
			}
		}
	}
	events.push(cloneValue(event))
	saveOutbox(events)
	if (practiceCloudSyncEnabled()) {
		schedulePracticeSync({
			includeProgress: false,
			immediate: events.length >= SYNC_BATCH_TRIGGER
		})
	}
	return event.eventId
}

function answersMatch(selected, answer) {
	if (!Array.isArray(selected) || !Array.isArray(answer)) return null
	const left = selected.slice().sort()
	const right = answer.slice().sort()
	return left.length === right.length && left.every((item, index) => item === right[index])
}

export function queuePracticeAnswer(question, selected, options) {
	const config = options || {}
	const chapterId = question && question.chapterId
	const localCorrect = typeof config.correct === 'boolean'
		? config.correct
		: answersMatch(selected, question && question.answer)
	const event = {
		type: 'answer',
		eventId: config.eventId || createPracticeEventId('answer'),
		subjectId: question.subjectId,
		questionId: question.questionId || question.id,
		selected: (selected || []).slice(),
		occurredAt: Number(config.occurredAt) || Date.now()
	}
	if (PRACTICE_ENTRY_MODES.indexOf(config.practiceMode) > -1) {
		event.practiceMode = config.practiceMode
	}
	if (typeof localCorrect === 'boolean'
		&& chapterId !== undefined
		&& chapterId !== null
		&& String(chapterId)) {
		event.judgedLocally = true
		event.correct = localCorrect
		event.chapterId = String(chapterId)
		event.knowledge = question.knowledge || ''
	}
	invalidateUserPracticeCache(event.subjectId)
	return enqueueEvent(event)
}

export function queuePracticeFavorite(question, favorite, options) {
	const config = options || {}
	const event = {
		type: 'favorite',
		eventId: config.eventId || createPracticeEventId('favorite'),
		subjectId: question.subjectId,
		questionId: question.questionId || question.id,
		favorite: Boolean(favorite),
		occurredAt: Number(config.occurredAt) || Date.now()
	}
	invalidateUserPracticeCache(event.subjectId)
	return enqueueEvent(event)
}

export function savePracticeProgress(question, options) {
	const config = options || {}
	const subjectId = question && question.subjectId
	const chapterId = question && (question.chapterId || config.chapterId)
	const knowledge = config.knowledge || question && question.knowledge || ''
	const mode = config.mode === 'knowledge' ? 'knowledge' : 'chapter'
	const questionId = question && (question.questionId || question.id)
	if (!subjectId || chapterId === undefined || chapterId === null || !questionId) return null
	if (mode === 'knowledge' && !knowledge) return null
	const progress = {
		progressId: config.progressId || createPracticeEventId('progress'),
		subjectId,
		mode,
		chapterId: String(chapterId),
		knowledge: mode === 'knowledge' ? knowledge : '',
		questionId,
		occurredAt: Number(config.occurredAt) || Date.now()
	}
	if (mode === 'knowledge') {
		savePracticePosition(
			KNOWLEDGE_POSITION_STORAGE_KEY,
			`${progress.subjectId}|${getKnowledgeScopeKey(progress.chapterId, progress.knowledge)}`,
			progress
		)
	} else {
		savePracticePosition(
			CHAPTER_POSITION_STORAGE_KEY,
			`${progress.subjectId}|${progress.chapterId}`,
			progress
		)
	}
	savePendingProgress(progress)
	return progress.progressId
}

export function getChapterPracticePosition(subjectId, chapterId) {
	if (!subjectId || chapterId === undefined || chapterId === null) return null
	const positions = readPracticePositions(CHAPTER_POSITION_STORAGE_KEY)
	const position = positions[`${subjectId}|${String(chapterId)}`]
	return position && position.questionId ? cloneValue(position) : null
}

export function getKnowledgePracticePosition(subjectId, chapterId, knowledge) {
	if (knowledge === undefined) {
		knowledge = chapterId
		chapterId = ''
	}
	if (!subjectId || !knowledge) return null
	const positions = readPracticePositions(KNOWLEDGE_POSITION_STORAGE_KEY)
	const scopedKey = getKnowledgeScopeKey(chapterId, knowledge)
	const scopedPosition = scopedKey && positions[`${subjectId}|${scopedKey}`]
	const legacyPosition = positions[`${subjectId}|${knowledge}`]
	const position = scopedPosition || (legacyPosition
		&& (!chapterId || !legacyPosition.chapterId || String(legacyPosition.chapterId) === String(chapterId))
		? legacyPosition
		: null)
	return position && position.questionId ? cloneValue(position) : null
}

export function getCurrentPracticeUser() {
	if (typeof uniCloud === 'undefined' || typeof uniCloud.getCurrentUserInfo !== 'function') {
		return { uid: null, tokenExpired: 0 }
	}
	const user = uniCloud.getCurrentUserInfo() || {}
	return {
		uid: user.uid || null,
		tokenExpired: Number(user.tokenExpired) || 0,
		role: Array.isArray(user.role) ? user.role : [],
		permission: Array.isArray(user.permission) ? user.permission : []
	}
}

function observePracticePreferencesUser() {
	const userId = getCurrentPracticeUser().uid || ''
	if (userId !== observedPreferencesUserId) {
		observedPreferencesUserId = userId
		preferencesRequest = null
		preferencesRefreshRequired = Boolean(userId)
		markPracticeSummaryRefreshRequired()
	}
	return userId
}

export function markPracticePreferencesRefreshRequired() {
	preferencesRefreshRequired = true
}

export function markPracticeRecordsRefreshRequired() {
	recordsCache.clear()
}

export function markPracticeSummaryRefreshRequired() {
	summaryCache.clear()
	summaryRefreshRequiredKeys.clear()
	Object.keys(readPersistedSummaries()).forEach(subjectId => {
		summaryRefreshRequiredKeys.add(summaryCacheKey(subjectId))
	})
}

export function practiceUserLoggedIn() {
	const user = getCurrentPracticeUser()
	return Boolean(user.uid && user.tokenExpired > Date.now() + 30 * 1000)
}

function callUniLogin() {
	if (typeof uni === 'undefined' || typeof uni.login !== 'function') {
		return Promise.reject(new UserPracticeServiceError(
			'QUESTION_BANK_LOGIN_UNAVAILABLE',
			'当前运行环境不支持微信登录'
		))
	}
	return new Promise((resolve, reject) => {
		uni.login({
			provider: 'weixin',
			success: resolve,
			fail: error => reject(new UserPracticeServiceError(
				'QUESTION_BANK_WEIXIN_LOGIN_FAILED',
				(error && error.errMsg) || '微信登录失败',
				{ cause: error }
			))
		})
	})
}

async function loginByWeixin() {
	if (typeof uniCloud === 'undefined' || typeof uniCloud.importObject !== 'function') {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_LOGIN_UNAVAILABLE',
			'当前运行环境不支持uniCloud登录'
		)
	}
	const loginResult = await callUniLogin()
	if (!loginResult || !loginResult.code) {
		throw new UserPracticeServiceError('QUESTION_BANK_WEIXIN_LOGIN_FAILED', '微信登录未返回有效code')
	}
	let uniIdCo
	try {
		uniIdCo = uniCloud.importObject('uni-id-co', { customUI: true })
	} catch (error) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_UNI_ID_NOT_CONFIGURED',
			'登录服务尚未部署，请先配置uni-id-co',
			{ cause: error }
		)
	}
	let result
	try {
		result = await uniIdCo.loginByWeixin({ code: loginResult.code })
	} catch (error) {
		throw new UserPracticeServiceError(
			error && error.errCode || 'QUESTION_BANK_WEIXIN_LOGIN_FAILED',
			error && (error.errMsg || error.message) || '微信登录失败',
			{ cause: error }
		)
	}
	if (result && result.errCode) {
		throw new UserPracticeServiceError(result.errCode, result.errMsg || '微信登录失败')
	}
	const user = getCurrentPracticeUser()
	if (!user.uid) {
		throw new UserPracticeServiceError('QUESTION_BANK_WEIXIN_LOGIN_FAILED', '登录成功但未取得用户身份')
	}
	userProfileCache.clear()
	invalidateUserPracticeCache()
	return user
}

export async function ensurePracticeUser() {
	if (practiceUserLoggedIn()) return getCurrentPracticeUser()
	if (loginRequest) return loginRequest
	loginRequest = loginByWeixin().then(user => {
		loginRequest = null
		return user
	}, error => {
		loginRequest = null
		throw error
	})
	return loginRequest
}

async function executeCloudCall(action, payload, options) {
	const config = options || {}
	await ensurePracticeUser()
	if (typeof uniCloud === 'undefined' || typeof uniCloud.callFunction !== 'function') {
		throw new UserPracticeServiceError('QUESTION_BANK_USER_CLOUD_UNAVAILABLE', '当前运行环境不支持uniCloud')
	}
	let lastError = null
	const retries = config.retry === false ? 0 : 1
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const response = await uniCloud.callFunction({
				name: CLOUD_FUNCTION_NAME,
				data: Object.assign({ action }, payload || {})
			})
			const result = response && response.result
			if (!result || typeof result !== 'object') {
				throw new UserPracticeServiceError('QUESTION_BANK_USER_INVALID_RESPONSE', '用户题库服务返回格式不正确')
			}
			if (result.errCode !== 0) {
				if (loginRequiredError(result.errCode) && attempt < retries) {
					clearPracticeLogin()
					await ensurePracticeUser()
					continue
				}
				if (result.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED') {
					deactivateCachedMembership()
				}
				throw new UserPracticeServiceError(
					result.errCode || 'QUESTION_BANK_USER_CLOUD_ERROR',
					result.errMsg || '用户题库服务请求失败',
					{ requestId: result.requestId || response.requestId }
				)
			}
			return result.data
		} catch (error) {
			if (error instanceof UserPracticeServiceError && !error.retryable) throw error
			lastError = error
			if (attempt < retries) await delay(RETRY_DELAY)
		}
	}
	throw new UserPracticeServiceError(
		'QUESTION_BANK_USER_NETWORK_ERROR',
		'做题数据同步失败，请检查网络后重试',
		{ retryable: true, cause: lastError }
	)
}

function prepareLegacyMigration(userId, localState) {
	if (!localState || !isObject(localState)) return
	const migrationKey = `${MIGRATION_KEY_PREFIX}${userId}`
	const migration = getStorage(migrationKey)
	if (migration && (migration.prepared || migration.complete)) return
	const state = localState
	const events = readOutbox()
	const eventIds = new Set(events.map(item => item.eventId))

	const answers = isObject(state.answers) ? state.answers : {}
	Object.keys(answers).forEach(questionId => {
		const answer = answers[questionId]
		if (!answer || !answer.subjectId || !Array.isArray(answer.selected) || !answer.selected.length) return
		const answerKey = `${answer.subjectId}|${questionId}`
		const timestamp = Number(answer.timestamp) || Date.now()
		const event = {
			type: 'answer',
			eventId: `legacy-state-${hashString(answerKey)}`,
			subjectId: answer.subjectId,
			questionId,
			selected: answer.selected.slice(),
			occurredAt: timestamp
		}
		if (PRACTICE_ENTRY_MODES.indexOf(answer.practiceMode) > -1) event.practiceMode = answer.practiceMode
		if (!eventIds.has(event.eventId)) {
			events.push(event)
			eventIds.add(event.eventId)
		}
	})

	const favorites = Array.isArray(state.favorites) ? state.favorites : []
	const favoriteSubjects = isObject(state.favoriteSubjects) ? state.favoriteSubjects : {}
	const favoriteUpdatedAt = isObject(state.favoriteUpdatedAt) ? state.favoriteUpdatedAt : {}
	favorites.forEach(questionId => {
		const subjectId = favoriteSubjects[questionId]
		if (!subjectId) return
		const hasPending = events.some(item => item.type === 'favorite'
			&& item.subjectId === subjectId
			&& item.questionId === questionId)
		if (hasPending) return
		events.push({
			type: 'favorite',
			eventId: `legacy-favorite-${hashString(`${subjectId}|${questionId}`)}`,
			subjectId,
			questionId,
			favorite: true,
			occurredAt: Number(favoriteUpdatedAt[questionId]) || Date.now()
		})
	})

	saveOutbox(events)
	setStorage(migrationKey, {
		version: 1,
		prepared: true,
		complete: false,
		preparedAt: Date.now()
	})
}

function markMigrationComplete(userId, remainingEvents) {
	if (remainingEvents.some(item => item.eventId && item.eventId.indexOf('legacy-') === 0)) return
	const migrationKey = `${MIGRATION_KEY_PREFIX}${userId}`
	const migration = getStorage(migrationKey)
	if (!migration || !migration.prepared || migration.complete) return
	setStorage(migrationKey, Object.assign({}, migration, {
		complete: true,
		completedAt: Date.now()
	}))
}

export async function flushPracticeEvents(options) {
	const config = options || {}
	if (!practiceCloudSyncEnabled()) {
		if (scheduledFlush) clearTimeout(scheduledFlush)
		scheduledFlush = null
		scheduledSyncOptions = null
		progressFlushRequested = false
		return { synced: false, localOnly: true, pending: 0 }
	}
	if (scheduledFlush) {
		clearTimeout(scheduledFlush)
		scheduledFlush = null
		scheduledSyncOptions = null
	}
	if (config.includeProgress !== false) progressFlushRequested = true
	if (flushRequest) return flushRequest
	const hasQueuedEvents = readOutbox().length > 0
	const hasQueuedProgress = progressFlushRequested && readPendingProgresses().length > 0
	const canPrepareLoggedInMigration = Boolean(config.localState) && practiceUserLoggedIn()
	if (!hasQueuedEvents && !hasQueuedProgress && !canPrepareLoggedInMigration) {
		progressFlushRequested = false
		return { synced: true, pending: 0 }
	}
	flushRequest = (async () => {
		const user = await ensurePracticeUser()
		if (config.localState) prepareLegacyMigration(user.uid, config.localState)
		let events = readOutbox()
		while (events.length || (progressFlushRequested && readPendingProgresses().length)) {
			const progress = progressFlushRequested ? readPendingProgresses()[0] : null
			const batch = events.slice(0, SYNC_BATCH_SIZE)
			const payload = { events: batch }
			if (progress) payload.progress = progress
			const result = await executeCloudCall('syncEvents', payload)
			const completedIds = new Set([].concat(
				result && result.acceptedEventIds || [],
				result && result.duplicateEventIds || [],
				result && result.rejectedEventIds || []
			))
			if (batch.length && !completedIds.size) {
				throw new UserPracticeServiceError('QUESTION_BANK_USER_INVALID_RESPONSE', '同步服务未确认任何记录')
			}
			if (progress) {
				const progressResult = result && result.progress
				if (!progressResult || progressResult.progressId !== progress.progressId || !progressResult.saved) {
					throw new UserPracticeServiceError('QUESTION_BANK_USER_INVALID_RESPONSE', '同步服务未确认学习进度')
				}
				removePendingProgress(progress)
				invalidateUserPracticeCache(progress.subjectId)
			}
			events = readOutbox().filter(item => !completedIds.has(item.eventId))
			saveOutbox(events)
			batch.forEach(item => invalidateUserPracticeCache(item.subjectId))
			const summaries = result && result.summaries
			if (isObject(summaries)) {
				Object.keys(summaries).forEach(subjectId => {
					cacheCloudSummary(subjectId, summaries[subjectId])
				})
			}
		}
		markMigrationComplete(user.uid, events)
		return { synced: true, pending: 0 }
	})().then(result => {
		const remainingEvents = readOutbox().length
		const remainingProgress = readPendingProgresses().length
		const shouldFlushProgress = progressFlushRequested && remainingProgress > 0
		progressFlushRequested = false
		flushRequest = null
		if (remainingEvents || shouldFlushProgress) {
			schedulePracticeSync({
				includeProgress: shouldFlushProgress,
				immediate: remainingEvents >= SYNC_BATCH_TRIGGER
			})
		}
		return result
	}, error => {
		flushRequest = null
		throw error
	})
	return flushRequest
}

export function schedulePracticeSync(options) {
	if (!practiceCloudSyncEnabled()) return
	const input = options || {}
	const nextOptions = {
		includeProgress: input.includeProgress !== false,
		localState: input.localState
	}
	if (scheduledSyncOptions) {
		scheduledSyncOptions = {
			includeProgress: scheduledSyncOptions.includeProgress || nextOptions.includeProgress,
			localState: nextOptions.localState || scheduledSyncOptions.localState
		}
	} else {
		scheduledSyncOptions = nextOptions
	}
	const immediate = Boolean(input.immediate) || readOutbox().length >= SYNC_BATCH_TRIGGER
	if (scheduledFlush && !immediate) return
	if (scheduledFlush) clearTimeout(scheduledFlush)
	scheduledFlush = setTimeout(() => {
		scheduledFlush = null
		const syncOptions = scheduledSyncOptions || nextOptions
		scheduledSyncOptions = null
		flushPracticeEvents(syncOptions).catch(() => {
			// The persistent outbox will retry on the next foreground/page request.
		})
	}, immediate ? 0 : SYNC_DELAY)
}

function getCached(cache, key) {
	const saved = cache.get(key)
	if (!saved || saved.expiresAt <= Date.now()) {
		cache.delete(key)
		return null
	}
	return cloneValue(saved.data)
}

function setCached(cache, key, data, ttl) {
	cache.set(key, { data: cloneValue(data), expiresAt: Date.now() + ttl })
	return cloneValue(data)
}

function cacheCloudSummary(subjectId, summary) {
	const cacheKey = summaryCacheKey(subjectId)
	const saved = setCached(summaryCache, cacheKey, summary, SUMMARY_CACHE_TTL)
	savePersistedSummary(subjectId, saved, Date.now())
	summaryRefreshRequiredKeys.delete(cacheKey)
	return saved
}

function localDayKey(value) {
	const date = value ? new Date(value) : new Date()
	const pad = number => number < 10 ? `0${number}` : String(number)
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function localAnswersForSubject(subjectId, localState) {
	const state = readLocalPracticeState(localState)
	return Object.keys(state.answers).map(questionId => ({
		questionId,
		answer: state.answers[questionId]
	})).filter(item => item.answer && item.answer.subjectId === subjectId)
}

function getLocalPracticeSummary(subjectId, localState) {
	const state = readLocalPracticeState(localState)
	const answers = localAnswersForSubject(subjectId, state)
	const correct = answers.filter(item => Boolean(item.answer.correct)).length
	const favorites = state.favorites.filter(questionId => state.favoriteSubjects[questionId] === subjectId)
	const todayKey = localDayKey()
	const daily = state.dailyAttempts[subjectId]
	return {
		subjectId,
		attempted: answers.length,
		correct,
		wrong: answers.length - correct,
		favorite: favorites.length,
		totalAttempts: answers.reduce((total, item) => total + (Number(item.answer.attempts) || 0), 0),
		todayAttempts: daily && daily.dayKey === todayKey ? (Number(daily.attempts) || 0) : 0,
		todayKey,
		accuracy: answers.length ? Math.round(correct / answers.length * 100) : 0,
		_localOnly: true
	}
}

function getLocalPracticeSnapshot(subjectId, options) {
	const config = options || {}
	const state = readLocalPracticeState(config.localState)
	const answers = localAnswersForSubject(subjectId, state)
	const requestedIds = Array.isArray(config.questionIds)
		? Array.from(new Set(config.questionIds.filter(Boolean))).slice(0, MAX_SNAPSHOT_QUESTION_IDS)
		: []
	const requested = new Set(requestedIds)
	const rows = requestedIds.length
		? answers.filter(item => requested.has(item.questionId))
		: []
	const answeredRows = rows.slice().sort((left, right) => {
		return (Number(right.answer.timestamp) || 0) - (Number(left.answer.timestamp) || 0)
	})
	const favoriteIds = requestedIds.length
		? state.favorites.filter(questionId => requested.has(questionId)
			&& state.favoriteSubjects[questionId] === subjectId)
			.sort((left, right) => {
				return (Number(state.favoriteUpdatedAt[right]) || 0)
					- (Number(state.favoriteUpdatedAt[left]) || 0)
			})
		: []
	const answerSelections = {}
	answeredRows.forEach(item => {
		if (Array.isArray(item.answer.selected) && item.answer.selected.length) {
			answerSelections[item.questionId] = item.answer.selected.slice()
		}
	})
	const chapterAttempts = {}
	const knowledgeAttempts = {}
	if (config.includeAggregates !== false) {
		answers.forEach(item => {
			const modes = Array.isArray(item.answer.practiceModes) ? item.answer.practiceModes : []
			if (modes.indexOf('chapter') > -1 && item.answer.chapterId) {
				chapterAttempts[item.answer.chapterId] = (chapterAttempts[item.answer.chapterId] || 0) + 1
			}
			if (modes.indexOf('knowledge') > -1 && item.answer.knowledge) {
				const scopeKey = getKnowledgeScopeKey(item.answer.chapterId, item.answer.knowledge)
				const key = scopeKey || item.answer.knowledge
				knowledgeAttempts[key] = (knowledgeAttempts[key] || 0) + 1
			}
		})
	}
	const progressPositions = { chapter: {}, knowledge: {} }
	if (config.includeProgress !== false) {
		const chapterPositions = readPracticePositions(CHAPTER_POSITION_STORAGE_KEY)
		Object.keys(chapterPositions).forEach(key => {
			const position = chapterPositions[key]
			if (position && position.subjectId === subjectId && position.chapterId && position.questionId) {
				progressPositions.chapter[position.chapterId] = position.questionId
			}
		})
		const knowledgePositions = readPracticePositions(KNOWLEDGE_POSITION_STORAGE_KEY)
		Object.keys(knowledgePositions).forEach(key => {
			const position = knowledgePositions[key]
			if (position && position.subjectId === subjectId && position.knowledge && position.questionId) {
				const scopeKey = getKnowledgeScopeKey(position.chapterId, position.knowledge)
				progressPositions.knowledge[scopeKey || position.knowledge] = position.questionId
			}
		})
	}
	return {
		subjectId,
		answeredQuestionIds: answeredRows.map(item => item.questionId),
		answerSelections,
		wrongQuestionIds: answeredRows.filter(item => item.answer.correct === false)
			.map(item => item.questionId),
		favoriteQuestionIds: favoriteIds,
		chapterAttempts,
		knowledgeAttempts,
		progressPositions,
		_localOnly: true
	}
}

function localRecordBelongsToSubject(state, questionId, subjectId) {
	const answer = state.answers[questionId]
	const savedSubjectId = state.favoriteSubjects[questionId]
	return savedSubjectId === subjectId
		|| answer && answer.subjectId === subjectId
		|| (!savedSubjectId
			&& (!answer || !answer.subjectId)
			&& subjectId === 'junior-personal-finance'
			&& questionId.indexOf('ipf-') === 0)
}

function getLocalPracticeRecords(params) {
	const input = params || {}
	const subjectId = input.subjectId
	const type = input.type === 'favorite' ? 'favorite' : 'wrong'
	const page = Math.max(1, Number(input.page) || 1)
	const pageSize = Math.max(1, Math.min(50, Number(input.pageSize) || 20))
	const state = readLocalPracticeState(input.localState)
	let rows
	if (type === 'favorite') {
		rows = state.favorites
			.filter(questionId => localRecordBelongsToSubject(state, questionId, subjectId))
			.map(questionId => ({
				questionId,
				correct: Boolean(state.answers[questionId] && state.answers[questionId].correct),
				timestamp: Number(state.favoriteUpdatedAt[questionId]) || 0
			}))
	} else {
		rows = Object.keys(state.answers)
			.filter(questionId => {
				const answer = state.answers[questionId]
				return answer
					&& answer.correct === false
					&& localRecordBelongsToSubject(state, questionId, subjectId)
			})
			.map(questionId => ({
				questionId,
				correct: false,
				timestamp: Number(state.answers[questionId].timestamp) || 0
			}))
	}
	rows.sort((left, right) => right.timestamp - left.timestamp)
	const offset = (page - 1) * pageSize
	const items = rows.slice(offset, offset + pageSize).map(row => ({
		recordId: `${type}-${row.questionId}`,
		question: { id: row.questionId },
		correct: row.correct,
		timestamp: row.timestamp
	}))
	return {
		subjectId,
		type,
		page,
		pageSize,
		total: rows.length,
		hasMore: offset + items.length < rows.length,
		items,
		_localOnly: true
	}
}

export function invalidateUserPracticeCache(subjectId) {
	if (subjectId) {
		Array.from(snapshotCache.keys()).forEach(key => {
			if (key.indexOf(`${subjectId}|`) === 0) snapshotCache.delete(key)
		})
		Array.from(recordsCache.keys()).forEach(key => {
			if (key.indexOf(`${subjectId}|`) === 0) recordsCache.delete(key)
		})
		Array.from(smartCache.keys()).forEach(key => {
			if (key.indexOf(`${subjectId}|`) === 0) smartCache.delete(key)
		})
		Array.from(summaryCache.keys()).forEach(key => {
			if (key.endsWith(`|${subjectId}`)) summaryCache.delete(key)
		})
		return
	}
	snapshotCache.clear()
	summaryCache.clear()
	recordsCache.clear()
	smartCache.clear()
}

export function getCachedPracticeSummary(subjectId) {
	observePracticePreferencesUser()
	if (!practiceCloudSyncEnabled() || pendingPracticeEventCount() > 0) return null
	const cacheKey = summaryCacheKey(subjectId)
	const memorySummary = getCached(summaryCache, cacheKey)
	if (memorySummary) return memorySummary
	const persisted = getPersistedSummaryEntry(subjectId)
	return persisted ? cloneValue(persisted.data) : null
}

export async function getPracticeSummary(subjectId, options) {
	const config = options || {}
	observePracticePreferencesUser()
	if (!practiceCloudSyncEnabled()) {
		return getLocalPracticeSummary(subjectId, config.localState)
	}
	const cacheKey = summaryCacheKey(subjectId)
	const refreshRequired = config.forceRefresh || summaryRefreshRequiredKeys.has(cacheKey)
	if (!refreshRequired && pendingPracticeEventCount() === 0) {
		const cached = getCached(summaryCache, cacheKey)
		if (cached) return cached
		const persisted = getPersistedSummaryEntry(subjectId)
		if (persisted && persisted.syncedAt + SUMMARY_CACHE_TTL > Date.now()) {
			return setCached(
				summaryCache,
				cacheKey,
				persisted.data,
				persisted.syncedAt + SUMMARY_CACHE_TTL - Date.now()
			)
		}
	}
	if (config.localState) await flushPracticeEvents({ localState: config.localState })
	else await ensurePracticeUser()
	if (!config.forceRefresh && !summaryRefreshRequiredKeys.has(cacheKey)) {
		const cached = getCached(summaryCache, cacheKey)
		if (cached) return cached
	}
	const result = await executeCloudCall('getSummary', { subjectId })
	return cacheCloudSummary(subjectId, result)
}

export async function getPracticeStateSnapshot(subjectId, options) {
	const config = options || {}
	if (!practiceCloudSyncEnabled()) {
		return getLocalPracticeSnapshot(subjectId, config)
	}
	const questionIds = Array.isArray(config.questionIds)
		? Array.from(new Set(config.questionIds.filter(Boolean))).slice(0, MAX_SNAPSHOT_QUESTION_IDS)
		: []
	const includeAggregates = config.includeAggregates !== false
	const includeProgress = config.includeProgress !== false
	const cacheKey = `${subjectId}|${includeAggregates ? 1 : 0}|${includeProgress ? 1 : 0}|${hashString(questionIds.slice().sort().join('|'))}`
	if (!config.forceRefresh && pendingPracticeEventCount() === 0) {
		const cached = getCached(snapshotCache, cacheKey)
		if (cached) return cached
	}
	if (config.localState) await flushPracticeEvents({ localState: config.localState })
	else await ensurePracticeUser()
	if (!config.forceRefresh) {
		const cached = getCached(snapshotCache, cacheKey)
		if (cached) return cached
	}
	const result = await executeCloudCall('getStateSnapshot', {
		subjectId,
		questionIds,
		includeAggregates,
		includeProgress
	})
	return setCached(snapshotCache, cacheKey, result, SNAPSHOT_CACHE_TTL)
}

export async function getPracticeRecords(params) {
	const input = params || {}
	if (!practiceCloudSyncEnabled()) {
		return getLocalPracticeRecords(input)
	}
	const subjectId = input.subjectId
	const type = input.type || 'wrong'
	const page = input.page || 1
	const pageSize = input.pageSize || 20
	const cacheKey = `${subjectId}|${type}|${page}|${pageSize}`
	if (!input.forceRefresh && pendingPracticeEventCount() === 0) {
		const cached = getCached(recordsCache, cacheKey)
		if (cached) return cached
	}
	await flushPracticeEvents({ includeProgress: false })
	if (!input.forceRefresh) {
		const cached = getCached(recordsCache, cacheKey)
		if (cached) return cached
	}
	const result = await executeCloudCall('getRecords', {
		subjectId,
		type,
		page,
		pageSize
	})
	return setCached(recordsCache, cacheKey, result, RECORDS_CACHE_TTL)
}

export async function getSmartPracticeQuestions(options) {
	const input = options || {}
	if (!practiceCloudSyncEnabled()) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_LOCAL_SMART_REQUIRED',
			'非会员智能练习应使用本地状态与题库服务生成'
		)
	}
	const subjectId = input.subjectId
	const pageSize = Number(input.pageSize) || 20
	const seed = input.seed || ''
	const cacheKey = `${subjectId}|${pageSize}|${seed}`
	if (!input.forceRefresh && pendingPracticeEventCount() === 0) {
		const cached = getCached(smartCache, cacheKey)
		if (cached) return cached
	}
	await flushPracticeEvents({ includeProgress: false })
	const result = await executeCloudCall('getSmartPractice', {
		subjectId,
		pageSize,
		seed
	})
	return setCached(smartCache, cacheKey, result, SMART_CACHE_TTL)
}

export async function getPracticeProgress(options) {
	const input = options || {}
	if (!practiceCloudSyncEnabled()) {
		const position = input.mode === 'knowledge'
			? getKnowledgePracticePosition(input.subjectId, input.chapterId, input.knowledge)
			: getChapterPracticePosition(input.subjectId, input.chapterId)
		if (!position) return null
		return {
			subjectId: input.subjectId,
			mode: input.mode === 'knowledge' ? 'knowledge' : 'chapter',
			chapterId: String(input.chapterId || position.chapterId || ''),
			knowledge: input.mode === 'knowledge' ? input.knowledge || position.knowledge || '' : '',
			questionId: position.questionId,
			progressAt: Number(position.updatedAt) || 0,
			_localOnly: true
		}
	}
	await flushPracticeEvents()
	return executeCloudCall('getProgress', {
		subjectId: input.subjectId,
		mode: input.mode,
		chapterId: input.chapterId,
		knowledge: input.knowledge
	})
}

export async function getPracticeUserProfile(options) {
	const config = options || {}
	const user = await ensurePracticeUser()
	if (!config.forceRefresh) {
		const cached = getCached(userProfileCache, user.uid)
		if (cached) return cached
	}
	const profile = await executeCloudCall('getUserProfile')
	return setCached(userProfileCache, user.uid, profile, PROFILE_CACHE_TTL)
}

function removeSubjectPracticePositions(storageKey, subjectId) {
	const positions = readPracticePositions(storageKey)
	Object.keys(positions).forEach(key => {
		const position = positions[key]
		if (position && position.subjectId === subjectId) delete positions[key]
	})
	if (Object.keys(positions).length) {
		setStorage(userScopedStorageKey(storageKey), { version: 1, positions })
	} else {
		removeStorage(userScopedStorageKey(storageKey))
	}
}

function clearSubjectLocalSyncData(subjectId) {
	const remainingEvents = readOutbox().filter(item => item.subjectId !== subjectId)
	if (remainingEvents.length) saveOutbox(remainingEvents)
	else removeStorage(userScopedStorageKey(OUTBOX_STORAGE_KEY))
	writePendingProgresses(
		readPendingProgresses().filter(item => item.subjectId !== subjectId)
	)
	removeSubjectPracticePositions(CHAPTER_POSITION_STORAGE_KEY, subjectId)
	removeSubjectPracticePositions(KNOWLEDGE_POSITION_STORAGE_KEY, subjectId)
	removePersistedSummary(subjectId)
	summaryRefreshRequiredKeys.delete(summaryCacheKey(subjectId))
	invalidateUserPracticeCache(subjectId)
	return {
		remainingEvents: remainingEvents.length,
		remainingProgress: readPendingProgresses().length
	}
}

export async function clearCurrentSubjectPracticeData(subjectId) {
	if (typeof subjectId !== 'string' || !subjectId.trim()) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_USER_CLIENT_ERROR',
			'当前科目信息无效'
		)
	}
	const normalizedSubjectId = subjectId.trim()
	if (scheduledFlush) clearTimeout(scheduledFlush)
	scheduledFlush = null
	scheduledSyncOptions = null
	if (flushRequest) await flushRequest
	if (!practiceCloudSyncEnabled()) {
		clearSubjectLocalSyncData(normalizedSubjectId)
		return {
			cleared: true,
			subjectId: normalizedSubjectId,
			deletedRecords: 0,
			localOnly: true
		}
	}
	const result = await executeCloudCall('clearCurrentSubjectData', {
		subjectId: normalizedSubjectId,
		confirmation: 'CLEAR_CURRENT_SUBJECT'
	}, { retry: false })
	const pending = clearSubjectLocalSyncData(normalizedSubjectId)
	if (pending.remainingEvents || pending.remainingProgress) {
		schedulePracticeSync({
			includeProgress: pending.remainingProgress > 0,
			immediate: pending.remainingEvents >= SYNC_BATCH_TRIGGER
		})
	}
	return result
}

export function getLocalPracticePreferences() {
	observePracticePreferencesUser()
	const entry = readPreferencesEntry()
	return Object.assign({}, entry.preferences, {
		_syncPending: entry.dirty
	})
}

export async function getPracticePreferences(options) {
	const config = options || {}
	const userId = observePracticePreferencesUser()
	const forceRefresh = Boolean(config.forceRefresh || preferencesRefreshRequired)
	const localEntry = readPreferencesEntry()
	if (!practiceCloudSyncEnabled()) {
		return Object.assign({}, localEntry.preferences, {
			_syncPending: false,
			_localOnly: true
		})
	}
	if (!localEntry.dirty
		&& !forceRefresh
		&& localEntry.syncedAt + PREFERENCES_CACHE_TTL > Date.now()) {
		return Object.assign({}, localEntry.preferences, { _syncPending: false })
	}
	if (preferencesRequest) return preferencesRequest
	preferencesRequest = (async () => {
		try {
			const result = localEntry.dirty
				? await executeCloudCall('updatePreferences', localEntry.preferences)
				: await executeCloudCall('getPreferences')
			const saved = savePreferencesEntry(result, false, Date.now())
			if (userId && getCurrentPracticeUser().uid === userId) {
				preferencesRefreshRequired = false
			}
			return Object.assign({}, saved, { _syncPending: false })
		} catch (error) {
			if (error && error.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED') {
				deactivateCachedMembership()
				return Object.assign({}, localEntry.preferences, {
					_syncPending: false,
					_localOnly: true
				})
			}
			if (config.localFallback === false) throw error
			return Object.assign({}, localEntry.preferences, {
				_syncPending: localEntry.dirty,
				_syncError: error && (error.errMsg || error.message) || '答题设置同步失败'
			})
		}
	})().then(result => {
		preferencesRequest = null
		return result
	}, error => {
		preferencesRequest = null
		throw error
	})
	return preferencesRequest
}

export async function updatePracticePreferences(preferences) {
	const next = normalizePracticePreferences(Object.assign(
		{},
		readPreferencesEntry().preferences,
		preferences,
		{ updatedAt: Date.now() }
	))
	const previous = readPreferencesEntry()
	savePreferencesEntry(next, true, previous.syncedAt)
	if (!practiceCloudSyncEnabled()) {
		return Object.assign({}, next, {
			_syncPending: false,
			_localOnly: true
		})
	}
	let result
	try {
		result = await executeCloudCall('updatePreferences', next)
	} catch (error) {
		if (error && error.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED') {
			deactivateCachedMembership()
			return Object.assign({}, next, {
				_syncPending: false,
				_localOnly: true
			})
		}
		throw error
	}
	const saved = savePreferencesEntry(result, false, Date.now())
	if (getCurrentPracticeUser().uid === observedPreferencesUserId) {
		preferencesRefreshRequired = false
	}
	return Object.assign({}, saved, { _syncPending: false })
}

export function pendingPracticeEventCount() {
	if (!practiceCloudSyncEnabled()) return 0
	return readOutbox().length + readPendingProgresses().length
}

export default {
	clearCurrentSubjectPracticeData,
	ensurePracticeUser,
	flushPracticeEvents,
	getChapterPracticePosition,
	getKnowledgeScopeKey,
	getKnowledgePracticePosition,
	getCurrentPracticeUser,
	getCachedPracticeSummary,
	getPracticeProgress,
	getPracticePreferences,
	getPracticeRecords,
	getSmartPracticeQuestions,
	getPracticeStateSnapshot,
	getPracticeSummary,
	getPracticeUserProfile,
	getLocalPracticePreferences,
	markPracticePreferencesRefreshRequired,
	markPracticeRecordsRefreshRequired,
	markPracticeSummaryRefreshRequired,
	pendingPracticeEventCount,
	practiceCloudSyncEnabled,
	practiceUserLoggedIn,
	queuePracticeAnswer,
	queuePracticeFavorite,
	savePracticeProgress,
	updatePracticePreferences
}
