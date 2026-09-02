'use strict'

const uniID = require('uni-id-common')
const createConfig = require('uni-config-center')
const { VirtualPaymentError, createVirtualPaymentService } = require('./service')

const db = uniCloud.database()
const uniIdConfig = createConfig({ pluginId: 'uni-id' }).config()
const paymentConfig = createConfig({ pluginId: 'virtual-payment' }).config()
const weixinConfig = uniIdConfig
	&& uniIdConfig['mp-weixin']
	&& uniIdConfig['mp-weixin'].oauth
	&& uniIdConfig['mp-weixin'].oauth.weixin || {}

const service = createVirtualPaymentService(db, {
	appId: weixinConfig.appid || '',
	appSecret: weixinConfig.appsecret || '',
	offerId: paymentConfig && paymentConfig.offerId || '',
	appKey: paymentConfig && paymentConfig.appKey || '',
	callbackToken: paymentConfig && paymentConfig.callbackToken || '',
	encodingAESKey: paymentConfig && paymentConfig.encodingAESKey || '',
	originalId: paymentConfig && paymentConfig.originalId || '',
	httpRequest: (url, options) => uniCloud.httpclient.request(url, options)
})

function requestId(context) {
	return context && (context.requestId || context.REQUESTID) || ''
}

function refreshedToken(payload) {
	if (!payload || !payload.token || !payload.tokenExpired) return undefined
	return { token: payload.token, tokenExpired: payload.tokenExpired }
}

async function authenticate(event, context) {
	if (!event || !event.uniIdToken) {
		throw new VirtualPaymentError('VIRTUAL_PAYMENT_LOGIN_REQUIRED', '请先登录微信账号')
	}
	const instance = uniID.createInstance({ context })
	const payload = await instance.checkToken(event.uniIdToken)
	if (!payload || payload.errCode) {
		throw new VirtualPaymentError(
			'VIRTUAL_PAYMENT_LOGIN_REQUIRED',
			payload && (payload.errMsg || payload.message) || '登录状态已失效，请重新登录'
		)
	}
	return payload
}

function isTimerEvent(event) {
	return event && (event.Type === 'Timer' || event.triggerName === 'TIMER_LATEST')
}

exports.main = async (event, context) => {
	if (event && event.httpMethod) return service.handleHttp(event)
	if (isTimerEvent(event)) return service.reconcilePendingOrders()
	const startedAt = Date.now()
	const traceId = requestId(context)
	const action = event && event.action
	try {
		const identity = await authenticate(event, context)
		const data = await service.execute(event, identity.uid)
		const response = { errCode: 0, errMsg: 'ok', data, requestId: traceId }
		const newToken = refreshedToken(identity)
		if (newToken) response.newToken = newToken
		console.info('[virtualPayment]', JSON.stringify({
			requestId: traceId,
			action,
			uid: identity.uid,
			durationMs: Date.now() - startedAt
		}))
		return response
	} catch (error) {
		const expected = error instanceof VirtualPaymentError
		const errCode = expected ? error.errCode : 'VIRTUAL_PAYMENT_INTERNAL_ERROR'
		const errMsg = expected ? error.message : '会员支付服务暂时不可用，请稍后重试'
		console.error('[virtualPayment]', JSON.stringify({
			requestId: traceId,
			action,
			errCode,
			durationMs: Date.now() - startedAt,
			error: expected ? error.message : error && (error.stack || error.message || String(error))
		}))
		return { errCode, errMsg, data: null, requestId: traceId }
	}
}
