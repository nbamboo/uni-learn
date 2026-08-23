import { loadQuestionsByChapter, loadQuestionsBySubject } from './question-bank/index.js'
import { DAILY_GOAL, DEFAULT_SUBJECT_ID, getPracticeState } from './practice.js'

export function getQuestionsBySubject(subjectId) {
	return loadQuestionsBySubject(subjectId)
}

function shuffle(list) {
	const result = list.slice()
	for (let i = result.length - 1; i > 0; i--) {
		const index = Math.floor(Math.random() * (i + 1))
		const current = result[i]
		result[i] = result[index]
		result[index] = current
	}
	return result
}

function matchesKeyword(question, keyword) {
	if (!keyword) return true
	const value = keyword.trim().toLowerCase()
	const source = [
		question.title,
		question.chapter,
		question.section,
		question.knowledge,
		question.options.map(item => item.text).join(' ')
	].join(' ').toLowerCase()
	return source.indexOf(value) > -1
}

export async function buildPracticeQuestions(options) {
	const config = options || {}
	const subjectId = config.subjectId || DEFAULT_SUBJECT_ID
	const state = getPracticeState()
	let list = config.chapterId
		? await loadQuestionsByChapter(config.chapterId)
		: await getQuestionsBySubject(subjectId)

	if (config.chapterId) list = list.filter(item => item.subjectId === subjectId)
	if (config.knowledge) list = list.filter(item => item.knowledge === config.knowledge)
	if (config.keyword) list = list.filter(item => matchesKeyword(item, config.keyword))

	if (config.mode === 'wrong') {
		list = list.filter(item => state.answers[item.id] && !state.answers[item.id].correct)
	} else if (config.mode === 'favorite') {
		list = list.filter(item => state.favorites.indexOf(item.id) > -1)
	} else if (config.mode === 'history') {
		const ids = []
		state.history.forEach(item => {
			if (item.subjectId === subjectId && ids.indexOf(item.questionId) === -1) ids.push(item.questionId)
		})
		const questionMap = list.reduce((map, item) => {
			map[item.id] = item
			return map
		}, {})
		list = ids.map(id => questionMap[id]).filter(Boolean)
	} else if (config.mode === 'smart') {
		const fresh = shuffle(list.filter(item => !state.answers[item.id]))
		const wrong = shuffle(list.filter(item => state.answers[item.id] && !state.answers[item.id].correct))
		const mastered = shuffle(list.filter(item => state.answers[item.id] && state.answers[item.id].correct))
		list = fresh.concat(wrong, mastered)
	}

	if (config.startId) {
		const startIndex = list.findIndex(item => item.id === config.startId)
		if (startIndex > 0) list = list.slice(startIndex).concat(list.slice(0, startIndex))
	}

	const defaultLimit = config.mode === 'smart' ? DAILY_GOAL : 0
	const limit = Number(config.limit || defaultLimit)
	return limit > 0 ? list.slice(0, limit) : list
}

export async function getKnowledgeGroups(subjectId) {
	const map = {}
	const questions = await getQuestionsBySubject(subjectId)
	questions.forEach(question => {
		const key = question.knowledge || question.section || '其他'
		if (!map[key]) map[key] = { name: key, chapter: question.chapter, count: 0 }
		map[key].count += 1
	})
	return Object.keys(map).map(key => map[key]).sort((a, b) => b.count - a.count)
}
