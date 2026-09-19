'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadMembershipService(environment) {
	const servicePath = path.resolve(__dirname, '../services/membership.js')
	let source = fs.readFileSync(servicePath, 'utf8')
	source = source
		.replace(/^import[\s\S]*?from\s+['"][^'"]+['"]\s*/, '')
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
	let paymentTokenFailureOnce = false
	let createOrderCalls = 0
	let weixinLoginCalls = 0
	let queryCalls = 0
	let membershipCalls = 0
	let syncScheduleCalls = 0
	let forcedLoginCalls = 0
	let tokenFailureOnce = false
	let cloudMembership = {
		isMember: true,
		expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
	}
	const environment = {
		ensurePracticeUser: async options => {
			if (options && options.forceRefresh) forcedLoginCalls += 1
			return user
		},
		getCurrentPracticeUser: () => user,
		markPracticePreferencesRefreshRequired: () => {},
		markPracticeRecordsRefreshRequired: () => {},
		markPracticeSummaryRefreshRequired: () => {},
		schedulePracticeSync: options => {
			syncScheduleCalls += 1
			assert.equal(options.immediate, true)
		},
		uni: {
			getStorageSync: key => storage.get(key),
			setStorageSync: (key, value) => storage.set(key, value),
			login(options) {
				weixinLoginCalls += 1
				options.success({ code: 'payment-login-code' })
			}
		},
		uniCloud: {
			async callFunction(request) {
				if (request.data.action === 'getMembership') {
					membershipCalls += 1
					if (tokenFailureOnce) {
						tokenFailureOnce = false
						return { result: { errCode: 'uni-id-check-token-failed', errMsg: 'token校验未通过' } }
					}
					return {
						result: {
							errCode: 0,
							data: cloudMembership
						}
					}
				}
				if (request.data.action === 'createOrder') {
					createOrderCalls += 1
					assert.equal(request.data.productId, 'membership_1m')
					assert.equal(request.data.code, 'payment-login-code')
					return {
						result: {
							errCode: 0,
							data: {
								order: {
									outTradeNo: 'Mpaymentorder1',
									productId: 'membership_1m',
									amountFen: 800,
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
				if (paymentTokenFailureOnce) {
					paymentTokenFailureOnce = false
					options.fail({ errCode: -15005, errMsg: 'requestVirtualPayment:fail token校验未通过' })
					return
				}
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
	assert.equal(syncScheduleCalls, 1)

	const membershipStorageKey = 'uni-learn-membership-v1:member-user'
	const cachedMembership = storage.get(membershipStorageKey)
	const currentTime = Date.now()
	storage.set(membershipStorageKey, Object.assign({}, cachedMembership, {
		cachedAt: currentTime - 5 * 60 * 60 * 1000
	}))
	await service.getMembership()
	assert.equal(membershipCalls, 0)
	storage.set(membershipStorageKey, Object.assign({}, cachedMembership, {
		cachedAt: currentTime - 7 * 60 * 60 * 1000
	}))
	await service.getMembership()
	assert.equal(membershipCalls, 1)

	storage.set(membershipStorageKey, Object.assign({}, cachedMembership, {
		isMember: true,
		expiresAt: currentTime - 60 * 60 * 1000,
		cachedAt: currentTime
	}))
	assert.equal(service.getCachedMembership().isMember, true)
	storage.set(membershipStorageKey, Object.assign({}, cachedMembership, {
		isMember: true,
		expiresAt: currentTime - 7 * 60 * 60 * 1000,
		cachedAt: currentTime
	}))
	assert.equal(service.getCachedMembership().isMember, false)

	storage.set(membershipStorageKey, Object.assign({}, cachedMembership, {
		isMember: true,
		cachedAt: currentTime
	}))
	cloudMembership = { isMember: false, status: 'inactive', expiresAt: 0 }
	const revoked = await service.getMembership({ forceRefresh: true })
	assert.equal(revoked.isMember, false)
	assert.equal(revoked.entitlements.adFree, false)
	assert.equal(revoked.entitlements.practiceRecords, false)
	assert.equal(revoked.entitlements.advancedAnswerModes, false)
	assert.equal(revoked.entitlements.reviewMode, false)
	assert.equal(revoked.entitlements.smartPracticeOver30, false)
	assert.equal(service.getCachedMembership().isMember, false)

	user.uid = 'second-member-user'
	storage.set('uni-learn-membership-v1:second-member-user', Object.assign({}, cachedMembership, {
		cachedAt: Date.now()
	}))
	cloudMembership = {
		isMember: true,
		status: 'active',
		expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
	}
	const callsBeforeAccountSwitch = membershipCalls
	const switchedMembership = await service.getMembership()
	assert.equal(switchedMembership.isMember, true)
	assert.equal(membershipCalls, callsBeforeAccountSwitch + 1)
	await service.getMembership()
	assert.equal(membershipCalls, callsBeforeAccountSwitch + 1)

	const callsBeforeTokenRetry = membershipCalls
	tokenFailureOnce = true
	const refreshedAfterInvalidToken = await service.getMembership({ forceRefresh: true })
	assert.equal(refreshedAfterInvalidToken.isMember, true)
	assert.equal(membershipCalls, callsBeforeTokenRetry + 2)
	assert.equal(forcedLoginCalls, 1)

	const paymentCallsBeforeRetry = paymentCalls
	const createOrderCallsBeforeRetry = createOrderCalls
	const loginCallsBeforeRetry = weixinLoginCalls
	paymentTokenFailureOnce = true
	const purchasedAfterPaymentTokenRetry = await service.purchaseMembership('membership_1m')
	assert.equal(purchasedAfterPaymentTokenRetry.order.status, 'delivered')
	assert.equal(paymentCalls, paymentCallsBeforeRetry + 2)
	assert.equal(createOrderCalls, createOrderCallsBeforeRetry + 2)
	assert.equal(weixinLoginCalls, loginCallsBeforeRetry + 2)

	console.log('membership service tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
