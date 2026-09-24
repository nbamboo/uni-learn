'use strict'

const { CrowdRepository } = require('./repository')
const { WechatClient, createUniCloudHttpRequest } = require('./wechat-client')
const { CrowdSyncService, publicJob } = require('./service')
const csv = require('./csv')
const memberSource = require('./member-source')
const constants = require('./constants')
const errors = require('./errors')

function createCore ({
  uniCloudObject = global.uniCloud,
  env = process.env,
  now = Date.now,
  sleep,
  logger = console
} = {}) {
  if (!uniCloudObject) throw new TypeError('uniCloud is required')
  const repository = new CrowdRepository({
    db: uniCloudObject.database(),
    now
  })
  const wechat = new WechatClient({
    repository,
    httpRequest: createUniCloudHttpRequest(uniCloudObject),
    env,
    now,
    sleep,
    logger
  })
  const service = new CrowdSyncService({
    repository,
    wechat,
    now,
    logger
  })
  return { repository, wechat, service }
}

module.exports = {
  createCore,
  CrowdRepository,
  WechatClient,
  CrowdSyncService,
  publicJob,
  csv,
  memberSource,
  constants,
  errors
}

