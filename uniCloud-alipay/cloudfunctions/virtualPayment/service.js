'use strict'

const crypto = require('crypto')

const ORDER_COLLECTION = 'question_bank_payment_orders'
const MEMBERSHIP_COLLECTION = 'question_bank_memberships'
const USER_COLLECTION = 'uni-id-users'
const ENV = 0
const ORDER_ID_PATTERN = /^[A-Za-z0-9_\-|*@]{8,32}$/
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_\-|*@]{1,64}$/
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const MAX_GRANTS = 200
const MISSING_ORDER_ERRCODE = 268490002
const MISSING_ORDER_CLOSE_ATTEMPTS = 3
const MISSING_ORDER_CLOSE_AGE_MS = 30 * 60 * 1000

const PRODUCTS = Object.freeze({
	'membership_1m': Object.freeze({ productId: 'membership_1m', name: '1个月会员', months: 1, priceFen: 300 }),
	'membership_3m': Object.freeze({ productId: 'membership_3m', name: '3个月会员', months: 3, priceFen: 600 }),
	'membership_6m': Object.freeze({ productId: 'membership_6m', name: '半年会员', months: 6, priceFen: 1000 }),
	'membership_12m': Object.freeze({ productId: 'membership_12m', name: '1年会员', months: 12, priceFen: 1500 })
})

class VirtualPaymentError extends Error {
	constructor(errCode, errMsg, details) {
		super(errMsg)
		this.name = 'VirtualPaymentError'
		this.errCode = errCode
		Object.assign(this, details || {})
	}
}

function fail(errCode, errMsg, details) {
	throw new VirtualPaymentError(errCode, errMsg, details)
}

function rows(response) {
	if (!response) return []
	if (Array.isArray(response.data)) return response.data
	if (response.data && typeof response.data === 'object') return [response.data]
	return []
}

function dateValue(value) {
	if (value instanceof Date) return value.getTime()
	if (value && typeof value === 'object' && value.$date !== undefined) return Number(value.$date) || 0
	const result = new Date(value || 0).getTime()
	return Number.isFinite(result) ? result : 0
}

function optionalNumber(value) {
	if (value === undefined || value === null || value === '') return Number.NaN
	const result = Number(value)
	return Number.isFinite(result) ? result : Number.NaN
}

function requireString(value, name, options) {
	const config = options || {}
	if (typeof value !== 'string') fail('VIRTUAL_PAYMENT_INVALID_ARGUMENT', `${name}必须是字符串`)
	const result = value.trim()
	if (config.required && !result) fail('VIRTUAL_PAYMENT_INVALID_ARGUMENT', `${name}不能为空`)
	if (config.maxLength && result.length > config.maxLength) {
		fail('VIRTUAL_PAYMENT_INVALID_ARGUMENT', `${name}长度不能超过${config.maxLength}个字符`)
	}
	if (config.pattern && result && !config.pattern.test(result)) {
		fail('VIRTUAL_PAYMENT_INVALID_ARGUMENT', `${name}格式不正确`)
	}
	return result
}

function hmacSha256(key, value) {
	return crypto.createHmac('sha256', key).update(value).digest('hex')
}

function calculatePaySignature(uri, body, appKey) {
	return hmacSha256(appKey, `${uri}&${body}`)
}

function calculateUserSignature(body, sessionKey) {
	return hmacSha256(sessionKey, body)
}

function calculateMessageSignature(token, timestamp, nonce, encrypted) {
	const parts = [token, timestamp, nonce]
	if (encrypted !== undefined && encrypted !== null && encrypted !== '') parts.push(encrypted)
	return crypto.createHash('sha1')
		.update(parts.map(String).sort().join(''))
		.digest('hex')
}

function timingSafeEqual(left, right) {
	const leftBuffer = Buffer.from(String(left || ''))
	const rightBuffer = Buffer.from(String(right || ''))
	return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function addCalendarMonths(timestamp, months) {
	const shifted = new Date(Number(timestamp) + SHANGHAI_OFFSET_MS)
	const year = shifted.getUTCFullYear()
	const month = shifted.getUTCMonth()
	const day = shifted.getUTCDate()
	const targetMonthStart = new Date(Date.UTC(
		year,
		month + months,
		1,
		shifted.getUTCHours(),
		shifted.getUTCMinutes(),
		shifted.getUTCSeconds(),
		shifted.getUTCMilliseconds()
	))
	const lastDay = new Date(Date.UTC(
		targetMonthStart.getUTCFullYear(),
		targetMonthStart.getUTCMonth() + 1,
		0
	)).getUTCDate()
	targetMonthStart.setUTCDate(Math.min(day, lastDay))
	return targetMonthStart.getTime() - SHANGHAI_OFFSET_MS
}

function recomputeMembership(membership, timestamp) {
	const grants = Array.isArray(membership && membership.grants)
		? membership.grants.slice(-MAX_GRANTS)
		: []
	const activeGrants = grants.filter(item => !item.revokedAt)
		.sort((left, right) => dateValue(left.grantedAt) - dateValue(right.grantedAt))
	let expiresAt = 0
	activeGrants.forEach(grant => {
		const grantedAt = dateValue(grant.grantedAt) || timestamp
		const base = Math.max(expiresAt, grantedAt)
		expiresAt = addCalendarMonths(base, Number(grant.months) * Number(grant.quantity || 1))
	})
	return {
		grants,
		expiresAt,
		status: expiresAt > timestamp ? 'active' : 'expired'
	}
}

function publicMembership(membership, timestamp) {
	const expiresAt = dateValue(membership && membership.expiresAt)
	const isMember = expiresAt > timestamp && membership && membership.status !== 'revoked'
	return {
		isMember,
		status: isMember ? 'active' : 'inactive',
		expiresAt: isMember ? expiresAt : 0,
		entitlements: {
		adFree: isMember,
		practiceRecords: isMember,
		advancedAnswerModes: isMember
		}
	}
}

function publicPlans() {
	return Object.keys(PRODUCTS).map(productId => Object.assign({}, PRODUCTS[productId]))
}

function decodeXml(value) {
	return String(value || '')
		.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&')
}

function xmlValue(xml, tag) {
	const match = String(xml || '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
	return match ? decodeXml(match[1].trim()) : ''
}

function encryptedPayload(body, contentType) {
	const raw = String(body || '').trim()
	if (!raw) return ''
	if (/json/i.test(contentType || '') || raw[0] === '{') {
		try {
			const parsed = JSON.parse(raw)
			return parsed && (parsed.Encrypt || parsed.encrypt) || ''
		} catch (error) {
			return ''
		}
	}
	return xmlValue(raw, 'Encrypt')
}

function decryptWeixinMessage(encrypted, encodingAESKey, appId) {
	if (!/^[A-Za-z0-9+/]{43}$/.test(encodingAESKey || '')) {
		fail('VIRTUAL_PAYMENT_CALLBACK_NOT_CONFIGURED', '安全模式 EncodingAESKey 未正确配置')
	}
	let key
	let encryptedBuffer
	try {
		key = Buffer.from(`${encodingAESKey}=`, 'base64')
		encryptedBuffer = Buffer.from(encrypted, 'base64')
	} catch (error) {
		fail('VIRTUAL_PAYMENT_INVALID_NOTIFICATION', '安全模式消息编码不正确')
	}
	if (key.length !== 32 || !encryptedBuffer.length) {
		fail('VIRTUAL_PAYMENT_INVALID_NOTIFICATION', '安全模式消息密钥或密文不正确')
	}
	let decrypted
	try {
		const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
		decipher.setAutoPadding(false)
		decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()])
	} catch (error) {
		fail('VIRTUAL_PAYMENT_INVALID_NOTIFICATION', '安全模式消息解密失败')
	}
	const padding = decrypted[decrypted.length - 1]
	if (!padding || padding > 32 || padding > decrypted.length) {
		fail('VIRTUAL_PAYMENT_INVALID_NOTIFICATION', '安全模式消息填充不正确')
	}
	const plain = decrypted.subarray(0, decrypted.length - padding)
	if (plain.length < 20) fail('VIRTUAL_PAYMENT_INVALID_NOTIFICATION', '安全模式消息长度不正确')
	const messageLength = plain.readUInt32BE(16)
	const messageEnd = 20 + messageLength
	if (messageEnd > plain.length) fail('VIRTUAL_PAYMENT_INVALID_NOTIFICATION', '安全模式消息长度不正确')
	const message = plain.subarray(20, messageEnd).toString('utf8')
	const payloadAppId = plain.subarray(messageEnd).toString('utf8')
	if (!appId || payloadAppId !== appId) {
		fail('VIRTUAL_PAYMENT_CALLBACK_APP_MISMATCH', '安全模式消息 AppID 校验失败')
	}
	return message
}

function parseNotificationBody(body, contentType) {
	const raw = String(body || '').trim()
	if (!raw) fail('VIRTUAL_PAYMENT_EMPTY_NOTIFICATION', '推送内容为空')
	if (/json/i.test(contentType || '') || raw[0] === '{') {
		try {
			return JSON.parse(raw)
		} catch (error) {
			fail('VIRTUAL_PAYMENT_INVALID_NOTIFICATION', '推送JSON格式不正确')
		}
	}
	const retCodeValue = xmlValue(raw, 'RetCode')
	return {
		Event: xmlValue(raw, 'Event'),
		ToUserName: xmlValue(raw, 'ToUserName'),
		OpenId: xmlValue(raw, 'OpenId'),
		OutTradeNo: xmlValue(raw, 'OutTradeNo'),
		Env: Number(xmlValue(raw, 'Env')),
		WeChatPayInfo: {
			MchOrderNo: xmlValue(xmlValue(raw, 'WeChatPayInfo'), 'MchOrderNo'),
			TransactionId: xmlValue(xmlValue(raw, 'WeChatPayInfo'), 'TransactionId'),
			PaidTime: Number(xmlValue(xmlValue(raw, 'WeChatPayInfo'), 'PaidTime'))
		},
		GoodsInfo: {
			ProductId: xmlValue(xmlValue(raw, 'GoodsInfo'), 'ProductId'),
			Quantity: Number(xmlValue(xmlValue(raw, 'GoodsInfo'), 'Quantity')),
			OrigPrice: optionalNumber(xmlValue(xmlValue(raw, 'GoodsInfo'), 'OrigPrice')),
			ActualPrice: optionalNumber(xmlValue(xmlValue(raw, 'GoodsInfo'), 'ActualPrice')),
			Attach: xmlValue(xmlValue(raw, 'GoodsInfo'), 'Attach')
		},
		WxRefundId: xmlValue(raw, 'WxRefundId'),
		MchRefundId: xmlValue(raw, 'MchRefundId'),
		WxOrderId: xmlValue(raw, 'WxOrderId'),
		MchOrderId: xmlValue(raw, 'MchOrderId'),
		RefundFee: Number(xmlValue(raw, 'RefundFee')),
		RetCode: retCodeValue === '' ? Number.NaN : Number(retCodeValue),
		RetMsg: xmlValue(raw, 'RetMsg'),
		RefundSuccTimestamp: Number(xmlValue(raw, 'RefundSuccTimestamp'))
	}
}

function xmlResponse(errCode, errMsg) {
	const safeMessage = String(errMsg || '').replace(/]]>/g, ']]&gt;')
	return `<xml><ErrCode>${Number(errCode) || 0}</ErrCode><ErrMsg><![CDATA[${safeMessage}]]></ErrMsg></xml>`
}

function httpResponse(body, contentType, statusCode) {
	return {
		mpserverlessComposedResponse: true,
		isBase64Encoded: false,
		statusCode: statusCode || 200,
		headers: { 'content-type': `${contentType}; charset=utf-8` },
		body: String(body)
	}
}

async function getDocument(store, collectionName, documentId) {
	const response = await store.collection(collectionName).doc(documentId).get()
	return rows(response)[0] || null
}

async function setDocument(store, collectionName, documentId, document) {
	return store.collection(collectionName).doc(documentId).set(document)
}

async function withTransaction(db, handler) {
	if (typeof db.startTransaction !== 'function') return handler(db)
	const transaction = await db.startTransaction()
	try {
		const result = await handler(transaction)
		await transaction.commit()
		return result
	} catch (error) {
		await transaction.rollback()
		throw error
	}
}

function createOrderId() {
	return `M${Date.now().toString(36)}${crypto.randomBytes(8).toString('hex')}`.slice(0, 32)
}

function extractOpenIds(user) {
	const value = user && user.wx_openid
	if (typeof value === 'string') return value ? [value] : []
	if (!value || typeof value !== 'object') return []
	return Object.keys(value).map(key => value[key]).filter(item => typeof item === 'string' && item)
}

function normalizeHttpData(response) {
	let data = response && response.data
	if (Buffer.isBuffer(data)) data = data.toString('utf8')
	if (typeof data === 'string') {
		try { data = JSON.parse(data) } catch (error) { /* handled below */ }
	}
	return data && typeof data === 'object' ? data : {}
}

function createVirtualPaymentService(db, options) {
	if (!db || typeof db.collection !== 'function') throw new Error('A uniCloud database instance is required')
	const config = options || {}
	const now = typeof config.now === 'function' ? config.now : () => new Date()
	const serverDate = () => typeof db.serverDate === 'function' ? db.serverDate() : now()
	const request = config.httpRequest
	let tokenCache = { value: '', expiresAt: 0 }

	function requirePaymentConfig() {
		const required = ['appId', 'appSecret', 'offerId', 'appKey']
		const missing = required.filter(key => typeof config[key] !== 'string' || !config[key].trim())
		if (missing.length) fail('VIRTUAL_PAYMENT_NOT_CONFIGURED', `虚拟支付服务端配置缺少：${missing.join('、')}`)
		if (ENV !== 0) fail('VIRTUAL_PAYMENT_INVALID_ENV', '个人主体虚拟支付必须使用现网环境')
		if (typeof request !== 'function') fail('VIRTUAL_PAYMENT_HTTP_UNAVAILABLE', '云端HTTP请求能力不可用')
	}

	async function requestJson(url, requestOptions) {
		const response = await request(url, Object.assign({ dataType: 'json', timeout: 10000 }, requestOptions))
		return normalizeHttpData(response)
	}

	async function code2Session(code) {
		requirePaymentConfig()
		const loginCode = requireString(code, 'code', { required: true, maxLength: 128 })
		const params = [
			`appid=${encodeURIComponent(config.appId)}`,
			`secret=${encodeURIComponent(config.appSecret)}`,
			`js_code=${encodeURIComponent(loginCode)}`,
			'grant_type=authorization_code'
		].join('&')
		const result = await requestJson(`https://api.weixin.qq.com/sns/jscode2session?${params}`, { method: 'GET' })
		if (result.errcode || !result.openid || !result.session_key) {
			fail('VIRTUAL_PAYMENT_WEIXIN_LOGIN_FAILED', result.errmsg || '微信支付登录态获取失败')
		}
		return { openid: result.openid, sessionKey: result.session_key }
	}

	async function getAccessToken() {
		requirePaymentConfig()
		const timestamp = now().getTime()
		if (tokenCache.value && tokenCache.expiresAt > timestamp + 5 * 60 * 1000) return tokenCache.value
		const body = JSON.stringify({
			grant_type: 'client_credential',
			appid: config.appId,
			secret: config.appSecret,
			force_refresh: false
		})
		const result = await requestJson('https://api.weixin.qq.com/cgi-bin/stable_token', {
			method: 'POST',
			content: body,
			headers: { 'content-type': 'application/json' }
		})
		if (result.errcode || !result.access_token) {
			fail('VIRTUAL_PAYMENT_ACCESS_TOKEN_FAILED', result.errmsg || '微信接口调用凭证获取失败')
		}
		tokenCache = {
			value: result.access_token,
			expiresAt: timestamp + Math.max(300, Number(result.expires_in) || 7200) * 1000
		}
		return tokenCache.value
	}

	async function queryWeixinOrder(order) {
		requirePaymentConfig()
		const uri = '/xpay/query_order'
		const body = JSON.stringify({ openid: order.openid, env: ENV, order_id: order.outTradeNo })
		const accessToken = await getAccessToken()
		const paySig = calculatePaySignature(uri, body, config.appKey)
		const result = await requestJson(
			`https://api.weixin.qq.com${uri}?access_token=${encodeURIComponent(accessToken)}&pay_sig=${paySig}`,
			{ method: 'POST', content: body, headers: { 'content-type': 'application/json' } }
		)
		if (result.errcode) {
			fail(
				'VIRTUAL_PAYMENT_QUERY_FAILED',
				result.errmsg || `微信查单失败：${result.errcode}`,
				{ platformErrCode: Number(result.errcode) || 0 }
			)
		}
		if (!result.order) fail('VIRTUAL_PAYMENT_QUERY_FAILED', '微信查单未返回订单信息')
		return result.order
	}

	async function readMembership(userId) {
		return getDocument(db, MEMBERSHIP_COLLECTION, userId)
	}

	async function getMembership(event, userId) {
		const timestamp = now().getTime()
		const saved = await readMembership(userId)
		return Object.assign(publicMembership(saved, timestamp), { plans: publicPlans() })
	}

	async function createOrder(event, userId) {
		requirePaymentConfig()
		const productId = requireString(event.productId, 'productId', {
			required: true,
			maxLength: 64,
			pattern: PRODUCT_ID_PATTERN
		})
		const product = PRODUCTS[productId]
		if (!product) fail('VIRTUAL_PAYMENT_PRODUCT_NOT_FOUND', '会员商品不存在')
		const login = await code2Session(event.code)
		const user = await getDocument(db, USER_COLLECTION, userId)
		if (!user || extractOpenIds(user).indexOf(login.openid) === -1) {
			fail('VIRTUAL_PAYMENT_USER_MISMATCH', '支付微信账号与当前登录账号不一致，请重新进入小程序')
		}
		let outTradeNo = ''
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const candidate = createOrderId()
			if (!await getDocument(db, ORDER_COLLECTION, candidate)) {
				outTradeNo = candidate
				break
			}
		}
		if (!outTradeNo) fail('VIRTUAL_PAYMENT_ORDER_ID_FAILED', '订单号生成失败，请重试')
		const signDataObject = {
			offerId: config.offerId,
			buyQuantity: 1,
			env: ENV,
			currencyType: 'CNY',
			productId,
			goodsPrice: product.priceFen,
			outTradeNo,
			attach: outTradeNo
		}
		const signData = JSON.stringify(signDataObject)
		const timestamp = now()
		await setDocument(db, ORDER_COLLECTION, outTradeNo, {
			_id: outTradeNo,
			outTradeNo,
			userId,
			openid: login.openid,
			productId,
			productName: product.name,
			months: product.months,
			quantity: 1,
			amountFen: product.priceFen,
			env: ENV,
			status: 'pending',
			createdAt: timestamp,
			updatedAt: timestamp,
			queryAttempts: 0
		})
		return {
			order: { outTradeNo, productId, amountFen: product.priceFen, status: 'pending' },
			payData: {
				signData,
				mode: 'short_series_goods',
				paySig: calculatePaySignature('requestVirtualPayment', signData, config.appKey),
				signature: calculateUserSignature(signData, login.sessionKey)
			}
		}
	}

	async function deliverOrder(outTradeNo, platformOrder) {
		const orderId = requireString(outTradeNo, 'outTradeNo', {
			required: true,
			maxLength: 32,
			pattern: ORDER_ID_PATTERN
		})
		const wxOrderId = requireString(platformOrder && platformOrder.wxOrderId, 'wx_order_id', {
			required: true,
			maxLength: 96
		})
		return withTransaction(db, async store => {
			const order = await getDocument(store, ORDER_COLLECTION, orderId)
			if (!order) fail('VIRTUAL_PAYMENT_ORDER_NOT_FOUND', '本地订单不存在')
			if (order.wxOrderId && order.wxOrderId !== wxOrderId) {
				fail('VIRTUAL_PAYMENT_ORDER_MISMATCH', '微信订单号与本地订单不一致')
			}
			if (order.status === 'refunded') return { order, alreadyDelivered: true }
			if (order.status === 'delivered') return { order, alreadyDelivered: true }
			const product = PRODUCTS[order.productId]
			if (!product || product.priceFen !== Number(order.amountFen) || product.months !== Number(order.months)) {
				fail('VIRTUAL_PAYMENT_ORDER_MISMATCH', '本地订单商品配置不一致')
			}
			const timestamp = now().getTime()
			const savedMembership = await getDocument(store, MEMBERSHIP_COLLECTION, order.userId)
			const membership = savedMembership || {
				_id: order.userId,
				userId: order.userId,
				grants: [],
				createdAt: serverDate()
			}
			const grants = Array.isArray(membership.grants) ? membership.grants.slice() : []
			if (!grants.some(item => item.grantId === wxOrderId)) {
				grants.push({
					grantId: wxOrderId,
					outTradeNo: order.outTradeNo,
					productId: order.productId,
					months: order.months,
					quantity: order.quantity,
					grantedAt: new Date(platformOrder.paidAt || timestamp)
				})
			}
			membership.grants = grants.slice(-MAX_GRANTS)
			const computed = recomputeMembership(membership, timestamp)
			membership.grants = computed.grants
			if (computed.expiresAt) membership.expiresAt = new Date(computed.expiresAt)
			else delete membership.expiresAt
			membership.status = computed.status
			membership.updatedAt = serverDate()
			order.wxOrderId = wxOrderId
			if (platformOrder.transactionId) order.transactionId = platformOrder.transactionId
			order.paidAt = new Date(platformOrder.paidAt || timestamp)
			order.deliveredAt = serverDate()
			order.status = 'delivered'
			order.updatedAt = serverDate()
			await setDocument(store, ORDER_COLLECTION, order._id, order)
			await setDocument(store, MEMBERSHIP_COLLECTION, membership._id, membership)
			return { order, membership: publicMembership(membership, timestamp), alreadyDelivered: false }
		})
	}

	async function deliverFromQuery(order, result) {
		const status = Number(result.status)
		if ([2, 3, 4].indexOf(status) === -1) return null
		if (result.order_id && result.order_id !== order.outTradeNo) {
			fail('VIRTUAL_PAYMENT_ORDER_MISMATCH', '微信查单结果与本地订单号不一致')
		}
		if (Number.isFinite(optionalNumber(result.env_type)) && Number(result.env_type) !== 1) {
			fail('VIRTUAL_PAYMENT_ORDER_MISMATCH', '微信查单结果不是现网订单')
		}
		const expectedAmount = Number(order.amountFen) * Number(order.quantity || 1)
		if (Number(result.order_fee) !== expectedAmount || Number(result.paid_fee) !== expectedAmount) {
			fail('VIRTUAL_PAYMENT_AMOUNT_MISMATCH', '微信订单金额与本地商品金额不一致')
		}
		return deliverOrder(order.outTradeNo, {
			wxOrderId: result.wx_order_id,
			transactionId: result.wxpay_order_id || result.channel_order_id || '',
			paidAt: Number(result.paid_time) > 0 ? Number(result.paid_time) * 1000 : now().getTime()
		})
	}

	async function applyTerminalQueryStatus(order, result) {
		const platformStatus = Number(result.status)
		if ([5, 6, 8].indexOf(platformStatus) === -1) return false
		order.status = platformStatus === 6 ? 'closed' : 'refunded'
		order.wxOrderId = result.wx_order_id || order.wxOrderId
		if (order.status === 'refunded') {
			order.refundFee = Number(result.refund_fee) || 0
			order.refundedAt = new Date(Number(result.paid_time) > 0
				? Number(result.paid_time) * 1000
				: now().getTime())
		}
		order.lastQueryAt = serverDate()
		order.queryAttempts = (Number(order.queryAttempts) || 0) + 1
		order.updatedAt = serverDate()
		await setDocument(db, ORDER_COLLECTION, order._id, order)
		return true
	}

	async function queryOrder(event, userId) {
		const outTradeNo = requireString(event.outTradeNo, 'outTradeNo', {
			required: true,
			maxLength: 32,
			pattern: ORDER_ID_PATTERN
		})
		let order = await getDocument(db, ORDER_COLLECTION, outTradeNo)
		if (!order || order.userId !== userId) fail('VIRTUAL_PAYMENT_ORDER_NOT_FOUND', '订单不存在')
		if (order.status === 'pending' || order.status === 'paid') {
			const result = await queryWeixinOrder(order)
			const delivered = await deliverFromQuery(order, result)
			if (!delivered) await applyTerminalQueryStatus(order, result)
			order = await getDocument(db, ORDER_COLLECTION, outTradeNo)
		}
		return {
			order: {
				outTradeNo: order.outTradeNo,
				productId: order.productId,
				amountFen: order.amountFen,
				status: order.status,
				createdAt: dateValue(order.createdAt),
				deliveredAt: dateValue(order.deliveredAt),
				refundedAt: dateValue(order.refundedAt)
			},
			membership: Object.assign(publicMembership(await readMembership(userId), now().getTime()), {
				plans: publicPlans()
			})
		}
	}

	async function validateGoodsNotification(message) {
		const order = await getDocument(db, ORDER_COLLECTION, message.OutTradeNo)
		if (!order) fail('VIRTUAL_PAYMENT_ORDER_NOT_FOUND', '本地订单不存在')
		const goods = message.GoodsInfo || {}
		if (message.OpenId !== order.openid
			|| Number(message.Env) !== ENV
			|| goods.ProductId !== order.productId
			|| Number(goods.Quantity) !== Number(order.quantity)
			|| goods.Attach !== order.outTradeNo) {
			fail('VIRTUAL_PAYMENT_ORDER_MISMATCH', '发货推送与本地订单不一致')
		}
		const expectedAmount = Number(order.amountFen) * Number(order.quantity || 1)
		const originalPrice = optionalNumber(goods.OrigPrice)
		const actualPrice = optionalNumber(goods.ActualPrice)
		if ((Number.isFinite(originalPrice) && originalPrice !== expectedAmount)
			|| (Number.isFinite(actualPrice) && actualPrice !== expectedAmount)) {
			fail('VIRTUAL_PAYMENT_AMOUNT_MISMATCH', '发货推送金额与本地订单金额不一致')
		}
		return order
	}

	async function handleGoodsNotification(message) {
		const order = await validateGoodsNotification(message)
		let wxOrderId = message.WeChatPayInfo && message.WeChatPayInfo.MchOrderNo
		let paidAt = Number(message.WeChatPayInfo && message.WeChatPayInfo.PaidTime) * 1000
		let transactionId = message.WeChatPayInfo && message.WeChatPayInfo.TransactionId
		if (!wxOrderId) {
			const result = await queryWeixinOrder(order)
			if ([2, 3, 4].indexOf(Number(result.status)) === -1) {
				fail('VIRTUAL_PAYMENT_ORDER_NOT_PAID', '微信订单尚未支付')
			}
			wxOrderId = result.wx_order_id
			paidAt = Number(result.paid_time) * 1000
			transactionId = result.wxpay_order_id || result.channel_order_id || ''
		}
		return deliverOrder(order.outTradeNo, {
			wxOrderId,
			paidAt: paidAt || now().getTime(),
			transactionId
		})
	}

	async function findOrderForRefund(message) {
		if (message.MchOrderId) {
			const direct = await getDocument(db, ORDER_COLLECTION, message.MchOrderId)
			if (direct) return direct
		}
		if (!message.WxOrderId) return null
		const response = await db.collection(ORDER_COLLECTION)
			.where({ wxOrderId: message.WxOrderId })
			.limit(1)
			.get()
		return rows(response)[0] || null
	}

	async function handleRefundNotification(message) {
		if (!Number.isFinite(Number(message.RetCode))) {
			fail('VIRTUAL_PAYMENT_INVALID_NOTIFICATION', '退款推送缺少有效结果码')
		}
		if (Number(message.RetCode) !== 0) return { ignored: true }
		const saved = await findOrderForRefund(message)
		if (!saved) fail('VIRTUAL_PAYMENT_ORDER_NOT_FOUND', '退款对应的本地订单不存在')
		if (message.WxOrderId && saved.wxOrderId && message.WxOrderId !== saved.wxOrderId) {
			fail('VIRTUAL_PAYMENT_ORDER_MISMATCH', '退款推送微信订单号与本地订单不一致')
		}
		const expectedRefundFee = Number(saved.amountFen) * Number(saved.quantity || 1)
		if (Number(message.RefundFee) !== expectedRefundFee) {
			fail('VIRTUAL_PAYMENT_AMOUNT_MISMATCH', '退款金额与本地订单金额不一致')
		}
		return withTransaction(db, async store => {
			const order = await getDocument(store, ORDER_COLLECTION, saved._id)
			if (order.status === 'refunded') return { alreadyRefunded: true }
			const timestamp = now().getTime()
			order.status = 'refunded'
			order.refundId = message.WxRefundId || message.MchRefundId || ''
			order.refundFee = Number(message.RefundFee) || 0
			order.refundedAt = new Date(Number(message.RefundSuccTimestamp) > 0
				? Number(message.RefundSuccTimestamp) * 1000
				: timestamp)
			order.updatedAt = serverDate()
			const membership = await getDocument(store, MEMBERSHIP_COLLECTION, order.userId)
			if (membership && Array.isArray(membership.grants)) {
				membership.grants = membership.grants.map(grant => {
					if (grant.outTradeNo !== order.outTradeNo && grant.grantId !== order.wxOrderId) return grant
					return Object.assign({}, grant, { revokedAt: order.refundedAt })
				})
				const computed = recomputeMembership(membership, timestamp)
				membership.grants = computed.grants
				if (computed.expiresAt) membership.expiresAt = new Date(computed.expiresAt)
				else delete membership.expiresAt
				membership.status = computed.status
				membership.updatedAt = serverDate()
				await setDocument(store, MEMBERSHIP_COLLECTION, membership._id, membership)
			}
			await setDocument(store, ORDER_COLLECTION, order._id, order)
			return { refunded: true }
		})
	}

	function verifyCallback(event) {
		if (!config.callbackToken) fail('VIRTUAL_PAYMENT_CALLBACK_NOT_CONFIGURED', '发货推送验签Token未配置')
		const query = event.queryStringParameters || {}
		const expected = calculateMessageSignature(config.callbackToken, query.timestamp || '', query.nonce || '')
		if (!query.signature || !timingSafeEqual(expected, query.signature)) {
			fail('VIRTUAL_PAYMENT_INVALID_CALLBACK_SIGNATURE', '发货推送签名校验失败')
		}
	}

	function verifyEncryptedCallback(event, encrypted) {
		if (!config.callbackToken) fail('VIRTUAL_PAYMENT_CALLBACK_NOT_CONFIGURED', '发货推送验签Token未配置')
		const query = event.queryStringParameters || {}
		const expected = calculateMessageSignature(
			config.callbackToken,
			query.timestamp || '',
			query.nonce || '',
			encrypted
		)
		if (!query.msg_signature || !timingSafeEqual(expected, query.msg_signature)) {
			fail('VIRTUAL_PAYMENT_INVALID_CALLBACK_SIGNATURE', '安全模式发货推送签名校验失败')
		}
	}

	async function handleHttp(event) {
		try {
			const query = event.queryStringParameters || {}
			if (String(event.httpMethod || '').toUpperCase() === 'GET') {
				verifyCallback(event)
				return httpResponse(query.echostr || '', 'text/plain', 200)
			}
			let body = event.body || ''
			if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8')
			const headers = event.headers || {}
			let contentType = headers['content-type'] || headers['Content-Type'] || ''
			const encrypted = encryptedPayload(body, contentType)
			if (encrypted) {
				verifyEncryptedCallback(event, encrypted)
				body = decryptWeixinMessage(encrypted, config.encodingAESKey, config.appId)
				contentType = String(body).trim()[0] === '{' ? 'application/json' : 'text/xml'
			} else {
				verifyCallback(event)
			}
			const message = parseNotificationBody(body, contentType)
			if (config.originalId && message.ToUserName && message.ToUserName !== config.originalId) {
				fail('VIRTUAL_PAYMENT_CALLBACK_APP_MISMATCH', '推送目标小程序不一致')
			}
			if (message.Event === 'xpay_goods_deliver_notify') await handleGoodsNotification(message)
			else if (message.Event === 'xpay_refund_notify') await handleRefundNotification(message)
			else fail('VIRTUAL_PAYMENT_UNSUPPORTED_NOTIFICATION', '不支持的虚拟支付推送类型')
			return encrypted
				? httpResponse('success', 'text/plain', 200)
				: httpResponse(xmlResponse(0, 'success'), 'text/xml', 200)
		} catch (error) {
			const message = error instanceof VirtualPaymentError ? error.message : 'internal error'
			return httpResponse(xmlResponse(1, message), 'text/xml', 200)
		}
	}

	async function reconcilePendingOrders() {
		requirePaymentConfig()
		const response = await db.collection(ORDER_COLLECTION)
			.where({ status: 'pending', env: ENV })
			.orderBy('updatedAt', 'asc')
			.limit(50)
			.get()
		const pending = rows(response)
		const summary = { scanned: pending.length, delivered: 0, pending: 0, closed: 0, failed: 0 }
		for (const order of pending) {
			try {
				const result = await queryWeixinOrder(order)
				const delivered = await deliverFromQuery(order, result)
				const terminal = delivered ? false : await applyTerminalQueryStatus(order, result)
				if (delivered) summary.delivered += 1
				else if (!terminal) summary.pending += 1
				order.lastQueryAt = serverDate()
				order.queryAttempts = (Number(order.queryAttempts) || 0) + 1
				order.updatedAt = serverDate()
				if (!delivered && !terminal) await setDocument(db, ORDER_COLLECTION, order._id, order)
			} catch (error) {
				const timestamp = now().getTime()
				const attempts = (Number(order.queryAttempts) || 0) + 1
				const closeMissingOrder = Number(error && error.platformErrCode) === MISSING_ORDER_ERRCODE
					&& attempts >= MISSING_ORDER_CLOSE_ATTEMPTS
					&& timestamp - dateValue(order.createdAt) >= MISSING_ORDER_CLOSE_AGE_MS
				order.lastQueryAt = serverDate()
				order.queryAttempts = attempts
				order.updatedAt = serverDate()
				if (closeMissingOrder) {
					order.status = 'closed'
					summary.closed += 1
				} else {
					summary.failed += 1
				}
				await setDocument(db, ORDER_COLLECTION, order._id, order)
				console.error('[virtualPayment:reconcile]', JSON.stringify({
					outTradeNo: order.outTradeNo,
					errCode: error && error.errCode || 'VIRTUAL_PAYMENT_RECONCILE_FAILED',
					platformErrCode: Number(error && error.platformErrCode) || undefined,
					queryAttempts: attempts,
					closed: closeMissingOrder
				}))
			}
		}
		return summary
	}

	const handlers = { getMembership, createOrder, queryOrder }

	async function execute(event, userId) {
		const action = requireString(event && event.action, 'action', { required: true, maxLength: 64 })
		const handler = handlers[action]
		if (!handler) fail('VIRTUAL_PAYMENT_UNSUPPORTED_ACTION', `不支持的action: ${action}`)
		return handler(event, userId)
	}

	return {
		execute,
		handleHttp,
		reconcilePendingOrders,
		queryWeixinOrder
	}
}

module.exports = {
	MEMBERSHIP_COLLECTION,
	ORDER_COLLECTION,
	PRODUCTS,
	VirtualPaymentError,
	addCalendarMonths,
	calculateMessageSignature,
	calculatePaySignature,
	calculateUserSignature,
	createVirtualPaymentService,
	parseNotificationBody,
	publicMembership,
	recomputeMembership,
	xmlResponse
}
