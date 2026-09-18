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
		if (Array.isArray(document[key])) return document[key].indexOf(expected) > -1
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
	const catalogSeedPath = path.join(databaseDir, 'question_bank_catalogs.init_data.json')
	const questionSeedPath = path.join(databaseDir, 'question_bank_questions.init_data.json')
	let catalogRows
	let questionRows
	if (fs.existsSync(catalogSeedPath) && fs.existsSync(questionSeedPath)) {
		catalogRows = JSON.parse(fs.readFileSync(catalogSeedPath, 'utf8'))
		questionRows = JSON.parse(fs.readFileSync(questionSeedPath, 'utf8'))
	} else {
		const outputRoot = path.resolve(__dirname, '../../../outputs/question-bank/junior-personal-finance')
		const version = fs.readdirSync(outputRoot).filter(name => (
			fs.statSync(path.join(outputRoot, name)).isDirectory()
		)).sort().slice(-1)[0]
		const readJsonLines = filePath => fs.readFileSync(filePath, 'utf8')
			.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
		catalogRows = readJsonLines(path.join(outputRoot, version, 'catalog.json'))
		questionRows = readJsonLines(path.join(outputRoot, version, 'questions.json'))
	}
	return {
		question_bank_catalogs: catalogRows,
		question_bank_questions: questionRows,
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
		question_bank_user_rounds: [],
		question_bank_exam_drafts: [],
		question_bank_user_preferences: [],
		question_bank_feedbacks: [],
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
	const feedbackContext = {
		practiceMode: 'chapter',
		answerMode: 'practice',
		selectedAnswers: question.answer.slice(),
		revealed: true,
		questionIndex: 1,
		questionCount: 20,
		appVersion: '1.0.0',
		envVersion: 'trial',
		platform: 'android',
		system: 'Android 16',
		sdkVersion: '3.10.0'
	}

	const firstFeedback = await service.execute({
		action: 'submitQuestionFeedback',
		clientRequestId: 'feedback-request-one',
		subjectId,
		version: question.version,
		questionId: question.questionId,
		issueType: 'answer_error',
		description: '',
		context: feedbackContext,
		userId: 'forged-user'
	}, 'user-two')
	assert.equal(firstFeedback.merged, false)
	assert.equal(firstFeedback.reportCount, 1)
	assert.equal(firstFeedback.status, 'pending')
	const savedFeedback = environment.collections.question_bank_feedbacks.get(firstFeedback.feedbackId)
	assert.equal(savedFeedback.userId, 'user-two')
	assert.equal(savedFeedback.userSnapshot.nickname, '保留用户')
	assert.equal(savedFeedback.userSnapshot.weixinBound, false)
	assert.equal(savedFeedback.userSnapshot.isMember, false)
	assert.equal(savedFeedback.questionSnapshot.title, question.title)
	assert.deepEqual(savedFeedback.questionSnapshot.answer, question.answer)
	assert.equal(savedFeedback.context.appVersion, '1.0.0')

	const duplicateFeedback = await service.execute({
		action: 'submitQuestionFeedback',
		clientRequestId: 'feedback-request-one',
		subjectId,
		version: question.version,
		questionId: question.questionId,
		issueType: 'answer_error',
		description: '同一次请求不应重复计数',
		context: feedbackContext
	}, 'user-two')
	assert.equal(duplicateFeedback.feedbackId, firstFeedback.feedbackId)
	assert.equal(duplicateFeedback.reportCount, 1)

	const mergedFeedback = await service.execute({
		action: 'submitQuestionFeedback',
		clientRequestId: 'feedback-request-two',
		subjectId,
		version: question.version,
		questionId: question.questionId,
		issueType: 'answer_error',
		description: '正确答案似乎有误',
		context: feedbackContext
	}, 'user-two')
	assert.equal(mergedFeedback.feedbackId, firstFeedback.feedbackId)
	assert.equal(mergedFeedback.merged, true)
	assert.equal(mergedFeedback.reportCount, 2)
	const mergedDocument = environment.collections.question_bank_feedbacks.get(firstFeedback.feedbackId)
	assert.equal(mergedDocument.description, '正确答案似乎有误')
	assert.equal(mergedDocument.descriptionHistory.length, 1)
	mergedDocument.status = 'resolved'
	environment.collections.question_bank_feedbacks.set(mergedDocument._id, mergedDocument)
	const resolvedRetry = await service.execute({
		action: 'submitQuestionFeedback',
		clientRequestId: 'feedback-request-two',
		subjectId,
		version: question.version,
		questionId: question.questionId,
		issueType: 'answer_error',
		description: '正确答案似乎有误',
		context: feedbackContext
	}, 'user-two')
	assert.equal(resolvedRetry.feedbackId, firstFeedback.feedbackId)
	assert.equal(resolvedRetry.reportCount, 2)
	assert.equal(resolvedRetry.status, 'resolved')
	assert.equal(environment.collections.question_bank_feedbacks.size, 1)
	const reopenedFeedback = await service.execute({
		action: 'submitQuestionFeedback',
		clientRequestId: 'feedback-request-three',
		subjectId,
		version: question.version,
		questionId: question.questionId,
		issueType: 'answer_error',
		description: '',
		context: feedbackContext
	}, 'user-two')
	assert.notEqual(reopenedFeedback.feedbackId, firstFeedback.feedbackId)
	assert.equal(environment.collections.question_bank_feedbacks.size, 2)
	await assert.rejects(
		() => service.execute({
			action: 'submitQuestionFeedback',
			clientRequestId: 'feedback-request-four',
			subjectId,
			version: question.version,
			questionId: question.questionId,
			issueType: 'other',
			description: ' ',
			context: feedbackContext
		}, 'user-two'),
		error => error && error.errCode === 'QUESTION_BANK_USER_INVALID_ARGUMENT'
	)
	await assert.rejects(
		() => service.execute({
			action: 'submitQuestionFeedback',
			clientRequestId: 'feedback-request-five',
			subjectId,
			version: 'missing-version',
			questionId: question.questionId,
			issueType: 'text_error',
			description: '',
			context: feedbackContext
		}, 'user-two'),
		error => error && error.errCode === 'QUESTION_BANK_QUESTION_NOT_FOUND'
	)
	await assert.rejects(
		() => service.execute({
			action: 'submitQuestionFeedback',
			clientRequestId: 'feedback-request-six',
			subjectId,
			version: question.version,
			questionId: question.questionId,
			issueType: 'text_error',
			description: '',
			context: Object.assign({}, feedbackContext, { selectedAnswers: ['Z'] })
		}, 'user-two'),
		error => error && error.errCode === 'QUESTION_BANK_USER_INVALID_ARGUMENT'
	)
	const materialFeedbackQuestion = Array.from(environment.collections.question_bank_questions.values())
		.find(item => item.subjectId === subjectId && item.type === 'material')
	if (materialFeedbackQuestion) {
		const materialFeedback = await service.execute({
			action: 'submitQuestionFeedback',
			clientRequestId: 'feedback-material-one',
			subjectId,
			version: materialFeedbackQuestion.version,
			questionId: materialFeedbackQuestion.questionId,
			issueType: 'explanation_error',
			description: '材料题解析需要核查',
			context: Object.assign({}, feedbackContext, { practiceMode: 'smart' })
		}, userId)
		const materialFeedbackDocument = environment.collections.question_bank_feedbacks
			.get(materialFeedback.feedbackId)
		assert.equal(materialFeedbackDocument.userSnapshot.isMember, true)
		assert.equal(
			materialFeedbackDocument.questionSnapshot.materialGroupId,
			materialFeedbackQuestion.materialGroupId
		)
		assert.equal(
			materialFeedbackDocument.questionSnapshot.materialQuestionIndex,
			materialFeedbackQuestion.materialQuestionIndex
		)
	}

	const defaultPreferences = await service.execute({ action: 'getPreferences' }, userId)
	assert.deepEqual(defaultPreferences, {
		answerMode: 'practice',
		nightMode: false,
		smartPractice: require('./smart-practice.js').defaultSmartPractice(),
		updatedAt: 0
	})
	environment.collections.question_bank_memberships.set('user-grace', {
		_id: 'user-grace',
		userId: 'user-grace',
		status: 'expired',
		expiresAt: new Date(currentTime.getTime() - 5 * 60 * 60 * 1000)
	})
	assert.equal(
		(await service.execute({ action: 'getPreferences' }, 'user-grace')).answerMode,
		'practice'
	)
	environment.collections.question_bank_memberships.set('user-revoked', {
		_id: 'user-revoked',
		userId: 'user-revoked',
		status: 'revoked',
		expiresAt: new Date(currentTime.getTime() + 30 * 24 * 60 * 60 * 1000)
	})
	await assert.rejects(
		() => service.execute({ action: 'getPreferences' }, 'user-revoked'),
		error => error && error.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED'
	)

	const examQuestions = Array.from(environment.collections.question_bank_questions.values())
		.filter(item => item.subjectId === subjectId)
		.slice(0, 2)
	const examScope = {
		mode: 'chapter',
		chapterId: String(examQuestions[0].chapterId),
		section: '',
		knowledge: '',
		keyword: ''
	}
	examScope.scopeKey = `chapter|${encodeURIComponent(examScope.chapterId)}`
	const examRoundId = 'exam-round-cloud-one'
	const examBaseTime = currentTime.getTime() - 4 * 60 * 1000
	const officialStateCountBeforeExam = environment.collections.question_bank_user_states.size
	const officialStatsCountBeforeExam = environment.collections.question_bank_user_stats.size
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'examStart',
			eventId: 'exam-start-cloud-one',
			subjectId,
			...examScope,
			roundId: examRoundId,
			questionVersion: examQuestions[0].version,
			questionIds: examQuestions.map(item => item.questionId),
			initialQuestionId: examQuestions[0].questionId,
			positionQuestionId: examQuestions[0].questionId,
			occurredAt: examBaseTime
		}, {
			type: 'examAnswer',
			eventId: 'exam-answer-cloud-one',
			subjectId,
			...examScope,
			roundId: examRoundId,
			questionId: examQuestions[0].questionId,
			selected: ['A'],
			positionQuestionId: examQuestions[0].questionId,
			occurredAt: examBaseTime + 1000
		}, {
			type: 'examPosition',
			eventId: 'exam-position-cloud-one',
			subjectId,
			...examScope,
			roundId: examRoundId,
			questionId: examQuestions[1].questionId,
			occurredAt: examBaseTime + 2000
		}]
	}, userId)
	const savedExamDraft = await service.execute({
		action: 'getExamDraft',
		subjectId,
		...examScope
	}, userId)
	assert.equal(savedExamDraft.active, true)
	assert.equal(savedExamDraft.roundId, examRoundId)
	assert.deepEqual(savedExamDraft.questionIds, examQuestions.map(item => item.questionId))
	assert.deepEqual(savedExamDraft.answers[0].selected, ['A'])
	assert.equal(savedExamDraft.positionQuestionId, examQuestions[1].questionId)
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'examStart',
			eventId: 'exam-start-cloud-one',
			subjectId,
			...examScope,
			roundId: examRoundId,
			questionVersion: examQuestions[0].version,
			questionIds: examQuestions.map(item => item.questionId),
			initialQuestionId: examQuestions[0].questionId,
			positionQuestionId: examQuestions[0].questionId,
			occurredAt: examBaseTime
		}]
	}, userId)
	const afterDuplicateStart = await service.execute({
		action: 'getExamDraft', subjectId, ...examScope
	}, userId)
	assert.equal(afterDuplicateStart.answers.length, 1)
	assert.equal(afterDuplicateStart.positionQuestionId, examQuestions[1].questionId)
	const examSummaries = await service.execute({ action: 'getExamDraftSummaries', subjectId }, userId)
	assert.equal(examSummaries.summaries[examScope.scopeKey].answered, 1)
	assert.equal(examSummaries.summaries[examScope.scopeKey].total, 2)
	assert.equal(examSummaries.summaries[examScope.scopeKey].hasProgress, true)
	assert.equal(environment.collections.question_bank_user_states.size, officialStateCountBeforeExam)
	assert.equal(environment.collections.question_bank_user_stats.size, officialStatsCountBeforeExam)

	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'examComplete',
			eventId: 'exam-complete-cloud-one',
			subjectId,
			...examScope,
			roundId: examRoundId,
			occurredAt: examBaseTime + 3000
		}]
	}, userId)
	const completedExamDraft = await service.execute({
		action: 'getExamDraft', subjectId, ...examScope
	}, userId)
	assert.equal(completedExamDraft.active, false)
	const replacementRoundId = 'exam-round-cloud-two'
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'examStart',
			eventId: 'exam-start-cloud-two',
			subjectId,
			...examScope,
			roundId: replacementRoundId,
			questionVersion: examQuestions[0].version,
			questionIds: examQuestions.map(item => item.questionId),
			initialQuestionId: examQuestions[0].questionId,
			positionQuestionId: examQuestions[0].questionId,
			occurredAt: examBaseTime + 5000
		}, {
			type: 'examAnswer',
			eventId: 'exam-answer-old-round-late',
			subjectId,
			...examScope,
			roundId: examRoundId,
			questionId: examQuestions[1].questionId,
			selected: ['B'],
			positionQuestionId: examQuestions[1].questionId,
			occurredAt: examBaseTime + 6000
		}]
	}, userId)
	const replacementDraft = await service.execute({
		action: 'getExamDraft', subjectId, ...examScope
	}, userId)
	assert.equal(replacementDraft.roundId, replacementRoundId)
	assert.equal(replacementDraft.answers.length, 0)
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'examAnswer',
			eventId: 'exam-answer-delayed-one',
			subjectId,
			...examScope,
			roundId: examRoundId,
			questionId: examQuestions[1].questionId,
			selected: ['B'],
			positionQuestionId: examQuestions[1].questionId,
			occurredAt: examBaseTime + 4000
		}]
	}, userId)
	const afterDelayedOldAnswer = await service.execute({
		action: 'getExamDraft', subjectId, ...examScope
	}, userId)
	assert.equal(afterDelayedOldAnswer.active, true)
	assert.equal(afterDelayedOldAnswer.roundId, replacementRoundId)
	assert.equal(afterDelayedOldAnswer.answers.length, 0)

	const formalCorrectQuestion = examQuestions[0]
	const formalWrongQuestion = examQuestions[1]
	const formalWrongAlias = formalWrongQuestion.options
		.map(item => item.alias)
		.find(alias => formalWrongQuestion.answer.indexOf(alias) === -1)
	const formalAnswerTime = examBaseTime + 7000
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'exam-formal-answer-correct',
			subjectId,
			questionId: formalCorrectQuestion.questionId,
			selected: formalCorrectQuestion.answer.slice(),
			occurredAt: formalAnswerTime
		}, {
			type: 'answer',
			eventId: 'exam-formal-answer-wrong',
			subjectId,
			questionId: formalWrongQuestion.questionId,
			selected: [formalWrongAlias],
			occurredAt: formalAnswerTime + 1000
		}]
	}, userId)
	const formalSummary = await service.execute({ action: 'getSummary', subjectId }, userId)
	assert.equal(formalSummary.attempted, 2)
	assert.equal(formalSummary.correct, 1)
	assert.equal(formalSummary.wrong, 1)
	assert.equal(formalSummary.totalAttempts, 2)
	const formalRecords = await service.execute({
		action: 'getRecords', subjectId, type: 'wrong', page: 1, pageSize: 20
	}, userId)
	assert.equal(formalRecords.total, 1)
	assert.equal(formalRecords.items[0].question.questionId, formalWrongQuestion.questionId)
	const formalRecordIds = await service.execute({
		action: 'getRecords', subjectId, type: 'wrong', idsOnly: true
	}, userId)
	assert.deepEqual(formalRecordIds.questionIds, [formalWrongQuestion.questionId])
	assert.equal(formalRecordIds.items, undefined)
	const formalSnapshot = await service.execute({
		action: 'getStateSnapshot',
		subjectId,
		questionIds: [formalCorrectQuestion.questionId, formalWrongQuestion.questionId]
	}, userId)
	assert.deepEqual(formalSnapshot.wrongQuestionIds, [formalWrongQuestion.questionId])
	assert.deepEqual(formalSnapshot.answerSelections[formalWrongQuestion.questionId], [formalWrongAlias])
	const formalRound = await service.execute({
		action: 'getPracticeRound', subjectId, chapterId: formalCorrectQuestion.chapterId
	}, userId)
	assert.equal(formalRound.answers.length, 0)
	const bootstrap = await service.execute({
		action: 'getPracticeBootstrap',
		subjectId,
		mode: 'chapter',
		chapterId: formalCorrectQuestion.chapterId,
		questionIds: [formalCorrectQuestion.questionId, formalWrongQuestion.questionId]
	}, userId)
	assert.equal(bootstrap.membership.isMember, true)
	assert.equal(bootstrap.preferences.answerMode, 'practice')
	assert.equal(bootstrap.practiceRound.chapterId, formalCorrectQuestion.chapterId)
	assert.deepEqual(bootstrap.snapshot.wrongQuestionIds, [formalWrongQuestion.questionId])
	for (const collectionName of ['question_bank_user_states', 'question_bank_user_stats']) {
		for (const [id, document] of environment.collections[collectionName]) {
			if (document.userId === userId && document.subjectId === subjectId) {
				environment.collections[collectionName].delete(id)
			}
		}
	}
	environment.reads.question_bank_catalogs = 0
	environment.reads.question_bank_questions = 0

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
	await assert.rejects(
		() => service.execute({
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
			}]
		}, 'user-nonmember'),
		error => error && error.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED'
	)
	for (const action of [
		'getSummary',
		'getStateSnapshot',
		'getProgress',
		'getPracticeRound',
		'getExamDraft',
		'getExamDraftSummaries',
		'getPracticeBootstrap',
		'getSmartPractice',
		'getSmartPracticeState',
		'getPreferences',
		'updatePreferences',
		'clearCurrentSubjectData'
	]) {
		await assert.rejects(
			() => service.execute({ action }, 'user-nonmember'),
			error => error && error.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED'
		)
	}
	assert.equal(Array.from(environment.collections.question_bank_user_states.values())
		.some(item => item.userId === 'user-nonmember'), false)
	const smartOnlyQuestion = Array.from(environment.collections.question_bank_questions.values())[1]
	environment.collections.question_bank_memberships.set('user-smart', {
		_id: 'user-smart',
		userId: 'user-smart',
		status: 'active',
		expiresAt: new Date('2027-08-28T04:00:00.000Z')
	})
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
		smartPractice: require('./smart-practice.js').defaultSmartPractice(),
		updatedAt: currentTime.getTime()
	})
	assert.equal(environment.collections.question_bank_user_preferences.size, 1)
	assert.deepEqual(
		await service.execute({ action: 'getPreferences' }, userId),
		updatedPreferences
	)
	const customPreference = { strategy: 'custom', questionCount: 35, custom: { fresh: 25, wrong: 65, mastered: 10 } }
	await service.execute({ action: 'updatePreferences', answerMode: 'exam', nightMode: true,
		smartPractice: customPreference }, userId)
	const legacySaved = await service.execute({ action: 'updatePreferences', answerMode: 'practice', nightMode: false }, userId)
	assert.deepEqual(legacySaved.smartPractice, customPreference)
	assert.deepEqual((await service.execute({ action: 'getPreferences' }, userId)).smartPractice, customPreference)
	await assert.rejects(service.execute({ action: 'updatePreferences', answerMode: 'practice', nightMode: false,
		smartPractice: { strategy: 'custom', questionCount: 20, custom: { fresh: 61, wrong: 29, mastered: 10 } } }, userId),
		error => error.errCode === 'QUESTION_BANK_USER_INVALID_ARGUMENT')
	await assert.rejects(
		() => service.execute({ action: 'getPreferences' }, 'user-two'),
		error => error && error.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED'
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
			section: question.section,
			knowledge: question.knowledge,
			occurredAt: currentTime.getTime()
		}],
		progress: {
			progressId: 'progress-event-one',
			subjectId,
			mode: 'chapter',
			chapterId: question.chapterId,
			section: question.section,
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
			section: question.section,
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
				section: question.section,
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
	assert.equal(snapshot.sectionAttempts[`${question.chapterId}|${question.section}`], 1)
	assert.equal(snapshot.progressPositions.chapter[question.chapterId], question.questionId)
	const aggregateOnlySnapshot = await service.execute({
		action: 'getStateSnapshot',
		subjectId,
		includeProgress: false
	}, userId)
	assert.deepEqual(aggregateOnlySnapshot.answeredQuestionIds, [])
	assert.equal(aggregateOnlySnapshot.chapterAttempts[question.chapterId], 1)
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'answer-knowledge-one',
			subjectId,
			questionId: question.questionId,
			selected: question.answer,
			practiceMode: 'knowledge',
			judgedLocally: true,
			correct: true,
			chapterId: question.chapterId,
			knowledge: question.knowledge,
			occurredAt: currentTime.getTime() + 2500
		}]
	}, userId)
	const knowledgeAggregateSnapshot = await service.execute({
		action: 'getStateSnapshot',
		subjectId,
		includeProgress: false
	}, userId)
	assert.equal(
		knowledgeAggregateSnapshot.knowledgeAttempts[`${question.chapterId}|${question.knowledge}`],
		1
	)
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'answer-section-one',
			subjectId,
			questionId: question.questionId,
			selected: question.answer,
			practiceMode: 'section',
			judgedLocally: true,
			correct: true,
			chapterId: question.chapterId,
			section: question.section,
			knowledge: question.knowledge,
			occurredAt: currentTime.getTime() + 2600
		}]
	}, userId)
	const sectionAggregateSnapshot = await service.execute({
		action: 'getStateSnapshot',
		subjectId,
		includeProgress: false
	}, userId)
	assert.equal(
		sectionAggregateSnapshot.sectionAttempts[`${question.chapterId}|${question.section}`],
		1
	)
	assert.equal(sectionAggregateSnapshot.chapterAttempts[question.chapterId], 1)

	const smartPractice = await service.execute({
		action: 'getSmartPractice',
		subjectId,
		pageSize: 20,
		seed: 'bounded-smart-test'
	}, userId)
	const subjectQuestionCount = Array.from(environment.collections.question_bank_questions.values())
		.filter(item => item.subjectId === subjectId).length
	assert.equal(smartPractice.total, subjectQuestionCount)
	assert.equal(smartPractice.items.length, 20)
	assert.equal(smartPractice.requestedQuestionCount, 20)
	assert.equal(smartPractice.actualQuestionCount, 20)
	assert.equal(smartPractice.overflowQuestionCount, 0)
	assert.ok(smartPractice.items.every(item => item.type && item.selectionMode))
	assert.equal(smartPractice.stateCounts.sampled, subjectQuestionCount)
	const ratioEnvironment = createDatabase(loadSeed(), new Date(currentTime))
	const ratioService = createQuestionBankUserService(ratioEnvironment.db, { now: () => new Date(currentTime) })
	const categoryById = new Map()
	const ratioQuestions = Array.from(ratioEnvironment.collections.question_bank_questions.values())
	ratioQuestions.forEach((item, index) => {
		const category = ['fresh', 'wrong', 'mastered'][index % 3]
		categoryById.set(item.questionId, category)
		if (category === 'fresh') return
		ratioEnvironment.collections.question_bank_user_states.set(item.questionId, {
			_id: item.questionId, questionId: item.questionId, userId, subjectId,
			attempted: true, lastCorrect: category === 'mastered', lastAnsweredAt: currentTime
		})
	})
	const ratioCatalog = ratioEnvironment.collections.question_bank_catalogs.get(subjectId)
	ratioCatalog.smartPracticeUnits = ratioQuestions
		.slice()
		.sort((left, right) => left.sortOrder - right.sortOrder)
		.map(item => ({
			unitId: `question:${item.questionId}`,
			questionIds: [item.questionId],
			questionCount: 1,
			sortOrder: item.sortOrder
		}))
	const mixed = await ratioService.execute({ action: 'getSmartPractice', subjectId, pageSize: 20,
		seed: 'ratio-test', smartPractice: { strategy: 'balanced', questionCount: 20, custom: { fresh: 60, wrong: 30, mastered: 10 } } }, userId)
	assert.equal(mixed.items.length, 20)
	assert.equal(mixed.stateCounts.sampled, subjectQuestionCount)
	assert.deepEqual(['fresh', 'wrong', 'mastered'].map(key => mixed.items.filter(item => categoryById.get(item.id) === key).length), [12, 6, 2])
	assert.equal(new Set(mixed.items.map(item => item.id)).size, 20)
	assert.equal(ratioEnvironment.reads.question_bank_user_states, 1)
	assert.equal(ratioEnvironment.reads.question_bank_questions, 1)
	const smartState = await ratioService.execute({
		action: 'getSmartPracticeState', subjectId
	}, userId)
	assert.equal(
		smartState.answeredQuestionIds.length,
		Array.from(categoryById.values()).filter(category => category !== 'fresh').length
	)
	assert.equal(
		smartState.wrongQuestionIds.length,
		Array.from(categoryById.values()).filter(category => category === 'wrong').length
	)
	await ratioService.execute({ action: 'getSmartPractice', subjectId, pageSize: 20,
		seed: 'ratio-test-second', smartPractice: { strategy: 'balanced', questionCount: 20, custom: { fresh: 60, wrong: 30, mastered: 10 } } }, userId)
	assert.equal(ratioEnvironment.reads.question_bank_user_states, 1)
	assert.equal(ratioEnvironment.reads.question_bank_user_preferences, 3)

	const memberMaterialSeed = loadSeed()
	const memberMaterialSubjectId = 'smart-material-fixture'
	const memberMaterialVersion = '2026-09-14-v1'
	memberMaterialSeed.question_bank_catalogs.push({
		_id: memberMaterialSubjectId,
		subjectId: memberMaterialSubjectId,
		name: '材料题智能练习测试',
		level: '初级',
		status: 1,
		activeVersion: memberMaterialVersion,
		questionSchemaVersion: 3,
		questionCount: 22,
		chapters: [{ id: '1', subjectId: memberMaterialSubjectId, name: '第一章', count: 22 }],
		knowledgeGroups: [],
		updatedAt: currentTime
	})
	const baseQuestion = memberMaterialSeed.question_bank_questions[0]
	for (let index = 1; index <= 18; index += 1) {
		const questionId = `smf-single-${index}`
		const question = Object.assign({}, baseQuestion, {
			_id: `${memberMaterialVersion}:${questionId}`,
			questionId,
			subjectId: memberMaterialSubjectId,
			version: memberMaterialVersion,
			type: 'single',
			selectionMode: 'single',
			title: `会员智能练习单题 ${index}`,
			sortOrder: index,
			status: 1
		})
		;['materialGroupId', 'materialText', 'materialQuestionIndex', 'materialQuestionCount']
			.forEach(field => delete question[field])
		memberMaterialSeed.question_bank_questions.push(question)
	}
	const memberMaterialQuestionIds = []
	for (let index = 1; index <= 4; index += 1) {
		const questionId = `smf-material-${index}`
		memberMaterialQuestionIds.push(questionId)
		memberMaterialSeed.question_bank_questions.push(Object.assign({}, baseQuestion, {
			_id: `${memberMaterialVersion}:${questionId}`,
			questionId,
			subjectId: memberMaterialSubjectId,
			version: memberMaterialVersion,
			type: 'material',
			selectionMode: 'multiple',
			title: `会员材料子题 ${index}`,
			materialGroupId: 'smf-material-group',
			materialText: '会员路径的材料正文',
			materialQuestionIndex: index,
			materialQuestionCount: 4,
			sortOrder: 18 + index,
			status: 1
		}))
	}
	const memberMaterialEnvironment = createDatabase(memberMaterialSeed, new Date(currentTime))
	memberMaterialQuestionIds.forEach((questionId, index) => {
		memberMaterialEnvironment.collections.question_bank_user_states.set(`smf-state-${index}`, {
			_id: `smf-state-${index}`,
			questionId,
			userId,
			subjectId: memberMaterialSubjectId,
			attempted: true,
			lastCorrect: true,
			lastAnsweredAt: currentTime
		})
	})
	const memberMaterialService = createQuestionBankUserService(memberMaterialEnvironment.db, {
		now: () => new Date(currentTime)
	})
	const memberMaterialResult = await memberMaterialService.execute({
		action: 'getSmartPractice',
		subjectId: memberMaterialSubjectId,
		pageSize: 20,
		seed: 'member-material-overflow-test',
		smartPractice: {
			strategy: 'custom',
			questionCount: 20,
			custom: { fresh: 100, wrong: 0, mastered: 0 }
		}
	}, userId)
	assert.equal(memberMaterialResult.requestedQuestionCount, 20)
	assert.equal(memberMaterialResult.actualQuestionCount, 22)
	assert.equal(memberMaterialResult.overflowQuestionCount, 2)
	assert.deepEqual(
		memberMaterialResult.items
			.filter(item => item.materialGroupId === 'smf-material-group')
			.map(item => item.materialQuestionIndex),
		[1, 2, 3, 4]
	)
	await assert.rejects(ratioService.execute({ action: 'getSmartPractice', subjectId,
		smartPractice: { strategy: 'unknown' } }, userId), error => error.errCode === 'QUESTION_BANK_USER_INVALID_ARGUMENT')
	await assert.rejects(ratioService.execute({ action: 'getSmartPractice', subjectId,
		smartPractice: { strategy: 'auto', questionCount: 20, custom: { fresh: 60, wrong: 30, mastered: 10 } } }, userId),
		error => error.errCode === 'QUESTION_BANK_USER_INVALID_ARGUMENT')
	await assert.rejects(ratioService.execute({ action: 'getSmartPractice', subjectId,
		smartPractice: { strategy: 'fresh', questionCount: 55, custom: { fresh: 60, wrong: 30, mastered: 10 } } }, userId),
		error => error.errCode === 'QUESTION_BANK_USER_INVALID_ARGUMENT')

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
		section: '',
		knowledge: '',
		questionId: question.questionId,
		progressAt: currentTime.getTime()
	})
	assert.equal(environment.collections.question_bank_user_progress.size, 0)
	assert.equal(environment.collections.question_bank_user_rounds.size, 1)
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
			section: nextQuestion.section,
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
	assert.equal(environment.collections.question_bank_user_progress.size, 0)

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
	assert.equal(environment.collections.question_bank_user_progress.size, 1)
	await service.execute({
		action: 'syncEvents',
		events: [],
		progress: {
			progressId: 'progress-section-one',
			subjectId,
			mode: 'section',
			chapterId: question.chapterId,
			section: question.section,
			questionId: question.questionId,
			occurredAt: currentTime.getTime() + 4500
		}
	}, userId)
	const sectionProgress = await service.execute({
		action: 'getProgress',
		subjectId,
		mode: 'section',
		chapterId: question.chapterId,
		section: question.section
	}, userId)
	assert.equal(sectionProgress.questionId, question.questionId)
	assert.equal(environment.collections.question_bank_user_progress.size, 1)
	const scopedSnapshot = await service.execute({ action: 'getStateSnapshot', subjectId }, userId)
	assert.equal(scopedSnapshot.progressPositions.chapter[question.chapterId], question.questionId)
	assert.equal(
		scopedSnapshot.progressPositions.knowledge[`${question.chapterId}|${question.knowledge}`],
		question.questionId
	)
	assert.equal(
		scopedSnapshot.progressPositions.section[`${question.chapterId}|${question.section}`],
		question.questionId
	)
	const initialRound = await service.execute({
		action: 'getPracticeRound',
		subjectId,
		chapterId: question.chapterId
	}, userId)
	assert.equal(initialRound.answers.length, 1)
	assert.equal(initialRound.answers[0].questionId, question.questionId)
	assert.equal(initialRound.positionQuestionId, question.questionId)

	const otherSection = '第二节 轮次隔离测试'
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'answer-other-section',
			subjectId,
			questionId: nextQuestion.questionId,
			selected: nextQuestion.answer,
			practiceMode: 'section',
			judgedLocally: true,
			correct: true,
			chapterId: nextQuestion.chapterId,
			section: otherSection,
			knowledge: nextQuestion.knowledge,
			occurredAt: currentTime.getTime() + 4700
		}],
		progress: {
			progressId: 'progress-other-section',
			subjectId,
			mode: 'section',
			chapterId: nextQuestion.chapterId,
			section: otherSection,
			questionId: nextQuestion.questionId,
			occurredAt: currentTime.getTime() + 4700
		}
	}, userId)
	assert.equal((await service.execute({
		action: 'getPracticeRound', subjectId, chapterId: question.chapterId
	}, userId)).answers.length, 2)

	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'roundReset',
			eventId: 'round-reset-section',
			subjectId,
			chapterId: question.chapterId,
			section: question.section,
			occurredAt: currentTime.getTime() + 5000
		}]
	}, userId)
	const sectionResetRound = await service.execute({
		action: 'getPracticeRound', subjectId, chapterId: question.chapterId
	}, userId)
	assert.equal(sectionResetRound.answers.length, 1)
	assert.equal(sectionResetRound.answers[0].section, otherSection)
	assert.equal(sectionResetRound.positionQuestionId, nextQuestion.questionId)

	// 重置后晚到的旧答题事件仍更新长期状态，但不能把本轮答案写回来。
	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'answer-delayed-before-reset',
			subjectId,
			questionId: question.questionId,
			selected: question.answer,
			practiceMode: 'chapter',
			judgedLocally: true,
			correct: true,
			chapterId: question.chapterId,
			section: question.section,
			knowledge: question.knowledge,
			occurredAt: currentTime.getTime() + 4900
		}]
	}, userId)
	assert.equal((await service.execute({
		action: 'getPracticeRound',
		subjectId,
		chapterId: question.chapterId,
		section: question.section
	}, userId)).answers.length, 0)

	await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'roundReset',
			eventId: 'round-reset-chapter',
			subjectId,
			chapterId: question.chapterId,
			occurredAt: currentTime.getTime() + 6000
		}],
		progress: {
			progressId: 'progress-delayed-reset',
			subjectId,
			mode: 'section',
			chapterId: question.chapterId,
			section: otherSection,
			questionId: nextQuestion.questionId,
			occurredAt: currentTime.getTime() + 5900
		}
	}, userId)
	assert.equal((await service.execute({
		action: 'getPracticeRound', subjectId, chapterId: question.chapterId
	}, userId)).answers.length, 0)
	assert.equal(await service.execute({
		action: 'getProgress',
		subjectId,
		mode: 'section',
		chapterId: question.chapterId,
		section: otherSection
	}, userId), null)
	const resetSnapshot = await service.execute({ action: 'getStateSnapshot', subjectId }, userId)
	assert.equal(resetSnapshot.chapterAttempts[question.chapterId] || 0, 0)
	assert.equal(resetSnapshot.sectionAttempts[`${question.chapterId}|${question.section}`] || 0, 0)

	const stateReadsBeforeWrongRecords = environment.reads.question_bank_user_states || 0
	const statsReadsBeforeWrongRecords = environment.reads.question_bank_user_stats || 0
	const wrongRecords = await service.execute({
		action: 'getRecords', subjectId, type: 'wrong', page: 1, pageSize: 20
	}, userId)
	assert.equal(wrongRecords.total, 0)
	assert.equal(environment.reads.question_bank_user_states, stateReadsBeforeWrongRecords + 1)
	assert.equal(environment.reads.question_bank_user_stats, statsReadsBeforeWrongRecords + 1)

	const stateReadsBeforeFavoriteRecords = environment.reads.question_bank_user_states || 0
	const statsReadsBeforeFavoriteRecords = environment.reads.question_bank_user_stats || 0
	const favoriteRecords = await service.execute({
		action: 'getRecords', subjectId, type: 'favorite', page: 1, pageSize: 20
	}, userId)
	assert.equal(favoriteRecords.total, 1)
	assert.equal(environment.reads.question_bank_user_states, stateReadsBeforeFavoriteRecords + 1)
	assert.equal(environment.reads.question_bank_user_stats, statsReadsBeforeFavoriteRecords + 1)
	assert.equal(favoriteRecords.items[0].recordId, `favorite-${question.questionId}`)
	assert.equal(favoriteRecords.items[0].question.id, question.questionId)
	assert.equal(favoriteRecords.items[0].question.type, question.type)
	assert.equal(favoriteRecords.items[0].question.selectionMode, undefined)

	const poisonUserId = 'user-poison-event'
	environment.collections.question_bank_memberships.set(poisonUserId, {
		_id: poisonUserId,
		userId: poisonUserId,
		status: 'active',
		expiresAt: new Date('2027-08-28T04:00:00.000Z')
	})
	const partialSync = await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'invalid-answer-poison',
			subjectId,
			questionId: question.questionId,
			selected: [],
			occurredAt: currentTime.getTime()
		}, {
			type: 'favorite',
			eventId: 'valid-favorite-after-poison',
			subjectId,
			questionId: question.questionId,
			favorite: true,
			occurredAt: currentTime.getTime() + 1
		}]
	}, poisonUserId)
	assert.deepEqual(partialSync.rejectedEventIds, ['invalid-answer-poison'])
	assert.deepEqual(partialSync.acceptedEventIds, ['valid-favorite-after-poison'])
	assert.equal((await service.execute({ action: 'getSummary', subjectId }, poisonUserId)).favorite, 1)

	const missingLegacyQuestion = await service.execute({
		action: 'syncEvents',
		events: [{
			type: 'answer',
			eventId: 'legacy-missing-question',
			subjectId,
			questionId: 'missing-question',
			selected: ['A'],
			occurredAt: currentTime.getTime() + 2
		}]
	}, poisonUserId)
	assert.deepEqual(missingLegacyQuestion.rejectedEventIds, ['legacy-missing-question'])
	assert.deepEqual(missingLegacyQuestion.acceptedEventIds, [])
	for (const collectionName of ['question_bank_user_states', 'question_bank_user_stats']) {
		for (const [id, document] of environment.collections[collectionName]) {
			if (document.userId === poisonUserId) environment.collections[collectionName].delete(id)
		}
	}
	environment.collections.question_bank_memberships.delete(poisonUserId)

	environment.collections.question_bank_memberships.set('user-other-member', {
		_id: 'user-other-member',
		userId: 'user-other-member',
		status: 'active',
		expiresAt: new Date('2027-08-28T04:00:00.000Z')
	})
	const isolated = await service.execute({ action: 'getSummary', subjectId }, 'user-other-member')
	assert.equal(isolated.attempted, 0)
	assert.equal(isolated.favorite, 0)
	const migrationUserId = 'user-aggregate-migration'
	environment.collections.question_bank_memberships.set(migrationUserId, {
		_id: migrationUserId,
		userId: migrationUserId,
		status: 'active',
		expiresAt: new Date('2027-08-28T04:00:00.000Z')
	})
	;['5', '6'].forEach((chapterId, index) => {
		const questionId = `migration-question-${index + 1}`
		environment.collections.question_bank_user_states.set(`${migrationUserId}|${subjectId}|${questionId}`, {
			_id: `${migrationUserId}|${subjectId}|${questionId}`,
			userId: migrationUserId,
			subjectId,
			questionId,
			chapterId,
			knowledge: '相关管理要求',
			attempted: true,
			practiceModes: ['knowledge']
		})
	})
	environment.collections.question_bank_user_states.set(`${migrationUserId}|${subjectId}|${question.questionId}`, {
		_id: `${migrationUserId}|${subjectId}|${question.questionId}`,
		userId: migrationUserId,
		subjectId,
		questionId: question.questionId,
		chapterId: question.chapterId,
		attempted: true,
		practiceModes: ['chapter']
	})
	environment.collections.question_bank_user_stats.set(`${migrationUserId}|${subjectId}`, {
		_id: `${migrationUserId}|${subjectId}`,
		userId: migrationUserId,
		subjectId,
		attempted: 3,
		correct: 3,
		wrong: 0,
		favorite: 0,
		totalAttempts: 3,
		todayKey: '2026-08-28',
		todayAttempts: 3,
		chapterAttempts: [],
		knowledgeAttempts: [{ key: '相关管理要求', count: 2 }],
		stateAggregateVersion: 2,
		createdAt: currentTime,
		updatedAt: currentTime
	})
	const migratedSnapshot = await service.execute({
		action: 'getStateSnapshot',
		subjectId,
		includeProgress: false
	}, migrationUserId)
	assert.equal(migratedSnapshot.knowledgeAttempts['5|相关管理要求'], 1)
	assert.equal(migratedSnapshot.knowledgeAttempts['6|相关管理要求'], 1)
	assert.equal(migratedSnapshot.knowledgeAttempts['相关管理要求'], 2)
	assert.equal(migratedSnapshot.chapterAttempts[question.chapterId] || 0, 0)
	assert.equal(migratedSnapshot.sectionAttempts[`${question.chapterId}|${question.section}`] || 0, 0)
	assert.equal(
		environment.collections.question_bank_user_stats.get(`${migrationUserId}|${subjectId}`).stateAggregateVersion,
		7
	)
	for (const collectionName of ['question_bank_user_states', 'question_bank_user_stats']) {
		for (const [id, document] of environment.collections[collectionName]) {
			if (document.userId === migrationUserId) environment.collections[collectionName].delete(id)
		}
	}
	environment.collections.question_bank_memberships.delete(migrationUserId)
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
	environment.collections.question_bank_user_rounds.set('other-subject-round', {
		_id: 'other-subject-round',
		userId,
		subjectId: otherSubjectId,
		chapterId: '1',
		answers: [],
		sectionPositions: [],
		sectionResets: [],
		chapterResetAt: new Date(0),
		createdAt: currentTime,
		updatedAt: currentTime
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
	assert.deepEqual(
		Array.from(environment.collections.question_bank_user_rounds.values()).map(item => item.subjectId),
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

	const oldCatalogSeed = loadSeed()
	oldCatalogSeed.question_bank_catalogs[0].questionSchemaVersion = 2
	const oldCatalogEnvironment = createDatabase(oldCatalogSeed, currentTime)
	const oldCatalogService = createQuestionBankUserService(oldCatalogEnvironment.db, {
		now: () => new Date(currentTime)
	})
	await assert.rejects(
		oldCatalogService.execute({
			action: 'getSmartPractice', subjectId, pageSize: 20
		}, userId),
		error => error.errCode === 'QUESTION_BANK_SCHEMA_VERSION_UNSUPPORTED'
	)

	const invalidQuestionSeed = loadSeed()
	invalidQuestionSeed.question_bank_questions.forEach(item => delete item.selectionMode)
	const invalidQuestionEnvironment = createDatabase(invalidQuestionSeed, currentTime)
	const invalidQuestionService = createQuestionBankUserService(invalidQuestionEnvironment.db, {
		now: () => new Date(currentTime)
	})
	await assert.rejects(
		invalidQuestionService.execute({
			action: 'getSmartPractice', subjectId, pageSize: 20, seed: 'invalid-v3-question'
		}, userId),
		error => error.errCode === 'QUESTION_BANK_INVALID_QUESTION_SCHEMA'
	)

	console.log('questionBankUser tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
