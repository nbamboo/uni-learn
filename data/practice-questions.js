import { DAILY_GOAL, DEFAULT_SUBJECT_ID, getPracticeState } from './practice.js'
import {
	getAllPracticeQuestions,
	getCatalog,
	getPracticePage,
	getQuestionsByIds
} from '@/services/question-bank.js'
import {
	getPracticeRecords,
	getSmartPracticeQuestions,
	practiceCloudSyncEnabled
} from '@/services/user-practice.js'

const MAX_SMART_STATE_IDS = 2000

export async function getQuestionsBySubject(subjectId) {
	const result = await getAllPracticeQuestions({
		subjectId: subjectId || DEFAULT_SUBJECT_ID,
		mode: 'sequence',
		pageSize: 50
	})
	return result.items
}

function applyLimit(list, limit) {
	const value = Number(limit)
	return value > 0 ? list.slice(0, value) : list
}

async function loadRecordedQuestions(subjectId, mode) {
	const questionIds = []
	let page = 1
	let hasMore = true
	while (hasMore && page <= 100) {
		const result = await getPracticeRecords({
			subjectId,
			type: mode,
			page,
			pageSize: 50
		})
		;(result.items || []).forEach(item => {
			const questionId = item && item.question && item.question.id
			if (questionId) questionIds.push(questionId)
		})
		hasMore = Boolean(result.hasMore)
		page += 1
	}
	if (!questionIds.length) return []
	const result = await getQuestionsByIds({ subjectId, questionIds })
	return result.items
}

export async function buildPracticeQuestions(options) {
	const config = options || {}
	const subjectId = config.subjectId || DEFAULT_SUBJECT_ID
	const mode = config.mode || 'sequence'
	let list = []

	if (mode === 'wrong' || mode === 'favorite') {
		list = await loadRecordedQuestions(subjectId, mode)
	} else if (mode === 'smart') {
		const pageSize = Number(config.limit) || DAILY_GOAL
		let result
		if (practiceCloudSyncEnabled()) {
			result = await getSmartPracticeQuestions({ subjectId, pageSize })
		} else {
			const state = getPracticeState()
			const localStates = Object.keys(state.answers).map(questionId => {
				const answer = state.answers[questionId]
				return { questionId, answer }
			}).filter(item => item.answer && item.answer.subjectId === subjectId)
				.sort((left, right) => {
					return (Number(right.answer.timestamp) || 0) - (Number(left.answer.timestamp) || 0)
				})
			const answeredQuestionIds = localStates.slice(0, MAX_SMART_STATE_IDS)
				.map(item => item.questionId)
			const wrongQuestionIds = localStates.filter(item => item.answer.correct === false)
				.slice(0, MAX_SMART_STATE_IDS)
				.map(item => item.questionId)
			result = await getPracticePage({
				subjectId,
				mode: 'smart',
				pageSize,
				answeredQuestionIds,
				wrongQuestionIds
			}, {
				versionFromResponse: true
			})
		}
		list = result.items
	} else if (mode === 'search') {
		const result = await getPracticePage({
			subjectId,
			mode,
			keyword: config.keyword,
			pageSize: 50,
			cursor: 0
		})
		list = result.items || []
		if (config.startId && !list.some(question => question.id === config.startId)) {
			const selected = await getQuestionsByIds({ subjectId, questionIds: [config.startId] })
			list = selected.items.concat(list)
		}
	} else {
		const query = {
			subjectId,
			mode,
			pageSize: 50
		}
		if (mode === 'chapter') query.chapterId = config.chapterId
		if (mode === 'knowledge') {
			query.chapterId = config.chapterId
			query.knowledge = config.knowledge
		}
		const result = await getAllPracticeQuestions(query)
		list = result.items
	}

	const defaultLimit = mode === 'smart' ? DAILY_GOAL : 0
	return applyLimit(list, config.limit || defaultLimit)
}

export async function getKnowledgeGroups(subjectId) {
	const catalog = await getCatalog(subjectId || DEFAULT_SUBJECT_ID)
	return Array.isArray(catalog.knowledgeGroups) ? catalog.knowledgeGroups.slice() : []
}
