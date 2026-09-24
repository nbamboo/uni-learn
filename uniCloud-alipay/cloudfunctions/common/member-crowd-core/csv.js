'use strict'

const crypto = require('crypto')
const { CHUNK_SIZE } = require('./constants')

function normalizeOpenIds (openIds) {
  return [...new Set(
    (openIds || [])
      .filter(value => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)
  )].sort()
}

function escapeCsvCell (value) {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function buildCsvBuffer (openIds) {
  const normalized = normalizeOpenIds(openIds)
  const body = normalized.map(escapeCsvCell).join('\r\n')
  return Buffer.from(`OpenID\r\n${body}${body ? '\r\n' : ''}`, 'utf8')
}

function hashOpenIds (openIds) {
  const normalized = normalizeOpenIds(openIds)
  return crypto.createHash('sha256').update(normalized.join('\n'), 'utf8').digest('hex')
}

function splitBuffer (buffer, size = CHUNK_SIZE) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer must be a Buffer')
  if (!Number.isInteger(size) || size <= 0) throw new TypeError('size must be a positive integer')

  const parts = []
  for (let offset = 0; offset < buffer.length; offset += size) {
    parts.push(buffer.subarray(offset, Math.min(offset + size, buffer.length)))
  }
  return parts
}

function md5 (buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex')
}

module.exports = {
  normalizeOpenIds,
  buildCsvBuffer,
  hashOpenIds,
  splitBuffer,
  md5
}
