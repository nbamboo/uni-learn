'use strict'

const crypto = require('crypto')

const CATALOG_COLLECTION = 'question_bank_catalogs'
const QUESTION_COLLECTION = 'question_bank_questions'
const USER_COLLECTION = 'uni-id-users'
const STATE_COLLECTION = 'question_bank_user_states'
const STATS_COLLECTION = 'question_bank_user_stats'
const PROGRESS_COLLECTION = 'question_bank_user_progress'
const PREFERENCES_COLLECTION = 'question_bank_user_preferences'
const MEMBERSHIP_COLLECTION = 'question_bank_memberships'
const MAX_SYNC_EVENTS = 50
const MAX_STATE_ROWS = 2000
const MAX_PROGRESS_ROWS = 500
const MAX_SNAPSHOT_QUESTION_IDS = 100
const MAX_SMART_CANDIDATES = 100
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const SUBJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const QUESTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EVENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ANSWER_ALIASES = ['A', 'B', 'C', 'D', 'E', 'F']
const RECORD_TYPES = ['wrong', 'favorite']
const PROGRESS_MODES = ['chapter', 'knowledge']
const ANSWER_MODES = ['exam', 'practice', 'review']
const PRACTICE_ENTRY_MODES = ['smart', 'chapter', 'knowledge', 'wrong', 'favorite', 'search', 'sequence']
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000
const MIN_EVENT_TIME = new Date('2020-01-01T00:00:00.000Z').getTime()
const MAX_FUTURE_TIME = 5 * 60 * 1000

class QuestionBankUserError extends Error {
	constructor(errCode, errMsg) {
		super(errMsg)
		this.name = 'QuestionBankUserError'
		this.errCode = errCode
	}
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

function getTotal(response) {
	const total = Number(response && response.total)
	return Number.isFinite(total) ? total : 0
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

function defaultPreferences() {
	return {
		answerMode: 'practice',
		nightMode: false,
		updatedAt: 0
	}
}

async function requireActiveMembership(store, userId, currentTime, featureName) {
	const saved = await getDocument(store, MEMBERSHIP_COLLECTION, userId)
	const expiresAt = getDateValue(saved && saved.expiresAt)
	if (!saved || saved.status === 'revoked' || expiresAt <= currentTime.getTime()) {
		throw new QuestionBankUserError(
			'QUESTION_BANK_MEMBERSHIP_REQUIRED',
			`${featureName || '该功能'}为会员权益，请先开通会员`
		)
	}
	return saved
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

function aggregateEntriesToObject(entries) {
	const result = {}
	entries.forEach(item => {
		if (item && item.key) result[item.key] = Number(item.count) || 0
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
		knowledgeAttempts: [],
		stateAggregateVersion: 2,
		createdAt: timestamp,
		updatedAt: timestamp
	}
}

function normalizeStats(stats, userId, subjectId, timestamp, todayKey) {
	const result = stats || emptyStats(userId, subjectId, timestamp, todayKey)
	result.chapterAttempts = normalizeAggregateEntries(result.chapterAttempts)
	result.knowledgeAttempts = normalizeAggregateEntries(result.knowledgeAttempts)
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

function shuffle(list, random) {
	const result = list.slice()
	for (let index = result.length - 1; index > 0; index -= 1) {
		const target = Math.floor(random() * (index + 1))
		const current = result[index]
		result[index] = result[target]
		result[target] = current
	}
	return result
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
	getRows(response).forEach(question => byId.set(question.questionId, question))
	return questionIds.map(questionId => byId.get(questionId)).filter(Boolean)
}

function readSyncEvent(rawEvent, currentTime, index) {
	const event = requireObject(rawEvent, `events[${index}]`)
	const type = readString(event.type, `events[${index}].type`, {
		required: true,
		values: ['answer', 'favorite']
	})
	const result = {
		type,
		eventId: readEventId(event.eventId),
		subjectId: readSubjectId(event.subjectId),
		questionId: readQuestionId(event.questionId),
		occurredAt: readOccurredAt(event.occurredAt, currentTime),
		originalIndex: index
	}
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
	return {
		progressId: readEventId(progress.progressId),
		subjectId: readSubjectId(progress.subjectId),
		mode,
		scopeKey: mode === 'chapter' ? chapterId : knowledge,
		chapterId,
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
	return catalog
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
				knowledge: true,
				answer: true
			})
			.limit(questionIds.length)
			.get()
		getRows(response).forEach(question => {
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
			title: true,
			sortOrder: true
		})
		.limit(questionIds.length)
		.get()
	const result = new Map()
	getRows(response).forEach(question => {
		result.set(question.questionId, Object.assign({}, question, {
			id: question.questionId
		}))
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
		let events = rawEvents.map((item, index) => readSyncEvent(item, currentTime, index))
		let rejectedEventIds = []
		if (events.some(item => item.type === 'favorite')) {
			try {
				await requireActiveMembership(db, userId, currentTime, '收藏夹')
			} catch (error) {
				if (error && error.errCode !== 'QUESTION_BANK_MEMBERSHIP_REQUIRED') throw error
				rejectedEventIds = events.filter(item => item.type === 'favorite').map(item => item.eventId)
				events = events.filter(item => item.type !== 'favorite')
			}
		}
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
					const saved = await getDocument(store, STATS_COLLECTION, id)
					const stats = normalizeStats(saved, userId, subjectId, currentTime, todayKey)
					if (stats.stateAggregateVersion !== 2) {
						stats.chapterAttempts = []
						stats.knowledgeAttempts = []
						stats.stateAggregateVersion = 2
					}
					statsCache.set(id, stats)
				}
				return statsCache.get(id)
			}

			for (const item of events) {
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
					const wasChapterPractice = state.practiceModes.indexOf('chapter') > -1
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
						stats.attempted += 1
						if (correct) stats.correct += 1
						else stats.wrong += 1
					} else if (wasCorrect !== correct) {
						if (correct) {
							stats.correct += 1
							stats.wrong = Math.max(0, stats.wrong - 1)
						} else {
							stats.wrong += 1
							stats.correct = Math.max(0, stats.correct - 1)
						}
					}
					if (!wasChapterPractice && state.practiceModes.indexOf('chapter') > -1) {
						incrementAggregate(stats.chapterAttempts, state.chapterId)
					}
					if (!wasKnowledgePractice && state.practiceModes.indexOf('knowledge') > -1) {
						incrementAggregate(stats.knowledgeAttempts, state.knowledge)
					}
					stats.totalAttempts += 1
					if (chinaDayKey(item.occurredAt) === todayKey) stats.todayAttempts += 1
					stats.updatedAt = serverDate()

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
						stats.favorite = Math.max(0, stats.favorite + (item.favorite ? 1 : -1))
						stats.updatedAt = serverDate()
					}
				}
				acceptedEventIds.push(item.eventId)
			}

			let progressResult = null
			if (progress) {
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
					await setDocument(store, PROGRESS_COLLECTION, id, progressDocument)
				}
				progressResult = {
					progressId: progress.progressId,
					saved: true
				}
			}

			const summarySubjectIds = Array.from(new Set(events.map(item => item.subjectId)))
			for (const subjectId of summarySubjectIds) await getStats(subjectId)

			for (const state of stateCache.values()) {
				await setDocument(store, STATE_COLLECTION, state._id, state)
			}
			for (const stats of statsCache.values()) {
				await setDocument(store, STATS_COLLECTION, stats._id, stats)
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
		let answerMode = ANSWER_MODES.indexOf(saved.answerMode) > -1
			? saved.answerMode
			: 'practice'
		if (answerMode === 'exam' || answerMode === 'review') {
			try {
				await requireActiveMembership(db, userId, now(), '考试模式和背题模式')
			} catch (error) {
				if (error && error.errCode !== 'QUESTION_BANK_MEMBERSHIP_REQUIRED') throw error
				answerMode = 'practice'
			}
		}
		return {
			answerMode,
			nightMode: Boolean(saved.nightMode),
			updatedAt: getDateValue(saved.updatedAt)
		}
	}

	async function updatePreferences(event, userId) {
		const answerMode = readString(event.answerMode, 'answerMode', {
			required: true,
			values: ANSWER_MODES
		})
		const nightMode = readBoolean(event.nightMode, 'nightMode')
		const currentTime = now()
		if (answerMode === 'exam' || answerMode === 'review') {
			await requireActiveMembership(db, userId, currentTime, '考试模式和背题模式')
		}
		const saved = await getDocument(db, PREFERENCES_COLLECTION, userId)
		await setDocument(db, PREFERENCES_COLLECTION, userId, {
			_id: userId,
			userId,
			answerMode,
			nightMode,
			createdAt: saved && saved.createdAt || serverDate(),
			updatedAt: serverDate()
		})
		return {
			answerMode,
			nightMode,
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
				PROGRESS_COLLECTION
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

	async function loadStateAggregates(userId, subjectId, currentTime) {
		const todayKey = chinaDayKey(currentTime)
		const saved = await getDocument(db, STATS_COLLECTION, statsDocumentId(userId, subjectId))
		const stats = normalizeStats(saved, userId, subjectId, currentTime, todayKey)
		if (saved && stats.stateAggregateVersion === 2) return stats

		// Existing users are backfilled once. Later snapshots read these bounded
		// maps from the stats document instead of returning every answered state.
		const response = await db.collection(STATE_COLLECTION)
			.where({ userId, subjectId, attempted: true })
			.field({ chapterId: true, knowledge: true, practiceModes: true })
			.limit(MAX_STATE_ROWS + 1)
			.get()
		const rows = getRows(response)
		if (rows.length > MAX_STATE_ROWS) {
			throw new QuestionBankUserError('QUESTION_BANK_USER_STATE_LIMIT', '用户题目状态超过处理上限')
		}
		stats.chapterAttempts = []
		stats.knowledgeAttempts = []
		rows.forEach(item => {
			const modes = normalizePracticeModes(item.practiceModes)
			if (modes.indexOf('chapter') > -1) incrementAggregate(stats.chapterAttempts, item.chapterId)
			if (modes.indexOf('knowledge') > -1) incrementAggregate(stats.knowledgeAttempts, item.knowledge)
		})
		stats.stateAggregateVersion = 2
		stats.updatedAt = serverDate()
		await setDocument(db, STATS_COLLECTION, stats._id, stats)
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
				.where({ userId, subjectId })
				.field({
					mode: true,
					scopeKey: true,
					chapterId: true,
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
		const responses = await Promise.all([statePromise, progressPromise, aggregatePromise])
		const rows = getRows(responses[0])
		const progressRows = getRows(responses[1])
		const stats = responses[2]
		if (progressRows.length > MAX_PROGRESS_ROWS) {
			throw new QuestionBankUserError('QUESTION_BANK_USER_PROGRESS_LIMIT', '用户练习进度超过处理上限')
		}
		const answeredRows = rows.filter(item => item.attempted)
			.sort((left, right) => getDateValue(right.lastAnsweredAt) - getDateValue(left.lastAnsweredAt))
		const wrongRows = answeredRows.filter(item => item.lastCorrect === false)
		const favoriteRows = rows.filter(item => item.favorite)
			.sort((left, right) => getDateValue(right.favoriteUpdatedAt) - getDateValue(left.favoriteUpdatedAt))
		const chapterAttempts = stats ? aggregateEntriesToObject(stats.chapterAttempts) : {}
		const knowledgeAttempts = stats ? aggregateEntriesToObject(stats.knowledgeAttempts) : {}
		const answerSelections = {}
		const progressPositions = { chapter: {}, knowledge: {} }
		answeredRows.forEach(item => {
			if (Array.isArray(item.lastSelected) && item.lastSelected.length) {
				answerSelections[item.questionId] = item.lastSelected
			}
		})
		progressRows
			.sort((left, right) => getDateValue(left.progressAt) - getDateValue(right.progressAt))
			.forEach(item => {
				if (item.mode === 'knowledge' && item.knowledge && item.questionId) {
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
		const scopeKey = mode === 'chapter' ? chapterId : knowledge
		const saved = await getDocument(
			db,
			PROGRESS_COLLECTION,
			progressDocumentId(userId, subjectId, mode, scopeKey)
		)
		if (!saved) return null
		const catalog = await loadCatalog(db, subjectId)
		const response = await db.collection(QUESTION_COLLECTION)
			.where({
				subjectId,
				version: catalog.activeVersion,
				status: 1,
				questionId: saved.questionId,
				chapterId,
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
			knowledge: mode === 'knowledge' ? knowledge : '',
			questionId: saved.questionId,
			progressAt: getDateValue(saved.progressAt)
		}
	}

	async function getSmartPractice(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const pageSize = readInteger(event.pageSize, 'pageSize', {
			defaultValue: DEFAULT_PAGE_SIZE,
			minimum: 1,
			maximum: MAX_PAGE_SIZE
		})
		const catalog = await loadCatalog(db, subjectId)
		const questionCount = Math.max(0, Number(catalog.questionCount) || 0)
		if (!questionCount) {
			return { subjectId, version: catalog.activeVersion, items: [], total: 0 }
		}
		const seed = readString(event.seed, 'seed', {
			defaultValue: `${subjectId}:${catalog.activeVersion}:${now().toISOString().slice(0, 10)}`,
			maxLength: 128
		})
		const random = createRandom(hashSeed(seed))
		const candidateCount = Math.min(
			questionCount,
			MAX_SMART_CANDIDATES,
			Math.max(pageSize * 4, Math.min(50, questionCount))
		)
		const sortOrders = new Set()
		while (sortOrders.size < candidateCount) {
			sortOrders.add(1 + Math.floor(random() * questionCount))
		}
		const candidateResponse = await db.collection(QUESTION_COLLECTION)
			.where({
				subjectId,
				version: catalog.activeVersion,
				status: 1,
				sortOrder: db.command.in(Array.from(sortOrders))
			})
			.field({ questionId: true, sortOrder: true })
			.limit(candidateCount)
			.get()
		const candidates = getRows(candidateResponse)
		const candidateIds = candidates.map(item => item.questionId)
		const stateResponse = candidateIds.length
			? await db.collection(STATE_COLLECTION)
				.where({ userId, subjectId, questionId: db.command.in(candidateIds) })
				.field({ questionId: true, attempted: true, lastCorrect: true })
				.limit(candidateIds.length)
				.get()
			: { data: [] }
		const stateById = new Map()
		getRows(stateResponse).forEach(state => stateById.set(state.questionId, state))
		const freshIds = []
		const masteredIds = []
		const sampledWrongIds = []
		candidateIds.forEach(questionId => {
			const state = stateById.get(questionId)
			if (!state || !state.attempted) freshIds.push(questionId)
			else if (state.lastCorrect === false) sampledWrongIds.push(questionId)
			else masteredIds.push(questionId)
		})

		const wrongResponse = await db.collection(STATE_COLLECTION)
			.where({ userId, subjectId, attempted: true, lastCorrect: false })
			.field({ questionId: true })
			.orderBy('lastAnsweredAt', 'desc')
			.limit(Math.min(MAX_SMART_CANDIDATES, pageSize * 2))
			.get()
		const recentWrongIds = getRows(wrongResponse).map(item => item.questionId)
		const orderedIds = shuffle(freshIds, random)
			.concat(shuffle(recentWrongIds.concat(sampledWrongIds), random), shuffle(masteredIds, random))
		const selectedIds = Array.from(new Set(orderedIds)).slice(0, pageSize)
		const documents = await loadFullQuestionsByIds(db, catalog, selectedIds)
		return {
			subjectId,
			version: catalog.activeVersion,
			seed,
			total: questionCount,
			stateCounts: {
				fresh: freshIds.length,
				wrong: recentWrongIds.length,
				mastered: masteredIds.length,
				sampled: candidates.length
			},
			items: documents.map(toPublicQuestion)
		}
	}

	async function getRecords(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const type = readString(event.type, 'type', {
			defaultValue: 'wrong',
			values: RECORD_TYPES
		})
		const page = readInteger(event.page, 'page', {
			defaultValue: 1,
			minimum: 1,
			maximum: 100
		})
		const pageSize = readInteger(event.pageSize, 'pageSize', {
			defaultValue: DEFAULT_PAGE_SIZE,
			minimum: 1,
			maximum: MAX_PAGE_SIZE
		})
		await requireActiveMembership(db, userId, now(), type === 'favorite' ? '收藏夹' : '错题集')
		const condition = recordTypeCondition(userId, subjectId, type)
		const collection = db.collection(STATE_COLLECTION)
		const responses = await Promise.all([
			page === 1 ? collection.where(condition).count() : Promise.resolve(null),
			collection.where(condition)
				.field({
					questionId: true,
					lastCorrect: true,
					lastAnsweredAt: true,
					favoriteUpdatedAt: true
				})
				.orderBy(recordSortField(type), 'desc')
				.skip((page - 1) * pageSize)
				.limit(pageSize + 1)
				.get()
		])
		const total = responses[0] ? getTotal(responses[0]) : null
		const rows = getRows(responses[1])
		const hasMore = rows.length > pageSize
		const states = hasMore ? rows.slice(0, pageSize) : rows
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
		getSmartPractice,
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
		return handler(event, uid)
	}

	return { execute }
}

module.exports = {
	QuestionBankUserError,
	createQuestionBankUserService,
	chinaDayKey,
	stateDocumentId,
	progressDocumentId,
	statsDocumentId
}
