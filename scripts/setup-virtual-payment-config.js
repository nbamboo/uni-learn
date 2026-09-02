'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline/promises')

const projectRoot = path.resolve(__dirname, '..')
const configPath = path.join(
	projectRoot,
	'uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/virtual-payment/config.json'
)
const examplePath = path.join(path.dirname(configPath), 'config.example.json')

function fail(message) {
	console.error(message)
	process.exitCode = 1
}

function randomAlphaNumeric(length) {
	let value = ''
	while (value.length < length) {
		value += crypto.randomBytes(length).toString('base64').replace(/[^A-Za-z0-9]/gu, '')
	}
	return value.slice(0, length)
}

function readSecret(prompt) {
	return new Promise((resolve, reject) => {
		if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
			reject(new Error('现网 AppKey 必须在交互式终端中输入，不能通过管道传入'))
			return
		}

		let value = ''
		const wasRaw = Boolean(process.stdin.isRaw)
		const cleanup = () => {
			process.stdin.removeListener('data', onData)
			process.stdin.setRawMode(wasRaw)
			process.stdin.pause()
		}
		const onData = chunk => {
			for (const character of String(chunk)) {
				if (character === '\u0003') {
					cleanup()
					process.stdout.write('\n')
					reject(new Error('已取消配置'))
					return
				}
				if (character === '\r' || character === '\n') {
					cleanup()
					process.stdout.write('\n')
					resolve(value.trim())
					return
				}
				if (character === '\u007f' || character === '\b') {
					if (value) {
						value = value.slice(0, -1)
						process.stdout.write('\b \b')
					}
					continue
				}
				if (character >= ' ') {
					value += character
					process.stdout.write('•')
				}
			}
		}

		process.stdout.write(prompt)
		process.stdin.setEncoding('utf8')
		process.stdin.setRawMode(true)
		process.stdin.resume()
		process.stdin.on('data', onData)
	})
}

async function main() {
	if (process.argv.includes('--rotate-encoding-aes-key')) {
		let config
		try {
			config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
		} catch {
			fail(`无法读取现有配置：${configPath}`)
			return
		}
		config.encodingAESKey = randomAlphaNumeric(43)
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
		fs.chmodSync(configPath, 0o600)
		console.log('已重新生成符合微信要求的 43 位 EncodingAESKey；密钥内容未输出。')
		console.log(`配置路径：${configPath}`)
		return
	}

	if (fs.existsSync(configPath)) {
		fail(`配置文件已存在，未覆盖：${configPath}`)
		return
	}
	if (process.argv.includes('--from-example')) {
		let example
		try {
			example = JSON.parse(fs.readFileSync(examplePath, 'utf8'))
		} catch {
			fail('无法读取 config.example.json')
			return
		}
		if (!/^[A-Za-z0-9_-]{3,64}$/.test(example.offerId || '')) {
			fail('示例文件中的 OfferID 格式不正确')
			return
		}
		if (typeof example.appKey !== 'string' || example.appKey.length < 16) {
			fail('示例文件中的现网 AppKey 格式不正确')
			return
		}
		if (!/^gh_[A-Za-z0-9]+$/.test(example.originalId || '')) {
			fail('示例文件中的小程序原始 ID 格式不正确')
			return
		}
		const migrated = {
			offerId: example.offerId,
			appKey: example.appKey,
			callbackToken: /^[A-Za-z0-9]{3,32}$/.test(example.callbackToken || '')
				? example.callbackToken
				: crypto.randomBytes(16).toString('hex'),
			encodingAESKey: /^[A-Za-z0-9]{43}$/.test(example.encodingAESKey || '')
				? example.encodingAESKey
				: randomAlphaNumeric(43),
			originalId: example.originalId
		}
		fs.writeFileSync(configPath, `${JSON.stringify(migrated, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
		console.log('示例文件中的配置已迁移到本地忽略文件；密钥内容未输出。')
		console.log(`配置路径：${configPath}`)
		return
	}

	const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
	const offerId = (await terminal.question('OfferID：')).trim()
	const originalId = (await terminal.question('小程序原始 ID（gh_ 开头）：')).trim()
	terminal.close()

	if (!/^[A-Za-z0-9_-]{3,64}$/.test(offerId)) {
		fail('OfferID 格式不正确')
		return
	}
	if (!/^gh_[A-Za-z0-9]+$/.test(originalId)) {
		fail('小程序原始 ID 格式不正确，应以 gh_ 开头')
		return
	}

	let appKey
	try {
		appKey = await readSecret('现网 AppKey（输入时不显示）：')
	} catch (error) {
		fail(error.message)
		return
	}
	if (appKey.length < 16) {
		fail('现网 AppKey 长度不正确')
		return
	}

	const config = {
		offerId,
		appKey,
		callbackToken: crypto.randomBytes(16).toString('hex'),
		encodingAESKey: randomAlphaNumeric(43),
		originalId
	}

	fs.mkdirSync(path.dirname(configPath), { recursive: true })
	fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
	console.log('虚拟支付配置已写入本地忽略文件；AppKey、Token 和 EncodingAESKey 未输出。')
	console.log(`配置路径：${configPath}`)
}

main().catch(error => fail(error.message))
