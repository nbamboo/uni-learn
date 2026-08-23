<template>
	<view class="loading-state" v-if="loading">
		<uni-load-more status="loading"></uni-load-more>
	</view>

	<view class="practice-page" v-else-if="currentQuestion">
		<view class="progress-track">
			<view class="progress-fill" :style="{ width: progressPercent + '%' }"></view>
		</view>

		<movable-area class="question-swipe-area">
			<movable-view
				class="question-swipe-view"
				:class="{ 'is-animating': swipeAnimating }"
				direction="horizontal"
				:x="cardPositionX"
				:animation="cardAnimationEnabled"
				:damping="60"
				:friction="2"
				@change="handleCardPositionChange"
				@touchstart="handleCardTouchStart"
				@touchend="handleCardTouchEnd"
				@touchcancel="cancelCardGesture"
				@mousedown="handleCardMouseDown"
				@mouseup="handleCardMouseUp"
			>
				<view class="question-slide" v-for="slide in visibleSlides" :key="slide.slot">
					<scroll-view
						class="question-scroll"
						scroll-y
						:scroll-top="slide.offset === 0 ? scrollTop : 0"
						v-if="slide.question"
					>
						<view class="question-shell" :class="{ 'is-dragging': slide.offset === 0 && cardIsDragging }">
							<view class="question-header">
								<view class="type-badge">{{ slide.question.type === 'multiple' ? '多选题' : '单选题' }}</view>
								<view class="question-count"><text>{{ slide.index + 1 }}</text>/{{ questionList.length }}</view>
							</view>

							<view class="question-meta">
								<view class="meta-copy">
									<text class="chapter-name">{{ slide.question.chapter }}</text>
									<text class="knowledge-name">{{ slide.question.knowledge }}</text>
								</view>
								<view class="calculator-button" @tap="openSlideCalculator(slide)">
									<uni-icons custom-prefix="iconfont" type="icon-jisuanqi2" size="20" color="#008cff"></uni-icons>
								</view>
							</view>

							<text class="question-title">{{ slide.question.title }}</text>

							<view class="option-list">
								<view
									class="option-item"
									:class="optionClass(slide, option.alias)"
									v-for="option in slide.question.options"
									:key="option.alias"
									@tap="chooseSlideOption(slide, option.alias)"
								>
									<view class="option-alias">{{ option.alias }}</view>
									<text class="option-text">{{ option.text }}</text>
									<uni-icons v-if="slide.submitted && slide.question.answer.indexOf(option.alias) > -1" type="checkmarkempty" size="21" color="#28a665"></uni-icons>
									<uni-icons v-else-if="slide.submitted && slide.selected.indexOf(option.alias) > -1" type="closeempty" size="21" color="#e45151"></uni-icons>
								</view>
							</view>

							<view class="analysis-panel" v-if="slide.submitted">
								<view class="result-line" :class="slide.correct ? 'correct-text' : 'wrong-text'">
									<uni-icons :type="slide.correct ? 'checkmarkempty' : 'closeempty'" size="22" :color="slide.correct ? '#28a665' : '#e45151'"></uni-icons>
									<text>{{ slide.correct ? '回答正确' : '回答错误' }}</text>
								</view>
								<view class="answer-line">
									<text class="analysis-label">正确答案</text>
									<text class="answer-value">{{ slide.question.answer.join('、') }}</text>
								</view>
								<view class="explanation-block">
									<text class="analysis-label">答案解析</text>
									<text class="explanation-text">{{ slide.question.explanation }}</text>
								</view>
								<view class="question-nav">
									<button class="previous-button" :disabled="slide.index === 0" @tap="previousQuestion">上一题</button>
									<button class="next-button" @tap="nextQuestion">{{ slide.index === questionList.length - 1 ? '完成练习' : '下一题' }}</button>
								</view>
							</view>
						</view>
					</scroll-view>
					<view class="question-slide-boundary" v-else></view>
				</view>
			</movable-view>
		</movable-area>

		<view class="bottom-toolbar">
			<view class="toolbar-stat correct-text">
				<uni-icons type="checkmarkempty" size="22" color="#28a665"></uni-icons>
				<text>{{ correctCount }}</text>
			</view>
			<view class="toolbar-stat wrong-text">
				<uni-icons type="closeempty" size="22" color="#e45151"></uni-icons>
				<text>{{ wrongCount }}</text>
			</view>
			<view class="toolbar-command" @tap="openAnswerSheet">
				<uni-icons type="bars" size="23" color="#69707a"></uni-icons>
				<text>{{ currentIndex + 1 }}/{{ questionList.length }}</text>
			</view>
			<view class="toolbar-command" @tap="favoriteCurrent">
				<uni-icons :type="favorite ? 'star-filled' : 'star'" size="24" :color="favorite ? '#e7a721' : '#69707a'"></uni-icons>
				<text>{{ favorite ? '已收藏' : '收藏' }}</text>
			</view>
		</view>

		<uni-popup ref="answerSheet" type="bottom">
			<view class="answer-sheet">
				<view class="answer-sheet-header">
					<view>
						<text class="answer-sheet-title">答题卡</text>
						<text class="answer-sheet-caption">已答 {{ answeredCount }} / {{ questionList.length }}</text>
					</view>
					<view class="sheet-close" @tap="closeAnswerSheet">
						<uni-icons type="closeempty" size="24" color="#5f6570"></uni-icons>
					</view>
				</view>
				<scroll-view class="answer-sheet-scroll" scroll-y>
					<view class="answer-grid">
						<view
							class="answer-number"
							:class="answerNumberClass(index)"
							v-for="(question, index) in questionList"
							:key="question.id"
							@tap="jumpToQuestion(index)"
						>{{ index + 1 }}</view>
					</view>
				</scroll-view>
			</view>
		</uni-popup>

		<uni-popup
			ref="financeCalculatorPopup"
			type="bottom"
			:mask-background-color="'rgba(27, 34, 42, 0.18)'"
			:safe-area="false"
			@change="handleCalculatorPopupChange"
		>
			<view class="calculator-sheet">
				<view class="calculator-sheet-header">
					<text class="calculator-sheet-title">理财计算器</text>
					<view class="calculator-sheet-close" @tap="closeCalculator">
						<uni-icons type="closeempty" size="24" color="#5f6570"></uni-icons>
					</view>
				</view>
				<scroll-view class="calculator-sheet-scroll" scroll-y>
					<finance-calculator ref="embeddedFinanceCalculator"></finance-calculator>
				</scroll-view>
			</view>
		</uni-popup>
	</view>

	<view class="empty-state" v-else>
		<uni-icons type="info" size="42" color="#a2a8b0"></uni-icons>
		<text>当前练习没有可用题目</text>
		<button @tap="goBack">返回刷题首页</button>
	</view>
</template>

<script>
	import { buildPracticeQuestions } from '@/data/practice-questions.js'
	import { isFavorite, recordAnswer, toggleFavorite } from '@/data/practice.js'
	import FinanceCalculator from '@/components/finance-calculator/finance-calculator.vue'

	export default {
		components: {
			FinanceCalculator
		},
		data() {
			return {
				questionList: [],
				currentIndex: 0,
				selectedAnswers: [],
				submitted: false,
				lastResult: false,
				favorite: false,
				sessionAnswers: {},
				correctCount: 0,
				wrongCount: 0,
				scrollTop: 0,
				cardPositionX: 375,
				cardCenterX: 375,
				cardAnimationEnabled: false,
				cardIsDragging: false,
				ignoreMouseUntil: 0,
				swipeAnimating: false,
				mode: 'sequence',
				loading: true
			}
		},
		computed: {
			currentQuestion() {
				return this.questionList[this.currentIndex] || null
			},
			visibleSlides() {
				const slots = ['previous', 'current', 'next']
				return [-1, 0, 1].map((offset, slotIndex) => {
					const index = this.currentIndex + offset
					const question = this.questionList[index] || null
					const answer = question ? this.sessionAnswers[question.id] : null
					return {
						slot: slots[slotIndex],
						offset,
						index,
						question,
						submitted: Boolean(answer),
						selected: answer ? answer.selected : [],
						correct: answer ? answer.correct : false
					}
				})
			},
			progressPercent() {
				return this.questionList.length ? Math.round((this.currentIndex + 1) / this.questionList.length * 100) : 0
			},
			answeredCount() {
				return Object.keys(this.sessionAnswers).length
			}
		},
		async onLoad(options) {
			this.mode = options.mode || 'sequence'
			const config = {
				subjectId: options.subjectId,
				mode: this.mode,
				chapterId: options.chapterId,
				knowledge: options.knowledge ? decodeURIComponent(options.knowledge) : '',
				keyword: options.keyword ? decodeURIComponent(options.keyword) : '',
				startId: options.startId,
				limit: options.limit
			}
			try {
				this.questionList = await buildPracticeQuestions(config)
				this.setNavigationTitle()
				if (this.questionList.length) {
					this.loadQuestion(0)
					this.resetCardPosition(false)
				}
			} finally {
				this.loading = false
			}
		},
		methods: {
			setNavigationTitle() {
				const titles = {
					smart: '智能练习',
					wrong: '错题强化',
					favorite: '收藏练习',
					history: '做题回顾',
					chapter: '章节练习',
					knowledge: '知识点练习',
					search: '题目练习'
				}
				uni.setNavigationBarTitle({ title: titles[this.mode] || '顺序练习' })
			},
			loadQuestion(index) {
				this.currentIndex = index
				const question = this.questionList[index]
				const saved = this.sessionAnswers[question.id]
				this.selectedAnswers = saved ? saved.selected.slice() : []
				this.submitted = Boolean(saved)
				this.lastResult = saved ? saved.correct : false
				this.favorite = isFavorite(question.id)
				this.scrollTop = this.scrollTop === 0 ? 1 : 0
			},
			handleCardPositionChange(event) {
				const position = Number(event.detail && event.detail.x)
				if (!isNaN(position)) this._cardCurrentX = position
			},
			handleCardTouchStart(event) {
				if (this.swipeAnimating) return
				const touch = event.touches && event.touches[0]
				if (!touch) return
				this.cardIsDragging = true
				this._cardGestureStartX = typeof touch.clientX === 'number' ? touch.clientX : touch.pageX
			},
			handleCardTouchEnd(event) {
				const touch = event.changedTouches && event.changedTouches[0]
				if (!touch) return
				this.ignoreMouseUntil = Date.now() + 500
				const endX = typeof touch.clientX === 'number' ? touch.clientX : touch.pageX
				this.finishCardGesture(endX - this._cardGestureStartX)
			},
			handleCardMouseDown(event) {
				if (Date.now() < this.ignoreMouseUntil || this.swipeAnimating) return
				this.cardIsDragging = true
				this._cardGestureStartX = event.clientX
			},
			handleCardMouseUp(event) {
				if (Date.now() < this.ignoreMouseUntil || !this.cardIsDragging) return
				this.finishCardGesture(event.clientX - this._cardGestureStartX)
			},
			finishCardGesture(horizontalDistance) {
				this.cardIsDragging = false
				this._cardGestureStartX = null
				if (this.swipeAnimating) return
				if (typeof horizontalDistance !== 'number' || isNaN(horizontalDistance)) {
					setTimeout(() => this.settleCard(), 16)
					return
				}
				setTimeout(() => this.resolveCardGesture(horizontalDistance), 16)
			},
			resolveCardGesture(horizontalDistance) {
				if (this.swipeAnimating) return
				const screenWidth = this.cardCenterX
				const swipeThreshold = Math.max(52, Math.min(90, screenWidth * 0.18))
				if (Math.abs(horizontalDistance) < swipeThreshold) {
					this.settleCard()
					return
				}
				if (horizontalDistance < 0) this.swipeToNextQuestion()
				else this.swipeToPreviousQuestion()
			},
			swipeToNextQuestion() {
				if (this.currentIndex < this.questionList.length - 1) {
					this.animateToQuestion(this.currentIndex + 1, -1)
					return
				}
				this.settleCard()
				uni.showToast({ title: '已经是最后一题', icon: 'none' })
			},
			swipeToPreviousQuestion() {
				if (this.currentIndex > 0) {
					this.animateToQuestion(this.currentIndex - 1, 1)
					return
				}
				this.settleCard()
				uni.showToast({ title: '已经是第一题', icon: 'none' })
			},
			animateToQuestion(targetIndex, direction) {
				if (this.swipeAnimating) return
				this.swipeAnimating = true
				this.cardIsDragging = false
				const screenWidth = this.cardCenterX
				const exitPosition = direction < 0 ? 0 : screenWidth * 2
				this.moveCardTo(exitPosition, true)

				setTimeout(() => {
					this.cardAnimationEnabled = false
					this.loadQuestion(targetIndex)
					this.cardPositionX = screenWidth
					this._cardCurrentX = screenWidth
					this.$nextTick(() => {
						setTimeout(() => {
							this.swipeAnimating = false
						}, 16)
					})
				}, 320)
			},
			settleCard() {
				this.cardIsDragging = false
				this.moveCardTo(this.cardCenterX, true)
			},
			cancelCardGesture() {
				this._cardGestureStartX = null
				setTimeout(() => this.settleCard(), 16)
			},
			moveCardTo(targetPosition, animated) {
				this.cardAnimationEnabled = false
				this.cardPositionX = this.getCurrentCardX()
				this.$nextTick(() => {
					setTimeout(() => {
						this.cardAnimationEnabled = animated
						this.cardPositionX = targetPosition
					}, 16)
				})
			},
			resetCardPosition(animated) {
				const centerPosition = this.getScreenWidth()
				this.cardCenterX = centerPosition
				this.cardAnimationEnabled = animated
				this.cardPositionX = centerPosition
				this._cardCurrentX = centerPosition
			},
			getCurrentCardX() {
				return typeof this._cardCurrentX === 'number'
					? this._cardCurrentX
					: this.cardCenterX
			},
			getScreenWidth() {
				const systemInfo = uni.getSystemInfoSync()
				return systemInfo.windowWidth || 375
			},
			chooseOption(alias) {
				if (this.submitted) return
				this.selectedAnswers = [alias]
				this.submitAnswer()
			},
			chooseSlideOption(slide, alias) {
				if (slide.offset === 0) this.chooseOption(alias)
			},
			optionClass(slide, alias) {
				if (!slide.submitted) return ''
				if (slide.question.answer.indexOf(alias) > -1) return 'correct'
				if (slide.selected.indexOf(alias) > -1) return 'wrong'
				return 'disabled'
			},
			submitAnswer() {
				const correct = recordAnswer(this.currentQuestion, this.selectedAnswers)
				this.$set(this.sessionAnswers, this.currentQuestion.id, {
					selected: this.selectedAnswers.slice(),
					correct
				})
				this.lastResult = correct
				this.submitted = true
				if (correct) this.correctCount += 1
				else this.wrongCount += 1
			},
			previousQuestion() {
				if (this.currentIndex > 0) this.animateToQuestion(this.currentIndex - 1, 1)
			},
			nextQuestion() {
				if (this.currentIndex < this.questionList.length - 1) {
					this.animateToQuestion(this.currentIndex + 1, -1)
					return
				}
				uni.showModal({
					title: '本组练习完成',
					content: `答对 ${this.correctCount} 题，答错 ${this.wrongCount} 题`,
					showCancel: false,
					confirmText: '返回首页',
					success: () => uni.navigateBack()
				})
			},
			favoriteCurrent() {
				this.favorite = toggleFavorite(this.currentQuestion)
				uni.showToast({ title: this.favorite ? '已加入收藏' : '已取消收藏', icon: 'none' })
			},
			openAnswerSheet() {
				this.$refs.answerSheet.open()
			},
			closeAnswerSheet() {
				this.$refs.answerSheet.close()
			},
			jumpToQuestion(index) {
				this.loadQuestion(index)
				this.resetCardPosition(false)
				this.closeAnswerSheet()
			},
			answerNumberClass(index) {
				const question = this.questionList[index]
				const answer = this.sessionAnswers[question.id]
				return {
					current: index === this.currentIndex,
					correct: answer && answer.correct,
					wrong: answer && !answer.correct
				}
			},
			goCalculator() {
				this.$refs.financeCalculatorPopup.open()
			},
			openSlideCalculator(slide) {
				if (slide.offset === 0) this.goCalculator()
			},
			closeCalculator() {
				this.$refs.financeCalculatorPopup.close()
			},
			handleCalculatorPopupChange(event) {
				if (!event.show && this.$refs.embeddedFinanceCalculator) {
					this.$refs.embeddedFinanceCalculator.dismissKeyboard()
				}
			},
			goBack() {
				uni.navigateBack()
			}
		}
	}
</script>

<style lang="scss">
	page { height: 100%; background: #f4f5f7; color: #2b2f34; }
	.practice-page { height: 100vh; overflow: hidden; }
	.progress-track { height: 6rpx; background: #dce0e5; }
	.progress-fill { height: 100%; background: #008cff; transition: width 0.2s ease; }
	.question-swipe-area { width: 500vw; height: calc(100vh - 106rpx - env(safe-area-inset-bottom)); margin-left: -200vw; overflow: hidden; background: transparent; }
	.question-swipe-view { display: flex; width: 300vw; height: 100%; }
	.question-swipe-view.is-animating { pointer-events: none; }
	.question-slide { width: 100vw; height: 100%; flex: 0 0 100vw; }
	.question-slide-boundary { width: 100%; height: 100%; }
	.question-scroll { width: 100%; height: 100%; }
	.question-shell { margin: 24rpx; padding: 28rpx 28rpx 48rpx; border-radius: 8rpx; background: #ffffff; box-sizing: border-box; }
	.question-shell.is-dragging { box-shadow: 0 16rpx 36rpx rgba(28, 67, 102, 0.14); }
	.question-header, .question-meta, .answer-sheet-header { display: flex; align-items: center; justify-content: space-between; }
	.type-badge { padding: 10rpx 20rpx; border-left: 6rpx solid #008cff; border-radius: 4rpx; background: #eaf5ff; color: #0074d4; font-size: 27rpx; font-weight: 600; }
	.question-count { font-size: 30rpx; color: #4e545d; }
	.question-count text { color: #008cff; font-size: 40rpx; font-weight: 600; }
	.question-meta { margin-top: 30rpx; padding-top: 24rpx; border-top: 1rpx solid #edf0f3; }
	.meta-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.chapter-name { overflow: hidden; font-size: 24rpx; color: #767c85; text-overflow: ellipsis; white-space: nowrap; }
	.knowledge-name { margin-top: 6rpx; font-size: 23rpx; color: #9a9fa7; }
	.calculator-button { display: flex; align-items: center; justify-content: center; width: 62rpx; height: 62rpx; margin-left: 18rpx; border: 1rpx solid #cfe7fb; border-radius: 8rpx; background: #f4faff; }
	.question-title { display: block; margin-top: 30rpx; font-size: 34rpx; font-weight: 500; line-height: 1.75; }
	.option-list { margin-top: 34rpx; }
	.option-item { display: flex; align-items: center; min-height: 104rpx; margin-top: 20rpx; padding: 18rpx 22rpx; border: 2rpx solid #dfe2e6; border-radius: 8rpx; box-sizing: border-box; background: #ffffff; }
	.option-item.selected { border-color: #008cff; background: #eef7ff; }
	.option-item.correct { border-color: #62bd8b; background: #eff9f4; }
	.option-item.wrong { border-color: #e78080; background: #fff2f2; }
	.option-item.disabled { color: #737983; }
	.option-alias { display: flex; align-items: center; justify-content: center; width: 54rpx; height: 54rpx; flex: 0 0 54rpx; margin-right: 20rpx; border: 2rpx solid #c9cdd2; border-radius: 50%; color: #4f555e; font-size: 27rpx; font-weight: 600; box-sizing: border-box; }
	.selected .option-alias { border-color: #008cff; background: #008cff; color: #ffffff; }
	.correct .option-alias { border-color: #28a665; background: #28a665; color: #ffffff; }
	.wrong .option-alias { border-color: #e45151; background: #e45151; color: #ffffff; }
	.option-text { flex: 1; font-size: 30rpx; line-height: 1.6; }
	.question-nav button::after, .empty-state button::after { border: 0; }
	.analysis-panel { margin-top: 36rpx; padding-top: 28rpx; border-top: 1rpx solid #e6e9ed; }
	.result-line { display: flex; align-items: center; gap: 8rpx; font-size: 30rpx; font-weight: 600; }
	.correct-text { color: #28a665; }
	.wrong-text { color: #e45151; }
	.answer-line { display: flex; align-items: center; margin-top: 24rpx; }
	.analysis-label { font-size: 27rpx; font-weight: 600; color: #33383f; }
	.answer-value { margin-left: 20rpx; color: #008cff; font-size: 31rpx; font-weight: 600; }
	.explanation-block { display: flex; flex-direction: column; margin-top: 28rpx; }
	.explanation-text { margin-top: 14rpx; font-size: 27rpx; color: #565c65; line-height: 1.8; white-space: pre-wrap; }
	.question-nav { display: grid; grid-template-columns: 1fr 1.4fr; gap: 18rpx; margin-top: 34rpx; }
	.question-nav button { height: 82rpx; margin: 0; border-radius: 8rpx; font-size: 28rpx; line-height: 82rpx; }
	.previous-button { border: 2rpx solid #cfd3d8; background: #ffffff; color: #5f6570; }
	.next-button { background: #008cff; color: #ffffff; }
	.bottom-toolbar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: grid; grid-template-columns: 0.75fr 0.75fr 1.2fr 1.2fr; height: calc(100rpx + env(safe-area-inset-bottom)); padding: 0 12rpx env(safe-area-inset-bottom); border-top: 1rpx solid #e0e3e7; box-sizing: border-box; background: #ffffff; }
	.toolbar-stat, .toolbar-command { display: flex; align-items: center; justify-content: center; gap: 8rpx; font-size: 26rpx; }
	.toolbar-command { color: #4f555d; }
	.answer-sheet { padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); border-radius: 16rpx 16rpx 0 0; background: #ffffff; }
	.answer-sheet-header { padding-bottom: 24rpx; border-bottom: 1rpx solid #edf0f3; }
	.answer-sheet-header > view:first-child { display: flex; flex-direction: column; }
	.answer-sheet-title { font-size: 34rpx; font-weight: 600; }
	.answer-sheet-caption { margin-top: 5rpx; font-size: 23rpx; color: #858b93; }
	.sheet-close { padding: 12rpx; }
	.answer-sheet-scroll { max-height: 60vh; }
	.answer-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 20rpx; padding: 28rpx 4rpx 12rpx; }
	.answer-number { display: flex; align-items: center; justify-content: center; width: 80rpx; height: 80rpx; border: 2rpx solid #d5d9de; border-radius: 50%; box-sizing: border-box; color: #5e646d; font-size: 26rpx; }
	.answer-number.current { border-color: #008cff; color: #008cff; box-shadow: 0 0 0 4rpx #eaf5ff; }
	.answer-number.correct { border-color: #28a665; background: #eff9f4; color: #218a54; }
	.answer-number.wrong { border-color: #e45151; background: #fff2f2; color: #c94242; }
	.calculator-sheet { height: 68vh; overflow: hidden; border-radius: 16rpx 16rpx 0 0; background: #ffffff; }
	.calculator-sheet-header { display: flex; align-items: center; justify-content: space-between; height: 96rpx; padding: 0 20rpx 0 32rpx; border-bottom: 1rpx solid #e8ebef; box-sizing: border-box; }
	.calculator-sheet-title { font-size: 32rpx; font-weight: 600; color: #2b2f34; }
	.calculator-sheet-close { display: flex; align-items: center; justify-content: center; width: 72rpx; height: 72rpx; }
	.calculator-sheet-scroll { height: calc(68vh - 96rpx - env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); box-sizing: border-box; }
	.empty-state { display: flex; align-items: center; flex-direction: column; justify-content: center; min-height: 70vh; padding: 40rpx; color: #858b93; font-size: 28rpx; }
	.loading-state { display: flex; align-items: center; justify-content: center; min-height: 70vh; }
	.empty-state text { margin-top: 20rpx; }
	.empty-state button { margin-top: 30rpx; border-radius: 40rpx; background: #008cff; color: #ffffff; font-size: 28rpx; }
</style>
