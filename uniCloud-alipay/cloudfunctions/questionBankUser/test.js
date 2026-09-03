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
	constructor(collection, condition, collectionName, reads) {
		this.collection = collection
		this.condition = condition || {}
		this.collectionName = collectionName
		this.reads = reads
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
		this.reads[this.collectionName] = (this.reads[this.collectionName] || 0) + 1
		return { total: this.rows().length }
	}

	async get() {
		this.reads[this.collectionName] = (this.reads[this.collectionName] || 0) + 1
		return {
			data: this.rows().slice(this.offset, this.offset + this.maximum)
				.map(item => project(item, this.fields))
		}
	}

	async remove() {
		const rows = this.rows()
		rows.forEach(item => this.collection.delete(item._id))
		return { deleted: rows.length }
	}
}

class FakeCollection extends FakeQuery {
	constructor(collection, collectionName, reads) {
		super(collection, {}, collectionName, reads)
	}

	doc(documentId) {
		return {
			get: async () => {
				this.reads[this.collectionName] = (this.reads[this.collectionName] || 0) + 1
				return {
					data: this.collection.has(documentId)
						? [Object.assign({}, this.collection.get(documentId))]
						: []
				}
			},
			set: async document => {
				this.collection.set(documentId, Object.assign({}, document, { _id: documentId }))
				return { updated: 1 }
			},
			remove: async () => {
				const deleted = this.collection.delete(documentId) ? 1 : 0
				return { deleted }
			}
		}
	}
}

function createDatabase(seed, now) {
	const collections = {}
	const reads = {}
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
			return new FakeCollection(collections[name], name, reads)
		},
		async startTransaction() {
			return {
				collection: name => db.collection(name),
				commit: async () => {},
				rollback: async () => {}
			}
		}
	}
	return { db, collections, reads }
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
		}, {
			_id: 'user-two',
			nickname: '保留用户'
		}],
		'uni-id-device': [
			{ _id: 'device-one', user_id: 'user-one' },
			{ _id: 'device-two', user_id: 'user-two' }
		],
		'uni-id-log': [
			{ _id: 'log-one', user_id: 'user-one' },
			{ _id: 'log-two', user_id: 'user-two' }
		],
		question_bank_user_states: [],
		question_bank_user_stats: [],
		question_bank_user_progress: [],
		question_bank_user_preferences: [],
		question_bank_memberships: [{
			_id: 'user-one',
			userId: 'user-one',
			status: 'active',
			expiresAt: new Date('2027-08-28T04:00:00.000Z'),
			grants: [],
			createdAt: new Date('2026-08-01T00:00:00.000Z'),
			updatedAt: new Date('2026-08-01T00:00:00.000Z')
		}]
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

	const defaultPreferences = await service.execute({ action: 'getPreferences' }, userId)
	assert.deepEqual(defaultPreferences, {
		answerMode: 'practice',
		nightMode: false,
		updatedAt: 0
	})

	await assert.rejects(
		() => service.execute({
			action: 'getRecords',
			subjectId,
			type: 'wrong',
			page: 1,
			pageSize: 20
		}, 'user-two'),
		error => error && error.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED'
	)
	const nonMemberSync = await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'answer-nonmember',
			subjectId,
			questionId: question.questionId,
			selected: [wrongAlias],
			practiceMode: 'smart',
			judgedLocally: true,
			correct: false,
			chapterId: question.chapterId,
			knowledge: question.knowledge,
			occurredAt: currentTime.getTime()
		}, {
			type: 'favorite',
			eventId: 'favorite-nonmember',
			subjectId,
			questionId: question.questionId,
			favorite: true,
			occurredAt: currentTime.getTime()
		}]
	}, 'user-nonmember')
	assert.deepEqual(nonMemberSync.acceptedEventIds, ['answer-nonmember'])
	assert.deepEqual(nonMemberSync.rejectedEventIds, ['favorite-nonmember'])
	const smartOnlyQuestion = Array.from(environment.collections.question_bank_questions.values())[1]
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'answer-smart-only',
			subjectId: smartOnlyQuestion.subjectId,
			questionId: smartOnlyQuestion.questionId,
			selected: smartOnlyQuestion.answer,
			practiceMode: 'smart',
			judgedLocally: true,
			correct: true,
			chapterId: smartOnlyQuestion.chapterId,
			knowledge: smartOnlyQuestion.knowledge,
			occurredAt: currentTime.getTime()
		}]
	}, 'user-smart')
	const smartOnlySnapshot = await service.execute({
		action: 'getStateSnapshot',
		subjectId: smartOnlyQuestion.subjectId,
		includeProgress: false
	}, 'user-smart')
	assert.deepEqual(smartOnlySnapshot.chapterAttempts, {})
	assert.deepEqual(smartOnlySnapshot.knowledgeAttempts, {})
	;['question_bank_user_states', 'question_bank_user_stats'].forEach(collectionName => {
		for (const [id, document] of environment.collections[collectionName]) {
			if (document.userId === 'user-smart') environment.collections[collectionName].delete(id)
		}
	})
	;['question_bank_user_states', 'question_bank_user_stats'].forEach(collectionName => {
		for (const [id, document] of environment.collections[collectionName]) {
			if (document.userId === 'user-nonmember') environment.collections[collectionName].delete(id)
		}
	})
	await assert.rejects(
		() => service.execute({
			action: 'updatePreferences',
			answerMode: 'exam',
			nightMode: false
		}, 'user-two'),
		error => error && error.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED'
	)
	const updatedPreferences = await service.execute({
		action: 'updatePreferences',
		answerMode: 'exam',
		nightMode: true
	}, userId)
	assert.deepEqual(updatedPreferences, {
		answerMode: 'exam',
		nightMode: true,
		updatedAt: currentTime.getTime()
	})
	assert.equal(environment.collections.question_bank_user_preferences.size, 1)
	assert.deepEqual(
		await service.execute({ action: 'getPreferences' }, userId),
		updatedPreferences
	)
	assert.deepEqual(
		await service.execute({ action: 'getPreferences' }, 'user-two'),
		{ answerMode: 'practice', nightMode: false, updatedAt: 0 }
	)
	await assert.rejects(
		service.execute({
			action: 'updatePreferences',
			answerMode: 'unsupported',
			nightMode: true
		}, userId),
		error => error && error.errCode === 'QUESTION_BANK_USER_INVALID_ARGUMENT'
	)

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
			practiceMode: 'chapter',
			judgedLocally: true,
			correct: false,
			chapterId: question.chapterId,
			knowledge: question.knowledge,
			occurredAt: currentTime.getTime()
		}],
		progress: {
			progressId: 'progress-event-one',
			subjectId,
			mode: 'chapter',
			chapterId: question.chapterId,
			questionId: question.questionId,
			occurredAt: currentTime.getTime()
		}
	}, userId)
	assert.deepEqual(first.acceptedEventIds, ['answer-event-one'])
	assert.equal(first.answerResults[0].correct, false)
	assert.deepEqual(first.progress, { progressId: 'progress-event-one', saved: true })
	assert.equal(first.summaries[subjectId].wrong, 1)
	assert.equal(environment.reads.question_bank_catalogs || 0, 0)
	assert.equal(environment.reads.question_bank_questions || 0, 0)

	const duplicate = await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'answer-event-one',
			subjectId,
			questionId: question.questionId,
			selected: [wrongAlias],
			practiceMode: 'chapter',
			judgedLocally: true,
			correct: false,
			chapterId: question.chapterId,
			knowledge: question.knowledge,
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
				practiceMode: 'chapter',
				judgedLocally: true,
				correct: true,
				chapterId: question.chapterId,
				knowledge: question.knowledge,
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

	const snapshot = await service.execute({
		action: 'getStateSnapshot',
		subjectId,
		questionIds: [question.questionId]
	}, userId)
	assert.deepEqual(snapshot.answeredQuestionIds, [question.questionId])
	assert.deepEqual(snapshot.answerSelections[question.questionId], question.answer)
	assert.deepEqual(snapshot.wrongQuestionIds, [])
	assert.deepEqual(snapshot.favoriteQuestionIds, [question.questionId])
	assert.equal(snapshot.chapterAttempts[question.chapterId], 1)
	assert.equal(snapshot.progressPositions.chapter[question.chapterId], question.questionId)
	const aggregateOnlySnapshot = await service.execute({
		action: 'getStateSnapshot',
		subjectId,
		includeProgress: false
	}, userId)
	assert.deepEqual(aggregateOnlySnapshot.answeredQuestionIds, [])
	assert.equal(aggregateOnlySnapshot.chapterAttempts[question.chapterId], 1)

	const smartPractice = await service.execute({
		action: 'getSmartPractice',
		subjectId,
		pageSize: 20,
		seed: 'bounded-smart-test'
	}, userId)
	assert.equal(smartPractice.total, 822)
	assert.equal(smartPractice.items.length, 20)
	assert.ok(smartPractice.stateCounts.sampled <= 100)

	const savedProgress = await service.execute({
		action: 'getProgress',
		subjectId,
		mode: 'chapter',
		chapterId: question.chapterId
	}, userId)
	assert.deepEqual(savedProgress, {
		subjectId,
		mode: 'chapter',
		chapterId: question.chapterId,
		knowledge: '',
		questionId: question.questionId,
		progressAt: currentTime.getTime()
	})
	assert.equal(environment.collections.question_bank_user_progress.size, 1)
	assert.equal(environment.collections.question_bank_user_attempts, undefined)

	const nextQuestion = Array.from(environment.collections.question_bank_questions.values())
		.find(item => item.subjectId === subjectId
			&& item.chapterId === question.chapterId
			&& item.questionId !== question.questionId)
	await service.execute({
		action: 'syncEvents',
		events: [],
		progress: {
			progressId: 'progress-event-two',
			subjectId,
			mode: 'chapter',
			chapterId: nextQuestion.chapterId,
			questionId: nextQuestion.questionId,
			occurredAt: currentTime.getTime() + 3000
		}
	}, userId)
	const replacedProgress = await service.execute({
		action: 'getProgress',
		subjectId,
		mode: 'chapter',
		chapterId: nextQuestion.chapterId
	}, userId)
	assert.equal(replacedProgress.questionId, nextQuestion.questionId)
	assert.equal(environment.collections.question_bank_user_progress.size, 1)

	await service.execute({
		action: 'syncEvents',
		events: [],
		progress: {
			progressId: 'progress-knowledge-one',
			subjectId,
			mode: 'knowledge',
			chapterId: question.chapterId,
			knowledge: question.knowledge,
			questionId: question.questionId,
			occurredAt: currentTime.getTime() + 4000
		}
	}, userId)
	const knowledgeProgress = await service.execute({
		action: 'getProgress',
		subjectId,
		mode: 'knowledge',
		chapterId: question.chapterId,
		knowledge: question.knowledge
	}, userId)
	assert.equal(knowledgeProgress.questionId, question.questionId)
	assert.equal(environment.collections.question_bank_user_progress.size, 2)
	const scopedSnapshot = await service.execute({ action: 'getStateSnapshot', subjectId }, userId)
	assert.equal(scopedSnapshot.progressPositions.chapter[question.chapterId], nextQuestion.questionId)
	assert.equal(scopedSnapshot.progressPositions.knowledge[question.knowledge], question.questionId)

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
	const otherSubjectId = 'junior-law'
	environment.collections.question_bank_user_states.set('other-subject-state', {
		_id: 'other-subject-state', userId, subjectId: otherSubjectId, questionId: 'law-1'
	})
	environment.collections.question_bank_user_stats.set('other-subject-stats', {
		_id: 'other-subject-stats', userId, subjectId: otherSubjectId, attempted: 1
	})
	environment.collections.question_bank_user_progress.set('other-subject-progress', {
		_id: 'other-subject-progress', userId, subjectId: otherSubjectId, mode: 'chapter'
	})

	await assert.rejects(
		service.execute({
			action: 'clearCurrentSubjectData',
			subjectId,
			confirmation: 'wrong'
		}, userId),
		error => error && error.errCode === 'QUESTION_BANK_USER_INVALID_ARGUMENT'
	)
	const cleared = await service.execute({
		action: 'clearCurrentSubjectData',
		subjectId,
		confirmation: 'CLEAR_CURRENT_SUBJECT'
	}, userId)
	assert.equal(cleared.cleared, true)
	assert.equal(cleared.subjectId, subjectId)
	assert.ok(cleared.deletedRecords >= 3)
	assert.deepEqual(
		Array.from(environment.collections.question_bank_user_states.values()).map(item => item.subjectId),
		[otherSubjectId]
	)
	assert.deepEqual(
		Array.from(environment.collections.question_bank_user_stats.values()).map(item => item.subjectId),
		[otherSubjectId]
	)
	assert.deepEqual(
		Array.from(environment.collections.question_bank_user_progress.values()).map(item => item.subjectId),
		[otherSubjectId]
	)
	assert.equal(environment.collections.question_bank_user_preferences.size, 1)
	assert.equal(environment.collections['uni-id-users'].has('user-one'), true)
	assert.equal(environment.collections['uni-id-users'].has('user-two'), true)
	assert.equal(environment.collections['uni-id-device'].has('device-one'), true)
	assert.equal(environment.collections['uni-id-device'].has('device-two'), true)
	assert.equal(environment.collections['uni-id-log'].has('log-one'), true)
	assert.equal(environment.collections['uni-id-log'].has('log-two'), true)
	assert.ok(environment.collections.question_bank_questions.size > 0)

	console.log('questionBankUser tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
