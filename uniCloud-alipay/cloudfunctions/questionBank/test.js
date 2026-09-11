'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { QuestionBankError, createQuestionBankService } = require('./service')

function getPathValues(value, parts) {
	if (Array.isArray(value)) {
		return value.reduce((all, item) => all.concat(getPathValues(item, parts)), [])
	}
	if (!parts.length) return [value]
	if (value === null || typeof value !== 'object') return []
	const key = parts[0]
	if (!Object.prototype.hasOwnProperty.call(value, key)) return []
	return getPathValues(value[key], parts.slice(1))
}

function isCommand(value, type) {
	return value && typeof value === 'object' && value.__command === type
}

function matchesField(values, expected) {
	if (isCommand(expected, 'gt')) return values.some(value => value > expected.value)
	if (isCommand(expected, 'in')) return values.some(value => expected.values.indexOf(value) > -1)
	if (expected instanceof RegExp) {
		return values.some(value => {
			expected.lastIndex = 0
			return expected.test(String(value))
		})
	}
	return values.some(value => value === expected)
}

function matchesDocument(document, condition) {
	if (isCommand(condition, 'and')) {
		return condition.conditions.every(item => matchesDocument(document, item))
	}
	if (isCommand(condition, 'or')) {
		return condition.conditions.some(item => matchesDocument(document, item))
	}
	return Object.keys(condition).every(key => {
		const values = getPathValues(document, key.split('.'))
		return matchesField(values, condition[key])
	})
}

function projectDocument(document, fields) {
	if (!fields) return Object.assign({}, document)
	const keys = Object.keys(fields)
	const includes = keys.filter(key => fields[key] === true)
	if (includes.length) {
		const result = {}
		if (document._id !== undefined) result._id = document._id
		includes.forEach(key => {
			if (document[key] !== undefined) result[key] = document[key]
		})
		return result
	}
	const result = Object.assign({}, document)
	keys.forEach(key => {
		if (fields[key] === false) delete result[key]
	})
	return result
}

class FakeQuery {
	constructor(documents, condition, metrics) {
		this.documents = documents
		this.condition = condition || {}
		this.metrics = metrics
		this.fields = null
		this.orders = []
		this.offset = 0
		this.maximum = null
	}

	where(condition) {
		this.condition = condition
		return this
	}

	field(fields) {
		this.fields = fields
		return this
	}

	orderBy(field, direction) {
		this.orders.push({ field, direction })
		return this
	}

	skip(offset) {
		this.offset = offset
		return this
	}

	limit(maximum) {
		this.maximum = maximum
		return this
	}

	filtered() {
		return this.documents.filter(document => matchesDocument(document, this.condition))
	}

	async count() {
		this.metrics.count += 1
		return { total: this.filtered().length }
	}

	async get() {
		let rows = this.filtered().slice()
		if (this.orders.length) {
			rows.sort((left, right) => {
				for (const order of this.orders) {
					if (left[order.field] === right[order.field]) continue
					const value = left[order.field] < right[order.field] ? -1 : 1
					return order.direction === 'desc' ? -value : value
				}
				return 0
			})
		}
		rows = rows.slice(this.offset)
		if (this.maximum !== null) rows = rows.slice(0, this.maximum)
		return { data: rows.map(document => projectDocument(document, this.fields)) }
	}
}

class FakeCollection {
	constructor(documents, metrics) {
		this.documents = documents
		this.metrics = metrics
	}

	where(condition) {
		return new FakeQuery(this.documents, condition, this.metrics)
	}

	doc(documentId) {
		return {
			get: async () => ({ data: this.documents.filter(document => document._id === documentId) })
		}
	}
}

function createFakeDatabase(collections) {
	const metrics = { count: 0 }
	const command = {
		and() {
			return { __command: 'and', conditions: Array.from(arguments) }
		},
		or() {
			return { __command: 'or', conditions: Array.from(arguments) }
		},
		gt(value) {
			return { __command: 'gt', value }
		},
		in(values) {
			return { __command: 'in', values }
		}
	}
	return {
		command,
		metrics,
		collection(name) {
			if (!collections[name]) throw new Error(`Unknown collection: ${name}`)
			return new FakeCollection(collections[name], metrics)
		}
	}
}

function loadDatabase() {
	const databaseDir = path.resolve(__dirname, '../../database')
	const catalogSeedPath = path.join(databaseDir, 'question_bank_catalogs.init_data.json')
	const questionSeedPath = path.join(databaseDir, 'question_bank_questions.init_data.json')
	if (!fs.existsSync(catalogSeedPath) || !fs.existsSync(questionSeedPath)) {
		const outputRoot = path.resolve(__dirname, '../../../outputs/question-bank/junior-personal-finance')
		const version = fs.readdirSync(outputRoot).filter(name => (
			fs.statSync(path.join(outputRoot, name)).isDirectory()
		)).sort().slice(-1)[0]
		const readJsonLines = filePath => fs.readFileSync(filePath, 'utf8')
			.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
		return {
			question_bank_catalogs: readJsonLines(path.join(outputRoot, version, 'catalog.json')),
			question_bank_questions: readJsonLines(path.join(outputRoot, version, 'questions.json'))
		}
	}
	return {
		question_bank_catalogs: JSON.parse(fs.readFileSync(
			catalogSeedPath,
			'utf8'
		)),
		question_bank_questions: JSON.parse(fs.readFileSync(
			questionSeedPath,
			'utf8'
		))
	}
}

async function run() {
	const collections = loadDatabase()
	const questions = collections.question_bank_questions
	const db = createFakeDatabase(collections)
	const service = createQuestionBankService(db, {
		now: () => new Date('2026-08-27T00:00:00.000Z')
	})
	const subjectId = 'junior-personal-finance'

	const catalog = await service.execute({ action: 'getCatalog', subjectId })
	assert.equal(catalog.id, subjectId)
	assert.equal(catalog.questionCount, 822)
	assert.equal(catalog.chapters.length, 8)
	assert.equal(catalog.knowledgeGroups.length, 122)
	const catalogSummaries = await service.execute({ action: 'getCatalogSummaries' })
	assert.equal(catalogSummaries.items.length, 1)
	assert.deepEqual(catalogSummaries.items[0], {
		id: subjectId,
		subjectId,
		name: '初级个人理财',
		level: '初级',
		activeVersion: catalog.activeVersion,
		questionCount: 822
	})

	const firstPage = await service.execute({
		action: 'getPracticePage', subjectId, mode: 'sequence', pageSize: 7
	})
	assert.equal(firstPage.total, 822)
	assert.equal(firstPage.items.length, 7)
	assert.equal(firstPage.items[0].id, questions[0].questionId)
	assert.ok(firstPage.items[0].answer.length)
	assert.equal(firstPage.nextCursor, 7)
	assert.equal(db.metrics.count, 1)

	const secondPage = await service.execute({
		action: 'getPracticePage', subjectId, mode: 'sequence', pageSize: 7, cursor: firstPage.nextCursor
	})
	assert.equal(secondPage.items[0].sortOrder, 8)
	assert.equal(new Set(firstPage.items.concat(secondPage.items).map(item => item.id)).size, 14)
	assert.equal(db.metrics.count, 1)

	const chapterPage = await service.execute({
		action: 'getPracticePage', subjectId, mode: 'chapter', chapterId: '1', pageSize: 50
	})
	assert.equal(chapterPage.total, catalog.chapters.find(item => item.id === '1').count)
	assert.ok(chapterPage.items.every(item => item.chapterId === '1'))
	const repeatedSection = questions[0]
	const sectionExpected = questions.filter(question => (
		question.chapterId === repeatedSection.chapterId && question.section === repeatedSection.section
	))
	const sectionPage = await service.execute({
		action: 'getPracticePage',
		subjectId,
		mode: 'section',
		chapterId: repeatedSection.chapterId,
		section: repeatedSection.section,
		pageSize: 50
	})
	assert.equal(sectionPage.total, sectionExpected.length)
	assert.ok(sectionPage.items.every(item => item.chapterId === repeatedSection.chapterId))
	assert.ok(sectionPage.items.every(item => item.section === repeatedSection.section))

	const knowledgePage = await service.execute({
		action: 'getPracticePage',
		subjectId,
		mode: 'knowledge',
		chapterId: '1',
		knowledge: '银行个人理财业务分类',
		pageSize: 50
	})
	assert.equal(knowledgePage.total, questions.filter(item => (
		item.chapterId === '1' && item.knowledge === '银行个人理财业务分类'
	)).length)
	assert.ok(knowledgePage.items.every(item => item.chapterId === '1'))
	assert.ok(knowledgePage.items.every(item => item.knowledge === '银行个人理财业务分类'))

	const searchPage = await service.execute({
		action: 'searchQuestions', subjectId, keyword: '客户等级最高', pageSize: 10
	})
	assert.ok(searchPage.total > 0)
	assert.equal(searchPage.items[0].answer, undefined)
	assert.equal(searchPage.items[0].options, undefined)

	const requestedIds = [questions[20].questionId, questions[0].questionId, 'ipf-missing']
	const byIds = await service.execute({ action: 'getQuestionsByIds', subjectId, questionIds: requestedIds })
	assert.deepEqual(byIds.items.map(item => item.id), requestedIds.slice(0, 2))
	assert.deepEqual(byIds.missingQuestionIds, ['ipf-missing'])

	const firstQuestion = questions[0]
	const correctResult = await service.execute({
		action: 'checkAnswer', subjectId, questionId: firstQuestion.questionId, selected: firstQuestion.answer
	})
	assert.equal(correctResult.correct, true)
	const incorrectAlias = firstQuestion.options.map(option => option.alias)
		.find(alias => firstQuestion.answer.indexOf(alias) === -1)
	const incorrectResult = await service.execute({
		action: 'checkAnswer', subjectId, questionId: firstQuestion.questionId, selected: [incorrectAlias]
	})
	assert.equal(incorrectResult.correct, false)

	const answeredQuestionIds = questions.slice(0, 820).map(question => question.questionId)
	const wrongQuestionIds = questions.slice(0, 5).map(question => question.questionId)
	const smartPage = await service.execute({
		action: 'getPracticePage',
		subjectId,
		mode: 'smart',
		pageSize: 10,
		seed: 'fixed-test-seed',
		answeredQuestionIds,
		wrongQuestionIds
	})
	assert.equal(smartPage.stateCounts.sampled, 100)
	assert.equal(smartPage.stateCounts.wrong, 5)
	assert.ok(smartPage.stateCounts.fresh + smartPage.stateCounts.mastered <= 100)
	assert.equal(smartPage.items.length, 10)
	assert.ok(smartPage.items.some(item => wrongQuestionIds.indexOf(item.id) > -1))

	await assert.rejects(
		service.execute({ action: 'getPracticePage', subjectId, pageSize: 51 }),
		error => error instanceof QuestionBankError && error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT'
	)
	await assert.rejects(
		service.execute({ action: 'getPracticePage', subjectId, mode: 'section', chapterId: '1' }),
		error => error instanceof QuestionBankError && error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT'
	)
	await assert.rejects(
		service.execute({ action: 'unknownAction', subjectId }),
		error => error instanceof QuestionBankError && error.errCode === 'QUESTION_BANK_UNSUPPORTED_ACTION'
	)

	const sameNameCatalog = Object.assign({}, collections.question_bank_catalogs[0], {
		questionCount: 2,
		chapters: [{ id: '1', count: 1 }, { id: '2', count: 1 }]
	})
	const sameNameQuestions = [
		Object.assign({}, questions[0], {
			_id: `${sameNameCatalog.activeVersion}:scope-1`,
			questionId: 'scope-1',
			chapterId: '1',
			section: '同名小节',
			sortOrder: 1
		}),
		Object.assign({}, questions[1], {
			_id: `${sameNameCatalog.activeVersion}:scope-2`,
			questionId: 'scope-2',
			chapterId: '2',
			section: '同名小节',
			sortOrder: 2
		})
	]
	const sameNameService = createQuestionBankService(createFakeDatabase({
		question_bank_catalogs: [sameNameCatalog],
		question_bank_questions: sameNameQuestions
	}))
	const sameNameSectionPage = await sameNameService.execute({
		action: 'getPracticePage',
		subjectId,
		mode: 'section',
		chapterId: '2',
		section: '同名小节',
		pageSize: 20
	})
	assert.equal(sameNameSectionPage.total, 1)
	assert.equal(sameNameSectionPage.items[0].id, 'scope-2')

	console.log('questionBank tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
