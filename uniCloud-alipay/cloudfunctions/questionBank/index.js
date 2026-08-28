'use strict'

const { QuestionBankError, createQuestionBankService } = require('./service')

const db = uniCloud.database()
const service = createQuestionBankService(db)

function getRequestId(context) {
	return context && (context.requestId || context.REQUESTID) || ''
}

function getItemCount(data) {
	if (data && Array.isArray(data.items)) return data.items.length
	return undefined
}

exports.main = async (event, context) => {
	const startedAt = Date.now()
	const requestId = getRequestId(context)
	const action = event && event.action
	const subjectId = event && event.subjectId
	try {
		const data = await service.execute(event)
		console.info('[questionBank]', JSON.stringify({
			requestId,
			action,
			subjectId,
			itemCount: getItemCount(data),
			durationMs: Date.now() - startedAt
		}))
		return {
			errCode: 0,
			errMsg: 'ok',
			data,
			requestId
		}
	} catch (error) {
		const expected = error instanceof QuestionBankError
		const errCode = expected ? error.errCode : 'QUESTION_BANK_INTERNAL_ERROR'
		const errMsg = expected ? error.message : '题库服务暂时不可用，请稍后重试'
		console.error('[questionBank]', JSON.stringify({
			requestId,
			action,
			subjectId,
			errCode,
			durationMs: Date.now() - startedAt,
			error: expected ? error.message : error && (error.stack || error.message || String(error))
		}))
		return {
			errCode,
			errMsg,
			data: null,
			requestId
		}
	}
}
