import { chapters, subjectQuestionCounts } from './question-bank/catalog.js'
import {
	createPracticeEventId,
	queuePracticeAnswer,
	queuePracticeFavorite
} from '@/services/user-practice.js'

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
		favoriteUpdatedAt: {},
		dailyAttempts: {}
	}
}

function localDayKey(timestamp) {
	const date = timestamp ? new Date(timestamp) : new Date()
	const pad = value => value < 10 ? `0${value}` : String(value)
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getPracticeState() {
	const saved = uni.getStorageSync(PRACTICE_STATE_KEY)
	const state = saved && typeof saved === 'object' ? saved : createDefaultState()
	state.currentSubjectId = state.currentSubjectId || DEFAULT_SUBJECT_ID
	state.answers = state.answers || {}
	state.favorites = Array.isArray(state.favorites) ? state.favorites : []
	state.favoriteSubjects = state.favoriteSubjects || {}
	state.favoriteUpdatedAt = state.favoriteUpdatedAt || {}
	state.dailyAttempts = state.dailyAttempts || {}
	if (Array.isArray(state.history)) {
		const todayKey = localDayKey()
		state.history.forEach(item => {
			if (!item || !item.subjectId || localDayKey(item.timestamp) !== todayKey) return
			const savedDaily = state.dailyAttempts[item.subjectId]
			if (!savedDaily || savedDaily.dayKey !== todayKey) {
				state.dailyAttempts[item.subjectId] = { dayKey: todayKey, attempts: 0 }
			}
			state.dailyAttempts[item.subjectId].attempts += 1
		})
		delete state.history
		uni.setStorageSync(PRACTICE_STATE_KEY, state)
	}
	return state
}

export function savePracticeState(state) {
	uni.setStorageSync(PRACTICE_STATE_KEY, state)
}

export function clearPracticeState() {
	if (typeof uni !== 'undefined' && typeof uni.removeStorageSync === 'function') {
		uni.removeStorageSync(PRACTICE_STATE_KEY)
	}
	return createDefaultState()
}

export function clearSubjectPracticeState(subjectId) {
	if (typeof subjectId !== 'string' || !subjectId.trim()) return getPracticeState()
	const normalizedSubjectId = subjectId.trim()
	const state = getPracticeState()
	const removedQuestionIds = new Set()

	Object.keys(state.answers).forEach(questionId => {
		const answer = state.answers[questionId]
		const isLegacyDefault = !answer.subjectId
			&& normalizedSubjectId === DEFAULT_SUBJECT_ID
			&& questionId.indexOf('ipf-') === 0
		if (answer.subjectId === normalizedSubjectId || isLegacyDefault) {
			removedQuestionIds.add(questionId)
			delete state.answers[questionId]
		}
	})

	state.favorites = state.favorites.filter(questionId => {
		const savedSubjectId = state.favoriteSubjects[questionId]
		const isLegacyDefault = !savedSubjectId
			&& normalizedSubjectId === DEFAULT_SUBJECT_ID
			&& questionId.indexOf('ipf-') === 0
		const shouldRemove = savedSubjectId === normalizedSubjectId
			|| removedQuestionIds.has(questionId)
			|| isLegacyDefault
		if (shouldRemove) removedQuestionIds.add(questionId)
		return !shouldRemove
	})

	removedQuestionIds.forEach(questionId => {
		delete state.favoriteSubjects[questionId]
		delete state.favoriteUpdatedAt[questionId]
	})
	delete state.dailyAttempts[normalizedSubjectId]
	savePracticeState(state)
	return state
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
	const todayKey = localDayKey()
	const saved = state.dailyAttempts[subjectId]
	const attempts = saved && saved.dayKey === todayKey ? Number(saved.attempts) || 0 : 0
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
	const timestamp = Date.now()
	if (index > -1) {
		state.favorites.splice(index, 1)
		delete state.favoriteSubjects[questionId]
	} else {
		state.favorites.unshift(questionId)
		if (subjectId) state.favoriteSubjects[questionId] = subjectId
	}
	state.favoriteUpdatedAt[questionId] = timestamp
	savePracticeState(state)
	if (typeof question !== 'string' && subjectId) {
		queuePracticeFavorite(question, index === -1, { occurredAt: timestamp })
	}
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
	const eventId = createPracticeEventId('answer')

	state.answers[question.id] = {
		subjectId: question.subjectId,
		chapterId: question.chapterId,
		knowledge: question.knowledge,
		selected: selected.slice(),
		correct,
		attempts: previous ? previous.attempts + 1 : 1,
		timestamp
	}
	const todayKey = localDayKey(timestamp)
	const daily = state.dailyAttempts[question.subjectId]
	state.dailyAttempts[question.subjectId] = {
		dayKey: todayKey,
		attempts: daily && daily.dayKey === todayKey ? (Number(daily.attempts) || 0) + 1 : 1
	}
	savePracticeState(state)
	queuePracticeAnswer(question, selected, {
		eventId,
		correct,
		occurredAt: timestamp
	})
	return correct
}

export function getChapterProgress(subjectId, chapterId, questionCount) {
	const state = getPracticeState()
	const chapter = chapters.find(item => item.subjectId === subjectId && item.id === String(chapterId))
	const total = Number.isInteger(questionCount) && questionCount >= 0
		? questionCount
		: (chapter ? chapter.count : 0)
	const attempted = Object.keys(state.answers).filter(questionId => {
		const answer = state.answers[questionId]
		return answer.subjectId === subjectId && answer.chapterId === String(chapterId)
	}).length
	return {
		attempted,
		total,
		percent: total ? Math.min(100, Math.round(attempted / total * 100)) : 0
	}
}
