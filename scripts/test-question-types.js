'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const helperPath = path.resolve(__dirname, '../data/question-types.js')
const source = fs.readFileSync(helperPath, 'utf8')
	.replace(/\bexport\s+(?=(?:function|const)\b)/g, '')
	.concat('\n;globalThis.__questionTypes = { getQuestionTypeLabel, isValidQuestionSelectionMode }')
const sandbox = {}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: helperPath })

const expected = [
	['single', '单选题', 'single'],
	['judgment', '判断题', 'single'],
	['multiple', '多选题', 'multiple'],
	['material', '材料题', 'multiple']
]
expected.forEach(([type, label, selectionMode]) => {
	assert.equal(sandbox.__questionTypes.getQuestionTypeLabel(type), label)
	assert.equal(sandbox.__questionTypes.isValidQuestionSelectionMode(type, selectionMode), true)
	assert.equal(sandbox.__questionTypes.isValidQuestionSelectionMode(type, selectionMode === 'single' ? 'multiple' : 'single'), false)
})
assert.throws(() => sandbox.__questionTypes.getQuestionTypeLabel('legacy'))
assert.equal(sandbox.__questionTypes.isValidQuestionSelectionMode('legacy', 'single'), false)

for (const relativePath of [
	'../practice-pages/practice/practice.vue',
	'../practice-pages/question-search/question-search.vue'
]) {
	const page = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')
	assert.match(page, /getQuestionTypeLabel/)
	assert.doesNotMatch(page, /type\s*[!=]==?\s*['"]multiple['"]/)
}

console.log('question type v2 tests passed')
