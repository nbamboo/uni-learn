'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadMembershipService(environment) {
	const servicePath = path.resolve(__dirname, '../services/membership.js')
	let source = fs.readFileSync(servicePath, 'utf8')
	source = source
		.replace(/^import .*?\n/, '')
		.replace(/export default \{[\s\S]*?\}\s*$/, '')
		.replace(/\bexport\s+(?=(?:class|async\s+function|function|const|let|var)\b)/g, '')
	source += `\n;globalThis.__membershipService = {
		getCachedMembership,
		getMembership,
		purchaseMembership,
		queryMembershipOrder,
		restoreLastMembershipOrder
	}`
	vm.createContext(environment)
	vm.runInContext(source, environment, { filename: servicePath })
	return environment.__membershipService
}

async function run() {
	const storage = new Map()
	const user = { uid: 'member-user', tokenExpired: Date.now() + 60 * 60 * 1000 }
	let queryShouldFail = true
	let paymentCalls = 0
	let queryCalls = 0
	const environment = {
		ensurePracticeUser: async () => user,
		getCurrentPracticeUser: () => user,
		uni: {
			getStorageSync: key => storage.get(key),
			setStorageSync: (key, value) => storage.set(key, value),
			login(options) {
				options.success({ code: 'payment-login-code' })
			}
		},
		uniCloud: {
			async callFunction(request) {
				if (request.data.action === 'createOrder') {
					assert.equal(request.data.productId, 'membership_1m')
					assert.equal(request.data.code, 'payment-login-code')
					return {
						result: {
							errCode: 0,
							data: {
								order: {
									outTradeNo: 'Mpaymentorder1',
									productId: 'membership_1m',
									amountFen: 300,
									status: 'pending'
								},
								payData: { signData: '{}', mode: 'short_series_goods', paySig: 'sig', signature: 'user-sig' }
							}
						}
					}
				}
				if (request.data.action === 'queryOrder') {
					queryCalls += 1
					if (queryShouldFail) {
						return { result: { errCode: 'VIRTUAL_PAYMENT_QUERY_FAILED', errMsg: 'temporary failure' } }
					}
					return {
						result: {
							errCode: 0,
							data: {
								order: { outTradeNo: request.data.outTradeNo, status: 'delivered' },
								membership: { isMember: true, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }
							}
						}
					}
				}
				throw new Error(`unexpected action: ${request.data.action}`)
			}
		},
		wx: {
			getSystemInfoSync: () => ({ SDKVersion: '3.10.0', platform: 'android', version: '8.0.70', system: 'Android 16' }),
			canIUse: () => true,
			requestVirtualPayment(options) {
				paymentCalls += 1
				options.success({ errMsg: 'requestVirtualPayment:ok' })
			}
		},
		console,
		setTimeout,
		clearTimeout,
		Date,
		Map,
		Set,
		Promise,
		Math,
		JSON,
		Error,
		Array,
		Object,
		Number,
		String,
		Boolean
	}

	const service = loadMembershipService(environment)
	const pending = await service.purchaseMembership('membership_1m')
	assert.equal(paymentCalls, 1)
	assert.equal(queryCalls, 1)
	assert.equal(pending.order.status, 'pending')
	assert.equal(pending.confirmationPending, true)
	assert.equal(pending.queryError.errCode, 'VIRTUAL_PAYMENT_QUERY_FAILED')
	assert.equal(storage.get('uni-learn-membership-last-order-v1:member-user').outTradeNo, 'Mpaymentorder1')

	queryShouldFail = false
	const restored = await service.restoreLastMembershipOrder()
	assert.equal(restored.order.status, 'delivered')
	assert.equal(restored.membership.isMember, true)
	assert.equal(service.getCachedMembership().isMember, true)

	console.log('membership service tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
