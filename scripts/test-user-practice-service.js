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
		flushPracticeEvents,
		getPracticeStateSnapshot,
		getPracticeSummary,
		pendingPracticeEventCount,
		queuePracticeAnswer,
		queuePracticeFavorite
	}`
	vm.createContext(environment)
	vm.runInContext(source, environment, { filename: servicePath })
	return environment.__service
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
								duplicateEventIds: []
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
								wrongQuestionIds: ['ipf-1'],
								favoriteQuestionIds: ['ipf-1'],
								chapterAttempts: { 1: 1 },
								knowledgeAttempts: {}
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
		subjectId: 'junior-personal-finance'
	}
	service.queuePracticeAnswer(question, ['B'], {
		eventId: 'answer-event-one',
		occurredAt: Date.now()
	})
	service.queuePracticeFavorite(question, true, {
		eventId: 'favorite-event-one',
		occurredAt: Date.now()
	})
	assert.equal(service.pendingPracticeEventCount(), 2)
	await service.flushPracticeEvents()
	assert.equal(service.pendingPracticeEventCount(), 0)
	assert.equal(calls.filter(item => item.data.action === 'syncEvents').length, 1)

	const summary = await service.getPracticeSummary(question.subjectId)
	assert.equal(summary.attempted, 1)
	const firstSnapshot = await service.getPracticeStateSnapshot(question.subjectId)
	const cachedSnapshot = await service.getPracticeStateSnapshot(question.subjectId)
	assert.deepEqual(Array.from(firstSnapshot.wrongQuestionIds), ['ipf-1'])
	assert.deepEqual(Array.from(cachedSnapshot.favoriteQuestionIds), ['ipf-1'])
	assert.equal(calls.filter(item => item.data.action === 'getStateSnapshot').length, 1)

	console.log('user-practice service tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
