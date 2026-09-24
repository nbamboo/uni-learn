'use strict'

const assert = require('assert')
const crypto = require('crypto')
const { buildCsvBuffer, hashOpenIds } = require('./csv')
const { isActiveMembership, extractMpWeixinOpenId } = require('./member-source')
const { WechatClient, uploadEtagMatches } = require('./wechat-client')
const { CrowdSyncService } = require('./service')
const { CrowdRepository, isRunnableJob } = require('./repository')
const { WORKER_INTERVAL_MS } = require('./constants')

function tokenRepository () {
  let token = null
  return {
    async getTokenCache () { return token },
    async saveTokenCache ({ accessToken, expireAt }) {
      token = { access_token: accessToken, expire_at: expireAt }
    },
    async clearTokenCache () { token = null }
  }
}

function serviceRepository (openIds) {
  let job = null
  let published = null
  return {
    get published () { return published },
    async findActiveJob () { return job && ['queued', 'processing'].includes(job.status) ? job : null },
    async acquireLock (owner) { return { acquired: true, lock: { owner } } },
    async attachJobToLock () {},
    async addJob (value) { job = Object.assign({ _id: 'job-1' }, value); return job },
    async getJob () { return job },
    async getLatestJob () { return job },
    async findRunnableJob (timestamp) {
      return job && ['queued', 'processing'].includes(job.status) && job.next_attempt_at <= timestamp ? job : null
    },
    async updateJob (id, patch) { job = Object.assign({}, job, patch, { _id: id }); return job },
    async renewLock () { return true },
    async releaseLock () {},
    async listMemberOpenIds () { return openIds },
    async getPublishedState () { return published },
    async savePublishedState (value) { published = value }
  }
}

async function run () {
  const now = 1_700_000_000_000
  assert.strictEqual(isActiveMembership({
    userId: 'user-1',
    status: 'active',
    expiresAt: new Date(now - 5 * 60 * 60 * 1000)
  }, now), true)
  assert.strictEqual(isActiveMembership({
    userId: 'user-1',
    status: 'active',
    expiresAt: new Date(now - 7 * 60 * 60 * 1000)
  }, now), false)
  assert.strictEqual(extractMpWeixinOpenId({ wx_openid: { mp: ' openid-1 ' } }), 'openid-1')
  assert.strictEqual(buildCsvBuffer(['openid-b', 'openid-a']).toString(), 'OpenID\r\nopenid-a\r\nopenid-b\r\n')
  assert.strictEqual(isRunnableJob({ next_attempt_at: now + 30 * 1000 }, now), true)
  assert.strictEqual(isRunnableJob({ next_attempt_at: now + 61 * 1000 }, now), false)

  const etagPart = Buffer.from('OpenID\r\nopenid-1\r\n')
  const transmittedEtagPart = etagPart.toString('utf8')
  assert.strictEqual(uploadEtagMatches({
    part: etagPart,
    transmittedPart: transmittedEtagPart,
    etag: crypto.createHash('md5').update(etagPart).digest('hex')
  }), true)
  assert.strictEqual(uploadEtagMatches({
    part: etagPart,
    transmittedPart: transmittedEtagPart,
    etag: crypto.createHash('md5').update(transmittedEtagPart).digest('hex').toUpperCase()
  }), true)
  assert.strictEqual(uploadEtagMatches({
    part: etagPart,
    transmittedPart: transmittedEtagPart,
    etag: 'not-a-valid-etag'
  }), false)

  let databasePatch
  const fakeCollection = {
    doc () {
      return {
        async update (patch) { databasePatch = patch },
        async get () { return { data: [] } }
      }
    }
  }
  const fakeCommand = {
    set (value) { return { operator: 'set', value } }
  }
  const crowdRepository = new CrowdRepository({
    db: {
      command: fakeCommand,
      collection () { return fakeCollection }
    },
    now: () => now
  })
  await crowdRepository.updateJob('job-1', {
    last_error: { code: 'TEST_ERROR', message: 'test' }
  })
  assert.deepStrictEqual(databasePatch.last_error, {
    operator: 'set',
    value: { code: 'TEST_ERROR', message: 'test' }
  })

  const uploadOperations = []
  const uploadedFragments = []
  const wechatClient = new WechatClient({
    repository: tokenRepository(),
    env: { WECHAT_APPID: 'test-appid', WECHAT_APPSECRET: 'test-secret' },
    now: () => now,
    sleep: async () => {},
    httpRequest: async (url, options) => {
      if (url.endsWith('/cgi-bin/stable_token')) {
        return { data: { access_token: 'test-token', expires_in: 7200 } }
      }
      uploadOperations.push(options.data.oper_type)
      if (options.data.oper_type === 1) return { data: { errcode: 0, media_id: 'media-1' } }
      if (options.data.oper_type === 2) {
        uploadedFragments.push(options.data.buff)
        const buffer = Buffer.from(options.data.buff, 'utf8')
        return { data: { errcode: 0, etag: crypto.createHash('md5').update(buffer).digest('hex') } }
      }
      return { data: { errcode: 0 } }
    }
  })
  await wechatClient.uploadFile({ fileName: 'members.csv', buffer: Buffer.from('OpenID\r\nopenid-1\r\n') })
  assert.deepStrictEqual(uploadOperations, [1, 2, 3])
  assert.deepStrictEqual(uploadedFragments, ['OpenID\r\nopenid-1\r\n'])

  let timestamp = now
  const repository = serviceRepository(['openid-b', 'openid-a'])
  const remoteCalls = []
  const service = new CrowdSyncService({
    repository,
    now: () => timestamp,
    logger: { info () {}, warn () {}, error () {} },
    wechat: {
      async uploadFile () { remoteCalls.push('upload'); return 'media-1' },
      async createCrowd () { remoteCalls.push('create'); return 'crowd-1' },
      async queryCrowd () {
        remoteCalls.push('query')
        return { state: 'SUCC', openid_num: 2, effective_num: 2 }
      },
      async publishCrowd () { remoteCalls.push('publish') }
    }
  })
  await service.queueSync({ trigger: 'manual' })
  let result = await service.runNext()
  assert.strictEqual(result.job.stage, 'waiting')
  timestamp += WORKER_INTERVAL_MS
  result = await service.runNext()
  assert.strictEqual(result.job.status, 'published')
  assert.strictEqual(result.job.remoteState, 'SUCCESS')
  assert.deepStrictEqual(remoteCalls, ['upload', 'create', 'query', 'publish'])
  assert.strictEqual(repository.published.snapshot_hash, hashOpenIds(['openid-a', 'openid-b']))

  timestamp = now
  const rejectedRepository = serviceRepository(['openid-b', 'openid-a'])
  const rejectedService = new CrowdSyncService({
    repository: rejectedRepository,
    now: () => timestamp,
    logger: { info () {}, warn () {}, error () {} },
    wechat: {
      async uploadFile () { return 'media-rejected' },
      async createCrowd () { return 'crowd-rejected' },
      async queryCrowd () {
        return {
          state: 'CAN_NOT_CREATE',
          errmsg: 'No effective OpenID',
          openid_num: 2,
          effective_num: 0
        }
      },
      async publishCrowd () { throw new Error('must not publish') }
    }
  })
  await rejectedService.queueSync({ trigger: 'manual' })
  await rejectedService.runNext()
  timestamp += WORKER_INTERVAL_MS
  const rejected = await rejectedService.runNext()
  assert.strictEqual(rejected.job.status, 'failed')
  assert.strictEqual(rejected.job.remoteState, 'CAN_NOT_CREATE')
  assert.strictEqual(rejected.job.uploadedCount, 2)
  assert.strictEqual(rejected.job.effectiveCount, 0)

  console.log('member-crowd-core tests passed')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
