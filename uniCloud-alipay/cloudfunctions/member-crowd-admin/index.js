'use strict'

const uniIdCommon = require('uni-id-common')
const { createCore, errors } = require('member-crowd-core')

function forbidden (message = 'Administrator permission is required') {
  const error = new Error(message)
  error.code = 'ADMIN_FORBIDDEN'
  return error
}

async function requireAdmin (event, context) {
  const token = event && (event.uniIdToken || event['uni-id-token'] || event.token)
  if (!token) throw forbidden('uni-id token is required')

  const uniId = uniIdCommon.createInstance({ context })
  const checked = await uniId.checkToken(token)
  if (!checked || checked.errCode) {
    throw forbidden(checked && checked.errMsg ? checked.errMsg : 'Invalid uni-id token')
  }
  const roles = Array.isArray(checked.role)
    ? checked.role
    : Array.isArray(checked.roles)
      ? checked.roles
      : typeof checked.role === 'string'
        ? [checked.role]
        : []
  if (!roles.includes('admin')) throw forbidden()
  return checked
}

exports.main = async (event = {}, context = {}) => {
  try {
    await requireAdmin(event, context)
    const { service } = createCore({ uniCloudObject: uniCloud })
    if (event.action === 'start') {
      const result = await service.queueSync({
        trigger: 'manual',
        force: event.force === true
      })
      return { errCode: 0, ...result }
    }
    if (event.action === 'getStatus') {
      const job = await service.getStatus(event.jobId)
      return { errCode: 0, job }
    }
    return {
      errCode: 'INVALID_ACTION',
      errMsg: 'action must be start or getStatus'
    }
  } catch (error) {
    const safe = errors.sanitizeError(error)
    console.error('member-crowd admin request failed', {
      code: safe.code,
      wechatCode: safe.wechat_code
    })
    return { errCode: safe.code, errMsg: safe.message }
  }
}

module.exports.requireAdmin = requireAdmin
