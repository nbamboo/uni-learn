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

function smartQuestionId(question) {
	return question && (question.questionId || question.id) || ''
}

// Material questions form one atomic draw unit. Child order is never shuffled.
function buildSmartPracticeUnits(questions) {
	const units = []
	const materialUnits = new Map()
	const seenQuestionIds = new Set()
	let previousUnitId = ''
	const orderedQuestions = (questions || []).slice().sort((left, right) => (
		(Number(left && left.sortOrder) || Number.MAX_SAFE_INTEGER)
		- (Number(right && right.sortOrder) || Number.MAX_SAFE_INTEGER)
	))
	orderedQuestions.forEach(question => {
		const questionId = smartQuestionId(question)
		if (!questionId || seenQuestionIds.has(questionId)) return
		seenQuestionIds.add(questionId)
		if (question.type !== 'material') {
			previousUnitId = `question:${questionId}`
			units.push({
				unitId: previousUnitId,
				questionIds: [questionId],
				questionCount: 1,
				sortOrder: Number(question.sortOrder) || Number.MAX_SAFE_INTEGER
			})
			return
		}
		const groupId = question.materialGroupId
		if (!groupId) throw new Error(`材料题${questionId}缺少materialGroupId`)
		let unit = materialUnits.get(groupId)
		if (unit && previousUnitId !== unit.unitId) {
			throw new Error(`材料组${groupId}的启用子题不连续`)
		}
		if (!unit) {
			unit = {
				unitId: `material:${groupId}`,
				materialGroupId: groupId,
				materialText: question.materialText,
				materialQuestionCount: question.materialQuestionCount,
				materialScope: [question.chapterId, question.chapter, question.section].join('|'),
				children: [],
				sortOrder: Number(question.sortOrder) || Number.MAX_SAFE_INTEGER
			}
			materialUnits.set(groupId, unit)
			units.push(unit)
		}
		previousUnitId = unit.unitId
		if (unit.materialText !== question.materialText
			|| unit.materialScope !== [question.chapterId, question.chapter, question.section].join('|')
			|| unit.materialQuestionCount !== question.materialQuestionCount) {
			throw new Error(`材料组${groupId}的范围、正文或题数不一致`)
		}
		unit.children.push({
			questionId,
			index: question.materialQuestionIndex,
			sortOrder: Number(question.sortOrder) || Number.MAX_SAFE_INTEGER
		})
		unit.sortOrder = Math.min(unit.sortOrder, Number(question.sortOrder) || Number.MAX_SAFE_INTEGER)
	})
	materialUnits.forEach(unit => {
		unit.children.sort((left, right) => left.index - right.index || left.sortOrder - right.sortOrder)
		const indices = unit.children.map(child => child.index)
		if (new Set(indices).size !== indices.length
			|| indices.some(index => !Number.isInteger(index) || index < 1
				|| index > unit.materialQuestionCount)) {
			throw new Error(`材料组${unit.materialGroupId}的子题序号无效`)
		}
		unit.questionIds = unit.children.map(child => child.questionId)
		unit.questionCount = unit.questionIds.length
		delete unit.children
		delete unit.materialText
		delete unit.materialQuestionCount
		delete unit.materialScope
	})
	return units.sort((left, right) => left.sortOrder - right.sortOrder)
}

// A material unit is wrong when any child is wrong, mastered only when every
// enabled child is answered correctly, and fresh in all other cases.
function classifySmartPracticeUnits(units, answeredQuestionIds, wrongQuestionIds) {
	const answered = answeredQuestionIds instanceof Set
		? answeredQuestionIds
		: new Set(answeredQuestionIds || [])
	const wrong = wrongQuestionIds instanceof Set
		? wrongQuestionIds
		: new Set(wrongQuestionIds || [])
	const groups = { fresh: [], wrong: [], mastered: [] }
	;(units || []).forEach(unit => {
		const questionIds = unit && Array.isArray(unit.questionIds) ? unit.questionIds : []
		if (!questionIds.length) return
		if (questionIds.some(questionId => wrong.has(questionId))) groups.wrong.push(unit)
		else if (questionIds.every(questionId => answered.has(questionId))) groups.mastered.push(unit)
		else groups.fresh.push(unit)
	})
	return groups
}

function normalizeSmartUnit(unit) {
	if (!unit || typeof unit !== 'object') return null
	const questionIds = Array.from(new Set((unit.questionIds || []).filter(Boolean)))
	if (!questionIds.length) return null
	return Object.assign({}, unit, {
		unitId: unit.unitId || questionIds.join('|'),
		questionIds,
		questionCount: questionIds.length
	})
}

function selectSmartPracticeUnits(groups, count, config, random) {
	const seenUnits = new Set()
	const seenQuestions = new Set()
	const unique = {}
	;['wrong', 'fresh', 'mastered'].forEach(key => {
		unique[key] = (groups && groups[key] || []).map(normalizeSmartUnit).filter(unit => {
			if (!unit || seenUnits.has(unit.unitId)
				|| unit.questionIds.some(questionId => seenQuestions.has(questionId))) return false
			seenUnits.add(unit.unitId)
			unit.questionIds.forEach(questionId => seenQuestions.add(questionId))
			return true
		})
	})
	const pools = {}
	KEYS.forEach(key => { pools[key] = shuffled(unique[key], random) })
	const requestedQuestionCount = Math.max(0, Number(count) || 0)
	const quotas = smartPracticeQuotas(config, requestedQuestionCount)
	const selectedQuestionCounts = { fresh: 0, wrong: 0, mastered: 0 }
	const selectedUnits = []
	let actualQuestionCount = 0
	while (actualQuestionCount < requestedQuestionCount) {
		const availableKeys = KEYS.filter(key => pools[key].length)
		if (!availableKeys.length) break
		let selectedKey = availableKeys[0]
		let largestDeficit = -Infinity
		availableKeys.forEach(key => {
			const deficit = quotas[key] - selectedQuestionCounts[key]
			if (deficit > largestDeficit) {
				largestDeficit = deficit
				selectedKey = key
			}
		})
		const unit = pools[selectedKey].shift()
		selectedUnits.push(unit)
		selectedQuestionCounts[selectedKey] += unit.questionCount
		actualQuestionCount += unit.questionCount
	}
	const orderedUnits = shuffled(selectedUnits, random)
	return {
		units: orderedUnits,
		questionIds: orderedUnits.reduce((ids, unit) => ids.concat(unit.questionIds), []),
		requestedQuestionCount,
		actualQuestionCount,
		overflowQuestionCount: Math.max(0, actualQuestionCount - requestedQuestionCount),
		selectedQuestionCounts
	}
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
	smartPracticeRatios, smartPracticeQuotas, selectSmartPracticeIds,
	buildSmartPracticeUnits, classifySmartPracticeUnits, selectSmartPracticeUnits
}
