'use strict'

const {
  COLLECTIONS,
  RUNTIME_IDS,
  ACTIVE_JOB_STATUSES,
  LOCK_TTL_MS,
  WORKER_RUNNABLE_TOLERANCE_MS,
  MEMBER_EXPIRY_GRACE_MS
} = require('./constants')
const {
  chunkArray,
  extractAddedId,
  isDuplicateKeyError
} = require('./utils')
const {
  isActiveMembership,
  extractMpWeixinOpenId
} = require('./member-source')

function rows (response) {
  if (!response) return []
  if (Array.isArray(response.data)) return response.data
  if (response.data && typeof response.data === 'object') return [response.data]
  return []
}

function updatedCount (response) {
  return Number(response && (response.updated || response.affectedDocs || response.affected)) || 0
}

function isRunnableJob (job, timestamp) {
  return !job.next_attempt_at ||
    job.next_attempt_at <= timestamp + WORKER_RUNNABLE_TOLERANCE_MS
}

class CrowdRepository {
  constructor ({ db, now = Date.now }) {
    if (!db) throw new TypeError('db is required')
    this.db = db
    this.command = db.command
    this.now = now
    this.memberships = db.collection(COLLECTIONS.memberships)
    this.users = db.collection(COLLECTIONS.users)
    this.jobs = db.collection(COLLECTIONS.jobs)
    this.runtime = db.collection(COLLECTIONS.runtime)
  }

  async getDocument (collection, id) {
    const result = await collection.doc(id).get()
    return rows(result)[0] || null
  }

  async addJob (job) {
    const result = await this.jobs.add(job)
    const id = extractAddedId(result)
    if (!id) throw new Error('Database did not return a job id')
    return { ...job, _id: id }
  }

  async getJob (jobId) {
    if (!jobId) return null
    return this.getDocument(this.jobs, jobId)
  }

  async getLatestJob () {
    const result = await this.jobs.orderBy('created_at', 'desc').limit(1).get()
    return rows(result)[0] || null
  }

  async findActiveJob () {
    const result = await this.jobs
      .where({ status: this.command.in(ACTIVE_JOB_STATUSES) })
      .orderBy('created_at', 'asc')
      .limit(1)
      .get()
    return rows(result)[0] || null
  }

  async findRunnableJob (timestamp = this.now()) {
    const result = await this.jobs
      .where({ status: this.command.in(ACTIVE_JOB_STATUSES) })
      .orderBy('created_at', 'asc')
      .limit(20)
      .get()
    const jobs = rows(result)
    // Timer invocations can start a few seconds before/after the nominal cron
    // boundary. Allow a small lead so a 14:10:00 invocation does not skip a job
    // whose next_attempt_at was calculated as 14:10:02.
    return jobs.find(job => isRunnableJob(job, timestamp)) || null
  }

  async updateJob (jobId, patch) {
    const updatedAt = this.now()
    const databasePatch = { ...patch, updated_at: updatedAt }

    // UniCloud treats a plain object in update() as nested-field updates. If the
    // existing value is null, writing last_error.code fails on MongoDB with
    // "Cannot create field ... in element {last_error: null}". Force a whole
    // field replacement so null <-> object transitions work on every provider.
    if (databasePatch.last_error && typeof databasePatch.last_error === 'object' && !Array.isArray(databasePatch.last_error)) {
      databasePatch.last_error = this.command.set(databasePatch.last_error)
    }

    await this.jobs.doc(jobId).update(databasePatch)
    const current = await this.getJob(jobId)
    return current || { _id: jobId, ...patch, updated_at: updatedAt }
  }

  async acquireLock (owner, timestamp = this.now()) {
    const lock = {
      _id: RUNTIME_IDS.lock,
      kind: 'lock',
      owner,
      created_at: timestamp,
      updated_at: timestamp,
      expire_at: timestamp + LOCK_TTL_MS
    }

    try {
      await this.runtime.add(lock)
      return { acquired: true, lock }
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error
    }

    const existing = await this.getDocument(this.runtime, RUNTIME_IDS.lock)
    if (!existing) throw new Error('Unable to read the existing synchronization lock')

    if (existing.expire_at && existing.expire_at <= timestamp) {
      await this.runtime.where({
        _id: RUNTIME_IDS.lock,
        owner: existing.owner,
        expire_at: this.command.lte(timestamp)
      }).remove()

      try {
        await this.runtime.add(lock)
        return { acquired: true, lock }
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error
      }
    }

    return {
      acquired: false,
      lock: await this.getDocument(this.runtime, RUNTIME_IDS.lock)
    }
  }

  async attachJobToLock (owner, jobId) {
    const result = await this.runtime.where({
      _id: RUNTIME_IDS.lock,
      owner
    }).update({
      job_id: jobId,
      updated_at: this.now(),
      expire_at: this.now() + LOCK_TTL_MS
    })
    if (updatedCount(result) !== 1) {
      throw new Error('Synchronization lock ownership was lost')
    }
  }

  async renewLock (jobId) {
    const result = await this.runtime.where({
      _id: RUNTIME_IDS.lock,
      job_id: jobId
    }).update({
      updated_at: this.now(),
      expire_at: this.now() + LOCK_TTL_MS
    })
    return updatedCount(result) === 1
  }

  async releaseLock ({ owner, jobId } = {}) {
    const where = { _id: RUNTIME_IDS.lock }
    if (owner) where.owner = owner
    if (jobId) where.job_id = jobId
    await this.runtime.where(where).remove()
  }

  async getPublishedState () {
    return this.getDocument(this.runtime, RUNTIME_IDS.published)
  }

  async savePublishedState (state) {
    await this.runtime.doc(RUNTIME_IDS.published).set({
      kind: 'published-state',
      ...state,
      updated_at: this.now()
    })
  }

  async getTokenCache () {
    return this.getDocument(this.runtime, RUNTIME_IDS.token)
  }

  async saveTokenCache ({ accessToken, expireAt }) {
    await this.runtime.doc(RUNTIME_IDS.token).set({
      kind: 'wechat-token',
      access_token: accessToken,
      expire_at: expireAt,
      updated_at: this.now()
    })
  }

  async clearTokenCache () {
    await this.runtime.doc(RUNTIME_IDS.token).remove()
  }

  async listMemberOpenIds (timestamp = this.now()) {
    const pageSize = 500
    const userIds = new Set()

    for (let offset = 0; ; offset += pageSize) {
      const result = await this.memberships
        .where({
          status: 'active',
          expiresAt: this.command.gt(new Date(timestamp - MEMBER_EXPIRY_GRACE_MS))
        })
        .field({ userId: true, status: true, expiresAt: true })
        .orderBy('expiresAt', 'asc')
        .skip(offset)
        .limit(pageSize)
        .get()

      const memberships = rows(result)
      for (const membership of memberships) {
        if (isActiveMembership(membership, timestamp)) userIds.add(membership.userId)
      }
      if (memberships.length < pageSize) break
    }

    const openIds = []
    for (const ids of chunkArray([...userIds], 100)) {
      const result = await this.users
        .where({
          _id: this.command.in(ids)
        })
        .field({ _id: true, status: true, wx_openid: true })
        .limit(100)
        .get()

      const users = rows(result)
      for (const user of users) {
        const openId = extractMpWeixinOpenId(user)
        if (openId) openIds.push(openId)
      }
    }

    return openIds
  }
}

module.exports = {
  CrowdRepository,
  isRunnableJob
}
