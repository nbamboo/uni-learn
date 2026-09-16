'use strict'

const crypto = require('crypto')
const {
	normalizeSmartPractice,
	validateSmartPractice,
	buildSmartPracticeUnits,
	classifySmartPracticeUnits,
	selectSmartPracticeUnits
} = require('./smart-practice.js')

const CATALOG_COLLECTION = 'question_bank_catalogs'
const QUESTION_COLLECTION = 'question_bank_questions'
const USER_COLLECTION = 'uni-id-users'
const STATE_COLLECTION = 'question_bank_user_states'
const STATS_COLLECTION = 'question_bank_user_stats'
const PROGRESS_COLLECTION = 'question_bank_user_progress'
const PRACTICE_ROUND_COLLECTION = 'question_bank_user_rounds'
const EXAM_DRAFT_COLLECTION = 'question_bank_exam_drafts'
const PREFERENCES_COLLECTION = 'question_bank_user_preferences'
const MEMBERSHIP_COLLECTION = 'question_bank_memberships'
const MAX_SYNC_EVENTS = 50
const MAX_STATE_ROWS = 2000
const MAX_PROGRESS_ROWS = 500
const MAX_PRACTICE_ROUND_ROWS = 500
const MAX_EXAM_DRAFT_ROWS = 500
const MAX_EXAM_DRAFT_QUESTIONS = 5000
const MAX_SNAPSHOT_QUESTION_IDS = 100
const SMART_METADATA_PAGE_SIZE = 500
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const QUESTION_SCHEMA_VERSION = 3
const SUBJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const QUESTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EVENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ANSWER_ALIASES = ['A', 'B', 'C', 'D', 'E', 'F']
const RECORD_TYPES = ['wrong', 'favorite']
const PROGRESS_MODES = ['chapter', 'section', 'knowledge']
const ANSWER_MODES = ['exam', 'practice', 'review']
const PRACTICE_ENTRY_MODES = ['smart', 'chapter', 'section', 'knowledge', 'wrong', 'favorite', 'search', 'sequence']
const EXAM_DRAFT_MODES = ['chapter', 'section', 'knowledge', 'wrong', 'favorite', 'search', 'sequence']
const QUESTION_SELECTION_MODES = Object.freeze({
	single: 'single',
	judgment: 'single',
	multiple: 'multiple',
	material: 'multiple'
})
const MEMBER_SYNC_ACTIONS = new Set([
	'syncEvents',
	'getSummary',
	'getStateSnapshot',
	'getProgress',
	'getPracticeRound',
	'getExamDraft',
	'getExamDraftSummaries',
	'getPracticeBootstrap',
	'getSmartPractice',
	'getSmartPracticeState',
	'getRecords',
	'getPreferences',
	'updatePreferences',
	'clearCurrentSubjectData'
])
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000
const MIN_EVENT_TIME = new Date('2020-01-01T00:00:00.000Z').getTime()
const MAX_FUTURE_TIME = 5 * 60 * 1000
const MEMBER_EXPIRY_GRACE_MS = 6 * 60 * 60 * 1000

class QuestionBankUserError extends Error {
	constructor(errCode, errMsg) {
		super(errMsg)
		this.name = 'QuestionBankUserError'
		this.errCode = errCode
	}
}

function requireV3Catalog(catalog) {
	if (!catalog || catalog.questionSchemaVersion !== QUESTION_SCHEMA_VERSION) {
		throw new QuestionBankUserError(
			'QUESTION_BANK_SCHEMA_VERSION_UNSUPPORTED',
			'当前题库不是题型 schema v3，请重新发布题库目录'
		)
	}
	return catalog
}

function requireQuestionSchema(document, requireSelectionMode) {
	const expectedSelectionMode = document && QUESTION_SELECTION_MODES[document.type]
	const materialFields = [
		'materialGroupId', 'materialText', 'materialQuestionIndex', 'materialQuestionCount'
	]
	const hasMaterialField = Boolean(document)
		&& materialFields.some(field => Object.prototype.hasOwnProperty.call(document, field))
	const validMaterial = document && document.type === 'material'
		&& typeof document.materialGroupId === 'string'
		&& document.materialGroupId.length <= 64
		&& QUESTION_ID_PATTERN.test(document.materialGroupId)
		&& typeof document.materialText === 'string' && Boolean(document.materialText.trim())
		&& document.materialText.length <= 10000
		&& Number.isInteger(document.materialQuestionIndex)
		&& Number.isInteger(document.materialQuestionCount)
		&& document.materialQuestionIndex >= 1
		&& document.materialQuestionCount >= document.materialQuestionIndex
		&& typeof document.title === 'string' && Boolean(document.title.trim())
		&& document.title.indexOf('[材料]') === -1
	if (!expectedSelectionMode
		|| (requireSelectionMode && document.selectionMode !== expectedSelectionMode)
		|| (document && document.type === 'material'
			&& (requireSelectionMode || hasMaterialField) && !validMaterial)
		|| (document && document.type !== 'material' && hasMaterialField)) {
		const questionId = document && (document.questionId || document._id) || 'unknown'
		throw new QuestionBankUserError(
			'QUESTION_BANK_INVALID_QUESTION_SCHEMA',
			`题目${questionId}不符合题型 schema v3 结构`
		)
	}
	return document
}

function invalidArgument(message) {
	throw new QuestionBankUserError('QUESTION_BANK_USER_INVALID_ARGUMENT', message)
}

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireObject(value, fieldName) {
	if (!isPlainObject(value)) invalidArgument(`${fieldName || '参数'}必须是对象`)
	return value
}

function readString(value, fieldName, options) {
	const config = options || {}
	if (value === undefined || value === null) {
		if (config.required) invalidArgument(`${fieldName}不能为空`)
		return config.defaultValue === undefined ? '' : config.defaultValue
	}
	if (typeof value !== 'string') invalidArgument(`${fieldName}必须是字符串`)
	const result = value.trim()
	if (config.required && !result) invalidArgument(`${fieldName}不能为空`)
	if (config.minLength && result.length < config.minLength) {
		invalidArgument(`${fieldName}长度不能少于${config.minLength}个字符`)
	}
	if (config.maxLength && result.length > config.maxLength) {
		invalidArgument(`${fieldName}长度不能超过${config.maxLength}个字符`)
	}
	if (config.pattern && result && !config.pattern.test(result)) {
		invalidArgument(`${fieldName}格式不正确`)
	}
	if (config.values && result && config.values.indexOf(result) === -1) {
		invalidArgument(`${fieldName}不支持值${result}`)
	}
	return result
}

function readInteger(value, fieldName, options) {
	const config = options || {}
	if (value === undefined || value === null || value === '') return config.defaultValue
	const result = Number(value)
	if (!Number.isInteger(result)) invalidArgument(`${fieldName}必须是整数`)
	if (config.minimum !== undefined && result < config.minimum) {
		invalidArgument(`${fieldName}不能小于${config.minimum}`)
	}
	if (config.maximum !== undefined && result > config.maximum) {
		invalidArgument(`${fieldName}不能大于${config.maximum}`)
	}
	return result
}

function readBoolean(value, fieldName) {
	if (typeof value !== 'boolean') invalidArgument(`${fieldName}必须是布尔值`)
	return value
}

function readSubjectId(value) {
	return readString(value, 'subjectId', {
		required: true,
		maxLength: 64,
		pattern: SUBJECT_ID_PATTERN
	})
}

function readQuestionId(value) {
	return readString(value, 'questionId', {
		required: true,
		maxLength: 64,
		pattern: QUESTION_ID_PATTERN
	})
}

function readQuestionIds(value, fieldName, maximum) {
	const name = fieldName || 'questionIds'
	if (value === undefined || value === null) return []
	if (!Array.isArray(value)) invalidArgument(`${name}必须是数组`)
	if (value.length > maximum) invalidArgument(`${name}最多包含${maximum}个题目ID`)
	const result = []
	const seen = new Set()
	value.forEach((item, index) => {
		const id = readString(item, `${name}[${index}]`, {
			required: true,
			maxLength: 64,
			pattern: QUESTION_ID_PATTERN
		})
		if (!seen.has(id)) {
			seen.add(id)
			result.push(id)
		}
	})
	return result
}

function readEventId(value) {
	return readString(value, 'eventId', {
		required: true,
		minLength: 8,
		maxLength: 96,
		pattern: EVENT_ID_PATTERN
	})
}

function readSelected(value) {
	if (!Array.isArray(value) || value.length === 0 || value.length > ANSWER_ALIASES.length) {
		invalidArgument('selected选项数量不正确')
	}
	const seen = new Set()
	return value.map((item, index) => {
		const alias = readString(item, `selected[${index}]`, {
			required: true,
			values: ANSWER_ALIASES
		})
		if (seen.has(alias)) invalidArgument('selected不能包含重复选项')
		seen.add(alias)
		return alias
	})
}

function readExamSelected(value) {
	if (!Array.isArray(value) || value.length > ANSWER_ALIASES.length) {
		invalidArgument('selected选项数量不正确')
	}
	if (!value.length) return []
	return readSelected(value)
}

function readOccurredAt(value, currentTime) {
	const timestamp = Number(value)
	if (!Number.isFinite(timestamp) || timestamp < MIN_EVENT_TIME) {
		invalidArgument('occurredAt不是有效时间')
	}
	if (timestamp > currentTime.getTime() + MAX_FUTURE_TIME) {
		invalidArgument('occurredAt不能晚于服务器时间')
	}
	return new Date(timestamp)
}

function getRows(response) {
	if (!response) return []
	if (Array.isArray(response.data)) return response.data
	if (response.data && typeof response.data === 'object') return [response.data]
	return []
}

function getDateValue(value) {
	if (value instanceof Date) return value.getTime()
	if (value && typeof value === 'object' && value.$date !== undefined) return Number(value.$date) || 0
	const timestamp = new Date(value || 0).getTime()
	return Number.isFinite(timestamp) ? timestamp : 0
}

function getAvatarUrl(user) {
	if (!user) return ''
	if (typeof user.avatar === 'string') return user.avatar
	if (user.avatar_file && typeof user.avatar_file.url === 'string') return user.avatar_file.url
	return ''
}

function hasWeixinAccount(user) {
	if (!user) return false
	if (typeof user.wx_unionid === 'string' && user.wx_unionid) return true
	return isPlainObject(user.wx_openid) && Object.keys(user.wx_openid).some(key => Boolean(user.wx_openid[key]))
}

function chinaDayKey(value) {
	const date = value instanceof Date ? value : new Date(value)
	return new Date(date.getTime() + CHINA_OFFSET_MS).toISOString().slice(0, 10)
}

function stateDocumentId(userId, subjectId, questionId) {
	return `${userId}|${subjectId}|${questionId}`
}

function statsDocumentId(userId, subjectId) {
	return `${userId}|${subjectId}`
}

function progressDocumentId(userId, subjectId, mode, scopeKey) {
	const scopeHash = crypto.createHash('sha256').update(scopeKey).digest('hex').slice(0, 24)
	return `${userId}|${subjectId}|${mode}|${scopeHash}`
}

function practiceRoundDocumentId(userId, subjectId, chapterId) {
	const chapterHash = crypto.createHash('sha256').update(String(chapterId)).digest('hex').slice(0, 24)
	return `${userId}|${subjectId}|round|${chapterHash}`
}

function examDraftDocumentId(userId, subjectId, scopeKey) {
	const scopeHash = crypto.createHash('sha256').update(scopeKey).digest('hex').slice(0, 32)
	return `${userId}|${subjectId}|exam|${scopeHash}`
}

function examDraftScopeKey(mode, chapterId, section, knowledge, keyword) {
	if (mode === 'chapter') return `chapter|${String(chapterId || '')}`
	if (mode === 'section') return `section|${String(chapterId || '')}|${String(section || '')}`
	if (mode === 'knowledge') return `knowledge|${String(chapterId || '')}|${String(knowledge || '')}`
	if (mode === 'search') return `search|${String(keyword || '').trim().toLowerCase().replace(/\s+/g, ' ')}`
	return mode
}

function knowledgeScopeKey(chapterId, knowledge) {
	if (!chapterId || !knowledge) return ''
	return `${String(chapterId)}|${String(knowledge)}`
}

function sectionScopeKey(chapterId, section) {
	if (!chapterId || !section) return ''
	return `${String(chapterId)}|${String(section)}`
}

function emptyPracticeRound(userId, subjectId, chapterId, timestamp) {
	return {
		_id: practiceRoundDocumentId(userId, subjectId, chapterId),
		userId,
		subjectId,
		chapterId: String(chapterId),
		answers: [],
		chapterAttemptCount: 0,
		sectionAttemptCounts: [],
		chapterPosition: {},
		sectionPositions: [],
		chapterResetAt: new Date(0),
		sectionResets: [],
		createdAt: timestamp,
		updatedAt: timestamp
	}
}

function refreshPracticeRoundCounts(round) {
	const seenQuestionIds = new Set()
	const sectionCounts = new Map()
	;(Array.isArray(round.answers) ? round.answers : []).forEach(answer => {
		if (!answer || !answer.questionId || seenQuestionIds.has(answer.questionId)) return
		seenQuestionIds.add(answer.questionId)
		if (answer.section) {
			sectionCounts.set(answer.section, (sectionCounts.get(answer.section) || 0) + 1)
		}
	})
	round.chapterAttemptCount = seenQuestionIds.size
	round.sectionAttemptCounts = Array.from(sectionCounts.entries()).map(([section, count]) => ({
		section,
		count
	}))
	return round
}

function normalizePracticeRound(saved, userId, subjectId, chapterId, timestamp) {
	const round = saved || emptyPracticeRound(userId, subjectId, chapterId, timestamp)
	round.answers = Array.isArray(round.answers)
		? round.answers.filter(item => item && item.questionId && Array.isArray(item.selected))
		: []
	round.sectionPositions = Array.isArray(round.sectionPositions)
		? round.sectionPositions.filter(item => item && item.section && item.questionId)
		: []
	round.sectionResets = Array.isArray(round.sectionResets)
		? round.sectionResets.filter(item => item && item.section)
		: []
	round.chapterPosition = isPlainObject(round.chapterPosition) && round.chapterPosition.questionId
		? round.chapterPosition
		: {}
	return refreshPracticeRoundCounts(round)
}

function practiceRoundResetAt(round, section) {
	const sectionReset = section
		? round.sectionResets.find(item => item.section === section)
		: null
	return Math.max(
		getDateValue(round.chapterResetAt),
		getDateValue(sectionReset && sectionReset.resetAt)
	)
}

function applyPracticeRoundAnswer(round, item, correct, chapterId, section) {
	const eventTime = item.occurredAt.getTime()
	if (eventTime <= practiceRoundResetAt(round, section)) return false
	const savedIndex = round.answers.findIndex(answer => answer.questionId === item.questionId)
	const saved = savedIndex > -1 ? round.answers[savedIndex] : null
	if (saved && getDateValue(saved.answeredAt) > eventTime) return false
	const answer = {
		questionId: item.questionId,
		section: section || '',
		selected: item.selected.slice(),
		correct: Boolean(correct),
		answeredAt: item.occurredAt,
		answerEventId: item.eventId
	}
	if (savedIndex > -1) round.answers.splice(savedIndex, 1, answer)
	else round.answers.push(answer)
	round.chapterId = String(chapterId)
	refreshPracticeRoundCounts(round)
	return true
}

function applyPracticeRoundProgress(round, progress) {
	const progressTime = progress.occurredAt.getTime()
	const section = progress.section || ''
	if (progressTime <= practiceRoundResetAt(round, section)) return false
	if (!round.chapterPosition || getDateValue(round.chapterPosition.progressAt) <= progressTime) {
		round.chapterPosition = {
			questionId: progress.questionId,
			section,
			progressId: progress.progressId,
			progressAt: progress.occurredAt
		}
	}
	if (section) {
		const savedIndex = round.sectionPositions.findIndex(item => item.section === section)
		const saved = savedIndex > -1 ? round.sectionPositions[savedIndex] : null
		if (!saved || getDateValue(saved.progressAt) <= progressTime) {
			const position = {
				section,
				questionId: progress.questionId,
				progressId: progress.progressId,
				progressAt: progress.occurredAt
			}
			if (savedIndex > -1) round.sectionPositions.splice(savedIndex, 1, position)
			else round.sectionPositions.push(position)
		}
	}
	return true
}

function applyPracticeRoundReset(round, item) {
	const resetTime = item.occurredAt.getTime()
	if (!item.section) {
		if (resetTime < getDateValue(round.chapterResetAt)) return false
		round.answers = round.answers.filter(answer => getDateValue(answer.answeredAt) > resetTime)
		if (round.chapterPosition && getDateValue(round.chapterPosition.progressAt) <= resetTime) {
			round.chapterPosition = {}
		}
		round.sectionPositions = round.sectionPositions.filter(position => {
			return getDateValue(position.progressAt) > resetTime
		})
		round.chapterResetAt = item.occurredAt
		round.chapterResetEventId = item.eventId
		refreshPracticeRoundCounts(round)
		return true
	}
	const savedIndex = round.sectionResets.findIndex(reset => reset.section === item.section)
	const saved = savedIndex > -1 ? round.sectionResets[savedIndex] : null
	if (saved && resetTime < getDateValue(saved.resetAt)) return false
	round.answers = round.answers.filter(answer => (
		answer.section !== item.section || getDateValue(answer.answeredAt) > resetTime
	))
	round.sectionPositions = round.sectionPositions.filter(position => (
		position.section !== item.section || getDateValue(position.progressAt) > resetTime
	))
	if (round.chapterPosition
		&& round.chapterPosition.section === item.section
		&& getDateValue(round.chapterPosition.progressAt) <= resetTime) {
		round.chapterPosition = {}
	}
	const reset = { section: item.section, resetAt: item.occurredAt, resetEventId: item.eventId }
	if (savedIndex > -1) round.sectionResets.splice(savedIndex, 1, reset)
	else round.sectionResets.push(reset)
	refreshPracticeRoundCounts(round)
	return true
}

function practiceRoundResponse(round, section) {
	const allAnswers = round.answers
		.sort((left, right) => getDateValue(left.answeredAt) - getDateValue(right.answeredAt))
		.map(answer => ({
			questionId: answer.questionId,
			section: answer.section || '',
			selected: answer.selected.slice(),
			correct: Boolean(answer.correct),
			answeredAt: getDateValue(answer.answeredAt)
		}))
	const answers = section
		? allAnswers.filter(answer => answer.section === section)
		: allAnswers
	const position = section
		? round.sectionPositions.find(item => item.section === section) || null
		: round.chapterPosition
	const sectionReset = section
		? round.sectionResets.find(item => item.section === section) || null
		: null
	const result = {
		subjectId: round.subjectId,
		chapterId: round.chapterId,
		section: section || '',
		answers,
		answeredQuestionIds: answers.map(answer => answer.questionId),
		positionQuestionId: position && position.questionId || '',
		positionSection: position && position.section || '',
		positionAt: getDateValue(position && position.progressAt),
		chapterResetAt: getDateValue(round.chapterResetAt),
		sectionResetAt: getDateValue(sectionReset && sectionReset.resetAt)
	}
	if (section) {
		result.chapterAnswers = allAnswers
		result.chapterPositionQuestionId = round.chapterPosition && round.chapterPosition.questionId || ''
		result.chapterPositionSection = round.chapterPosition && round.chapterPosition.section || ''
		result.chapterPositionAt = getDateValue(round.chapterPosition && round.chapterPosition.progressAt)
	}
	return result
}

function emptyExamDraft(userId, scope, timestamp) {
	return {
		_id: examDraftDocumentId(userId, scope.subjectId, scope.scopeKey),
		userId,
		subjectId: scope.subjectId,
		mode: scope.mode,
		scopeKey: scope.scopeKey,
		chapterId: scope.chapterId || '',
		section: scope.section || '',
		knowledge: scope.knowledge || '',
		keyword: scope.keyword || '',
		roundId: '',
		active: false,
		questionVersion: '',
		questionIds: [],
		answers: [],
		initialQuestionId: '',
		positionQuestionId: '',
		positionAt: new Date(0),
		stateAt: new Date(0),
		startedAt: new Date(0),
		createdAt: timestamp,
		updatedAt: timestamp
	}
}

function normalizeExamDraft(saved, userId, scope, timestamp) {
	const draft = saved || emptyExamDraft(userId, scope, timestamp)
	draft.questionIds = Array.isArray(draft.questionIds)
		? Array.from(new Set(draft.questionIds.filter(Boolean))).slice(0, MAX_EXAM_DRAFT_QUESTIONS)
		: []
	const availableIds = new Set(draft.questionIds)
	draft.answers = Array.isArray(draft.answers)
		? draft.answers.filter(answer => (
			answer && availableIds.has(answer.questionId) && Array.isArray(answer.selected) && answer.selected.length
		))
		: []
	draft.active = Boolean(draft.active && draft.roundId && draft.questionIds.length)
	return draft
}

function examDraftResponse(draft) {
	if (!draft || !draft.active) return { active: false }
	const latestAnswerAt = draft.answers.reduce((latest, answer) => (
		Math.max(latest, getDateValue(answer.updatedAt))
	), 0)
	return {
		subjectId: draft.subjectId,
		mode: draft.mode,
		scopeKey: draft.scopeKey,
		chapterId: draft.chapterId || '',
		section: draft.section || '',
		knowledge: draft.knowledge || '',
		keyword: draft.keyword || '',
		roundId: draft.roundId,
		active: true,
		questionVersion: draft.questionVersion || '',
		questionIds: draft.questionIds.slice(),
		answers: draft.answers.map(answer => ({
			questionId: answer.questionId,
			selected: answer.selected.slice(),
			updatedAt: getDateValue(answer.updatedAt)
		})),
		initialQuestionId: draft.initialQuestionId || draft.questionIds[0] || '',
		positionQuestionId: draft.positionQuestionId || draft.initialQuestionId || draft.questionIds[0] || '',
		positionAt: getDateValue(draft.positionAt),
		startedAt: getDateValue(draft.startedAt),
		updatedAt: Math.max(getDateValue(draft.stateAt), getDateValue(draft.positionAt), latestAnswerAt)
	}
}

function applyExamDraftEvent(draft, item) {
	const eventTime = item.occurredAt.getTime()
	const stateTime = Math.max(
		getDateValue(draft.startedAt),
		getDateValue(draft.resetAt),
		getDateValue(draft.completedAt)
	)
	if (item.type === 'examStart') {
		if (draft.active && draft.roundId === item.roundId
			&& eventTime <= getDateValue(draft.startedAt)) return false
		if (eventTime < stateTime) return false
		draft.mode = item.mode
		draft.scopeKey = item.scopeKey
		draft.chapterId = item.chapterId || ''
		draft.section = item.section || ''
		draft.knowledge = item.knowledge || ''
		draft.keyword = item.keyword || ''
		draft.roundId = item.roundId
		draft.active = true
		draft.questionVersion = item.questionVersion || ''
		draft.questionIds = item.questionIds.slice()
		draft.answers = []
		draft.initialQuestionId = item.initialQuestionId
		draft.positionQuestionId = item.positionQuestionId
		draft.positionAt = item.occurredAt
		draft.startedAt = item.occurredAt
		draft.stateAt = item.occurredAt
		return true
	}
	if (item.type === 'examReset' || item.type === 'examComplete') {
		if (!draft.active || draft.roundId !== item.roundId) return false
		draft.active = false
		draft.questionIds = []
		draft.answers = []
		draft.initialQuestionId = ''
		draft.positionQuestionId = ''
		draft.positionAt = item.occurredAt
		draft.stateAt = item.occurredAt
		if (item.type === 'examReset') draft.resetAt = item.occurredAt
		else draft.completedAt = item.occurredAt
		return true
	}
	if (!draft.active || draft.roundId !== item.roundId) return false
	if (item.type === 'examReconcile') {
		const availableIds = new Set(item.questionIds)
		draft.questionIds = item.questionIds.slice()
		draft.answers = draft.answers.filter(answer => availableIds.has(answer.questionId))
		draft.initialQuestionId = item.initialQuestionId
		draft.positionQuestionId = item.positionQuestionId
		return true
	}
	if (draft.questionIds.indexOf(item.questionId) === -1) return false
	if (item.type === 'examPosition') {
		if (eventTime >= getDateValue(draft.positionAt)) {
			draft.positionQuestionId = item.questionId
			draft.positionAt = item.occurredAt
		}
		return true
	}
	if (draft.questionIds.indexOf(item.positionQuestionId) === -1) return false
	const savedIndex = draft.answers.findIndex(answer => answer.questionId === item.questionId)
	const saved = savedIndex > -1 ? draft.answers[savedIndex] : null
	if (!saved || eventTime >= getDateValue(saved.updatedAt)) {
		if (!item.selected.length) {
			if (savedIndex > -1) draft.answers.splice(savedIndex, 1)
		} else {
			const answer = {
				questionId: item.questionId,
				selected: item.selected.slice(),
				updatedAt: item.occurredAt,
				eventId: item.eventId
			}
			if (savedIndex > -1) draft.answers.splice(savedIndex, 1, answer)
			else draft.answers.push(answer)
		}
	}
	if (eventTime >= getDateValue(draft.positionAt)) {
		draft.positionQuestionId = item.positionQuestionId
		draft.positionAt = item.occurredAt
	}
	return true
}

function defaultPreferences() {
	return {
		answerMode: 'practice',
		nightMode: false,
		smartPractice: normalizeSmartPractice(),
		updatedAt: 0
	}
}

async function requireActiveMembership(store, userId, currentTime, featureName) {
	const saved = await getDocument(store, MEMBERSHIP_COLLECTION, userId)
	const expiresAt = getDateValue(saved && saved.expiresAt)
	if (
		!saved
		|| saved.status === 'revoked'
		|| expiresAt + MEMBER_EXPIRY_GRACE_MS <= currentTime.getTime()
	) {
		throw new QuestionBankUserError(
			'QUESTION_BANK_MEMBERSHIP_REQUIRED',
			`${featureName || '该功能'}为会员权益，请先开通会员`
		)
	}
	return saved
}

function membershipResponse(saved) {
	const expiresAt = getDateValue(saved && saved.expiresAt)
	return {
		isMember: true,
		status: 'active',
		expiresAt,
		entitlements: {
			adFree: true,
			practiceRecords: true,
			advancedAnswerModes: true,
			reviewMode: true,
			smartPracticeOver30: true
		}
	}
}

function emptyState(userId, subjectId, questionId, timestamp) {
	return {
		_id: stateDocumentId(userId, subjectId, questionId),
		userId,
		subjectId,
		questionId,
		attempted: false,
		attempts: 0,
		practiceModes: [],
		favorite: false,
		createdAt: timestamp,
		updatedAt: timestamp
	}
}

function normalizeAggregateEntries(value) {
	if (Array.isArray(value)) {
		return value.filter(item => item && typeof item.key === 'string' && Number(item.count) > 0)
			.map(item => ({ key: item.key, count: Number(item.count) }))
	}
	if (!isPlainObject(value)) return []
	return Object.keys(value).filter(key => Number(value[key]) > 0)
		.map(key => ({ key, count: Number(value[key]) }))
}

function normalizePracticeModes(value) {
	if (!Array.isArray(value)) return []
	return Array.from(new Set(value.filter(mode => PRACTICE_ENTRY_MODES.indexOf(mode) > -1)))
}

function incrementAggregate(entries, key) {
	if (!key) return
	const saved = entries.find(item => item.key === key)
	if (saved) saved.count += 1
	else entries.push({ key, count: 1 })
}

function addUniqueId(ids, questionId) {
	if (questionId && ids.length < MAX_STATE_ROWS && ids.indexOf(questionId) === -1) ids.push(questionId)
}

function removeId(ids, questionId) {
	const index = ids.indexOf(questionId)
	if (index > -1) ids.splice(index, 1)
}

function aggregateEntriesToObject(entries) {
	const result = {}
	entries.forEach(item => {
		if (item && item.key) result[item.key] = Number(item.count) || 0
	})
	return result
}

function addLegacyKnowledgeAliases(knowledgeAttempts) {
	const result = Object.assign({}, knowledgeAttempts)
	Object.keys(knowledgeAttempts).forEach(scopeKey => {
		const separator = scopeKey.indexOf('|')
		if (separator < 1 || separator >= scopeKey.length - 1) return
		const knowledge = scopeKey.slice(separator + 1)
		result[knowledge] = (Number(result[knowledge]) || 0)
			+ (Number(knowledgeAttempts[scopeKey]) || 0)
	})
	return result
}

function emptyStats(userId, subjectId, timestamp, todayKey) {
	return {
		_id: statsDocumentId(userId, subjectId),
		userId,
		subjectId,
		attempted: 0,
		correct: 0,
		wrong: 0,
		favorite: 0,
		totalAttempts: 0,
		todayKey,
		todayAttempts: 0,
		chapterAttempts: [],
		sectionAttempts: [],
		knowledgeAttempts: [],
		answeredQuestionIds: [],
		wrongQuestionIds: [],
		favoriteQuestionIds: [],
		stateAggregateVersion: 7,
		createdAt: timestamp,
		updatedAt: timestamp
	}
}

function normalizeStats(stats, userId, subjectId, timestamp, todayKey) {
	const result = stats || emptyStats(userId, subjectId, timestamp, todayKey)
	result.chapterAttempts = normalizeAggregateEntries(result.chapterAttempts)
	result.sectionAttempts = normalizeAggregateEntries(result.sectionAttempts)
	result.knowledgeAttempts = normalizeAggregateEntries(result.knowledgeAttempts)
	result.answeredQuestionIds = Array.from(new Set(
		(Array.isArray(result.answeredQuestionIds) ? result.answeredQuestionIds : []).filter(Boolean)
	)).slice(0, MAX_STATE_ROWS)
	result.wrongQuestionIds = Array.from(new Set(
		(Array.isArray(result.wrongQuestionIds) ? result.wrongQuestionIds : []).filter(Boolean)
	)).slice(0, MAX_STATE_ROWS)
	result.favoriteQuestionIds = Array.from(new Set(
		(Array.isArray(result.favoriteQuestionIds) ? result.favoriteQuestionIds : []).filter(Boolean)
	)).slice(0, MAX_STATE_ROWS)
	if (result.todayKey !== todayKey) {
		result.todayKey = todayKey
		result.todayAttempts = 0
	}
	return result
}

function answerIsCorrect(selected, answer) {
	const left = selected.slice().sort()
	const right = answer.slice().sort()
	return left.length === right.length && left.every((item, index) => item === right[index])
}

function hashSeed(value) {
	let hash = 2166136261
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 16777619)
	}
	return hash >>> 0
}

function createRandom(seed) {
	let state = seed >>> 0
	return function random() {
		state += 0x6D2B79F5
		let value = state
		value = Math.imul(value ^ value >>> 15, value | 1)
		value ^= value + Math.imul(value ^ value >>> 7, value | 61)
		return ((value ^ value >>> 14) >>> 0) / 4294967296
	}
}

function toPublicQuestion(document) {
	const result = Object.assign({}, document)
	delete result._id
	delete result.version
	delete result.status
	delete result.updatedAt
	result.id = result.questionId
	return result
}

async function loadFullQuestionsByIds(db, catalog, questionIds) {
	if (!questionIds.length) return []
	const response = await db.collection(QUESTION_COLLECTION)
		.where({
			subjectId: catalog.subjectId,
			version: catalog.activeVersion,
			status: 1,
			questionId: db.command.in(questionIds)
		})
		.limit(questionIds.length)
		.get()
	const byId = new Map()
	getRows(response).forEach(question => {
		requireQuestionSchema(question, true)
		byId.set(question.questionId, question)
	})
	return questionIds.map(questionId => byId.get(questionId)).filter(Boolean)
}

async function loadSmartQuestionReferences(db, catalog) {
	const result = []
	for (let offset = 0; ; offset += SMART_METADATA_PAGE_SIZE) {
		const response = await db.collection(QUESTION_COLLECTION)
			.where({
				subjectId: catalog.subjectId,
				version: catalog.activeVersion,
				status: 1
			})
			.field({
				questionId: true,
				chapterId: true,
				chapter: true,
				section: true,
				type: true,
				selectionMode: true,
				title: true,
				sortOrder: true,
				materialGroupId: true,
				materialText: true,
				materialQuestionIndex: true,
				materialQuestionCount: true
			})
			.orderBy('sortOrder', 'asc')
			.skip(offset)
			.limit(SMART_METADATA_PAGE_SIZE)
			.get()
		const rows = getRows(response)
		rows.forEach(question => requireQuestionSchema(question, true))
		result.push(...rows)
		if (rows.length < SMART_METADATA_PAGE_SIZE) break
	}
	return result
}

function readExamEventScope(event, index) {
	const mode = readString(event.mode, `events[${index}].mode`, {
		required: true,
		values: EXAM_DRAFT_MODES
	})
	const chapterId = readString(event.chapterId, `events[${index}].chapterId`, {
		required: ['chapter', 'section', 'knowledge'].indexOf(mode) > -1,
		maxLength: 32
	})
	const section = readString(event.section, `events[${index}].section`, {
		required: mode === 'section',
		maxLength: 128
	})
	const knowledge = readString(event.knowledge, `events[${index}].knowledge`, {
		required: mode === 'knowledge',
		maxLength: 128
	})
	const keyword = readString(event.keyword, `events[${index}].keyword`, {
		required: mode === 'search',
		maxLength: 128
	}).toLowerCase().replace(/\s+/g, ' ')
	const scopeKey = examDraftScopeKey(mode, chapterId, section, knowledge, keyword)
	const suppliedScopeKey = readString(event.scopeKey, `events[${index}].scopeKey`, {
		required: true,
		maxLength: 512
	})
	if (suppliedScopeKey !== scopeKey) invalidArgument(`events[${index}].scopeKey与测试范围不一致`)
	return { mode, chapterId, section, knowledge, keyword, scopeKey }
}

function readSyncEvent(rawEvent, currentTime, index) {
	const event = requireObject(rawEvent, `events[${index}]`)
	const type = readString(event.type, `events[${index}].type`, {
		required: true,
		values: [
			'answer', 'favorite', 'roundReset',
			'examStart', 'examAnswer', 'examPosition', 'examReconcile', 'examReset', 'examComplete'
		]
	})
	const result = {
		type,
		eventId: readEventId(event.eventId),
		subjectId: readSubjectId(event.subjectId),
		occurredAt: readOccurredAt(event.occurredAt, currentTime),
		originalIndex: index
	}
	if (type.indexOf('exam') === 0) {
		Object.assign(result, readExamEventScope(event, index), {
			roundId: readString(event.roundId, `events[${index}].roundId`, {
				required: true,
				minLength: 8,
				maxLength: 96,
				pattern: EVENT_ID_PATTERN
			})
		})
		if (type === 'examStart' || type === 'examReconcile') {
			result.questionIds = readQuestionIds(
				event.questionIds,
				`events[${index}].questionIds`,
				MAX_EXAM_DRAFT_QUESTIONS
			)
			if (!result.questionIds.length) invalidArgument(`events[${index}].questionIds不能为空`)
			result.initialQuestionId = readQuestionId(event.initialQuestionId)
			result.positionQuestionId = readQuestionId(event.positionQuestionId)
			if (result.questionIds.indexOf(result.initialQuestionId) === -1
				|| result.questionIds.indexOf(result.positionQuestionId) === -1) {
				invalidArgument(`events[${index}]的起始题或位置不在试卷中`)
			}
			if (type === 'examStart') {
				result.questionVersion = readString(event.questionVersion, `events[${index}].questionVersion`, {
					maxLength: 64
				})
			}
		}
		if (type === 'examAnswer') {
			result.questionId = readQuestionId(event.questionId)
			result.selected = readExamSelected(event.selected)
			result.positionQuestionId = readQuestionId(event.positionQuestionId)
		}
		if (type === 'examPosition') result.questionId = readQuestionId(event.questionId)
		return result
	}
	if (type === 'roundReset') {
		result.chapterId = readString(event.chapterId, `events[${index}].chapterId`, {
			required: true,
			maxLength: 32
		})
		result.section = readString(event.section, `events[${index}].section`, {
			maxLength: 128
		})
		return result
	}
	result.questionId = readQuestionId(event.questionId)
	if (type === 'answer') {
		result.selected = readSelected(event.selected)
		result.practiceMode = readString(event.practiceMode, `events[${index}].practiceMode`, {
			values: PRACTICE_ENTRY_MODES
		})
		result.judgedLocally = event.judgedLocally === true
		if (result.judgedLocally) {
			result.correct = readBoolean(event.correct, `events[${index}].correct`)
			result.chapterId = readString(event.chapterId, `events[${index}].chapterId`, {
				required: true,
				maxLength: 32
			})
			result.section = readString(event.section, `events[${index}].section`, {
				required: result.practiceMode === 'section',
				maxLength: 128
			})
			result.knowledge = readString(event.knowledge, `events[${index}].knowledge`, {
				maxLength: 128
			})
		}
	}
	else {
		if (typeof event.favorite !== 'boolean') invalidArgument('favorite必须是布尔值')
		result.favorite = event.favorite
	}
	return result
}

function toSummary(stats, subjectId, currentTime) {
	const todayKey = chinaDayKey(currentTime)
	return {
		subjectId,
		attempted: Number(stats.attempted) || 0,
		correct: Number(stats.correct) || 0,
		wrong: Number(stats.wrong) || 0,
		favorite: Number(stats.favorite) || 0,
		totalAttempts: Number(stats.totalAttempts) || 0,
		todayAttempts: stats.todayKey === todayKey ? (Number(stats.todayAttempts) || 0) : 0,
		todayKey,
		accuracy: stats.attempted ? Math.round(stats.correct / stats.attempted * 100) : 0
	}
}

function readProgress(rawProgress, currentTime) {
	const progress = requireObject(rawProgress, 'progress')
	const mode = readString(progress.mode, 'progress.mode', {
		required: true,
		values: PROGRESS_MODES
	})
	const chapterId = readString(progress.chapterId, 'progress.chapterId', {
		required: true,
		maxLength: 32
	})
	const knowledge = readString(progress.knowledge, 'progress.knowledge', {
		required: mode === 'knowledge',
		maxLength: 128
	})
	const section = readString(progress.section, 'progress.section', {
		required: mode === 'section',
		maxLength: 128
	})
	return {
		progressId: readEventId(progress.progressId),
		subjectId: readSubjectId(progress.subjectId),
		mode,
		scopeKey: mode === 'chapter'
			? chapterId
			: (mode === 'section'
				? sectionScopeKey(chapterId, section)
				: knowledgeScopeKey(chapterId, knowledge)),
		chapterId,
		section,
		knowledge,
		questionId: readQuestionId(progress.questionId),
		occurredAt: readOccurredAt(progress.occurredAt, currentTime)
	}
}

async function getDocument(store, collectionName, documentId) {
	const response = await store.collection(collectionName).doc(documentId).get()
	return getRows(response)[0] || null
}

async function setDocument(store, collectionName, documentId, document) {
	return store.collection(collectionName).doc(documentId).set(document)
}

function removedCount(response) {
	const value = Number(response && (response.deleted || response.affectedDocs || response.updated))
	return Number.isFinite(value) ? value : 0
}

async function loadCatalog(db, subjectId) {
	const catalog = await getDocument(db, CATALOG_COLLECTION, subjectId)
	if (!catalog || catalog.status !== 1 || !catalog.activeVersion) {
		throw new QuestionBankUserError('QUESTION_BANK_SUBJECT_NOT_FOUND', '科目题库不存在或尚未启用')
	}
	return requireV3Catalog(catalog)
}

async function loadQuestionsForEvents(db, events) {
	const catalogs = new Map()
	const questions = new Map()
	const bySubject = new Map()
	events.forEach(event => {
		if (!bySubject.has(event.subjectId)) bySubject.set(event.subjectId, new Set())
		bySubject.get(event.subjectId).add(event.questionId)
	})
	for (const [subjectId, questionIdSet] of bySubject.entries()) {
		const catalog = await loadCatalog(db, subjectId)
		catalogs.set(subjectId, catalog)
		const questionIds = Array.from(questionIdSet)
		const response = await db.collection(QUESTION_COLLECTION)
			.where({
				subjectId,
				version: catalog.activeVersion,
				status: 1,
				questionId: db.command.in(questionIds)
			})
			.field({
				questionId: true,
				chapterId: true,
				section: true,
				knowledge: true,
				type: true,
				selectionMode: true,
				title: true,
				materialGroupId: true,
				materialText: true,
				materialQuestionIndex: true,
				materialQuestionCount: true,
				answer: true
			})
			.limit(questionIds.length)
			.get()
		getRows(response).forEach(question => {
			requireQuestionSchema(question, true)
			questions.set(`${subjectId}|${question.questionId}`, question)
		})
		questionIds.forEach(questionId => {
			if (!questions.has(`${subjectId}|${questionId}`)) {
				throw new QuestionBankUserError('QUESTION_BANK_QUESTION_NOT_FOUND', `题目${questionId}不存在或尚未启用`)
			}
		})
	}
	return { catalogs, questions }
}

async function withTransaction(db, handler) {
	if (typeof db.startTransaction !== 'function') return handler(db)
	const transaction = await db.startTransaction()
	try {
		const result = await handler(transaction)
		await transaction.commit()
		return result
	} catch (error) {
		try {
			await transaction.rollback()
		} catch (rollbackError) {
			// Preserve the original write error.
		}
		throw error
	}
}

function recordTypeCondition(userId, subjectId, type) {
	const condition = { userId, subjectId }
	if (type === 'favorite') condition.favorite = true
	else {
		condition.attempted = true
		if (type === 'wrong') condition.lastCorrect = false
	}
	return condition
}

function recordSortField(type) {
	return type === 'favorite' ? 'favoriteUpdatedAt' : 'lastAnsweredAt'
}

async function loadQuestionSummaries(db, subjectId, questionIds) {
	if (!questionIds.length) return new Map()
	const catalog = await loadCatalog(db, subjectId)
	const response = await db.collection(QUESTION_COLLECTION)
		.where({
			subjectId,
			version: catalog.activeVersion,
			status: 1,
			questionId: db.command.in(questionIds)
		})
		.field({
			questionId: true,
			chapterId: true,
			chapter: true,
			section: true,
			knowledge: true,
			type: true,
			selectionMode: true,
			title: true,
			materialGroupId: true,
			materialText: true,
			materialQuestionIndex: true,
			materialQuestionCount: true,
			sortOrder: true
		})
		.limit(questionIds.length)
		.get()
	const result = new Map()
	getRows(response).forEach(question => {
		requireQuestionSchema(question, true)
		const summary = Object.assign({}, question, { id: question.questionId })
		delete summary._id
		delete summary.selectionMode
		result.set(question.questionId, summary)
	})
	return result
}

function createQuestionBankUserService(db, options) {
	if (!db || typeof db.collection !== 'function' || !db.command) {
		throw new Error('A uniCloud database instance is required')
	}
	const config = options || {}
	const now = typeof config.now === 'function' ? config.now : () => new Date()
	const serverDate = () => typeof db.serverDate === 'function' ? db.serverDate() : now()

	async function syncEvents(event, userId) {
		const rawEvents = event.events === undefined ? [] : event.events
		if (!Array.isArray(rawEvents)) invalidArgument('events必须是数组')
		if (rawEvents.length > MAX_SYNC_EVENTS) {
			invalidArgument(`events最多包含${MAX_SYNC_EVENTS}条记录`)
		}
		const currentTime = now()
		const progress = event.progress === undefined || event.progress === null
			? null
			: readProgress(event.progress, currentTime)
		if (!rawEvents.length && !progress) invalidArgument('events和progress不能同时为空')
		const events = rawEvents.map((item, index) => readSyncEvent(item, currentTime, index))
		const rejectedEventIds = []
		events.sort((left, right) => {
			const timeDiff = left.occurredAt.getTime() - right.occurredAt.getTime()
			return timeDiff || left.originalIndex - right.originalIndex
		})
		// 旧版客户端没有上传本地判题结果，发布过渡期内才回查题库。
		// 新版事件和练习进度均直接信任客户端数据，不读取题库目录或题目答案。
		const legacyAnswerEvents = events.filter(item => item.type === 'answer' && !item.judgedLocally)
		const loaded = legacyAnswerEvents.length
			? await loadQuestionsForEvents(db, legacyAnswerEvents)
			: { questions: new Map() }
		const todayKey = chinaDayKey(currentTime)

		return withTransaction(db, async store => {
			const stateCache = new Map()
			const statsCache = new Map()
			const roundCache = new Map()
			const examDraftCache = new Map()
			const dirtyRoundIds = new Set()
			const dirtyExamDraftIds = new Set()
			const acceptedEventIds = []
			const duplicateEventIds = []
			const answerResults = []

			async function getState(subjectId, questionId) {
				const id = stateDocumentId(userId, subjectId, questionId)
				if (!stateCache.has(id)) {
					const saved = await getDocument(store, STATE_COLLECTION, id)
					const state = saved || emptyState(userId, subjectId, questionId, currentTime)
					state.practiceModes = normalizePracticeModes(state.practiceModes)
					stateCache.set(id, state)
				}
				return stateCache.get(id)
			}

			async function getStats(subjectId) {
				const id = statsDocumentId(userId, subjectId)
				if (!statsCache.has(id)) {
					const stats = await loadStateAggregates(userId, subjectId, currentTime, store)
					statsCache.set(id, stats)
				}
				return statsCache.get(id)
			}

			async function getRound(subjectId, chapterId) {
				const id = practiceRoundDocumentId(userId, subjectId, chapterId)
				if (!roundCache.has(id)) {
					const saved = await getDocument(store, PRACTICE_ROUND_COLLECTION, id)
					roundCache.set(id, normalizePracticeRound(
						saved,
						userId,
						subjectId,
						chapterId,
						currentTime
					))
				}
				return roundCache.get(id)
			}

			async function getExamDraft(item) {
				const scope = {
					subjectId: item.subjectId,
					mode: item.mode,
					scopeKey: item.scopeKey,
					chapterId: item.chapterId || '',
					section: item.section || '',
					knowledge: item.knowledge || '',
					keyword: item.keyword || ''
				}
				const id = examDraftDocumentId(userId, item.subjectId, item.scopeKey)
				if (!examDraftCache.has(id)) {
					const saved = await getDocument(store, EXAM_DRAFT_COLLECTION, id)
					examDraftCache.set(id, normalizeExamDraft(saved, userId, scope, currentTime))
				}
				return examDraftCache.get(id)
			}

			for (const item of events) {
				if (item.type.indexOf('exam') === 0) {
					const draft = await getExamDraft(item)
					if (applyExamDraftEvent(draft, item)) {
						draft.updatedAt = serverDate()
						dirtyExamDraftIds.add(draft._id)
					}
					acceptedEventIds.push(item.eventId)
					continue
				}
				if (item.type === 'roundReset') {
					const round = await getRound(item.subjectId, item.chapterId)
					if (applyPracticeRoundReset(round, item)) {
						round.updatedAt = serverDate()
						dirtyRoundIds.add(round._id)
					}
					acceptedEventIds.push(item.eventId)
					continue
				}
				if (item.type === 'answer') {
					const question = item.judgedLocally
						? null
						: loaded.questions.get(`${item.subjectId}|${item.questionId}`)
					const correct = item.judgedLocally
						? item.correct
						: answerIsCorrect(item.selected, question.answer)
					const state = await getState(item.subjectId, item.questionId)
					const wasAttempted = Boolean(state.attempted)
					const wasCorrect = Boolean(state.lastCorrect)
					const wasKnowledgePractice = state.practiceModes.indexOf('knowledge') > -1
					const latestTime = getDateValue(state.lastAnsweredAt)
					const eventTime = item.occurredAt.getTime()
					const duplicate = state.lastAnswerEventId === item.eventId
						|| (wasAttempted && latestTime >= eventTime)
					if (duplicate) {
						duplicateEventIds.push(item.eventId)
						answerResults.push({ eventId: item.eventId, correct })
						continue
					}
					const stats = await getStats(item.subjectId)

					state.chapterId = item.judgedLocally ? item.chapterId : question.chapterId
					state.section = item.judgedLocally ? item.section : question.section
					state.knowledge = item.judgedLocally ? item.knowledge : question.knowledge
					state.attempted = true
					state.attempts = (Number(state.attempts) || 0) + 1
					state.firstAnsweredAt = state.firstAnsweredAt || item.occurredAt
					state.lastAnswerEventId = item.eventId
					state.lastCorrect = correct
					state.lastSelected = item.selected
					state.lastAnsweredAt = item.occurredAt
					if (item.practiceMode && state.practiceModes.indexOf(item.practiceMode) === -1) {
						state.practiceModes.push(item.practiceMode)
					}
					state.updatedAt = serverDate()

					if (!wasAttempted) {
						addUniqueId(stats.answeredQuestionIds, item.questionId)
						if (!correct) addUniqueId(stats.wrongQuestionIds, item.questionId)
						stats.attempted += 1
						if (correct) stats.correct += 1
						else stats.wrong += 1
					} else if (wasCorrect !== correct) {
						if (correct) {
							removeId(stats.wrongQuestionIds, item.questionId)
							stats.correct += 1
							stats.wrong = Math.max(0, stats.wrong - 1)
						} else {
							addUniqueId(stats.wrongQuestionIds, item.questionId)
							stats.wrong += 1
							stats.correct = Math.max(0, stats.correct - 1)
						}
					}
					if (!wasKnowledgePractice && state.practiceModes.indexOf('knowledge') > -1) {
						incrementAggregate(
							stats.knowledgeAttempts,
							knowledgeScopeKey(state.chapterId, state.knowledge)
						)
					}
					stats.totalAttempts += 1
					if (chinaDayKey(item.occurredAt) === todayKey) stats.todayAttempts += 1
					stats.updatedAt = serverDate()
					if (['chapter', 'section'].indexOf(item.practiceMode) > -1) {
						const round = await getRound(item.subjectId, state.chapterId)
						if (applyPracticeRoundAnswer(
							round,
							item,
							correct,
							state.chapterId,
							state.section
						)) {
							round.updatedAt = serverDate()
							dirtyRoundIds.add(round._id)
						}
					}

					acceptedEventIds.push(item.eventId)
					answerResults.push({ eventId: item.eventId, correct })
					continue
				}

				const state = await getState(item.subjectId, item.questionId)
				const favoriteTime = getDateValue(state.favoriteUpdatedAt)
				if (!favoriteTime || item.occurredAt.getTime() >= favoriteTime) {
					const stats = await getStats(item.subjectId)
					const previous = Boolean(state.favorite)
					state.favorite = item.favorite
					state.favoriteUpdatedAt = item.occurredAt
					state.updatedAt = serverDate()
					if (previous !== item.favorite) {
						if (item.favorite) addUniqueId(stats.favoriteQuestionIds, item.questionId)
						else removeId(stats.favoriteQuestionIds, item.questionId)
						stats.favorite = Math.max(0, stats.favorite + (item.favorite ? 1 : -1))
						stats.updatedAt = serverDate()
					}
				}
				acceptedEventIds.push(item.eventId)
			}

			let progressResult = null
			if (progress && ['chapter', 'section'].indexOf(progress.mode) > -1) {
				const round = await getRound(progress.subjectId, progress.chapterId)
				if (applyPracticeRoundProgress(round, progress)) {
					round.updatedAt = serverDate()
					dirtyRoundIds.add(round._id)
				}
				progressResult = {
					progressId: progress.progressId,
					saved: true
				}
			} else if (progress) {
				const id = progressDocumentId(
					userId,
					progress.subjectId,
					progress.mode,
					progress.scopeKey
				)
				const saved = await getDocument(store, PROGRESS_COLLECTION, id)
				const savedTime = getDateValue(saved && saved.progressAt)
				if (!saved || progress.occurredAt.getTime() >= savedTime) {
					const progressDocument = {
						_id: id,
						userId,
						subjectId: progress.subjectId,
						mode: progress.mode,
						scopeKey: progress.scopeKey,
						chapterId: progress.chapterId,
						questionId: progress.questionId,
						progressId: progress.progressId,
						progressAt: progress.occurredAt,
						createdAt: saved && saved.createdAt || serverDate(),
						updatedAt: serverDate()
					}
					if (progress.knowledge) progressDocument.knowledge = progress.knowledge
					if (progress.section) progressDocument.section = progress.section
					await setDocument(store, PROGRESS_COLLECTION, id, progressDocument)
				}
				progressResult = {
					progressId: progress.progressId,
					saved: true
				}
			}

			const summarySubjectIds = Array.from(new Set(events
				.filter(item => item.type === 'answer' || item.type === 'favorite')
				.map(item => item.subjectId)))
			for (const subjectId of summarySubjectIds) await getStats(subjectId)

			for (const state of stateCache.values()) {
				await setDocument(store, STATE_COLLECTION, state._id, state)
			}
			for (const stats of statsCache.values()) {
				await setDocument(store, STATS_COLLECTION, stats._id, stats)
			}
			for (const roundId of dirtyRoundIds) {
				const round = roundCache.get(roundId)
				const document = Object.assign({}, round)
				if (!document.chapterPosition) delete document.chapterPosition
				await setDocument(store, PRACTICE_ROUND_COLLECTION, round._id, document)
			}
			for (const draftId of dirtyExamDraftIds) {
				const draft = examDraftCache.get(draftId)
				await setDocument(store, EXAM_DRAFT_COLLECTION, draft._id, draft)
			}
			const summaries = {}
			statsCache.forEach(stats => {
				summaries[stats.subjectId] = toSummary(stats, stats.subjectId, currentTime)
			})

			return {
				acceptedEventIds,
				duplicateEventIds,
				rejectedEventIds,
				answerResults,
				summaries,
				progress: progressResult
			}
		})
	}

	async function getSummary(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const currentTime = now()
		const todayKey = chinaDayKey(currentTime)
		const saved = await getDocument(db, STATS_COLLECTION, statsDocumentId(userId, subjectId))
		const stats = normalizeStats(saved, userId, subjectId, currentTime, todayKey)
		return toSummary(stats, subjectId, currentTime)
	}

	async function getUserProfile(event, userId) {
		const user = await getDocument(db, USER_COLLECTION, userId)
		if (!user) {
			throw new QuestionBankUserError('QUESTION_BANK_USER_NOT_FOUND', '当前登录用户不存在')
		}
		return {
			uid: userId,
			nickname: typeof user.nickname === 'string' ? user.nickname : '',
			avatar: getAvatarUrl(user),
			weixinBound: hasWeixinAccount(user),
			registeredAt: getDateValue(user.register_date),
			lastLoginAt: getDateValue(user.last_login_date)
		}
	}

	async function getPreferences(event, userId) {
		const saved = await getDocument(db, PREFERENCES_COLLECTION, userId)
		if (!saved) return defaultPreferences()
		const answerMode = ANSWER_MODES.indexOf(saved.answerMode) > -1
			? saved.answerMode
			: 'practice'
		return {
			answerMode,
			nightMode: Boolean(saved.nightMode),
			smartPractice: normalizeSmartPractice(saved.smartPractice),
			updatedAt: getDateValue(saved.updatedAt)
		}
	}

	async function updatePreferences(event, userId) {
		const answerMode = readString(event.answerMode, 'answerMode', {
			required: true,
			values: ANSWER_MODES
		})
		const nightMode = readBoolean(event.nightMode, 'nightMode')
		let smartPractice
		try { smartPractice = validateSmartPractice(event.smartPractice) }
		catch (error) { invalidArgument(error.message) }
		const currentTime = now()
		const saved = await getDocument(db, PREFERENCES_COLLECTION, userId)
		if (event.smartPractice === undefined) smartPractice = normalizeSmartPractice(saved && saved.smartPractice)
		await setDocument(db, PREFERENCES_COLLECTION, userId, {
			_id: userId,
			userId,
			answerMode,
			nightMode,
			smartPractice,
			createdAt: saved && saved.createdAt || serverDate(),
			updatedAt: serverDate()
		})
		return {
			answerMode,
			nightMode,
			smartPractice,
			updatedAt: currentTime.getTime()
		}
	}

	async function clearCurrentSubjectData(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const confirmation = readString(event.confirmation, 'confirmation', {
			required: true,
			maxLength: 32
		})
		if (confirmation !== 'CLEAR_CURRENT_SUBJECT') {
			invalidArgument('删除确认信息不正确')
		}
		return withTransaction(db, async store => {
			const targets = [
				STATE_COLLECTION,
				STATS_COLLECTION,
				PROGRESS_COLLECTION,
				PRACTICE_ROUND_COLLECTION,
				EXAM_DRAFT_COLLECTION
			]
			const deletedByCollection = {}
			for (const collectionName of targets) {
				const response = await store.collection(collectionName)
					.where({ userId, subjectId })
					.remove()
				deletedByCollection[collectionName] = removedCount(response)
			}
			return {
				cleared: true,
				subjectId,
				deletedRecords: Object.keys(deletedByCollection)
					.reduce((total, name) => total + deletedByCollection[name], 0),
				deletedByCollection
			}
		})
	}

	async function loadStateAggregates(userId, subjectId, currentTime, targetStore) {
		const store = targetStore || db
		const todayKey = chinaDayKey(currentTime)
		const saved = await getDocument(store, STATS_COLLECTION, statsDocumentId(userId, subjectId))
		const stats = normalizeStats(saved, userId, subjectId, currentTime, todayKey)
		if (saved && stats.stateAggregateVersion === 7) return stats

		// Existing users are backfilled once. Later snapshots read these bounded
		// maps from the stats document instead of returning every answered state.
		const response = await store.collection(STATE_COLLECTION)
			.where({ userId, subjectId })
			.field({ questionId: true, attempted: true, favorite: true, chapterId: true, section: true, knowledge: true, practiceModes: true, lastCorrect: true })
			.limit(MAX_STATE_ROWS + 1)
			.get()
		const rows = getRows(response)
		if (rows.length > MAX_STATE_ROWS) {
			throw new QuestionBankUserError('QUESTION_BANK_USER_STATE_LIMIT', '用户题目状态超过处理上限')
		}
		stats.chapterAttempts = []
		stats.sectionAttempts = []
		stats.knowledgeAttempts = []
		stats.answeredQuestionIds = []
		stats.wrongQuestionIds = []
		stats.favoriteQuestionIds = []
		const questionScopes = new Map()
		const missingScopeQuestionIds = Array.from(new Set(rows.filter(item => {
			const modes = normalizePracticeModes(item.practiceModes)
			return !item.section
				&& Boolean(item.questionId)
				&& (modes.indexOf('chapter') > -1 || modes.indexOf('section') > -1)
		}).map(item => item.questionId)))
		if (missingScopeQuestionIds.length) {
			const catalog = await loadCatalog(store, subjectId)
			for (let offset = 0; offset < missingScopeQuestionIds.length; offset += MAX_SNAPSHOT_QUESTION_IDS) {
				const questionIds = missingScopeQuestionIds.slice(offset, offset + MAX_SNAPSHOT_QUESTION_IDS)
				const questionResponse = await store.collection(QUESTION_COLLECTION)
					.where({
						subjectId,
						version: catalog.activeVersion,
						status: 1,
						questionId: db.command.in(questionIds)
					})
					.field({ questionId: true, chapterId: true, section: true })
					.limit(questionIds.length)
					.get()
				getRows(questionResponse).forEach(question => {
					questionScopes.set(question.questionId, question)
				})
			}
		}
		rows.forEach(item => {
			if (item.favorite) addUniqueId(stats.favoriteQuestionIds, item.questionId)
			if (!item.attempted) return
			addUniqueId(stats.answeredQuestionIds, item.questionId)
			if (item.lastCorrect === false) addUniqueId(stats.wrongQuestionIds, item.questionId)
			const modes = normalizePracticeModes(item.practiceModes)
			const isChapterScopePractice = modes.indexOf('chapter') > -1
				|| modes.indexOf('section') > -1
			if (isChapterScopePractice) {
				const questionScope = questionScopes.get(item.questionId) || {}
				const chapterId = item.chapterId || questionScope.chapterId
				const section = item.section || questionScope.section
				incrementAggregate(stats.chapterAttempts, chapterId)
				incrementAggregate(stats.sectionAttempts, sectionScopeKey(chapterId, section))
			}
			if (modes.indexOf('knowledge') > -1) {
				incrementAggregate(stats.knowledgeAttempts, knowledgeScopeKey(item.chapterId, item.knowledge))
			}
		})
		stats.stateAggregateVersion = 7
		stats.updatedAt = serverDate()
		await setDocument(store, STATS_COLLECTION, stats._id, stats)
		return stats
	}

	async function getStateSnapshot(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const questionIds = readQuestionIds(
			event.questionIds,
			'questionIds',
			MAX_SNAPSHOT_QUESTION_IDS
		)
		const includeAggregates = event.includeAggregates !== false
		const includeProgress = event.includeProgress !== false
		const currentTime = now()
		const statePromise = questionIds.length
			? db.collection(STATE_COLLECTION)
				.where({ userId, subjectId, questionId: db.command.in(questionIds) })
				.field({
					questionId: true,
					attempted: true,
					lastSelected: true,
					lastCorrect: true,
					lastAnsweredAt: true,
					favorite: true,
					favoriteUpdatedAt: true
				})
				.limit(questionIds.length)
				.get()
			: Promise.resolve({ data: [] })
		const progressPromise = includeProgress
			? db.collection(PROGRESS_COLLECTION)
				.where({ userId, subjectId, mode: 'knowledge' })
				.field({
					mode: true,
					scopeKey: true,
					chapterId: true,
					section: true,
					knowledge: true,
					questionId: true,
					progressAt: true
				})
				.limit(MAX_PROGRESS_ROWS + 1)
				.get()
			: Promise.resolve({ data: [] })
		const aggregatePromise = includeAggregates
			? loadStateAggregates(userId, subjectId, currentTime)
			: Promise.resolve(null)
		const roundPromise = includeAggregates || includeProgress
			? db.collection(PRACTICE_ROUND_COLLECTION)
				.where({ userId, subjectId })
				.field({
					_id: true,
					chapterId: true,
					chapterAttemptCount: true,
					sectionAttemptCounts: true,
					chapterPosition: true,
					sectionPositions: true
				})
				.limit(MAX_PRACTICE_ROUND_ROWS + 1)
				.get()
			: Promise.resolve({ data: [] })
		const responses = await Promise.all([
			statePromise,
			progressPromise,
			aggregatePromise,
			roundPromise
		])
		const rows = getRows(responses[0])
		const progressRows = getRows(responses[1])
		const stats = responses[2]
		let roundRows = getRows(responses[3])
		if (progressRows.length > MAX_PROGRESS_ROWS) {
			throw new QuestionBankUserError('QUESTION_BANK_USER_PROGRESS_LIMIT', '用户练习进度超过处理上限')
		}
		if (roundRows.length > MAX_PRACTICE_ROUND_ROWS) {
			throw new QuestionBankUserError('QUESTION_BANK_USER_ROUND_LIMIT', '用户章节练习轮次超过处理上限')
		}
		const legacyRoundIds = roundRows.filter(round => (
			!Number.isInteger(round.chapterAttemptCount)
			|| !Array.isArray(round.sectionAttemptCounts)
		)).map(round => round._id).filter(Boolean)
		if (legacyRoundIds.length) {
			const backfilled = new Map()
			for (let offset = 0; offset < legacyRoundIds.length; offset += MAX_SNAPSHOT_QUESTION_IDS) {
				const ids = legacyRoundIds.slice(offset, offset + MAX_SNAPSHOT_QUESTION_IDS)
				const response = await db.collection(PRACTICE_ROUND_COLLECTION)
					.where({ _id: db.command.in(ids) })
					.limit(ids.length)
					.get()
				for (const savedRound of getRows(response)) {
					const normalized = normalizePracticeRound(
						savedRound,
						userId,
						subjectId,
						savedRound.chapterId,
						currentTime
					)
					await setDocument(db, PRACTICE_ROUND_COLLECTION, normalized._id, normalized)
					backfilled.set(normalized._id, normalized)
				}
			}
			roundRows = roundRows.map(round => backfilled.get(round._id) || round)
		}
		const answeredRows = rows.filter(item => item.attempted)
			.sort((left, right) => getDateValue(right.lastAnsweredAt) - getDateValue(left.lastAnsweredAt))
		const wrongRows = answeredRows.filter(item => item.lastCorrect === false)
		const favoriteRows = rows.filter(item => item.favorite)
			.sort((left, right) => getDateValue(right.favoriteUpdatedAt) - getDateValue(left.favoriteUpdatedAt))
		const chapterAttempts = {}
		const sectionAttempts = {}
		const knowledgeAttempts = stats
			? addLegacyKnowledgeAliases(aggregateEntriesToObject(stats.knowledgeAttempts))
			: {}
		const answerSelections = {}
		const progressPositions = { chapter: {}, section: {}, knowledge: {} }
		roundRows.forEach(savedRound => {
			const round = savedRound
			const chapterId = String(round.chapterId)
			if (includeAggregates) {
				chapterAttempts[chapterId] = Math.max(0, Number(round.chapterAttemptCount) || 0)
				;(Array.isArray(round.sectionAttemptCounts) ? round.sectionAttemptCounts : [])
					.forEach(item => {
						const scopeKey = sectionScopeKey(chapterId, item && item.section)
						if (scopeKey) sectionAttempts[scopeKey] = Math.max(0, Number(item.count) || 0)
					})
			}
			if (includeProgress && round.chapterPosition && round.chapterPosition.questionId) {
				progressPositions.chapter[chapterId] = round.chapterPosition.questionId
			}
			if (includeProgress) {
				round.sectionPositions.forEach(position => {
					const scopeKey = sectionScopeKey(chapterId, position.section)
					if (scopeKey && position.questionId) {
						progressPositions.section[scopeKey] = position.questionId
					}
				})
			}
		})
		answeredRows.forEach(item => {
			if (Array.isArray(item.lastSelected) && item.lastSelected.length) {
				answerSelections[item.questionId] = item.lastSelected
			}
		})
		progressRows
			.sort((left, right) => getDateValue(left.progressAt) - getDateValue(right.progressAt))
			.forEach(item => {
				if (item.mode === 'section' && item.section && item.questionId) {
					const scopeKey = sectionScopeKey(item.chapterId, item.section)
					if (scopeKey) progressPositions.section[scopeKey] = item.questionId
					return
				}
				if (item.mode === 'knowledge' && item.knowledge && item.questionId) {
					const scopeKey = knowledgeScopeKey(item.chapterId, item.knowledge)
					if (scopeKey) progressPositions.knowledge[scopeKey] = item.questionId
					progressPositions.knowledge[item.knowledge] = item.questionId
					return
				}
				if ((!item.mode || item.mode === 'chapter') && item.chapterId && item.questionId) {
					progressPositions.chapter[item.chapterId] = item.questionId
				}
			})
		return {
			subjectId,
			answeredQuestionIds: answeredRows.map(item => item.questionId),
			answerSelections,
			wrongQuestionIds: wrongRows.map(item => item.questionId),
			favoriteQuestionIds: favoriteRows.map(item => item.questionId),
			chapterAttempts,
			sectionAttempts,
			knowledgeAttempts,
			progressPositions
		}
	}

	async function getProgress(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const mode = readString(event.mode, 'mode', { required: true, values: PROGRESS_MODES })
		const chapterId = readString(event.chapterId, 'chapterId', {
			required: true,
			maxLength: 32
		})
		const knowledge = readString(event.knowledge, 'knowledge', {
			required: mode === 'knowledge',
			maxLength: 128
		})
		const section = readString(event.section, 'section', {
			required: mode === 'section',
			maxLength: 128
		})
		const scopeKey = mode === 'chapter'
			? chapterId
			: (mode === 'section'
				? sectionScopeKey(chapterId, section)
				: knowledgeScopeKey(chapterId, knowledge))
		if (mode === 'chapter' || mode === 'section') {
			const savedRound = await getDocument(
				db,
				PRACTICE_ROUND_COLLECTION,
				practiceRoundDocumentId(userId, subjectId, chapterId)
			)
			if (!savedRound) return null
			const round = normalizePracticeRound(savedRound, userId, subjectId, chapterId, now())
			const position = mode === 'section'
				? round.sectionPositions.find(item => item.section === section) || null
				: round.chapterPosition
			if (!position || !position.questionId) return null
			const catalog = await loadCatalog(db, subjectId)
			const response = await db.collection(QUESTION_COLLECTION)
				.where({
					subjectId,
					version: catalog.activeVersion,
					status: 1,
					questionId: position.questionId,
					chapterId,
					...(mode === 'section' ? { section } : {})
				})
				.field({ questionId: true })
				.limit(1)
				.get()
			if (!getRows(response).length) return null
			return {
				subjectId,
				mode,
				chapterId,
				section: mode === 'section' ? section : '',
				knowledge: '',
				questionId: position.questionId,
				progressAt: getDateValue(position.progressAt)
			}
		}
		let saved = await getDocument(
			db,
			PROGRESS_COLLECTION,
			progressDocumentId(userId, subjectId, mode, scopeKey)
		)
		if (!saved && mode === 'knowledge') {
			saved = await getDocument(
				db,
				PROGRESS_COLLECTION,
				progressDocumentId(userId, subjectId, mode, knowledge)
			)
		}
		if (!saved) return null
		const catalog = await loadCatalog(db, subjectId)
		const response = await db.collection(QUESTION_COLLECTION)
			.where({
				subjectId,
				version: catalog.activeVersion,
				status: 1,
				questionId: saved.questionId,
				chapterId,
				...(mode === 'section' ? { section } : {}),
				...(mode === 'knowledge' ? { knowledge } : {})
			})
			.field({ questionId: true })
			.limit(1)
			.get()
		if (!getRows(response).length) return null
		return {
			subjectId,
			mode,
			chapterId,
			section: mode === 'section' ? section : '',
			knowledge: mode === 'knowledge' ? knowledge : '',
			questionId: saved.questionId,
			progressAt: getDateValue(saved.progressAt)
		}
	}

	async function getPracticeRound(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const chapterId = readString(event.chapterId, 'chapterId', {
			required: true,
			maxLength: 32
		})
		const section = readString(event.section, 'section', { maxLength: 128 })
		const saved = await getDocument(
			db,
			PRACTICE_ROUND_COLLECTION,
			practiceRoundDocumentId(userId, subjectId, chapterId)
		)
		const round = normalizePracticeRound(saved, userId, subjectId, chapterId, now())
		return practiceRoundResponse(round, section)
	}

	async function getExamDraft(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const scope = Object.assign({ subjectId }, readExamEventScope(event, 'request'))
		const saved = await getDocument(
			db,
			EXAM_DRAFT_COLLECTION,
			examDraftDocumentId(userId, subjectId, scope.scopeKey)
		)
		return examDraftResponse(normalizeExamDraft(saved, userId, scope, now()))
	}

	async function getExamDraftSummaries(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const response = await db.collection(EXAM_DRAFT_COLLECTION)
			.where({ userId, subjectId, active: true })
			.limit(MAX_EXAM_DRAFT_ROWS + 1)
			.get()
		const rows = getRows(response)
		if (rows.length > MAX_EXAM_DRAFT_ROWS) {
			throw new QuestionBankUserError('QUESTION_BANK_USER_EXAM_DRAFT_LIMIT', '考试草稿数量超过处理上限')
		}
		const summaries = {}
		rows.forEach(saved => {
			const scope = {
				subjectId,
				mode: saved.mode,
				scopeKey: saved.scopeKey,
				chapterId: saved.chapterId || '',
				section: saved.section || '',
				knowledge: saved.knowledge || '',
				keyword: saved.keyword || ''
			}
			const draft = normalizeExamDraft(saved, userId, scope, now())
			if (!draft.active) return
			const latestAnswerAt = draft.answers.reduce((latest, answer) => (
				Math.max(latest, getDateValue(answer.updatedAt))
			), 0)
			summaries[draft.scopeKey] = {
				subjectId,
				mode: draft.mode,
				scopeKey: draft.scopeKey,
				chapterId: draft.chapterId || '',
				section: draft.section || '',
				knowledge: draft.knowledge || '',
				keyword: draft.keyword || '',
				roundId: draft.roundId,
				answered: draft.answers.length,
				total: draft.questionIds.length,
				initialQuestionId: draft.initialQuestionId || draft.questionIds[0] || '',
				positionQuestionId: draft.positionQuestionId || '',
				updatedAt: Math.max(
					getDateValue(draft.stateAt),
					getDateValue(draft.positionAt),
					latestAnswerAt
				),
				hasProgress: draft.answers.length > 0 || Boolean(
					draft.positionQuestionId
					&& draft.initialQuestionId
					&& draft.positionQuestionId !== draft.initialQuestionId
				)
			}
		})
		return { subjectId, summaries }
	}

	async function getPracticeBootstrap(event, userId, membership) {
		const subjectId = readSubjectId(event.subjectId)
		const mode = readString(event.mode, 'mode', {
			required: true,
			values: PRACTICE_ENTRY_MODES
		})
		const questionIds = readQuestionIds(
			event.questionIds,
			'questionIds',
			MAX_SNAPSHOT_QUESTION_IDS
		)
		const preferences = await getPreferences(event, userId)
		const snapshotPromise = getStateSnapshot({
			subjectId,
			questionIds,
			includeAggregates: false,
			includeProgress: false
		}, userId)
		let sessionPromise = Promise.resolve(null)
		let sessionType = ''
		if (preferences.answerMode === 'practice' && ['chapter', 'section'].indexOf(mode) > -1) {
			sessionType = 'practiceRound'
			sessionPromise = getPracticeRound({
				subjectId,
				chapterId: event.chapterId,
				section: mode === 'section' ? event.section : ''
			}, userId)
		} else if (preferences.answerMode === 'exam' && mode !== 'smart') {
			sessionType = 'examDraft'
			sessionPromise = getExamDraft(Object.assign({}, event, { subjectId, mode }), userId)
		}
		const [snapshot, session] = await Promise.all([snapshotPromise, sessionPromise])
		return {
			subjectId,
			mode,
			membership: membershipResponse(membership),
			preferences,
			snapshot,
			practiceRound: sessionType === 'practiceRound' ? session : null,
			examDraft: sessionType === 'examDraft' ? session : null
		}
	}

	async function getSmartPractice(event, userId, membership) {
		let smartPractice
		try { smartPractice = validateSmartPractice(event.smartPractice) }
		catch (error) { invalidArgument(error.message) }
		const subjectId = readSubjectId(event.subjectId)
		const pageSize = readInteger(event.pageSize, 'pageSize', {
			defaultValue: DEFAULT_PAGE_SIZE,
			minimum: 1,
			maximum: MAX_PAGE_SIZE
		})
		const preferencesPromise = getPreferences(event, userId)
		const catalog = await loadCatalog(db, subjectId)
		const questionCount = Math.max(0, Number(catalog.questionCount) || 0)
		if (!questionCount) {
			return {
				subjectId,
				version: catalog.activeVersion,
				total: 0,
				pageSize,
				requestedQuestionCount: pageSize,
				actualQuestionCount: 0,
				overflowQuestionCount: 0,
				stateCounts: { fresh: 0, wrong: 0, mastered: 0, sampled: 0 },
				favoriteQuestionIds: [],
				membership: membershipResponse(membership),
				preferences: await preferencesPromise,
				items: []
			}
		}
		const seed = readString(event.seed, 'seed', {
			defaultValue: `${subjectId}:${catalog.activeVersion}:${now().toISOString().slice(0, 10)}`,
			maxLength: 128
		})
		const random = createRandom(hashSeed(seed))
		const indexedUnits = Array.isArray(catalog.smartPracticeUnits)
			&& catalog.smartPracticeUnits.length
			? catalog.smartPracticeUnits
			: null
		const references = indexedUnits ? null : await loadSmartQuestionReferences(db, catalog)
		const stats = await loadStateAggregates(userId, subjectId, now())
		const answeredIds = new Set(stats.answeredQuestionIds)
		const wrongIds = new Set(stats.wrongQuestionIds)
		let units
		try { units = indexedUnits || buildSmartPracticeUnits(references) }
		catch (error) {
			throw new QuestionBankUserError(
				'QUESTION_BANK_INVALID_QUESTION_SCHEMA',
				error && error.message || '材料题分组结构无效'
			)
		}
		if (!indexedUnits && units.length) {
			const catalogDocument = db.collection(CATALOG_COLLECTION).doc(catalog._id || catalog.subjectId)
			if (catalogDocument && typeof catalogDocument.update === 'function') {
				try { await catalogDocument.update({ smartPracticeUnits: units }) }
				catch (error) {
					// Index backfill failure must not block this smart-practice request.
				}
			}
		}
		const groups = classifySmartPracticeUnits(units, answeredIds, wrongIds)
		const selection = selectSmartPracticeUnits(groups, pageSize, smartPractice, random)
		const documents = await loadFullQuestionsByIds(db, catalog, selection.questionIds)
		if (documents.length !== selection.questionIds.length) {
			throw new QuestionBankUserError(
				'QUESTION_BANK_INVALID_QUESTION_SCHEMA',
				'智能练习材料组存在缺失的启用子题'
			)
		}
		const stateQuestionCount = key => groups[key].reduce(
			(total, unit) => total + unit.questionCount,
			0
		)
		return {
			subjectId,
			version: catalog.activeVersion,
			seed,
			total: questionCount,
			pageSize,
			requestedQuestionCount: selection.requestedQuestionCount,
			actualQuestionCount: documents.length,
			overflowQuestionCount: Math.max(0, documents.length - selection.requestedQuestionCount),
			stateCounts: {
				fresh: stateQuestionCount('fresh'),
				wrong: stateQuestionCount('wrong'),
				mastered: stateQuestionCount('mastered'),
				sampled: questionCount
			},
			favoriteQuestionIds: selection.questionIds.filter(questionId => (
				stats.favoriteQuestionIds.indexOf(questionId) > -1
			)),
			membership: membershipResponse(membership),
			preferences: await preferencesPromise,
			items: documents.map(toPublicQuestion)
		}
	}

	async function getSmartPracticeState(event, userId, membership) {
		const subjectId = readSubjectId(event.subjectId)
		const [stats, preferences] = await Promise.all([
			loadStateAggregates(userId, subjectId, now()),
			getPreferences(event, userId)
		])
		return {
			subjectId,
			answeredQuestionIds: stats.answeredQuestionIds.slice(),
			wrongQuestionIds: stats.wrongQuestionIds.slice(),
			favoriteQuestionIds: stats.favoriteQuestionIds.slice(),
			membership: membershipResponse(membership),
			preferences
		}
	}

	async function getRecords(event, userId, membership) {
		const subjectId = readSubjectId(event.subjectId)
		const type = readString(event.type, 'type', {
			defaultValue: 'wrong',
			values: RECORD_TYPES
		})
		const idsOnly = event.idsOnly === true
		const page = readInteger(event.page, 'page', {
			defaultValue: 1,
			minimum: 1,
			maximum: 100
		})
		const pageSize = idsOnly ? MAX_STATE_ROWS : readInteger(event.pageSize, 'pageSize', {
			defaultValue: DEFAULT_PAGE_SIZE,
			minimum: 1,
			maximum: MAX_PAGE_SIZE
		})
		const condition = recordTypeCondition(userId, subjectId, type)
		const collection = db.collection(STATE_COLLECTION)
		const responses = await Promise.all([
			page === 1
				? getDocument(db, STATS_COLLECTION, statsDocumentId(userId, subjectId))
				: Promise.resolve(null),
			collection.where(condition)
				.field({
					questionId: true,
					lastCorrect: true,
					lastAnsweredAt: true,
					favorite: true,
					favoriteUpdatedAt: true
				})
				.orderBy(recordSortField(type), 'desc')
				.skip(idsOnly ? 0 : (page - 1) * pageSize)
				.limit(pageSize + 1)
				.get()
		])
		let total = responses[0]
			? Math.max(0, Number(responses[0][type === 'favorite' ? 'favorite' : 'wrong']) || 0)
			: (page === 1 ? 0 : null)
		const rows = getRows(responses[1])
		const hasMore = rows.length > pageSize
		const states = hasMore ? rows.slice(0, pageSize) : rows
		if (idsOnly) {
			const currentTime = now()
			const cachedStats = responses[0] && responses[0].stateAggregateVersion === 7
				? normalizeStats(responses[0], userId, subjectId, currentTime, chinaDayKey(currentTime))
				: null
			const [stats, preferences] = await Promise.all([
				cachedStats || loadStateAggregates(userId, subjectId, currentTime),
				getPreferences(event, userId)
			])
			total = Math.max(0, Number(stats[type === 'favorite' ? 'favorite' : 'wrong']) || 0)
			return {
				subjectId,
				type,
				total,
				hasMore,
				questionIds: states.map(state => state.questionId),
				favoriteQuestionIds: states.filter(state => state.favorite)
					.map(state => state.questionId),
				membership: membershipResponse(membership),
				preferences
			}
		}
		const questionMap = await loadQuestionSummaries(db, subjectId, states.map(item => item.questionId))
		const items = states.map(state => {
			const question = questionMap.get(state.questionId)
			if (!question) return null
			return {
				recordId: `${type}-${state.questionId}`,
				question,
				correct: Boolean(state.lastCorrect),
				timestamp: getDateValue(type === 'favorite' ? state.favoriteUpdatedAt : state.lastAnsweredAt)
			}
		}).filter(Boolean)
		return {
			subjectId,
			type,
			page,
			pageSize,
			total,
			hasMore,
			items
		}
	}

	const handlers = {
		syncEvents,
		getSummary,
		getStateSnapshot,
		getProgress,
		getPracticeRound,
		getExamDraft,
		getExamDraftSummaries,
		getPracticeBootstrap,
		getSmartPractice,
		getSmartPracticeState,
		getRecords,
		getUserProfile,
		getPreferences,
		updatePreferences,
		clearCurrentSubjectData
	}

	async function execute(rawEvent, userId) {
		const event = requireObject(rawEvent, '请求参数')
		const uid = readString(userId, 'userId', { required: true, maxLength: 64 })
		const action = readString(event.action, 'action', { required: true, maxLength: 64 })
		const handler = handlers[action]
		if (!handler) {
			throw new QuestionBankUserError('QUESTION_BANK_USER_UNSUPPORTED_ACTION', `不支持的action: ${action}`)
		}
		let membership = null
		if (MEMBER_SYNC_ACTIONS.has(action)) {
			membership = await requireActiveMembership(db, uid, now(), '云端学习数据同步')
		}
		return handler(event, uid, membership)
	}

	return { execute }
}

module.exports = {
	QuestionBankUserError,
	createQuestionBankUserService,
	chinaDayKey,
	examDraftDocumentId,
	examDraftScopeKey,
	stateDocumentId,
	progressDocumentId,
	practiceRoundDocumentId,
	statsDocumentId
}
