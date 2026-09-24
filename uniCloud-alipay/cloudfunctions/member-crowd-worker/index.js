'use strict'

const createConfig = require('uni-config-center')
const { createCore, errors } = require('member-crowd-core')

function wechatCredentials () {
  let weixin = {}
  try {
    const config = createConfig({ pluginId: 'uni-id' }).config()
    weixin = config && config['mp-weixin'] && config['mp-weixin'].oauth && config['mp-weixin'].oauth.weixin || {}
  } catch (_) {
    // Environment variables remain the primary explicit deployment option.
  }
  return {
    WECHAT_APPID: process.env.WECHAT_APPID || weixin.appid || '',
    WECHAT_APPSECRET: process.env.WECHAT_APPSECRET || weixin.appsecret || ''
  }
}

exports.main = async (event = {}) => {
  const isTimer = String(event.Type || '').toLowerCase() === 'timer' || event.triggerName === 'TIMER_LATEST'
  if (!isTimer) {
    return { errCode: 'TIMER_ONLY', errMsg: 'This cloud function only accepts timer events' }
  }

  try {
    const { service } = createCore({
      uniCloudObject: uniCloud,
      env: wechatCredentials()
    })
    const result = await service.runNext()
    return { errCode: 0, ...result }
  } catch (error) {
    const safe = errors.sanitizeError(error)
    console.error('member-crowd worker failed', {
      code: safe.code,
      wechatCode: safe.wechat_code
    })
    return { errCode: safe.code, errMsg: safe.message }
  }
}
