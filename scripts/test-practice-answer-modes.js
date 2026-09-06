'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadComponent(environment, relativePath) {
	const filePath = path.resolve(
		__dirname,
		relativePath || '../practice-pages/practice/practice.vue'
	)
	const file = fs.readFileSync(filePath, 'utf8')
	const match = file.match(/<script>([\s\S]*?)<\/script>/)
	if (!match) throw new Error('practice.vue script block not found')
	const source = match[1]
		.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*$/gm, '')
		.replace(/\bexport\s+default\s+/, 'globalThis.__component = ')
	vm.createContext(environment)
	vm.runInContext(source, environment, { filename: filePath })
	return environment.__component
}

function createQuestion(id, type, answer) {
	return {
		id,
		questionId: id,
		subjectId: 'junior-personal-finance',
		chapterId: '1',
		chapter: '第一章',
		knowledge: '测试知识点',
		type,
		title: `题目${id}`,
		options: ['A', 'B', 'C'].map(alias => ({ alias, text: `选项${alias}` })),
		answer,
		explanation: '测试解析'
	}
}

async function run() {
	const recordCalls = []
	const navigationColors = []
	const navigationTitles = []
	const navigationUrls = []
	const switchTabUrls = []
	const tabBarStyles = []
	const modalOptions = []
	let flushCalls = 0
	let progressSaveCalls = 0
	let snapshotCalls = 0
	let chapterPositionCalls = 0
	let knowledgePositionCalls = 0
	let catalogCalls = 0
	let catalogSummaryCalls = 0
	let favoriteToggleCalls = 0
	let interstitialCreateCalls = 0
	let interstitialShowCalls = 0
	let interstitialDestroyCalls = 0
	let preferenceResponse = { answerMode: 'practice', nightMode: false }
	let practiceAnswers = {}
	const practiceProgressEvent = 'uni-learn-practice-progress-updated'
	const eventListeners = new Map()
	const emitEvent = (name, payload) => {
		const listeners = eventListeners.get(name) || []
		listeners.slice().forEach(listener => listener(payload))
	}
	const activeMembership = {
		isMember: true,
		status: 'active',
		expiresAt: new Date('2027-09-01T00:00:00.000Z').getTime(),
		entitlements: { adFree: true, practiceRecords: true, advancedAnswerModes: true },
		plans: []
	}
	let membershipResponse = activeMembership
	const environment = {
		FinanceCalculator: {},
		wx: {
			createInterstitialAd(options) {
				interstitialCreateCalls += 1
				assert.equal(options.adUnitId, 'adunit-4ea7a830fe0d7db2')
				return {
					onLoad() {},
					onError() {},
					onClose() {},
					show: async () => {
						interstitialShowCalls += 1
					},
					destroy() {
						interstitialDestroyCalls += 1
					}
				}
			}
		},
		PRACTICE_PROGRESS_UPDATED_EVENT: practiceProgressEvent,
		buildPracticeQuestions: async () => [],
		getAllPracticeQuestions: async () => ({ items: [] }),
		getPracticeState: () => ({
			currentSubjectId: 'junior-personal-finance',
			answers: practiceAnswers
		}),
		getChapterProgress: (subjectId, chapterId, total) => ({ attempted: 2, total, percent: 20 }),
		getSubjectById: subjectId => ({ id: subjectId, name: '测试科目' }),
		getSubjectStats: () => ({ attempted: 0, correct: 0, wrong: 0, favorite: 0, accuracy: 0 }),
		getTodayProgress: () => ({ attempts: 0, goal: 20, percent: 0 }),
		selectSubject: () => {},
		subjectGroups: [{
			level: '初级',
			items: [
				{ id: 'junior-law', name: '初级法规' },
				{ id: 'junior-personal-finance', name: '初级个人理财' },
				{ id: 'junior-risk', name: '初级风险管理' }
			]
		}],
		isCorrectAnswer: (selected, answer) => selected.slice().sort().join(',') === answer.slice().sort().join(','),
		isFavorite: () => false,
		recordAnswer(question, selected, options) {
			recordCalls.push({ question, selected: selected.slice(), options })
			const practiceMode = options && options.practiceMode
			const previous = practiceAnswers[question.id]
			const practiceModes = previous && Array.isArray(previous.practiceModes)
				? previous.practiceModes.slice()
				: []
			if (practiceMode && practiceModes.indexOf(practiceMode) === -1) {
				practiceModes.push(practiceMode)
			}
			practiceAnswers[question.id] = {
				subjectId: question.subjectId,
				chapterId: question.chapterId,
				knowledge: question.knowledge,
				practiceModes,
				selected: selected.slice(),
				attempts: previous ? previous.attempts + 1 : 1
			}
			if (practiceMode === 'chapter' || practiceMode === 'knowledge') {
				emitEvent(practiceProgressEvent, {
					subjectId: question.subjectId,
					mode: practiceMode,
					chapterId: question.chapterId,
					knowledge: question.knowledge,
					questionId: question.id
				})
			}
			return selected.slice().sort().join(',') === question.answer.slice().sort().join(',')
		},
		toggleFavorite: () => {
			favoriteToggleCalls += 1
			return true
		},
		flushPracticeEvents: async () => {
			flushCalls += 1
			return { synced: true }
		},
			getLocalPracticePreferences: () => preferenceResponse,
			getPracticePreferences: async () => preferenceResponse,
			getCachedPracticeSummary: () => null,
		getCachedMembership: () => membershipResponse,
		getMembership: async () => membershipResponse,
		updatePracticePreferences: async preferences => {
			preferenceResponse = Object.assign({}, preferences, { updatedAt: Date.now() })
			return preferenceResponse
		},
		getChapterPracticePosition: () => {
			chapterPositionCalls += 1
			return { questionId: 'saved-chapter-question' }
		},
		getKnowledgeScopeKey: (chapterId, knowledge) => chapterId && knowledge
			? `${chapterId}|${knowledge}`
			: '',
		getKnowledgePracticePosition: () => {
			knowledgePositionCalls += 1
			return { questionId: 'saved-knowledge-question' }
		},
		getPracticeStateSnapshot: async () => {
			snapshotCalls += 1
			return {
				chapterAttempts: { '1': 4 },
				knowledgeAttempts: { '1|测试知识点': 3 },
				progressPositions: {
					chapter: { '1': 'cloud-chapter-question' },
					knowledge: { '1|测试知识点': 'cloud-knowledge-question' }
				}
			}
		},
		getPracticeSummary: async () => ({ attempted: 0, todayAttempts: 0 }),
		getPracticeRecords: async input => ({
			subjectId: input.subjectId,
			type: input.type,
			page: input.page,
			pageSize: input.pageSize,
			total: 1,
			hasMore: false,
			_localOnly: true,
			items: [{
				recordId: `${input.type}-local-record`,
				question: { id: 'local-record' },
				correct: false,
				timestamp: Date.now()
			}]
		}),
		getQuestionsByIds: async () => ({
			items: [{
				id: 'local-record',
				title: '本地错题',
				knowledge: '本地记录'
			}]
		}),
		getCatalog: async () => {
			catalogCalls += 1
			return {
				name: '测试科目',
				questionCount: 10,
				chapters: [{ id: '1', name: '第一章', count: 10 }],
				knowledgeGroups: [{ chapterId: '1', chapter: '第一章', name: '测试知识点', count: 5 }]
			}
		},
		getCatalogSummaries: async () => {
			catalogSummaryCalls += 1
			return [{
				subjectId: 'junior-law',
				activeVersion: '2026-09-01',
				questionCount: 1250
			}, {
				subjectId: 'junior-personal-finance',
				activeVersion: '2026-08-21',
				questionCount: 822
			}]
		},
		savePracticeProgress: () => {
			progressSaveCalls += 1
			return null
		},
		uni: {
			$on: (name, listener) => {
				const listeners = eventListeners.get(name) || []
				listeners.push(listener)
				eventListeners.set(name, listeners)
			},
			$off: (name, listener) => {
				const listeners = eventListeners.get(name) || []
				eventListeners.set(name, listeners.filter(item => item !== listener))
			},
			$emit: emitEvent,
			getSystemInfoSync: () => ({ windowWidth: 375 }),
			setNavigationBarColor: options => navigationColors.push(options),
			setNavigationBarTitle: options => navigationTitles.push(options.title),
			setTabBarStyle: options => tabBarStyles.push(options),
			navigateTo: options => navigationUrls.push(options.url),
			switchTab: options => switchTabUrls.push(options.url),
			navigateBack: () => {},
			showModal: options => modalOptions.push(options),
			showToast: () => {}
		},
		console,
		setTimeout,
		clearTimeout,
		Date,
		Map,
		Set,
		Promise,
		Math,
		JSON,
		Error,
		Array,
		Object,
		Number,
		String,
		Boolean
	}
	const component = loadComponent(environment)

	function createContext(answerMode, questions) {
		const context = Object.assign(component.data(), component.methods, {
			answerMode,
			questionList: questions,
			favoriteQuestionIds: [],
			practiceConfig: { chapterId: '1', knowledge: '' },
			mode: 'sequence'
		})
		context.$set = (target, key, value) => { target[key] = value }
		context.$delete = (target, key) => { delete target[key] }
		context.$nextTick = handler => handler()
		Object.keys(component.computed).forEach(key => {
			Object.defineProperty(context, key, {
				configurable: true,
				get: () => component.computed[key].call(context)
			})
		})
		return context
	}

	function getCurrentSlide(context) {
		return context.visibleSlides.find(slide => slide.offset === 0)
	}

	const single = createQuestion('single-1', 'single', ['A'])
	const practice = createContext('practice', [single])
	practice.loadQuestion(0)
	practice.chooseOption('A')
	assert.equal(recordCalls.length, 1)
	assert.equal(recordCalls[0].options.practiceMode, 'sequence')
	assert.equal(practice.sessionAnswers[single.id].correct, true)
	assert.equal(practice.visibleSlides[1].revealed, true)
	assert.match(practice.answerNumberClass(0), /(?:^|\s)answered(?:\s|$)/)
	const freshSession = createContext('practice', [single])
	freshSession.sessionAnswers[single.id] = { selected: ['A'], correct: true }
	freshSession.resetSessionAnswers()
	assert.deepEqual(JSON.parse(JSON.stringify(freshSession.sessionAnswers)), {})

	const multiple = createQuestion('multiple-1', 'multiple', ['A', 'B'])
	const multiplePractice = createContext('practice', [multiple])
	multiplePractice.loadQuestion(0)
	multiplePractice.chooseOption('A')
	multiplePractice.chooseOption('B')
	assert.deepEqual(Array.from(multiplePractice.draftAnswers[multiple.id]), ['A', 'B'])
	assert.equal(multiplePractice.sessionAnswers[multiple.id], undefined)
	multiplePractice.confirmCurrentAnswer()
	assert.equal(multiplePractice.sessionAnswers[multiple.id].correct, true)

	const following = createQuestion('single-2', 'single', ['B'])
	const incompletePractice = createContext('practice', [single, multiple, following])
	incompletePractice.currentIndex = 2
	incompletePractice.sessionAnswers = {
		[following.id]: { selected: ['B'], correct: true }
	}
	incompletePractice.correctCount = 1
	let continuedAt = -1
	incompletePractice.animateToQuestion = index => { continuedAt = index }
	incompletePractice.nextQuestion()
	const incompleteModal = modalOptions.slice(-1)[0]
	assert.equal(incompleteModal.showCancel, true)
	assert.equal(incompleteModal.cancelText, '继续答题')
	assert.equal(incompleteModal.confirmText, '返回首页')
	assert.match(incompleteModal.content, /未答 2 题/)
	incompleteModal.success({ confirm: false, cancel: true })
	assert.equal(continuedAt, 0)

	const completedPractice = createContext('practice', [single, following])
	completedPractice.currentIndex = 1
	completedPractice.sessionAnswers = {
		[single.id]: { selected: ['A'], correct: true },
		[following.id]: { selected: ['B'], correct: true }
	}
	completedPractice.correctCount = 2
	completedPractice.nextQuestion()
	assert.equal(modalOptions.slice(-1)[0].showCancel, false)

	const swipe = createContext('practice', [single, multiple, following])
	swipe.loadQuestion(0)
	swipe.animateToQuestion(1)
	assert.equal(swipe.swiperCurrent, 2)
	assert.equal(swipe.swiperSettledSlot, 1)
	assert.equal(swipe.currentIndex, 0)
	assert.equal(swipe.visibleSlides[2].question.id, multiple.id)
	swipe.handleSwiperChange({ detail: { current: 2 } })
	swipe.handleSwiperAnimationFinish({ detail: { current: 2 } })
	assert.equal(swipe.currentIndex, 1)
	assert.equal(swipe.swiperCurrent, 2)
	assert.equal(swipe.swiperSettledSlot, 2)
	assert.equal(getCurrentSlide(swipe).question.id, multiple.id)
	assert.equal(swipe.visibleSlides[0].question.id, following.id)

	// 考试模式的章节/知识点入口始终从第一题开始，即使链接残留续做参数。
	const examChapterResume = createContext('exam', [single, multiple, following])
	examChapterResume.mode = 'chapter'
	examChapterResume.practiceConfig = {
		chapterId: '1',
		knowledge: '',
		startId: following.id,
		startNumber: 2
	}
	assert.equal(examChapterResume.resolveInitialQuestionIndex(), 0)
	examChapterResume.mode = 'knowledge'
	assert.equal(examChapterResume.resolveInitialQuestionIndex(), 0)
	examChapterResume.mode = 'wrong'
	assert.equal(examChapterResume.resolveInitialQuestionIndex(), 2)

	const practiceChapterResume = createContext('practice', [single, multiple, following])
	practiceChapterResume.mode = 'chapter'
	practiceChapterResume.practiceConfig = {
		chapterId: '1',
		knowledge: '',
		startId: following.id,
		startNumber: 2
	}
	assert.equal(practiceChapterResume.resolveInitialQuestionIndex(), 2)

	const reviewKnowledgeResume = createContext('review', [single, multiple, following])
	reviewKnowledgeResume.mode = 'knowledge'
	reviewKnowledgeResume.practiceConfig = {
		chapterId: '',
		knowledge: '测试知识点',
		startId: '',
		startNumber: 2
	}
	assert.equal(reviewKnowledgeResume.resolveInitialQuestionIndex(), 1)
	assert.equal(swipe.swipeAnimating, false)
	assert.equal(swipe.swiperTouchDisabled, false)

	// 连续前进时物理槽位 1 -> 2 -> 0 循环，逻辑题号在动画结束时立即同步。
	swipe.animateToQuestion(2)
	assert.equal(swipe.swiperCurrent, 0)
	assert.equal(swipe.swiperSettledSlot, 2)
	assert.equal(swipe.visibleSlides[0].question.id, following.id)
	swipe.handleSwiperChange({ detail: { current: 0 } })
	swipe.handleSwiperAnimationFinish({ detail: { current: 0 } })
	assert.equal(swipe.currentIndex, 2)
	assert.equal(swipe.swiperSettledSlot, 0)
	assert.equal(getCurrentSlide(swipe).question.id, following.id)
	assert.equal(swipe.swipeAnimating, false)

	// 后退复用相邻物理槽位，不需要无动画复位到中间页。
	swipe.animateToQuestion(1)
	assert.equal(swipe.swiperCurrent, 2)
	swipe.handleSwiperChange({ detail: { current: 2 } })
	swipe.handleSwiperAnimationFinish({ detail: { current: 2 } })
	assert.equal(swipe.currentIndex, 1)
	assert.equal(swipe.swiperSettledSlot, 2)
	assert.equal(getCurrentSlide(swipe).question.id, multiple.id)
	assert.equal(swipe.visibleSlides[1].question.id, single.id)
	assert.equal(swipe.visibleSlides[0].question.id, following.id)

	const unanswered = createQuestion('single-3', 'single', ['C'])
	const exam = createContext('exam', [single, multiple, following, unanswered])
	const callsBeforeExam = recordCalls.length
	const flushesBeforeExam = flushCalls
	const progressSavesBeforeExam = progressSaveCalls
	exam.mode = 'chapter'
	exam.loadQuestion(0)
	exam.chooseOption('A')
	assert.equal(recordCalls.length, callsBeforeExam)
	assert.equal(exam.visibleSlides[1].revealed, false)
	assert.match(exam.answerNumberClass(0), /(?:^|\s)answered(?:\s|$)/)
	exam.loadQuestion(1)
	exam.chooseOption('A')
	exam.loadQuestion(2)
	exam.chooseOption('A')
	exam.finalizeExam()
	assert.equal(recordCalls.length, callsBeforeExam)
	assert.equal(flushCalls, flushesBeforeExam)
	assert.equal(progressSaveCalls, progressSavesBeforeExam)
	assert.equal(exam.examSubmitted, true)
	assert.equal(exam.showExamResult, true)
	assert.equal(exam.examResult.chapterName, '第一章')
	assert.equal(exam.examResult.correctCount, 1)
	assert.equal(exam.examResult.wrongCount, 2)
	assert.equal(exam.examResult.partialCount, 1)
	assert.equal(exam.examResult.answeredCount, 3)
	assert.equal(exam.examResult.unansweredCount, 1)
	assert.equal(exam.examResult.totalCount, 4)
	assert.equal(exam.examResult.accuracyText, '33.33')
	assert.equal(exam.sessionAnswers[multiple.id].partial, true)
	assert.equal(exam.visibleSlides[1].revealed, true)
	assert.equal(exam.visibleSlides[1].submitted, true)
	assert.equal(exam.correctCount, 1)
	assert.equal(exam.wrongCount, 2)
	assert.equal(navigationTitles.slice(-1)[0], '测试结果')
	exam.progressSavedOnLeave = false
	exam.syncCurrentProgress()
	assert.equal(flushCalls, flushesBeforeExam)
	assert.equal(progressSaveCalls, progressSavesBeforeExam)

	const shareOptions = component.onShareAppMessage.call(exam)
	assert.match(shareOptions.title, /正确率 33\.33%/)
	assert.match(shareOptions.path, /^\/practice-pages\/practice\/practice\?sharedResult=/)
	const sharedPayload = shareOptions.path.split('sharedResult=')[1]
	const sharedResult = createContext('practice', [])
	assert.equal(sharedResult.openSharedExamResult(sharedPayload), true)
	assert.equal(sharedResult.isSharedExamResult, true)
	assert.equal(sharedResult.answerMode, 'exam')
	assert.equal(sharedResult.showExamResult, true)
	assert.equal(sharedResult.examResult.chapterName, '第一章')
	assert.equal(sharedResult.examResult.correctCount, 1)
	assert.equal(sharedResult.examResult.wrongCount, 2)
	assert.equal(sharedResult.examResult.unansweredCount, 1)
	assert.equal(sharedResult.examResult.totalCount, 4)
	assert.equal(sharedResult.examResult.accuracyText, '33.33')
	assert.equal(sharedResult.parseSharedExamResult(decodeURIComponent(sharedPayload)).totalCount, 4)
	const flushesBeforeSharedResult = flushCalls
	sharedResult.progressSavedOnLeave = false
	sharedResult.syncCurrentProgress()
	assert.equal(flushCalls, flushesBeforeSharedResult)
	sharedResult.goToPracticeHome()
	assert.equal(switchTabUrls.slice(-1)[0], '/pages/exam/exam')

	const invalidSharedResult = createContext('practice', [])
	assert.equal(invalidSharedResult.openSharedExamResult('%7Bbad'), false)
	assert.equal(invalidSharedResult.loadError, '分享的考试结果无效或已损坏')

	exam.restartExam()
	assert.equal(exam.showExamResult, false)
	assert.equal(exam.examResult, null)
	assert.equal(exam.examSubmitted, false)
	assert.deepEqual(JSON.parse(JSON.stringify(exam.draftAnswers)), {})
	assert.deepEqual(JSON.parse(JSON.stringify(exam.sessionAnswers)), {})
	assert.equal(exam.currentIndex, 0)

	const review = createContext('review', [single])
	const callsBeforeReview = recordCalls.length
	review.loadQuestion(0)
	review.chooseOption('B')
	assert.equal(recordCalls.length, callsBeforeReview)
	assert.equal(review.visibleSlides[1].revealed, true)
	assert.deepEqual(Array.from(review.visibleSlides[1].selected), [])
	assert.equal(review.answeredCount, 1)
	assert.match(review.answerNumberClass(0), /(?:^|\s)answered(?:\s|$)/)

	const answerSheetExam = createContext('exam', [single])
	let answerSheetCloseCalls = 0
	answerSheetExam.$refs = {
		answerSheet: {
			close() {
				answerSheetCloseCalls += 1
			}
		}
	}
	answerSheetExam.loadQuestion(0)
	answerSheetExam.chooseOption('A')
	answerSheetExam.submitExam()
	assert.equal(modalOptions.slice(-1)[0].confirmText, '确认交卷')
	modalOptions.slice(-1)[0].success({ confirm: true })
	assert.equal(answerSheetCloseCalls, 1)
	assert.equal(answerSheetExam.showExamResult, true)

	const chapterComponent = loadComponent(environment, '../practice-pages/chapter/chapter.vue')
	const memberChapterList = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		view: 'chapter',
		pageActive: true
	})
	membershipResponse = activeMembership
	await memberChapterList.showChapterInterstitialAd()
	assert.equal(interstitialCreateCalls, 0)

	const freeChapterList = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		view: 'chapter',
		pageActive: true
	})
	membershipResponse = {
		isMember: false,
		status: 'inactive',
		expiresAt: 0,
		entitlements: { adFree: false }
	}
	await freeChapterList.showChapterInterstitialAd()
	assert.equal(interstitialCreateCalls, 1)
	assert.equal(interstitialShowCalls, 1)
	freeChapterList.destroyChapterInterstitialAd()
	assert.equal(interstitialDestroyCalls, 1)
	const freeKnowledgeList = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		view: 'knowledge',
		pageActive: true
	})
	await freeKnowledgeList.showChapterInterstitialAd()
	assert.equal(interstitialCreateCalls, 1)
	assert.equal(interstitialShowCalls, 1)
	assert.equal(freeKnowledgeList.shouldShowKnowledgeAd(9), false)
	await freeKnowledgeList.refreshMembership()
	assert.equal(freeKnowledgeList.membershipLoaded, true)
	assert.equal(freeKnowledgeList.shouldShowKnowledgeAd(8), false)
	assert.equal(freeKnowledgeList.shouldShowKnowledgeAd(9), true)
	assert.equal(freeKnowledgeList.shouldShowKnowledgeAd(29), true)
	assert.equal(freeKnowledgeList.shouldShowKnowledgeAd(30), false)
	freeKnowledgeList.hiddenKnowledgeAdPositions = { 10: true }
	assert.equal(freeKnowledgeList.shouldShowKnowledgeAd(9), false)

	const memberKnowledgeList = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		view: 'knowledge',
		membershipLoaded: true,
		membership: activeMembership
	})
	assert.equal(memberKnowledgeList.shouldShowKnowledgeAd(9), false)
	assert.equal(memberKnowledgeList.shouldShowKnowledgeAd(29), false)
	membershipResponse = activeMembership
	const catalogItem = {
		id: '1',
		name: '第一章',
		count: 10,
		progress: {
			attempted: 4,
			total: 10,
			percent: 40,
			positionQuestionId: 'cloud-chapter-question'
		}
	}
	const chapterExam = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		subjectId: 'junior-personal-finance',
		view: 'chapter',
		answerMode: 'exam'
	})
	const snapshotsBeforeExamCatalog = snapshotCalls
	await chapterExam.loadItems()
	assert.equal(snapshotCalls, snapshotsBeforeExamCatalog)
	assert.equal(chapterExam.items[0].progress.attempted, 0)
	assert.equal(chapterExam.items[0].progress.positionQuestionId, '')
	const chapterCallsBeforeExam = chapterPositionCalls
	chapterExam.startItem(catalogItem)
	assert.equal(chapterPositionCalls, chapterCallsBeforeExam)
	assert.equal(navigationUrls.slice(-1)[0], '/practice-pages/practice/practice?subjectId=junior-personal-finance&mode=chapter&chapterId=1')

	const knowledgeExam = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		subjectId: 'junior-personal-finance',
		view: 'knowledge',
		answerMode: 'exam'
	})
	await knowledgeExam.loadItems()
	assert.equal(knowledgeExam.items[0].progress.attempted, 0)
	const knowledgeCallsBeforeExam = knowledgePositionCalls
	knowledgeExam.startItem(knowledgeExam.items[0])
	assert.equal(knowledgePositionCalls, knowledgeCallsBeforeExam)
	assert.equal(navigationUrls.slice(-1)[0], '/practice-pages/practice/practice?subjectId=junior-personal-finance&mode=knowledge&chapterId=1&knowledge=%E6%B5%8B%E8%AF%95%E7%9F%A5%E8%AF%86%E7%82%B9')

	const chapterPractice = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		subjectId: 'junior-personal-finance',
		view: 'chapter',
		answerMode: 'practice'
	})
	chapterPractice.startItem(catalogItem)
	assert.match(navigationUrls.slice(-1)[0], /startId=saved-chapter-question/)

	const knowledgeReview = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		subjectId: 'junior-personal-finance',
		view: 'knowledge',
		answerMode: 'review'
	})
		knowledgeReview.startItem({
			chapterId: '1',
			name: '测试知识点',
		progress: catalogItem.progress
	})
	assert.match(navigationUrls.slice(-1)[0], /startId=saved-knowledge-question/)

	// Returning from a knowledge session must refresh local progress without
	// reloading the catalog or requesting another cloud snapshot.
	preferenceResponse = { answerMode: 'practice', nightMode: false }
	const knowledgePractice = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		subjectId: 'junior-personal-finance',
		view: 'knowledge',
			items: [{
				chapterId: '1',
				name: '测试知识点',
			count: 5,
			progress: { attempted: 0, total: 5, percent: 0, positionQuestionId: '' }
		}]
	})
	const knowledgeAnswer = {
		subjectId: knowledgePractice.subjectId,
		chapterId: '1',
		knowledge: '测试知识点',
		practiceModes: ['knowledge'],
		selected: ['A'],
		attempts: 2
	}
	practiceAnswers = {
		'knowledge-one': knowledgeAnswer,
		'chapter-only': { ...knowledgeAnswer, practiceModes: ['chapter'] },
		'other-subject': { ...knowledgeAnswer, subjectId: 'junior-law' },
		'other-knowledge': { ...knowledgeAnswer, knowledge: '另一个知识点' }
	}
	const snapshotsBeforeReturn = snapshotCalls
	const catalogsBeforeReturn = catalogCalls
	chapterComponent.onShow.call(knowledgePractice)
	assert.equal(knowledgePractice.items[0].progress.attempted, 1)
	assert.equal(knowledgePractice.items[0].progress.percent, 20)
	assert.equal(knowledgePractice.items[0].progress.total, 5)
	chapterComponent.onShow.call(knowledgePractice)
	assert.equal(knowledgePractice.items[0].progress.attempted, 1)
	practiceAnswers['knowledge-two'] = { ...knowledgeAnswer }
	chapterComponent.onShow.call(knowledgePractice)
	assert.equal(knowledgePractice.items[0].progress.attempted, 2)
	assert.equal(knowledgePractice.items[0].progress.percent, 40)
	knowledgePractice.startItem(knowledgePractice.items[0])
	assert.match(navigationUrls.slice(-1)[0], /startId=saved-knowledge-question/)
	// A member's larger cloud progress must survive a local-only refresh.
	knowledgePractice.items[0].progress = {
		attempted: 4, total: 5, percent: 80, positionQuestionId: 'cloud-knowledge-question'
	}
	chapterComponent.onShow.call(knowledgePractice)
	assert.equal(knowledgePractice.items[0].progress.attempted, 4)
	assert.equal(knowledgePractice.items[0].progress.percent, 80)
	assert.equal(knowledgePractice.items[0].progress.positionQuestionId, 'cloud-knowledge-question')
	assert.equal(snapshotCalls, snapshotsBeforeReturn)
	assert.equal(catalogCalls, catalogsBeforeReturn)
	const duplicateNameCatalog = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		subjectId: 'junior-law',
		view: 'knowledge',
		items: [{
			chapterId: '5',
			name: '相关管理要求',
			progress: { attempted: 0, total: 2, percent: 0, positionQuestionId: '' }
		}, {
			chapterId: '6',
			name: '相关管理要求',
			progress: { attempted: 0, total: 2, percent: 0, positionQuestionId: '' }
		}]
	})
	practiceAnswers = {
		'law-five': {
			subjectId: 'junior-law', chapterId: '5', knowledge: '相关管理要求', practiceModes: ['knowledge']
		},
		'law-six': {
			subjectId: 'junior-law', chapterId: '6', knowledge: '相关管理要求', practiceModes: ['knowledge']
		}
	}
	chapterComponent.onShow.call(duplicateNameCatalog)
	assert.equal(duplicateNameCatalog.items[0].progress.attempted, 1)
	assert.equal(duplicateNameCatalog.items[1].progress.attempted, 1)

	// The hidden knowledge catalog receives the local answer notification before
	// navigateBack/onShow ordering can affect what the user sees.
	practiceAnswers = {}
	const liveKnowledgeCatalog = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		items: [{
			chapterId: '1',
			name: '测试知识点',
			count: 5,
			progress: { attempted: 0, total: 5, percent: 0, positionQuestionId: '' }
		}],
		loadItems: () => {}
	})
	chapterComponent.onLoad.call(liveKnowledgeCatalog, {
		subjectId: 'junior-personal-finance',
		view: 'knowledge'
	})
	const liveKnowledgeSession = createContext('practice', [createQuestion('knowledge-live', 'single', ['A'])])
	liveKnowledgeSession.mode = 'knowledge'
	liveKnowledgeSession.practiceConfig = {
		chapterId: '1',
		knowledge: '测试知识点'
	}
	liveKnowledgeSession.loadQuestion(0)
	liveKnowledgeSession.chooseOption('A')
	assert.equal(liveKnowledgeCatalog.items[0].progress.attempted, 1)
	assert.equal(liveKnowledgeCatalog.items[0].progress.percent, 20)
	assert.equal((eventListeners.get(practiceProgressEvent) || []).length, 1)
	chapterComponent.onUnload.call(liveKnowledgeCatalog)
	assert.equal((eventListeners.get(practiceProgressEvent) || []).length, 0)

	preferenceResponse = { answerMode: 'exam', nightMode: false }
	chapterComponent.onShow.call(knowledgeExam)
	assert.equal(knowledgeExam.items[0].progress.attempted, 0)
	practiceAnswers = {}

	preferenceResponse = { answerMode: 'review', nightMode: true }
	await review.loadAnswerPreferences()
	assert.equal(review.answerMode, 'review')
	assert.equal(review.nightMode, true)
	assert.deepEqual(JSON.parse(JSON.stringify(navigationColors.slice(-1)[0])), {
		frontColor: '#ffffff',
		backgroundColor: '#171c22'
	})

	const chapterTheme = Object.assign(chapterComponent.data(), chapterComponent.methods, {
		items: []
	})
	chapterComponent.onShow.call(chapterTheme)
	assert.equal(chapterTheme.nightMode, true)
	assert.deepEqual(JSON.parse(JSON.stringify(navigationColors.slice(-1)[0])), {
		frontColor: '#ffffff',
		backgroundColor: '#171c22'
	})

	const recordsComponent = loadComponent(
		environment,
		'../practice-pages/practice-records/practice-records.vue'
	)
	let recordsLoadCalls = 0
	const recordsTheme = Object.assign(recordsComponent.data(), recordsComponent.methods, {
		loadRecords() {
			recordsLoadCalls += 1
		}
	})
	recordsComponent.onShow.call(recordsTheme)
	assert.equal(recordsTheme.nightMode, true)
	assert.equal(recordsLoadCalls, 1)
	const freeRecords = Object.assign(recordsComponent.data(), recordsComponent.methods, {
		subjectId: 'junior-personal-finance',
		activeView: 'wrong'
	})
	await freeRecords.loadRecords()
	assert.equal(freeRecords.total, 1)
	assert.equal(freeRecords.records[0].question.title, '本地错题')
	assert.equal(freeRecords.loadError, '')
	assert.deepEqual(JSON.parse(JSON.stringify(navigationColors.slice(-1)[0])), {
		frontColor: '#ffffff',
		backgroundColor: '#171c22'
	})

	const settingsComponent = loadComponent(
		environment,
		'../practice-pages/answer-settings/answer-settings.vue'
	)
	const settings = Object.assign(settingsComponent.data(), settingsComponent.methods)
	assert.equal(settingsComponent.computed.showAds.call(settings), false)
	settings.membershipLoaded = true
	settings.membership = activeMembership
	assert.equal(settingsComponent.computed.showAds.call(settings), false)
	settings.membership = {
		isMember: false,
		status: 'inactive',
		entitlements: { adFree: false }
	}
	assert.equal(settingsComponent.computed.showAds.call(settings), true)
	settings.membership = activeMembership
	settings.applyPreferences({ answerMode: 'practice', nightMode: false })
	await settings.persistPreferences({ answerMode: 'exam' })
	assert.equal(settings.answerMode, 'exam')
	assert.equal(preferenceResponse.answerMode, 'exam')
	await settings.persistPreferences({ nightMode: true })
	assert.equal(settings.nightMode, true)
	assert.equal(preferenceResponse.nightMode, true)
	assert.deepEqual(JSON.parse(JSON.stringify(navigationColors.slice(-1)[0])), {
		frontColor: '#ffffff',
		backgroundColor: '#171c22'
	})

	const homeComponent = loadComponent(environment, '../pages/exam/exam.vue')
	const home = Object.assign(homeComponent.data(), homeComponent.methods, {
		currentSubjectId: 'junior-personal-finance',
		$refs: {
			subjectPopup: {
				open() {},
				close() {}
			}
		}
	})
	const catalogCallsBeforeHomeShow = catalogCalls
	const summaryCallsBeforeHomeShow = catalogSummaryCalls
	await homeComponent.onShow.call(home)
	assert.equal(catalogCalls, catalogCallsBeforeHomeShow + 1)
	assert.equal(catalogSummaryCalls, summaryCallsBeforeHomeShow)
	assert.equal(home.stats.total, 10)
	await home.openSubjectPicker()
	assert.equal(catalogSummaryCalls, 1)
	assert.equal(home.subjectCatalogStatusText('junior-law'), '1250题')
	assert.equal(home.subjectCatalogStatusText('junior-personal-finance'), '822题')
	assert.equal(home.subjectCatalogStatusText('junior-risk'), '待导入')
	await home.refreshNightMode()
	assert.equal(home.nightMode, true)
	assert.deepEqual(JSON.parse(JSON.stringify(tabBarStyles.slice(-1)[0])), {
		color: '#8f99a5',
		selectedColor: '#008cff',
		backgroundColor: '#171c22',
		borderStyle: 'black'
	})
	home.applyTabBarTheme(false)
	assert.equal(tabBarStyles.slice(-1)[0].backgroundColor, '#ffffff')

	membershipResponse = {
		isMember: false,
		status: 'inactive',
		expiresAt: 0,
		entitlements: { adFree: false, practiceRecords: true, advancedAnswerModes: true },
		plans: []
	}
	home.stats = Object.assign({}, home.stats, { wrong: 7, favorite: 3 })
	assert.equal(home.featureCount('wrong'), 7)
	assert.equal(home.featureCount('favorite'), 3)
	await home.handleFeature(home.features.find(item => item.key === 'wrong'))
	assert.equal(navigationUrls.slice(-1)[0], '/practice-pages/practice-records/practice-records?subjectId=junior-personal-finance&view=wrong')
	await home.handleFeature(home.features.find(item => item.key === 'favorite'))
	assert.equal(navigationUrls.slice(-1)[0], '/practice-pages/practice-records/practice-records?subjectId=junior-personal-finance&view=favorite')
	const freePractice = createContext('practice', [single])
	freePractice.membershipLoaded = true
	assert.equal(freePractice.showAds, true)
	freePractice.currentIndex = 0
	freePractice.loadQuestion(0)
	const recordsBeforeLockedWrongAnswer = recordCalls.length
	freePractice.chooseOption('B')
	assert.equal(recordCalls.length, recordsBeforeLockedWrongAnswer + 1)
	assert.equal(freePractice.sessionAnswers[single.id].correct, false)
	const togglesBeforeLockedFavorite = favoriteToggleCalls
	await freePractice.favoriteCurrent()
	assert.equal(favoriteToggleCalls, togglesBeforeLockedFavorite + 1)
	freePractice.mode = 'wrong'
	await freePractice.initializePractice()
	assert.equal(freePractice.loadError, '')

	const freeSettings = Object.assign(settingsComponent.data(), settingsComponent.methods)
	freeSettings.answerMode = 'practice'
	freeSettings.saving = false
	await freeSettings.selectAnswerMode('exam')
	assert.equal(freeSettings.answerMode, 'exam')
	await freeSettings.selectAnswerMode('review')
	assert.equal(freeSettings.answerMode, 'review')

	const pagesConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../pages.json'), 'utf8'))
	assert.equal(pagesConfig.pages.some(page => page.path === 'pages/privacy/privacy'), false)
	const aboutPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/about/about.vue'), 'utf8')
	const membershipEntry = aboutPageSource.match(/<uni-list-item[\s\S]*?title="会员中心"[\s\S]*?\/>/)
	assert.ok(membershipEntry, '个人中心应包含会员中心入口')
	assert.match(membershipEntry[0], /\bto="\/pages\/membership\/membership"/)
	assert.doesNotMatch(aboutPageSource, /getPracticeUserProfile|getUserProfile|loadAccount/)
	assert.match(aboutPageSource, /做题数据仅保存在本机/)
	assert.match(aboutPageSource, /做题数据已开启云同步/)
	const membershipPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/membership/membership.vue'), 'utf8')
	assert.doesNotMatch(membershipPageSource, /支付后权益未到账|class="notice-card"/)
	assert.doesNotMatch(membershipPageSource, /错题集与收藏夹|考试模式与背题模式/)
	assert.match(membershipPageSource, /云端学习数据同步/)
	assert.match(membershipPageSource, /同一微信账号跨设备登录，答题记录与学习进度自动同步/)
	const settingsPageSource = fs.readFileSync(path.resolve(__dirname, '../practice-pages/answer-settings/answer-settings.vue'), 'utf8')
	assert.match(settingsPageSource, /unit-id="adunit-a5cd0c36c24ffd76"/)
	assert.match(settingsPageSource, /v-if="showAds"/)
	const searchComponent = loadComponent(
		environment,
		'../practice-pages/question-search/question-search.vue'
	)
	const searchPage = Object.assign(searchComponent.data(), searchComponent.methods)
	assert.equal(searchComponent.computed.showAds.call(searchPage), false)
	searchPage.membershipLoaded = true
	searchPage.membership = activeMembership
	assert.equal(searchComponent.computed.showAds.call(searchPage), false)
	searchPage.membership = {
		isMember: false,
		status: 'inactive',
		entitlements: { adFree: false }
	}
	assert.equal(searchComponent.computed.showAds.call(searchPage), true)
	const searchPageSource = fs.readFileSync(path.resolve(__dirname, '../practice-pages/question-search/question-search.vue'), 'utf8')
	assert.match(searchPageSource, /unit-id="adunit-482241fd0b438f17"/)
	assert.match(searchPageSource, /v-if="showAds"/)
	const chapterPageSource = fs.readFileSync(path.resolve(__dirname, '../practice-pages/chapter/chapter.vue'), 'utf8')
	assert.match(chapterPageSource, /unit-id="adunit-e55002bf7256a6bb"/)
	assert.match(chapterPageSource, /position === 10 \|\| position === 30/)

	console.log('practice answer mode tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
