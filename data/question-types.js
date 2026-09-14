export const QUESTION_TYPE_LABELS = Object.freeze({
	single: '单选题',
	judgment: '判断题',
	multiple: '多选题',
	material: '材料题'
})

export const QUESTION_SELECTION_MODES = Object.freeze({
	single: 'single',
	judgment: 'single',
	multiple: 'multiple',
	material: 'multiple'
})

export function getQuestionTypeLabel(type) {
	const label = QUESTION_TYPE_LABELS[type]
	if (!label) throw new Error(`不支持的题型：${type || 'empty'}`)
	return label
}

export function isValidQuestionSelectionMode(type, selectionMode) {
	return Boolean(QUESTION_SELECTION_MODES[type])
		&& QUESTION_SELECTION_MODES[type] === selectionMode
}
