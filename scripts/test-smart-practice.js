'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const helper = require('../services/smart-practice.js')
const {
	defaultSmartPractice,
	validateSmartPractice,
	normalizeSmartPractice,
	smartPracticeQuotas,
	selectSmartPracticeIds,
	buildSmartPracticeUnits,
	classifySmartPracticeUnits,
	selectSmartPracticeUnits
} = helper
const canonical = fs.readFileSync(path.resolve(__dirname, '../services/smart-practice.js'), 'utf8')
for (const name of ['questionBank', 'questionBankUser']) {
	assert.equal(fs.readFileSync(path.resolve(__dirname, `../uniCloud-alipay/cloudfunctions/${name}/smart-practice.js`), 'utf8'), canonical)
}
const catalogSchema = JSON.parse(fs.readFileSync(path.resolve(
	__dirname,
	'../uniCloud-alipay/database/question_bank_catalogs.schema.json'
), 'utf8'))
assert.deepEqual(catalogSchema.properties.questionSchemaVersion.enum, [3])
const questionSchema = JSON.parse(fs.readFileSync(path.resolve(
	__dirname,
	'../uniCloud-alipay/database/question_bank_questions.schema.json'
), 'utf8'))
for (const field of ['materialGroupId', 'materialText', 'materialQuestionIndex', 'materialQuestionCount']) {
	assert.ok(questionSchema.properties[field], `${field} schema is required`)
}
assert.ok(questionSchema.fieldRules.some(item => item.rule.includes("type != 'material'")))
assert.ok(questionSchema.fieldRules.some(item => item.rule.includes("type == 'material'")))
const questionIndexes = JSON.parse(fs.readFileSync(path.resolve(
	__dirname,
	'../uniCloud-alipay/database/question_bank_questions.index.json'
), 'utf8'))
const materialIndex = questionIndexes.find(index => index.IndexName === 'subject_version_material_status_index')
assert.deepEqual(materialIndex.MgoKeySchema.MgoIndexKeys.map(item => item.Name), [
	'subjectId', 'version', 'materialGroupId', 'status', 'materialQuestionIndex'
])
assert.equal(materialIndex.MgoKeySchema.MgoIsSparse, true)
const config = (strategy, custom, questionCount) => ({
	strategy,
	questionCount: questionCount === undefined ? 20 : questionCount,
	custom: custom || defaultSmartPractice().custom
})
assert.deepEqual(normalizeSmartPractice(), defaultSmartPractice())
assert.deepEqual(normalizeSmartPractice({ strategy: 'unknown' }), defaultSmartPractice())
assert.deepEqual(normalizeSmartPractice(config('auto')), defaultSmartPractice())
assert.equal(validateSmartPractice(config('fresh')).questionCount, 20)
for (const invalid of [null, {}, { strategy: 'bad' }, config('auto'),
	{ strategy: 'fresh', custom: defaultSmartPractice().custom }, config('fresh', null, 5),
	config('fresh', null, 12), config('fresh', null, 55), config('custom', { fresh: 61, wrong: 29, mastered: 10 }),
	config('custom', { fresh: 60, wrong: 30, mastered: 15 }), config('custom', { fresh: -5, wrong: 100, mastered: 5 }),
	config('custom', { fresh: '60', wrong: 30, mastered: 10 })]) {
	assert.throws(() => validateSmartPractice(invalid))
}
for (const [strategy, quotas] of [['fresh', [16, 4, 0]], ['balanced', [12, 6, 2]], ['wrong', [4, 14, 2]]]) {
	assert.deepEqual(Object.values(smartPracticeQuotas(config(strategy), 20)), quotas)
}
assert.deepEqual(smartPracticeQuotas(config('custom', { fresh: 50, wrong: 50, mastered: 0 }), 1), { fresh: 1, wrong: 0, mastered: 0 })
for (let questionCount = 10; questionCount <= 50; questionCount += 5) {
	const quotas = smartPracticeQuotas(config('balanced', null, questionCount), questionCount)
	assert.equal(Object.values(quotas).reduce((sum, count) => sum + count, 0), questionCount)
}
const groups = { fresh: [], wrong: [], mastered: [] }
for (const key of Object.keys(groups)) groups[key] = Array.from({ length: 30 }, (_, i) => `${key}-${i}`)
for (let fresh = 0; fresh <= 100; fresh += 5) {
	for (let wrong = 0; wrong <= 100 - fresh; wrong += 5) {
		const custom = config('custom', { fresh, wrong, mastered: 100 - fresh - wrong })
		for (const count of [1, 7, 20, 50]) {
			const quotas = smartPracticeQuotas(custom, count)
			assert.equal(Object.values(quotas).reduce((a, b) => a + b), count)
			const result = selectSmartPracticeIds(groups, count, custom, () => 0.37)
			assert.equal(result.length, count)
			assert.equal(new Set(result).size, count)
			if (count <= 20) for (const key of Object.keys(groups)) {
				assert.equal(result.filter(id => id.startsWith(key)).length, quotas[key])
			}
		}
	}
}
const sparse = selectSmartPracticeIds({ fresh: ['f'], wrong: [], mastered: groups.mastered }, 20, config('fresh'), () => 0.5)
assert.equal(sparse.length, 20)
assert.ok(sparse.includes('f'))
assert.equal(sparse.filter(id => id.startsWith('mastered')).length, 19)
const duplicate = selectSmartPracticeIds({ fresh: ['a', 'b'], wrong: ['a', 'a'], mastered: ['a', 'c'] }, 20, config('balanced'), () => 0.5)
assert.deepEqual(duplicate.slice().sort(), ['a', 'b', 'c'])
assert.deepEqual(selectSmartPracticeIds({}, 20, config('balanced'), () => 0.5), [])
const defaultSelection = selectSmartPracticeIds(groups, 20, defaultSmartPractice(), () => 0.5)
assert.deepEqual(['fresh', 'wrong', 'mastered'].map(key => defaultSelection.filter(id => id.startsWith(key)).length), [16, 4, 0])

const materialQuestions = [
	{ questionId: 'normal-1', type: 'single', sortOrder: 5 },
	{ questionId: 'm-2', type: 'material', materialGroupId: 'm', materialText: '材料', materialQuestionIndex: 2, materialQuestionCount: 2, sortOrder: 20 },
	{ questionId: 'm-1', type: 'material', materialGroupId: 'm', materialText: '材料', materialQuestionIndex: 1, materialQuestionCount: 2, sortOrder: 19 }
]
const materialUnits = buildSmartPracticeUnits(materialQuestions)
assert.deepEqual(materialUnits.map(unit => unit.questionIds), [['normal-1'], ['m-1', 'm-2']])
assert.throws(() => buildSmartPracticeUnits([
	{ questionId: 'gap-m-1', type: 'material', materialGroupId: 'gap-m', materialText: '材料', materialQuestionIndex: 1, materialQuestionCount: 2, sortOrder: 1 },
	{ questionId: 'gap-normal', type: 'single', sortOrder: 2 },
	{ questionId: 'gap-m-2', type: 'material', materialGroupId: 'gap-m', materialText: '材料', materialQuestionIndex: 2, materialQuestionCount: 2, sortOrder: 3 }
]), /启用子题不连续/)
assert.equal(classifySmartPracticeUnits(materialUnits, ['normal-1', 'm-1'], ['m-2']).wrong[0].materialGroupId, 'm')
assert.equal(classifySmartPracticeUnits(materialUnits, ['normal-1', 'm-1', 'm-2'], []).mastered.length, 2)
assert.equal(classifySmartPracticeUnits(materialUnits, ['m-1'], []).fresh
	.find(unit => unit.materialGroupId === 'm').materialGroupId, 'm')

const overflowUnits = Array.from({ length: 18 }, (_, index) => ({
	unitId: `q-${index + 1}`,
	questionIds: [`q-${index + 1}`],
	questionCount: 1
})).concat({
	unitId: 'material:overflow',
	materialGroupId: 'overflow',
	questionIds: ['om-1', 'om-2', 'om-3', 'om-4'],
	questionCount: 4
})
const overflowSelection = selectSmartPracticeUnits(
	{ fresh: overflowUnits, wrong: [], mastered: [] },
	20,
	config('fresh'),
	() => 0.999999
)
assert.equal(overflowSelection.requestedQuestionCount, 20)
assert.equal(overflowSelection.actualQuestionCount, 22)
assert.equal(overflowSelection.overflowQuestionCount, 2)
assert.deepEqual(overflowSelection.questionIds.slice(-4), ['om-1', 'om-2', 'om-3', 'om-4'])

console.log('Smart practice ratios, material grouping/state/order, soft overflow and bundle parity passed')
