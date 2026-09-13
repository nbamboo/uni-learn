'use strict'

// Kept identical in services and both cloud-function bundles; verified by test-smart-practice.js.
const KEYS = ['fresh', 'wrong', 'mastered']
const DEFAULT_SMART_QUESTION_COUNT = 20
const MIN_SMART_QUESTION_COUNT = 10
const MAX_SMART_QUESTION_COUNT = 50
const SMART_QUESTION_COUNT_STEP = 5
const PRESETS = {
	fresh: { fresh: 80, wrong: 20, mastered: 0 },
	balanced: { fresh: 60, wrong: 30, mastered: 10 },
	wrong: { fresh: 20, wrong: 70, mastered: 10 }
}

function defaultSmartPractice() {
	return {
		strategy: 'fresh',
		questionCount: DEFAULT_SMART_QUESTION_COUNT,
		custom: { fresh: 60, wrong: 30, mastered: 10 }
	}
}

function validateSmartPractice(value) {
	if (value === undefined) return defaultSmartPractice()
	if (!value || typeof value !== 'object' || Array.isArray(value)
		|| !['fresh', 'balanced', 'wrong', 'custom'].includes(value.strategy)) {
		throw new Error('智能练习方案无效')
	}
	const questionCount = value.questionCount
	if (!Number.isInteger(questionCount)
		|| questionCount < MIN_SMART_QUESTION_COUNT
		|| questionCount > MAX_SMART_QUESTION_COUNT
		|| questionCount % SMART_QUESTION_COUNT_STEP !== 0) {
		throw new Error('智能练习每组题量须为 10～50 的 5 的整数倍')
	}
	const custom = value.custom
	if (!custom || typeof custom !== 'object' || Array.isArray(custom)
		|| KEYS.some(key => !Number.isInteger(custom[key]) || custom[key] < 0
			|| custom[key] > 100 || custom[key] % 5 !== 0)
		|| KEYS.reduce((sum, key) => sum + custom[key], 0) !== 100) {
		throw new Error('智能练习比例须为 0～100 的 5% 整数倍，且合计为 100%')
	}
	return { strategy: value.strategy, questionCount, custom: {
		fresh: custom.fresh, wrong: custom.wrong, mastered: custom.mastered
	} }
}

function normalizeSmartPractice(value) {
	try { return validateSmartPractice(value) } catch (error) { return defaultSmartPractice() }
}

function smartPracticeRatios(value) {
	const config = validateSmartPractice(value)
	return config.strategy === 'custom' ? config.custom : Object.assign({}, PRESETS[config.strategy])
}

function smartPracticeQuotas(value, count) {
	const ratios = smartPracticeRatios(value)
	const result = {}
	const remainders = KEYS.map((key, index) => {
		const scaled = ratios[key] * count
		result[key] = Math.floor(scaled / 100)
		return { key, index, remainder: scaled % 100 }
	}).sort((a, b) => b.remainder - a.remainder || a.index - b.index)
	const left = count - KEYS.reduce((sum, key) => sum + result[key], 0)
	for (let index = 0; index < left; index += 1) result[remainders[index].key] += 1
	return result
}

function shuffled(items, random) {
	const result = items.slice()
	for (let index = result.length - 1; index > 0; index -= 1) {
		const target = Math.floor(random() * (index + 1))
		const item = result[index]
		result[index] = result[target]
		result[target] = item
	}
	return result
}

// IDs are classified once, with wrong taking precedence over other supplied groups.
function selectSmartPracticeIds(groups, count, config, random) {
	const seen = new Set()
	const unique = {}
	;['wrong', 'fresh', 'mastered'].forEach(key => {
		unique[key] = (groups[key] || []).filter(id => {
			if (!id || seen.has(id)) return false
			seen.add(id)
			return true
		})
	})
	const pools = {}
	KEYS.forEach(key => { pools[key] = shuffled(unique[key], random) })
	const quotas = smartPracticeQuotas(config, count)
	const selected = []
	const remaining = {}
	KEYS.forEach(key => {
		selected.push(...pools[key].slice(0, quotas[key]))
		remaining[key] = pools[key].slice(quotas[key])
	})
	KEYS.forEach(key => {
		selected.push(...remaining[key].slice(0, Math.max(0, count - selected.length)))
	})
	return shuffled(selected, random)
}

module.exports = {
	DEFAULT_SMART_QUESTION_COUNT, MIN_SMART_QUESTION_COUNT,
	MAX_SMART_QUESTION_COUNT, SMART_QUESTION_COUNT_STEP,
	defaultSmartPractice, validateSmartPractice, normalizeSmartPractice,
	smartPracticeRatios, smartPracticeQuotas, selectSmartPracticeIds
}
