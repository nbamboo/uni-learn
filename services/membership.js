import {
	ensurePracticeUser,
	getCurrentPracticeUser,
	markPracticePreferencesRefreshRequired,
	markPracticeRecordsRefreshRequired,
	markPracticeSummaryRefreshRequired,
	schedulePracticeSync
} from '@/services/user-practice.js'

const CLOUD_FUNCTION_NAME = 'virtualPayment'
const STORAGE_KEY = 'uni-learn-membership-v1'
const LAST_ORDER_KEY = 'uni-learn-membership-last-order-v1'
const LAST_USER_ID_KEY = 'uni-learn-membership-last-user-id-v1'
const MEMBER_CACHE_TTL = 6 * 60 * 60 * 1000
const NON_MEMBER_CACHE_TTL = 6 * 60 * 60 * 1000
const MEMBER_EXPIRY_GRACE_MS = 6 * 60 * 60 * 1000
const MEMBERSHIP_PAGE_URL = '/pages/membership/membership'

let membershipRequest = null

export class MembershipServiceError extends Error {
	constructor(errCode, errMsg, options) {
		super(errMsg)
		this.name = 'MembershipServiceError'
		this.errCode = errCode
		Object.assign(this, options || {})
	}
}

function storageGet(key) {
	try {
		return typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function'
			? uni.getStorageSync(key)
			: null
	} catch (error) {
		return null
	}
}

function storageSet(key, value) {
	try {
		if (typeof uni !== 'undefined' && typeof uni.setStorageSync === 'function') {
			uni.setStorageSync(key, value)
		}
	} catch (error) {
		// 本地缓存失败不影响云端会员状态。
	}
}

function userScopedStorageKey(baseKey) {
	const user = getCurrentPracticeUser()
	return user && user.uid ? `${baseKey}:${user.uid}` : baseKey
}

function normalizeMembership(value) {
	const source = value && typeof value === 'object' ? value : {}
	const expiresAt = Number(source.expiresAt) || 0
	const isMember = Boolean(
		source.isMember
		&& source.status !== 'revoked'
		&& expiresAt + MEMBER_EXPIRY_GRACE_MS > Date.now()
	)
	return {
		isMember,
		status: isMember ? 'active' : 'inactive',
		expiresAt: isMember ? expiresAt : 0,
		entitlements: {
			adFree: isMember,
			practiceRecords: isMember,
			advancedAnswerModes: isMember,
			reviewMode: isMember,
			smartPracticeOver30: isMember
		},
		plans: Array.isArray(source.plans) ? source.plans.map(item => Object.assign({}, item)) : [],
		cachedAt: Number(source.cachedAt) || 0
	}
}

function saveMembership(value) {
	const previous = getCachedMembership()
	const normalized = normalizeMembership(Object.assign({}, value, { cachedAt: Date.now() }))
	storageSet(userScopedStorageKey(STORAGE_KEY), normalized)
	const user = getCurrentPracticeUser()
	if (user && user.uid) storageSet(LAST_USER_ID_KEY, user.uid)
	if (normalized.isMember) schedulePracticeSync({ immediate: true })
	if (previous.isMember !== normalized.isMember || previous.expiresAt !== normalized.expiresAt) {
		markPracticePreferencesRefreshRequired()
		markPracticeRecordsRefreshRequired()
		markPracticeSummaryRefreshRequired()
	}
	return normalized
}

export function cacheMembershipSnapshot(value) {
	return saveMembership(value)
}

export function getCachedMembership() {
	return normalizeMembership(storageGet(userScopedStorageKey(STORAGE_KEY)))
}

export function membershipIsActive(value) {
	return normalizeMembership(value || getCachedMembership()).isMember
}

export function showMembershipUpsell(content, options) {
	const config = options || {}
	return new Promise(resolve => {
		uni.showModal({
			title: '会员专享功能',
			content,
			cancelText: '暂不开通',
			confirmText: '开通会员',
			confirmColor: '#008cff',
			success: result => {
				const confirmed = Boolean(result.confirm)
				if (!confirmed) {
					resolve(false)
					return
				}
				const method = config.replace ? 'redirectTo' : 'navigateTo'
				uni[method]({
					url: MEMBERSHIP_PAGE_URL,
					complete: () => resolve(true)
				})
			},
			fail: () => resolve(false)
		})
	})
}

async function executeCloudCall(action, payload) {
	await ensurePracticeUser()
	if (typeof uniCloud === 'undefined' || typeof uniCloud.callFunction !== 'function') {
		throw new MembershipServiceError('VIRTUAL_PAYMENT_CLOUD_UNAVAILABLE', '当前环境不支持会员服务')
	}
	for (let attempt = 0; attempt < 2; attempt += 1) {
		let response
		try {
			response = await uniCloud.callFunction({
				name: CLOUD_FUNCTION_NAME,
				data: Object.assign({ action }, payload || {})
			})
		} catch (error) {
			if (membershipLoginRequired(error && error.errCode, error && (error.errMsg || error.message))) {
				if (attempt === 0) {
					await ensurePracticeUser({ forceRefresh: true })
					continue
				}
				throw membershipLoginError()
			}
			throw error
		}
		const result = response && response.result
		if (!result || typeof result !== 'object') {
			throw new MembershipServiceError('VIRTUAL_PAYMENT_INVALID_RESPONSE', '会员服务返回格式不正确')
		}
		if (result.errCode !== 0) {
			if (membershipLoginRequired(result.errCode, result.errMsg)) {
				if (attempt === 0) {
					await ensurePracticeUser({ forceRefresh: true })
					continue
				}
				throw membershipLoginError({ requestId: result.requestId || response.requestId })
			}
			throw new MembershipServiceError(
				result.errCode || 'VIRTUAL_PAYMENT_CLOUD_ERROR',
				result.errMsg || '会员服务请求失败',
				{ requestId: result.requestId || response.requestId }
			)
		}
		return result.data
	}
	throw new MembershipServiceError('VIRTUAL_PAYMENT_LOGIN_REQUIRED', '登录状态已失效，请重新进入小程序后重试')
}

function membershipLoginError(options) {
	return new MembershipServiceError(
		'VIRTUAL_PAYMENT_LOGIN_REQUIRED',
		'登录状态已失效，请关闭并重新进入小程序后重试',
		options
	)
}

function membershipLoginRequired(errCode, errMsg) {
	return [
		'VIRTUAL_PAYMENT_LOGIN_REQUIRED',
		'QUESTION_BANK_LOGIN_REQUIRED',
		'uni-id-token-expired',
		'uni-id-check-token-failed',
		30202,
		30203
	].indexOf(errCode) > -1 || /token校验未通过|登录状态.*(失效|过期)/i.test(String(errMsg || ''))
}

export async function getMembership(options) {
	const config = options || {}
	const user = getCurrentPracticeUser()
	const currentUserId = user && user.uid ? user.uid : ''
	const lastUserId = storageGet(LAST_USER_ID_KEY) || ''
	const identityRefreshRequired = !currentUserId || currentUserId !== lastUserId
	const cached = getCachedMembership()
	const cacheTtl = cached.isMember ? MEMBER_CACHE_TTL : NON_MEMBER_CACHE_TTL
	if (!config.forceRefresh
		&& !identityRefreshRequired
		&& cached.cachedAt
		&& cached.cachedAt + cacheTtl > Date.now()) return cached
	if (membershipRequest) return membershipRequest
	membershipRequest = executeCloudCall('getMembership').then(result => {
		membershipRequest = null
		return saveMembership(result)
	}, error => {
		membershipRequest = null
		throw error
	})
	return membershipRequest
}

function compareVersion(left, right) {
	const a = String(left || '').split('.').map(item => Number(item) || 0)
	const b = String(right || '').split('.').map(item => Number(item) || 0)
	const length = Math.max(a.length, b.length)
	for (let index = 0; index < length; index += 1) {
		if ((a[index] || 0) > (b[index] || 0)) return 1
		if ((a[index] || 0) < (b[index] || 0)) return -1
	}
	return 0
}

function assertPaymentAvailable() {
	if (typeof wx === 'undefined' || typeof wx.requestVirtualPayment !== 'function') {
		throw new MembershipServiceError(
			'VIRTUAL_PAYMENT_UNSUPPORTED',
			'当前微信版本不支持虚拟支付，请更新微信后重试'
		)
	}
	const info = wx.getSystemInfoSync()
	if (compareVersion(info.SDKVersion, '2.19.2') < 0 && !wx.canIUse('requestVirtualPayment')) {
		throw new MembershipServiceError(
			'VIRTUAL_PAYMENT_UNSUPPORTED',
			'当前微信基础库不支持虚拟支付，请更新微信后重试'
		)
	}
	if (info.platform === 'ios' && compareVersion(info.version, '8.0.68') < 0) {
		throw new MembershipServiceError(
			'VIRTUAL_PAYMENT_IOS_VERSION_UNSUPPORTED',
			'iOS 支付需要微信 8.0.68 或更高版本，请更新微信后重试'
		)
	}
	if (info.platform === 'ios') {
		const iosVersion = String(info.system || '').replace(/^iOS\s*/i, '')
		if (iosVersion && compareVersion(iosVersion, '15.0.0') < 0) {
			throw new MembershipServiceError(
				'VIRTUAL_PAYMENT_IOS_SYSTEM_UNSUPPORTED',
				'iOS 支付需要 iOS 15 或更高版本'
			)
		}
	}
}

function getWeixinLoginCode() {
	return new Promise((resolve, reject) => {
		const login = typeof wx !== 'undefined' && typeof wx.login === 'function'
			? wx.login.bind(wx)
			: uni.login.bind(uni)
		login({
			provider: 'weixin',
			success: result => result && result.code
				? resolve(result.code)
				: reject(new MembershipServiceError('VIRTUAL_PAYMENT_LOGIN_FAILED', '微信登录未返回支付code')),
			fail: error => reject(new MembershipServiceError(
				'VIRTUAL_PAYMENT_LOGIN_FAILED',
				error && error.errMsg || '微信登录失败'
			))
		})
	})
}

function paymentErrorDetails(error) {
	const errCode = Number(error && error.errCode)
	const errMsg = error && error.errMsg || ''
	if (errCode === -2 || errCode === 700601) {
		return { errCode: 'VIRTUAL_PAYMENT_CANCELLED', errMsg: '已取消支付' }
	}
	if (errCode === -15005 || errCode === -15007 || /token校验|登录态.*(失效|过期)/i.test(errMsg)) {
		return {
			errCode: 'VIRTUAL_PAYMENT_LOGIN_TOKEN_INVALID',
			errMsg: '支付登录态校验失败，请重新进入小程序后重试'
		}
	}
	if (errCode === -15006 || /支付签名|pay[_ ]?sig/i.test(errMsg)) {
		return {
			errCode: 'VIRTUAL_PAYMENT_SIGNATURE_INVALID',
			errMsg: '支付签名校验失败，请联系管理员检查现网AppKey配置'
		}
	}
	return {
		errCode: 'VIRTUAL_PAYMENT_FAILED',
		errMsg: errMsg || '支付失败'
	}
}

function requestVirtualPayment(payData) {
	return new Promise((resolve, reject) => {
		wx.requestVirtualPayment(Object.assign({}, payData, {
			success: resolve,
			fail: error => {
				const details = paymentErrorDetails(error)
				reject(new MembershipServiceError(
					details.errCode,
					details.errMsg,
					{ paymentError: error }
				))
			}
		}))
	})
}

function delay(milliseconds) {
	return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export async function queryMembershipOrder(outTradeNo, options) {
	const config = options || {}
	const attempts = Number(config.attempts) || 1
	let result = null
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		if (attempt) await delay(Number(config.interval) || 1500)
		result = await executeCloudCall('queryOrder', { outTradeNo })
		if (result && result.order && result.order.status === 'delivered') break
	}
	if (result && result.membership) saveMembership(result.membership)
	return result
}

export async function purchaseMembership(productId) {
	assertPaymentAvailable()
	await ensurePracticeUser()
	let created = null
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const code = await getWeixinLoginCode()
		created = await executeCloudCall('createOrder', { productId, code })
		if (!created || !created.order || !created.payData) {
			throw new MembershipServiceError('VIRTUAL_PAYMENT_INVALID_RESPONSE', '下单结果不完整')
		}
		storageSet(userScopedStorageKey(LAST_ORDER_KEY), {
			outTradeNo: created.order.outTradeNo,
			productId: created.order.productId,
			createdAt: Date.now()
		})
		try {
			await requestVirtualPayment(created.payData)
			break
		} catch (error) {
			if (attempt === 0 && error && error.errCode === 'VIRTUAL_PAYMENT_LOGIN_TOKEN_INVALID') continue
			throw error
		}
	}
	try {
		return await queryMembershipOrder(created.order.outTradeNo, { attempts: 5, interval: 1500 })
	} catch (error) {
		// 微信已确认支付后，查单的临时网络错误不能再显示成“支付失败”。
		// 发货推送和服务端定时补单仍会继续完成权益发放。
		return {
			order: Object.assign({}, created.order, { status: 'pending' }),
			membership: getCachedMembership(),
			confirmationPending: true,
			queryError: {
				errCode: error && error.errCode || 'VIRTUAL_PAYMENT_QUERY_PENDING',
				errMsg: error && (error.errMsg || error.message) || '订单正在确认'
			}
		}
	}
}

export async function restoreLastMembershipOrder() {
	await ensurePracticeUser()
	const saved = storageGet(userScopedStorageKey(LAST_ORDER_KEY))
	if (!saved || !saved.outTradeNo) {
		throw new MembershipServiceError('VIRTUAL_PAYMENT_NO_PENDING_ORDER', '没有可恢复的最近订单')
	}
	return queryMembershipOrder(saved.outTradeNo, { attempts: 1 })
}

export default {
	getCachedMembership,
	cacheMembershipSnapshot,
	getMembership,
	membershipIsActive,
	showMembershipUpsell,
	purchaseMembership,
	queryMembershipOrder,
	restoreLastMembershipOrder
}
