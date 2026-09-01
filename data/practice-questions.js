import { DAILY_GOAL, DEFAULT_SUBJECT_ID } from './practice.js'
import {
	getAllPracticeQuestions,
	getCatalog,
	getPracticePage,
	getQuestionsByIds
} from '@/services/question-bank.js'
import {
	getPracticeRecords,
	getSmartPracticeQuestions
} from '@/services/user-practice.js'

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
		const result = await getSmartPracticeQuestions({
			subjectId,
			pageSize: Number(config.limit) || DAILY_GOAL
		})
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
		if (mode === 'knowledge') query.knowledge = config.knowledge
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
