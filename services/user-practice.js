const { normalizeSmartPractice, validateSmartPractice } = require('./smart-practice.js')
const CLOUD_FUNCTION_NAME = 'questionBankUser'
const OUTBOX_STORAGE_KEY = 'uni-learn-practice-cloud-outbox-v1'
const PROGRESS_STORAGE_KEY = 'uni-learn-practice-cloud-progress-v1'
const CHAPTER_POSITION_STORAGE_KEY = 'uni-learn-practice-chapter-position-v1'
const SECTION_POSITION_STORAGE_KEY = 'uni-learn-practice-section-position-v1'
const KNOWLEDGE_POSITION_STORAGE_KEY = 'uni-learn-practice-knowledge-position-v1'
const PRACTICE_ROUNDS_STORAGE_KEY = 'uni-learn-practice-rounds-v1'
const EXAM_DRAFTS_STORAGE_KEY = 'uni-learn-exam-drafts-v1'
const PREFERENCES_STORAGE_KEY = 'uni-learn-practice-preferences-v1'
const PRACTICE_STATE_STORAGE_KEY = 'uni-learn-practice-state-v1'
const SUMMARY_STORAGE_KEY = 'uni-learn-practice-summary-v1'
const MEMBERSHIP_STORAGE_KEY = 'uni-learn-membership-v1'
const MEMBERSHIP_LAST_USER_ID_KEY = 'uni-learn-membership-last-user-id-v1'
const MIGRATION_KEY_PREFIX = 'uni-learn-practice-cloud-migration-v1:'
const UNI_ID_STORAGE_KEYS = ['uni_id_token', 'uni_id_token_expired', 'uniIdToken', 'uniIdTokenExpired']
const SYNC_BATCH_SIZE = 20
const SNAPSHOT_CACHE_TTL = 2 * 60 * 1000
const SUMMARY_CACHE_TTL = 10 * 60 * 1000
const PROFILE_CACHE_TTL = 5 * 60 * 1000
const RECORDS_CACHE_TTL = 10 * 60 * 1000
const PREFERENCES_CACHE_TTL = 6 * 60 * 60 * 1000
const MEMBER_EXPIRY_GRACE_MS = 6 * 60 * 60 * 1000
const MAX_SNAPSHOT_QUESTION_IDS = 100
const SYNC_BATCH_TRIGGER = 50
const SYNC_DELAY = 120 * 1000
const RETRY_DELAY = 180
const ANSWER_MODES = ['exam', 'practice', 'review']
const PRACTICE_ENTRY_MODES = ['smart', 'chapter', 'section', 'knowledge', 'wrong', 'favorite', 'search', 'sequence']
const EXAM_DRAFT_MODES = ['chapter', 'section', 'knowledge', 'wrong', 'favorite', 'search', 'sequence']
const FEEDBACK_ISSUE_TYPES = ['answer_error', 'explanation_error', 'text_error', 'other']
const MAX_EXAM_DRAFT_QUESTIONS = 5000
const MAX_PERSISTED_SUMMARIES = 20
export const FREE_SMART_QUESTION_COUNT_MAX = 30
const QUESTION_SELECTION_MODES = Object.freeze({
	single: 'single',
	judgment: 'single',
	multiple: 'multiple',
	material: 'multiple'
})

const snapshotCache = new Map()
const summaryCache = new Map()
const summaryRefreshRequiredKeys = new Set()
const userProfileCache = new Map()
const recordsCache = new Map()
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

function requireQuestionSchema(question, requireSelectionMode) {
	const expectedSelectionMode = question && QUESTION_SELECTION_MODES[question.type]
	const materialFields = [
		'materialGroupId', 'materialText', 'materialQuestionIndex', 'materialQuestionCount'
	]
	const hasMaterialField = Boolean(question)
		&& materialFields.some(field => Object.prototype.hasOwnProperty.call(question, field))
	const validMaterial = question && question.type === 'material'
		&& typeof question.materialGroupId === 'string' && Boolean(question.materialGroupId.trim())
		&& question.materialGroupId.length <= 64
		&& /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(question.materialGroupId)
		&& typeof question.materialText === 'string' && Boolean(question.materialText.trim())
		&& question.materialText.length <= 10000
		&& Number.isInteger(question.materialQuestionIndex)
		&& Number.isInteger(question.materialQuestionCount)
		&& question.materialQuestionIndex >= 1
		&& question.materialQuestionCount >= question.materialQuestionIndex
		&& typeof question.title === 'string' && Boolean(question.title.trim())
		&& question.title.indexOf('[材料]') === -1
	if (!expectedSelectionMode
		|| (requireSelectionMode && question.selectionMode !== expectedSelectionMode)
		|| (question && question.type === 'material'
			&& (requireSelectionMode || hasMaterialField) && !validMaterial)
		|| (question && question.type !== 'material' && hasMaterialField)) {
		const questionId = question && (question.questionId || question.id) || 'unknown'
		throw new UserPracticeServiceError(
			'QUESTION_BANK_INVALID_QUESTION_SCHEMA',
			`题目${questionId}不符合题型 schema v3 结构`
		)
	}
	return question
}

function requireSmartQuestionResult(result) {
	if (!result || !Array.isArray(result.items)) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_INVALID_RESPONSE',
			'智能练习题目列表格式不正确'
		)
	}
	result.items.forEach(question => requireQuestionSchema(question, true))
	if (!Number.isInteger(result.requestedQuestionCount)
		|| result.requestedQuestionCount < 0
		|| result.actualQuestionCount !== result.items.length
		|| result.overflowQuestionCount !== Math.max(
			0,
			result.actualQuestionCount - result.requestedQuestionCount
		)) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_INVALID_RESPONSE',
			'智能练习实际题量信息不正确'
		)
	}
	return result
}

function requireRecordQuestionTypes(result) {
	if (!result || !Array.isArray(result.items)) return result
	result.items.forEach(item => requireQuestionSchema(item && item.question, false))
	return result
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

export function getSectionScopeKey(chapterId, section) {
	if (chapterId === undefined || chapterId === null || !String(chapterId) || !section) return ''
	return `${String(chapterId)}|${String(section)}`
}

function normalizeExamKeyword(keyword) {
	return typeof keyword === 'string'
		? keyword.trim().toLowerCase().replace(/\s+/g, ' ')
		: ''
}

export function getExamDraftScope(options) {
	const input = options || {}
	const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : ''
	const mode = EXAM_DRAFT_MODES.indexOf(input.mode) > -1 ? input.mode : ''
	const chapterId = input.chapterId === undefined || input.chapterId === null
		? ''
		: String(input.chapterId).trim()
	const section = typeof input.section === 'string' ? input.section.trim() : ''
	const knowledge = typeof input.knowledge === 'string' ? input.knowledge.trim() : ''
	const keyword = normalizeExamKeyword(input.keyword)
	if (!subjectId || !mode) return null
	if (['chapter', 'section', 'knowledge'].indexOf(mode) > -1 && !chapterId) return null
	if (mode === 'section' && !section) return null
	if (mode === 'knowledge' && !knowledge) return null
	if (mode === 'search' && !keyword) return null
	let scopeKey = mode
	if (mode === 'chapter') scopeKey += `|${chapterId}`
	if (mode === 'section') scopeKey += `|${chapterId}|${section}`
	if (mode === 'knowledge') scopeKey += `|${chapterId}|${knowledge}`
	if (mode === 'search') scopeKey += `|${keyword}`
	return { subjectId, mode, scopeKey, chapterId, section, knowledge, keyword }
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
			practiceRecords: false,
			advancedAnswerModes: false,
			reviewMode: false,
			smartPracticeOver30: false
		},
		cachedAt: Date.now()
	}))
}

function cacheValidatedMembership(value) {
	const expiresAt = Number(value && value.expiresAt) || 0
	setStorage(userScopedStorageKey(MEMBERSHIP_STORAGE_KEY), {
		isMember: true,
		status: 'active',
		expiresAt,
		entitlements: Object.assign({
			adFree: true,
			practiceRecords: true,
			advancedAnswerModes: true,
			reviewMode: true,
			smartPracticeOver30: true
		}, value && value.entitlements || {}),
		cachedAt: Date.now()
	})
	const user = getCurrentPracticeUser()
	if (user.uid) setStorage(MEMBERSHIP_LAST_USER_ID_KEY, user.uid)
}

function normalizePracticePreferences(value) {
	const source = isObject(value) ? value : {}
	return {
		answerMode: ANSWER_MODES.indexOf(source.answerMode) > -1
			? source.answerMode
			: 'practice',
		nightMode: Boolean(source.nightMode),
		smartPractice: normalizeSmartPractice(source.smartPractice),
		updatedAt: Number(source.updatedAt) || 0
	}
}

function resolveMembershipFlag(isMember) {
	return typeof isMember === 'boolean' ? isMember : practiceCloudSyncEnabled()
}

export function getEffectiveAnswerMode(answerMode, isMember) {
	const normalized = ANSWER_MODES.indexOf(answerMode) > -1 ? answerMode : 'practice'
	return !resolveMembershipFlag(isMember) && normalized === 'review'
		? 'practice'
		: normalized
}

export function getEffectiveSmartPractice(value, isMember) {
	const normalized = normalizeSmartPractice(value)
	if (resolveMembershipFlag(isMember)
		|| normalized.questionCount <= FREE_SMART_QUESTION_COUNT_MAX) return normalized
	return Object.assign({}, normalized, {
		questionCount: FREE_SMART_QUESTION_COUNT_MAX,
		custom: Object.assign({}, normalized.custom)
	})
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
	const mode = ['chapter', 'section', 'knowledge'].indexOf(progress.mode) > -1
		? progress.mode
		: 'chapter'
	const scope = mode === 'knowledge'
		? getKnowledgeScopeKey(progress.chapterId, progress.knowledge)
		: (mode === 'section'
			? getSectionScopeKey(progress.chapterId, progress.section)
			: progress.chapterId)
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

function normalizePracticeRound(round, subjectId, chapterId) {
	const source = isObject(round) ? round : {}
	const answers = {}
	const sourceAnswers = isObject(source.answers) ? source.answers : {}
	Object.keys(sourceAnswers).forEach(questionId => {
		const answer = sourceAnswers[questionId]
		if (!isObject(answer) || !Array.isArray(answer.selected) || !answer.selected.length) return
		answers[questionId] = {
			questionId,
			section: typeof answer.section === 'string' ? answer.section : '',
			selected: answer.selected.slice(),
			correct: Boolean(answer.correct),
			answeredAt: Number(answer.answeredAt) || 0
		}
	})
	const sectionPositions = {}
	const sourcePositions = isObject(source.sectionPositions) ? source.sectionPositions : {}
	Object.keys(sourcePositions).forEach(section => {
		const position = sourcePositions[section]
		if (!isObject(position) || !position.questionId) return
		sectionPositions[section] = {
			questionId: position.questionId,
			section,
			updatedAt: Number(position.updatedAt) || 0
		}
	})
	const sectionResetAt = {}
	const sourceResets = isObject(source.sectionResetAt) ? source.sectionResetAt : {}
	Object.keys(sourceResets).forEach(section => {
		const timestamp = Number(sourceResets[section]) || 0
		if (timestamp > 0) sectionResetAt[section] = timestamp
	})
	const chapterPosition = isObject(source.chapterPosition) && source.chapterPosition.questionId
		? {
			questionId: source.chapterPosition.questionId,
			section: source.chapterPosition.section || '',
			updatedAt: Number(source.chapterPosition.updatedAt) || 0
		}
		: null
	return {
		subjectId: subjectId || source.subjectId || '',
		chapterId: String(chapterId === undefined ? source.chapterId || '' : chapterId),
		answers,
		chapterPosition,
		sectionPositions,
		chapterResetAt: Number(source.chapterResetAt) || 0,
		sectionResetAt,
		updatedAt: Number(source.updatedAt) || 0
	}
}

function readPracticeRounds() {
	const saved = getStorage(userScopedStorageKey(PRACTICE_ROUNDS_STORAGE_KEY))
	if (!saved || saved.version !== 1 || !isObject(saved.rounds)) return {}
	const result = {}
	Object.keys(saved.rounds).forEach(key => {
		const source = saved.rounds[key]
		if (!isObject(source) || !source.subjectId || source.chapterId === undefined) return
		result[key] = normalizePracticeRound(source, source.subjectId, source.chapterId)
	})
	return result
}

function writePracticeRounds(rounds) {
	const storageKey = userScopedStorageKey(PRACTICE_ROUNDS_STORAGE_KEY)
	if (!Object.keys(rounds).length) {
		if (removeStorage(storageKey)) return true
		return setStorage(storageKey, null)
	}
	return setStorage(storageKey, { version: 1, rounds })
}

function practiceRoundKey(subjectId, chapterId) {
	return `${subjectId}|${String(chapterId)}`
}

function getStoredPracticeRound(subjectId, chapterId, create) {
	const rounds = readPracticeRounds()
	const key = practiceRoundKey(subjectId, chapterId)
	const saved = rounds[key]
	return {
		rounds,
		key,
		round: saved || (create ? normalizePracticeRound(null, subjectId, chapterId) : null)
	}
}

function effectiveRoundResetAt(round, section) {
	return Math.max(
		Number(round && round.chapterResetAt) || 0,
		section ? (Number(round && round.sectionResetAt && round.sectionResetAt[section]) || 0) : 0
	)
}

function saveStoredPracticeRound(container) {
	container.rounds[container.key] = container.round
	container.round.updatedAt = Date.now()
	writePracticeRounds(container.rounds)
	return container.round
}

function updateLocalPracticeRoundAnswer(event) {
	if (!event
		|| event.type !== 'answer'
		|| ['chapter', 'section'].indexOf(event.practiceMode) === -1
		|| !event.chapterId) return
	const container = getStoredPracticeRound(event.subjectId, event.chapterId, true)
	const round = container.round
	const eventTime = Number(event.occurredAt) || 0
	if (eventTime <= effectiveRoundResetAt(round, event.section)) return
	const saved = round.answers[event.questionId]
	if (saved && Number(saved.answeredAt) > eventTime) return
	round.answers[event.questionId] = {
		questionId: event.questionId,
		section: event.section || '',
		selected: event.selected.slice(),
		correct: Boolean(event.correct),
		answeredAt: eventTime
	}
	saveStoredPracticeRound(container)
}

function updateLocalPracticeRoundPosition(progress, questionSection) {
	if (!progress || ['chapter', 'section'].indexOf(progress.mode) === -1) return
	const section = questionSection || progress.section || ''
	const container = getStoredPracticeRound(progress.subjectId, progress.chapterId, true)
	const round = container.round
	const progressTime = Number(progress.occurredAt) || 0
	if (progressTime <= effectiveRoundResetAt(round, section)) return
	if (!round.chapterPosition || Number(round.chapterPosition.updatedAt) <= progressTime) {
		round.chapterPosition = {
			questionId: progress.questionId,
			section,
			updatedAt: progressTime
		}
	}
	if (section) {
		const saved = round.sectionPositions[section]
		if (!saved || Number(saved.updatedAt) <= progressTime) {
			round.sectionPositions[section] = {
				questionId: progress.questionId,
				section,
				updatedAt: progressTime
			}
		}
	}
	saveStoredPracticeRound(container)
}

function resetLocalPracticeRound(subjectId, chapterId, section, resetAt) {
	const container = getStoredPracticeRound(subjectId, chapterId, true)
	const round = container.round
	const timestamp = Number(resetAt) || Date.now()
	if (!section) {
		round.answers = {}
		round.chapterPosition = null
		round.sectionPositions = {}
		round.chapterResetAt = Math.max(round.chapterResetAt, timestamp)
	} else {
		Object.keys(round.answers).forEach(questionId => {
			if (round.answers[questionId].section === section) delete round.answers[questionId]
		})
		delete round.sectionPositions[section]
		if (round.chapterPosition && round.chapterPosition.section === section) {
			round.chapterPosition = null
		}
		round.sectionResetAt[section] = Math.max(
			Number(round.sectionResetAt[section]) || 0,
			timestamp
		)
	}
	saveStoredPracticeRound(container)
	return round
}

function toPracticeRoundResult(round, section) {
	const source = round || normalizePracticeRound(null, '', '')
	const answers = Object.keys(source.answers)
		.map(questionId => source.answers[questionId])
		.filter(answer => !section || answer.section === section)
		.sort((left, right) => Number(left.answeredAt) - Number(right.answeredAt))
		.map(cloneValue)
	const position = section
		? source.sectionPositions[section] || null
		: source.chapterPosition
	return {
		subjectId: source.subjectId,
		chapterId: source.chapterId,
		section: section || '',
		answers,
		answeredQuestionIds: answers.map(answer => answer.questionId),
		positionQuestionId: position && position.questionId || '',
		positionSection: position && position.section || '',
		positionAt: position && Number(position.updatedAt) || 0,
		chapterResetAt: Number(source.chapterResetAt) || 0,
		sectionResetAt: section ? (Number(source.sectionResetAt[section]) || 0) : 0
	}
}

export function getLocalPracticeRound(subjectId, chapterId, section) {
	if (!subjectId || chapterId === undefined || chapterId === null) {
		return toPracticeRoundResult(null, section)
	}
	const container = getStoredPracticeRound(subjectId, chapterId, false)
	return toPracticeRoundResult(
		container.round || normalizePracticeRound(null, subjectId, chapterId),
		section || ''
	)
}

function cacheCloudPracticeRound(result, requestedSection) {
	if (!isObject(result) || !result.subjectId || result.chapterId === undefined) return result
	const section = requestedSection || ''
	const container = getStoredPracticeRound(result.subjectId, result.chapterId, true)
	const round = container.round
	const hasChapterAnswers = Array.isArray(result.chapterAnswers)
	const answers = hasChapterAnswers
		? result.chapterAnswers
		: (Array.isArray(result.answers) ? result.answers : [])
	if (section && !hasChapterAnswers) {
		Object.keys(round.answers).forEach(questionId => {
			if (round.answers[questionId].section === section) delete round.answers[questionId]
		})
	} else {
		round.answers = {}
	}
	answers.forEach(answer => {
		if (!isObject(answer) || !answer.questionId || !Array.isArray(answer.selected)) return
		round.answers[answer.questionId] = {
			questionId: answer.questionId,
			section: answer.section || '',
			selected: answer.selected.slice(),
			correct: Boolean(answer.correct),
			answeredAt: Number(answer.answeredAt) || 0
		}
	})
	const position = result.positionQuestionId ? {
		questionId: result.positionQuestionId,
		section: section || result.positionSection || '',
		updatedAt: Number(result.positionAt) || 0
	} : null
	if (section) {
		if (position) round.sectionPositions[section] = position
		else delete round.sectionPositions[section]
		round.sectionResetAt[section] = Number(result.sectionResetAt) || 0
		if (hasChapterAnswers) {
			round.chapterPosition = result.chapterPositionQuestionId ? {
				questionId: result.chapterPositionQuestionId,
				section: result.chapterPositionSection || '',
				updatedAt: Number(result.chapterPositionAt) || 0
			} : null
			round.chapterResetAt = Number(result.chapterResetAt) || 0
		}
	} else {
		round.chapterPosition = position
		round.chapterResetAt = Number(result.chapterResetAt) || 0
	}
	saveStoredPracticeRound(container)
	return result
}

export function getLocalPracticeRoundSnapshot(subjectId) {
	const chapterIds = []
	const updatedAtByChapter = {}
	const chapterAttempts = {}
	const sectionAttempts = {}
	const progressPositions = { chapter: {}, section: {} }
	const rounds = readPracticeRounds()
	Object.keys(rounds).forEach(key => {
		const round = rounds[key]
		if (!round || round.subjectId !== subjectId) return
		const chapterId = String(round.chapterId)
		chapterIds.push(chapterId)
		updatedAtByChapter[chapterId] = Number(round.updatedAt) || 0
		const answers = Object.keys(round.answers).map(questionId => round.answers[questionId])
		chapterAttempts[chapterId] = answers.length
		answers.forEach(answer => {
			if (!answer.section) return
			const scopeKey = getSectionScopeKey(chapterId, answer.section)
			sectionAttempts[scopeKey] = (sectionAttempts[scopeKey] || 0) + 1
		})
		if (round.chapterPosition && round.chapterPosition.questionId) {
			progressPositions.chapter[chapterId] = round.chapterPosition.questionId
		}
		Object.keys(round.sectionPositions).forEach(section => {
			const position = round.sectionPositions[section]
			const scopeKey = getSectionScopeKey(chapterId, section)
			if (scopeKey && position.questionId) progressPositions.section[scopeKey] = position.questionId
		})
	})
	return {
		subjectId,
		chapterIds,
		updatedAtByChapter,
		chapterAttempts,
		sectionAttempts,
		progressPositions,
		_localOnly: true
	}
}

function examDraftStorageKey(scope) {
	return scope ? `${scope.subjectId}|${scope.scopeKey}` : ''
}

function normalizeExamDraft(value, fallbackScope) {
	const source = isObject(value) ? value : {}
	const scope = getExamDraftScope(Object.assign({}, fallbackScope || {}, source))
	if (!scope) return null
	const seen = new Set()
	const questionIds = (Array.isArray(source.questionIds) ? source.questionIds : [])
		.filter(questionId => {
			if (typeof questionId !== 'string' || !questionId || seen.has(questionId)) return false
			seen.add(questionId)
			return true
		})
		.slice(0, MAX_EXAM_DRAFT_QUESTIONS)
	const availableIds = new Set(questionIds)
	const answers = {}
	const sourceAnswers = Array.isArray(source.answers)
		? source.answers.reduce((result, answer) => {
			if (isObject(answer) && answer.questionId) result[answer.questionId] = answer
			return result
		}, {})
		: (isObject(source.answers) ? source.answers : {})
	Object.keys(sourceAnswers).forEach(questionId => {
		const answer = sourceAnswers[questionId]
		if (!availableIds.has(questionId) || !isObject(answer) || !Array.isArray(answer.selected)) return
		const selected = Array.from(new Set(answer.selected.filter(Boolean)))
		if (!selected.length) return
		answers[questionId] = {
			questionId,
			selected,
			updatedAt: Number(answer.updatedAt || answer.answeredAt) || 0
		}
	})
	const initialQuestionId = availableIds.has(source.initialQuestionId)
		? source.initialQuestionId
		: (questionIds[0] || '')
	const firstUnansweredQuestionId = questionIds.find(questionId => !answers[questionId]) || initialQuestionId
	const positionQuestionId = availableIds.has(source.positionQuestionId)
		? source.positionQuestionId
		: firstUnansweredQuestionId
	return Object.assign({}, scope, {
		roundId: typeof source.roundId === 'string' ? source.roundId : '',
		questionVersion: typeof source.questionVersion === 'string' ? source.questionVersion : '',
		questionIds,
		answers,
		initialQuestionId,
		positionQuestionId,
		positionAt: Number(source.positionAt) || 0,
		startedAt: Number(source.startedAt) || 0,
		updatedAt: Number(source.updatedAt) || 0,
		active: source.active !== false
	})
}

function readExamDrafts() {
	const saved = getStorage(userScopedStorageKey(EXAM_DRAFTS_STORAGE_KEY))
	if (!saved || saved.version !== 1 || !isObject(saved.drafts)) return {}
	const drafts = {}
	Object.keys(saved.drafts).forEach(key => {
		const draft = normalizeExamDraft(saved.drafts[key])
		if (draft && draft.active && draft.roundId && draft.questionIds.length) {
			drafts[examDraftStorageKey(draft)] = draft
		}
	})
	return drafts
}

function writeExamDrafts(drafts) {
	const storageKey = userScopedStorageKey(EXAM_DRAFTS_STORAGE_KEY)
	if (!Object.keys(drafts).length) {
		if (removeStorage(storageKey)) return true
		return setStorage(storageKey, null)
	}
	return setStorage(storageKey, { version: 1, drafts })
}

function saveLocalExamDraft(draft) {
	const normalized = normalizeExamDraft(draft)
	if (!normalized) return null
	const drafts = readExamDrafts()
	drafts[examDraftStorageKey(normalized)] = normalized
	writeExamDrafts(drafts)
	return cloneValue(normalized)
}

function removeLocalExamDraft(scope) {
	if (!scope) return false
	const drafts = readExamDrafts()
	const key = examDraftStorageKey(scope)
	if (!drafts[key]) return false
	delete drafts[key]
	writeExamDrafts(drafts)
	return true
}

export function examDraftHasProgress(draft) {
	if (!draft || draft.active === false) return false
	const total = Array.isArray(draft.questionIds) ? draft.questionIds.length : Number(draft.total) || 0
	if (!total) return false
	const answered = isObject(draft.answers)
		? Object.keys(draft.answers).filter(questionId => {
			const answer = draft.answers[questionId]
			return answer && Array.isArray(answer.selected) && answer.selected.length
		}).length
		: Number(draft.answered) || 0
	return answered > 0 || Boolean(
		draft.positionQuestionId
		&& draft.initialQuestionId
		&& draft.positionQuestionId !== draft.initialQuestionId
	)
}

function toExamDraftSummary(draft) {
	if (!draft) return null
	const answers = isObject(draft.answers) ? draft.answers : {}
	const answered = Object.keys(answers).filter(questionId => (
		answers[questionId] && Array.isArray(answers[questionId].selected) && answers[questionId].selected.length
	)).length
	return {
		subjectId: draft.subjectId,
		mode: draft.mode,
		scopeKey: draft.scopeKey,
		chapterId: draft.chapterId || '',
		section: draft.section || '',
		knowledge: draft.knowledge || '',
		keyword: draft.keyword || '',
		roundId: draft.roundId,
		answered,
		total: draft.questionIds.length,
		initialQuestionId: draft.initialQuestionId || draft.questionIds[0] || '',
		positionQuestionId: draft.positionQuestionId || '',
		updatedAt: Number(draft.updatedAt) || 0,
		hasProgress: examDraftHasProgress(draft)
	}
}

export function getLocalExamDraft(options) {
	const scope = getExamDraftScope(options)
	if (!scope) return null
	const draft = readExamDrafts()[examDraftStorageKey(scope)]
	return draft ? cloneValue(draft) : null
}

export function getLocalExamDraftSummaries(subjectId) {
	const summaries = {}
	const drafts = readExamDrafts()
	Object.keys(drafts).forEach(key => {
		const draft = drafts[key]
		if (!draft || draft.subjectId !== subjectId) return
		const summary = toExamDraftSummary(draft)
		if (summary) summaries[summary.scopeKey] = summary
	})
	return { subjectId, summaries, _localOnly: true }
}

function examEventScope(draft) {
	return {
		subjectId: draft.subjectId,
		mode: draft.mode,
		chapterId: draft.chapterId || '',
		section: draft.section || '',
		knowledge: draft.knowledge || '',
		keyword: draft.keyword || '',
		scopeKey: draft.scopeKey
	}
}

export function startExamDraft(options) {
	const input = options || {}
	const scope = getExamDraftScope(input)
	const questionIds = Array.from(new Set((Array.isArray(input.questionIds) ? input.questionIds : [])
		.filter(questionId => typeof questionId === 'string' && questionId)))
		.slice(0, MAX_EXAM_DRAFT_QUESTIONS)
	if (!scope || !questionIds.length) {
		throw new UserPracticeServiceError('QUESTION_BANK_USER_CLIENT_ERROR', '考试草稿参数无效')
	}
	const occurredAt = Number(input.occurredAt) || Date.now()
	const initialQuestionId = questionIds.indexOf(input.initialQuestionId) > -1
		? input.initialQuestionId
		: questionIds[0]
	const draft = Object.assign({}, scope, {
		roundId: input.roundId || createPracticeEventId('exam-round'),
		questionVersion: typeof input.questionVersion === 'string' ? input.questionVersion : '',
		questionIds,
		answers: {},
		initialQuestionId,
		positionQuestionId: initialQuestionId,
		positionAt: occurredAt,
		startedAt: occurredAt,
		updatedAt: occurredAt,
		active: true
	})
	saveLocalExamDraft(draft)
	enqueueEvent(Object.assign(examEventScope(draft), {
		type: 'examStart',
		eventId: input.eventId || createPracticeEventId('exam-start'),
		roundId: draft.roundId,
		questionVersion: draft.questionVersion,
		questionIds: draft.questionIds.slice(),
		initialQuestionId,
		positionQuestionId: initialQuestionId,
		occurredAt
	}))
	return cloneValue(draft)
}

export function saveExamDraftAnswer(options) {
	const input = options || {}
	const draft = getLocalExamDraft(input)
	const questionId = typeof input.questionId === 'string' ? input.questionId : ''
	if (!draft || !questionId || draft.questionIds.indexOf(questionId) === -1) return null
	if (input.roundId && input.roundId !== draft.roundId) return null
	const selected = Array.from(new Set((Array.isArray(input.selected) ? input.selected : []).filter(Boolean)))
	const occurredAt = Number(input.occurredAt) || Date.now()
	if (selected.length) {
		draft.answers[questionId] = { questionId, selected, updatedAt: occurredAt }
	} else {
		delete draft.answers[questionId]
	}
	const positionQuestionId = draft.questionIds.indexOf(input.positionQuestionId) > -1
		? input.positionQuestionId
		: questionId
	draft.positionQuestionId = positionQuestionId
	draft.positionAt = occurredAt
	draft.updatedAt = occurredAt
	saveLocalExamDraft(draft)
	enqueueEvent(Object.assign(examEventScope(draft), {
		type: 'examAnswer',
		eventId: input.eventId || createPracticeEventId('exam-answer'),
		roundId: draft.roundId,
		questionId,
		selected,
		positionQuestionId,
		occurredAt
	}))
	return cloneValue(draft)
}

export function saveExamDraftPosition(options) {
	const input = options || {}
	const draft = getLocalExamDraft(input)
	const questionId = typeof input.questionId === 'string' ? input.questionId : ''
	if (!draft || !questionId || draft.questionIds.indexOf(questionId) === -1) return null
	if (input.roundId && input.roundId !== draft.roundId) return null
	const occurredAt = Number(input.occurredAt) || Date.now()
	draft.positionQuestionId = questionId
	draft.positionAt = occurredAt
	draft.updatedAt = occurredAt
	saveLocalExamDraft(draft)
	enqueueEvent(Object.assign(examEventScope(draft), {
		type: 'examPosition',
		eventId: input.eventId || createPracticeEventId('exam-position'),
		roundId: draft.roundId,
		questionId,
		occurredAt
	}))
	return cloneValue(draft)
}

export function reconcileExamDraft(options) {
	const input = options || {}
	const draft = getLocalExamDraft(input)
	if (!draft || input.roundId && input.roundId !== draft.roundId) return null
	const questionIds = Array.from(new Set((Array.isArray(input.questionIds) ? input.questionIds : [])
		.filter(questionId => draft.questionIds.indexOf(questionId) > -1)))
		.slice(0, MAX_EXAM_DRAFT_QUESTIONS)
	if (!questionIds.length) return null
	const availableIds = new Set(questionIds)
	Object.keys(draft.answers).forEach(questionId => {
		if (!availableIds.has(questionId)) delete draft.answers[questionId]
	})
	draft.questionIds = questionIds
	if (!availableIds.has(draft.initialQuestionId)) draft.initialQuestionId = questionIds[0]
	if (!availableIds.has(draft.positionQuestionId)) {
		draft.positionQuestionId = questionIds.find(questionId => !draft.answers[questionId])
			|| draft.initialQuestionId
	}
	const occurredAt = Number(input.occurredAt) || Date.now()
	draft.updatedAt = occurredAt
	saveLocalExamDraft(draft)
	enqueueEvent(Object.assign(examEventScope(draft), {
		type: 'examReconcile',
		eventId: input.eventId || createPracticeEventId('exam-reconcile'),
		roundId: draft.roundId,
		questionIds: draft.questionIds.slice(),
		initialQuestionId: draft.initialQuestionId,
		positionQuestionId: draft.positionQuestionId,
		occurredAt
	}))
	return cloneValue(draft)
}

function closeExamDraft(options, type) {
	const input = options || {}
	const scope = getExamDraftScope(input)
	if (!scope) return null
	const draft = getLocalExamDraft(scope)
	const roundId = input.roundId || draft && draft.roundId
	if (!roundId) return null
	const occurredAt = Number(input.occurredAt) || Date.now()
	removeLocalExamDraft(scope)
	enqueueEvent(Object.assign(examEventScope(Object.assign({}, scope, { scopeKey: scope.scopeKey })), {
		type,
		eventId: input.eventId || createPracticeEventId(type === 'examReset' ? 'exam-reset' : 'exam-complete'),
		roundId,
		occurredAt
	}))
	return { subjectId: scope.subjectId, scopeKey: scope.scopeKey, roundId, closed: true }
}

export function resetExamDraft(options) {
	return closeExamDraft(options, 'examReset')
}

export function completeExamDraft(options) {
	return closeExamDraft(options, 'examComplete')
}

function savePracticePosition(storageKey, positionKey, progress) {
	const positions = readPracticePositions(storageKey)
	positions[positionKey] = {
		subjectId: progress.subjectId,
		chapterId: progress.chapterId,
		section: progress.section || '',
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
	if (event.type && event.type.indexOf('exam') === 0) {
		for (let index = events.length - 1; index >= 0; index -= 1) {
			const pending = events[index]
			if (!pending.type || pending.type.indexOf('exam') !== 0
				|| pending.subjectId !== event.subjectId
				|| pending.scopeKey !== event.scopeKey) continue
			const replacesScope = event.type === 'examStart'
			const closesRound = ['examReset', 'examComplete'].indexOf(event.type) > -1
				&& pending.roundId === event.roundId
				&& pending.type !== 'examStart'
			const replacesAnswer = event.type === 'examAnswer'
				&& pending.type === 'examAnswer'
				&& pending.roundId === event.roundId
				&& pending.questionId === event.questionId
			const replacesPosition = (event.type === 'examPosition' || event.type === 'examAnswer')
				&& pending.type === 'examPosition'
				&& pending.roundId === event.roundId
			if (replacesScope || closesRound || replacesAnswer || replacesPosition) events.splice(index, 1)
		}
	}
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
		event.section = question.section || ''
		event.knowledge = question.knowledge || ''
	}
	updateLocalPracticeRoundAnswer(event)
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
	const section = config.section || question && question.section || ''
	const knowledge = config.knowledge || question && question.knowledge || ''
	const mode = ['section', 'knowledge'].indexOf(config.mode) > -1 ? config.mode : 'chapter'
	const questionId = question && (question.questionId || question.id)
	if (!subjectId || chapterId === undefined || chapterId === null || !questionId) return null
	if (mode === 'knowledge' && !knowledge) return null
	if (mode === 'section' && !section) return null
	const progress = {
		progressId: config.progressId || createPracticeEventId('progress'),
		subjectId,
		mode,
		chapterId: String(chapterId),
		section: mode === 'knowledge' ? '' : section,
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
		updateLocalPracticeRoundPosition(progress, section)
	}
	savePendingProgress(progress)
	return progress.progressId
}

export function getChapterPracticePosition(subjectId, chapterId) {
	if (!subjectId || chapterId === undefined || chapterId === null) return null
	const round = getLocalPracticeRound(subjectId, chapterId)
	return round.positionQuestionId ? {
		subjectId,
		chapterId: String(chapterId),
		questionId: round.positionQuestionId,
		updatedAt: round.positionAt
	} : null
}

export function getSectionPracticePosition(subjectId, chapterId, section) {
	if (!subjectId || chapterId === undefined || chapterId === null || !section) return null
	const round = getLocalPracticeRound(subjectId, chapterId, section)
	return round.positionQuestionId ? {
		subjectId,
		chapterId: String(chapterId),
		section,
		questionId: round.positionQuestionId,
		updatedAt: round.positionAt
	} : null
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
		recordsCache.clear()
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

export async function ensurePracticeUser(options) {
	if (options && options.forceRefresh) clearPracticeLogin()
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
	const state = localState
	const events = readOutbox()
	const answers = isObject(state.answers) ? state.answers : {}
	let outboxChanged = false
	events.forEach(event => {
		if (!event || event.type !== 'answer'
			|| typeof event.eventId !== 'string'
			|| event.eventId.indexOf('legacy-state-') !== 0
			|| event.judgedLocally === true) return
		const answer = answers[event.questionId]
		if (!answer || answer.subjectId !== event.subjectId
			|| typeof answer.correct !== 'boolean'
			|| answer.chapterId === undefined
			|| answer.chapterId === null
			|| !String(answer.chapterId)) return
		event.judgedLocally = true
		event.correct = answer.correct
		event.chapterId = String(answer.chapterId)
		event.section = answer.section || ''
		event.knowledge = answer.knowledge || ''
		const practiceModes = Array.isArray(answer.practiceModes) ? answer.practiceModes : []
		const practiceMode = PRACTICE_ENTRY_MODES.indexOf(answer.practiceMode) > -1
			? answer.practiceMode
			: practiceModes.find(mode => PRACTICE_ENTRY_MODES.indexOf(mode) > -1)
		if (practiceMode) event.practiceMode = practiceMode
		outboxChanged = true
	})
	if (outboxChanged) saveOutbox(events)
	if (migration && (migration.prepared || migration.complete)) return
	const eventIds = new Set(events.map(item => item.eventId))

	Object.keys(answers).forEach(questionId => {
		const answer = answers[questionId]
		if (!answer || !answer.subjectId || !Array.isArray(answer.selected) || !answer.selected.length) return
		const hasPendingAnswer = events.some(item => item.type === 'answer'
			&& item.subjectId === answer.subjectId
			&& item.questionId === questionId)
		if (hasPendingAnswer) return
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
		if (typeof answer.correct === 'boolean'
			&& answer.chapterId !== undefined
			&& answer.chapterId !== null
			&& String(answer.chapterId)) {
			event.judgedLocally = true
			event.correct = answer.correct
			event.chapterId = String(answer.chapterId)
			event.section = answer.section || ''
			event.knowledge = answer.knowledge || ''
		}
		const practiceModes = Array.isArray(answer.practiceModes) ? answer.practiceModes : []
		const practiceMode = PRACTICE_ENTRY_MODES.indexOf(answer.practiceMode) > -1
			? answer.practiceMode
			: practiceModes.find(mode => PRACTICE_ENTRY_MODES.indexOf(mode) > -1)
		if (practiceMode) event.practiceMode = practiceMode
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
		let rejectedEventCount = 0
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
			rejectedEventCount += new Set(result && result.rejectedEventIds || []).size
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
		return { synced: true, pending: 0, rejectedEventCount }
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
	const roundSnapshot = getLocalPracticeRoundSnapshot(subjectId)
	const chapterAttempts = config.includeAggregates === false
		? {}
		: roundSnapshot.chapterAttempts
	const sectionAttempts = config.includeAggregates === false
		? {}
		: roundSnapshot.sectionAttempts
	const knowledgeAttempts = {}
	if (config.includeAggregates !== false) {
		answers.forEach(item => {
			const modes = Array.isArray(item.answer.practiceModes) ? item.answer.practiceModes : []
			if (modes.indexOf('knowledge') > -1 && item.answer.knowledge) {
				const scopeKey = getKnowledgeScopeKey(item.answer.chapterId, item.answer.knowledge)
				const key = scopeKey || item.answer.knowledge
				knowledgeAttempts[key] = (knowledgeAttempts[key] || 0) + 1
			}
		})
	}
	const progressPositions = { chapter: {}, section: {}, knowledge: {} }
	if (config.includeProgress !== false) {
		progressPositions.chapter = cloneValue(roundSnapshot.progressPositions.chapter)
		progressPositions.section = cloneValue(roundSnapshot.progressPositions.section)
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
		sectionAttempts,
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
		Array.from(summaryCache.keys()).forEach(key => {
			if (key.endsWith(`|${subjectId}`)) summaryCache.delete(key)
		})
		return
	}
	snapshotCache.clear()
	summaryCache.clear()
	recordsCache.clear()
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

export async function getPracticeBootstrap(options) {
	const input = options || {}
	const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : ''
	const mode = PRACTICE_ENTRY_MODES.indexOf(input.mode) > -1 ? input.mode : ''
	if (!subjectId || !mode) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_USER_CLIENT_ERROR',
			'答题页初始化参数无效'
		)
	}
	if (!practiceCloudSyncEnabled()) return null
	await flushPracticeEvents({ includeProgress: false })
	const questionIds = Array.isArray(input.questionIds)
		? Array.from(new Set(input.questionIds.filter(Boolean))).slice(0, MAX_SNAPSHOT_QUESTION_IDS)
		: []
	let result
	try {
		result = await executeCloudCall('getPracticeBootstrap', {
			subjectId,
			mode,
			chapterId: input.chapterId,
			section: input.section,
			knowledge: input.knowledge,
			keyword: input.keyword,
			questionIds
		})
	} catch (error) {
		const errorMessage = error && (error.errMsg || error.message) || ''
		const unsupported = error && error.errCode === 'QUESTION_BANK_USER_UNSUPPORTED_ACTION'
			|| errorMessage.indexOf('不支持的action: getPracticeBootstrap') > -1
		if (!unsupported) throw error
		const preferences = await getPracticePreferences({
			forceRefresh: true,
			localFallback: false
		})
		const snapshotPromise = getPracticeStateSnapshot(subjectId, {
			questionIds,
			includeAggregates: false,
			includeProgress: false,
			forceRefresh: true
		})
		let sessionPromise = Promise.resolve(null)
		let sessionType = ''
		if (preferences.answerMode === 'practice'
			&& ['chapter', 'section'].indexOf(mode) > -1) {
			sessionType = 'practiceRound'
			sessionPromise = getPracticeRound({
				subjectId,
				chapterId: input.chapterId,
				section: mode === 'section' ? input.section : ''
			})
		} else if (preferences.answerMode === 'exam' && mode !== 'smart') {
			sessionType = 'examDraft'
			sessionPromise = getExamDraft(Object.assign({}, input, { subjectId, mode }))
		}
		const [snapshot, session] = await Promise.all([snapshotPromise, sessionPromise])
		result = {
			subjectId,
			mode,
			membership: null,
			preferences,
			snapshot,
			practiceRound: sessionType === 'practiceRound' ? session : null,
			examDraft: sessionType === 'examDraft' ? session : null,
			_compatFallback: true
		}
	}
	if (result && result.preferences) {
		savePreferencesEntry(result.preferences, false, Date.now())
		preferencesRefreshRequired = false
	}
	if (result && result.practiceRound) {
		cacheCloudPracticeRound(result.practiceRound, mode === 'section' ? input.section : '')
	}
	if (result && result.examDraft) {
		if (result.examDraft.active) saveLocalExamDraft(result.examDraft)
		else removeLocalExamDraft(getExamDraftScope(input))
	}
	if (result && result.snapshot) {
		const cacheKey = `${subjectId}|0|0|${hashString(questionIds.slice().sort().join('|'))}`
		setCached(snapshotCache, cacheKey, result.snapshot, SNAPSHOT_CACHE_TTL)
	}
	return result
}

export async function getPracticeRound(options) {
	const input = options || {}
	const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : ''
	const chapterId = input.chapterId === undefined || input.chapterId === null
		? ''
		: String(input.chapterId)
	const section = typeof input.section === 'string' ? input.section.trim() : ''
	if (!subjectId || !chapterId) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_USER_CLIENT_ERROR',
			'章节练习轮次参数无效'
		)
	}
	if (!practiceCloudSyncEnabled()) {
		return Object.assign(getLocalPracticeRound(subjectId, chapterId, section), {
			_localOnly: true
		})
	}
	try {
		await flushPracticeEvents()
		const result = await executeCloudCall('getPracticeRound', { subjectId, chapterId, section })
		return cacheCloudPracticeRound(result, section)
	} catch (error) {
		return Object.assign(getLocalPracticeRound(subjectId, chapterId, section), {
			_localFallback: true,
			_syncError: error && (error.errMsg || error.message) || '练习轮次同步失败'
		})
	}
}

export async function getExamDraft(options) {
	const scope = getExamDraftScope(options)
	if (!scope) return null
	if (!practiceCloudSyncEnabled()) return getLocalExamDraft(scope)
	try {
		await flushPracticeEvents({ includeProgress: false })
		const result = await executeCloudCall('getExamDraft', scope)
		if (!result || !result.active || !result.roundId || !Array.isArray(result.questionIds)
			|| !result.questionIds.length) {
			removeLocalExamDraft(scope)
			return null
		}
		return saveLocalExamDraft(result)
	} catch (error) {
		const local = getLocalExamDraft(scope)
		return local ? Object.assign(local, {
			_localFallback: true,
			_syncError: error && (error.errMsg || error.message) || '考试草稿同步失败'
		}) : null
	}
}

export async function getExamDraftSummaries(subjectId) {
	const normalizedSubjectId = typeof subjectId === 'string' ? subjectId.trim() : ''
	if (!normalizedSubjectId) {
		throw new UserPracticeServiceError('QUESTION_BANK_USER_CLIENT_ERROR', '考试科目信息无效')
	}
	if (!practiceCloudSyncEnabled()) return getLocalExamDraftSummaries(normalizedSubjectId)
	try {
		await flushPracticeEvents({ includeProgress: false })
		return await executeCloudCall('getExamDraftSummaries', { subjectId: normalizedSubjectId })
	} catch (error) {
		return Object.assign(getLocalExamDraftSummaries(normalizedSubjectId), {
			_localFallback: true,
			_syncError: error && (error.errMsg || error.message) || '考试进度同步失败'
		})
	}
}

export async function resetPracticeRound(options) {
	const input = options || {}
	const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : ''
	const chapterId = input.chapterId === undefined || input.chapterId === null
		? ''
		: String(input.chapterId)
	const section = typeof input.section === 'string' ? input.section.trim() : ''
	if (!subjectId || !chapterId) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_USER_CLIENT_ERROR',
			'章节练习轮次参数无效'
		)
	}
	const occurredAt = Number(input.occurredAt) || Date.now()
	const round = resetLocalPracticeRound(subjectId, chapterId, section, occurredAt)
	const event = {
		type: 'roundReset',
		eventId: input.eventId || createPracticeEventId('round-reset'),
		subjectId,
		chapterId,
		section,
		occurredAt
	}
	invalidateUserPracticeCache(subjectId)
	enqueueEvent(event)
	return Object.assign(toPracticeRoundResult(round, section), {
		reset: true,
		localOnly: !practiceCloudSyncEnabled(),
		syncPending: practiceCloudSyncEnabled()
	})
}

export async function getPracticeRecords(params) {
	const input = params || {}
	if (!practiceCloudSyncEnabled()) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_MEMBERSHIP_REQUIRED',
			'错题集与收藏夹为会员权益，请先开通会员'
		)
	}
	const subjectId = input.subjectId
	const type = input.type || 'wrong'
	const idsOnly = Boolean(input.idsOnly)
	const page = idsOnly ? 1 : (input.page || 1)
	const pageSize = idsOnly ? 2000 : (input.pageSize || 20)
	const cacheKey = `${subjectId}|${type}|${idsOnly ? 'ids' : page}|${pageSize}`
	if (!idsOnly && !input.forceRefresh && pendingPracticeEventCount() === 0) {
		const cached = getCached(recordsCache, cacheKey)
		if (cached) return idsOnly ? cached : requireRecordQuestionTypes(cached)
	}
	await flushPracticeEvents({ includeProgress: false })
	if (!idsOnly && !input.forceRefresh) {
		const cached = getCached(recordsCache, cacheKey)
		if (cached) return idsOnly ? cached : requireRecordQuestionTypes(cached)
	}
	const result = await executeCloudCall('getRecords', {
		subjectId,
		type,
		page,
		pageSize,
		idsOnly
	})
	if (result && result.membership) cacheValidatedMembership(result.membership)
	if (result && result.preferences) {
		savePreferencesEntry(result.preferences, false, Date.now())
		preferencesRefreshRequired = false
	}
	if (!idsOnly) requireRecordQuestionTypes(result)
	return idsOnly ? result : setCached(recordsCache, cacheKey, result, RECORDS_CACHE_TTL)
}

export async function getPracticeRecordIds(params) {
	return getPracticeRecords(Object.assign({}, params || {}, {
		idsOnly: true,
		page: 1,
		pageSize: 2000
	}))
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
	const seed = input.seed || ''
	const smartPractice = validateSmartPractice(input.smartPractice === undefined
		? getLocalPracticePreferences().smartPractice : input.smartPractice)
	const pageSize = Number(input.pageSize) || smartPractice.questionCount
	await flushPracticeEvents({ includeProgress: false })
	const result = await executeCloudCall('getSmartPractice', {
		subjectId,
		pageSize,
		seed,
		smartPractice
	})
	if (result && result.membership) cacheValidatedMembership(result.membership)
	if (result && result.preferences) {
		savePreferencesEntry(result.preferences, false, Date.now())
		preferencesRefreshRequired = false
	}
	requireSmartQuestionResult(result)
	return result
}

export async function getSmartPracticeState(subjectId) {
	if (!practiceCloudSyncEnabled()) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_MEMBERSHIP_REQUIRED',
			'云端智能取题状态为会员权益，请先开通会员'
		)
	}
	await flushPracticeEvents({ includeProgress: false })
	const result = await executeCloudCall('getSmartPracticeState', { subjectId })
	if (result && result.membership) cacheValidatedMembership(result.membership)
	if (result && result.preferences) {
		savePreferencesEntry(result.preferences, false, Date.now())
		preferencesRefreshRequired = false
	}
	return result
}

export async function getPracticeProgress(options) {
	const input = options || {}
	if (!practiceCloudSyncEnabled()) {
		const mode = ['section', 'knowledge'].indexOf(input.mode) > -1 ? input.mode : 'chapter'
		const position = mode === 'section'
			? getSectionPracticePosition(input.subjectId, input.chapterId, input.section)
			: (mode === 'knowledge'
				? getKnowledgePracticePosition(input.subjectId, input.chapterId, input.knowledge)
				: getChapterPracticePosition(input.subjectId, input.chapterId))
		if (!position) return null
		return {
			subjectId: input.subjectId,
			mode,
			chapterId: String(input.chapterId || position.chapterId || ''),
			section: mode === 'section' ? input.section || position.section || '' : '',
			knowledge: mode === 'knowledge' ? input.knowledge || position.knowledge || '' : '',
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
		section: input.section,
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

export async function submitQuestionFeedback(options) {
	const input = isObject(options) ? options : {}
	const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : ''
	const version = typeof input.version === 'string' ? input.version.trim() : ''
	const questionId = typeof input.questionId === 'string' ? input.questionId.trim() : ''
	const issueType = typeof input.issueType === 'string' ? input.issueType.trim() : ''
	const description = typeof input.description === 'string' ? input.description.trim() : ''
	if (!subjectId || !version || !questionId) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_USER_INVALID_ARGUMENT',
			'题目反馈缺少科目、版本或题目标识'
		)
	}
	if (FEEDBACK_ISSUE_TYPES.indexOf(issueType) === -1) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_USER_INVALID_ARGUMENT',
			'请选择有效的问题类型'
		)
	}
	if (description.length > 500 || (issueType === 'other' && description.length < 2)) {
		throw new UserPracticeServiceError(
			'QUESTION_BANK_USER_INVALID_ARGUMENT',
			issueType === 'other'
				? '选择其他时请填写2～500字的问题说明'
				: '问题说明不能超过500字'
		)
	}
	return executeCloudCall('submitQuestionFeedback', {
		clientRequestId: input.clientRequestId || createPracticeEventId('feedback'),
		subjectId,
		version,
		questionId,
		issueType,
		description,
		context: isObject(input.context) ? cloneValue(input.context) : {}
	})
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
	removeSubjectPracticePositions(SECTION_POSITION_STORAGE_KEY, subjectId)
	removeSubjectPracticePositions(KNOWLEDGE_POSITION_STORAGE_KEY, subjectId)
	const rounds = readPracticeRounds()
	Object.keys(rounds).forEach(key => {
		if (rounds[key] && rounds[key].subjectId === subjectId) delete rounds[key]
	})
	writePracticeRounds(rounds)
	const examDrafts = readExamDrafts()
	Object.keys(examDrafts).forEach(key => {
		if (examDrafts[key] && examDrafts[key].subjectId === subjectId) delete examDrafts[key]
	})
	writeExamDrafts(examDrafts)
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

export async function updatePracticePreferences(preferences, options) {
	const config = options || {}
	if (preferences && preferences.smartPractice !== undefined) validateSmartPractice(preferences.smartPractice)
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
	if (config.deferSync) {
		return Object.assign({}, next, { _syncPending: true })
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
	completeExamDraft,
	examDraftHasProgress,
	ensurePracticeUser,
	flushPracticeEvents,
	getChapterPracticePosition,
	getKnowledgeScopeKey,
	getKnowledgePracticePosition,
	getSectionScopeKey,
	getSectionPracticePosition,
	getCurrentPracticeUser,
	getCachedPracticeSummary,
	getExamDraft,
	getExamDraftScope,
	getExamDraftSummaries,
	getEffectiveAnswerMode,
	getEffectiveSmartPractice,
	getPracticeProgress,
	getPracticePreferences,
	getPracticeBootstrap,
	getPracticeRound,
	getPracticeRecords,
	getPracticeRecordIds,
	getSmartPracticeQuestions,
	getSmartPracticeState,
	getPracticeStateSnapshot,
	getLocalPracticeRound,
	getLocalPracticeRoundSnapshot,
	getPracticeSummary,
	getPracticeUserProfile,
	getLocalPracticePreferences,
	getLocalExamDraft,
	getLocalExamDraftSummaries,
	markPracticePreferencesRefreshRequired,
	markPracticeRecordsRefreshRequired,
	markPracticeSummaryRefreshRequired,
	pendingPracticeEventCount,
	practiceCloudSyncEnabled,
	practiceUserLoggedIn,
	queuePracticeAnswer,
	queuePracticeFavorite,
	reconcileExamDraft,
	resetExamDraft,
	resetPracticeRound,
	saveExamDraftAnswer,
	saveExamDraftPosition,
	savePracticeProgress,
	startExamDraft,
	submitQuestionFeedback,
	updatePracticePreferences
}
