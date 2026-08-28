'use strict'

const uniID = require('uni-id-common')
const { QuestionBankUserError, createQuestionBankUserService } = require('./service')

const db = uniCloud.database()
const service = createQuestionBankUserService(db)

function getRequestId(context) {
	return context && (context.requestId || context.REQUESTID) || ''
}

function refreshedToken(payload) {
	if (!payload || !payload.token || !payload.tokenExpired) return undefined
	return {
		token: payload.token,
		tokenExpired: payload.tokenExpired
	}
}

async function authenticate(event, context) {
	if (!event || !event.uniIdToken) {
		throw new QuestionBankUserError('QUESTION_BANK_LOGIN_REQUIRED', '请先登录后再同步做题数据')
	}
	const uniIdInstance = uniID.createInstance({ context })
	const payload = await uniIdInstance.checkToken(event.uniIdToken)
	if (!payload || payload.errCode) {
		throw new QuestionBankUserError(
			'QUESTION_BANK_LOGIN_REQUIRED',
			payload && (payload.errMsg || payload.message) || '登录状态已失效，请重新登录'
		)
	}
	return payload
}

exports.main = async (event, context) => {
	const startedAt = Date.now()
	const requestId = getRequestId(context)
	const action = event && event.action
	try {
		const identity = await authenticate(event, context)
		const data = await service.execute(event, identity.uid)
		const response = {
			errCode: 0,
			errMsg: 'ok',
			data,
			requestId
		}
		const newToken = refreshedToken(identity)
		if (newToken) response.newToken = newToken
		console.info('[questionBankUser]', JSON.stringify({
			requestId,
			action,
			uid: identity.uid,
			durationMs: Date.now() - startedAt
		}))
		return response
	} catch (error) {
		const expected = error instanceof QuestionBankUserError
		const errCode = expected ? error.errCode : 'QUESTION_BANK_USER_INTERNAL_ERROR'
		const errMsg = expected ? error.message : '用户题库服务暂时不可用，请稍后重试'
		console.error('[questionBankUser]', JSON.stringify({
			requestId,
			action,
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
