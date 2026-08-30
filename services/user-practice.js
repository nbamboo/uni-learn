const CLOUD_FUNCTION_NAME = 'questionBankUser'
const OUTBOX_STORAGE_KEY = 'uni-learn-practice-cloud-outbox-v1'
const PROGRESS_STORAGE_KEY = 'uni-learn-practice-cloud-progress-v1'
const CHAPTER_POSITION_STORAGE_KEY = 'uni-learn-practice-chapter-position-v1'
const KNOWLEDGE_POSITION_STORAGE_KEY = 'uni-learn-practice-knowledge-position-v1'
const PREFERENCES_STORAGE_KEY = 'uni-learn-practice-preferences-v1'
const MIGRATION_KEY_PREFIX = 'uni-learn-practice-cloud-migration-v1:'
const UNI_ID_STORAGE_KEYS = ['uni_id_token', 'uni_id_token_expired', 'uniIdToken', 'uniIdTokenExpired']
const MAX_OUTBOX_EVENTS = 2000
const SYNC_BATCH_SIZE = 50
const SNAPSHOT_CACHE_TTL = 2 * 60 * 1000
const SUMMARY_CACHE_TTL = 30 * 1000
const PROFILE_CACHE_TTL = 5 * 60 * 1000
const RETRY_DELAY = 180
const MAX_PRACTICE_POSITIONS = 200
const MAX_PENDING_PROGRESS = 500
const ANSWER_MODES = ['exam', 'practice', 'review']

const snapshotCache = new Map()
const summaryCache = new Map()
const userProfileCache = new Map()
let loginRequest = null
let flushRequest = null
let scheduledFlush = null
let progressFlushRequested = false
let eventSequence = 0

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

function clearPracticeLogin() {
	UNI_ID_STORAGE_KEYS.forEach(removeStorage)
	loginRequest = null
	userProfileCache.clear()
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
			dirty: false
		}
	}
	return {
		preferences: normalizePracticePreferences(saved.preferences),
		dirty: Boolean(saved.dirty)
	}
}

function savePreferencesEntry(preferences, dirty) {
	const normalized = normalizePracticePreferences(preferences)
	const storageKey = preferencesStorageKey()
	setStorage(storageKey, {
		version: 1,
		preferences: normalized,
		dirty: Boolean(dirty)
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
	const saved = getStorage(OUTBOX_STORAGE_KEY)
	if (!saved || saved.version !== 1 || !Array.isArray(saved.events)) return []
	return saved.events.filter(isObject)
}

function saveOutbox(events) {
	return setStorage(OUTBOX_STORAGE_KEY, {
		version: 1,
		events: events.slice(-MAX_OUTBOX_EVENTS)
	})
}

function progressScopeKey(progress) {
	if (!progress || !progress.subjectId) return ''
	const mode = progress.mode === 'knowledge' ? 'knowledge' : 'chapter'
	const scope = mode === 'knowledge' ? progress.knowledge : progress.chapterId
	return scope === undefined || scope === null || scope === ''
		? ''
		: `${progress.subjectId}|${mode}|${scope}`
}

function readPendingProgresses() {
	const saved = getStorage(PROGRESS_STORAGE_KEY)
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
		.slice(0, MAX_PENDING_PROGRESS)
	if (!limited.length) {
		if (removeStorage(PROGRESS_STORAGE_KEY)) return true
		return setStorage(PROGRESS_STORAGE_KEY, null)
	}
	const progressMap = {}
	limited.forEach(progress => {
		const key = progressScopeKey(progress)
		if (key) progressMap[key] = cloneValue(progress)
	})
	return setStorage(PROGRESS_STORAGE_KEY, {
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
	const saved = getStorage(storageKey)
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
	const positionKeys = Object.keys(positions).sort((left, right) => {
		return Number(positions[right].updatedAt) - Number(positions[left].updatedAt)
	})
	positionKeys.slice(MAX_PRACTICE_POSITIONS).forEach(key => delete positions[key])
	setStorage(storageKey, { version: 1, positions })
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
	schedulePracticeSync({ includeProgress: false })
	return event.eventId
}

export function queuePracticeAnswer(question, selected, options) {
	const config = options || {}
	const event = {
		type: 'answer',
		eventId: config.eventId || createPracticeEventId('answer'),
		subjectId: question.subjectId,
		questionId: question.questionId || question.id,
		selected: (selected || []).slice(),
		occurredAt: Number(config.occurredAt) || Date.now()
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
			`${progress.subjectId}|${progress.knowledge}`,
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

export function getKnowledgePracticePosition(subjectId, knowledge) {
	if (!subjectId || !knowledge) return null
	const positions = readPracticePositions(KNOWLEDGE_POSITION_STORAGE_KEY)
	const position = positions[`${subjectId}|${knowledge}`]
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
	if (config.includeProgress !== false) progressFlushRequested = true
	if (flushRequest) return flushRequest
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
				result && result.duplicateEventIds || []
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
		}
		markMigrationComplete(user.uid, events)
		return { synced: true, pending: 0 }
	})().then(result => {
		progressFlushRequested = false
		flushRequest = null
		return result
	}, error => {
		flushRequest = null
		throw error
	})
	return flushRequest
}

export function schedulePracticeSync(options) {
	if (scheduledFlush) return
	scheduledFlush = setTimeout(() => {
		scheduledFlush = null
		flushPracticeEvents(options).catch(() => {
			// The persistent outbox will retry on the next foreground/page request.
		})
	}, 300)
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

export function invalidateUserPracticeCache(subjectId) {
	if (subjectId) {
		snapshotCache.delete(subjectId)
		summaryCache.delete(subjectId)
		return
	}
	snapshotCache.clear()
	summaryCache.clear()
}

export async function getPracticeSummary(subjectId, options) {
	const config = options || {}
	if (config.localState) await flushPracticeEvents({ localState: config.localState })
	else await ensurePracticeUser()
	if (!config.forceRefresh) {
		const cached = getCached(summaryCache, subjectId)
		if (cached) return cached
	}
	const result = await executeCloudCall('getSummary', { subjectId })
	return setCached(summaryCache, subjectId, result, SUMMARY_CACHE_TTL)
}

export async function getPracticeStateSnapshot(subjectId, options) {
	const config = options || {}
	if (config.localState) await flushPracticeEvents({ localState: config.localState })
	else await ensurePracticeUser()
	if (!config.forceRefresh) {
		const cached = getCached(snapshotCache, subjectId)
		if (cached) return cached
	}
	const result = await executeCloudCall('getStateSnapshot', { subjectId })
	return setCached(snapshotCache, subjectId, result, SNAPSHOT_CACHE_TTL)
}

export async function getPracticeRecords(params) {
	const input = params || {}
	await flushPracticeEvents()
	return executeCloudCall('getRecords', {
		subjectId: input.subjectId,
		type: input.type || 'wrong',
		page: input.page || 1,
		pageSize: input.pageSize || 20
	})
}

export async function getPracticeProgress(options) {
	const input = options || {}
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

export function getLocalPracticePreferences() {
	const entry = readPreferencesEntry()
	return Object.assign({}, entry.preferences, {
		_syncPending: entry.dirty
	})
}

export async function getPracticePreferences(options) {
	const config = options || {}
	const localEntry = readPreferencesEntry()
	try {
		const result = localEntry.dirty
			? await executeCloudCall('updatePreferences', localEntry.preferences)
			: await executeCloudCall('getPreferences')
		const saved = savePreferencesEntry(result, false)
		return Object.assign({}, saved, { _syncPending: false })
	} catch (error) {
		if (config.localFallback === false) throw error
		return Object.assign({}, localEntry.preferences, {
			_syncPending: localEntry.dirty,
			_syncError: error && (error.errMsg || error.message) || '答题设置同步失败'
		})
	}
}

export async function updatePracticePreferences(preferences) {
	const next = normalizePracticePreferences(Object.assign(
		{},
		readPreferencesEntry().preferences,
		preferences,
		{ updatedAt: Date.now() }
	))
	savePreferencesEntry(next, true)
	const result = await executeCloudCall('updatePreferences', next)
	const saved = savePreferencesEntry(result, false)
	return Object.assign({}, saved, { _syncPending: false })
}

export function pendingPracticeEventCount() {
	return readOutbox().length + readPendingProgresses().length
}

export default {
	ensurePracticeUser,
	flushPracticeEvents,
	getChapterPracticePosition,
	getKnowledgePracticePosition,
	getCurrentPracticeUser,
	getPracticeProgress,
	getPracticePreferences,
	getPracticeRecords,
	getPracticeStateSnapshot,
	getPracticeSummary,
	getPracticeUserProfile,
	getLocalPracticePreferences,
	pendingPracticeEventCount,
	practiceUserLoggedIn,
	queuePracticeAnswer,
	queuePracticeFavorite,
	savePracticeProgress,
	updatePracticePreferences
}
