import { ensurePracticeUser, getCurrentPracticeUser } from '@/services/user-practice.js'

const CLOUD_FUNCTION_NAME = 'virtualPayment'
const STORAGE_KEY = 'uni-learn-membership-v1'
const LAST_ORDER_KEY = 'uni-learn-membership-last-order-v1'
const MEMBER_CACHE_TTL = 5 * 60 * 1000
const NON_MEMBER_CACHE_TTL = 60 * 1000

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
	const isMember = Boolean(source.isMember && expiresAt > Date.now())
	return {
		isMember,
		status: isMember ? 'active' : 'inactive',
		expiresAt: isMember ? expiresAt : 0,
		entitlements: {
			adFree: isMember,
			practiceRecords: isMember,
			advancedAnswerModes: isMember
		},
		plans: Array.isArray(source.plans) ? source.plans.map(item => Object.assign({}, item)) : [],
		cachedAt: Number(source.cachedAt) || 0
	}
}

function saveMembership(value) {
	const normalized = normalizeMembership(Object.assign({}, value, { cachedAt: Date.now() }))
	storageSet(userScopedStorageKey(STORAGE_KEY), normalized)
	return normalized
}

export function getCachedMembership() {
	return normalizeMembership(storageGet(userScopedStorageKey(STORAGE_KEY)))
}

export function membershipIsActive(value) {
	return normalizeMembership(value || getCachedMembership()).isMember
}

async function executeCloudCall(action, payload) {
	await ensurePracticeUser()
	if (typeof uniCloud === 'undefined' || typeof uniCloud.callFunction !== 'function') {
		throw new MembershipServiceError('VIRTUAL_PAYMENT_CLOUD_UNAVAILABLE', '当前环境不支持会员服务')
	}
	const response = await uniCloud.callFunction({
		name: CLOUD_FUNCTION_NAME,
		data: Object.assign({ action }, payload || {})
	})
	const result = response && response.result
	if (!result || typeof result !== 'object') {
		throw new MembershipServiceError('VIRTUAL_PAYMENT_INVALID_RESPONSE', '会员服务返回格式不正确')
	}
	if (result.errCode !== 0) {
		throw new MembershipServiceError(
			result.errCode || 'VIRTUAL_PAYMENT_CLOUD_ERROR',
			result.errMsg || '会员服务请求失败',
			{ requestId: result.requestId || response.requestId }
		)
	}
	return result.data
}

export async function getMembership(options) {
	const config = options || {}
	const cached = getCachedMembership()
	const cacheTtl = cached.isMember ? MEMBER_CACHE_TTL : NON_MEMBER_CACHE_TTL
	if (!config.forceRefresh && cached.cachedAt && cached.cachedAt + cacheTtl > Date.now()) return cached
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
		uni.login({
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

function requestVirtualPayment(payData) {
	return new Promise((resolve, reject) => {
		wx.requestVirtualPayment(Object.assign({}, payData, {
			success: resolve,
			fail: error => reject(new MembershipServiceError(
				error && error.errCode === -2 ? 'VIRTUAL_PAYMENT_CANCELLED' : 'VIRTUAL_PAYMENT_FAILED',
				error && error.errCode === -2 ? '已取消支付' : error && error.errMsg || '支付失败',
				{ paymentError: error }
			))
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
	const code = await getWeixinLoginCode()
	const created = await executeCloudCall('createOrder', { productId, code })
	if (!created || !created.order || !created.payData) {
		throw new MembershipServiceError('VIRTUAL_PAYMENT_INVALID_RESPONSE', '下单结果不完整')
	}
	storageSet(userScopedStorageKey(LAST_ORDER_KEY), {
		outTradeNo: created.order.outTradeNo,
		productId: created.order.productId,
		createdAt: Date.now()
	})
	await requestVirtualPayment(created.payData)
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

export function openMembershipPage() {
	uni.navigateTo({ url: '/pages/membership/membership' })
}

export function showMembershipRequired(featureName) {
	return new Promise(resolve => {
		uni.showModal({
			title: '会员专属功能',
			content: `${featureName || '该功能'}为会员权益，开通后还可屏蔽全部广告。`,
			confirmText: '查看会员',
			success: result => {
				if (result.confirm) openMembershipPage()
				resolve(Boolean(result.confirm))
			},
			fail: () => resolve(false)
		})
	})
}

export default {
	getCachedMembership,
	getMembership,
	membershipIsActive,
	openMembershipPage,
	purchaseMembership,
	queryMembershipOrder,
	restoreLastMembershipOrder,
	showMembershipRequired
}
