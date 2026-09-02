'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const configPath = path.join(
	projectRoot,
	'uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/virtual-payment/config.json'
)

function abort(message) {
	console.error(`回调 URL 验证失败：${message}`)
	process.exit(1)
}

if (!fs.existsSync(configPath)) abort('缺少 virtual-payment/config.json')

let config
try {
	config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} catch (error) {
	abort('virtual-payment/config.json 不是有效 JSON')
}

if (!/^[A-Za-z0-9]{3,32}$/.test(config.callbackToken || '')) {
	abort('callbackToken 未正确配置')
}

const rawUrl = process.argv[2]
if (!rawUrl) abort('请传入已部署的 HTTPS 回调 URL')

let callbackUrl
try {
	callbackUrl = new URL(rawUrl)
} catch (error) {
	abort('回调 URL 格式不正确')
}
if (callbackUrl.protocol !== 'https:') abort('现网回调必须使用 HTTPS')

const timestamp = String(Math.floor(Date.now() / 1000))
const nonce = crypto.randomBytes(12).toString('hex')
const echostr = crypto.randomBytes(18).toString('base64url')
const signature = crypto.createHash('sha1')
	.update([config.callbackToken, timestamp, nonce].sort().join(''))
	.digest('hex')

callbackUrl.searchParams.set('signature', signature)
callbackUrl.searchParams.set('timestamp', timestamp)
callbackUrl.searchParams.set('nonce', nonce)
callbackUrl.searchParams.set('echostr', echostr)

;(async () => {
	let response
	try {
		response = await fetch(callbackUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) })
	} catch (error) {
		abort(`无法访问已部署端点：${error && error.message || error}`)
	}
	const body = await response.text()
	if (!response.ok) abort(`HTTP 状态码为 ${response.status}`)
	if (body !== echostr) abort('响应内容不是原始 echostr，请检查 URL 化路径和 Token')
	console.log('虚拟支付回调 URL 的 HTTPS 连通性、Token 签名和 echostr 回包均验证通过。')
})()
