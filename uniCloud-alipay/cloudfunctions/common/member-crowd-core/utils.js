'use strict'

const crypto = require('crypto')

function createId () {
  return crypto.randomBytes(16).toString('hex')
}

function sleep (milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function chunkArray (items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function extractAddedId (result) {
  if (result && result.id) return result.id
  if (result && Array.isArray(result.ids) && result.ids[0]) return result.ids[0]
  return null
}

function beijingDateParts (timestamp) {
  const date = new Date(timestamp + (8 * 60 * 60 * 1000))
  const compact = date.toISOString().replace(/[-:]/g, '')
  return {
    date: compact.slice(0, 8),
    minute: compact.slice(9, 13)
  }
}

function createCrowdName (timestamp, snapshotHash) {
  const parts = beijingDateParts(timestamp)
  return `uni-learn-members-${parts.date}-${parts.minute}-${snapshotHash.slice(0, 8)}`
}

function createCsvFileName (timestamp, snapshotHash) {
  const parts = beijingDateParts(timestamp)
  return `uni-learn-members-${parts.date}-${parts.minute}-${snapshotHash.slice(0, 8)}.csv`
}

function isDuplicateKeyError (error) {
  const text = `${error && error.code ? error.code : ''} ${error && error.message ? error.message : ''}`
  return /duplicate|E11000|already exists|重复/i.test(text)
}

module.exports = {
  createId,
  sleep,
  chunkArray,
  extractAddedId,
  beijingDateParts,
  createCrowdName,
  createCsvFileName,
  isDuplicateKeyError
}

