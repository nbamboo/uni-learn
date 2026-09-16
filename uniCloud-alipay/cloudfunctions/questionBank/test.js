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
	const sourceCatalog = collections.question_bank_catalogs[0]
	const db = createFakeDatabase(collections)
	const service = createQuestionBankService(db, {
		now: () => new Date('2026-08-27T00:00:00.000Z')
	})
	const subjectId = 'junior-personal-finance'

	const catalog = await service.execute({ action: 'getCatalog', subjectId })
	assert.equal(catalog.id, subjectId)
	assert.equal(catalog.questionSchemaVersion, 3)
	assert.equal(catalog.questionCount, questions.length)
	assert.equal(catalog.chapters.length, sourceCatalog.chapters.length)
	assert.equal(catalog.knowledgeGroups.length, sourceCatalog.knowledgeGroups.length)
	const catalogSummaries = await service.execute({ action: 'getCatalogSummaries' })
	assert.equal(catalogSummaries.items.length, 1)
	assert.deepEqual(catalogSummaries.items[0], {
		id: subjectId,
		subjectId,
		name: sourceCatalog.name,
		level: sourceCatalog.level,
		activeVersion: catalog.activeVersion,
		questionSchemaVersion: 3,
		questionCount: questions.length
	})

	const firstPage = await service.execute({
		action: 'getPracticePage', subjectId, mode: 'sequence', pageSize: 7
	})
	assert.equal(firstPage.total, questions.length)
	assert.equal(firstPage.items.length, 7)
	assert.equal(firstPage.items[0].id, questions[0].questionId)
	assert.equal(firstPage.items[0].type, questions[0].type)
	assert.equal(firstPage.items[0].selectionMode, questions[0].selectionMode)
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

	const knowledgeQuestion = questions[0]
	const knowledgePage = await service.execute({
		action: 'getPracticePage',
		subjectId,
		mode: 'knowledge',
		chapterId: knowledgeQuestion.chapterId,
		knowledge: knowledgeQuestion.knowledge,
		pageSize: 50
	})
	assert.equal(knowledgePage.total, questions.filter(item => (
		item.chapterId === knowledgeQuestion.chapterId && item.knowledge === knowledgeQuestion.knowledge
	)).length)
	assert.ok(knowledgePage.items.every(item => item.chapterId === knowledgeQuestion.chapterId))
	assert.ok(knowledgePage.items.every(item => item.knowledge === knowledgeQuestion.knowledge))

	const searchKeyword = questions[0].title.slice(0, 16)
	const searchPage = await service.execute({
		action: 'searchQuestions', subjectId, keyword: searchKeyword, pageSize: 10
	})
	assert.ok(searchPage.total > 0)
	assert.ok(searchPage.items[0].type)
	assert.equal(searchPage.items[0].answer, undefined)
	assert.equal(searchPage.items[0].options, undefined)

	const requestedIds = [questions[20].questionId, questions[0].questionId, 'ipf-missing']
	const byIds = await service.execute({ action: 'getQuestionsByIds', subjectId, questionIds: requestedIds })
	assert.deepEqual(byIds.items.map(item => item.id), requestedIds.slice(0, 2))
	assert.ok(byIds.items.every(item => item.type && item.selectionMode))
	assert.deepEqual(byIds.missingQuestionIds, ['ipf-missing'])

	const firstQuestion = questions.find(question => question.options.some(option => (
		question.answer.indexOf(option.alias) === -1
	)))
	const correctResult = await service.execute({
		action: 'checkAnswer', subjectId, questionId: firstQuestion.questionId, selected: firstQuestion.answer
	})
	assert.equal(correctResult.correct, true)
	assert.equal(correctResult.type, firstQuestion.type)
	const incorrectAlias = firstQuestion.options.map(option => option.alias)
		.find(alias => firstQuestion.answer.indexOf(alias) === -1)
	const incorrectResult = await service.execute({
		action: 'checkAnswer', subjectId, questionId: firstQuestion.questionId, selected: [incorrectAlias]
	})
	assert.equal(incorrectResult.correct, false)

	const answeredQuestionIds = questions.slice(0, Math.max(0, questions.length - 2))
		.map(question => question.questionId)
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
	assert.equal(smartPage.stateCounts.sampled, questions.length)
	assert.equal(smartPage.stateCounts.wrong, 5)
	assert.ok(smartPage.stateCounts.fresh + smartPage.stateCounts.mastered <= questions.length)
	assert.equal(smartPage.items.length, 10)
	assert.equal(smartPage.requestedQuestionCount, 10)
	assert.equal(smartPage.actualQuestionCount, smartPage.items.length)
	assert.equal(smartPage.overflowQuestionCount, 0)
	assert.ok(smartPage.items.some(item => wrongQuestionIds.indexOf(item.id) > -1))
	const ratioPage = await service.execute({ action: 'getPracticePage', subjectId, mode: 'smart',
		pageSize: 10, seed: 'fixed-test-seed', answeredQuestionIds, wrongQuestionIds,
		smartPractice: { strategy: 'custom', questionCount: 20, custom: { fresh: 0, wrong: 50, mastered: 50 } } })
	assert.equal(ratioPage.items.length, 10)
	assert.equal(ratioPage.stateCounts.sampled, questions.length)
	assert.equal(ratioPage.items.filter(item => wrongQuestionIds.includes(item.id)).length, 5)
	assert.equal(new Set(ratioPage.items.map(item => item.id)).size, 10)
	await assert.rejects(service.execute({ action: 'getPracticePage', subjectId, mode: 'smart',
		smartPractice: { strategy: 'custom', questionCount: 20, custom: { fresh: 60, wrong: 40, mastered: 10 } } }),
		error => error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT')
	await assert.rejects(service.execute({ action: 'getPracticePage', subjectId, mode: 'smart',
		smartPractice: { strategy: 'auto', questionCount: 20, custom: { fresh: 60, wrong: 30, mastered: 10 } } }),
		error => error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT')
	await assert.rejects(service.execute({ action: 'getPracticePage', subjectId, mode: 'smart',
		smartPractice: { strategy: 'fresh', questionCount: 12, custom: { fresh: 60, wrong: 30, mastered: 10 } } }),
		error => error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT')

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

	const fixtureCatalog = Object.assign({}, sourceCatalog, {
		questionCount: 4,
		chapters: [{ id: '1', subjectId, name: '第一章', count: 4, sections: [] }],
		knowledgeGroups: []
	})
	const fixtureTypes = [
		{ questionId: 'fixture-single', type: 'single', selectionMode: 'single', answer: ['A'] },
		{ questionId: 'fixture-judgment', type: 'judgment', selectionMode: 'single', answer: ['B'] },
		{ questionId: 'fixture-multiple', type: 'multiple', selectionMode: 'multiple', answer: ['A', 'B'] },
		{ questionId: 'fixture-material', type: 'material', selectionMode: 'multiple', answer: ['A'] }
	]
	const fixtureQuestions = fixtureTypes.map((fixture, index) => {
		const question = Object.assign({}, questions[0], fixture, {
		_id: `${fixtureCatalog.activeVersion}:${fixture.questionId}`,
		chapterId: '1',
		chapter: '第一章',
		section: '第一节',
		knowledge: '题型 schema v3',
		title: `${fixture.type} 题目`,
		options: [
			{ alias: 'A', text: '选项 A' },
			{ alias: 'B', text: '选项 B' },
			{ alias: 'C', text: '选项 C' }
		],
		sortOrder: index + 1
		})
		;['materialGroupId', 'materialText', 'materialQuestionIndex', 'materialQuestionCount']
			.forEach(field => delete question[field])
		if (fixture.type === 'material') Object.assign(question, {
			materialGroupId: 'fixture-material-group',
			materialText: '材料正文',
			materialQuestionIndex: 1,
			materialQuestionCount: 1
		})
		return question
	})
	const fixtureService = createQuestionBankService(createFakeDatabase({
		question_bank_catalogs: [fixtureCatalog],
		question_bank_questions: fixtureQuestions
	}))
	const fixturePage = await fixtureService.execute({
		action: 'getPracticePage', subjectId, mode: 'sequence', pageSize: 10
	})
	assert.deepEqual(fixturePage.items.map(item => [item.type, item.selectionMode]), [
		['single', 'single'],
		['judgment', 'single'],
		['multiple', 'multiple'],
		['material', 'multiple']
	])
	const fixtureSearch = await fixtureService.execute({
		action: 'searchQuestions', subjectId, keyword: 'material', pageSize: 10
	})
	assert.equal(fixtureSearch.items[0].type, 'material')
	const judgmentResult = await fixtureService.execute({
		action: 'checkAnswer', subjectId, questionId: 'fixture-judgment', selected: ['B']
	})
	assert.equal(judgmentResult.correct, true)
	const materialResult = await fixtureService.execute({
		action: 'checkAnswer', subjectId, questionId: 'fixture-material', selected: ['A', 'B']
	})
	assert.equal(materialResult.correct, false)

	const smartMaterialQuestions = []
	for (let index = 1; index <= 18; index += 1) {
		const question = Object.assign({}, questions[0], {
			_id: `${fixtureCatalog.activeVersion}:smart-single-${index}`,
			questionId: `smart-single-${index}`,
			type: 'single',
			selectionMode: 'single',
			title: `智能练习单题 ${index}`,
			sortOrder: index
		})
		;['materialGroupId', 'materialText', 'materialQuestionIndex', 'materialQuestionCount']
			.forEach(field => delete question[field])
		smartMaterialQuestions.push(question)
	}
	const materialGroupQuestionIds = []
	for (let index = 1; index <= 4; index += 1) {
		const questionId = `smart-material-${index}`
		materialGroupQuestionIds.push(questionId)
		const question = Object.assign({}, questions[0], {
			_id: `${fixtureCatalog.activeVersion}:${questionId}`,
			questionId,
			type: 'material',
			selectionMode: 'multiple',
			title: `材料子题 ${index}`,
			materialGroupId: 'smart-material-group',
			materialText: '四道子题共享的材料正文',
			materialQuestionIndex: index,
			materialQuestionCount: 4,
			sortOrder: 18 + index
		})
		smartMaterialQuestions.push(question)
	}
	const smartMaterialCatalog = Object.assign({}, fixtureCatalog, { questionCount: 22 })
	const smartMaterialService = createQuestionBankService(createFakeDatabase({
		question_bank_catalogs: [smartMaterialCatalog],
		question_bank_questions: smartMaterialQuestions
	}))
	const smartMaterialPage = await smartMaterialService.execute({
		action: 'getPracticePage',
		subjectId,
		mode: 'smart',
		pageSize: 20,
		seed: 'material-overflow-cloud-test',
		answeredQuestionIds: materialGroupQuestionIds,
		wrongQuestionIds: [],
		smartPractice: {
			strategy: 'custom',
			questionCount: 20,
			custom: { fresh: 100, wrong: 0, mastered: 0 }
		}
	})
	assert.equal(smartMaterialPage.requestedQuestionCount, 20)
	assert.equal(smartMaterialPage.actualQuestionCount, 22)
	assert.equal(smartMaterialPage.overflowQuestionCount, 2)
	assert.equal(smartMaterialPage.stateCounts.mastered, 4)
	const selectedMaterialQuestions = smartMaterialPage.items
		.filter(item => item.materialGroupId === 'smart-material-group')
	assert.deepEqual(
		selectedMaterialQuestions.map(item => item.materialQuestionIndex),
		[1, 2, 3, 4]
	)
	const materialStart = smartMaterialPage.items.findIndex(
		item => item.materialGroupId === 'smart-material-group'
	)
	assert.deepEqual(
		smartMaterialPage.items.slice(materialStart, materialStart + 4).map(item => item.id),
		materialGroupQuestionIds
	)
	const wrongMaterialPage = await smartMaterialService.execute({
		action: 'getPracticePage',
		subjectId,
		mode: 'smart',
		pageSize: 20,
		seed: 'material-wrong-group-test',
		answeredQuestionIds: materialGroupQuestionIds,
		wrongQuestionIds: [materialGroupQuestionIds[2]],
		smartPractice: {
			strategy: 'custom',
			questionCount: 20,
			custom: { fresh: 0, wrong: 100, mastered: 0 }
		}
	})
	assert.equal(wrongMaterialPage.stateCounts.wrong, 4)
	assert.deepEqual(
		wrongMaterialPage.items
			.filter(item => item.materialGroupId === 'smart-material-group')
			.map(item => item.materialQuestionIndex),
		[1, 2, 3, 4]
	)

	const oldCatalogService = createQuestionBankService(createFakeDatabase({
		question_bank_catalogs: [Object.assign({}, fixtureCatalog, { questionSchemaVersion: 2 })],
		question_bank_questions: fixtureQuestions
	}))
	await assert.rejects(
		oldCatalogService.execute({ action: 'getCatalog', subjectId }),
		error => error.errCode === 'QUESTION_BANK_SCHEMA_VERSION_UNSUPPORTED'
	)
	const invalidQuestion = Object.assign({}, fixtureQuestions[0])
	delete invalidQuestion.selectionMode
	const invalidQuestionService = createQuestionBankService(createFakeDatabase({
		question_bank_catalogs: [Object.assign({}, fixtureCatalog, { questionCount: 1 })],
		question_bank_questions: [invalidQuestion]
	}))
	await assert.rejects(
		invalidQuestionService.execute({
			action: 'getPracticePage', subjectId, mode: 'sequence', pageSize: 10
		}),
		error => error.errCode === 'QUESTION_BANK_INVALID_QUESTION_SCHEMA'
	)
	const invalidNonMaterial = Object.assign({}, fixtureQuestions[0], {
		materialGroupId: 'invalid-material-group'
	})
	const invalidNonMaterialService = createQuestionBankService(createFakeDatabase({
		question_bank_catalogs: [Object.assign({}, fixtureCatalog, { questionCount: 1 })],
		question_bank_questions: [invalidNonMaterial]
	}))
	await assert.rejects(
		invalidNonMaterialService.execute({
			action: 'getPracticePage', subjectId, mode: 'sequence', pageSize: 10
		}),
		error => error.errCode === 'QUESTION_BANK_INVALID_QUESTION_SCHEMA'
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
