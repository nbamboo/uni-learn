'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadService(sandbox) {
	const servicePath = path.resolve(__dirname, '../services/question-bank.js')
	sandbox.require = require('node:module').createRequire(servicePath)
	let source = fs.readFileSync(servicePath, 'utf8')
	source = source
		.replace(/export default questionBankService\s*$/, '')
		.replace(/\bexport\s+(?=(?:class|async\s+function|function|const|let|var)\b)/g, '')
	source += `\n;globalThis.__questionBankService = {
		QuestionBankServiceError,
		getCatalogSummaries,
		getQuestionCatalog,
		getPracticePage,
		getAllPracticeQuestions,
		searchQuestionBank,
		getQuestionsByIds,
		checkQuestionAnswer,
		clearQuestionBankCache,
		getCacheState(subjectId) {
			const prefix = subjectId + '|'
			return {
				catalog: catalogMemoryCache.has(subjectId),
				page: Array.from(pageMemoryCache.keys()).some(key => key.indexOf(prefix) === 0),
				question: Array.from(questionMemoryCache.keys()).some(key => key.indexOf(prefix) === 0),
				answer: Array.from(answerMemoryCache.keys()).some(key => key.indexOf(prefix) === 0)
			}
		}
	}`
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: servicePath })
	return sandbox.__questionBankService
}

function createEnvironment() {
	const storage = new Map()
	const calls = []
	let currentTime = Date.now()
	let networkFailures = 0
	let catalogVersion = '2026-08-21'
	let catalogSchemaVersion = 3
	class TestDate extends Date {
		constructor(...args) {
			super(...(args.length ? args : [currentTime]))
		}

		static now() {
			return currentTime
		}
	}
	const questions = {
		q1: {
			id: 'ipf-1',
			questionId: 'ipf-1',
			subjectId: 'junior-personal-finance',
			chapterId: '1',
			chapter: '第一章',
			section: '第一节',
			knowledge: '共同知识点',
			type: 'single',
			selectionMode: 'single',
			title: '题目一',
			options: [{ alias: 'A', text: '选项一' }],
			answer: ['A'],
			sortOrder: 1
		},
		q2: {
			id: 'ipf-2',
			questionId: 'ipf-2',
			subjectId: 'junior-personal-finance',
			chapterId: '1',
			chapter: '第一章',
			section: '第一节',
			knowledge: '共同知识点',
			type: 'judgment',
			selectionMode: 'single',
			title: '题目二',
			options: [{ alias: 'B', text: '选项二' }],
			answer: ['B'],
			sortOrder: 2
		},
		q3: {
			id: 'ipf-3',
			questionId: 'ipf-3',
			subjectId: 'junior-personal-finance',
			chapterId: '1',
			chapter: '第一章',
			section: '第二节',
			knowledge: '另一个知识点',
			type: 'material',
			selectionMode: 'multiple',
			materialGroupId: 'ipf-material-1',
			materialText: '用于测试缓存恢复的材料正文',
			materialQuestionIndex: 1,
			materialQuestionCount: 1,
			title: '题目三',
			options: [{ alias: 'C', text: '选项三' }],
			answer: ['C'],
			sortOrder: 3
		}
	}

	const uni = {
		getStorageSync(key) {
			return storage.get(key)
		},
		setStorageSync(key, value) {
			storage.set(key, value)
		},
		removeStorageSync(key) {
			storage.delete(key)
		}
	}

	const uniCloud = {
		async callFunction(request) {
			calls.push(request)
			if (networkFailures > 0) {
				networkFailures -= 1
				throw new Error('network unavailable')
			}
			const data = request.data
			if (data.subjectId === 'missing-subject') {
				return {
					result: {
						errCode: 'QUESTION_BANK_SUBJECT_NOT_FOUND',
						errMsg: '科目不存在',
						data: null,
						requestId: 'request-error'
					}
				}
			}
			if (data.action === 'getCatalog') {
				return {
					result: {
						errCode: 0,
						errMsg: 'ok',
						data: {
							id: data.subjectId,
							subjectId: data.subjectId,
							activeVersion: catalogVersion,
							questionSchemaVersion: catalogSchemaVersion,
							questionCount: 3,
							chapters: [{
								id: '1',
								count: 3,
								sections: [{ name: '第一节', count: 2 }, { name: '第二节', count: 1 }]
							}],
							knowledgeGroups: [{
								chapterId: '1', name: '共同知识点', count: 2
							}, {
								chapterId: '1', name: '另一个知识点', count: 1
							}]
						}
					}
				}
			}
			if (data.action === 'getCatalogSummaries') {
				return {
					result: {
						errCode: 0,
						errMsg: 'ok',
						data: {
							items: [{
								subjectId: 'junior-personal-finance',
								activeVersion: catalogVersion,
								questionSchemaVersion: catalogSchemaVersion,
								questionCount: 3
							}, {
								subjectId: 'junior-law',
								activeVersion: '2026-09-01',
								questionSchemaVersion: catalogSchemaVersion,
								questionCount: 1250
							}]
						}
					}
				}
			}
			if (data.action === 'getPracticePage') {
				const isNextPage = data.cursor === 2
				const items = isNextPage ? [questions.q3] : [questions.q1, questions.q2]
				return {
					result: {
						errCode: 0,
						errMsg: 'ok',
						data: {
							subjectId: data.subjectId,
							version: catalogVersion,
							mode: data.mode,
							total: 3,
							nextCursor: isNextPage ? null : 2,
							hasMore: !isNextPage,
							requestedQuestionCount: data.mode === 'smart' ? data.pageSize : undefined,
							actualQuestionCount: data.mode === 'smart' ? items.length : undefined,
							overflowQuestionCount: data.mode === 'smart' ? 0 : undefined,
							items
						}
					}
				}
			}
			if (data.action === 'getQuestionsByIds') {
				const items = data.questionIds.map(questionId => (
					Object.values(questions).find(question => question.id === questionId)
				)).filter(Boolean)
				return {
					result: {
						errCode: 0,
						errMsg: 'ok',
						data: {
							version: catalogVersion,
							items,
							missingQuestionIds: data.questionIds.filter(questionId => (
								!items.some(question => question.id === questionId)
							))
						}
					}
				}
			}
			if (data.action === 'searchQuestions') {
				return {
					result: {
						errCode: 0,
						errMsg: 'ok',
						data: {
							version: catalogVersion,
							keyword: data.keyword,
							total: 1,
							items: [{ id: 'ipf-1', questionId: 'ipf-1', type: 'single', title: '题目一' }]
						}
					}
				}
			}
			if (data.action === 'checkAnswer') {
				return {
					result: {
						errCode: 0,
						errMsg: 'ok',
						data: {
							questionId: data.questionId,
							type: 'single',
							selected: data.selected,
							correct: data.selected.join(',') === 'A',
							answer: ['A'],
							explanation: '解析'
						}
					}
				}
			}
			throw new Error(`Unhandled action: ${data.action}`)
		}
	}

	return {
		sandbox: {
			uni,
			uniCloud,
			console,
			setTimeout,
			clearTimeout,
			Date: TestDate,
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
			Boolean,
			RegExp
		},
		calls,
		storage,
		questions,
		setNetworkFailures(value) {
			networkFailures = value
		},
		setCatalogVersion(value) {
			catalogVersion = value
		},
		setCatalogSchemaVersion(value) {
			catalogSchemaVersion = value
		},
		advanceTime(milliseconds) {
			currentTime += milliseconds
		},
		now() {
			return currentTime
		}
	}
}

function reloadService(environment) {
	const sandbox = Object.assign({}, environment.sandbox)
	delete sandbox.__questionBankService
	return loadService(sandbox)
}

async function testPersistentChapterCache() {
	const environment = createEnvironment()
	const subjectId = 'junior-personal-finance'
	const service = loadService(environment.sandbox)
	const params = { subjectId, mode: 'chapter', chapterId: '1' }

	const downloaded = await service.getAllPracticeQuestions(params)
	assert.equal(downloaded.items.length, 3)
	const cloudPagesAfterDownload = environment.calls.filter(call => (
		call.data.action === 'getPracticePage'
	)).length
	assert.equal(cloudPagesAfterDownload, 2)
	assert.equal(environment.storage.has('uni-learn-question-bank-chapter-cache-index-v1'), true)

	const coldStartService = reloadService(environment)
	const restored = await coldStartService.getAllPracticeQuestions(params)
	assert.deepEqual(Array.from(restored.items, item => item.id), ['ipf-1', 'ipf-2', 'ipf-3'])
	assert.equal(environment.calls.filter(call => call.data.action === 'getPracticePage').length, cloudPagesAfterDownload)

	const reuseService = reloadService(environment)
	const callsBeforeCrossModeReuse = environment.calls.length
	const localKnowledge = await reuseService.getAllPracticeQuestions({
		subjectId,
		mode: 'knowledge',
		chapterId: '1',
		knowledge: '共同知识点'
	})
	assert.deepEqual(Array.from(localKnowledge.items, item => item.id), ['ipf-1', 'ipf-2'])
	assert.equal(localKnowledge._localOnly, true)
	const localSection = await reuseService.getAllPracticeQuestions({
		subjectId,
		mode: 'section',
		chapterId: '1',
		section: '第二节'
	})
	assert.deepEqual(Array.from(localSection.items, item => item.id), ['ipf-3'])
	assert.equal(localSection._localOnly, true)
	const localSequence = await reuseService.getAllPracticeQuestions({ subjectId, mode: 'sequence' })
	assert.equal(localSequence.items.length, 3)
	assert.equal(localSequence._localOnly, true)
	const localSmart = await reuseService.getPracticePage({
		subjectId,
		mode: 'smart',
		pageSize: 2,
		answeredQuestionIds: ['ipf-1', 'ipf-2'],
		wrongQuestionIds: ['ipf-2']
	}, { versionFromResponse: true })
	assert.equal(localSmart.items.length, 2)
	assert.equal(localSmart.requestedQuestionCount, 2)
	assert.equal(localSmart.actualQuestionCount, 2)
	assert.equal(localSmart.overflowQuestionCount, 0)
	assert.equal(localSmart._localOnly, true)
	const ratioRequest = { subjectId, mode: 'smart', pageSize: 1,
		answeredQuestionIds: ['ipf-1', 'ipf-2'], wrongQuestionIds: ['ipf-2'],
		smartPractice: { strategy: 'custom', questionCount: 20, custom: { fresh: 0, wrong: 100, mastered: 0 } } }
	const wrongOnly = await reuseService.getPracticePage(ratioRequest, { versionFromResponse: true })
	assert.deepEqual(Array.from(wrongOnly.items, item => item.id), ['ipf-2'])
	ratioRequest.smartPractice.custom = { fresh: 0, wrong: 0, mastered: 100 }
	const correctOnly = await reuseService.getPracticePage(ratioRequest, { versionFromResponse: true })
	assert.deepEqual(Array.from(correctOnly.items, item => item.id), ['ipf-1'])
	assert.deepEqual(Array.from(wrongOnly.items, item => item.id), ['ipf-2'])
	await assert.rejects(reuseService.getPracticePage(Object.assign({}, ratioRequest, {
		smartPractice: { strategy: 'custom', questionCount: 20, custom: { fresh: 60, wrong: 40, mastered: 10 } }
	})), error => error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT')
	await assert.rejects(reuseService.getPracticePage(Object.assign({}, ratioRequest, {
		smartPractice: { strategy: 'auto', questionCount: 20, custom: { fresh: 60, wrong: 30, mastered: 10 } }
	})), error => error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT')
	await assert.rejects(reuseService.getPracticePage(Object.assign({}, ratioRequest, {
		smartPractice: { strategy: 'fresh', questionCount: 12, custom: { fresh: 60, wrong: 30, mastered: 10 } }
	})), error => error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT')
	const localSearch = await reuseService.searchQuestionBank({
		subjectId,
		keyword: '题目一',
		pageSize: 20
	})
	assert.deepEqual(Array.from(localSearch.items, item => item.id), ['ipf-1'])
	assert.equal(localSearch._localOnly, true)
	const localByIds = await reloadService(environment).getQuestionsByIds({
		subjectId,
		questionIds: ['ipf-3', 'ipf-1']
	})
	assert.deepEqual(Array.from(localByIds.items, item => item.id), ['ipf-3', 'ipf-1'])
	assert.equal(environment.calls.length, callsBeforeCrossModeReuse)
	const persistedCatalogCache = environment.storage.get('uni-learn-question-bank-catalog-cache-v1')
	persistedCatalogCache.entries[subjectId].expiresAt = environment.now() - 1
	environment.storage.set('uni-learn-question-bank-catalog-cache-v1', persistedCatalogCache)
	const catalogCallsBeforeExpiredReuse = environment.calls.filter(call => (
		call.data.action === 'getCatalog'
	)).length
	const practiceCallsBeforeExpiredReuse = environment.calls.filter(call => (
		call.data.action === 'getPracticePage'
	)).length
	const expiredCatalogSmart = await reloadService(environment).getPracticePage({
		subjectId,
		mode: 'smart',
		pageSize: 2,
		answeredQuestionIds: [],
		wrongQuestionIds: []
	}, { versionFromResponse: true })
	assert.equal(expiredCatalogSmart._localOnly, true)
	assert.equal(environment.calls.filter(call => call.data.action === 'getCatalog').length, catalogCallsBeforeExpiredReuse + 1)
	assert.equal(environment.calls.filter(call => call.data.action === 'getPracticePage').length, practiceCallsBeforeExpiredReuse)

	environment.setCatalogVersion('2026-09-01')
	await coldStartService.getQuestionCatalog(subjectId, { forceRefresh: true })
	const cloudPagesBeforeVersionReload = environment.calls.filter(call => (
		call.data.action === 'getPracticePage'
	)).length
	const versionReloaded = await coldStartService.getAllPracticeQuestions(params)
	assert.equal(versionReloaded.version, '2026-09-01')
	assert.equal(
		environment.calls.filter(call => call.data.action === 'getPracticePage').length,
		cloudPagesBeforeVersionReload + 2
	)
	const versionedIndex = environment.storage.get('uni-learn-question-bank-chapter-cache-index-v1')
	const versionedEntries = Object.values(versionedIndex.entries)
	assert.equal(versionedEntries.length, 1)
	assert.equal(versionedEntries[0].version, '2026-09-01')

	const secondColdStartService = reloadService(environment)
	const cloudPagesBeforeSecondColdStart = environment.calls.filter(call => (
		call.data.action === 'getPracticePage'
	)).length
	await secondColdStartService.getAllPracticeQuestions(params)
	assert.equal(
		environment.calls.filter(call => call.data.action === 'getPracticePage').length,
		cloudPagesBeforeSecondColdStart
	)

	await secondColdStartService.getAllPracticeQuestions(params, { forceRefresh: true })
	assert.equal(
		environment.calls.filter(call => call.data.action === 'getPracticePage').length,
		cloudPagesBeforeSecondColdStart + 2
	)
	secondColdStartService.clearQuestionBankCache(subjectId)
	const clearedIndex = environment.storage.get('uni-learn-question-bank-chapter-cache-index-v1')
	assert.equal(Object.keys(clearedIndex.entries).length, 0)
}

async function testSequenceBuildsChapterCache() {
	const environment = createEnvironment()
	const subjectId = 'junior-personal-finance'
	const service = loadService(environment.sandbox)
	const sequence = await service.getAllPracticeQuestions({ subjectId, mode: 'sequence' })
	assert.equal(sequence.items.length, 3)
	const cloudPages = environment.calls.filter(call => call.data.action === 'getPracticePage').length
	assert.equal(environment.storage.has('uni-learn-question-bank-chapter-cache-index-v1'), true)
	const restarted = reloadService(environment)
	const chapter = await restarted.getAllPracticeQuestions({
		subjectId,
		mode: 'chapter',
		chapterId: '1'
	})
	assert.deepEqual(Array.from(chapter.items, item => item.id), ['ipf-1', 'ipf-2', 'ipf-3'])
	assert.equal(chapter._localOnly, true)
	assert.equal(
		environment.calls.filter(call => call.data.action === 'getPracticePage').length,
		cloudPages
	)
}

async function testPracticePageVersionFromResponse() {
	const environment = createEnvironment()
	const subjectId = 'junior-personal-finance'
	const service = loadService(environment.sandbox)
	const params = {
		subjectId,
		mode: 'smart',
		pageSize: 20,
		answeredQuestionIds: ['ipf-1'],
		wrongQuestionIds: []
	}

	const firstPage = await service.getPracticePage(params, { versionFromResponse: true })
	const cachedPage = await service.getPracticePage(params, { versionFromResponse: true })
	assert.equal(firstPage.version, '2026-08-21')
	assert.equal(cachedPage.version, '2026-08-21')
	assert.equal(environment.calls.filter(call => call.data.action === 'getCatalog').length, 0)
	assert.equal(environment.calls.filter(call => call.data.action === 'getPracticePage').length, 1)

	await service.getQuestionCatalog(subjectId)
	environment.setCatalogVersion('2026-09-01')
	const catalogCallsBeforeRefresh = environment.calls.filter(call => (
		call.data.action === 'getCatalog'
	)).length
	const refreshedPage = await service.getPracticePage(params, {
		versionFromResponse: true,
		forceRefresh: true
	})
	assert.equal(refreshedPage.version, '2026-09-01')
	assert.equal(
		environment.calls.filter(call => call.data.action === 'getCatalog').length,
		catalogCallsBeforeRefresh
	)

	const refreshedCatalog = await service.getQuestionCatalog(subjectId)
	assert.equal(refreshedCatalog.activeVersion, '2026-09-01')
	assert.equal(
		environment.calls.filter(call => call.data.action === 'getCatalog').length,
		catalogCallsBeforeRefresh + 1
	)
}

async function testCatalogCacheDurations() {
	const environment = createEnvironment()
	const subjectId = 'junior-personal-finance'
	const service = loadService(environment.sandbox)
	const hour = 60 * 60 * 1000

	await service.getQuestionCatalog(subjectId)
	const persisted = environment.storage.get('uni-learn-question-bank-catalog-cache-v1')
	assert.equal(persisted.entries[subjectId].expiresAt - environment.now(), 24 * hour)
	assert.equal(environment.calls.filter(call => call.data.action === 'getCatalog').length, 1)

	// Once memory expires after two hours, the 24-hour local entry still avoids a cloud call.
	environment.advanceTime(2 * hour + 1)
	await service.getQuestionCatalog(subjectId)
	assert.equal(environment.calls.filter(call => call.data.action === 'getCatalog').length, 1)

	// Restoring from local storage must only refill memory for another two hours.
	persisted.entries[subjectId].expiresAt = environment.now() - 1
	environment.advanceTime(2 * hour - 1)
	await service.getQuestionCatalog(subjectId)
	assert.equal(environment.calls.filter(call => call.data.action === 'getCatalog').length, 1)
	environment.advanceTime(2)
	await service.getQuestionCatalog(subjectId)
	assert.equal(environment.calls.filter(call => call.data.action === 'getCatalog').length, 2)

	const memoryEnvironment = createEnvironment()
	const memoryService = loadService(memoryEnvironment.sandbox)
	await memoryService.getQuestionCatalog(subjectId)
	const memoryPersisted = memoryEnvironment.storage.get('uni-learn-question-bank-catalog-cache-v1')
	memoryPersisted.entries[subjectId].expiresAt = memoryEnvironment.now() - 1
	memoryEnvironment.advanceTime(2 * hour - 1)
	await memoryService.getQuestionCatalog(subjectId)
	assert.equal(memoryEnvironment.calls.filter(call => call.data.action === 'getCatalog').length, 1)
	memoryEnvironment.advanceTime(2)
	await memoryService.getQuestionCatalog(subjectId)
	assert.equal(memoryEnvironment.calls.filter(call => call.data.action === 'getCatalog').length, 2)

	const summariesEnvironment = createEnvironment()
	const summariesService = loadService(summariesEnvironment.sandbox)
	await summariesService.getCatalogSummaries()
	const summariesStorageKey = 'uni-learn-question-bank-catalog-summaries-cache-v1'
	const persistedSummaries = summariesEnvironment.storage.get(summariesStorageKey)
	assert.equal(persistedSummaries.expiresAt - summariesEnvironment.now(), 24 * hour)
	assert.equal(summariesEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 1)

	// The two-hour memory entry is used before local storage is consulted.
	summariesEnvironment.advanceTime(2 * hour - 1)
	await summariesService.getCatalogSummaries()
	assert.equal(summariesEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 1)

	// After memory expires, the 24-hour local entry restores memory without a cloud call.
	summariesEnvironment.advanceTime(2)
	await summariesService.getCatalogSummaries()
	assert.equal(summariesEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 1)
	const coldSummariesService = reloadService(summariesEnvironment)
	await coldSummariesService.getCatalogSummaries()
	assert.equal(summariesEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 1)

	// Memory restored from local storage is capped at two hours.
	persistedSummaries.expiresAt = summariesEnvironment.now() - 1
	summariesEnvironment.advanceTime(2 * hour - 1)
	await coldSummariesService.getCatalogSummaries()
	assert.equal(summariesEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 1)
	summariesEnvironment.advanceTime(2)
	await coldSummariesService.getCatalogSummaries()
	assert.equal(summariesEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 2)
	await coldSummariesService.getCatalogSummaries({ forceRefresh: true })
	assert.equal(summariesEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 3)

	const summaryMemoryEnvironment = createEnvironment()
	const summaryMemoryService = loadService(summaryMemoryEnvironment.sandbox)
	await summaryMemoryService.getCatalogSummaries()
	const summaryMemoryPersisted = summaryMemoryEnvironment.storage.get(summariesStorageKey)
	summaryMemoryPersisted.expiresAt = summaryMemoryEnvironment.now() - 1
	summaryMemoryEnvironment.advanceTime(2 * hour - 1)
	await summaryMemoryService.getCatalogSummaries()
	assert.equal(summaryMemoryEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 1)
	summaryMemoryEnvironment.advanceTime(2)
	await summaryMemoryService.getCatalogSummaries()
	assert.equal(summaryMemoryEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 2)

	const expiryEnvironment = createEnvironment()
	const expiryService = loadService(expiryEnvironment.sandbox)
	await expiryService.getCatalogSummaries()
	expiryEnvironment.advanceTime(24 * hour - 1)
	await expiryService.getCatalogSummaries()
	assert.equal(expiryEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 1)
	expiryEnvironment.advanceTime(2)
	await expiryService.getCatalogSummaries()
	assert.equal(expiryEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 2)

	const invalidEnvironment = createEnvironment()
	invalidEnvironment.storage.set(summariesStorageKey, {
		version: 1,
		expiresAt: invalidEnvironment.now() + hour,
		items: [{ subjectId, activeVersion: 'broken' }]
	})
	await loadService(invalidEnvironment.sandbox).getCatalogSummaries()
	assert.equal(invalidEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 1)

	const storageFailureEnvironment = createEnvironment()
	storageFailureEnvironment.sandbox.uni.getStorageSync = () => {
		throw new Error('storage read failed')
	}
	storageFailureEnvironment.sandbox.uni.setStorageSync = () => {
		throw new Error('storage write failed')
	}
	const storageFailureService = loadService(storageFailureEnvironment.sandbox)
	const storageFailureSummaries = await storageFailureService.getCatalogSummaries()
	assert.equal(storageFailureSummaries.length, 2)
	await storageFailureService.getCatalogSummaries()
	assert.equal(storageFailureEnvironment.calls.filter(call => (
		call.data.action === 'getCatalogSummaries'
	)).length, 1)
}

async function testCatalogSummaryVersionLinking() {
	const subjectId = 'junior-personal-finance'
	const nextVersion = '2026-09-14-v2'

	// Cached summaries are not authoritative and must not invalidate a newer catalog.
	const staleSummaryEnvironment = createEnvironment()
	const staleSummaryService = loadService(staleSummaryEnvironment.sandbox)
	await staleSummaryService.getCatalogSummaries()
	staleSummaryEnvironment.setCatalogVersion(nextVersion)
	await staleSummaryService.getQuestionCatalog(subjectId, { forceRefresh: true })
	const catalogCallsAfterRefresh = staleSummaryEnvironment.calls.filter(call => (
		call.data.action === 'getCatalog'
	)).length
	const cachedSummaries = await staleSummaryService.getCatalogSummaries()
	assert.equal(cachedSummaries.find(item => item.subjectId === subjectId).activeVersion, '2026-08-21')
	assert.equal((await staleSummaryService.getQuestionCatalog(subjectId)).activeVersion, nextVersion)
	assert.equal(staleSummaryEnvironment.calls.filter(call => (
		call.data.action === 'getCatalog'
	)).length, catalogCallsAfterRefresh)

	const coldStaleSummaryService = reloadService(staleSummaryEnvironment)
	await coldStaleSummaryService.getCatalogSummaries()
	assert.equal((await coldStaleSummaryService.getQuestionCatalog(subjectId)).activeVersion, nextVersion)
	assert.equal(staleSummaryEnvironment.calls.filter(call => (
		call.data.action === 'getCatalog'
	)).length, catalogCallsAfterRefresh)

	// A fresh cloud summary invalidates only the subject whose active version changed.
	const environment = createEnvironment()
	const service = loadService(environment.sandbox)
	await service.getAllPracticeQuestions({ subjectId, mode: 'chapter', chapterId: '1' })
	await service.checkQuestionAnswer({ subjectId, questionId: 'ipf-1', selected: ['A'] })
	const subjectStateBefore = service.getCacheState(subjectId)
	assert.equal(subjectStateBefore.catalog, true)
	assert.equal(subjectStateBefore.page, true)
	assert.equal(subjectStateBefore.question, true)
	assert.equal(subjectStateBefore.answer, true)

	const otherSubjectId = 'junior-law'
	environment.setCatalogVersion('2026-09-01')
	await service.getAllPracticeQuestions({
		subjectId: otherSubjectId,
		mode: 'chapter',
		chapterId: '1'
	})
	const otherStateBefore = service.getCacheState(otherSubjectId)
	assert.equal(otherStateBefore.catalog, true)
	assert.equal(otherStateBefore.page, true)
	assert.equal(otherStateBefore.question, true)

	environment.setCatalogVersion(nextVersion)
	const catalogCallsBeforeSummaryRefresh = environment.calls.filter(call => (
		call.data.action === 'getCatalog'
	)).length
	await service.getCatalogSummaries({ forceRefresh: true })
	assert.equal(environment.calls.filter(call => (
		call.data.action === 'getCatalog'
	)).length, catalogCallsBeforeSummaryRefresh)

	const subjectStateAfter = service.getCacheState(subjectId)
	assert.equal(subjectStateAfter.catalog, false)
	assert.equal(subjectStateAfter.page, false)
	assert.equal(subjectStateAfter.question, false)
	assert.equal(subjectStateAfter.answer, false)
	const otherStateAfter = service.getCacheState(otherSubjectId)
	assert.equal(otherStateAfter.catalog, true)
	assert.equal(otherStateAfter.page, true)
	assert.equal(otherStateAfter.question, true)

	const persistedCatalogs = environment.storage.get('uni-learn-question-bank-catalog-cache-v1')
	assert.equal(Boolean(persistedCatalogs.entries[subjectId]), false)
	assert.equal(Boolean(persistedCatalogs.entries[otherSubjectId]), true)
	const chapterIndex = environment.storage.get('uni-learn-question-bank-chapter-cache-index-v1')
	const chapterEntries = Object.values(chapterIndex.entries)
	assert.equal(chapterEntries.some(item => item.subjectId === subjectId), false)
	assert.equal(chapterEntries.some(item => item.subjectId === otherSubjectId), true)

	assert.equal((await service.getQuestionCatalog(subjectId)).activeVersion, nextVersion)
	assert.equal(environment.calls.filter(call => (
		call.data.action === 'getCatalog'
	)).length, catalogCallsBeforeSummaryRefresh + 1)
	assert.equal((await service.getQuestionCatalog(otherSubjectId)).activeVersion, '2026-09-01')
	assert.equal(environment.calls.filter(call => (
		call.data.action === 'getCatalog'
	)).length, catalogCallsBeforeSummaryRefresh + 1)
}

async function testInvalidPersistentV3CacheFailsFast() {
	const environment = createEnvironment()
	const subjectId = 'junior-personal-finance'
	const service = loadService(environment.sandbox)
	await service.getAllPracticeQuestions({ subjectId, mode: 'chapter', chapterId: '1' })
	const index = environment.storage.get('uni-learn-question-bank-chapter-cache-index-v1')
	const metadata = Object.values(index.entries)[0]
	const savedChapter = environment.storage.get(metadata.storageKey)
	delete savedChapter.items[0].selectionMode
	environment.storage.set(metadata.storageKey, savedChapter)
	await assert.rejects(
		reloadService(environment).getAllPracticeQuestions({
			subjectId,
			mode: 'chapter',
			chapterId: '1'
		}),
		error => error.errCode === 'QUESTION_BANK_INVALID_QUESTION_SCHEMA'
	)

	const invalidMaterialCacheEnvironment = createEnvironment()
	const invalidMaterialCacheService = loadService(invalidMaterialCacheEnvironment.sandbox)
	await invalidMaterialCacheService.getAllPracticeQuestions({
		subjectId,
		mode: 'chapter',
		chapterId: '1'
	})
	const materialIndex = invalidMaterialCacheEnvironment.storage
		.get('uni-learn-question-bank-chapter-cache-index-v1')
	const materialMetadata = Object.values(materialIndex.entries)[0]
	const materialCache = invalidMaterialCacheEnvironment.storage.get(materialMetadata.storageKey)
	delete materialCache.items.find(item => item.type === 'material').materialText
	invalidMaterialCacheEnvironment.storage.set(materialMetadata.storageKey, materialCache)
	await assert.rejects(
		reloadService(invalidMaterialCacheEnvironment).getAllPracticeQuestions({
			subjectId,
			mode: 'chapter',
			chapterId: '1'
		}),
		error => error.errCode === 'QUESTION_BANK_INVALID_QUESTION_SCHEMA'
	)

	const oldCatalogEnvironment = createEnvironment()
	oldCatalogEnvironment.storage.set('uni-learn-question-bank-catalog-cache-v1', {
		version: 1,
		entries: {
			[subjectId]: {
				expiresAt: oldCatalogEnvironment.now() + 60 * 1000,
				data: {
					subjectId,
					activeVersion: 'legacy-v1',
					questionSchemaVersion: 2
				}
			}
		}
	})
	await assert.rejects(
		loadService(oldCatalogEnvironment.sandbox).getQuestionCatalog(subjectId),
		error => error.errCode === 'QUESTION_BANK_SCHEMA_VERSION_UNSUPPORTED'
	)
	assert.equal(oldCatalogEnvironment.calls.length, 0)
}

async function run() {
	const environment = createEnvironment()
	const service = loadService(environment.sandbox)
	const subjectId = 'junior-personal-finance'
	const summaries = await service.getCatalogSummaries()
	const cachedSummaries = await service.getCatalogSummaries()
	assert.equal(summaries.find(item => item.subjectId === 'junior-law').questionCount, 1250)
	assert.equal(cachedSummaries.length, 2)
	assert.equal(environment.calls.filter(call => call.data.action === 'getCatalogSummaries').length, 1)

	const catalogs = await Promise.all([
		service.getQuestionCatalog(subjectId),
		service.getQuestionCatalog(subjectId)
	])
	assert.equal(catalogs[0].activeVersion, '2026-08-21')
	assert.equal(catalogs[0].questionSchemaVersion, 3)
	assert.equal(environment.calls.filter(call => call.data.action === 'getCatalog').length, 1)

	const firstPage = await service.getPracticePage({ subjectId, mode: 'sequence', pageSize: 20 })
	const cachedPage = await service.getPracticePage({ subjectId, mode: 'sequence', pageSize: 20 })
	assert.equal(firstPage.items.length, 2)
	assert.equal(firstPage.items[0].type, 'single')
	assert.equal(firstPage.items[0].selectionMode, 'single')
	assert.equal(cachedPage.items.length, 2)
	assert.equal(environment.calls.filter(call => call.data.action === 'getPracticePage').length, 1)

	const completeChapter = await service.getAllPracticeQuestions({
		subjectId,
		mode: 'chapter',
		chapterId: '1'
	})
	assert.deepEqual(Array.from(completeChapter.items, item => item.id), ['ipf-1', 'ipf-2', 'ipf-3'])
	assert.equal(completeChapter.hasMore, false)
	assert.equal(completeChapter.total, 3)
	const chapterCalls = environment.calls.filter(call => (
		call.data.action === 'getPracticePage' && call.data.mode === 'chapter'
	))
	assert.equal(chapterCalls.length, 2)
	assert.equal(chapterCalls.every(call => call.data.chapterId === '1'), true)
	assert.equal(chapterCalls.every(call => call.data.pageSize === 50), true)

	const byIds = await service.getQuestionsByIds({
		subjectId,
		questionIds: ['ipf-3', 'ipf-1', 'ipf-missing']
	})
	assert.deepEqual(Array.from(byIds.items, item => item.id), ['ipf-3', 'ipf-1'])
	assert.deepEqual(Array.from(byIds.missingQuestionIds), ['ipf-missing'])
	const idRequest = environment.calls.find(call => call.data.action === 'getQuestionsByIds')
	assert.deepEqual(Array.from(idRequest.data.questionIds), ['ipf-missing'])

	const search = await service.searchQuestionBank({ subjectId, keyword: '题目', pageSize: 10 })
	assert.equal(search.total, 3)
	assert.equal(search._localOnly, true)
	assert.equal(environment.calls.filter(call => call.data.action === 'searchQuestions').length, 0)
	const answer = await service.checkQuestionAnswer({
		subjectId,
		questionId: 'ipf-1',
		selected: ['A']
	})
	assert.equal(answer.correct, true)
	assert.equal(answer.type, 'single')
	await service.checkQuestionAnswer({ subjectId, questionId: 'ipf-1', selected: ['A'] })
	assert.equal(environment.calls.filter(call => call.data.action === 'checkAnswer').length, 1)

	service.clearQuestionBankCache(subjectId)
	assert.equal(environment.storage.has(
		'uni-learn-question-bank-catalog-summaries-cache-v1'
	), false)
	environment.setNetworkFailures(1)
	await service.getQuestionCatalog(subjectId, { forceRefresh: true })
	const catalogCalls = environment.calls.filter(call => call.data.action === 'getCatalog')
	assert.equal(catalogCalls.length, 3)

	await assert.rejects(
		service.getQuestionCatalog('missing-subject', { forceRefresh: true }),
		error => error.errCode === 'QUESTION_BANK_SUBJECT_NOT_FOUND'
	)
	await assert.rejects(
		service.getPracticePage({ subjectId, pageSize: 51 }),
		error => error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT'
	)
	await assert.rejects(
		service.getPracticePage({ subjectId, mode: 'section', chapterId: '1' }),
		error => error.errCode === 'QUESTION_BANK_INVALID_ARGUMENT'
	)

	const oldCatalogEnvironment = createEnvironment()
	oldCatalogEnvironment.setCatalogSchemaVersion(2)
	await assert.rejects(
		loadService(oldCatalogEnvironment.sandbox).getQuestionCatalog(subjectId),
		error => error.errCode === 'QUESTION_BANK_SCHEMA_VERSION_UNSUPPORTED'
	)
	const invalidQuestionEnvironment = createEnvironment()
	delete invalidQuestionEnvironment.questions.q1.selectionMode
	await assert.rejects(
		loadService(invalidQuestionEnvironment.sandbox).getPracticePage({
			subjectId,
			mode: 'sequence',
			pageSize: 20
		}),
		error => error.errCode === 'QUESTION_BANK_INVALID_QUESTION_SCHEMA'
	)

}

async function main() {
	await run()
	await testPersistentChapterCache()
	await testSequenceBuildsChapterCache()
	await testPracticePageVersionFromResponse()
	await testCatalogCacheDurations()
	await testCatalogSummaryVersionLinking()
	await testInvalidPersistentV3CacheFailsFast()
	console.log('question-bank service tests passed')
}

main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
