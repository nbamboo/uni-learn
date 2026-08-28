const CLOUD_FUNCTION_NAME = 'questionBank'
const CATALOG_STORAGE_KEY = 'uni-learn-question-bank-catalog-cache-v1'
const CHAPTER_CACHE_INDEX_KEY = 'uni-learn-question-bank-chapter-cache-index-v1'
const CHAPTER_CACHE_KEY_PREFIX = 'uni-learn-question-bank-chapter-cache-v1:'
const CATALOG_CACHE_TTL = 10 * 60 * 1000
const CHAPTER_CACHE_TTL = 30 * 24 * 60 * 60 * 1000
const PAGE_CACHE_TTL = 3 * 60 * 1000
const QUESTION_CACHE_TTL = 15 * 60 * 1000
const ANSWER_CACHE_TTL = 30 * 60 * 1000
const MAX_PAGE_CACHE_ENTRIES = 30
const MAX_QUESTION_CACHE_ENTRIES = 300
const MAX_ANSWER_CACHE_ENTRIES = 300
const MAX_PERSISTED_CHAPTER_ENTRIES = 24
const MAX_PERSISTED_CHAPTER_BYTES = 6 * 1024 * 1024
const MAX_PAGE_SIZE = 50
const MAX_BATCH_SIZE = 100
const MAX_QUESTION_IDS = 2000
const MAX_PRACTICE_PAGES = 100
const DEFAULT_RETRY_COUNT = 1
const RETRY_DELAY = 120
const PRACTICE_MODES = ['sequence', 'chapter', 'knowledge', 'search', 'smart']
const ANSWER_ALIASES = ['A', 'B', 'C', 'D', 'E', 'F']
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const catalogMemoryCache = new Map()
const pageMemoryCache = new Map()
const questionMemoryCache = new Map()
const answerMemoryCache = new Map()
const pendingRequests = new Map()
let persistedCatalogsLoaded = false
let persistedCatalogs = {}

export class QuestionBankServiceError extends Error {
	constructor(errCode, errMsg, options) {
		super(errMsg)
		this.name = 'QuestionBankServiceError'
		this.errCode = errCode || 'QUESTION_BANK_CLIENT_ERROR'
		this.requestId = options && options.requestId || ''
		this.retryable = Boolean(options && options.retryable)
		this.cause = options && options.cause
	}
}

function invalidArgument(message) {
	throw new QuestionBankServiceError('QUESTION_BANK_INVALID_ARGUMENT', message)
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireObject(value, fieldName) {
	if (!isObject(value)) invalidArgument(`${fieldName || '参数'}必须是对象`)
	return value
}

function normalizeString(value, fieldName, options) {
	const config = options || {}
	if (value === undefined || value === null) {
		if (config.required) invalidArgument(`${fieldName}不能为空`)
		return config.defaultValue === undefined ? '' : config.defaultValue
	}
	if (typeof value !== 'string') invalidArgument(`${fieldName}必须是字符串`)
	const result = value.trim()
	if (config.required && !result) invalidArgument(`${fieldName}不能为空`)
	if (config.maxLength && result.length > config.maxLength) {
		invalidArgument(`${fieldName}长度不能超过${config.maxLength}个字符`)
	}
	if (config.pattern && result && !config.pattern.test(result)) {
		invalidArgument(`${fieldName}格式不正确`)
	}
	if (config.values && result && config.values.indexOf(result) === -1) {
		invalidArgument(`${fieldName}不支持值${result}`)
	}
	return result
}

function normalizeSubjectId(value) {
	return normalizeString(value, 'subjectId', {
		required: true,
		maxLength: 64,
		pattern: ID_PATTERN
	})
}

function normalizeQuestionId(value, fieldName) {
	return normalizeString(value, fieldName || 'questionId', {
		required: true,
		maxLength: 64,
		pattern: ID_PATTERN
	})
}

function normalizeInteger(value, fieldName, options) {
	const config = options || {}
	if (value === undefined || value === null || value === '') return config.defaultValue
	const result = Number(value)
	if (!Number.isInteger(result)) invalidArgument(`${fieldName}必须是整数`)
	if (config.minimum !== undefined && result < config.minimum) {
		invalidArgument(`${fieldName}不能小于${config.minimum}`)
	}
	if (config.maximum !== undefined && result > config.maximum) {
		invalidArgument(`${fieldName}不能大于${config.maximum}`)
	}
	return result
}

function normalizePageSize(value) {
	return normalizeInteger(value, 'pageSize', {
		defaultValue: 20,
		minimum: 1,
		maximum: MAX_PAGE_SIZE
	})
}

function normalizeCursor(value) {
	return normalizeInteger(value, 'cursor', {
		defaultValue: 0,
		minimum: 0
	})
}

function normalizeQuestionIds(value, fieldName, allowEmpty) {
	const name = fieldName || 'questionIds'
	if (value === undefined || value === null) {
		if (allowEmpty) return []
		invalidArgument(`${name}不能为空`)
	}
	if (!Array.isArray(value)) invalidArgument(`${name}必须是数组`)
	if (!allowEmpty && value.length === 0) invalidArgument(`${name}不能为空`)
	if (value.length > MAX_QUESTION_IDS) {
		invalidArgument(`${name}最多包含${MAX_QUESTION_IDS}个题目ID`)
	}
	const result = []
	const seen = new Set()
	value.forEach((item, index) => {
		const id = normalizeQuestionId(item, `${name}[${index}]`)
		if (!seen.has(id)) {
			seen.add(id)
			result.push(id)
		}
	})
	return result
}

function normalizeSelected(value) {
	if (!Array.isArray(value) || value.length === 0) invalidArgument('selected必须是非空数组')
	const result = []
	const seen = new Set()
	value.forEach((item, index) => {
		const alias = normalizeString(item, `selected[${index}]`, {
			required: true,
			values: ANSWER_ALIASES
		})
		if (seen.has(alias)) invalidArgument('selected不能包含重复选项')
		seen.add(alias)
		result.push(alias)
	})
	return result
}

function cloneValue(value) {
	if (value instanceof Date) return new Date(value.getTime())
	if (Array.isArray(value)) return value.map(cloneValue)
	if (!isObject(value)) return value
	const result = {}
	Object.keys(value).forEach(key => {
		result[key] = cloneValue(value[key])
	})
	return result
}

function stableSerialize(value) {
	if (value === undefined) return 'undefined'
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
	return `{${Object.keys(value).sort().map(key => (
		`${JSON.stringify(key)}:${stableSerialize(value[key])}`
	)).join(',')}}`
}

function hashString(value) {
	let hash = 2166136261
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index)
		hash = Math.imul(hash, 16777619)
	}
	return (hash >>> 0).toString(36)
}

function delay(milliseconds) {
	return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function setBoundedCache(cache, key, value, ttl, maximum) {
	cache.delete(key)
	cache.set(key, {
		value: cloneValue(value),
		expiresAt: Date.now() + ttl
	})
	while (cache.size > maximum) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
}

function getBoundedCache(cache, key) {
	const entry = cache.get(key)
	if (!entry) return null
	if (entry.expiresAt <= Date.now()) {
		cache.delete(key)
		return null
	}
	cache.delete(key)
	cache.set(key, entry)
	return cloneValue(entry.value)
}

function storageAvailable() {
	return typeof uni !== 'undefined'
		&& typeof uni.getStorageSync === 'function'
		&& typeof uni.setStorageSync === 'function'
}

function loadPersistedCatalogs() {
	if (persistedCatalogsLoaded) return
	persistedCatalogsLoaded = true
	if (!storageAvailable()) return
	try {
		const saved = uni.getStorageSync(CATALOG_STORAGE_KEY)
		persistedCatalogs = isObject(saved) && isObject(saved.entries) ? saved.entries : {}
	} catch (error) {
		persistedCatalogs = {}
	}
}

function savePersistedCatalogs() {
	if (!storageAvailable()) return
	try {
		uni.setStorageSync(CATALOG_STORAGE_KEY, {
			version: 1,
			entries: persistedCatalogs
		})
	} catch (error) {
		// Storage quota failures must not prevent cloud reads.
	}
}

function getCachedCatalog(subjectId) {
	const memory = getBoundedCache(catalogMemoryCache, subjectId)
	if (memory) return memory
	loadPersistedCatalogs()
	const entry = persistedCatalogs[subjectId]
	if (!entry || entry.expiresAt <= Date.now() || !entry.data) return null
	setBoundedCache(catalogMemoryCache, subjectId, entry.data, entry.expiresAt - Date.now(), 20)
	return cloneValue(entry.data)
}

function setCachedCatalog(subjectId, catalog) {
	setBoundedCache(catalogMemoryCache, subjectId, catalog, CATALOG_CACHE_TTL, 20)
	loadPersistedCatalogs()
	persistedCatalogs[subjectId] = {
		data: cloneValue(catalog),
		expiresAt: Date.now() + CATALOG_CACHE_TTL
	}
	savePersistedCatalogs()
}

function chapterCacheId(subjectId, version, chapterId) {
	return `${subjectId}|${version}|${chapterId}`
}

function chapterStorageKey(cacheId) {
	return `${CHAPTER_CACHE_KEY_PREFIX}${hashString(cacheId)}`
}

function jsonByteLength(value) {
	let source = ''
	try {
		source = JSON.stringify(value) || ''
	} catch (error) {
		return 0
	}
	let bytes = 0
	for (let index = 0; index < source.length; index += 1) {
		const code = source.charCodeAt(index)
		if (code <= 0x7f) bytes += 1
		else if (code <= 0x7ff) bytes += 2
		else if (code >= 0xd800 && code <= 0xdbff && index + 1 < source.length) {
			bytes += 4
			index += 1
		} else bytes += 3
	}
	return bytes
}

function emptyChapterCacheIndex() {
	return { version: 1, entries: {} }
}

function loadChapterCacheIndex() {
	if (!storageAvailable()) return emptyChapterCacheIndex()
	try {
		const saved = uni.getStorageSync(CHAPTER_CACHE_INDEX_KEY)
		if (!isObject(saved) || saved.version !== 1 || !isObject(saved.entries)) {
			return emptyChapterCacheIndex()
		}
		return {
			version: 1,
			entries: cloneValue(saved.entries)
		}
	} catch (error) {
		return emptyChapterCacheIndex()
	}
}

function saveChapterCacheIndex(index) {
	if (!storageAvailable()) return false
	try {
		uni.setStorageSync(CHAPTER_CACHE_INDEX_KEY, index)
		return true
	} catch (error) {
		return false
	}
}

function removeStorageValue(storageKey) {
	if (typeof uni === 'undefined' || typeof uni.removeStorageSync !== 'function') return
	try {
		uni.removeStorageSync(storageKey)
	} catch (error) {
		// Cache cleanup must never block question loading.
	}
}

function removeChapterCacheEntry(index, cacheId) {
	const metadata = index.entries[cacheId]
	if (!metadata) return false
	removeStorageValue(metadata.storageKey || chapterStorageKey(cacheId))
	delete index.entries[cacheId]
	return true
}

function pruneExpiredChapterCache(index, now) {
	let changed = false
	Object.keys(index.entries).forEach(cacheId => {
		const metadata = index.entries[cacheId]
		if (!isObject(metadata) || !metadata.expiresAt || metadata.expiresAt <= now) {
			changed = removeChapterCacheEntry(index, cacheId) || changed
		}
	})
	return changed
}

function chapterCacheSize(index) {
	return Object.keys(index.entries).reduce((total, cacheId) => {
		const size = Number(index.entries[cacheId] && index.entries[cacheId].sizeBytes)
		return total + (Number.isFinite(size) && size > 0 ? size : 0)
	}, 0)
}

function findOldestChapterCacheId(index) {
	return Object.keys(index.entries).sort((leftId, rightId) => {
		const left = Number(index.entries[leftId] && index.entries[leftId].lastAccessedAt) || 0
		const right = Number(index.entries[rightId] && index.entries[rightId].lastAccessedAt) || 0
		return left - right
	})[0]
}

function enforceChapterCacheLimits(index, incomingBytes) {
	let totalBytes = chapterCacheSize(index)
	while (
		Object.keys(index.entries).length >= MAX_PERSISTED_CHAPTER_ENTRIES
		|| totalBytes + incomingBytes > MAX_PERSISTED_CHAPTER_BYTES
	) {
		const oldestId = findOldestChapterCacheId(index)
		if (!oldestId) break
		const removedBytes = Number(index.entries[oldestId].sizeBytes) || 0
		removeChapterCacheEntry(index, oldestId)
		totalBytes = Math.max(0, totalBytes - removedBytes)
	}
}

function getPersistedChapter(subjectId, version, chapterId, expectedTotal) {
	if (!storageAvailable()) return null
	const now = Date.now()
	const cacheId = chapterCacheId(subjectId, version, chapterId)
	const index = loadChapterCacheIndex()
	const expiredRemoved = pruneExpiredChapterCache(index, now)
	const metadata = index.entries[cacheId]
	if (!metadata) {
		if (expiredRemoved) saveChapterCacheIndex(index)
		return null
	}
	try {
		const saved = uni.getStorageSync(metadata.storageKey || chapterStorageKey(cacheId))
		const valid = isObject(saved)
			&& saved.subjectId === subjectId
			&& saved.version === version
			&& saved.chapterId === chapterId
			&& saved.expiresAt > now
			&& Array.isArray(saved.items)
			&& Number.isInteger(saved.total)
			&& saved.total === saved.items.length
			&& (!Number.isInteger(expectedTotal) || saved.total === expectedTotal)
		if (!valid) {
			removeChapterCacheEntry(index, cacheId)
			saveChapterCacheIndex(index)
			return null
		}
		metadata.lastAccessedAt = now
		index.entries[cacheId] = metadata
		saveChapterCacheIndex(index)
		return cloneValue(saved)
	} catch (error) {
		removeChapterCacheEntry(index, cacheId)
		saveChapterCacheIndex(index)
		return null
	}
}

function setPersistedChapter(subjectId, version, chapterId, data) {
	if (!storageAvailable() || !version || !Array.isArray(data && data.items)) return false
	const total = Number(data.total)
	if (!Number.isInteger(total) || total < 0 || total !== data.items.length) return false
	const now = Date.now()
	const cacheId = chapterCacheId(subjectId, version, chapterId)
	const storageKey = chapterStorageKey(cacheId)
	const saved = {
		schemaVersion: 1,
		subjectId,
		version,
		chapterId,
		total,
		cachedAt: now,
		expiresAt: now + CHAPTER_CACHE_TTL,
		items: cloneValue(data.items)
	}
	const sizeBytes = jsonByteLength(saved)
	if (!sizeBytes || sizeBytes > MAX_PERSISTED_CHAPTER_BYTES) return false

	const index = loadChapterCacheIndex()
	pruneExpiredChapterCache(index, now)
	removeChapterCacheEntry(index, cacheId)
	enforceChapterCacheLimits(index, sizeBytes)

	let stored = false
	while (!stored) {
		try {
			uni.setStorageSync(storageKey, saved)
			stored = true
		} catch (error) {
			const oldestId = findOldestChapterCacheId(index)
			if (!oldestId) {
				saveChapterCacheIndex(index)
				return false
			}
			removeChapterCacheEntry(index, oldestId)
		}
	}

	index.entries[cacheId] = {
		subjectId,
		version,
		chapterId,
		storageKey,
		sizeBytes,
		cachedAt: now,
		lastAccessedAt: now,
		expiresAt: saved.expiresAt
	}
	if (!saveChapterCacheIndex(index)) {
		removeStorageValue(storageKey)
		return false
	}
	return true
}

function removePersistedChapterVersions(subjectId, activeVersion) {
	if (!storageAvailable()) return
	const index = loadChapterCacheIndex()
	let changed = false
	Object.keys(index.entries).forEach(cacheId => {
		const metadata = index.entries[cacheId]
		if (metadata.subjectId === subjectId && metadata.version !== activeVersion) {
			changed = removeChapterCacheEntry(index, cacheId) || changed
		}
	})
	if (changed) saveChapterCacheIndex(index)
}

function clearPersistedChapterCache(subjectId) {
	if (!storageAvailable()) return
	const index = loadChapterCacheIndex()
	let changed = false
	Object.keys(index.entries).forEach(cacheId => {
		const metadata = index.entries[cacheId]
		if (!subjectId || metadata.subjectId === subjectId) {
			changed = removeChapterCacheEntry(index, cacheId) || changed
		}
	})
	if (changed || !subjectId) saveChapterCacheIndex(index)
}

function removeCacheEntries(cache, prefix) {
	Array.from(cache.keys()).forEach(key => {
		if (!prefix || key.indexOf(prefix) === 0) cache.delete(key)
	})
}

function clearSubjectMemory(subjectId) {
	const prefix = `${subjectId}|`
	removeCacheEntries(pageMemoryCache, prefix)
	removeCacheEntries(questionMemoryCache, prefix)
	removeCacheEntries(answerMemoryCache, prefix)
}

function pageCacheKey(subjectId, version, action, payload) {
	return `${subjectId}|${version}|${action}|${hashString(stableSerialize(payload))}`
}

function questionCacheKey(subjectId, version, questionId) {
	return `${subjectId}|${version}|${questionId}`
}

function answerCacheKey(subjectId, version, questionId, selected) {
	return `${subjectId}|${version}|${questionId}|${selected.slice().sort().join(',')}`
}

function ensureCloudAvailable() {
	if (typeof uniCloud === 'undefined' || typeof uniCloud.callFunction !== 'function') {
		throw new QuestionBankServiceError(
			'QUESTION_BANK_CLOUD_UNAVAILABLE',
			'当前运行环境不支持uniCloud'
		)
	}
}

async function executeCloudCall(action, payload, retryCount) {
	ensureCloudAvailable()
	let lastError = null
	for (let attempt = 0; attempt <= retryCount; attempt += 1) {
		try {
			const response = await uniCloud.callFunction({
				name: CLOUD_FUNCTION_NAME,
				data: Object.assign({ action }, payload)
			})
			const result = response && response.result
			if (!result || typeof result !== 'object') {
				throw new QuestionBankServiceError(
					'QUESTION_BANK_INVALID_RESPONSE',
					'题库服务返回格式不正确',
					{ requestId: response && response.requestId }
				)
			}
			if (result.errCode !== 0) {
				throw new QuestionBankServiceError(
					result.errCode || 'QUESTION_BANK_CLOUD_ERROR',
					result.errMsg || '题库服务请求失败',
					{ requestId: result.requestId || response.requestId }
				)
			}
			return result.data
		} catch (error) {
			if (error instanceof QuestionBankServiceError) throw error
			lastError = error
			if (attempt < retryCount) await delay(RETRY_DELAY * (attempt + 1))
		}
	}
	throw new QuestionBankServiceError(
		'QUESTION_BANK_NETWORK_ERROR',
		'题库加载失败，请检查网络后重试',
		{ retryable: true, cause: lastError }
	)
}

function callQuestionBank(action, payload, options) {
	const config = options || {}
	const requestPayload = payload || {}
	const requestKey = `${action}|${stableSerialize(requestPayload)}`
	if (pendingRequests.has(requestKey)) return pendingRequests.get(requestKey)
	const retryCount = config.retryCount === undefined
		? DEFAULT_RETRY_COUNT
		: normalizeInteger(config.retryCount, 'retryCount', { minimum: 0, maximum: 3 })
	const request = executeCloudCall(action, requestPayload, retryCount)
		.then(result => {
			pendingRequests.delete(requestKey)
			return result
		}, error => {
			pendingRequests.delete(requestKey)
			throw error
		})
	pendingRequests.set(requestKey, request)
	return request
}

async function syncCatalogVersion(subjectId, expectedVersion, returnedVersion) {
	if (!returnedVersion || returnedVersion === expectedVersion) return
	clearSubjectMemory(subjectId)
	catalogMemoryCache.delete(subjectId)
	await getQuestionCatalog(subjectId, { forceRefresh: true })
}

function cacheQuestions(subjectId, version, items) {
	if (!Array.isArray(items)) return
	items.forEach(question => {
		const questionId = question && (question.questionId || question.id)
		if (!questionId) return
		setBoundedCache(
			questionMemoryCache,
			questionCacheKey(subjectId, version, questionId),
			question,
			QUESTION_CACHE_TTL,
			MAX_QUESTION_CACHE_ENTRIES
		)
	})
}

function buildPracticePayload(input, subjectId, mode) {
	const payload = {
		subjectId,
		mode,
		pageSize: normalizePageSize(input.pageSize)
	}
	if (mode !== 'smart') payload.cursor = normalizeCursor(input.cursor)
	if (mode === 'chapter') {
		payload.chapterId = normalizeString(input.chapterId, 'chapterId', {
			required: true,
			maxLength: 32
		})
	}
	if (mode === 'knowledge') {
		payload.knowledge = normalizeString(input.knowledge, 'knowledge', {
			required: true,
			maxLength: 128
		})
	}
	if (mode === 'search') {
		payload.keyword = normalizeString(input.keyword, 'keyword', {
			required: true,
			maxLength: 64
		})
	}
	if (mode === 'smart') {
		payload.answeredQuestionIds = normalizeQuestionIds(
			input.answeredQuestionIds,
			'answeredQuestionIds',
			true
		)
		payload.wrongQuestionIds = normalizeQuestionIds(
			input.wrongQuestionIds,
			'wrongQuestionIds',
			true
		)
		const seed = normalizeString(input.seed, 'seed', { maxLength: 128 })
		if (seed) payload.seed = seed
	}
	return payload
}

export async function getQuestionCatalog(subjectId, options) {
	const normalizedSubjectId = normalizeSubjectId(subjectId)
	const config = options || {}
	if (!config.forceRefresh) {
		const cached = getCachedCatalog(normalizedSubjectId)
		if (cached) return cached
	}
	const previous = getCachedCatalog(normalizedSubjectId)
	const catalog = await callQuestionBank('getCatalog', {
		subjectId: normalizedSubjectId
	}, config)
	if (!catalog || !catalog.activeVersion) {
		throw new QuestionBankServiceError(
			'QUESTION_BANK_INVALID_CATALOG',
			'题库目录缺少有效版本'
		)
	}
	if (previous && previous.activeVersion !== catalog.activeVersion) {
		clearSubjectMemory(normalizedSubjectId)
	}
	removePersistedChapterVersions(normalizedSubjectId, catalog.activeVersion)
	setCachedCatalog(normalizedSubjectId, catalog)
	return cloneValue(catalog)
}

export async function getPracticePage(params, options) {
	const input = requireObject(params, 'params')
	const subjectId = normalizeSubjectId(input.subjectId)
	const mode = normalizeString(input.mode, 'mode', {
		defaultValue: 'sequence',
		values: PRACTICE_MODES
	})
	const payload = buildPracticePayload(input, subjectId, mode)
	const catalog = await getQuestionCatalog(subjectId)
	const config = options || {}
	const key = pageCacheKey(subjectId, catalog.activeVersion, 'getPracticePage', payload)
	if (!config.forceRefresh) {
		const cached = getBoundedCache(pageMemoryCache, key)
		if (cached) return cached
	}
	const data = await callQuestionBank('getPracticePage', payload, config)
	const version = data && data.version || catalog.activeVersion
	await syncCatalogVersion(subjectId, catalog.activeVersion, version)
	cacheQuestions(subjectId, version, data && data.items)
	setBoundedCache(
		pageMemoryCache,
		pageCacheKey(subjectId, version, 'getPracticePage', payload),
		data,
		PAGE_CACHE_TTL,
		MAX_PAGE_CACHE_ENTRIES
	)
	return cloneValue(data)
}

export async function getAllPracticeQuestions(params, options) {
	const input = requireObject(params, 'params')
	const subjectId = normalizeSubjectId(input.subjectId)
	const mode = normalizeString(input.mode, 'mode', {
		defaultValue: 'sequence',
		values: PRACTICE_MODES
	})
	const pageSize = normalizeInteger(input.pageSize, 'pageSize', {
		defaultValue: MAX_PAGE_SIZE,
		minimum: 1,
		maximum: MAX_PAGE_SIZE
	})
	const firstCursor = mode === 'smart' ? 0 : normalizeCursor(input.cursor)
	const chapterId = mode === 'chapter'
		? normalizeString(input.chapterId, 'chapterId', { required: true, maxLength: 32 })
		: ''
	const config = options || {}
	if (mode === 'chapter' && firstCursor === 0 && !config.forceRefresh) {
		const catalog = await getQuestionCatalog(subjectId)
		const catalogChapter = Array.isArray(catalog.chapters)
			? catalog.chapters.find(item => item.id === chapterId)
			: null
		const expectedTotal = catalogChapter && Number(catalogChapter.count)
		const persisted = getPersistedChapter(
			subjectId,
			catalog.activeVersion,
			chapterId,
			Number.isInteger(expectedTotal) ? expectedTotal : undefined
		)
		if (persisted) {
			cacheQuestions(subjectId, catalog.activeVersion, persisted.items)
			return {
				subjectId,
				version: catalog.activeVersion,
				mode,
				total: persisted.total,
				pageSize,
				cursor: 0,
				nextCursor: null,
				hasMore: false,
				items: cloneValue(persisted.items)
			}
		}
	}
	const items = []
	const seenQuestionIds = new Set()
	const seenCursors = new Set()
	let cursor = firstCursor
	let total = 0
	let version = ''
	let lastPage = null

	for (let pageIndex = 0; pageIndex < MAX_PRACTICE_PAGES; pageIndex += 1) {
		if (seenCursors.has(cursor)) {
			throw new QuestionBankServiceError(
				'QUESTION_BANK_INVALID_RESPONSE',
				'题库分页游标重复，无法继续加载'
			)
		}
		seenCursors.add(cursor)

		const pageParams = Object.assign({}, input, {
			subjectId,
			mode,
			pageSize
		})
		if (mode !== 'smart') pageParams.cursor = cursor
		const page = await getPracticePage(pageParams, options)
		lastPage = page
		if (pageIndex === 0) total = Number(page && page.total) || 0
		if (page && page.version) version = page.version

		const pageItems = page && Array.isArray(page.items) ? page.items : []
		pageItems.forEach(question => {
			const questionId = question && (question.questionId || question.id)
			if (!questionId || seenQuestionIds.has(questionId)) return
			seenQuestionIds.add(questionId)
			items.push(question)
		})

		if (!page || !page.hasMore || mode === 'smart') {
			const result = {
				subjectId,
				version,
				mode,
				total,
				pageSize,
				cursor: firstCursor,
				nextCursor: null,
				hasMore: false,
				items: cloneValue(items)
			}
			if (mode === 'chapter' && firstCursor === 0) {
				removePersistedChapterVersions(subjectId, version)
				setPersistedChapter(subjectId, version, chapterId, result)
			}
			return result
		}

		const nextCursor = Number(page.nextCursor)
		if (!Number.isInteger(nextCursor) || nextCursor <= cursor) {
			throw new QuestionBankServiceError(
				'QUESTION_BANK_INVALID_RESPONSE',
				'题库分页游标无效，无法继续加载'
			)
		}
		cursor = nextCursor
	}

	throw new QuestionBankServiceError(
		'QUESTION_BANK_PAGE_LIMIT',
		`题库分页超过${MAX_PRACTICE_PAGES}页，请缩小查询范围`,
		{ requestId: lastPage && lastPage.requestId }
	)
}

export async function searchQuestionBank(params, options) {
	const input = requireObject(params, 'params')
	const subjectId = normalizeSubjectId(input.subjectId)
	const payload = {
		subjectId,
		keyword: normalizeString(input.keyword, 'keyword', {
			required: true,
			maxLength: 64
		}),
		cursor: normalizeCursor(input.cursor),
		pageSize: normalizePageSize(input.pageSize)
	}
	const catalog = await getQuestionCatalog(subjectId)
	const config = options || {}
	const key = pageCacheKey(subjectId, catalog.activeVersion, 'searchQuestions', payload)
	if (!config.forceRefresh) {
		const cached = getBoundedCache(pageMemoryCache, key)
		if (cached) return cached
	}
	const data = await callQuestionBank('searchQuestions', payload, config)
	const version = data && data.version || catalog.activeVersion
	await syncCatalogVersion(subjectId, catalog.activeVersion, version)
	setBoundedCache(
		pageMemoryCache,
		pageCacheKey(subjectId, version, 'searchQuestions', payload),
		data,
		PAGE_CACHE_TTL,
		MAX_PAGE_CACHE_ENTRIES
	)
	return cloneValue(data)
}

async function fetchQuestionBatches(subjectId, version, questionIds, options) {
	const found = new Map()
	const missing = new Set()
	for (let offset = 0; offset < questionIds.length; offset += MAX_BATCH_SIZE) {
		const batch = questionIds.slice(offset, offset + MAX_BATCH_SIZE)
		const data = await callQuestionBank('getQuestionsByIds', {
			subjectId,
			questionIds: batch
		}, options)
		if (data && data.version && data.version !== version) {
			return { versionChanged: true, version: data.version }
		}
		const items = data && Array.isArray(data.items) ? data.items : []
		cacheQuestions(subjectId, version, items)
		items.forEach(question => {
			found.set(question.questionId || question.id, question)
		})
		const missingIds = data && Array.isArray(data.missingQuestionIds)
			? data.missingQuestionIds
			: batch.filter(questionId => !found.has(questionId))
		missingIds.forEach(questionId => missing.add(questionId))
	}
	return { found, missing }
}

export async function getQuestionsByIds(params, options) {
	const input = requireObject(params, 'params')
	const subjectId = normalizeSubjectId(input.subjectId)
	const questionIds = normalizeQuestionIds(input.questionIds, 'questionIds', true)
	const catalog = await getQuestionCatalog(subjectId)
	const config = options || {}
	const found = new Map()
	const uncachedIds = []
	questionIds.forEach(questionId => {
		const cached = config.forceRefresh ? null : getBoundedCache(
			questionMemoryCache,
			questionCacheKey(subjectId, catalog.activeVersion, questionId)
		)
		if (cached) found.set(questionId, cached)
		else uncachedIds.push(questionId)
	})
	const missing = new Set()
	if (uncachedIds.length) {
		const fetched = await fetchQuestionBatches(
			subjectId,
			catalog.activeVersion,
			uncachedIds,
			config
		)
		if (fetched.versionChanged) {
			await syncCatalogVersion(subjectId, catalog.activeVersion, fetched.version)
			if (config.versionRetry) {
				throw new QuestionBankServiceError(
					'QUESTION_BANK_VERSION_CHANGED',
					'题库版本已更新，请重试'
				)
			}
			return getQuestionsByIds(params, Object.assign({}, config, {
				forceRefresh: true,
				versionRetry: true
			}))
		}
		fetched.found.forEach((question, questionId) => found.set(questionId, question))
		fetched.missing.forEach(questionId => missing.add(questionId))
	}
	const items = questionIds.map(questionId => found.get(questionId)).filter(Boolean)
	questionIds.forEach(questionId => {
		if (!found.has(questionId)) missing.add(questionId)
	})
	return {
		subjectId,
		version: catalog.activeVersion,
		requestedCount: questionIds.length,
		foundCount: items.length,
		missingQuestionIds: questionIds.filter(questionId => missing.has(questionId)),
		items: cloneValue(items)
	}
}

export async function checkQuestionAnswer(params, options) {
	const input = requireObject(params, 'params')
	const subjectId = normalizeSubjectId(input.subjectId)
	const questionId = normalizeQuestionId(input.questionId)
	const selected = normalizeSelected(input.selected)
	const catalog = await getQuestionCatalog(subjectId)
	const key = answerCacheKey(subjectId, catalog.activeVersion, questionId, selected)
	const config = options || {}
	if (!config.forceRefresh) {
		const cached = getBoundedCache(answerMemoryCache, key)
		if (cached) return cached
	}
	const data = await callQuestionBank('checkAnswer', {
		subjectId,
		questionId,
		selected
	}, config)
	setBoundedCache(answerMemoryCache, key, data, ANSWER_CACHE_TTL, MAX_ANSWER_CACHE_ENTRIES)
	return cloneValue(data)
}

export function clearQuestionBankCache(subjectId) {
	if (subjectId === undefined || subjectId === null || subjectId === '') {
		catalogMemoryCache.clear()
		pageMemoryCache.clear()
		questionMemoryCache.clear()
		answerMemoryCache.clear()
		clearPersistedChapterCache()
		persistedCatalogs = {}
		persistedCatalogsLoaded = true
		if (storageAvailable() && typeof uni.removeStorageSync === 'function') {
			try {
				uni.removeStorageSync(CATALOG_STORAGE_KEY)
			} catch (error) {
				// Cache cleanup should never block the UI.
			}
		}
		return
	}
	const normalizedSubjectId = normalizeSubjectId(subjectId)
	catalogMemoryCache.delete(normalizedSubjectId)
	clearSubjectMemory(normalizedSubjectId)
	clearPersistedChapterCache(normalizedSubjectId)
	loadPersistedCatalogs()
	delete persistedCatalogs[normalizedSubjectId]
	savePersistedCatalogs()
}

export function getCatalog(subjectId, options) {
	return getQuestionCatalog(subjectId, options)
}

export function searchQuestions(params, options) {
	return searchQuestionBank(params, options)
}

export function checkAnswer(params, options) {
	return checkQuestionAnswer(params, options)
}

const questionBankService = {
	getCatalog,
	getQuestionCatalog,
	getPracticePage,
	getAllPracticeQuestions,
	searchQuestions,
	searchQuestionBank,
	getQuestionsByIds,
	checkAnswer,
	checkQuestionAnswer,
	clearCache: clearQuestionBankCache
}

export default questionBankService
