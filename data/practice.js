import { chapters, subjectQuestionCounts } from './question-bank/catalog.js'

export const DEFAULT_SUBJECT_ID = 'junior-personal-finance'
export const PRACTICE_STATE_KEY = 'uni-learn-practice-state-v1'
export const DAILY_GOAL = 20

export const subjectGroups = [
	{
		level: '初级',
		items: [
			{ id: 'junior-law', name: '初级法规' },
			{ id: DEFAULT_SUBJECT_ID, name: '初级个人理财' },
			{ id: 'junior-risk', name: '初级风险管理' },
			{ id: 'junior-personal-loan', name: '初级个人贷款' },
			{ id: 'junior-corporate-credit', name: '初级公司信贷' },
			{ id: 'junior-bank-management', name: '初级银行管理' }
		]
	},
	{
		level: '中级',
		items: [
			{ id: 'middle-law', name: '中级法规' },
			{ id: 'middle-personal-finance', name: '中级个人理财' },
			{ id: 'middle-personal-loan', name: '中级个人贷款' },
			{ id: 'middle-corporate-credit', name: '中级公司信贷' },
			{ id: 'middle-risk', name: '中级风险管理' },
			{ id: 'middle-bank-management', name: '中级银行管理' }
		]
	}
]

function createDefaultState() {
	return {
		currentSubjectId: DEFAULT_SUBJECT_ID,
		answers: {},
		favorites: [],
		favoriteSubjects: {},
		history: []
	}
}

export function getPracticeState() {
	const saved = uni.getStorageSync(PRACTICE_STATE_KEY)
	const state = saved && typeof saved === 'object' ? saved : createDefaultState()
	state.currentSubjectId = state.currentSubjectId || DEFAULT_SUBJECT_ID
	state.answers = state.answers || {}
	state.favorites = Array.isArray(state.favorites) ? state.favorites : []
	state.favoriteSubjects = state.favoriteSubjects || {}
	state.history = Array.isArray(state.history) ? state.history : []
	return state
}

export function savePracticeState(state) {
	uni.setStorageSync(PRACTICE_STATE_KEY, state)
}

export function getSubjectById(subjectId) {
	for (let i = 0; i < subjectGroups.length; i++) {
		const item = subjectGroups[i].items.find(subject => subject.id === subjectId)
		if (item) return item
	}
	return subjectGroups[0].items[1]
}

export function selectSubject(subjectId) {
	const state = getPracticeState()
	state.currentSubjectId = subjectId
	savePracticeState(state)
}

export function getChaptersBySubject(subjectId) {
	return chapters.filter(item => item.subjectId === subjectId)
}

export function getSubjectQuestionCount(subjectId) {
	return subjectQuestionCounts[subjectId] || 0
}

export function getSubjectStats(subjectId) {
	const state = getPracticeState()
	let attempted = 0
	let correct = 0
	let wrong = 0

	Object.keys(state.answers).forEach(questionId => {
		const answer = state.answers[questionId]
		const isLegacyDefault = !answer.subjectId && questionId.indexOf('ipf-') === 0
		if (answer.subjectId !== subjectId && !(subjectId === DEFAULT_SUBJECT_ID && isLegacyDefault)) return
		attempted += 1
		if (answer.correct) correct += 1
		else wrong += 1
	})
	const total = getSubjectQuestionCount(subjectId)

	return {
		total,
		attempted,
		correct,
		wrong,
		favorite: state.favorites.filter(id => {
			const savedSubjectId = state.favoriteSubjects[id]
			return savedSubjectId === subjectId || (!savedSubjectId && subjectId === DEFAULT_SUBJECT_ID && id.indexOf('ipf-') === 0)
		}).length,
		accuracy: attempted ? Math.round(correct / attempted * 100) : 0,
		completion: total ? Math.round(attempted / total * 100) : 0
	}
}

export function getTodayProgress(subjectId) {
	const state = getPracticeState()
	const now = new Date()
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
	const attempts = state.history.filter(item => item.subjectId === subjectId && item.timestamp >= start).length
	return {
		attempts,
		goal: DAILY_GOAL,
		percent: Math.min(100, Math.round(attempts / DAILY_GOAL * 100))
	}
}

export function isFavorite(questionId) {
	return getPracticeState().favorites.indexOf(questionId) > -1
}

export function toggleFavorite(question) {
	const state = getPracticeState()
	const questionId = typeof question === 'string' ? question : question.id
	const subjectId = typeof question === 'string' ? '' : question.subjectId
	const index = state.favorites.indexOf(questionId)
	if (index > -1) {
		state.favorites.splice(index, 1)
		delete state.favoriteSubjects[questionId]
	} else {
		state.favorites.unshift(questionId)
		if (subjectId) state.favoriteSubjects[questionId] = subjectId
	}
	savePracticeState(state)
	return index === -1
}

export function isCorrectAnswer(selected, answer) {
	const left = (selected || []).slice().sort().join(',')
	const right = (answer || []).slice().sort().join(',')
	return left === right
}

export function recordAnswer(question, selected) {
	const state = getPracticeState()
	const correct = isCorrectAnswer(selected, question.answer)
	const previous = state.answers[question.id]
	const timestamp = Date.now()

	state.answers[question.id] = {
		subjectId: question.subjectId,
		chapterId: question.chapterId,
		knowledge: question.knowledge,
		selected: selected.slice(),
		correct,
		attempts: previous ? previous.attempts + 1 : 1,
		timestamp
	}
	state.history.unshift({
		questionId: question.id,
		subjectId: question.subjectId,
		correct,
		selected: selected.slice(),
		timestamp
	})
	state.history = state.history.slice(0, 500)
	savePracticeState(state)
	return correct
}

export function getChapterProgress(subjectId, chapterId) {
	const state = getPracticeState()
	const chapter = chapters.find(item => item.subjectId === subjectId && item.id === String(chapterId))
	const total = chapter ? chapter.count : 0
	const attempted = Object.keys(state.answers).filter(questionId => {
		const answer = state.answers[questionId]
		return answer.subjectId === subjectId && answer.chapterId === String(chapterId)
	}).length
	return {
		attempted,
		total,
		percent: total ? Math.round(attempted / total * 100) : 0
	}
}

export function formatHistoryTime(timestamp) {
	const date = new Date(timestamp)
	const pad = value => value < 10 ? `0${value}` : value
	return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
