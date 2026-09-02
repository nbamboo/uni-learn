'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { PRODUCTS } = require('../uniCloud-alipay/cloudfunctions/virtualPayment/service')

const projectRoot = path.resolve(__dirname, '..')
const failures = []

function absolute(relativePath) {
	return path.join(projectRoot, relativePath)
}

function requireFile(relativePath) {
	const target = absolute(relativePath)
	if (!fs.existsSync(target)) failures.push(`缺少文件：${relativePath}`)
	return target
}

function readJson(relativePath) {
	const target = requireFile(relativePath)
	if (!fs.existsSync(target)) return null
	try {
		return JSON.parse(fs.readFileSync(target, 'utf8'))
	} catch (error) {
		failures.push(`JSON 格式错误：${relativePath}`)
		return null
	}
}

function readText(relativePath) {
	const target = requireFile(relativePath)
	return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
}

function listVueFiles(relativePath) {
	const target = absolute(relativePath)
	if (!fs.existsSync(target)) return []
	if (fs.statSync(target).isFile()) return target.endsWith('.vue') ? [relativePath] : []
	return fs.readdirSync(target, { withFileTypes: true }).flatMap(entry => {
		const child = path.posix.join(relativePath, entry.name)
		return entry.isDirectory() ? listVueFiles(child) : (entry.name.endsWith('.vue') ? [child] : [])
	})
}

const paymentConfigPath = 'uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/virtual-payment/config.json'
const paymentConfig = readJson(paymentConfigPath)
if (paymentConfig) {
	if (typeof paymentConfig.offerId !== 'string' || paymentConfig.offerId.trim().length < 3) {
		failures.push('OfferID 尚未配置')
	}
	if (typeof paymentConfig.appKey !== 'string' || paymentConfig.appKey.trim().length < 16) {
		failures.push('现网 AppKey 尚未配置')
	}
	if (!/^[A-Za-z0-9]{3,32}$/.test(paymentConfig.callbackToken || '')) {
		failures.push('发货推送 callbackToken 尚未配置，需使用 3-32 位数字或字母并与 MP 后台一致')
	}
	if (paymentConfig.encodingAESKey && !/^[A-Za-z0-9]{43}$/.test(paymentConfig.encodingAESKey)) {
		failures.push('EncodingAESKey 格式不正确；必须是 43 位数字或字母，不得包含 +、/、-、_ 等符号')
	}
	if (typeof paymentConfig.originalId !== 'string' || !/^gh_[A-Za-z0-9]+$/.test(paymentConfig.originalId)) {
		failures.push('小程序原始ID originalId 尚未配置（不是 AppID，通常以 gh_ 开头）')
	}
}

const expectedProducts = {
	'membership_1m': { months: 1, priceFen: 300 },
	'membership_3m': { months: 3, priceFen: 600 },
	'membership_6m': { months: 6, priceFen: 1000 },
	'membership_12m': { months: 12, priceFen: 1500 }
}
Object.keys(expectedProducts).forEach(productId => {
	const actual = PRODUCTS[productId]
	const expected = expectedProducts[productId]
	if (!actual || actual.months !== expected.months || actual.priceFen !== expected.priceFen) {
		failures.push(`会员商品配置错误：${productId}`)
	}
})

const packageConfig = readJson('uniCloud-alipay/cloudfunctions/virtualPayment/package.json')
if (packageConfig) {
	const cloudConfig = packageConfig['cloudfunction-config'] || {}
	if (cloudConfig.path !== '/virtual-payment-notify') failures.push('virtualPayment URL 化路径必须为 /virtual-payment-notify')
	const triggers = Array.isArray(cloudConfig.triggers) ? cloudConfig.triggers : []
	if (!triggers.some(item => item.type === 'timer' && item.config === '17 */5 * * * * *')) {
		failures.push('virtualPayment 每 5 分钟补单定时器未正确配置')
	}
}

;[
	'uniCloud-alipay/cloudfunctions/virtualPayment/index.js',
	'uniCloud-alipay/cloudfunctions/virtualPayment/service.js',
	'uniCloud-alipay/cloudfunctions/virtualPayment/test.js',
	'uniCloud-alipay/database/question_bank_payment_orders.schema.json',
	'uniCloud-alipay/database/question_bank_payment_orders.index.json',
	'uniCloud-alipay/database/question_bank_memberships.schema.json',
	'uniCloud-alipay/database/question_bank_memberships.index.json',
	'services/membership.js',
	'scripts/test-membership-service.js',
	'scripts/verify-virtual-payment-callback.js',
	'pages/membership/membership.vue'
].forEach(requireFile)

;[
	'uniCloud-alipay/database/question_bank_payment_orders.schema.json',
	'uniCloud-alipay/database/question_bank_payment_orders.index.json',
	'uniCloud-alipay/database/question_bank_memberships.schema.json',
	'uniCloud-alipay/database/question_bank_memberships.index.json'
].forEach(readJson)

const paymentIndexes = readJson('uniCloud-alipay/database/question_bank_payment_orders.index.json')
if (paymentIndexes && !paymentIndexes.some(index => {
	const keys = index && index.MgoKeySchema && index.MgoKeySchema.MgoIndexKeys || []
	return keys.map(item => item.Name).join(',') === 'status,env,updatedAt'
})) {
	failures.push('支付订单补单索引必须按 status、env、updatedAt 排序，避免旧订单阻塞新订单')
}

const pages = readJson('pages.json')
if (pages && !pages.pages.some(item => item.path === 'pages/membership/membership')) {
	failures.push('pages.json 未注册会员中心页面')
}

const practicePage = readText('practice-pages/practice/practice.vue')
if (!/<ad-custom[\s\S]*?v-if="showAds"|class="result-ad-container" v-if="showAds"/.test(practicePage)) {
	failures.push('答题结果广告尚未按会员状态隐藏')
}
const firstPartyVueFiles = [
	...listVueFiles('App.vue'),
	...listVueFiles('pages'),
	...listVueFiles('practice-pages'),
	...listVueFiles('components')
]
const adLocations = firstPartyVueFiles.flatMap(relativePath => {
	const source = readText(relativePath)
	return (source.match(/<ad(?:-custom)?\b/g) || []).map(() => relativePath)
})
if (adLocations.length !== 1 || adLocations[0] !== 'practice-pages/practice/practice.vue') {
	failures.push(`业务源码广告组件清单异常：${adLocations.length ? adLocations.join('、') : '未找到广告组件'}`)
}

const userService = readText('uniCloud-alipay/cloudfunctions/questionBankUser/service.js')
if (!userService.includes('QUESTION_BANK_MEMBERSHIP_REQUIRED')) {
	failures.push('questionBankUser 尚未加入服务端会员权益校验')
}

const clientFiles = [
	readText('services/membership.js'),
	readText('pages/membership/membership.vue'),
	practicePage
].join('\n')
if (/appKey\s*[:=]\s*['"][^'"]{8}/i.test(clientFiles)) {
	failures.push('客户端代码疑似包含 AppKey，必须移回云函数配置')
}

if (failures.length) {
	console.error('微信虚拟支付尚未满足部署条件：')
	failures.forEach(item => console.error(`- ${item}`))
	process.exitCode = 1
} else {
	console.log('微信虚拟支付代码与本地配置部署前检查通过（密钥内容未输出）。')
}
