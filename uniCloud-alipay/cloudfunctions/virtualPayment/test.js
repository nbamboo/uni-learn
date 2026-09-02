'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const {
	addCalendarMonths,
	calculateMessageSignature,
	calculatePaySignature,
	calculateUserSignature,
	createVirtualPaymentService,
	parseNotificationBody,
	recomputeMembership
} = require('./service')

function createDatabase(seed, now) {
	const collections = {}
	Object.keys(seed).forEach(name => {
		collections[name] = new Map(seed[name].map(item => [item._id, item]))
	})
	function collection(name) {
		if (!collections[name]) collections[name] = new Map()
		const source = collections[name]
		return {
			doc(id) {
				return {
					async get() {
						return { data: source.has(id) ? [source.get(id)] : [] }
					},
					async set(document) {
						source.set(id, document)
						return { id }
					}
				}
			},
			where(condition) {
				let limit = Infinity
				let order = null
				const query = {
					orderBy(field, direction) {
						order = { field, direction }
						return query
					},
					limit(value) {
						limit = value
						return query
					},
					async get() {
						let data = Array.from(source.values()).filter(item => Object.keys(condition)
							.every(key => item[key] === condition[key]))
						if (order) {
							data.sort((left, right) => {
								const diff = new Date(left[order.field]).getTime() - new Date(right[order.field]).getTime()
								return order.direction === 'desc' ? -diff : diff
							})
						}
						return { data: data.slice(0, limit) }
					}
				}
				return query
			}
		}
	}
	const db = {
		collection,
		serverDate: () => new Date(now),
		async startTransaction() {
			return { collection, commit: async () => {}, rollback: async () => {} }
		}
	}
	return { db, collections }
}

function encryptWeixinMessage(message, encodingAESKey, appId) {
	const key = Buffer.from(`${encodingAESKey}=`, 'base64')
	const messageBuffer = Buffer.from(message)
	const length = Buffer.alloc(4)
	length.writeUInt32BE(messageBuffer.length)
	const plain = Buffer.concat([Buffer.alloc(16, 7), length, messageBuffer, Buffer.from(appId)])
	const padding = 32 - plain.length % 32
	const padded = Buffer.concat([plain, Buffer.alloc(padding, padding)])
	const cipher = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
	cipher.setAutoPadding(false)
	return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
}

async function testReconcileFairness() {
	const currentTime = new Date('2026-09-02T00:00:00.000Z')
	const orders = Array.from({ length: 51 }, (_, index) => {
		const orderNumber = String(index + 1).padStart(2, '0')
		const outTradeNo = `Mreconcile${orderNumber}`
		return {
			_id: outTradeNo,
			outTradeNo,
			userId: 'reconcile-user',
			openid: 'reconcile-openid',
			productId: 'membership_1m',
			productName: '1个月会员',
			months: 1,
			quantity: 1,
			amountFen: 300,
			env: 0,
			status: 'pending',
			createdAt: new Date(`2026-09-01T00:00:${orderNumber}.000Z`),
			updatedAt: new Date(`2026-09-01T00:00:${orderNumber}.000Z`),
			queryAttempts: 0
		}
	})
	const environment = createDatabase({
		question_bank_payment_orders: orders,
		question_bank_memberships: []
	}, currentTime)
	const queriedOrderIds = []
	const service = createVirtualPaymentService(environment.db, {
		now: () => new Date(currentTime),
		appId: 'wx-test',
		appSecret: 'secret-test',
		offerId: 'offer-test',
		appKey: 'app-key-test',
		async httpRequest(url, options) {
			if (url.indexOf('/cgi-bin/stable_token') > -1) {
				return { data: { access_token: 'access-token-test', expires_in: 7200 } }
			}
			if (url.indexOf('/xpay/query_order') > -1) {
				const body = JSON.parse(options.content)
				queriedOrderIds.push(body.order_id)
				return { data: { errcode: 0, order: { order_id: body.order_id, status: 1, env_type: 1 } } }
			}
			throw new Error(`Unexpected URL: ${url}`)
		}
	})
	const first = await service.reconcilePendingOrders()
	assert.equal(first.scanned, 50)
	assert.equal(queriedOrderIds.includes('Mreconcile51'), false)
	await service.reconcilePendingOrders()
	assert.equal(queriedOrderIds[50], 'Mreconcile51')
}

async function testMissingOrderCleanup() {
	const currentTime = new Date('2026-09-02T01:00:00.000Z')
	const outTradeNo = 'Mmissingorder123456'
	const environment = createDatabase({
		question_bank_payment_orders: [{
			_id: outTradeNo,
			outTradeNo,
			userId: 'missing-user',
			openid: 'missing-openid',
			productId: 'membership_1m',
			productName: '1个月会员',
			months: 1,
			quantity: 1,
			amountFen: 300,
			env: 0,
			status: 'pending',
			createdAt: new Date('2026-09-02T00:29:00.000Z'),
			updatedAt: new Date('2026-09-02T00:29:00.000Z'),
			queryAttempts: 0
		}],
		question_bank_memberships: []
	}, currentTime)
	const service = createVirtualPaymentService(environment.db, {
		now: () => new Date(currentTime),
		appId: 'wx-test',
		appSecret: 'secret-test',
		offerId: 'offer-test',
		appKey: 'app-key-test',
		callbackToken: 'callback-token',
		async httpRequest(url) {
			if (url.indexOf('/cgi-bin/stable_token') > -1) {
				return { data: { access_token: 'access-token-test', expires_in: 7200 } }
			}
			if (url.indexOf('/xpay/query_order') > -1) {
				return { data: { errcode: 268490002, errmsg: 'data not found' } }
			}
			throw new Error(`Unexpected URL: ${url}`)
		}
	})

	for (let attempt = 1; attempt <= 2; attempt += 1) {
		const summary = await service.reconcilePendingOrders()
		assert.equal(summary.failed, 1)
		assert.equal(environment.collections.question_bank_payment_orders.get(outTradeNo).status, 'pending')
		assert.equal(environment.collections.question_bank_payment_orders.get(outTradeNo).queryAttempts, attempt)
	}
	const closedSummary = await service.reconcilePendingOrders()
	const closedOrder = environment.collections.question_bank_payment_orders.get(outTradeNo)
	assert.equal(closedSummary.closed, 1)
	assert.equal(closedOrder.status, 'closed')
	assert.equal(closedOrder.queryAttempts, 3)
	assert.equal((await service.reconcilePendingOrders()).scanned, 0)

	const timestamp = '1788235300'
	const nonce = 'late-notify'
	const signature = calculateMessageSignature('callback-token', timestamp, nonce)
	const notifyResult = await service.handleHttp({
		httpMethod: 'POST',
		headers: { 'content-type': 'text/xml' },
		queryStringParameters: { timestamp, nonce, signature },
		body: `<xml><Event><![CDATA[xpay_goods_deliver_notify]]></Event><OpenId><![CDATA[missing-openid]]></OpenId><OutTradeNo><![CDATA[${outTradeNo}]]></OutTradeNo><Env>0</Env><WeChatPayInfo><MchOrderNo><![CDATA[late-wx-order]]></MchOrderNo><PaidTime>1788235200</PaidTime></WeChatPayInfo><GoodsInfo><ProductId><![CDATA[membership_1m]]></ProductId><Quantity>1</Quantity><Attach><![CDATA[${outTradeNo}]]></Attach></GoodsInfo></xml>`
	})
	assert.match(notifyResult.body, /<ErrCode>0<\/ErrCode>/)
	assert.equal(environment.collections.question_bank_payment_orders.get(outTradeNo).status, 'delivered')
}

async function run() {
	const officialBody = '{"openid": "xxx", "user_ip": "127.0.0.1", "env": 0}'
	assert.equal(
		calculatePaySignature('/xpay/query_user_balance', officialBody, '12345'),
		'c37809f27c6d7fd1837ad2500a04512b66b34fd793a39a385fade56dca89a4b5'
	)
	assert.equal(
		calculateUserSignature(officialBody, '9hAb/NEYUlkaMBEsmFgzig=='),
		'089d9e8dc5d308977360c4b79ec600a93d736802802a807d634192328032f6c7'
	)
	assert.equal(
		calculateMessageSignature('AAAAA', '1714036504', '1514711492'),
		'f464b24fc39322e44b38aa78f5edd27bd1441696'
	)

	const januaryEnd = new Date('2026-01-31T04:30:00.000Z').getTime()
	assert.equal(new Date(addCalendarMonths(januaryEnd, 1)).toISOString(), '2026-02-28T04:30:00.000Z')
	const computed = recomputeMembership({
		grants: [
			{ grantId: 'a', months: 1, quantity: 1, grantedAt: new Date('2026-01-01T00:00:00.000Z') },
			{ grantId: 'b', months: 3, quantity: 1, grantedAt: new Date('2026-01-15T00:00:00.000Z') }
		]
	}, new Date('2026-01-20T00:00:00.000Z').getTime())
	assert.equal(new Date(computed.expiresAt).toISOString(), '2026-05-01T00:00:00.000Z')

	const parsed = parseNotificationBody(`
		<xml>
			<Event><![CDATA[xpay_goods_deliver_notify]]></Event>
			<OpenId><![CDATA[openid-one]]></OpenId>
			<OutTradeNo><![CDATA[order-one]]></OutTradeNo>
			<Env>0</Env>
			<WeChatPayInfo><MchOrderNo><![CDATA[wx-order-one]]></MchOrderNo><PaidTime>1788235200</PaidTime></WeChatPayInfo>
			<GoodsInfo><ProductId><![CDATA[membership_1m]]></ProductId><Quantity>1</Quantity><OrigPrice>300</OrigPrice><ActualPrice>300</ActualPrice><Attach><![CDATA[order-one]]></Attach></GoodsInfo>
		</xml>
	`, 'text/xml')
	assert.equal(parsed.WeChatPayInfo.MchOrderNo, 'wx-order-one')
	assert.equal(parsed.GoodsInfo.ProductId, 'membership_1m')
	const minimalParsed = parseNotificationBody(`
		<xml>
			<Event><![CDATA[xpay_goods_deliver_notify]]></Event>
			<GoodsInfo><ProductId><![CDATA[membership_1m]]></ProductId><Quantity>1</Quantity><Attach><![CDATA[order-one]]></Attach></GoodsInfo>
		</xml>
	`, 'text/xml')
	assert.equal(Number.isNaN(minimalParsed.GoodsInfo.OrigPrice), true)
	assert.equal(Number.isNaN(minimalParsed.GoodsInfo.ActualPrice), true)

	const currentTime = new Date('2026-09-01T04:00:00.000Z')
	const environment = createDatabase({
		'uni-id-users': [{ _id: 'user-one', wx_openid: { mp: 'openid-one' } }],
		question_bank_payment_orders: [],
		question_bank_memberships: []
	}, currentTime)
	let queryCalls = 0
	let createdOrderId = ''
	const service = createVirtualPaymentService(environment.db, {
		now: () => new Date(currentTime),
		appId: 'wx-test',
		appSecret: 'secret-test',
		offerId: 'offer-test',
		appKey: 'app-key-test',
		callbackToken: 'callback-token',
		encodingAESKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
		async httpRequest(url, options) {
			if (url.indexOf('/sns/jscode2session') > -1) {
				return { data: { openid: 'openid-one', session_key: 'session-key-test' } }
			}
			if (url.indexOf('/cgi-bin/stable_token') > -1) {
				return { data: { access_token: 'access-token-test', expires_in: 7200 } }
			}
			if (url.indexOf('/xpay/query_order') > -1) {
				queryCalls += 1
				const body = options.content
				const expected = calculatePaySignature('/xpay/query_order', body, 'app-key-test')
				assert.equal(new URL(url).searchParams.get('pay_sig'), expected)
				return {
					data: {
						errcode: 0,
						order: {
							order_id: createdOrderId,
							status: 2,
							order_fee: 300,
							paid_fee: 300,
							paid_time: 1788235200,
							wx_order_id: 'wx-order-one',
							wxpay_order_id: 'transaction-one',
							env_type: 1
						}
					}
				}
			}
			throw new Error(`Unexpected URL: ${url}`)
		}
	})

	const created = await service.execute({
		action: 'createOrder',
		productId: 'membership_1m',
		code: 'login-code'
	}, 'user-one')
	createdOrderId = created.order.outTradeNo
	assert.equal(created.order.amountFen, 300)
	assert.equal(created.payData.mode, 'short_series_goods')
	assert.equal(
		created.payData.paySig,
		calculatePaySignature('requestVirtualPayment', created.payData.signData, 'app-key-test')
	)
	const signData = JSON.parse(created.payData.signData)
	assert.equal(signData.outTradeNo, created.order.outTradeNo)
	assert.equal(signData.attach, created.order.outTradeNo)

	const queried = await service.execute({
		action: 'queryOrder',
		outTradeNo: created.order.outTradeNo
	}, 'user-one')
	assert.equal(queried.order.status, 'delivered')
	assert.equal(queried.membership.isMember, true)
	assert.equal(queryCalls, 1)

	const timestamp = '1788235300'
	const nonce = 'nonce-one'
	const signature = calculateMessageSignature('callback-token', timestamp, nonce)
	const notifyResult = await service.handleHttp({
		httpMethod: 'POST',
		headers: { 'content-type': 'text/xml' },
		queryStringParameters: { timestamp, nonce, signature },
		body: `<xml><Event><![CDATA[xpay_goods_deliver_notify]]></Event><OpenId><![CDATA[openid-one]]></OpenId><OutTradeNo><![CDATA[${created.order.outTradeNo}]]></OutTradeNo><Env>0</Env><WeChatPayInfo><MchOrderNo><![CDATA[wx-order-one]]></MchOrderNo><TransactionId><![CDATA[transaction-one]]></TransactionId><PaidTime>1788235200</PaidTime></WeChatPayInfo><GoodsInfo><ProductId><![CDATA[membership_1m]]></ProductId><Quantity>1</Quantity><Attach><![CDATA[${created.order.outTradeNo}]]></Attach></GoodsInfo></xml>`
	})
	assert.match(notifyResult.body, /<ErrCode>0<\/ErrCode>/)
	const membership = environment.collections.question_bank_memberships.get('user-one')
	assert.equal(membership.grants.length, 1)
	const wrongAmountResult = await service.handleHttp({
		httpMethod: 'POST',
		headers: { 'content-type': 'text/xml' },
		queryStringParameters: { timestamp, nonce, signature },
		body: `<xml><Event><![CDATA[xpay_goods_deliver_notify]]></Event><OpenId><![CDATA[openid-one]]></OpenId><OutTradeNo><![CDATA[${created.order.outTradeNo}]]></OutTradeNo><Env>0</Env><WeChatPayInfo><MchOrderNo><![CDATA[wx-order-one]]></MchOrderNo></WeChatPayInfo><GoodsInfo><ProductId><![CDATA[membership_1m]]></ProductId><Quantity>1</Quantity><ActualPrice>1</ActualPrice><Attach><![CDATA[${created.order.outTradeNo}]]></Attach></GoodsInfo></xml>`
	})
	assert.match(wrongAmountResult.body, /<ErrCode>1<\/ErrCode>/)
	assert.equal(environment.collections.question_bank_memberships.get('user-one').grants.length, 1)

	const secureMessage = `<xml><Event><![CDATA[xpay_goods_deliver_notify]]></Event><OpenId><![CDATA[openid-one]]></OpenId><OutTradeNo><![CDATA[${created.order.outTradeNo}]]></OutTradeNo><Env>0</Env><WeChatPayInfo><MchOrderNo><![CDATA[wx-order-one]]></MchOrderNo><TransactionId><![CDATA[transaction-one]]></TransactionId><PaidTime>1788235200</PaidTime></WeChatPayInfo><GoodsInfo><ProductId><![CDATA[membership_1m]]></ProductId><Quantity>1</Quantity><Attach><![CDATA[${created.order.outTradeNo}]]></Attach></GoodsInfo></xml>`
	const encrypted = encryptWeixinMessage(
		secureMessage,
		'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
		'wx-test'
	)
	const msgSignature = calculateMessageSignature('callback-token', timestamp, nonce, encrypted)
	const secureResult = await service.handleHttp({
		httpMethod: 'POST',
		headers: { 'content-type': 'text/xml' },
		queryStringParameters: {
			timestamp,
			nonce,
			encrypt_type: 'aes',
			msg_signature: msgSignature
		},
		body: `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`
	})
	assert.equal(secureResult.body, 'success')
	assert.equal(environment.collections.question_bank_memberships.get('user-one').grants.length, 1)

	const refundResult = await service.handleHttp({
		httpMethod: 'POST',
		headers: { 'content-type': 'text/xml' },
		queryStringParameters: { timestamp, nonce, signature },
		body: `<xml><Event><![CDATA[xpay_refund_notify]]></Event><MchOrderId><![CDATA[${created.order.outTradeNo}]]></MchOrderId><WxOrderId><![CDATA[wx-order-one]]></WxOrderId><WxRefundId><![CDATA[refund-one]]></WxRefundId><RefundFee>300</RefundFee><RetCode>0</RetCode><RefundSuccTimestamp>1788235400</RefundSuccTimestamp></xml>`
	})
	assert.match(refundResult.body, /<ErrCode>0<\/ErrCode>/)
	assert.equal(environment.collections.question_bank_payment_orders.get(created.order.outTradeNo).status, 'refunded')
	assert.equal(environment.collections.question_bank_memberships.get('user-one').status, 'expired')
	await testReconcileFairness()
	await testMissingOrderCleanup()

	console.log('virtualPayment service tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
