'use strict'

const CATALOG_COLLECTION = 'question_bank_catalogs'
const QUESTION_COLLECTION = 'question_bank_questions'
const STATE_COLLECTION = 'question_bank_user_states'
const ATTEMPT_COLLECTION = 'question_bank_user_attempts'
const STATS_COLLECTION = 'question_bank_user_stats'
const MAX_SYNC_EVENTS = 50
const MAX_STATE_ROWS = 2000
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const SUBJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const QUESTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EVENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ANSWER_ALIASES = ['A', 'B', 'C', 'D', 'E', 'F']
const RECORD_TYPES = ['history', 'wrong', 'favorite']
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

function chinaDayKey(value) {
	const date = value instanceof Date ? value : new Date(value)
	return new Date(date.getTime() + CHINA_OFFSET_MS).toISOString().slice(0, 10)
}

function stateDocumentId(userId, subjectId, questionId) {
	return `${userId}|${subjectId}|${questionId}`
}

function attemptDocumentId(userId, eventId) {
	return `${userId}|${eventId}`
}

function statsDocumentId(userId, subjectId) {
	return `${userId}|${subjectId}`
}

function emptyState(userId, subjectId, questionId, timestamp) {
	return {
		_id: stateDocumentId(userId, subjectId, questionId),
		userId,
		subjectId,
		questionId,
		attempted: false,
		attempts: 0,
		favorite: false,
		createdAt: timestamp,
		updatedAt: timestamp
	}
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
		createdAt: timestamp,
		updatedAt: timestamp
	}
}

function normalizeStats(stats, userId, subjectId, timestamp, todayKey) {
	const result = stats || emptyStats(userId, subjectId, timestamp, todayKey)
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
	if (type === 'answer') result.selected = readSelected(event.selected)
	else {
		if (typeof event.favorite !== 'boolean') invalidArgument('favorite必须是布尔值')
		result.favorite = event.favorite
	}
	return result
}

async function getDocument(store, collectionName, documentId) {
	const response = await store.collection(collectionName).doc(documentId).get()
	return getRows(response)[0] || null
}

async function setDocument(store, collectionName, documentId, document) {
	return store.collection(collectionName).doc(documentId).set(document)
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
		if (!Array.isArray(event.events) || event.events.length === 0) {
			invalidArgument('events必须是非空数组')
		}
		if (event.events.length > MAX_SYNC_EVENTS) {
			invalidArgument(`events最多包含${MAX_SYNC_EVENTS}条记录`)
		}
		const currentTime = now()
		const events = event.events.map((item, index) => readSyncEvent(item, currentTime, index))
		events.sort((left, right) => {
			const timeDiff = left.occurredAt.getTime() - right.occurredAt.getTime()
			return timeDiff || left.originalIndex - right.originalIndex
		})
		const loaded = await loadQuestionsForEvents(db, events)
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
					stateCache.set(id, saved || emptyState(userId, subjectId, questionId, currentTime))
				}
				return stateCache.get(id)
			}

			async function getStats(subjectId) {
				const id = statsDocumentId(userId, subjectId)
				if (!statsCache.has(id)) {
					const saved = await getDocument(store, STATS_COLLECTION, id)
					statsCache.set(id, normalizeStats(saved, userId, subjectId, currentTime, todayKey))
				}
				return statsCache.get(id)
			}

			for (const item of events) {
				if (item.type === 'answer') {
					const attemptId = attemptDocumentId(userId, item.eventId)
					const duplicate = await getDocument(store, ATTEMPT_COLLECTION, attemptId)
					if (duplicate) {
						duplicateEventIds.push(item.eventId)
						answerResults.push({ eventId: item.eventId, correct: Boolean(duplicate.correct) })
						continue
					}
					const question = loaded.questions.get(`${item.subjectId}|${item.questionId}`)
					const correct = answerIsCorrect(item.selected, question.answer)
					const state = await getState(item.subjectId, item.questionId)
					const stats = await getStats(item.subjectId)
					const wasAttempted = Boolean(state.attempted)
					const wasCorrect = Boolean(state.lastCorrect)
					const latestTime = getDateValue(state.lastAnsweredAt)
					const isLatest = !latestTime || item.occurredAt.getTime() >= latestTime

					state.chapterId = question.chapterId
					state.knowledge = question.knowledge
					state.attempted = true
					state.attempts = (Number(state.attempts) || 0) + 1
					state.firstAnsweredAt = state.firstAnsweredAt || item.occurredAt
					if (isLatest) {
						state.lastCorrect = correct
						state.lastSelected = item.selected
						state.lastAnsweredAt = item.occurredAt
					}
					state.updatedAt = serverDate()

					if (!wasAttempted) {
						stats.attempted += 1
						if (correct) stats.correct += 1
						else stats.wrong += 1
					} else if (isLatest && wasCorrect !== correct) {
						if (correct) {
							stats.correct += 1
							stats.wrong = Math.max(0, stats.wrong - 1)
						} else {
							stats.wrong += 1
							stats.correct = Math.max(0, stats.correct - 1)
						}
					}
					stats.totalAttempts += 1
					if (chinaDayKey(item.occurredAt) === todayKey) stats.todayAttempts += 1
					stats.updatedAt = serverDate()

					await setDocument(store, ATTEMPT_COLLECTION, attemptId, {
						_id: attemptId,
						eventId: item.eventId,
						userId,
						subjectId: item.subjectId,
						questionId: item.questionId,
						selected: item.selected,
						correct,
						occurredAt: item.occurredAt,
						createdAt: serverDate()
					})
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

			for (const state of stateCache.values()) {
				await setDocument(store, STATE_COLLECTION, state._id, state)
			}
			for (const stats of statsCache.values()) {
				await setDocument(store, STATS_COLLECTION, stats._id, stats)
			}

			return {
				acceptedEventIds,
				duplicateEventIds,
				answerResults
			}
		})
	}

	async function getSummary(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const currentTime = now()
		const todayKey = chinaDayKey(currentTime)
		const saved = await getDocument(db, STATS_COLLECTION, statsDocumentId(userId, subjectId))
		const stats = normalizeStats(saved, userId, subjectId, currentTime, todayKey)
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

	async function getStateSnapshot(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const response = await db.collection(STATE_COLLECTION)
			.where({ userId, subjectId })
			.field({
				questionId: true,
				chapterId: true,
				knowledge: true,
				attempted: true,
				lastCorrect: true,
				lastAnsweredAt: true,
				favorite: true,
				favoriteUpdatedAt: true
			})
			.limit(MAX_STATE_ROWS + 1)
			.get()
		const rows = getRows(response)
		if (rows.length > MAX_STATE_ROWS) {
			throw new QuestionBankUserError('QUESTION_BANK_USER_STATE_LIMIT', '用户题目状态超过处理上限')
		}
		const answeredRows = rows.filter(item => item.attempted)
			.sort((left, right) => getDateValue(right.lastAnsweredAt) - getDateValue(left.lastAnsweredAt))
		const wrongRows = answeredRows.filter(item => item.lastCorrect === false)
		const favoriteRows = rows.filter(item => item.favorite)
			.sort((left, right) => getDateValue(right.favoriteUpdatedAt) - getDateValue(left.favoriteUpdatedAt))
		const chapterAttempts = {}
		const knowledgeAttempts = {}
		answeredRows.forEach(item => {
			if (item.chapterId) chapterAttempts[item.chapterId] = (chapterAttempts[item.chapterId] || 0) + 1
			if (item.knowledge) knowledgeAttempts[item.knowledge] = (knowledgeAttempts[item.knowledge] || 0) + 1
		})
		return {
			subjectId,
			answeredQuestionIds: answeredRows.map(item => item.questionId),
			wrongQuestionIds: wrongRows.map(item => item.questionId),
			favoriteQuestionIds: favoriteRows.map(item => item.questionId),
			chapterAttempts,
			knowledgeAttempts
		}
	}

	async function getRecords(event, userId) {
		const subjectId = readSubjectId(event.subjectId)
		const type = readString(event.type, 'type', {
			defaultValue: 'history',
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
		const condition = recordTypeCondition(userId, subjectId, type)
		const collection = db.collection(STATE_COLLECTION)
		const responses = await Promise.all([
			collection.where(condition).count(),
			collection.where(condition)
				.field({
					questionId: true,
					lastCorrect: true,
					lastAnsweredAt: true,
					favoriteUpdatedAt: true
				})
				.orderBy(recordSortField(type), 'desc')
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.get()
		])
		const total = getTotal(responses[0])
		const states = getRows(responses[1])
		const questionMap = await loadQuestionSummaries(db, subjectId, states.map(item => item.questionId))
		const items = states.map(state => {
			const question = questionMap.get(state.questionId)
			if (!question) return null
			return {
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
			hasMore: page * pageSize < total,
			items
		}
	}

	const handlers = { syncEvents, getSummary, getStateSnapshot, getRecords }

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
	attemptDocumentId,
	statsDocumentId
}
