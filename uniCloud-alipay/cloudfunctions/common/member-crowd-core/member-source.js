'use strict'

const { MEMBER_EXPIRY_GRACE_MS } = require('./constants')

function dateValue (value) {
  if (value instanceof Date) return value.getTime()
  if (value && value.$date) return new Date(value.$date).getTime()
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function isActiveMembership (membership, now) {
  const expiresAt = dateValue(membership && membership.expiresAt)
  return Boolean(
    membership &&
    membership.status === 'active' &&
    expiresAt + MEMBER_EXPIRY_GRACE_MS > now &&
    typeof membership.userId === 'string' &&
    membership.userId
  )
}

function extractMpWeixinOpenId (user) {
  if (!user || (user.status !== undefined && user.status !== 0) || !user.wx_openid) return null
  const openId = user.wx_openid.mp || user.wx_openid['mp-weixin']
  return typeof openId === 'string' && openId.trim() ? openId.trim() : null
}

module.exports = {
  dateValue,
  isActiveMembership,
  extractMpWeixinOpenId
}
