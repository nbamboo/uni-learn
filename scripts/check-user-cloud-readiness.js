'use strict'

const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const expectedDcloudAppid = '__UNI__6D9FCF0'
const expectedWeixinAppid = 'wxea609870c354d0bb'
const failures = []

function resolveProjectPath(relativePath) {
	return path.join(projectRoot, relativePath)
}

function requireFile(relativePath) {
	const absolutePath = resolveProjectPath(relativePath)
	if (!fs.existsSync(absolutePath)) failures.push(`缺少文件：${relativePath}`)
	return absolutePath
}

function readJson(relativePath) {
	const absolutePath = requireFile(relativePath)
	if (!fs.existsSync(absolutePath)) return null
	try {
		return JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
	} catch (error) {
		failures.push(`JSON 格式错误：${relativePath}`)
		return null
	}
}

const configPath = 'uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json'
const config = readJson(configPath)

if (config) {
	const weixin = config['mp-weixin']
		&& config['mp-weixin'].oauth
		&& config['mp-weixin'].oauth.weixin
		|| {}
	if (config.dcloudAppid !== expectedDcloudAppid) failures.push('uni-id 的 dcloudAppid 与 manifest.json 不一致')
	if (weixin.appid !== expectedWeixinAppid) failures.push('uni-id 的微信 AppID 与 manifest.json 不一致')
	if (typeof config.tokenSecret !== 'string' || config.tokenSecret.length < 32) {
		failures.push('tokenSecret 尚未配置，至少填写 32 个字符的随机字符串')
	}
	if (typeof weixin.appsecret !== 'string' || weixin.appsecret.length < 16) {
		failures.push('微信小程序 AppSecret 尚未配置')
	}
	if (!Array.isArray(config.passwordSecret) || !config.passwordSecret.length) {
		failures.push('passwordSecret 配置缺失')
	}
	const tokenExpiresIn = Number(config['mp-weixin'] && config['mp-weixin'].tokenExpiresIn)
	const tokenExpiresThreshold = Number(config['mp-weixin'] && config['mp-weixin'].tokenExpiresThreshold)
	if (!tokenExpiresIn || tokenExpiresThreshold >= tokenExpiresIn) {
		failures.push('微信小程序 Token 有效期配置不正确')
	}
}

;[
	'uni_modules/uni-id-pages/uniCloud/cloudfunctions/uni-id-co/index.obj.js',
	'uni_modules/uni-id-common/uniCloud/cloudfunctions/common/uni-id-common/index.js',
	'uni_modules/uni-open-bridge-common/uniCloud/cloudfunctions/common/uni-open-bridge-common/index.js',
	'uni_modules/uni-id-pages/uniCloud/database/uni-id-users.schema.json',
	'uni_modules/uni-captcha/uniCloud/database/opendb-verify-codes.schema.json',
	'uni_modules/uni-open-bridge-common/uniCloud/database/opendb-open-data.schema.json',
	'uniCloud-alipay/cloudfunctions/questionBankUser/index.js',
	'uniCloud-alipay/cloudfunctions/questionBankUser/package.json'
].forEach(requireFile)

;[
	'uniCloud-alipay/database/question_bank_user_states.schema.json',
	'uniCloud-alipay/database/question_bank_user_states.index.json',
	'uniCloud-alipay/database/question_bank_user_stats.schema.json',
	'uniCloud-alipay/database/question_bank_user_stats.index.json',
	'uniCloud-alipay/database/question_bank_user_progress.schema.json',
	'uniCloud-alipay/database/question_bank_user_progress.index.json'
].forEach(readJson)

if (failures.length) {
	console.error('用户题库云端功能尚未满足部署条件：')
	failures.forEach(item => console.error(`- ${item}`))
	process.exitCode = 1
} else {
	console.log('用户题库云端功能部署前检查通过（密钥内容未输出）。')
}
