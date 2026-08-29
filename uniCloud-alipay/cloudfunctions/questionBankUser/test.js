'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createQuestionBankUserService } = require('./service')

function valueOf(value) {
	if (value instanceof Date) return value.getTime()
	return value
}

function matches(document, condition) {
	return Object.keys(condition || {}).every(key => {
		const expected = condition[key]
		if (expected && expected.__command === 'in') return expected.values.indexOf(document[key]) > -1
		return valueOf(document[key]) === valueOf(expected)
	})
}

function project(document, fields) {
	if (!fields) return Object.assign({}, document)
	const included = Object.keys(fields).filter(key => fields[key] === true)
	if (included.length) {
		const result = {}
		included.forEach(key => {
			if (document[key] !== undefined) result[key] = document[key]
		})
		return result
	}
	const result = Object.assign({}, document)
	Object.keys(fields).forEach(key => {
		if (fields[key] === false) delete result[key]
	})
	return result
}

class FakeQuery {
	constructor(collection, condition) {
		this.collection = collection
		this.condition = condition || {}
		this.fields = null
		this.order = null
		this.offset = 0
		this.maximum = Infinity
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
		this.order = { field, direction }
		return this
	}

	skip(value) {
		this.offset = value
		return this
	}

	limit(value) {
		this.maximum = value
		return this
	}

	rows() {
		let rows = Array.from(this.collection.values()).filter(item => matches(item, this.condition))
		if (this.order) {
			const { field, direction } = this.order
			rows.sort((left, right) => {
				const result = valueOf(left[field]) < valueOf(right[field]) ? -1 : 1
				return direction === 'desc' ? -result : result
			})
		}
		return rows
	}

	async count() {
		return { total: this.rows().length }
	}

	async get() {
		return {
			data: this.rows().slice(this.offset, this.offset + this.maximum)
				.map(item => project(item, this.fields))
		}
	}
}

class FakeCollection extends FakeQuery {
	constructor(collection) {
		super(collection, {})
	}

	doc(documentId) {
		return {
			get: async () => ({
				data: this.collection.has(documentId)
					? [Object.assign({}, this.collection.get(documentId))]
					: []
			}),
			set: async document => {
				this.collection.set(documentId, Object.assign({}, document, { _id: documentId }))
				return { updated: 1 }
			}
		}
	}
}

function createDatabase(seed, now) {
	const collections = {}
	Object.keys(seed).forEach(name => {
		collections[name] = new Map(seed[name].map(item => [item._id, Object.assign({}, item)]))
	})
	const command = {
		in(values) {
			return { __command: 'in', values }
		}
	}
	const db = {
		command,
		serverDate: () => new Date(now.getTime()),
		collection(name) {
			if (!collections[name]) collections[name] = new Map()
			return new FakeCollection(collections[name])
		},
		async startTransaction() {
			return {
				collection: name => db.collection(name),
				commit: async () => {},
				rollback: async () => {}
			}
		}
	}
	return { db, collections }
}

function loadSeed() {
	const databaseDir = path.resolve(__dirname, '../../database')
	return {
		question_bank_catalogs: JSON.parse(fs.readFileSync(
			path.join(databaseDir, 'question_bank_catalogs.init_data.json'),
			'utf8'
		)),
			question_bank_questions: JSON.parse(fs.readFileSync(
			path.join(databaseDir, 'question_bank_questions.init_data.json'),
			'utf8'
			)),
			'uni-id-users': [{
				_id: 'user-one',
				nickname: '理财学员',
				avatar_file: { url: 'https://example.com/avatar.png' },
				wx_openid: { mp: 'openid-for-test' },
				register_date: new Date('2026-08-01T00:00:00.000Z'),
				last_login_date: new Date('2026-08-28T03:59:00.000Z')
		}],
		question_bank_user_states: [],
		question_bank_user_stats: [],
		question_bank_user_progress: []
	}
}

async function run() {
	const currentTime = new Date('2026-08-28T04:00:00.000Z')
	const environment = createDatabase(loadSeed(), currentTime)
	const service = createQuestionBankUserService(environment.db, { now: () => new Date(currentTime) })
	const question = Array.from(environment.collections.question_bank_questions.values())[0]
	const subjectId = question.subjectId
	const userId = 'user-one'
	const wrongAlias = question.options.map(item => item.alias)
		.find(alias => question.answer.indexOf(alias) === -1)

	const profile = await service.execute({ action: 'getUserProfile' }, userId)
	assert.deepEqual(profile, {
		uid: userId,
		nickname: '理财学员',
		avatar: 'https://example.com/avatar.png',
		weixinBound: true,
		registeredAt: new Date('2026-08-01T00:00:00.000Z').getTime(),
		lastLoginAt: new Date('2026-08-28T03:59:00.000Z').getTime()
	})

	const first = await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'answer-event-one',
			subjectId,
			questionId: question.questionId,
			selected: [wrongAlias],
			occurredAt: currentTime.getTime()
		}],
		progress: {
			progressId: 'progress-event-one',
			subjectId,
			chapterId: question.chapterId,
			questionId: question.questionId,
			occurredAt: currentTime.getTime()
		}
	}, userId)
	assert.deepEqual(first.acceptedEventIds, ['answer-event-one'])
	assert.equal(first.answerResults[0].correct, false)
	assert.deepEqual(first.progress, { progressId: 'progress-event-one', saved: true })

	const duplicate = await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'answer-event-one',
			subjectId,
			questionId: question.questionId,
			selected: [wrongAlias],
			occurredAt: currentTime.getTime()
		}]
	}, userId)
	assert.deepEqual(duplicate.duplicateEventIds, ['answer-event-one'])

	await service.execute({
		action: 'syncEvents',
		events: [
			{
				type: 'answer',
				eventId: 'answer-event-two',
				subjectId,
				questionId: question.questionId,
				selected: question.answer,
				occurredAt: currentTime.getTime() + 1000
			},
			{
				type: 'favorite',
				eventId: 'favorite-event-one',
				subjectId,
				questionId: question.questionId,
				favorite: true,
				occurredAt: currentTime.getTime() + 2000
			}
		]
	}, userId)

	const summary = await service.execute({ action: 'getSummary', subjectId }, userId)
	assert.deepEqual({
		attempted: summary.attempted,
		correct: summary.correct,
		wrong: summary.wrong,
		favorite: summary.favorite,
		totalAttempts: summary.totalAttempts,
		todayAttempts: summary.todayAttempts
	}, {
		attempted: 1,
		correct: 1,
		wrong: 0,
		favorite: 1,
		totalAttempts: 2,
		todayAttempts: 2
	})

	const snapshot = await service.execute({ action: 'getStateSnapshot', subjectId }, userId)
	assert.deepEqual(snapshot.answeredQuestionIds, [question.questionId])
	assert.deepEqual(snapshot.answerSelections[question.questionId], question.answer)
	assert.deepEqual(snapshot.wrongQuestionIds, [])
	assert.deepEqual(snapshot.favoriteQuestionIds, [question.questionId])
	assert.equal(snapshot.chapterAttempts[question.chapterId], 1)

	const savedProgress = await service.execute({ action: 'getProgress' }, userId)
	assert.deepEqual(savedProgress, {
		subjectId,
		chapterId: question.chapterId,
		questionId: question.questionId,
		progressAt: currentTime.getTime()
	})
	assert.equal(environment.collections.question_bank_user_progress.size, 1)
	assert.equal(environment.collections.question_bank_user_attempts, undefined)

	const nextQuestion = Array.from(environment.collections.question_bank_questions.values())
		.find(item => item.subjectId === subjectId && item.questionId !== question.questionId)
	await service.execute({
		action: 'syncEvents',
		events: [],
		progress: {
			progressId: 'progress-event-two',
			subjectId,
			chapterId: nextQuestion.chapterId,
			questionId: nextQuestion.questionId,
			occurredAt: currentTime.getTime() + 3000
		}
	}, userId)
	const replacedProgress = await service.execute({ action: 'getProgress' }, userId)
	assert.equal(replacedProgress.questionId, nextQuestion.questionId)
	assert.equal(environment.collections.question_bank_user_progress.size, 1)

	const wrongRecords = await service.execute({
		action: 'getRecords', subjectId, type: 'wrong', page: 1, pageSize: 20
	}, userId)
	assert.equal(wrongRecords.total, 0)

	const favoriteRecords = await service.execute({
		action: 'getRecords', subjectId, type: 'favorite', page: 1, pageSize: 20
	}, userId)
	assert.equal(favoriteRecords.total, 1)
	assert.equal(favoriteRecords.items[0].recordId, `favorite-${question.questionId}`)
	assert.equal(favoriteRecords.items[0].question.id, question.questionId)

	const isolated = await service.execute({ action: 'getSummary', subjectId }, 'user-two')
	assert.equal(isolated.attempted, 0)
	assert.equal(isolated.favorite, 0)

	console.log('questionBankUser tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
