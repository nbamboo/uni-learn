import { DEFAULT_SUBJECT_ID, getPracticeState } from './practice.js'
import {
	getAllPracticeQuestions,
	getCatalog,
	hasCompleteQuestionBankCache,
	getPracticePage,
	getQuestionsByIds
} from '@/services/question-bank.js'
import {
	getPracticeRecordIds,
	getSmartPracticeState,
	getSmartPracticeQuestions,
	getEffectiveSmartPractice,
	getLocalPracticePreferences,
	pendingPracticeEventCount,
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

function getLocalSmartPracticeState(subjectId) {
	const state = getPracticeState()
	const localStates = Object.keys(state.answers).map(questionId => {
		const answer = state.answers[questionId]
		return { questionId, answer }
	}).filter(item => item.answer && item.answer.subjectId === subjectId)
		.sort((left, right) => {
			return (Number(right.answer.timestamp) || 0) - (Number(left.answer.timestamp) || 0)
		})
	return {
		answeredQuestionIds: localStates.slice(0, MAX_SMART_STATE_IDS)
			.map(item => item.questionId),
		wrongQuestionIds: localStates.filter(item => item.answer.correct === false)
			.slice(0, MAX_SMART_STATE_IDS)
			.map(item => item.questionId),
		favoriteQuestionIds: Array.isArray(state.favorites) ? state.favorites.slice() : []
	}
}

async function getLocalSmartPracticeQuestions(subjectId, pageSize, smartPractice) {
	const state = getLocalSmartPracticeState(subjectId)
	const result = await getPracticePage({
		subjectId,
		mode: 'smart',
		smartPractice,
		pageSize,
		answeredQuestionIds: state.answeredQuestionIds,
		wrongQuestionIds: state.wrongQuestionIds
	}, {
		versionFromResponse: true
	})
	result.favoriteQuestionIds = state.favoriteQuestionIds
	return result
}

async function loadRecordedQuestions(subjectId, mode) {
	const records = await getPracticeRecordIds({ subjectId, type: mode })
	const questionIds = Array.isArray(records.questionIds) ? records.questionIds : []
	if (!questionIds.length) return []
	const result = await getQuestionsByIds({ subjectId, questionIds })
	const favoriteIds = new Set(records.favoriteQuestionIds || [])
	;(result.items || []).forEach(question => {
		question.favorite = favoriteIds.has(question.id || question.questionId)
	})
	return result.items
}

export async function buildPracticeQuestions(options) {
	const config = options || {}
	const subjectId = config.subjectId || DEFAULT_SUBJECT_ID
	const mode = config.mode || 'sequence'
	let effectiveLimit = Number(config.limit) || 0
	let list = []

	if (mode === 'wrong' || mode === 'favorite') {
		list = await loadRecordedQuestions(subjectId, mode)
	} else if (mode === 'smart') {
		const smartPractice = getEffectiveSmartPractice(getLocalPracticePreferences().smartPractice)
		if (!effectiveLimit) effectiveLimit = smartPractice.questionCount
		const pageSize = effectiveLimit
		let result
		if (practiceCloudSyncEnabled()) {
			if (pendingPracticeEventCount() > 0) {
				result = await getLocalSmartPracticeQuestions(subjectId, pageSize, smartPractice)
			} else {
				try {
					if (hasCompleteQuestionBankCache(subjectId)) {
						const state = await getSmartPracticeState(subjectId)
						result = await getPracticePage({
							subjectId,
							mode: 'smart',
							smartPractice,
							pageSize,
							answeredQuestionIds: state.answeredQuestionIds,
							wrongQuestionIds: state.wrongQuestionIds
						}, {
							versionFromResponse: true
						})
					} else {
						result = await getSmartPracticeQuestions({ subjectId, pageSize, smartPractice })
					}
				} catch (error) {
					result = await getLocalSmartPracticeQuestions(subjectId, pageSize, smartPractice)
					result._syncError = error && (error.errMsg || error.message) || '云端智能取题失败'
				}
			}
			const favoriteIds = new Set(result.favoriteQuestionIds || [])
			;(result.items || []).forEach(question => {
				question.favorite = favoriteIds.has(question.id || question.questionId)
			})
		} else {
			result = await getLocalSmartPracticeQuestions(subjectId, pageSize, smartPractice)
		}
		list = result.items
		return list
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
		if (mode === 'section') {
			query.chapterId = config.chapterId
			query.section = config.section
		}
		if (mode === 'knowledge') {
			query.chapterId = config.chapterId
			query.knowledge = config.knowledge
		}
		const result = await getAllPracticeQuestions(query)
		list = result.items
	}

	return applyLimit(list, effectiveLimit)
}

export async function buildPracticeQuestionSet(options) {
	const config = options || {}
	const subjectId = config.subjectId || DEFAULT_SUBJECT_ID
	const items = await buildPracticeQuestions(config)
	const catalog = await getCatalog(subjectId)
	return {
		subjectId,
		version: catalog.activeVersion || '',
		items
	}
}

export async function getKnowledgeGroups(subjectId) {
	const catalog = await getCatalog(subjectId || DEFAULT_SUBJECT_ID)
	return Array.isArray(catalog.knowledgeGroups) ? catalog.knowledgeGroups.slice() : []
}
