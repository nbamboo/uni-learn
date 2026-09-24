'use strict'

const {
  JOB_STATUS,
  JOB_STAGE,
  JOB_TIMEOUT_MS,
  WORKER_INTERVAL_MS
} = require('./constants')
const {
  normalizeOpenIds,
  buildCsvBuffer,
  hashOpenIds
} = require('./csv')
const {
  createId,
  createCrowdName,
  createCsvFileName
} = require('./utils')
const {
  CrowdSyncError,
  sanitizeError
} = require('./errors')

function publicJob (job) {
  if (!job) return null
  return {
    jobId: job._id,
    status: job.status,
    stage: job.stage,
    trigger: job.trigger,
    force: Boolean(job.force),
    memberCount: job.member_count,
    uploadedCount: job.uploaded_count,
    effectiveCount: job.effective_count,
    remoteState: job.remote_state,
    crowdId: job.crowd_id,
    crowdName: job.crowd_name,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    publishedAt: job.published_at,
    lastError: job.last_error || null
  }
}

class CrowdSyncService {
  constructor ({ repository, wechat, now = Date.now, logger = console }) {
    if (!repository) throw new TypeError('repository is required')
    if (!wechat) throw new TypeError('wechat is required')
    this.repository = repository
    this.wechat = wechat
    this.now = now
    this.logger = logger
  }

  async queueSync ({ trigger = 'manual', force = false } = {}) {
    const active = await this.repository.findActiveJob()
    if (active) return { created: false, job: publicJob(active) }

    const timestamp = this.now()
    const owner = createId()
    const lockResult = await this.repository.acquireLock(owner, timestamp)
    if (!lockResult.acquired) {
      const lockedJob = lockResult.lock && lockResult.lock.job_id
        ? await this.repository.getJob(lockResult.lock.job_id)
        : null
      if (lockedJob) return { created: false, job: publicJob(lockedJob) }
      throw new CrowdSyncError('SYNC_BUSY', 'Another synchronization request is acquiring the lock')
    }

    try {
      const job = await this.repository.addJob({
        status: JOB_STATUS.queued,
        stage: JOB_STAGE.queued,
        trigger,
        force: Boolean(force),
        attempt_count: 0,
        publish_attempts: 0,
        next_attempt_at: timestamp,
        deadline_at: timestamp + JOB_TIMEOUT_MS,
        created_at: timestamp,
        updated_at: timestamp
      })
      await this.repository.attachJobToLock(owner, job._id)
      this.logger.info('member-crowd job queued', { jobId: job._id, trigger })
      return { created: true, job: publicJob(job) }
    } catch (error) {
      await this.repository.releaseLock({ owner })
      throw error
    }
  }

  async getStatus (jobId) {
    const job = jobId
      ? await this.repository.getJob(jobId)
      : await this.repository.getLatestJob()
    if (!job) throw new CrowdSyncError('JOB_NOT_FOUND', 'Synchronization job was not found')
    return publicJob(job)
  }

  async ensureJobLock (jobId) {
    if (await this.repository.renewLock(jobId)) return true
    const owner = `worker-${jobId}-${createId().slice(0, 8)}`
    const result = await this.repository.acquireLock(owner, this.now())
    if (!result.acquired) return false
    await this.repository.attachJobToLock(owner, jobId)
    return true
  }

  async runNext () {
    const timestamp = this.now()
    const job = await this.repository.findRunnableJob(timestamp)
    if (!job) return { idle: true }

    if (job.deadline_at <= timestamp) {
      return { idle: false, job: publicJob(await this.failJob(job, new CrowdSyncError(
        'JOB_TIMEOUT',
        'Crowd synchronization did not complete within eight hours'
      ))) }
    }

    if (!await this.ensureJobLock(job._id)) {
      return { idle: true, reason: 'locked' }
    }

    try {
      let updated
      if (job.crowd_id && job.stage === JOB_STAGE.publishing) {
        updated = await this.publishJob(job)
      } else if (job.crowd_id) {
        updated = await this.queryAndMaybePublish(job)
      } else {
        updated = await this.prepareAndCreate(job)
      }
      return { idle: false, job: publicJob(updated) }
    } catch (error) {
      const failed = await this.failJob(job, error)
      return { idle: false, job: publicJob(failed) }
    }
  }

  async prepareAndCreate (job) {
    const timestamp = this.now()
    await this.repository.updateJob(job._id, {
      status: JOB_STATUS.processing,
      stage: JOB_STAGE.collecting,
      attempt_count: (job.attempt_count || 0) + 1,
      last_error: null
    })

    const openIds = normalizeOpenIds(await this.repository.listMemberOpenIds(timestamp))
    if (openIds.length === 0) {
      throw new CrowdSyncError('NO_VALID_OPENIDS', 'No active member has a usable mp-weixin OpenID')
    }

    const snapshotHash = hashOpenIds(openIds)
    const published = await this.repository.getPublishedState()
    if (!job.force && published && published.snapshot_hash === snapshotHash) {
      const skipped = await this.repository.updateJob(job._id, {
        status: JOB_STATUS.skipped,
        stage: JOB_STAGE.unchanged,
        member_count: openIds.length,
        snapshot_hash: snapshotHash,
        finished_at: this.now(),
        next_attempt_at: 0
      })
      await this.repository.releaseLock({ jobId: job._id })
      this.logger.info('member-crowd job skipped', { jobId: job._id, memberCount: openIds.length })
      return skipped
    }

    const fileName = createCsvFileName(timestamp, snapshotHash)
    const crowdName = createCrowdName(timestamp, snapshotHash)
    const csv = buildCsvBuffer(openIds)

    await this.repository.updateJob(job._id, {
      stage: JOB_STAGE.uploading,
      member_count: openIds.length,
      snapshot_hash: snapshotHash,
      file_name: fileName,
      crowd_name: crowdName
    })
    const mediaId = await this.wechat.uploadFile({ fileName, buffer: csv })

    await this.repository.updateJob(job._id, {
      stage: JOB_STAGE.creating,
      media_id: mediaId
    })
    const crowdId = await this.wechat.createCrowd({ mediaId, crowdName })

    const waiting = await this.repository.updateJob(job._id, {
      stage: JOB_STAGE.waiting,
      crowd_id: crowdId,
      remote_state: 'PROCESSING',
      next_attempt_at: this.now() + WORKER_INTERVAL_MS
    })
    this.logger.info('member-crowd creation submitted', {
      jobId: job._id,
      memberCount: openIds.length,
      crowdId
    })
    return waiting
  }

  async queryAndMaybePublish (job) {
    const response = await this.wechat.queryCrowd(job.crowd_id)
    const remoteState = String(response.state || '').toUpperCase()
    // The live WeAnalysis API currently returns SUCC, while the supplied API
    // document describes the terminal success value as SUCCESS.
    const state = remoteState === 'SUCC' ? 'SUCCESS' : remoteState
    const counts = {}
    if (response.openid_num !== undefined && Number.isFinite(Number(response.openid_num))) {
      counts.uploaded_count = Number(response.openid_num)
    }
    if (response.effective_num !== undefined && Number.isFinite(Number(response.effective_num))) {
      counts.effective_count = Number(response.effective_num)
    }

    if (state === 'PROCESSING') {
      return this.repository.updateJob(job._id, {
        status: JOB_STATUS.processing,
        stage: JOB_STAGE.waiting,
        remote_state: state,
        ...counts,
        next_attempt_at: this.now() + WORKER_INTERVAL_MS
      })
    }

    if (state === 'FAIL' || state === 'CAN_NOT_CREATE') {
      await this.repository.updateJob(job._id, {
        remote_state: state,
        ...counts
      })
      throw new CrowdSyncError(
        `CROWD_${state}`,
        response.errmsg || `WeChat crowd state is ${state}`
      )
    }

    if (state !== 'SUCCESS') {
      throw new CrowdSyncError('CROWD_STATE_INVALID', `Unexpected WeChat crowd state: ${state || '(empty)'}`)
    }

    if (!Number.isFinite(counts.effective_count) || counts.effective_count <= 0) {
      throw new CrowdSyncError('NO_EFFECTIVE_OPENIDS', 'WeChat reported zero effective OpenIDs')
    }

    const publishing = await this.repository.updateJob(job._id, {
      status: JOB_STATUS.processing,
      stage: JOB_STAGE.publishing,
      remote_state: state,
      ...counts,
      next_attempt_at: this.now()
    })
    return this.publishJob(publishing)
  }

  async publishJob (job) {
    const attempts = (job.publish_attempts || 0) + 1
    await this.repository.updateJob(job._id, {
      status: JOB_STATUS.processing,
      stage: JOB_STAGE.publishing,
      publish_attempts: attempts,
      next_attempt_at: this.now() + WORKER_INTERVAL_MS
    })

    try {
      await this.wechat.publishCrowd(job.crowd_id)
    } catch (error) {
      if (attempts < 3 && error.retryable) {
        return this.repository.updateJob(job._id, {
          last_error: sanitizeError(error),
          next_attempt_at: this.now() + WORKER_INTERVAL_MS
        })
      }
      throw error
    }

    const publishedAt = this.now()
    await this.repository.savePublishedState({
      snapshot_hash: job.snapshot_hash,
      crowd_id: job.crowd_id,
      crowd_name: job.crowd_name,
      member_count: job.member_count,
      effective_count: job.effective_count,
      job_id: job._id,
      published_at: publishedAt
    })
    const complete = await this.repository.updateJob(job._id, {
      status: JOB_STATUS.published,
      stage: JOB_STAGE.complete,
      last_error: null,
      next_attempt_at: 0,
      published_at: publishedAt,
      finished_at: publishedAt
    })
    await this.repository.releaseLock({ jobId: job._id })
    this.logger.info('member-crowd published', {
      jobId: job._id,
      crowdId: job.crowd_id,
      effectiveCount: job.effective_count
    })
    return complete
  }

  async failJob (job, error) {
    const safeError = sanitizeError(error)
    const failed = await this.repository.updateJob(job._id, {
      status: JOB_STATUS.failed,
      stage: JOB_STAGE.failed,
      last_error: safeError,
      next_attempt_at: 0,
      finished_at: this.now()
    })
    await this.repository.releaseLock({ jobId: job._id })
    this.logger.error('member-crowd job failed', {
      jobId: job._id,
      code: safeError.code,
      wechatCode: safeError.wechat_code
    })
    return failed
  }
}

module.exports = {
  CrowdSyncService,
  publicJob
}
