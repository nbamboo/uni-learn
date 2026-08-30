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
	const tabBarStyles = []
	let preferenceResponse = { answerMode: 'practice', nightMode: false }
	const environment = {
		FinanceCalculator: {},
		buildPracticeQuestions: async () => [],
		getAllPracticeQuestions: async () => ({ items: [] }),
		getPracticeState: () => ({ answers: {} }),
		getSubjectById: subjectId => ({ id: subjectId, name: '测试科目' }),
		getSubjectStats: () => ({ attempted: 0, correct: 0, wrong: 0, favorite: 0, accuracy: 0 }),
		getTodayProgress: () => ({ attempts: 0, goal: 20, percent: 0 }),
		selectSubject: () => {},
		subjectGroups: [],
		isCorrectAnswer: (selected, answer) => selected.slice().sort().join(',') === answer.slice().sort().join(','),
		isFavorite: () => false,
		recordAnswer(question, selected) {
			recordCalls.push({ question, selected: selected.slice() })
			return selected.slice().sort().join(',') === question.answer.slice().sort().join(',')
		},
		toggleFavorite: () => true,
		flushPracticeEvents: async () => ({ synced: true }),
		getLocalPracticePreferences: () => ({ answerMode: 'practice', nightMode: false }),
		getPracticePreferences: async () => preferenceResponse,
		updatePracticePreferences: async preferences => {
			preferenceResponse = Object.assign({}, preferences, { updatedAt: Date.now() })
			return preferenceResponse
		},
		getPracticeStateSnapshot: async () => ({}),
		getPracticeSummary: async () => ({ attempted: 0, todayAttempts: 0 }),
		getCatalog: async () => ({ questionCount: 0 }),
		savePracticeProgress: () => null,
		uni: {
			getSystemInfoSync: () => ({ windowWidth: 375 }),
			setNavigationBarColor: options => navigationColors.push(options),
			setTabBarStyle: options => tabBarStyles.push(options),
			showModal: () => {},
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
	assert.equal(practice.sessionAnswers[single.id].correct, true)
	assert.equal(practice.visibleSlides[1].revealed, true)

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

	const exam = createContext('exam', [single, multiple])
	const callsBeforeExam = recordCalls.length
	exam.loadQuestion(0)
	exam.chooseOption('A')
	assert.equal(recordCalls.length, callsBeforeExam)
	assert.equal(exam.visibleSlides[1].revealed, false)
	exam.loadQuestion(1)
	exam.finalizeExam()
	assert.equal(recordCalls.length, callsBeforeExam + 1)
	assert.equal(exam.examSubmitted, true)
	assert.equal(exam.visibleSlides[1].revealed, true)
	assert.equal(exam.visibleSlides[1].submitted, false)
	assert.equal(exam.correctCount, 1)

	const review = createContext('review', [single])
	const callsBeforeReview = recordCalls.length
	review.loadQuestion(0)
	review.chooseOption('B')
	assert.equal(recordCalls.length, callsBeforeReview)
	assert.equal(review.visibleSlides[1].revealed, true)
	assert.deepEqual(Array.from(review.visibleSlides[1].selected), [])

	preferenceResponse = { answerMode: 'review', nightMode: true }
	await review.loadAnswerPreferences()
	assert.equal(review.answerMode, 'review')
	assert.equal(review.nightMode, true)
	assert.deepEqual(JSON.parse(JSON.stringify(navigationColors.slice(-1)[0])), {
		frontColor: '#ffffff',
		backgroundColor: '#171c22'
	})

	const settingsComponent = loadComponent(
		environment,
		'../practice-pages/answer-settings/answer-settings.vue'
	)
	const settings = Object.assign(settingsComponent.data(), settingsComponent.methods)
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
	const home = Object.assign(homeComponent.data(), homeComponent.methods)
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

	console.log('practice answer mode tests passed')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
