<template>
	<view class="loading-state" :class="{ 'night-mode': nightMode }" v-if="loading">
		<uni-load-more status="loading"></uni-load-more>
	</view>

	<view class="empty-state error-state" :class="{ 'night-mode': nightMode }" v-else-if="loadError">
		<uni-icons type="refreshempty" size="42" color="#d34d4d"></uni-icons>
		<text>{{ loadError }}</text>
		<button v-if="isSharedExamResult" @tap="goToPracticeHome">去刷题</button>
		<button v-else @tap="retryLoad">重新加载</button>
	</view>

	<view class="exam-result-page" :class="{ 'night-mode': nightMode }" v-else-if="showExamResult && examResult">
		<scroll-view class="exam-result-scroll" scroll-y>
			<view class="result-hero">
				<view class="result-meta-list">
					<view class="result-meta-row">
						<view class="result-meta-icon">章</view>
						<text>章节名称：{{ examResult.chapterName }}</text>
					</view>
				</view>
			</view>

			<view class="result-summary-card">
				<view class="accuracy-ring" :style="accuracyRingStyle">
					<view class="accuracy-ring-inner">
						<view class="accuracy-value-line">
							<text class="accuracy-value">{{ examResult.accuracyText }}</text>
							<text class="accuracy-unit">%</text>
						</view>
						<text class="accuracy-label">正确率</text>
					</view>
				</view>

				<view class="result-stats-grid">
					<view class="result-stat-item correct-stat">
						<text class="result-stat-value">{{ examResult.correctCount }}</text>
						<text class="result-stat-label">答对题数</text>
					</view>
					<view class="result-stat-item wrong-stat">
						<text class="result-stat-value">{{ examResult.wrongCount }}</text>
						<text class="result-stat-label">答错题数</text>
					</view>
					<view class="result-stat-item total-stat">
						<text class="result-stat-value">{{ examResult.totalCount }}</text>
						<text class="result-stat-label">总题数</text>
					</view>
				</view>

				<view class="result-unanswered-note" v-if="examResult.unansweredCount">
					还有 {{ examResult.unansweredCount }} 道题未作答
				</view>
			</view>

			<view class="result-actions" :class="{ 'shared-result-actions': isSharedExamResult }">
				<button class="result-back-button" v-if="!isSharedExamResult" @tap="goToPracticeHome">返回刷题首页</button>
				<button class="result-retry-button" v-if="!isSharedExamResult" @tap="restartExam">重新测试</button>
				<button
					class="result-share-button"
					open-type="share"
				>分享成绩</button>
				<button class="result-retry-button" v-if="isSharedExamResult" @tap="goToPracticeHome">去刷题</button>
			</view>

			<!-- #ifdef MP-WEIXIN -->
			<view class="result-ad-container" v-if="showAds">
				<ad-custom
					unit-id="adunit-085cc7635227d1e5"
					@load="adLoad"
					@error="adError"
					@close="adClose"
				></ad-custom>
			</view>
			<!-- #endif -->
		</scroll-view>
	</view>

	<view class="practice-page" :class="{ 'night-mode': nightMode }" v-else-if="currentQuestion">
		<view class="progress-track">
			<view class="progress-fill" :style="{ width: progressPercent + '%' }"></view>
		</view>

		<swiper
			class="question-swiper"
			:current="swiperCurrent"
			:duration="swiperDuration"
			:circular="questionList.length > 2"
			easing-function="easeOutCubic"
			:disable-touch="swiperTouchDisabled"
			@change="handleSwiperChange"
			@animationfinish="handleSwiperAnimationFinish"
		>
			<swiper-item class="question-slide" v-for="slide in visibleSlides" :key="slide.slot">
				<scroll-view
					class="question-scroll"
					scroll-y
					:scroll-top="slide.offset === 0 ? scrollTop : 0"
					v-if="slide.question"
				>
					<view class="question-shell">
							<view class="question-header">
								<view class="type-badge">{{ questionTypeLabel(slide.question) }}</view>
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

							<view class="material-block" v-if="slide.question.type === 'material'">
								<text class="material-text">{{ slide.question.materialText }}</text>
							</view>

							<view class="question-stem" :class="{ 'material-question-stem': slide.question.type === 'material' }">
								<text class="question-title">{{ slide.question.title }}</text>
							</view>

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
									<uni-icons v-if="slide.revealed && slide.question.answer.indexOf(option.alias) > -1" type="checkmarkempty" size="21" color="#28a665"></uni-icons>
									<uni-icons v-else-if="slide.revealed && slide.selected.indexOf(option.alias) > -1" type="closeempty" size="21" color="#e45151"></uni-icons>
								</view>
							</view>

							<button
								class="confirm-answer-button"
								v-if="canConfirmSlide(slide)"
								:disabled="!slide.selected.length"
								@tap="confirmCurrentAnswer"
							>{{ examInProgress ? '确认选择' : '确认答案' }}</button>

							<view class="analysis-panel" v-if="slide.revealed">
								<view class="result-line" v-if="slide.submitted" :class="slide.correct ? 'correct-text' : 'wrong-text'">
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
			</swiper-item>
		</swiper>

		<view class="bottom-toolbar" :class="{ 'exam-toolbar': examInProgress }">
			<view class="toolbar-stat answered-text" v-if="examInProgress">
				<text>已答</text>
				<text>{{ answeredCount }}</text>
			</view>
			<view class="toolbar-stat unanswered-text" v-if="examInProgress">
				<text>未答</text>
				<text>{{ questionList.length - answeredCount }}</text>
			</view>
			<view class="toolbar-stat correct-text" v-if="!examInProgress">
				<uni-icons type="checkmarkempty" size="22" color="#28a665"></uni-icons>
				<text>{{ correctCount }}</text>
			</view>
			<view class="toolbar-stat wrong-text" v-if="!examInProgress">
				<uni-icons type="closeempty" size="22" color="#e45151"></uni-icons>
				<text>{{ wrongCount }}</text>
			</view>
			<view class="toolbar-command" @tap="openAnswerSheet">
				<uni-icons type="bars" size="23" color="#69707a"></uni-icons>
				<text>{{ currentIndex + 1 }}/{{ questionList.length }}</text>
			</view>
			<view class="toolbar-command" @tap="openQuestionFeedback">
				<uni-icons type="compose" size="23" color="#69707a"></uni-icons>
				<text>反馈</text>
			</view>
			<view class="toolbar-command" @tap="favoriteCurrent">
				<uni-icons :type="favorite ? 'star-filled' : 'star'" size="24" :color="favorite ? '#e7a721' : '#69707a'"></uni-icons>
				<text>{{ favorite ? '已收藏' : '收藏' }}</text>
			</view>
			<view class="toolbar-submit" v-if="examInProgress" @tap="submitExam">
				<text>交卷</text>
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
				<button class="answer-sheet-submit" v-if="examInProgress" @tap="submitExam">交卷并查看成绩</button>
			</view>
		</uni-popup>

		<uni-popup ref="questionFeedbackPopup" type="bottom" :safe-area="false">
			<view class="feedback-sheet">
				<view class="feedback-sheet-header">
					<view>
						<text class="feedback-sheet-title">题目反馈</text>
						<text class="feedback-sheet-caption">请选择发现的问题</text>
					</view>
					<view class="feedback-sheet-close" @tap="closeQuestionFeedback">
						<uni-icons type="closeempty" size="24" color="#5f6570"></uni-icons>
					</view>
				</view>
				<view class="feedback-field-label">
					<text class="feedback-required">*</text>
					<text>错误类型</text>
				</view>
				<view class="feedback-type-grid">
					<view
						class="feedback-type-item"
						:class="{ selected: feedbackIssueType === item.value }"
						v-for="item in feedbackIssueTypes"
						:key="item.value"
						@tap="selectFeedbackIssue(item.value)"
					>
						<view class="feedback-radio">
							<view class="feedback-radio-dot" v-if="feedbackIssueType === item.value"></view>
						</view>
						<text>{{ item.label }}</text>
					</view>
				</view>
				<view class="feedback-field-label feedback-description-label">
					<text class="feedback-required" v-if="feedbackIssueType === 'other'">*</text>
					<text>纠错或建议</text>
				</view>
				<view class="feedback-description-wrap">
					<textarea
						class="feedback-description"
						v-model="feedbackDescription"
						maxlength="500"
						:placeholder="feedbackIssueType === 'other' ? '请填写问题或建议（必填，2～500字）' : '请简述题目问题或写下您的建议（选填）'"
						placeholder-class="feedback-placeholder"
					></textarea>
					<text class="feedback-count">{{ feedbackDescription.length }}/500</text>
				</view>
				<button
					class="feedback-submit-button"
					:disabled="!canSubmitQuestionFeedback"
					:loading="feedbackSubmitting"
					@tap="submitCurrentQuestionFeedback"
				>提交</button>
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
					<finance-calculator ref="embeddedFinanceCalculator" :embedded="true"></finance-calculator>
				</scroll-view>
			</view>
		</uni-popup>
	</view>

	<view class="empty-state" :class="{ 'night-mode': nightMode }" v-else>
		<uni-icons type="info" size="42" color="#a2a8b0"></uni-icons>
		<text>当前练习没有可用题目</text>
		<button @tap="goBack">返回刷题首页</button>
	</view>
</template>

<script>
	import { buildPracticeQuestionSet } from '@/data/practice-questions.js'
	import { getQuestionTypeDisplayLabel } from '@/data/question-types.js'
	import {
		getPracticeState,
		isCorrectAnswer,
		isFavorite,
		recordExamSubmissionAnswer,
		recordAnswer,
		toggleFavorite
	} from '@/data/practice.js'
	import { getAllPracticeQuestions, getQuestionsByIds } from '@/services/question-bank.js'
	import {
		completeExamDraft,
		createPracticeEventId,
		examDraftHasProgress,
		flushPracticeEvents,
		getEffectiveAnswerMode,
		getLocalExamDraft,
		getLocalPracticePreferences,
		getPracticeBootstrap,
		getPracticePreferences,
		getPracticeRound,
		getPracticeStateSnapshot,
		reconcileExamDraft,
		resetExamDraft,
		saveExamDraftAnswer,
		saveExamDraftPosition,
		savePracticeProgress,
		startExamDraft,
		submitQuestionFeedback
	} from '@/services/user-practice.js'
	import {
		cacheMembershipSnapshot,
		getCachedMembership,
		getMembership,
		showMembershipUpsell
	} from '@/services/membership.js'
	import FinanceCalculator from '@/components/finance-calculator/finance-calculator.vue'

	export default {
		components: {
			FinanceCalculator
		},
		data() {
			const localPreferences = getLocalPracticePreferences()
			const cachedMembership = getCachedMembership()
			return {
				membership: cachedMembership,
				membershipLoaded: false,
				questionList: [],
				questionVersion: '',
				practiceConfig: null,
				currentIndex: 0,
				selectedAnswers: [],
				submitted: false,
				lastResult: false,
				favorite: false,
				sessionAnswers: {},
				draftAnswers: {},
				visitedQuestionIds: [],
				answerMode: getEffectiveAnswerMode(localPreferences.answerMode, cachedMembership.isMember),
				nightMode: localPreferences.nightMode,
				examSubmitted: false,
				showExamResult: false,
				examResult: null,
				examDraft: null,
				isSharedExamResult: false,
				correctCount: 0,
				wrongCount: 0,
				scrollTop: 0,
				swiperCurrent: 1,
				swiperSettledSlot: 1,
				swiperDuration: 300,
				swipeAnimating: false,
				mode: 'sequence',
				loading: true,
				loadError: '',
				favoriteQuestionIds: [],
				feedbackIssueTypes: [
					{ value: 'answer_error', label: '答案错误' },
					{ value: 'explanation_error', label: '解析错误' },
					{ value: 'text_error', label: '文字错误' },
					{ value: 'other', label: '其他' }
				],
				feedbackIssueType: 'answer_error',
				feedbackDescription: '',
				feedbackSubmitting: false,
				feedbackClientRequestId: '',
				progressSavedOnLeave: false
			}
		},
		computed: {
			showAds() {
				return this.membershipLoaded && !this.membership.isMember
			},
			currentQuestion() {
				return this.questionList[this.currentIndex] || null
			},
			visibleSlides() {
				const nextSlot = this.getSwiperSlot(this.swiperSettledSlot + 1)
				return [0, 1, 2].map(slotIndex => {
					const offset = slotIndex === this.swiperSettledSlot
						? 0
						: (slotIndex === nextSlot ? 1 : -1)
					const index = this.currentIndex + offset
					const question = this.questionList[index] || null
					const answer = question ? this.sessionAnswers[question.id] : null
					const draft = question ? this.draftAnswers[question.id] : null
					return {
						slot: `slot-${slotIndex}`,
						offset,
						index,
						question,
						submitted: Boolean(answer),
						selected: answer ? answer.selected : (draft || []),
						correct: answer ? answer.correct : false,
						revealed: this.answerMode === 'review'
							|| (this.answerMode === 'exam' && this.examSubmitted)
							|| Boolean(answer)
					}
				})
			},
			progressPercent() {
				return this.questionList.length ? Math.round((this.currentIndex + 1) / this.questionList.length * 100) : 0
			},
			answeredCount() {
				if (this.examInProgress) {
					return Object.keys(this.draftAnswers)
						.filter(questionId => this.draftAnswers[questionId].length).length
				}
				if (this.answerMode === 'review') return this.visitedQuestionIds.length
				return Object.keys(this.sessionAnswers).length
			},
			examInProgress() {
				return this.answerMode === 'exam' && !this.examSubmitted
			},
			canSubmitQuestionFeedback() {
				if (this.feedbackSubmitting || !this.feedbackIssueType) return false
				const descriptionLength = this.feedbackDescription.trim().length
				return descriptionLength <= 500
					&& (this.feedbackIssueType !== 'other' || descriptionLength >= 2)
			},
			swiperTouchDisabled() {
				return this.questionList.length < 2
			},
			accuracyRingStyle() {
				const accuracy = this.examResult ? this.examResult.accuracy : 0
				const percent = Math.max(0, Math.min(100, accuracy))
				const trackColor = this.nightMode ? '#313943' : '#edf0f3'
				return {
					background: `conic-gradient(from -90deg, #008cff 0%, #008cff ${percent}%, ${trackColor} ${percent}%, ${trackColor} 100%)`
				}
			}
		},
		onLoad(options) {
			if (options.sharedResult) {
				this.loadMembershipState()
				this.openSharedExamResult(options.sharedResult)
				return
			}
			this.mode = options.mode || 'sequence'
			this.practiceConfig = {
				subjectId: options.subjectId,
				mode: this.mode,
				chapterId: options.chapterId,
				section: options.section ? decodeURIComponent(options.section) : '',
				knowledge: options.knowledge ? decodeURIComponent(options.knowledge) : '',
				keyword: options.keyword ? decodeURIComponent(options.keyword) : '',
				startId: options.startId,
				startNumber: Number(options.startNumber) || 0,
				limit: options.limit,
				examAction: options.examAction || ''
			}
			this.setNavigationTitle()
			this.applyNavigationTheme()
			this.initializePractice()
		},
		async onShow() {
			this.progressSavedOnLeave = false
			if (!this.membershipLoaded) return
			try {
				await this.loadMembershipState()
				const preferences = await getPracticePreferences()
				this.answerMode = getEffectiveAnswerMode(preferences.answerMode, this.membership.isMember)
				this.nightMode = Boolean(preferences.nightMode)
				this.applyNavigationTheme()
			} catch (error) {
				// 前台刷新失败时继续沿用当前主题，不影响本次答题。
			}
		},
		onHide() {
			this.syncCurrentProgress()
		},
		onUnload() {
			this.syncCurrentProgress()
			this.destroyExamSession()
		},
		onShareAppMessage() {
			if (this.showExamResult && this.examResult) {
				return this.createExamResultShareOptions()
			}
			return {
				title: '一起来刷题吧',
				path: '/pages/exam/exam'
			}
		},
		methods: {
			questionTypeLabel(question) {
				return getQuestionTypeDisplayLabel(question)
			},
			async initializePractice() {
				await this.loadMembershipState()
				if ((this.mode === 'wrong' || this.mode === 'favorite')
					&& !this.membership.isMember) {
					const openedMembership = await showMembershipUpsell(
						this.mode === 'wrong'
							? '开通会员后即可使用错题集，集中巩固薄弱题目。'
							: '开通会员后即可使用收藏夹，随时复习重点题目。',
						{ replace: true }
					)
					if (!openedMembership) {
						uni.navigateBack({
							fail: () => uni.switchTab({ url: '/pages/exam/exam' })
						})
					}
					return false
				}
				return this.loadQuestions()
			},
			async loadMembershipState(options) {
				try {
					this.membership = await getMembership(options)
				} catch (error) {
					this.membership = getCachedMembership()
				} finally {
					this.membershipLoaded = true
				}
			},
			parseSharedExamResult(payload) {
				const serialized = String(payload || '')
				const candidates = [serialized]
				try {
					const decoded = decodeURIComponent(serialized)
					if (decoded !== serialized) candidates.push(decoded)
				} catch (error) {
					// 非法 URL 编码会在后续校验中作为无效分享处理。
				}
				let shared = null
				for (let index = 0; index < candidates.length; index += 1) {
					try {
						shared = JSON.parse(candidates[index])
						break
					} catch (error) {
						shared = null
					}
				}
				if (!shared || shared.v !== 1) return null
				const counts = ['c', 'w', 'u', 't'].map(key => Number(shared[key]))
				if (counts.some(count => !Number.isInteger(count) || count < 0 || count > 9999)) return null
				const [correctCount, wrongCount, unansweredCount, totalCount] = counts
				if (!totalCount || correctCount + wrongCount + unansweredCount !== totalCount) return null
				const answeredCount = correctCount + wrongCount
				const accuracy = answeredCount ? correctCount / answeredCount * 100 : 0
				const chapterName = String(shared.n || '').trim().slice(0, 60) || '当前测试'
				return {
					chapterName,
					accuracy,
					accuracyText: accuracy.toFixed(2),
					correctCount,
					wrongCount,
					partialCount: 0,
					answeredCount,
					unansweredCount,
					totalCount
				}
			},
			openSharedExamResult(payload) {
				this.isSharedExamResult = true
				this.loading = false
				this.loadError = ''
				const result = this.parseSharedExamResult(payload)
				if (!result) {
					this.loadError = '分享的考试结果无效或已损坏'
					uni.setNavigationBarTitle({ title: '测试结果' })
					this.applyNavigationTheme()
					return false
				}
				this.answerMode = 'exam'
				this.examSubmitted = true
				this.examResult = result
				this.showExamResult = true
				uni.setNavigationBarTitle({ title: '测试结果' })
				this.applyNavigationTheme()
				getPracticePreferences().then(preferences => {
					this.nightMode = Boolean(preferences.nightMode)
					this.applyNavigationTheme()
				}).catch(() => {
					// 本地主题已在 data 中恢复，云端偏好失败不影响查看分享结果。
				})
				return true
			},
			createExamResultShareOptions() {
				if (!this.examResult) {
					return {
						title: '一起来刷题吧',
						path: '/pages/exam/exam'
					}
				}
				const result = this.examResult
				const payload = encodeURIComponent(JSON.stringify({
					v: 1,
					n: result.chapterName,
					c: result.correctCount,
					w: result.wrongCount,
					u: result.unansweredCount,
					t: result.totalCount
				}))
				return {
					title: `我在${result.chapterName}测试中答对 ${result.correctCount} 题，正确率 ${result.accuracyText}%`,
					path: `/practice-pages/practice/practice?sharedResult=${payload}`
				}
			},
			canResumePracticeProgress() {
				return this.answerMode !== 'exam'
					|| ['chapter', 'section', 'knowledge'].indexOf(this.mode) === -1
			},
			resolveInitialQuestionIndex(practiceRound) {
				if (!this.canResumePracticeProgress()) return 0
				const savedStartIndex = this.practiceConfig.startId
					? this.questionList.findIndex(item => item.id === this.practiceConfig.startId)
					: -1
				const hasRoundProgress = practiceRound
					&& Array.isArray(practiceRound.answeredQuestionIds)
					&& practiceRound.answeredQuestionIds.length > 0
				const roundPositionIndex = hasRoundProgress && practiceRound.positionQuestionId
					? this.questionList.findIndex(item => item.id === practiceRound.positionQuestionId)
					: -1
				const answeredQuestionIds = hasRoundProgress
					? new Set(practiceRound.answeredQuestionIds)
					: null
				const firstUnansweredIndex = answeredQuestionIds
					? this.questionList.findIndex(item => !answeredQuestionIds.has(item.id))
					: -1
				const numberedStartIndex = this.practiceConfig.startNumber > 0
					? Math.min(this.practiceConfig.startNumber - 1, this.questionList.length - 1)
					: -1
				return savedStartIndex > -1
					? savedStartIndex
					: (roundPositionIndex > -1
						? roundPositionIndex
						: (firstUnansweredIndex > -1
							? firstUnansweredIndex
							: (numberedStartIndex > -1 ? numberedStartIndex : 0)))
			},
			hydratePracticeRound(practiceRound) {
				this.resetSessionAnswers()
				if (!practiceRound || !Array.isArray(practiceRound.answers)) return
				const availableIds = new Set(this.questionList.map(question => question.id))
				practiceRound.answers.forEach(answer => {
					if (!answer || !availableIds.has(answer.questionId) || !Array.isArray(answer.selected)) return
					this.$set(this.sessionAnswers, answer.questionId, {
						selected: answer.selected.slice(),
						correct: Boolean(answer.correct)
					})
					if (answer.correct) this.correctCount += 1
					else this.wrongCount += 1
				})
			},
			getSessionSnapshotQuestionIds(initialIndex) {
				const maximum = 100
				if (this.questionList.length <= maximum) return this.questionList.map(item => item.id)
				const start = Math.max(0, Math.min(
					this.questionList.length - maximum,
					(Number(initialIndex) || 0) - Math.floor(maximum / 2)
				))
				return this.questionList.slice(start, start + maximum).map(item => item.id)
			},
			async loadAnswerPreferences() {
				const preferences = await getPracticePreferences()
				if (!this.membershipLoaded) {
					await this.loadMembershipState()
				}
				this.answerMode = getEffectiveAnswerMode(preferences.answerMode, this.membership.isMember)
				this.nightMode = Boolean(preferences.nightMode)
				this.applyNavigationTheme()
			},
			applyNavigationTheme() {
				uni.setNavigationBarColor({
					frontColor: this.nightMode ? '#ffffff' : '#000000',
					backgroundColor: this.nightMode ? '#171c22' : '#ffffff'
				})
			},
			examDraftEnabled() {
				return this.answerMode === 'exam' && this.mode !== 'smart'
			},
			examDraftOptions(extra) {
				return Object.assign({
					subjectId: this.practiceConfig.subjectId,
					mode: this.mode,
					chapterId: this.practiceConfig.chapterId,
					section: this.practiceConfig.section,
					knowledge: this.practiceConfig.knowledge,
					keyword: this.practiceConfig.keyword
				}, extra || {})
			},
			resolveNewQuestionIndex() {
				const startIndex = this.practiceConfig.startId
					? this.questionList.findIndex(item => item.id === this.practiceConfig.startId)
					: -1
				if (startIndex > -1) return startIndex
				if (this.practiceConfig.startNumber > 0) {
					return Math.min(this.practiceConfig.startNumber - 1, this.questionList.length - 1)
				}
				return 0
			},
			resolveExamDraftIndex(draft) {
				if (!draft) return this.resolveNewQuestionIndex()
				const positionIndex = draft.positionQuestionId
					? this.questionList.findIndex(item => item.id === draft.positionQuestionId)
					: -1
				if (positionIndex > -1) return positionIndex
				const answeredIds = new Set(Object.keys(draft.answers || {}))
				const unansweredIndex = this.questionList.findIndex(item => !answeredIds.has(item.id))
				if (unansweredIndex > -1) return unansweredIndex
				const initialIndex = draft.initialQuestionId
					? this.questionList.findIndex(item => item.id === draft.initialQuestionId)
					: -1
				return initialIndex > -1 ? initialIndex : 0
			},
			hydrateExamDraft(draft) {
				this.draftAnswers = {}
				if (!draft || !draft.answers) return
				const availableIds = new Set(this.questionList.map(question => question.id))
				Object.keys(draft.answers).forEach(questionId => {
					const answer = draft.answers[questionId]
					if (!availableIds.has(questionId) || !answer || !Array.isArray(answer.selected)
						|| !answer.selected.length) return
					this.$set(this.draftAnswers, questionId, answer.selected.slice())
				})
			},
			requestExamEntryAction(draft) {
				return new Promise(resolve => {
					uni.showActionSheet({
						itemList: ['重新做题', '继续做题'],
						success: result => {
							if (result.tapIndex === 0) resolve('restart')
							else if (result.tapIndex === 1) resolve('continue')
							else resolve('cancel')
						},
						fail: () => resolve('cancel')
					})
				}).then(action => {
					if (action === 'restart') {
						resetExamDraft(this.examDraftOptions({ roundId: draft.roundId }))
					}
					return action
				})
			},
			async buildNewExamQuestionSet(forceRefresh) {
				if (this.mode === 'chapter' || this.mode === 'section') {
					return getAllPracticeQuestions(Object.assign({}, this.practiceConfig, {
						pageSize: 50
					}), {
						forceRefresh: Boolean(forceRefresh)
					})
				}
				return buildPracticeQuestionSet(this.practiceConfig)
			},
			async loadQuestions(forceRefresh) {
				this.loading = true
				this.loadError = ''
				this.questionList = []
				this.questionVersion = ''
				this.currentIndex = 0
				this.draftAnswers = {}
				this.sessionAnswers = {}
				this.visitedQuestionIds = []
				this.examSubmitted = false
				this.showExamResult = false
				this.examResult = null
				this.examDraft = null
				this.isSharedExamResult = false
				this.resetSwiperPosition()
				try {
					const localPreferences = getLocalPracticePreferences()
					this.answerMode = getEffectiveAnswerMode(
						localPreferences.answerMode,
						this.membership.isMember
					)
					this.nightMode = Boolean(localPreferences.nightMode)
					this.applyNavigationTheme()
					let questionVersion = ''
					if (!this.questionList.length) {
						if (this.examDraftEnabled()) {
							const result = await this.buildNewExamQuestionSet(forceRefresh)
							this.questionList = result.items || []
							questionVersion = result.version || ''
						} else if (this.mode === 'chapter' || this.mode === 'section') {
							const result = await getAllPracticeQuestions(Object.assign({}, this.practiceConfig, {
								pageSize: 50
							}), {
								forceRefresh: Boolean(forceRefresh)
							})
							this.questionList = result.items
							questionVersion = result.version || ''
						} else {
							const result = await buildPracticeQuestionSet(this.practiceConfig)
							this.questionList = result.items || []
							questionVersion = result.version || ''
						}
					}
					let bootstrap = null
					let snapshot = null
					if (this.membership.isMember
						&& ['smart', 'wrong', 'favorite'].indexOf(this.mode) === -1) {
						const bootstrapIndex = this.resolveNewQuestionIndex()
						bootstrap = await getPracticeBootstrap(Object.assign({}, this.examDraftOptions(), {
							questionIds: this.getSessionSnapshotQuestionIds(bootstrapIndex)
						}))
						if (bootstrap && bootstrap.membership) {
							this.membership = cacheMembershipSnapshot(bootstrap.membership)
						}
						if (bootstrap && bootstrap.preferences) {
							this.answerMode = getEffectiveAnswerMode(
								bootstrap.preferences.answerMode,
								this.membership.isMember
							)
							this.nightMode = Boolean(bootstrap.preferences.nightMode)
							this.applyNavigationTheme()
						}
						snapshot = bootstrap && bootstrap.snapshot
					}
					const resumableDraft = bootstrap && bootstrap.examDraft
						? bootstrap.examDraft
						: (!this.membership.isMember ? getLocalExamDraft(this.examDraftOptions()) : null)
					if (this.examDraftEnabled()
						&& this.practiceConfig.examAction !== 'restart'
						&& resumableDraft
						&& examDraftHasProgress(resumableDraft)) {
						const savedDraft = resumableDraft
						const entryAction = this.practiceConfig.examAction === 'continue'
							? 'continue'
							: await this.requestExamEntryAction(savedDraft)
						if (entryAction === 'cancel') {
							uni.navigateBack()
							return
						}
						if (entryAction === 'restart') {
							this.practiceConfig.examAction = 'restart'
						} else {
							const restored = await getQuestionsByIds({
								subjectId: this.practiceConfig.subjectId,
								questionIds: savedDraft.questionIds
							})
							if (restored.items.length) {
								this.questionList = restored.items
								questionVersion = restored.version || savedDraft.questionVersion || ''
								this.examDraft = restored.items.length === savedDraft.questionIds.length
									? savedDraft
									: reconcileExamDraft(this.examDraftOptions({
										roundId: savedDraft.roundId,
										questionIds: restored.items.map(item => item.id)
									}))
								this.hydrateExamDraft(this.examDraft)
							} else {
								resetExamDraft(this.examDraftOptions({ roundId: savedDraft.roundId }))
							}
						}
					}
					let practiceRound = null
					if (this.answerMode === 'practice'
						&& ['chapter', 'section'].indexOf(this.mode) > -1) {
						practiceRound = bootstrap && bootstrap.practiceRound
							? bootstrap.practiceRound
							: await getPracticeRound({
								subjectId: this.practiceConfig.subjectId,
								chapterId: this.practiceConfig.chapterId,
								section: this.mode === 'section' ? this.practiceConfig.section : ''
							})
						this.hydratePracticeRound(practiceRound)
					} else if (!this.examDraft) {
						this.resetSessionAnswers()
					}
					let initialQuestionIndex = this.examDraft
						? this.resolveExamDraftIndex(this.examDraft)
						: this.resolveInitialQuestionIndex(practiceRound)
					if (this.examDraftEnabled() && !this.examDraft && this.questionList.length) {
						initialQuestionIndex = this.resolveNewQuestionIndex()
						this.examDraft = startExamDraft(this.examDraftOptions({
							questionVersion,
							questionIds: this.questionList.map(item => item.id),
							initialQuestionId: this.questionList[initialQuestionIndex].id
						}))
					}
					this.questionVersion = questionVersion
					try {
						if (!snapshot && this.membership.isMember
							&& ['smart', 'wrong', 'favorite'].indexOf(this.mode) > -1) {
							snapshot = {
								favoriteQuestionIds: this.questionList
									.filter(question => question.favorite)
									.map(question => question.id)
							}
						}
						if (!snapshot) {
							snapshot = await getPracticeStateSnapshot(this.practiceConfig.subjectId, {
								localState: getPracticeState(),
								questionIds: this.getSessionSnapshotQuestionIds(initialQuestionIndex),
								includeAggregates: false,
								includeProgress: false
							})
						}
						this.favoriteQuestionIds = snapshot.favoriteQuestionIds || []
					} catch (syncError) {
						this.favoriteQuestionIds = []
					}
					if (this.questionList.length) {
						this.loadQuestion(initialQuestionIndex)
					}
				} catch (error) {
					this.loadError = error && error.errCode === 'QUESTION_BANK_SUBJECT_NOT_FOUND'
						? '该科目题库尚未发布'
						: (error && (error.errMsg || error.message)) || '练习题目加载失败'
				} finally {
					this.loading = false
				}
			},
			retryLoad() {
				this.loadQuestions(true)
			},
			setNavigationTitle() {
				const titles = {
					smart: '智能练习',
					wrong: '错题强化',
					favorite: '收藏练习',
					chapter: '章节练习',
					section: '小节练习',
					knowledge: '知识点练习',
					search: '题目练习'
				}
				uni.setNavigationBarTitle({ title: titles[this.mode] || '顺序练习' })
			},
			resetSessionAnswers() {
				this.sessionAnswers = {}
				this.correctCount = 0
				this.wrongCount = 0
			},
			loadQuestion(index) {
				this.currentIndex = index
				const question = this.questionList[index]
				if (!question) return
				if (this.answerMode === 'review' && this.visitedQuestionIds.indexOf(question.id) === -1) {
					this.visitedQuestionIds.push(question.id)
				}
				const saved = this.sessionAnswers[question.id]
				const draft = this.draftAnswers[question.id]
				this.selectedAnswers = saved
					? saved.selected.slice()
					: (draft ? draft.slice() : [])
				this.submitted = Boolean(saved)
				this.lastResult = saved ? saved.correct : false
				this.favorite = this.favoriteQuestionIds.indexOf(question.id) > -1 || isFavorite(question.id)
				this.scrollTop = this.scrollTop === 0 ? 1 : 0
				this.saveCurrentQuestionProgress(question)
			},
			saveCurrentQuestionProgress(question) {
				if (!question) return null
				if (this.examDraftEnabled()) {
					if (!this.examDraft || this.examSubmitted) return null
					const saved = saveExamDraftPosition(this.examDraftOptions({
						roundId: this.examDraft.roundId,
						questionId: question.id
					}))
					if (saved) this.examDraft = saved
					return saved && saved.roundId
				}
				if (this.answerMode === 'exam') return null
				if (['chapter', 'section', 'knowledge'].indexOf(this.mode) === -1) return null
				return savePracticeProgress(question, {
					mode: this.mode,
					chapterId: this.practiceConfig.chapterId,
					section: this.practiceConfig.section,
					knowledge: this.practiceConfig.knowledge
				})
			},
			syncCurrentProgress() {
				if (this.progressSavedOnLeave) return
				this.progressSavedOnLeave = true
				if (this.isSharedExamResult) return
				if (this.answerMode === 'exam') {
					if (this.examDraftEnabled() && this.examDraft && !this.examSubmitted) {
						const saved = saveExamDraftPosition(this.examDraftOptions({
							roundId: this.examDraft.roundId,
							questionId: this.currentQuestion && this.currentQuestion.id
						}))
						if (saved) this.examDraft = saved
						flushPracticeEvents({ includeProgress: false }).catch(() => {
							// 考试草稿已保存在本机，下次启动会自动重试云同步。
						})
					}
					return
				}
				this.saveCurrentQuestionProgress(this.currentQuestion)
				flushPracticeEvents().catch(() => {
					// 进度已持久化在本机，下次启动会自动重试。
				})
			},
			handleSwiperChange(event) {
				const position = Number(event.detail && event.detail.current)
				if (position < 0 || position > 2 || isNaN(position)) return
				this.swiperCurrent = position
				if (position !== this.swiperSettledSlot) this.swipeAnimating = true
			},
			handleSwiperAnimationFinish(event) {
				const position = Number(event.detail && event.detail.current)
				if (position < 0 || position > 2 || isNaN(position)) return
				this.swiperCurrent = position
				if (position === this.swiperSettledSlot) {
					this.swipeAnimating = false
					return
				}
				const direction = position === this.getSwiperSlot(this.swiperSettledSlot + 1)
					? 1
					: -1
				const targetIndex = this.currentIndex + direction
				if (targetIndex < 0 || targetIndex >= this.questionList.length) {
					this.swipeAnimating = true
					this.swiperDuration = 300
					this.swiperCurrent = this.swiperSettledSlot
					uni.showToast({
						title: direction > 0 && this.examInProgress
							? '已到最后一题，可点击交卷'
							: (direction > 0 ? '已经是最后一题' : '已经是第一题'),
						icon: 'none'
					})
					return
				}
				this.loadQuestion(targetIndex)
				this.swiperSettledSlot = position
				this.swipeAnimating = false
			},
			animateToQuestion(targetIndex) {
				if (this.swipeAnimating || targetIndex === this.currentIndex) return
				if (targetIndex < 0 || targetIndex >= this.questionList.length) return
				const moveDirection = targetIndex > this.currentIndex ? 1 : -1
				this.swipeAnimating = true
				this.swiperDuration = 300
				this.swiperCurrent = this.getSwiperSlot(this.swiperSettledSlot + moveDirection)
			},
			resetSwiperPosition() {
				this.swiperSettledSlot = 1
				this.swiperCurrent = 1
				this.swiperDuration = 300
				this.swipeAnimating = false
			},
			getSwiperSlot(position) {
				return (position + 3) % 3
			},
			chooseOption(alias) {
				if (this.submitted || this.answerMode === 'review'
					|| (this.answerMode === 'exam' && this.examSubmitted)) return
				if (this.currentQuestion.selectionMode === 'multiple') {
					const selected = this.selectedAnswers.slice()
					const index = selected.indexOf(alias)
					if (index > -1) selected.splice(index, 1)
					else selected.push(alias)
					this.selectedAnswers = selected
				} else {
					this.selectedAnswers = [alias]
				}
				this.saveCurrentDraft()
				if (this.answerMode === 'practice' && this.currentQuestion.selectionMode === 'single') {
					this.submitAnswer()
				} else if (this.examInProgress && this.currentQuestion.selectionMode === 'single') {
					this.advanceAfterExamSelection()
				}
			},
			saveCurrentDraft() {
				if (!this.currentQuestion) return
				if (this.selectedAnswers.length) {
					this.$set(this.draftAnswers, this.currentQuestion.id, this.selectedAnswers.slice())
				} else {
					this.$delete(this.draftAnswers, this.currentQuestion.id)
				}
				if (this.examDraftEnabled() && this.examDraft && !this.examSubmitted) {
					const saved = saveExamDraftAnswer(this.examDraftOptions({
						roundId: this.examDraft.roundId,
						questionId: this.currentQuestion.id,
						selected: this.selectedAnswers,
						positionQuestionId: this.currentQuestion.id
					}))
					if (saved) this.examDraft = saved
				}
			},
			chooseSlideOption(slide, alias) {
				if (slide.offset === 0) this.chooseOption(alias)
			},
			optionClass(slide, alias) {
				if (!slide.revealed) return slide.selected.indexOf(alias) > -1 ? 'selected' : ''
				if (slide.question.answer.indexOf(alias) > -1) return 'correct'
				if (slide.selected.indexOf(alias) > -1) return 'wrong'
				return 'disabled'
			},
			canConfirmSlide(slide) {
				return slide.offset === 0
					&& slide.question.selectionMode === 'multiple'
					&& ((this.answerMode === 'practice' && !slide.submitted)
						|| this.examInProgress)
			},
			confirmCurrentAnswer() {
				if (!this.selectedAnswers.length) {
					uni.showToast({ title: '请至少选择一个选项', icon: 'none' })
					return
				}
				if (this.examInProgress) {
					this.advanceAfterExamSelection()
					return
				}
				this.submitAnswer()
			},
			advanceAfterExamSelection() {
				if (!this.examInProgress || !this.currentQuestion || !this.selectedAnswers.length) return
				if (this.currentIndex < this.questionList.length - 1) {
					this.animateToQuestion(this.currentIndex + 1)
				}
			},
			submitAnswer() {
				if (!this.currentQuestion || !this.selectedAnswers.length || this.submitted) return
				const correct = recordAnswer(this.currentQuestion, this.selectedAnswers, {
					practiceMode: this.mode
				})
				this.$set(this.sessionAnswers, this.currentQuestion.id, {
					selected: this.selectedAnswers.slice(),
					correct
				})
				this.lastResult = correct
				this.submitted = true
				this.$delete(this.draftAnswers, this.currentQuestion.id)
				if (correct) this.correctCount += 1
				else this.wrongCount += 1
			},
			submitExam() {
				if (!this.examInProgress) return
				const unanswered = this.questionList.length - this.answeredCount
				uni.showModal({
					title: '确认交卷',
					content: unanswered > 0
						? `还有 ${unanswered} 道题未作答，确认现在交卷吗？`
						: '所有题目均已作答，确认提交试卷吗？',
					confirmText: '确认交卷',
					success: result => {
						if (result.confirm) {
							if (this.$refs.answerSheet) this.$refs.answerSheet.close()
							this.finalizeExam()
						}
					}
				})
			},
			finalizeExam() {
				let correctCount = 0
				let wrongCount = 0
				let partialCount = 0
				let answeredCount = 0
				const submittedAnswers = []
				const sessionAnswers = {}
				this.questionList.forEach(question => {
					const selected = this.draftAnswers[question.id]
					if (!selected || !selected.length) return
					answeredCount += 1
					submittedAnswers.push({ question, selected: selected.slice() })
					const correct = isCorrectAnswer(selected, question.answer)
					const partial = !correct && this.isPartialExamAnswer(question, selected)
					sessionAnswers[question.id] = {
						selected: selected.slice(),
						correct,
						partial
					}
					if (correct) correctCount += 1
					else if (partial) partialCount += 1
					else wrongCount += 1
				})
				const totalCount = this.questionList.length
				const accuracy = answeredCount ? correctCount / answeredCount * 100 : 0
				this.sessionAnswers = sessionAnswers
				this.correctCount = correctCount
				this.wrongCount = wrongCount + partialCount
				this.examSubmitted = true
				this.examResult = {
					chapterName: this.resolveExamChapterName(),
					accuracy,
					accuracyText: accuracy.toFixed(2),
					correctCount,
					wrongCount: wrongCount + partialCount,
					partialCount,
					answeredCount,
					unansweredCount: totalCount - answeredCount,
					totalCount
				}
				submittedAnswers.forEach(item => {
					recordExamSubmissionAnswer(item.question, item.selected)
				})
				this.showExamResult = true
				if (this.examDraftEnabled() && this.examDraft) {
					completeExamDraft(this.examDraftOptions({ roundId: this.examDraft.roundId }))
					this.examDraft = null
					flushPracticeEvents({ includeProgress: false }).catch(() => {
						// 本地已完成交卷，云端完成事件将在下次联网时重试。
					})
				}
				uni.setNavigationBarTitle({ title: '测试结果' })
			},
			isPartialExamAnswer(question, selected) {
				if (!question || question.selectionMode !== 'multiple' || !selected.length) return false
				return selected.length < question.answer.length
					&& selected.every(alias => question.answer.indexOf(alias) > -1)
			},
			resolveExamChapterName() {
				if (this.mode === 'section' && this.practiceConfig && this.practiceConfig.section) {
					return this.practiceConfig.section
				}
				const chapterNames = []
				this.questionList.forEach(question => {
					if (question.chapter && chapterNames.indexOf(question.chapter) === -1) {
						chapterNames.push(question.chapter)
					}
				})
				if (chapterNames.length === 1) return chapterNames[0]
				return chapterNames.length ? '综合测试' : '当前测试'
			},
			async restartExam() {
				if (this.practiceConfig) this.practiceConfig.examAction = 'restart'
				this.setNavigationTitle()
				this.applyNavigationTheme()
				return this.loadQuestions()
			},
			goToPracticeHome() {
				this.destroyExamSession()
				uni.switchTab({ url: '/pages/exam/exam' })
			},
			destroyExamSession() {
				this.showExamResult = false
				this.examResult = null
				this.sessionAnswers = {}
				this.draftAnswers = {}
				this.examDraft = null
				this.visitedQuestionIds = []
				this.selectedAnswers = []
				this.isSharedExamResult = false
			},
			adLoad() {
				console.log('原生模板广告加载成功')
			},
			adError(error) {
				console.error('原生模板广告加载失败', error)
			},
			adClose() {
				console.log('原生模板广告关闭')
			},
			previousQuestion() {
				if (this.currentIndex > 0) this.animateToQuestion(this.currentIndex - 1)
			},
			findFirstUnansweredQuestionIndex() {
				if (this.answerMode === 'review') return -1
				return this.questionList.findIndex(question => {
					if (this.examInProgress) {
						const draft = this.draftAnswers[question.id]
						return !draft || !draft.length
					}
					return !this.sessionAnswers[question.id]
				})
			},
			nextQuestion() {
				if (this.currentIndex < this.questionList.length - 1) {
					this.animateToQuestion(this.currentIndex + 1)
					return
				}
				const isReview = this.answerMode === 'review'
				const unanswered = this.questionList.length - this.answeredCount
				const firstUnansweredIndex = this.findFirstUnansweredQuestionIndex()
				const canContinue = !isReview && firstUnansweredIndex > -1
				uni.showModal({
					title: isReview ? '本组背题完成' : '本组练习完成',
					content: isReview
						? `已浏览 ${this.questionList.length} 道题`
						: `答对 ${this.correctCount} 题，答错 ${this.wrongCount} 题${unanswered ? `，未答 ${unanswered} 题` : ''}`,
					showCancel: canContinue,
					cancelText: '继续答题',
					confirmText: '返回首页',
					success: result => {
						if (result.confirm) {
							uni.navigateBack()
							return
						}
						if (result.cancel && canContinue) {
							this.loadQuestion(firstUnansweredIndex)
						}
					}
				})
			},
			async favoriteCurrent() {
				this.favorite = toggleFavorite(this.currentQuestion)
				const questionId = this.currentQuestion.id
				const index = this.favoriteQuestionIds.indexOf(questionId)
				if (this.favorite && index === -1) this.favoriteQuestionIds.unshift(questionId)
				if (!this.favorite && index > -1) this.favoriteQuestionIds.splice(index, 1)
				uni.showToast({ title: this.favorite ? '已加入收藏' : '已取消收藏', icon: 'none' })
			},
			openQuestionFeedback() {
				if (!this.currentQuestion || !this.questionVersion) {
					uni.showToast({ title: '题库版本信息缺失，请重新加载后再反馈', icon: 'none' })
					return
				}
				this.feedbackIssueType = 'answer_error'
				this.feedbackDescription = ''
				this.feedbackSubmitting = false
				this.feedbackClientRequestId = ''
				this.$refs.questionFeedbackPopup.open()
			},
			closeQuestionFeedback() {
				if (this.feedbackSubmitting) return
				this.$refs.questionFeedbackPopup.close()
			},
			selectFeedbackIssue(issueType) {
				if (!this.feedbackSubmitting) this.feedbackIssueType = issueType
			},
			getFeedbackClientContext() {
				let systemInfo = {}
				let accountInfo = {}
				try {
					systemInfo = uni.getSystemInfoSync() || {}
				} catch (error) {
					systemInfo = {}
				}
				try {
					if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
						accountInfo = wx.getAccountInfoSync() || {}
					}
				} catch (error) {
					accountInfo = {}
				}
				const miniProgram = accountInfo.miniProgram || {}
				const answer = this.sessionAnswers[this.currentQuestion.id]
				const draft = this.draftAnswers[this.currentQuestion.id]
				return {
					practiceMode: this.mode,
					answerMode: this.answerMode,
					selectedAnswers: answer
						? answer.selected.slice()
						: (draft ? draft.slice() : this.selectedAnswers.slice()),
					revealed: this.answerMode === 'review'
						|| (this.answerMode === 'exam' && this.examSubmitted)
						|| Boolean(answer),
					questionIndex: this.currentIndex + 1,
					questionCount: this.questionList.length,
					appVersion: String(miniProgram.version || systemInfo.appVersion || ''),
					envVersion: String(miniProgram.envVersion || ''),
					platform: String(systemInfo.platform || ''),
					system: String(systemInfo.system || ''),
					sdkVersion: String(systemInfo.SDKVersion || '')
				}
			},
			async submitCurrentQuestionFeedback() {
				if (!this.canSubmitQuestionFeedback || !this.currentQuestion) return
				this.feedbackSubmitting = true
				if (!this.feedbackClientRequestId) {
					this.feedbackClientRequestId = createPracticeEventId('feedback')
				}
				try {
					await submitQuestionFeedback({
						clientRequestId: this.feedbackClientRequestId,
						subjectId: this.practiceConfig.subjectId,
						version: this.questionVersion,
						questionId: this.currentQuestion.id,
						issueType: this.feedbackIssueType,
						description: this.feedbackDescription,
						context: this.getFeedbackClientContext()
					})
					this.$refs.questionFeedbackPopup.close()
					this.feedbackClientRequestId = ''
					uni.showToast({ title: '感谢反馈，我们会尽快核查', icon: 'none' })
				} catch (error) {
					uni.showToast({
						title: error && (error.errMsg || error.message) || '反馈提交失败，请稍后重试',
						icon: 'none'
					})
				} finally {
					this.feedbackSubmitting = false
				}
			},
			openAnswerSheet() {
				this.$refs.answerSheet.open()
			},
			closeAnswerSheet() {
				this.$refs.answerSheet.close()
			},
			jumpToQuestion(index) {
				this.loadQuestion(index)
				this.closeAnswerSheet()
			},
			answerNumberClass(index) {
				const question = this.questionList[index]
				const answer = this.sessionAnswers[question.id]
				const draft = this.draftAnswers[question.id]
				const answered = this.answerMode === 'review'
					? this.visitedQuestionIds.indexOf(question.id) > -1
					: Boolean(answer || draft && draft.length)
				const classNames = []
				if (index === this.currentIndex) classNames.push('current')
				if (answered) classNames.push('answered')
				return classNames.join(' ')
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
	.question-swiper { width: 100%; height: calc(100vh - 106rpx - env(safe-area-inset-bottom)); overflow: hidden; background: transparent; }
	.question-slide { width: 100vw; height: 100%; flex: 0 0 100vw; }
	.question-slide-boundary { width: 100%; height: 100%; }
	.question-scroll { width: 100%; height: 100%; }
	.question-shell { margin: 24rpx; padding: 28rpx 28rpx 48rpx; border-radius: 8rpx; background: #ffffff; box-sizing: border-box; }
	.question-header, .question-meta, .answer-sheet-header { display: flex; align-items: center; justify-content: space-between; }
	.type-badge { padding: 10rpx 20rpx; border-left: 6rpx solid #008cff; border-radius: 4rpx; background: #eaf5ff; color: #0074d4; font-size: 28rpx; font-weight: 600; }
	.question-count { font-size: 31rpx; color: #4e545d; }
	.question-count text { color: #008cff; font-size: 41rpx; font-weight: 600; }
	.question-meta { margin-top: 30rpx; padding-top: 24rpx; border-top: 1rpx solid #edf0f3; }
	.meta-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.chapter-name { overflow: hidden; font-size: 25rpx; color: #767c85; text-overflow: ellipsis; white-space: nowrap; }
	.knowledge-name { margin-top: 6rpx; font-size: 24rpx; color: #9a9fa7; }
	.calculator-button { display: flex; align-items: center; justify-content: center; width: 62rpx; height: 62rpx; margin-left: 18rpx; border: 1rpx solid #cfe7fb; border-radius: 8rpx; background: #f4faff; }
	.question-title { display: block; margin-top: 30rpx; font-size: 35rpx; font-weight: 500; line-height: 1.75; }
	.material-block { display: flex; flex-direction: column; margin-top: 30rpx; padding: 24rpx; border: 1rpx solid #dce9f3; border-radius: 10rpx; background: #f6fbff; }
	.material-text { font-size: 31rpx; line-height: 1.8; white-space: pre-wrap; }
	.question-stem { margin-top: 30rpx; }
	.question-stem.material-question-stem { padding-top: 24rpx; border-top: 1rpx solid #e8edf1; }
	.question-stem .question-title { margin-top: 0; }
	.option-list { margin-top: 34rpx; }
	.option-item { display: flex; align-items: center; min-height: 104rpx; margin-top: 20rpx; padding: 18rpx 22rpx; border: 2rpx solid #dfe2e6; border-radius: 8rpx; box-sizing: border-box; background: #ffffff; }
	.option-item.selected { border-color: #008cff; background: #eef7ff; }
	.option-item.correct { border-color: #62bd8b; background: #eff9f4; }
	.option-item.wrong { border-color: #e78080; background: #fff2f2; }
	.option-item.disabled { color: #737983; }
	.option-alias { display: flex; align-items: center; justify-content: center; width: 54rpx; height: 54rpx; flex: 0 0 54rpx; margin-right: 20rpx; border: 2rpx solid #c9cdd2; border-radius: 50%; color: #4f555e; font-size: 28rpx; font-weight: 600; box-sizing: border-box; }
	.selected .option-alias { border-color: #008cff; background: #008cff; color: #ffffff; }
	.correct .option-alias { border-color: #28a665; background: #28a665; color: #ffffff; }
	.wrong .option-alias { border-color: #e45151; background: #e45151; color: #ffffff; }
	.option-text { flex: 1; font-size: 31rpx; line-height: 1.6; }
	.question-nav button::after, .confirm-answer-button::after, .empty-state button::after { border: 0; }
	.confirm-answer-button { height: 82rpx; margin: 30rpx 0 0; border: 0; border-radius: 8rpx; background: #008cff; color: #ffffff; font-size: 29rpx; line-height: 82rpx; }
	.confirm-answer-button[disabled] { background: #c9d0d8; color: #ffffff; }
	.analysis-panel { margin-top: 36rpx; padding-top: 28rpx; border-top: 1rpx solid #e6e9ed; }
	.result-line { display: flex; align-items: center; gap: 8rpx; font-size: 31rpx; font-weight: 600; }
	.correct-text { color: #28a665; }
	.wrong-text { color: #e45151; }
	.answer-line { display: flex; align-items: center; margin-top: 24rpx; }
	.analysis-label { font-size: 28rpx; font-weight: 600; color: #33383f; }
	.answer-value { margin-left: 20rpx; color: #008cff; font-size: 32rpx; font-weight: 600; }
	.explanation-block { display: flex; flex-direction: column; margin-top: 28rpx; }
	.explanation-text { margin-top: 14rpx; font-size: 28rpx; color: #565c65; line-height: 1.8; white-space: pre-wrap; }
	.question-nav { display: grid; grid-template-columns: 1fr 1.4fr; gap: 18rpx; margin-top: 34rpx; }
	.question-nav button { height: 82rpx; margin: 0; border-radius: 8rpx; font-size: 29rpx; line-height: 82rpx; }
	.previous-button { border: 2rpx solid #cfd3d8; background: #ffffff; color: #5f6570; }
	.next-button { background: #008cff; color: #ffffff; }
	.bottom-toolbar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: grid; grid-template-columns: 0.7fr 0.7fr 1fr 0.9fr 0.9fr; height: calc(100rpx + env(safe-area-inset-bottom)); padding: 0 12rpx env(safe-area-inset-bottom); border-top: 1rpx solid #e0e3e7; box-sizing: border-box; background: #ffffff; }
	.bottom-toolbar.exam-toolbar { grid-template-columns: 0.7fr 0.7fr 0.9fr 0.8fr 0.8fr 0.9fr; }
	.toolbar-stat, .toolbar-command { display: flex; align-items: center; justify-content: center; gap: 8rpx; font-size: 27rpx; }
	.toolbar-command { color: #4f555d; }
	.answered-text { color: #008cff; }
	.unanswered-text { color: #7c838c; }
	.toolbar-submit { display: flex; align-items: center; justify-content: center; align-self: center; height: 66rpx; border-radius: 34rpx; background: #008cff; color: #ffffff; font-size: 28rpx; font-weight: 600; }
	.answer-sheet { padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); border-radius: 16rpx 16rpx 0 0; background: #ffffff; }
	.answer-sheet-header { padding-bottom: 24rpx; border-bottom: 1rpx solid #edf0f3; }
	.answer-sheet-header > view:first-child { display: flex; flex-direction: column; }
	.answer-sheet-title { font-size: 35rpx; font-weight: 600; }
	.answer-sheet-caption { margin-top: 5rpx; font-size: 24rpx; color: #858b93; }
	.sheet-close { padding: 12rpx; }
	.answer-sheet-scroll { max-height: 60vh; }
	.answer-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 20rpx; padding: 28rpx 4rpx 12rpx; }
	.answer-number { display: flex; align-items: center; justify-content: center; width: 80rpx; height: 80rpx; border: 2rpx solid #d5d9de; border-radius: 50%; box-sizing: border-box; color: #5e646d; font-size: 27rpx; }
	.answer-number.current { border-color: #008cff; color: #008cff; box-shadow: 0 0 0 4rpx #eaf5ff; }
	.answer-number.answered { border-color: #008cff; background: #008cff; color: #ffffff; }
	.answer-sheet-submit { width: 100%; height: 84rpx; margin: 24rpx 0 0; border-radius: 42rpx; background: #008cff; color: #ffffff; font-size: 30rpx; font-weight: 600; line-height: 84rpx; }
	.answer-sheet-submit::after { border: 0; }
	.feedback-sheet { padding: 28rpx 32rpx calc(32rpx + env(safe-area-inset-bottom)); border-radius: 20rpx 20rpx 0 0; background: #ffffff; }
	.feedback-sheet-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 24rpx; border-bottom: 1rpx solid #edf0f3; }
	.feedback-sheet-header > view:first-child { display: flex; flex-direction: column; }
	.feedback-sheet-title { color: #2b2f34; font-size: 35rpx; font-weight: 600; }
	.feedback-sheet-caption { margin-top: 6rpx; color: #858b93; font-size: 24rpx; }
	.feedback-sheet-close { display: flex; align-items: center; justify-content: center; width: 68rpx; height: 68rpx; }
	.feedback-field-label { display: flex; align-items: center; margin-top: 26rpx; color: #4c525a; font-size: 27rpx; font-weight: 600; }
	.feedback-required { margin-right: 6rpx; color: #e45151; }
	.feedback-description-label { margin-top: 2rpx; margin-bottom: 16rpx; }
	.feedback-type-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18rpx 24rpx; padding: 18rpx 0 26rpx; }
	.feedback-type-item { display: flex; align-items: center; min-height: 72rpx; padding: 0 18rpx; border: 2rpx solid #e1e5e9; border-radius: 10rpx; color: #4f555d; font-size: 29rpx; box-sizing: border-box; }
	.feedback-type-item.selected { border-color: #008cff; background: #eef7ff; color: #087dcc; }
	.feedback-radio { display: flex; align-items: center; justify-content: center; width: 34rpx; height: 34rpx; flex: 0 0 34rpx; margin-right: 14rpx; border: 2rpx solid #c8cdd3; border-radius: 50%; box-sizing: border-box; }
	.feedback-type-item.selected .feedback-radio { border-color: #008cff; }
	.feedback-radio-dot { width: 18rpx; height: 18rpx; border-radius: 50%; background: #008cff; }
	.feedback-description-wrap { position: relative; padding: 20rpx 20rpx 48rpx; border: 2rpx solid #dfe3e7; border-radius: 10rpx; background: #ffffff; }
	.feedback-description { width: 100%; height: 210rpx; color: #343940; font-size: 28rpx; line-height: 1.6; box-sizing: border-box; }
	.feedback-placeholder { color: #a1a7ae; }
	.feedback-count { position: absolute; right: 20rpx; bottom: 14rpx; color: #9aa0a8; font-size: 23rpx; }
	.feedback-submit-button { height: 84rpx; margin: 28rpx 0 0; border-radius: 42rpx; background: #008cff; color: #ffffff; font-size: 30rpx; font-weight: 600; line-height: 84rpx; }
	.feedback-submit-button::after { border: 0; }
	.feedback-submit-button[disabled] { background: #c8d0d8; color: #ffffff; }
	.calculator-sheet { height: 86vh; overflow: hidden; border-radius: 16rpx 16rpx 0 0; background: #ffffff; }
	.calculator-sheet-header { display: flex; align-items: center; justify-content: space-between; height: 96rpx; padding: 0 20rpx 0 32rpx; border-bottom: 1rpx solid #e8ebef; box-sizing: border-box; }
	.calculator-sheet-title { font-size: 33rpx; font-weight: 600; color: #2b2f34; }
	.calculator-sheet-close { display: flex; align-items: center; justify-content: center; width: 72rpx; height: 72rpx; }
	.calculator-sheet-scroll { height: calc(86vh - 96rpx); padding-bottom: env(safe-area-inset-bottom); box-sizing: border-box; }
	.exam-result-page { height: 100vh; overflow: hidden; background: linear-gradient(155deg, #e9f5ff 0%, #f4faff 34%, #f4f5f7 68%); color: #2b2f34; }
	.exam-result-scroll { height: 100%; }
	.result-hero { position: relative; padding: 44rpx 44rpx 34rpx; overflow: hidden; box-sizing: border-box; }
	.result-meta-list { position: relative; z-index: 2; display: flex; flex-direction: column; gap: 30rpx; }
	.result-meta-row { display: flex; align-items: center; color: #3d4249; font-size: 30rpx; line-height: 1.5; }
	.result-meta-icon { display: flex; align-items: center; justify-content: center; width: 42rpx; height: 42rpx; flex: 0 0 42rpx; margin-right: 18rpx; border-radius: 50%; background: rgba(90, 178, 239, 0.72); color: #ffffff; font-size: 21rpx; font-weight: 600; }
	.result-summary-card { margin: 0 28rpx; padding: 56rpx 24rpx 42rpx; border-radius: 34rpx; background: rgba(255, 255, 255, 0.96); box-shadow: 0 22rpx 60rpx rgba(72, 82, 96, 0.08); }
	.accuracy-ring { display: flex; align-items: center; justify-content: center; width: 340rpx; height: 340rpx; margin: 0 auto; border-radius: 50%; }
	.accuracy-ring-inner { display: flex; align-items: center; flex-direction: column; justify-content: center; width: 270rpx; height: 270rpx; border-radius: 50%; background: #ffffff; box-shadow: 0 0 0 2rpx rgba(239, 241, 244, 0.7); }
	.accuracy-value-line { display: flex; align-items: baseline; color: #008cff; }
	.accuracy-value { font-size: 73rpx; font-weight: 500; line-height: 1; }
	.accuracy-unit { margin-left: 5rpx; font-size: 35rpx; }
	.accuracy-label { margin-top: 24rpx; color: #0074d4; font-size: 32rpx; font-weight: 600; }
	.result-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 48rpx; }
	.result-stat-item { display: flex; align-items: center; flex-direction: column; min-width: 0; }
	.result-stat-value { font-size: 46rpx; line-height: 1.2; }
	.result-stat-label { margin-top: 14rpx; color: #565c64; font-size: 25rpx; text-align: center; white-space: nowrap; }
	.correct-stat .result-stat-value { color: #36bf62; }
	.wrong-stat .result-stat-value { color: #df4937; }
	.total-stat .result-stat-value { color: #42474e; }
	.result-unanswered-note { margin: 38rpx 18rpx 0; padding: 20rpx 24rpx; border-radius: 12rpx; background: #eef7ff; color: #2677b8; font-size: 26rpx; text-align: center; }
	.result-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14rpx; padding: 32rpx 28rpx 24rpx; }
	.result-actions.shared-result-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.result-actions button { height: 88rpx; margin: 0; border-radius: 44rpx; font-size: 29rpx; line-height: 88rpx; }
	.result-actions button::after { border: 0; }
	.result-back-button { border: 2rpx solid #cfd5dc; background: rgba(255, 255, 255, 0.86); color: #535a63; }
	.result-retry-button { background: linear-gradient(135deg, #33a8ff, #008cff); color: #ffffff; box-shadow: 0 14rpx 30rpx rgba(0, 140, 255, 0.2); }
	.result-share-button { border: 2rpx solid #79bff0; background: #e9f6ff; color: #087dc9; }
	.result-ad-container { min-height: 1rpx; margin: 0 28rpx; padding: 8rpx 0 calc(38rpx + env(safe-area-inset-bottom)); overflow: hidden; border-radius: 16rpx; }
	.empty-state { display: flex; align-items: center; flex-direction: column; justify-content: center; min-height: 70vh; padding: 40rpx; color: #858b93; font-size: 29rpx; }
	.loading-state { display: flex; align-items: center; justify-content: center; min-height: 70vh; }
	.empty-state text { margin-top: 20rpx; }
	.empty-state button { margin-top: 30rpx; border-radius: 40rpx; background: #008cff; color: #ffffff; font-size: 29rpx; }
	.error-state { color: #bd3f3f; }
	.loading-state.night-mode,
	.empty-state.night-mode { min-height: 100vh; background: #12171d; color: #aeb7c1; box-sizing: border-box; }

	.practice-page.night-mode { background: #12171d; color: #e6e9ed; }
	.exam-result-page.night-mode { background: linear-gradient(155deg, #14283a 0%, #172430 38%, #12171d 72%); color: #e6e9ed; }
	.night-mode .result-meta-row { color: #d1d7de; }
	.night-mode .result-meta-icon { background: #46515d; color: #eef2f6; }
	.night-mode .result-summary-card { background: rgba(27, 34, 42, 0.97); box-shadow: 0 22rpx 60rpx rgba(0, 0, 0, 0.2); }
	.night-mode .accuracy-ring-inner { background: #1b222a; box-shadow: 0 0 0 2rpx #303943; }
	.night-mode .result-stat-label { color: #aeb7c1; }
	.night-mode .total-stat .result-stat-value { color: #e0e5ea; }
	.night-mode .result-unanswered-note { background: #183149; color: #70bdf2; }
	.night-mode .result-back-button { border-color: #47525e; background: #202832; color: #d2d8df; }
	.night-mode .result-share-button { border-color: #35698f; background: #17364d; color: #72c2fa; }
	.night-mode .progress-track { background: #303943; }
	.night-mode .question-shell,
	.night-mode .bottom-toolbar,
	.night-mode .answer-sheet,
	.night-mode .feedback-sheet,
	.night-mode .calculator-sheet { background: #1b222a; }
	.night-mode .type-badge { background: #17364d; color: #65baff; }
	.night-mode .material-block { border-color: #31506a; background: #172e40; }
	.night-mode .question-stem.material-question-stem { border-color: #303943; }
	.night-mode .question-count,
	.night-mode .chapter-name,
	.night-mode .toolbar-command { color: #b6bec8; }
	.night-mode .knowledge-name,
	.night-mode .answer-sheet-caption { color: #89939e; }
	.night-mode .question-meta,
	.night-mode .analysis-panel,
	.night-mode .answer-sheet-header,
	.night-mode .feedback-sheet-header,
	.night-mode .calculator-sheet-header { border-color: #303943; }
	.night-mode .calculator-button { border-color: #29506e; background: #172e40; }
	.night-mode .option-item { border-color: #3a444f; background: #202832; }
	.night-mode .option-item.selected { border-color: #168ee5; background: #17364d; }
	.night-mode .option-item.correct { border-color: #3c9266; background: #183328; }
	.night-mode .option-item.wrong { border-color: #b85b5b; background: #3b2327; }
	.night-mode .option-item.disabled { color: #929ca7; }
	.night-mode .option-alias { border-color: #596470; color: #cbd2da; }
	.night-mode .analysis-label,
	.night-mode .feedback-sheet-title,
	.night-mode .calculator-sheet-title { color: #e4e8ed; }
	.night-mode .feedback-sheet-caption { color: #89939e; }
	.night-mode .feedback-field-label { color: #c4cbd3; }
	.night-mode .feedback-type-item { border-color: #3a444f; color: #c4cbd3; }
	.night-mode .feedback-type-item.selected { border-color: #168ee5; background: #17364d; color: #66baff; }
	.night-mode .feedback-radio { border-color: #596470; }
	.night-mode .feedback-description-wrap { border-color: #3a444f; background: #202832; }
	.night-mode .feedback-description { color: #e1e5e9; }
	.night-mode .feedback-placeholder,
	.night-mode .feedback-count { color: #7f8994; }
	.night-mode .explanation-text { color: #bec6cf; }
	.night-mode .previous-button { border-color: #4a5561; background: #202832; color: #c7ced6; }
	.night-mode .bottom-toolbar { border-color: #303943; }
	.night-mode .unanswered-text { color: #9aa4af; }
	.night-mode .answer-number { border-color: #4b5662; color: #bbc3cc; }
	.night-mode .answer-number.current { border-color: #269df0; color: #63b9f6; box-shadow: 0 0 0 4rpx #17364d; }
	.night-mode .answer-number.answered { border-color: #168ee5; background: #168ee5; color: #ffffff; }
	.night-mode .answer-sheet-submit { background: #168ee5; color: #ffffff; }
</style>
