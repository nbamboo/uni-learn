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
		ensurePracticeUser,
		flushPracticeEvents,
		getChapterPracticePosition,
		getPracticeProgress,
		getPracticeStateSnapshot,
		getPracticeSummary,
		getPracticeUserProfile,
		pendingPracticeEventCount,
		queuePracticeAnswer,
		queuePracticeFavorite,
		savePracticeProgress
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

async function run() {
	const storage = new Map()
	const calls = []
	const user = { uid: 'user-one', tokenExpired: Date.now() + 60 * 60 * 1000 }
	const environment = {
		uni: {
			getStorageSync: key => storage.get(key),
			setStorageSync: (key, value) => storage.set(key, value)
		},
		uniCloud: {
			getCurrentUserInfo: () => user,
			async callFunction(request) {
				calls.push(request)
				if (request.data.action === 'syncEvents') {
					return {
						result: {
							errCode: 0,
							data: {
								acceptedEventIds: request.data.events.map(item => item.eventId),
								duplicateEventIds: [],
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
									knowledgeAttempts: {}
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
								chapterId: '1',
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
	const question = {
		id: 'ipf-1',
		subjectId: 'junior-personal-finance',
		chapterId: '1'
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
	await service.flushPracticeEvents()
	assert.equal(service.pendingPracticeEventCount(), 0)
	assert.equal(calls.filter(item => item.data.action === 'syncEvents').length, 2)
	const progressCall = calls.filter(item => item.data.action === 'syncEvents')[1]
	assert.equal(progressCall.data.events.length, 0)
	assert.equal(progressCall.data.progress.questionId, 'ipf-1')

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
	const firstSnapshot = await service.getPracticeStateSnapshot(question.subjectId)
	const cachedSnapshot = await service.getPracticeStateSnapshot(question.subjectId)
	assert.deepEqual(Array.from(firstSnapshot.wrongQuestionIds), ['ipf-1'])
	assert.deepEqual(Array.from(firstSnapshot.answerSelections['ipf-1']), ['B'])
	assert.deepEqual(Array.from(cachedSnapshot.favoriteQuestionIds), ['ipf-1'])
	assert.equal(calls.filter(item => item.data.action === 'getStateSnapshot').length, 1)
	const profile = await service.getPracticeUserProfile()
	const cachedProfile = await service.getPracticeUserProfile()
	assert.equal(profile.nickname, '理财学员')
	assert.equal(cachedProfile.weixinBound, true)
	assert.equal(calls.filter(item => item.data.action === 'getUserProfile').length, 1)
	const progress = await service.getPracticeProgress()
	assert.equal(progress.chapterId, '1')
	assert.equal(calls.filter(item => item.data.action === 'getProgress').length, 1)
	await testWeixinLogin()
	await testServerTokenRecovery()

	console.log('user-practice service tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
