'use strict'

const {
	validateSmartPractice,
	buildSmartPracticeUnits,
	classifySmartPracticeUnits,
	selectSmartPracticeUnits
} = require('./smart-practice.js')

const CATALOG_COLLECTION = 'question_bank_catalogs'
const QUESTION_COLLECTION = 'question_bank_questions'
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const MAX_QUESTION_IDS = 100
const MAX_STATE_IDS = 2000
const SMART_METADATA_PAGE_SIZE = 500
const MAX_CATALOG_SUMMARIES = 50
const QUESTION_SCHEMA_VERSION = 3
const SUBJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const QUESTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ANSWER_ALIASES = ['A', 'B', 'C', 'D', 'E', 'F']
const PRACTICE_MODES = ['sequence', 'chapter', 'section', 'knowledge', 'search', 'smart']
const QUESTION_SELECTION_MODES = Object.freeze({
	single: 'single',
	judgment: 'single',
	multiple: 'multiple',
	material: 'multiple'
})

const QUESTION_INTERNAL_FIELDS = {
	_id: false,
	version: false,
	status: false,
	updatedAt: false
}

const SEARCH_INTERNAL_FIELDS = {
	_id: false,
	version: false,
	status: false,
	updatedAt: false,
	options: false,
	answer: false,
	explanation: false
}

class QuestionBankError extends Error {
	constructor(errCode, errMsg) {
		super(errMsg)
		this.name = 'QuestionBankError'
		this.errCode = errCode
	}
}

function invalidArgument(message) {
	throw new QuestionBankError('QUESTION_BANK_INVALID_ARGUMENT', message)
}

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireEvent(event) {
	if (!isPlainObject(event)) invalidArgument('请求参数必须是对象')
	return event
}

function readString(value, fieldName, options) {
	const config = options || {}
	if (value === undefined || value === null) {
		if (config.required) invalidArgument(`${fieldName} 不能为空`)
		return config.defaultValue === undefined ? '' : config.defaultValue
	}
	if (typeof value !== 'string') invalidArgument(`${fieldName} 必须是字符串`)
	const result = value.trim()
	if (config.required && !result) invalidArgument(`${fieldName} 不能为空`)
	if (config.minLength && result.length < config.minLength) {
		invalidArgument(`${fieldName} 长度不能少于 ${config.minLength} 个字符`)
	}
	if (config.maxLength && result.length > config.maxLength) {
		invalidArgument(`${fieldName} 长度不能超过 ${config.maxLength} 个字符`)
	}
	if (config.pattern && result && !config.pattern.test(result)) {
		invalidArgument(`${fieldName} 格式不正确`)
	}
	if (config.values && result && config.values.indexOf(result) === -1) {
		invalidArgument(`${fieldName} 不支持值 ${result}`)
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

function readQuestionId(value, fieldName) {
	return readString(value, fieldName || 'questionId', {
		required: true,
		maxLength: 64,
		pattern: QUESTION_ID_PATTERN
	})
}

function readInteger(value, fieldName, options) {
	const config = options || {}
	if (value === undefined || value === null || value === '') {
		if (config.required) invalidArgument(`${fieldName} 不能为空`)
		return config.defaultValue
	}
	const result = Number(value)
	if (!Number.isInteger(result)) invalidArgument(`${fieldName} 必须是整数`)
	if (config.minimum !== undefined && result < config.minimum) {
		invalidArgument(`${fieldName} 不能小于 ${config.minimum}`)
	}
	if (config.maximum !== undefined && result > config.maximum) {
		invalidArgument(`${fieldName} 不能大于 ${config.maximum}`)
	}
	return result
}

function readPageSize(value, defaultValue) {
	return readInteger(value, 'pageSize', {
		defaultValue: defaultValue || DEFAULT_PAGE_SIZE,
		minimum: 1,
		maximum: MAX_PAGE_SIZE
	})
}

function readCursor(value) {
	return readInteger(value, 'cursor', {
		defaultValue: 0,
		minimum: 0
	})
}

function readQuestionIds(value, fieldName, maxLength, allowEmpty) {
	const name = fieldName || 'questionIds'
	if (value === undefined || value === null) {
		if (allowEmpty) return []
		invalidArgument(`${name} 不能为空`)
	}
	if (!Array.isArray(value)) invalidArgument(`${name} 必须是数组`)
	if (!allowEmpty && value.length === 0) invalidArgument(`${name} 不能为空`)
	if (value.length > maxLength) invalidArgument(`${name} 最多包含 ${maxLength} 个题目ID`)
	const unique = []
	const seen = new Set()
	value.forEach((item, index) => {
		const id = readQuestionId(item, `${name}[${index}]`)
		if (!seen.has(id)) {
			seen.add(id)
			unique.push(id)
		}
	})
	return unique
}

function readSelectedAnswers(value) {
	if (!Array.isArray(value) || value.length === 0) invalidArgument('selected 必须是非空数组')
	if (value.length > ANSWER_ALIASES.length) invalidArgument('selected 选项数量不正确')
	const result = []
	const seen = new Set()
	value.forEach((item, index) => {
		const alias = readString(item, `selected[${index}]`, {
			required: true,
			values: ANSWER_ALIASES
		})
		if (seen.has(alias)) invalidArgument('selected 不能包含重复选项')
		seen.add(alias)
		result.push(alias)
	})
	return result
}

function getRows(response) {
	if (!response) return []
	if (Array.isArray(response.data)) return response.data
	if (response.data && typeof response.data === 'object') return [response.data]
	return []
}

function getTotal(response) {
	const total = response && Number(response.total)
	return Number.isFinite(total) ? total : 0
}

function withoutInternalFields(document) {
	const result = Object.assign({}, document)
	delete result._id
	delete result.version
	delete result.status
	delete result.updatedAt
	return result
}

function requireV3Catalog(catalog) {
	if (!catalog || catalog.questionSchemaVersion !== QUESTION_SCHEMA_VERSION) {
		throw new QuestionBankError(
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
		throw new QuestionBankError(
			'QUESTION_BANK_INVALID_QUESTION_SCHEMA',
			`题目${questionId}不符合题型 schema v3 结构`
		)
	}
	return document
}

function toPublicQuestion(document) {
	requireQuestionSchema(document, true)
	const result = withoutInternalFields(document)
	result.id = result.questionId
	return result
}

function toSearchSummary(document) {
	requireQuestionSchema(document, true)
	return {
		id: document.questionId,
		questionId: document.questionId,
		subjectId: document.subjectId,
		chapterId: document.chapterId,
		chapter: document.chapter,
		section: document.section,
		knowledge: document.knowledge,
		type: document.type,
		title: document.title,
		sortOrder: document.sortOrder
	}
}

function toPublicCatalog(document) {
	requireV3Catalog(document)
	const result = Object.assign({}, document)
	delete result._id
	delete result.smartPracticeUnits
	result.id = result.subjectId
	return result
}

function toPublicCatalogSummary(document) {
	requireV3Catalog(document)
	return {
		id: document.subjectId,
		subjectId: document.subjectId,
		name: document.name || '',
		level: document.level || '',
		activeVersion: document.activeVersion,
		questionSchemaVersion: document.questionSchemaVersion,
		questionCount: Math.max(0, Number(document.questionCount) || 0)
	}
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function combineConditions(db, conditions) {
	const filtered = conditions.filter(Boolean)
	if (filtered.length === 1) return filtered[0]
	return db.command.and.apply(db.command, filtered)
}

function buildSearchCondition(db, keyword) {
	const expression = new RegExp(escapeRegExp(keyword), 'i')
	return db.command.or(
		{ title: expression },
		{ chapter: expression },
		{ section: expression },
		{ knowledge: expression },
		{ 'options.text': expression }
	)
}

function buildBaseCondition(catalog) {
	return {
		subjectId: catalog.subjectId,
		version: catalog.activeVersion,
		status: 1
	}
}

function buildModeCondition(db, catalog, mode, event) {
	const base = buildBaseCondition(catalog)
	if (mode === 'sequence' || mode === 'smart') return base
	if (mode === 'chapter') {
		const chapterId = readString(event.chapterId, 'chapterId', {
			required: true,
			maxLength: 32
		})
		return Object.assign({}, base, { chapterId })
	}
	if (mode === 'section') {
		const chapterId = readString(event.chapterId, 'chapterId', {
			required: true,
			maxLength: 32
		})
		const section = readString(event.section, 'section', {
			required: true,
			maxLength: 128
		})
		return Object.assign({}, base, { chapterId, section })
	}
	if (mode === 'knowledge') {
		const knowledge = readString(event.knowledge, 'knowledge', {
			required: true,
			maxLength: 128
		})
		const chapterId = readString(event.chapterId, 'chapterId', { maxLength: 32 })
		return Object.assign({}, base, chapterId ? { chapterId, knowledge } : { knowledge })
	}
	if (mode === 'search') {
		const keyword = readString(event.keyword, 'keyword', {
			required: true,
			minLength: 1,
			maxLength: 64
		})
		return combineConditions(db, [base, buildSearchCondition(db, keyword)])
	}
	invalidArgument(`mode 不支持值 ${mode}`)
}

async function getCatalogRecord(db, subjectId) {
	const response = await db.collection(CATALOG_COLLECTION).doc(subjectId).get()
	const catalog = getRows(response)[0]
	if (!catalog || catalog.status !== 1) {
		throw new QuestionBankError('QUESTION_BANK_SUBJECT_NOT_FOUND', '科目题库不存在或尚未启用')
	}
	if (!catalog.activeVersion) {
		throw new QuestionBankError('QUESTION_BANK_VERSION_NOT_FOUND', '科目尚未发布题库版本')
	}
	return requireV3Catalog(catalog)
}

async function queryQuestionPage(db, condition, cursor, pageSize, fields) {
	const pageCondition = cursor > 0
		? combineConditions(db, [condition, { sortOrder: db.command.gt(cursor) }])
		: condition
	const collection = db.collection(QUESTION_COLLECTION)
	// The first page is the only page that needs an exact total. Subsequent pages
	// use the extra row to determine hasMore and avoid repeating count().
	const countPromise = cursor === 0
		? collection.where(condition).count()
		: Promise.resolve(null)
	const listPromise = collection
		.where(pageCondition)
		.field(fields)
		.orderBy('sortOrder', 'asc')
		.limit(pageSize + 1)
		.get()
	const responses = await Promise.all([countPromise, listPromise])
	const rows = getRows(responses[1])
	const hasMore = rows.length > pageSize
	const pageRows = hasMore ? rows.slice(0, pageSize) : rows
	return {
		total: responses[0] ? getTotal(responses[0]) : null,
		rows: pageRows,
		hasMore,
		nextCursor: hasMore && pageRows.length ? pageRows[pageRows.length - 1].sortOrder : null
	}
}

async function getQuestionsByIdsInternal(db, catalog, questionIds) {
	if (questionIds.length === 0) return []
	const condition = Object.assign({}, buildBaseCondition(catalog), {
		questionId: db.command.in(questionIds)
	})
	const response = await db.collection(QUESTION_COLLECTION)
		.where(condition)
		.field(QUESTION_INTERNAL_FIELDS)
		.limit(questionIds.length)
		.get()
	const byId = new Map()
	getRows(response).forEach(document => byId.set(document.questionId, document))
	return questionIds.map(questionId => byId.get(questionId)).filter(Boolean)
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

async function loadSmartQuestionReferences(db, catalog) {
	const result = []
	for (let offset = 0; ; offset += SMART_METADATA_PAGE_SIZE) {
		const response = await db.collection(QUESTION_COLLECTION)
			.where(buildBaseCondition(catalog))
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

function dateSeed(now) {
	return now().toISOString().slice(0, 10)
}

function createQuestionBankService(db, options) {
	if (!db || typeof db.collection !== 'function' || !db.command) {
		throw new Error('A uniCloud database instance is required')
	}
	const config = options || {}
	const now = typeof config.now === 'function' ? config.now : () => new Date()

	async function getCatalog(event) {
		const subjectId = readSubjectId(event.subjectId)
		const catalog = await getCatalogRecord(db, subjectId)
		return toPublicCatalog(catalog)
	}

	async function getCatalogSummaries() {
		const response = await db.collection(CATALOG_COLLECTION)
			.where({ status: 1 })
			.field({
				subjectId: true,
				name: true,
				level: true,
				activeVersion: true,
				questionSchemaVersion: true,
				questionCount: true
			})
			.limit(MAX_CATALOG_SUMMARIES)
			.get()
		return {
			items: getRows(response)
				.filter(item => item.subjectId && item.activeVersion)
				.map(toPublicCatalogSummary)
		}
	}

	async function getPracticePage(event) {
		const subjectId = readSubjectId(event.subjectId)
		const mode = readString(event.mode, 'mode', {
			defaultValue: 'sequence',
			values: PRACTICE_MODES
		})
		if (mode === 'smart') return getSmartPractice(event, subjectId)
		const pageSize = readPageSize(event.pageSize)
		const cursor = readCursor(event.cursor)
		const catalog = await getCatalogRecord(db, subjectId)
		const condition = buildModeCondition(db, catalog, mode, event)
		const page = await queryQuestionPage(db, condition, cursor, pageSize, QUESTION_INTERNAL_FIELDS)
		return {
			subjectId,
			version: catalog.activeVersion,
			mode,
			total: page.total,
			pageSize,
			cursor,
			nextCursor: page.nextCursor,
			hasMore: page.hasMore,
			items: page.rows.map(toPublicQuestion)
		}
	}

	async function searchQuestions(event) {
		const subjectId = readSubjectId(event.subjectId)
		const keyword = readString(event.keyword, 'keyword', {
			required: true,
			minLength: 1,
			maxLength: 64
		})
		const pageSize = readPageSize(event.pageSize)
		const cursor = readCursor(event.cursor)
		const catalog = await getCatalogRecord(db, subjectId)
		const condition = combineConditions(db, [
			buildBaseCondition(catalog),
			buildSearchCondition(db, keyword)
		])
		const page = await queryQuestionPage(db, condition, cursor, pageSize, SEARCH_INTERNAL_FIELDS)
		return {
			subjectId,
			version: catalog.activeVersion,
			keyword,
			total: page.total,
			pageSize,
			cursor,
			nextCursor: page.nextCursor,
			hasMore: page.hasMore,
			items: page.rows.map(toSearchSummary)
		}
	}

	async function getQuestionsByIds(event) {
		const subjectId = readSubjectId(event.subjectId)
		const questionIds = readQuestionIds(event.questionIds, 'questionIds', MAX_QUESTION_IDS, true)
		const catalog = await getCatalogRecord(db, subjectId)
		const documents = await getQuestionsByIdsInternal(db, catalog, questionIds)
		const foundIds = new Set(documents.map(document => document.questionId))
		return {
			subjectId,
			version: catalog.activeVersion,
			requestedCount: questionIds.length,
			foundCount: documents.length,
			missingQuestionIds: questionIds.filter(questionId => !foundIds.has(questionId)),
			items: documents.map(toPublicQuestion)
		}
	}

	async function checkAnswer(event) {
		const subjectId = readSubjectId(event.subjectId)
		const questionId = readQuestionId(event.questionId)
		const selected = readSelectedAnswers(event.selected)
		const catalog = await getCatalogRecord(db, subjectId)
		const documentId = `${catalog.activeVersion}:${questionId}`
		const response = await db.collection(QUESTION_COLLECTION).doc(documentId).get()
		const question = getRows(response)[0]
		if (!question || question.subjectId !== subjectId || question.version !== catalog.activeVersion || question.status !== 1) {
			throw new QuestionBankError('QUESTION_BANK_QUESTION_NOT_FOUND', '题目不存在或尚未启用')
		}
		requireQuestionSchema(question, true)
		const normalizedSelected = selected.slice().sort()
		const normalizedAnswer = question.answer.slice().sort()
		const correct = normalizedSelected.length === normalizedAnswer.length
			&& normalizedSelected.every((alias, index) => alias === normalizedAnswer[index])
		return {
			questionId,
			type: question.type,
			selected,
			correct,
			answer: question.answer,
			explanation: question.explanation
		}
	}

	async function getSmartPractice(event, subjectId) {
		let smartPractice
		try { smartPractice = validateSmartPractice(event.smartPractice) }
		catch (error) { invalidArgument(error.message) }
		const pageSize = readPageSize(event.pageSize, DEFAULT_PAGE_SIZE)
		const answeredQuestionIds = readQuestionIds(
			event.answeredQuestionIds,
			'answeredQuestionIds',
			MAX_STATE_IDS,
			true
		)
		const wrongQuestionIds = readQuestionIds(
			event.wrongQuestionIds,
			'wrongQuestionIds',
			MAX_STATE_IDS,
			true
		)
		const catalog = await getCatalogRecord(db, subjectId)
		const seed = readString(event.seed, 'seed', {
			defaultValue: `${subjectId}:${catalog.activeVersion}:${dateSeed(now)}`,
			maxLength: 128
		})
		const random = createRandom(hashSeed(seed))
		const indexedUnits = Array.isArray(catalog.smartPracticeUnits)
			&& catalog.smartPracticeUnits.length
			? catalog.smartPracticeUnits
			: null
		const references = indexedUnits ? null : await loadSmartQuestionReferences(db, catalog)
		const answered = new Set(answeredQuestionIds)
		const wrong = new Set(wrongQuestionIds)
		let units
		try { units = indexedUnits || buildSmartPracticeUnits(references) }
		catch (error) {
			throw new QuestionBankError(
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
		const groups = classifySmartPracticeUnits(units, answered, wrong)
		const selection = selectSmartPracticeUnits(groups, pageSize, smartPractice, random)
		const documents = await getQuestionsByIdsInternal(db, catalog, selection.questionIds)
		if (documents.length !== selection.questionIds.length) {
			throw new QuestionBankError(
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
			mode: 'smart',
			seed,
			total: Number(catalog.questionCount) || (references ? references.length : 0),
			pageSize,
			requestedQuestionCount: selection.requestedQuestionCount,
			actualQuestionCount: documents.length,
			overflowQuestionCount: Math.max(0, documents.length - selection.requestedQuestionCount),
			cursor: 0,
			nextCursor: null,
			hasMore: false,
			stateCounts: {
				fresh: stateQuestionCount('fresh'),
				wrong: stateQuestionCount('wrong'),
				mastered: stateQuestionCount('mastered'),
				sampled: Number(catalog.questionCount) || (references ? references.length : 0)
			},
			items: documents.map(toPublicQuestion)
		}
	}

	const handlers = {
		getCatalog,
		getCatalogSummaries,
		getPracticePage,
		getQuestionsByIds,
		searchQuestions,
		checkAnswer
	}

	async function execute(rawEvent) {
		const event = requireEvent(rawEvent)
		const action = readString(event.action, 'action', {
			required: true,
			maxLength: 64
		})
		const handler = handlers[action]
		if (!handler) {
			throw new QuestionBankError('QUESTION_BANK_UNSUPPORTED_ACTION', `不支持的 action: ${action}`)
		}
		return handler(event)
	}

	return { execute }
}

module.exports = {
	QuestionBankError,
	createQuestionBankService,
	escapeRegExp,
	hashSeed
}
