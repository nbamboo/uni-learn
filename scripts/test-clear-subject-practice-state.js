'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const storage = new Map()
const environment = {
	uni: {
		getStorageSync: key => storage.get(key),
		setStorageSync: (key, value) => storage.set(key, value),
		removeStorageSync: key => storage.delete(key)
	},
	console,
	Set,
	Object,
	Array,
	Date
}

const servicePath = path.resolve(__dirname, '../data/practice.js')
let source = fs.readFileSync(servicePath, 'utf8')
source = source
	.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm, '')
	.replace(/\bexport\s+(?=(?:class|async\s+function|function|const|let|var)\b)/g, '')
source += '\n;globalThis.__practice = { clearSubjectPracticeState, getPracticeState }'

vm.createContext(environment)
vm.runInContext(source, environment, { filename: servicePath })

const stateKey = 'uni-learn-practice-state-v1'
storage.set(stateKey, {
	currentSubjectId: 'junior-personal-finance',
	answers: {
		'ipf-1': { subjectId: 'junior-personal-finance', selected: ['A'] },
		'law-1': { subjectId: 'junior-law', selected: ['B'] }
	},
	favorites: ['ipf-1', 'law-1', 'unscoped-1'],
	favoriteSubjects: {
		'ipf-1': 'junior-personal-finance',
		'law-1': 'junior-law'
	},
	favoriteUpdatedAt: {
		'ipf-1': 1,
		'law-1': 2,
		'unscoped-1': 3
	},
	dailyAttempts: {
		'junior-personal-finance': { dayKey: '2026-09-01', attempts: 2 },
		'junior-law': { dayKey: '2026-09-01', attempts: 1 }
	}
})

environment.__practice.clearSubjectPracticeState('junior-personal-finance')
const saved = environment.__practice.getPracticeState()

assert.equal(saved.currentSubjectId, 'junior-personal-finance')
assert.equal(saved.answers['ipf-1'], undefined)
assert.deepEqual(JSON.parse(JSON.stringify(saved.answers['law-1'].selected)), ['B'])
assert.deepEqual(Array.from(saved.favorites), ['law-1', 'unscoped-1'])
assert.equal(saved.favoriteSubjects['ipf-1'], undefined)
assert.equal(saved.favoriteSubjects['law-1'], 'junior-law')
assert.equal(saved.favoriteUpdatedAt['ipf-1'], undefined)
assert.equal(saved.favoriteUpdatedAt['unscoped-1'], 3)
assert.equal(saved.dailyAttempts['junior-personal-finance'], undefined)
assert.equal(saved.dailyAttempts['junior-law'].attempts, 1)

console.log('clear subject practice state tests passed')
