'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadModule(environment) {
	const filePath = path.resolve(__dirname, '../data/practice-questions.js')
	let source = fs.readFileSync(filePath, 'utf8')
	source = source
		.replace(/import[\s\S]*?from\s+['"][^'"]+['"]\s*/g, '')
		.replace(/\bexport\s+(?=(?:async\s+function|function|const|let|var)\b)/g, '')
	source += '\n;globalThis.__practiceQuestions = { buildPracticeQuestions }'
	vm.createContext(environment)
	vm.runInContext(source, environment, { filename: filePath })
	return environment.__practiceQuestions
}

async function run() {
	let member = false
	let cloudSmartCalls = 0
	let questionBankPageCalls = 0
	let questionBankAllCalls = 0
	let lastAllParams = null
	const environment = {
		DAILY_GOAL: 20,
		DEFAULT_SUBJECT_ID: 'junior-personal-finance',
		practiceCloudSyncEnabled: () => member,
		getPracticeState: () => ({
			answers: {
				'local-wrong': { subjectId: 'junior-personal-finance', correct: false },
				'local-correct': { subjectId: 'junior-personal-finance', correct: true },
				'other-subject': { subjectId: 'junior-law', correct: false }
			}
		}),
		getSmartPracticeQuestions: async () => {
			cloudSmartCalls += 1
			return { items: [{ id: 'member-smart' }] }
		},
		getAllPracticeQuestions: async params => {
			questionBankAllCalls += 1
			lastAllParams = params
			assert.notEqual(params.mode, 'smart')
			return { items: [] }
		},
		getPracticePage: async (params, options) => {
			questionBankPageCalls += 1
			assert.equal(params.mode, 'smart')
			assert.deepEqual(Array.from(params.answeredQuestionIds), ['local-wrong', 'local-correct'])
			assert.deepEqual(Array.from(params.wrongQuestionIds), ['local-wrong'])
			assert.equal(options.versionFromResponse, true)
			return { items: [{ id: 'local-smart' }] }
		},
		getCatalog: async () => ({ knowledgeGroups: [] }),
		getQuestionsByIds: async () => ({ items: [] }),
		getPracticeRecords: async () => ({ items: [], hasMore: false }),
		Promise,
		Object,
		Array,
		Number,
		Boolean,
		String,
		Set,
		Map,
		Math,
		Date,
		JSON,
		Error
	}
	const module = loadModule(environment)
	const localItems = await module.buildPracticeQuestions({
		subjectId: 'junior-personal-finance',
		mode: 'smart',
		limit: 20
	})
	assert.equal(localItems[0].id, 'local-smart')
	assert.equal(questionBankPageCalls, 1)
	assert.equal(questionBankAllCalls, 0)
	assert.equal(cloudSmartCalls, 0)
	await module.buildPracticeQuestions({
		subjectId: 'junior-personal-finance',
		mode: 'knowledge',
		chapterId: '1',
		knowledge: '测试知识点'
	})
	assert.equal(lastAllParams.mode, 'knowledge')
	assert.equal(lastAllParams.chapterId, '1')
	assert.equal(lastAllParams.knowledge, '测试知识点')

	member = true
	const memberItems = await module.buildPracticeQuestions({
		subjectId: 'junior-personal-finance',
		mode: 'smart',
		limit: 20
	})
	assert.equal(memberItems[0].id, 'member-smart')
	assert.equal(questionBankPageCalls, 1)
	assert.equal(questionBankAllCalls, 1)
	assert.equal(cloudSmartCalls, 1)

	console.log('practice question routing tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
