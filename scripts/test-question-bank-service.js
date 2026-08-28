'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadService(sandbox) {
	const servicePath = path.resolve(__dirname, '../services/question-bank.js')
	let source = fs.readFileSync(servicePath, 'utf8')
	source = source
		.replace(/export default questionBankService\s*$/, '')
		.replace(/\bexport\s+(?=(?:class|async\s+function|function|const|let|var)\b)/g, '')
	source += `\n;globalThis.__questionBankService = {
		QuestionBankServiceError,
		getQuestionCatalog,
		getPracticePage,
		getAllPracticeQuestions,
		searchQuestionBank,
		getQuestionsByIds,
		checkQuestionAnswer,
		clearQuestionBankCache
	}`
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: servicePath })
	return sandbox.__questionBankService
}

function createEnvironment() {
	const storage = new Map()
	const calls = []
	let networkFailures = 0
	let catalogVersion = '2026-08-21'
	const questions = {
		q1: {
			id: 'ipf-1',
			questionId: 'ipf-1',
			subjectId: 'junior-personal-finance',
			title: '题目一',
			answer: ['A'],
			sortOrder: 1
		},
		q2: {
			id: 'ipf-2',
			questionId: 'ipf-2',
			subjectId: 'junior-personal-finance',
			title: '题目二',
			answer: ['B'],
			sortOrder: 2
		},
		q3: {
			id: 'ipf-3',
			questionId: 'ipf-3',
			subjectId: 'junior-personal-finance',
			title: '题目三',
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
							questionCount: 3,
							chapters: [{ id: '1', count: 3 }],
							knowledgeGroups: []
						}
					}
				}
			}
			if (data.action === 'getPracticePage') {
				const isNextPage = data.cursor === 2
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
							items: isNextPage ? [questions.q3] : [questions.q1, questions.q2]
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
							items: [{ id: 'ipf-1', questionId: 'ipf-1', title: '题目一' }]
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
			Boolean,
			RegExp
		},
		calls,
		storage,
		setNetworkFailures(value) {
			networkFailures = value
		},
		setCatalogVersion(value) {
			catalogVersion = value
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

async function run() {
	const environment = createEnvironment()
	const service = loadService(environment.sandbox)
	const subjectId = 'junior-personal-finance'

	const catalogs = await Promise.all([
		service.getQuestionCatalog(subjectId),
		service.getQuestionCatalog(subjectId)
	])
	assert.equal(catalogs[0].activeVersion, '2026-08-21')
	assert.equal(environment.calls.filter(call => call.data.action === 'getCatalog').length, 1)

	const firstPage = await service.getPracticePage({ subjectId, mode: 'sequence', pageSize: 20 })
	const cachedPage = await service.getPracticePage({ subjectId, mode: 'sequence', pageSize: 20 })
	assert.equal(firstPage.items.length, 2)
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
	assert.equal(search.total, 1)
	const answer = await service.checkQuestionAnswer({
		subjectId,
		questionId: 'ipf-1',
		selected: ['A']
	})
	assert.equal(answer.correct, true)
	await service.checkQuestionAnswer({ subjectId, questionId: 'ipf-1', selected: ['A'] })
	assert.equal(environment.calls.filter(call => call.data.action === 'checkAnswer').length, 1)

	service.clearQuestionBankCache(subjectId)
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

}

async function main() {
	await run()
	await testPersistentChapterCache()
	console.log('question-bank service tests passed')
}

main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
