'use strict'

const { createCore, errors } = require('member-crowd-core')

exports.main = async (event = {}) => {
  const isTimer = String(event.Type || '').toLowerCase() === 'timer' || event.triggerName === 'TIMER_LATEST'
  if (!isTimer) {
    return { errCode: 'TIMER_ONLY', errMsg: 'This cloud function only accepts timer events' }
  }

  try {
    const { service } = createCore({ uniCloudObject: uniCloud })
    const result = await service.queueSync({ trigger: 'daily', force: false })
    return { errCode: 0, ...result }
  } catch (error) {
    const safe = errors.sanitizeError(error)
    console.error('member-crowd daily trigger failed', {
      code: safe.code,
      wechatCode: safe.wechat_code
    })
    return { errCode: safe.code, errMsg: safe.message }
  }
}
