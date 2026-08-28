import { DAILY_GOAL, DEFAULT_SUBJECT_ID, getPracticeState } from './practice.js'
import {
	getAllPracticeQuestions,
	getCatalog,
	getPracticePage,
	getQuestionsByIds
} from '@/services/question-bank.js'
import { getPracticeStateSnapshot } from '@/services/user-practice.js'

export async function getQuestionsBySubject(subjectId) {
	const result = await getAllPracticeQuestions({
		subjectId: subjectId || DEFAULT_SUBJECT_ID,
		mode: 'sequence',
		pageSize: 50
	})
	return result.items
}

function rotateFromQuestion(list, startId) {
	if (!startId) return list
	const startIndex = list.findIndex(item => item.id === startId)
	return startIndex > 0 ? list.slice(startIndex).concat(list.slice(0, startIndex)) : list
}

function applyLimit(list, limit) {
	const value = Number(limit)
	return value > 0 ? list.slice(0, value) : list
}

async function loadRecordedQuestions(subjectId, mode, localState) {
	const snapshot = await getPracticeStateSnapshot(subjectId, { localState })
	const idField = {
		wrong: 'wrongQuestionIds',
		favorite: 'favoriteQuestionIds',
		history: 'answeredQuestionIds'
	}[mode]
	const questionIds = snapshot[idField] || []
	if (!questionIds.length) return []
	const result = await getQuestionsByIds({ subjectId, questionIds })
	return result.items
}

export async function buildPracticeQuestions(options) {
	const config = options || {}
	const subjectId = config.subjectId || DEFAULT_SUBJECT_ID
	const mode = config.mode || 'sequence'
	const localState = getPracticeState()
	let list = []

	if (mode === 'wrong' || mode === 'favorite' || mode === 'history') {
		list = await loadRecordedQuestions(subjectId, mode, localState)
	} else if (mode === 'smart') {
		const snapshot = await getPracticeStateSnapshot(subjectId, { localState })
		const result = await getPracticePage({
			subjectId,
			mode: 'smart',
			pageSize: Number(config.limit) || DAILY_GOAL,
			answeredQuestionIds: snapshot.answeredQuestionIds,
			wrongQuestionIds: snapshot.wrongQuestionIds
		})
		list = result.items
	} else {
		const query = {
			subjectId,
			mode,
			pageSize: 50
		}
		if (mode === 'chapter') query.chapterId = config.chapterId
		if (mode === 'knowledge') query.knowledge = config.knowledge
		if (mode === 'search') query.keyword = config.keyword
		const result = await getAllPracticeQuestions(query)
		list = result.items
	}

	list = rotateFromQuestion(list, config.startId)
	const defaultLimit = mode === 'smart' ? DAILY_GOAL : 0
	return applyLimit(list, config.limit || defaultLimit)
}

export async function getKnowledgeGroups(subjectId) {
	const catalog = await getCatalog(subjectId || DEFAULT_SUBJECT_ID)
	return Array.isArray(catalog.knowledgeGroups) ? catalog.knowledgeGroups.slice() : []
}
