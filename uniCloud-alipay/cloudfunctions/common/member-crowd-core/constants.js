'use strict'

const COLLECTIONS = Object.freeze({
  memberships: 'question_bank_memberships',
  users: 'uni-id-users',
  jobs: 'member_crowd_sync_jobs',
  runtime: 'member_crowd_runtime'
})

const RUNTIME_IDS = Object.freeze({
  lock: 'sync-lock',
  published: 'published-state',
  token: 'wechat-token'
})

const JOB_STATUS = Object.freeze({
  queued: 'queued',
  processing: 'processing',
  published: 'published',
  failed: 'failed',
  skipped: 'skipped'
})

const JOB_STAGE = Object.freeze({
  queued: 'queued',
  collecting: 'collecting',
  uploading: 'uploading',
  creating: 'creating',
  waiting: 'waiting',
  publishing: 'publishing',
  complete: 'complete',
  failed: 'failed',
  unchanged: 'unchanged'
})

const ACTIVE_JOB_STATUSES = Object.freeze([
  JOB_STATUS.queued,
  JOB_STATUS.processing
])

const WECHAT_API_BASE = 'https://api.weixin.qq.com'
const CHUNK_SIZE = 1024 * 1024
// Keep enough room for crowd creation, status polling, and publish retries.
const JOB_TIMEOUT_MS = 8 * 60 * 60 * 1000
const WORKER_INTERVAL_MS = 10 * 60 * 1000
const WORKER_RUNNABLE_TOLERANCE_MS = 60 * 1000
const LOCK_TTL_MS = 2 * 60 * 60 * 1000
const MEMBER_EXPIRY_GRACE_MS = 6 * 60 * 60 * 1000

module.exports = {
  COLLECTIONS,
  RUNTIME_IDS,
  JOB_STATUS,
  JOB_STAGE,
  ACTIVE_JOB_STATUSES,
  WECHAT_API_BASE,
  CHUNK_SIZE,
  JOB_TIMEOUT_MS,
  WORKER_INTERVAL_MS,
  WORKER_RUNNABLE_TOLERANCE_MS,
  LOCK_TTL_MS,
  MEMBER_EXPIRY_GRACE_MS
}
