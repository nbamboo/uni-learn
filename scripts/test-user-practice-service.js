'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadService(environment) {
	const servicePath = path.resolve(__dirname, '../services/user-practice.js')
	let source = fs.readFileSync(servicePath, 'utf8')
	source = source
		.replace(/export default \{[\s\S]*?\}\s*$/, '')
		.replace(/\bexport\s+(?=(?:class|async\s+function|function|const|let|var)\b)/g, '')
	source += `\n;globalThis.__service = {
		createPracticeEventId,
		clearCurrentSubjectPracticeData,
		ensurePracticeUser,
		flushPracticeEvents,
		getChapterPracticePosition,
		getKnowledgePracticePosition,
		getLocalPracticePreferences,
		getPracticeProgress,
		getPracticePreferences,
		getPracticeRecords,
		getSmartPracticeQuestions,
		getPracticeStateSnapshot,
		getPracticeSummary,
		getPracticeUserProfile,
		pendingPracticeEventCount,
		queuePracticeAnswer,
		queuePracticeFavorite,
		savePracticeProgress,
		updatePracticePreferences
	}`
	vm.createContext(environment)
	vm.runInContext(source, environment, { filename: servicePath })
	return environment.__service
}

async function testWeixinLogin() {
	const loginUser = { uid: null, tokenExpired: 0 }
	let uniLoginCalls = 0
	let cloudLoginCalls = 0
	const environment = {
		uni: {
			getStorageSync: () => null,
			setStorageSync: () => {},
			login(options) {
				uniLoginCalls += 1
				options.success({ code: 'weixin-code-for-test' })
			}
		},
		uniCloud: {
			getCurrentUserInfo: () => loginUser,
			importObject(name, options) {
				assert.equal(name, 'uni-id-co')
				assert.equal(options.customUI, true)
				return {
					async loginByWeixin(payload) {
						cloudLoginCalls += 1
						assert.equal(payload.code, 'weixin-code-for-test')
						loginUser.uid = 'weixin-user'
						loginUser.tokenExpired = Date.now() + 60 * 60 * 1000
						return { errCode: 0 }
					}
				}
			}
		},
		console,
		setTimeout,
		clearTimeout,
		Date,
		Map,
		Set,
		Promise,
		Math,
		JSON,
		Error,
		Array,
		Object,
		Number,
		String,
		Boolean
	}
	const service = loadService(environment)
	const users = await Promise.all([
		service.ensurePracticeUser(),
		service.ensurePracticeUser()
	])
	assert.equal(users[0].uid, 'weixin-user')
	assert.equal(users[1].uid, 'weixin-user')
	assert.equal(uniLoginCalls, 1)
	assert.equal(cloudLoginCalls, 1)
}

async function testServerTokenRecovery() {
	const loginUser = { uid: 'stale-user', tokenExpired: Date.now() + 60 * 60 * 1000 }
	const removedKeys = []
	let cloudCalls = 0
	let loginCalls = 0
	const environment = {
		uni: {
			getStorageSync: () => null,
			setStorageSync: () => {},
			removeStorageSync(key) {
				removedKeys.push(key)
				loginUser.uid = null
				loginUser.tokenExpired = 0
			},
			login(options) {
				loginCalls += 1
				options.success({ code: 'fresh-weixin-code' })
			}
		},
		uniCloud: {
			getCurrentUserInfo: () => loginUser,
			importObject() {
				return {
					async loginByWeixin() {
						loginUser.uid = 'fresh-user'
						loginUser.tokenExpired = Date.now() + 60 * 60 * 1000
						return { errCode: 0 }
					}
				}
			},
			async callFunction() {
				cloudCalls += 1
				if (cloudCalls === 1) {
					return { result: { errCode: 'QUESTION_BANK_LOGIN_REQUIRED', errMsg: 'token invalid' } }
				}
				return {
					result: {
						errCode: 0,
						data: { uid: loginUser.uid, nickname: '', avatar: '', weixinBound: true }
					}
				}
			}
		},
		console,
		setTimeout,
		clearTimeout,
		Date,
		Map,
		Set,
		Promise,
		Math,
		JSON,
		Error,
		Array,
		Object,
		Number,
		String,
		Boolean
	}
	const service = loadService(environment)
	const profile = await service.getPracticeUserProfile()
	assert.equal(profile.uid, 'fresh-user')
	assert.equal(cloudCalls, 2)
	assert.equal(loginCalls, 1)
	assert.ok(removedKeys.indexOf('uni_id_token') > -1)
}

async function testPreferenceOfflineRetry() {
	const storage = new Map()
	const user = { uid: 'preference-user', tokenExpired: Date.now() + 60 * 60 * 1000 }
	let cloudCalls = 0
	const environment = {
		uni: {
			getStorageSync: key => storage.get(key),
			setStorageSync: (key, value) => storage.set(key, value),
			removeStorageSync: key => storage.delete(key)
		},
		uniCloud: {
			getCurrentUserInfo: () => user,
			async callFunction(request) {
				cloudCalls += 1
				if (cloudCalls === 1) {
					return {
						result: {
							errCode: 'QUESTION_BANK_USER_CLOUD_ERROR',
							errMsg: 'temporary failure'
						}
					}
				}
				return {
					result: {
						errCode: 0,
						data: {
							answerMode: request.data.answerMode,
							nightMode: request.data.nightMode,
							updatedAt: Date.now()
						}
					}
				}
			}
		},
		console,
		setTimeout,
		clearTimeout,
		Date,
		Map,
		Set,
		Promise,
		Math,
		JSON,
		Error,
		Array,
		Object,
		Number,
		String,
		Boolean
	}
	const service = loadService(environment)
	await assert.rejects(service.updatePracticePreferences({
		answerMode: 'exam',
		nightMode: true
	}))
	assert.equal(service.getLocalPracticePreferences().answerMode, 'exam')
	assert.equal(service.getLocalPracticePreferences()._syncPending, true)
	const retried = await service.getPracticePreferences()
	assert.equal(retried.answerMode, 'exam')
	assert.equal(retried.nightMode, true)
	assert.equal(retried._syncPending, false)
	assert.equal(cloudCalls, 2)
}

async function testBatchScheduling() {
	const storage = new Map()
	const timers = []
	const calls = []
	let nextTimerId = 0
	const user = { uid: 'batch-user', tokenExpired: Date.now() + 60 * 60 * 1000 }
	const environment = {
		uni: {
			getStorageSync: key => storage.get(key),
			setStorageSync: (key, value) => storage.set(key, value),
			removeStorageSync: key => storage.delete(key)
		},
		uniCloud: {
			getCurrentUserInfo: () => user,
			async callFunction(request) {
				calls.push(request)
				const summaries = {}
				request.data.events.forEach(item => {
					summaries[item.subjectId] = {
						subjectId: item.subjectId,
						attempted: request.data.events.length,
						correct: request.data.events.length,
						wrong: 0,
						favorite: 0,
						totalAttempts: request.data.events.length,
						todayAttempts: request.data.events.length,
						accuracy: 100
					}
				})
				return {
					result: {
						errCode: 0,
						data: {
							acceptedEventIds: request.data.events.map(item => item.eventId),
							duplicateEventIds: [],
							summaries,
							progress: null
						}
					}
				}
			}
		},
		console,
		setTimeout(handler, delay) {
			const timer = { id: ++nextTimerId, handler, delay, cleared: false }
			timers.push(timer)
			return timer.id
		},
		clearTimeout(timerId) {
			const timer = timers.find(item => item.id === timerId)
			if (timer) timer.cleared = true
		},
		Date,
		Map,
		Set,
		Promise,
		Math,
		JSON,
		Error,
		Array,
		Object,
		Number,
		String,
		Boolean
	}
	const service = loadService(environment)
	const question = {
		id: 'batch-question',
		subjectId: 'junior-personal-finance',
		chapterId: '1',
		knowledge: '批量同步',
		answer: ['A']
	}
	for (let index = 0; index < 9; index += 1) {
		service.queuePracticeAnswer(question, ['A'], {
			eventId: `batch-answer-${index}`,
			correct: true,
			occurredAt: Date.now() + index
		})
	}
	assert.equal(calls.length, 0)
	assert.equal(timers.filter(item => !item.cleared).slice(-1)[0].delay, 15 * 1000)
	service.queuePracticeAnswer(question, ['A'], {
		eventId: 'batch-answer-nine',
		correct: true,
		occurredAt: Date.now() + 9
	})
	const immediateTimer = timers.filter(item => !item.cleared).slice(-1)[0]
	assert.equal(immediateTimer.delay, 0)
	immediateTimer.handler()
	await service.flushPracticeEvents({ includeProgress: false })
	assert.equal(calls.length, 1)
	assert.equal(calls[0].data.events.length, 10)
	assert.equal(service.pendingPracticeEventCount(), 0)
}

async function testEmptyFlushDoesNotLogin() {
	let loginCalls = 0
	const environment = {
		uni: {
			getStorageSync: () => null,
			setStorageSync: () => {},
			login() {
				loginCalls += 1
			}
		},
		uniCloud: {
			getCurrentUserInfo: () => ({ uid: null, tokenExpired: 0 })
		},
		console,
		setTimeout,
		clearTimeout,
		Date,
		Map,
		Set,
		Promise,
		Math,
		JSON,
		Error,
		Array,
		Object,
		Number,
		String,
		Boolean
	}
	const service = loadService(environment)
	const result = await service.flushPracticeEvents({ includeProgress: false })
	assert.deepEqual(JSON.parse(JSON.stringify(result)), { synced: true, pending: 0 })
	assert.equal(loginCalls, 0)
}

async function testMembershipPreferenceDowngrade() {
	const storage = new Map([[
		'uni-learn-practice-preferences-v1:member-expired-user',
		{
			version: 1,
			preferences: { answerMode: 'exam', nightMode: true, updatedAt: Date.now() },
			dirty: true,
			syncedAt: 0
		}
	]])
	const user = { uid: 'member-expired-user', tokenExpired: Date.now() + 60 * 60 * 1000 }
	const environment = {
		uni: {
			getStorageSync: key => storage.get(key),
			setStorageSync: (key, value) => storage.set(key, value),
			removeStorageSync: key => storage.delete(key)
		},
		uniCloud: {
			getCurrentUserInfo: () => user,
			async callFunction() {
				return {
					result: {
						errCode: 'QUESTION_BANK_MEMBERSHIP_REQUIRED',
						errMsg: '考试模式和背题模式为会员权益'
					}
				}
			}
		},
		console,
		setTimeout,
		clearTimeout,
		Date,
		Map,
		Set,
		Promise,
		Math,
		JSON,
		Error,
		Array,
		Object,
		Number,
		String,
		Boolean
	}
	const service = loadService(environment)
	const loaded = await service.getPracticePreferences()
	assert.equal(loaded.answerMode, 'practice')
	assert.equal(loaded.nightMode, true)
	assert.equal(loaded._syncPending, false)
	await assert.rejects(
		service.updatePracticePreferences({ answerMode: 'review', nightMode: true }),
		error => error && error.errCode === 'QUESTION_BANK_MEMBERSHIP_REQUIRED'
	)
	assert.equal(service.getLocalPracticePreferences().answerMode, 'practice')
	assert.equal(service.getLocalPracticePreferences()._syncPending, false)
}

async function run() {
	const storage = new Map()
	const calls = []
	let cloudPreferences = { answerMode: 'practice', nightMode: false, updatedAt: 0 }
	const user = { uid: 'user-one', tokenExpired: Date.now() + 60 * 60 * 1000 }
	const environment = {
		uni: {
			getStorageSync: key => storage.get(key),
			setStorageSync: (key, value) => storage.set(key, value),
			removeStorageSync: key => storage.delete(key)
		},
		uniCloud: {
			getCurrentUserInfo: () => user,
			async callFunction(request) {
				calls.push(request)
				if (request.data.action === 'getPreferences') {
					return { result: { errCode: 0, data: Object.assign({}, cloudPreferences) } }
				}
				if (request.data.action === 'updatePreferences') {
					cloudPreferences = {
						answerMode: request.data.answerMode,
						nightMode: request.data.nightMode,
						updatedAt: Date.now()
					}
					return { result: { errCode: 0, data: Object.assign({}, cloudPreferences) } }
				}
				if (request.data.action === 'syncEvents') {
					const summaries = {}
					request.data.events.forEach(item => {
						summaries[item.subjectId] = {
							subjectId: item.subjectId,
							attempted: 1,
							correct: 0,
							wrong: 1,
							favorite: 1,
							totalAttempts: 1,
							todayAttempts: 1,
							accuracy: 0
						}
					})
					return {
						result: {
							errCode: 0,
							data: {
								acceptedEventIds: request.data.events.map(item => item.eventId),
								duplicateEventIds: [],
								summaries,
								progress: request.data.progress ? {
									progressId: request.data.progress.progressId,
									saved: true
								} : null
							}
						}
					}
				}
				if (request.data.action === 'getSummary') {
					return { result: { errCode: 0, data: { attempted: 1, wrong: 1, favorite: 1 } } }
				}
				if (request.data.action === 'getStateSnapshot') {
					return {
						result: {
								errCode: 0,
								data: {
								answeredQuestionIds: ['ipf-1'],
								answerSelections: { 'ipf-1': ['B'] },
								wrongQuestionIds: ['ipf-1'],
								favoriteQuestionIds: ['ipf-1'],
								chapterAttempts: { 1: 1 },
								knowledgeAttempts: { '个人理财基础': 1 },
								progressPositions: {
									chapter: { 1: 'ipf-1' },
									knowledge: { '个人理财基础': 'ipf-1' }
								}
								}
						}
					}
				}
				if (request.data.action === 'getRecords') {
					return {
						result: {
							errCode: 0,
							data: {
								subjectId: request.data.subjectId,
								type: request.data.type,
								page: request.data.page,
								pageSize: request.data.pageSize,
								total: 1,
								hasMore: false,
								items: [{ recordId: 'wrong-ipf-1', question: { id: 'ipf-1' } }]
							}
						}
					}
				}
				if (request.data.action === 'getSmartPractice') {
					return {
						result: {
							errCode: 0,
							data: { subjectId: request.data.subjectId, items: [{ id: 'ipf-1' }] }
						}
					}
				}
				if (request.data.action === 'clearCurrentSubjectData') {
					assert.equal(request.data.subjectId, 'junior-personal-finance')
					assert.equal(request.data.confirmation, 'CLEAR_CURRENT_SUBJECT')
					return {
						result: {
							errCode: 0,
							data: {
								cleared: true,
								subjectId: request.data.subjectId,
								deletedRecords: 4
							}
						}
					}
				}
				if (request.data.action === 'getUserProfile') {
					return {
						result: {
								errCode: 0,
								data: {
									uid: user.uid,
									nickname: '理财学员',
									avatar: '',
									weixinBound: true
								}
						}
					}
				}
				if (request.data.action === 'getProgress') {
					return {
						result: {
							errCode: 0,
							data: {
								subjectId: 'junior-personal-finance',
								mode: request.data.mode,
								chapterId: '1',
								knowledge: request.data.knowledge || '',
								questionId: 'ipf-1',
								progressAt: Date.now()
							}
						}
					}
				}
				throw new Error(`unexpected action ${request.data.action}`)
			}
		},
		console,
		setTimeout,
		clearTimeout,
		Date,
		Map,
		Set,
		Promise,
		Math,
		JSON,
		Error,
		Array,
		Object,
		Number,
		String,
		Boolean
	}
	const service = loadService(environment)
	assert.deepEqual(
		JSON.parse(JSON.stringify(service.getLocalPracticePreferences())),
		{ answerMode: 'practice', nightMode: false, updatedAt: 0, _syncPending: false }
	)
	const savedPreferences = await service.updatePracticePreferences({
		answerMode: 'review',
		nightMode: true
	})
	assert.equal(savedPreferences.answerMode, 'review')
	assert.equal(savedPreferences.nightMode, true)
	assert.equal(service.getLocalPracticePreferences()._syncPending, false)
	user.uid = 'user-two'
	assert.equal(service.getLocalPracticePreferences().answerMode, 'practice')
	assert.equal(service.getLocalPracticePreferences().nightMode, false)
	user.uid = 'user-one'
	const cloudSavedPreferences = await service.getPracticePreferences()
	assert.equal(cloudSavedPreferences.answerMode, 'review')
	assert.equal(cloudSavedPreferences.nightMode, true)
	assert.equal(calls.filter(item => item.data.action === 'updatePreferences').length, 1)
	assert.equal(calls.filter(item => item.data.action === 'getPreferences').length, 0)
	const question = {
		id: 'ipf-1',
		subjectId: 'junior-personal-finance',
		chapterId: '1',
		knowledge: '个人理财基础',
		answer: ['A']
	}
	service.savePracticeProgress(question, {
		progressId: 'progress-event-one',
		occurredAt: Date.now()
	})
	assert.equal(
		service.getChapterPracticePosition(question.subjectId, question.chapterId).questionId,
		question.id
	)
	service.queuePracticeAnswer(question, ['B'], {
		eventId: 'answer-event-one',
		practiceMode: 'chapter',
		occurredAt: Date.now()
	})
	service.queuePracticeFavorite(question, true, {
		eventId: 'favorite-event-one',
		occurredAt: Date.now()
	})
	assert.equal(service.pendingPracticeEventCount(), 3)
	await service.flushPracticeEvents({ includeProgress: false })
	assert.equal(service.pendingPracticeEventCount(), 1)
	const eventOnlyCall = calls.find(item => item.data.action === 'syncEvents')
	assert.equal(eventOnlyCall.data.progress, undefined)
	assert.equal(eventOnlyCall.data.events[0].judgedLocally, true)
	assert.equal(eventOnlyCall.data.events[0].correct, false)
	assert.equal(eventOnlyCall.data.events[0].chapterId, question.chapterId)
	assert.equal(eventOnlyCall.data.events[0].knowledge, question.knowledge)
	assert.equal(eventOnlyCall.data.events[0].practiceMode, 'chapter')
	await service.flushPracticeEvents()
	assert.equal(service.pendingPracticeEventCount(), 0)
	assert.equal(calls.filter(item => item.data.action === 'syncEvents').length, 2)
	const progressCall = calls.filter(item => item.data.action === 'syncEvents')[1]
	assert.equal(progressCall.data.events.length, 0)
	assert.equal(progressCall.data.progress.questionId, 'ipf-1')
	assert.equal(progressCall.data.progress.mode, 'chapter')

	service.savePracticeProgress(question, {
		mode: 'knowledge',
		knowledge: question.knowledge,
		progressId: 'progress-knowledge-one',
		occurredAt: Date.now()
	})
	assert.equal(
		service.getKnowledgePracticePosition(question.subjectId, question.knowledge).questionId,
		question.id
	)
	await service.flushPracticeEvents()
	const knowledgeProgressCall = calls.filter(item => item.data.action === 'syncEvents').slice(-1)[0]
	assert.equal(knowledgeProgressCall.data.progress.mode, 'knowledge')
	assert.equal(knowledgeProgressCall.data.progress.knowledge, question.knowledge)

	const pendingProgressCallCount = calls.filter(item => item.data.action === 'syncEvents').length
	service.savePracticeProgress(Object.assign({}, question, {
		id: 'ipf-2',
		knowledge: '理财业务分类'
	}), {
		mode: 'knowledge',
		progressId: 'progress-knowledge-two',
		occurredAt: Date.now() + 1
	})
	service.savePracticeProgress(Object.assign({}, question, {
		id: 'ipf-3',
		knowledge: '理财业务发展'
	}), {
		mode: 'knowledge',
		progressId: 'progress-knowledge-three',
		occurredAt: Date.now() + 2
	})
	assert.equal(service.pendingPracticeEventCount(), 2)
	await service.flushPracticeEvents()
	const multipleProgressCalls = calls
		.filter(item => item.data.action === 'syncEvents')
		.slice(pendingProgressCallCount)
	assert.equal(multipleProgressCalls.length, 2)
	assert.deepEqual(
		multipleProgressCalls.map(item => item.data.progress.knowledge),
		['理财业务分类', '理财业务发展']
	)
	assert.equal(service.pendingPracticeEventCount(), 0)

	const legacyTimestamp = Date.now() - 1000
	await service.flushPracticeEvents({
		localState: {
			answers: {
				'ipf-2': {
					subjectId: question.subjectId,
					selected: ['A'],
					timestamp: legacyTimestamp
				}
			},
			favorites: ['ipf-3'],
			favoriteSubjects: { 'ipf-3': question.subjectId },
			favoriteUpdatedAt: { 'ipf-3': legacyTimestamp }
		}
	})
	const migrationCall = calls.filter(item => item.data.action === 'syncEvents').slice(-1)[0]
	assert.deepEqual(
		Array.from(migrationCall.data.events.map(item => item.type)).sort(),
		['answer', 'favorite']
	)
	assert.equal(storage.get(`uni-learn-practice-cloud-migration-v1:${user.uid}`).complete, true)

	const summary = await service.getPracticeSummary(question.subjectId)
	assert.equal(summary.attempted, 1)
	assert.equal(calls.filter(item => item.data.action === 'getSummary').length, 0)
	const snapshotOptions = {
		questionIds: ['ipf-1'],
		includeAggregates: false,
		includeProgress: false
	}
	const firstSnapshot = await service.getPracticeStateSnapshot(question.subjectId, snapshotOptions)
	const cachedSnapshot = await service.getPracticeStateSnapshot(question.subjectId, snapshotOptions)
	assert.deepEqual(Array.from(firstSnapshot.wrongQuestionIds), ['ipf-1'])
	assert.deepEqual(Array.from(firstSnapshot.answerSelections['ipf-1']), ['B'])
	assert.deepEqual(Array.from(cachedSnapshot.favoriteQuestionIds), ['ipf-1'])
	assert.equal(calls.filter(item => item.data.action === 'getStateSnapshot').length, 1)
	const snapshotCall = calls.find(item => item.data.action === 'getStateSnapshot')
	assert.deepEqual(Array.from(snapshotCall.data.questionIds), ['ipf-1'])
	assert.equal(snapshotCall.data.includeAggregates, false)
	assert.equal(snapshotCall.data.includeProgress, false)
	const firstRecords = await service.getPracticeRecords({
		subjectId: question.subjectId,
		type: 'wrong',
		page: 1,
		pageSize: 20
	})
	const cachedRecords = await service.getPracticeRecords({
		subjectId: question.subjectId,
		type: 'wrong',
		page: 1,
		pageSize: 20
	})
	assert.equal(firstRecords.items[0].recordId, 'wrong-ipf-1')
	assert.equal(cachedRecords.total, 1)
	assert.equal(calls.filter(item => item.data.action === 'getRecords').length, 1)
	await service.getSmartPracticeQuestions({ subjectId: question.subjectId, pageSize: 20 })
	await service.getSmartPracticeQuestions({ subjectId: question.subjectId, pageSize: 20 })
	assert.equal(calls.filter(item => item.data.action === 'getSmartPractice').length, 1)
	const profile = await service.getPracticeUserProfile()
	const cachedProfile = await service.getPracticeUserProfile()
	assert.equal(profile.nickname, '理财学员')
	assert.equal(cachedProfile.weixinBound, true)
	assert.equal(calls.filter(item => item.data.action === 'getUserProfile').length, 1)
	const progress = await service.getPracticeProgress({
		subjectId: question.subjectId,
		mode: 'chapter',
		chapterId: question.chapterId
	})
	assert.equal(progress.chapterId, '1')
	const progressReadCall = calls.filter(item => item.data.action === 'getProgress')[0]
	assert.equal(progressReadCall.data.mode, 'chapter')
	assert.equal(calls.filter(item => item.data.action === 'getProgress').length, 1)
	storage.set(`uni-learn-practice-cloud-outbox-v1:${user.uid}`, {
		version: 1,
		events: [{ eventId: 'answer-pending-one', subjectId: question.subjectId }]
	})
	storage.set(`uni-learn-practice-cloud-progress-v1:${user.uid}`, {
		version: 2,
		progresses: {
			current: {
				progressId: 'progress-pending-one',
				subjectId: question.subjectId,
				mode: 'chapter',
				chapterId: question.chapterId,
				questionId: question.id,
				occurredAt: Date.now()
			}
		}
	})
	storage.set(`uni-learn-practice-chapter-position-v1:${user.uid}`, {
		version: 1,
		positions: {
			[`${question.subjectId}|${question.chapterId}`]: {
				subjectId: question.subjectId,
				chapterId: question.chapterId,
				questionId: question.id,
				updatedAt: Date.now()
			},
			'junior-law|1': {
				subjectId: 'junior-law',
				chapterId: '1',
				questionId: 'law-1',
				updatedAt: Date.now()
			}
		}
	})
	const cleared = await service.clearCurrentSubjectPracticeData(question.subjectId)
	assert.equal(cleared.cleared, true)
	assert.equal(calls.filter(item => item.data.action === 'clearCurrentSubjectData').length, 1)
	assert.equal(storage.has(`uni-learn-practice-cloud-outbox-v1:${user.uid}`), false)
	assert.equal(storage.has(`uni-learn-practice-cloud-progress-v1:${user.uid}`), false)
	assert.equal(
		storage.get(`uni-learn-practice-chapter-position-v1:${user.uid}`).positions['junior-law|1'].questionId,
		'law-1'
	)
	assert.equal(storage.has(`uni-learn-practice-preferences-v1:${user.uid}`), true)
	await testWeixinLogin()
	await testServerTokenRecovery()
	await testPreferenceOfflineRetry()
	await testBatchScheduling()
	await testEmptyFlushDoesNotLogin()
	await testMembershipPreferenceDowngrade()

	console.log('user-practice service tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
