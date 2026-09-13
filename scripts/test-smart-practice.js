'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const helper = require('../services/smart-practice.js')
const { defaultSmartPractice, validateSmartPractice, normalizeSmartPractice, smartPracticeQuotas, selectSmartPracticeIds } = helper
const canonical = fs.readFileSync(path.resolve(__dirname, '../services/smart-practice.js'), 'utf8')
for (const name of ['questionBank', 'questionBankUser']) {
	assert.equal(fs.readFileSync(path.resolve(__dirname, `../uniCloud-alipay/cloudfunctions/${name}/smart-practice.js`), 'utf8'), canonical)
}
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
console.log('Smart practice ratios: presets, all custom ratios, rounding, fallback, deduplication and bundle parity passed')
