'use strict'

const {
  WECHAT_API_BASE,
  CHUNK_SIZE
} = require('./constants')
const {
  splitBuffer,
  md5
} = require('./csv')
const {
  CrowdSyncError,
  sanitizeMessage
} = require('./errors')
const { sleep: defaultSleep } = require('./utils')

const TOKEN_ERROR_CODES = new Set([40001, 40014, 42001])
const RETRYABLE_WECHAT_CODES = new Set([-1, 99000020])

function parseResponseData (response) {
  const value = response && response.data !== undefined
    ? response.data
    : response && response.body !== undefined
      ? response.body
      : response

  if (Buffer.isBuffer(value)) return JSON.parse(value.toString('utf8'))
  if (typeof value === 'string') return JSON.parse(value)
  return value || {}
}

function normalizeEtag (value) {
  return String(value || '')
    .trim()
    .replace(/^W\//i, '')
    .replace(/^['"]+|['"]+$/g, '')
    .toLowerCase()
}

function uploadEtagMatches ({ part, transmittedPart, etag }) {
  const remoteEtag = normalizeEtag(etag)
  if (!remoteEtag) return false

  // Validate both the raw UTF-8 bytes and the exact string sent in buff. For
  // OpenID CSV data these are equivalent, but keeping both makes the intent
  // explicit and preserves strict verification at the transport boundary.
  const expectedEtags = new Set([
    md5(part),
    md5(Buffer.from(transmittedPart, 'utf8'))
  ])
  return expectedEtags.has(remoteEtag)
}

class WechatClient {
  constructor ({
    repository,
    httpRequest,
    env = process.env,
    now = Date.now,
    sleep = defaultSleep,
    logger = console
  }) {
    if (!repository) throw new TypeError('repository is required')
    if (typeof httpRequest !== 'function') throw new TypeError('httpRequest is required')
    this.repository = repository
    this.httpRequest = httpRequest
    this.env = env
    this.now = now
    this.sleep = sleep
    this.logger = logger
  }

  validateCredentials () {
    if (!this.env.WECHAT_APPID || !this.env.WECHAT_APPSECRET) {
      throw new CrowdSyncError(
        'WECHAT_CONFIG_MISSING',
        'WECHAT_APPID and WECHAT_APPSECRET must be configured as cloud function environment variables'
      )
    }
  }

  async requestJson (url, data, attempts = 3) {
    let lastError
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await this.httpRequest(url, {
          method: 'POST',
          data,
          dataType: 'json',
          contentType: 'json',
          timeout: 15000
        })
        const status = Number(response && (response.status || response.statusCode || 200))
        if (status >= 500) {
          throw new CrowdSyncError('WECHAT_HTTP_ERROR', `WeChat HTTP ${status}`, { retryable: true })
        }
        if (status >= 400) {
          throw new CrowdSyncError('WECHAT_HTTP_ERROR', `WeChat HTTP ${status}`)
        }
        return parseResponseData(response)
      } catch (error) {
        lastError = error instanceof CrowdSyncError
          ? error
          : new CrowdSyncError('WECHAT_NETWORK_ERROR', sanitizeMessage(error.message), { retryable: true })
        if (!lastError.retryable || attempt === attempts) throw lastError
        await this.sleep(200 * (2 ** (attempt - 1)))
      }
    }
    throw lastError
  }

  async getAccessToken (forceRefresh = false) {
    this.validateCredentials()
    if (!forceRefresh) {
      const cached = await this.repository.getTokenCache()
      if (cached && cached.access_token && cached.expire_at > this.now() + (5 * 60 * 1000)) {
        return cached.access_token
      }
    }

    const response = await this.requestJson(`${WECHAT_API_BASE}/cgi-bin/stable_token`, {
      grant_type: 'client_credential',
      appid: this.env.WECHAT_APPID,
      secret: this.env.WECHAT_APPSECRET,
      force_refresh: Boolean(forceRefresh)
    })

    if (response.errcode && response.errcode !== 0) {
      throw new CrowdSyncError(
        `WECHAT_TOKEN_${response.errcode}`,
        response.errmsg || 'Unable to obtain WeChat access token',
        { wechatCode: response.errcode }
      )
    }
    if (!response.access_token) {
      throw new CrowdSyncError('WECHAT_TOKEN_INVALID', 'WeChat token response did not contain access_token')
    }

    const expiresIn = Math.max(60, Number(response.expires_in) || 7200)
    await this.repository.saveTokenCache({
      accessToken: response.access_token,
      expireAt: this.now() + (expiresIn * 1000)
    })
    return response.access_token
  }

  async callApi (path, payload) {
    let token = await this.getAccessToken(false)
    let tokenRefreshed = false
    let lastError
    let attempt = 0

    while (attempt < 3) {
      attempt++
      try {
        const response = await this.requestJson(
          `${WECHAT_API_BASE}${path}?access_token=${encodeURIComponent(token)}`,
          payload,
          1
        )
        const code = Number(response.errcode || 0)
        if (code === 0) return response

        if (TOKEN_ERROR_CODES.has(code) && !tokenRefreshed) {
          tokenRefreshed = true
          await this.repository.clearTokenCache()
          token = await this.getAccessToken(true)
          attempt--
          continue
        }

        const retryable = RETRYABLE_WECHAT_CODES.has(code)
        lastError = new CrowdSyncError(
          `WECHAT_API_${code}`,
          response.errmsg || `WeChat API returned ${code}`,
          { retryable, wechatCode: code }
        )
        if (!retryable || attempt >= 3) throw lastError
      } catch (error) {
        lastError = error
        if (!error.retryable || attempt >= 3) throw error
      }
      await this.sleep(200 * (2 ** (attempt - 1)))
    }
    throw lastError
  }

  async uploadFile ({ fileName, buffer }) {
    if (!fileName || !Buffer.isBuffer(buffer)) {
      throw new TypeError('fileName and buffer are required')
    }

    let mediaId
    try {
      const initialized = await this.callApi('/wedata/upload_weanalysis_file', {
        oper_type: 1,
        file_name: fileName
      })
      mediaId = initialized.media_id
      if (!mediaId) {
        throw new CrowdSyncError('UPLOAD_INIT_INVALID', 'Upload initialization did not return media_id')
      }

      const parts = splitBuffer(buffer, CHUNK_SIZE)
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index]
        // The WeAnalysis endpoint expects the CSV fragment text itself in the
        // JSON string. Sending Base64 makes the service parse the whole fragment
        // as one invalid OpenID row instead of decoding it as file content.
        const transmittedPart = part.toString('utf8')
        const uploaded = await this.callApi('/wedata/upload_weanalysis_file', {
          oper_type: 2,
          file_name: fileName,
          media_id: mediaId,
          part_idx: index + 1,
          buff: transmittedPart
        })
        if (!uploadEtagMatches({ part, transmittedPart, etag: uploaded.etag })) {
          throw new CrowdSyncError(
            'UPLOAD_ETAG_MISMATCH',
            `Upload part ${index + 1} failed MD5 verification`
          )
        }
      }

      await this.callApi('/wedata/upload_weanalysis_file', {
        oper_type: 3,
        file_name: fileName,
        media_id: mediaId
      })
      return mediaId
    } catch (error) {
      if (mediaId) {
        try {
          await this.callApi('/wedata/upload_weanalysis_file', {
            oper_type: 4,
            file_name: fileName,
            media_id: mediaId
          })
        } catch (_) {
          this.logger.warn('member-crowd upload abort failed', { code: 'UPLOAD_ABORT_FAILED' })
        }
      }
      throw error
    }
  }

  async createCrowd ({ mediaId, crowdName }) {
    const response = await this.callApi('/wedata/create_crowd', {
      media_id: mediaId,
      crowd_name: crowdName
    })
    if (!response.crowd_id) {
      throw new CrowdSyncError('CREATE_CROWD_INVALID', 'create_crowd did not return crowd_id')
    }
    return response.crowd_id
  }

  async queryCrowd (crowdId) {
    return this.callApi('/wedata/query_crowd_create_state', {
      crowd_id: crowdId
    })
  }

  async publishCrowd (crowdId) {
    await this.callApi('/wedata/publish_crowd_boardcast', {
      crowd_id: crowdId
    })
  }
}

function createUniCloudHttpRequest (uniCloudObject) {
  if (!uniCloudObject || !uniCloudObject.httpclient) {
    throw new TypeError('uniCloud.httpclient is required')
  }
  return (url, options) => uniCloudObject.httpclient.request(url, options)
}

module.exports = {
  WechatClient,
  createUniCloudHttpRequest,
  parseResponseData,
  normalizeEtag,
  uploadEtagMatches,
  TOKEN_ERROR_CODES,
  RETRYABLE_WECHAT_CODES
}
