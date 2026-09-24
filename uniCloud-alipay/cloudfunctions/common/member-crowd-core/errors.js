'use strict'

class CrowdSyncError extends Error {
  constructor (code, message, options = {}) {
    super(message)
    this.name = 'CrowdSyncError'
    this.code = code
    this.retryable = Boolean(options.retryable)
    this.wechatCode = options.wechatCode
  }
}

function sanitizeMessage (message) {
  return String(message || 'Unknown error')
    .replace(/access_token=[^&\s]+/gi, 'access_token=[REDACTED]')
    .replace(/(WECHAT_APPSECRET\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .slice(0, 500)
}

function sanitizeError (error) {
  const result = {
    code: error && error.code ? String(error.code) : 'INTERNAL_ERROR',
    message: sanitizeMessage(error && error.message)
  }
  if (Number.isFinite(error && error.wechatCode)) result.wechat_code = error.wechatCode
  return result
}

module.exports = {
  CrowdSyncError,
  sanitizeError,
  sanitizeMessage
}
