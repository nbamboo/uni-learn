<template>
	<view class="practice-home">
		<view class="subject-bar" @tap="openSubjectPicker">
			<view class="subject-symbol">
				<uni-icons type="wallet" size="24" color="#008cff"></uni-icons>
			</view>
			<view class="subject-copy">
				<text class="subject-label">当前考试科目</text>
				<text class="subject-name">{{ currentSubject.name }}</text>
			</view>
			<view class="subject-switch">
				<text>切换</text>
				<uni-icons type="bottom" size="15" color="#008cff"></uni-icons>
			</view>
		</view>

		<view class="overview-band">
			<view class="overview-heading">
				<view>
					<text class="overview-title">今日刷题</text>
					<text class="overview-subtitle">每天进步一点，考试从容一点</text>
				</view>
				<view class="goal-copy">{{ today.attempts }}/{{ today.goal }} 题</view>
			</view>

			<view class="overview-content">
				<view class="progress-ring">
					<view class="progress-ring-inner">
						<text class="progress-value">{{ completionText }}</text>
						<text class="progress-caption">题库进度</text>
					</view>
				</view>
				<view class="stat-grid">
					<view class="stat-item">
						<text class="stat-value">{{ questionTotalText }}</text>
						<text class="stat-label">总题数</text>
					</view>
					<view class="stat-item">
						<text class="stat-value">{{ stats.attempted }}</text>
						<text class="stat-label">已练习</text>
					</view>
					<view class="stat-item">
						<text class="stat-value">{{ stats.accuracy }}%</text>
						<text class="stat-label">正确率</text>
					</view>
					<view class="stat-item">
						<text class="stat-value">{{ stats.wrong }}</text>
						<text class="stat-label">待巩固</text>
					</view>
				</view>
			</view>

		</view>

		<view class="primary-actions">
			<button class="primary-button" @tap="startPractice('smart')">
				<uni-icons type="paperplane-filled" size="19" color="#ffffff"></uni-icons>
				<text>智能练习</text>
			</button>
			<button class="secondary-button" @tap="goChapter('chapter')">
				<uni-icons type="list" size="19" color="#008cff"></uni-icons>
				<text>章节练习</text>
			</button>
		</view>

		<view class="search-entry" @tap="goSearch">
			<uni-icons type="search" size="20" color="#8a8f99"></uni-icons>
			<text>搜索题目或知识点</text>
			<uni-icons type="right" size="16" color="#b6bbc3"></uni-icons>
		</view>

		<view class="section-heading">
			<text class="section-title">练习中心</text>
			<text class="section-caption">按你的节奏巩固</text>
		</view>

		<view class="feature-grid">
			<view class="feature-item" v-for="item in features" :key="item.key" @tap="handleFeature(item)">
				<view class="feature-icon" :class="item.tone">
					<uni-icons v-if="item.key === 'calculator'" custom-prefix="iconfont" type="icon-jisuanqi2" size="25" :color="item.color"></uni-icons>
					<uni-icons v-else :type="item.icon" size="25" :color="item.color"></uni-icons>
					<view class="feature-badge" v-if="featureCount(item.key)">{{ featureCount(item.key) }}</view>
				</view>
				<text class="feature-title">{{ item.title }}</text>
				<text class="feature-desc">{{ item.desc }}</text>
			</view>
		</view>

		<view class="bank-note" v-if="currentCatalogPending">
			<uni-icons type="spinner-cycle" size="18" color="#7a7e83"></uni-icons>
			<text>正在从云端加载题库数据...</text>
		</view>

			<view class="bank-note error" v-else-if="currentCatalogError" @tap="retryCatalog">
			<uni-icons type="refreshempty" size="18" color="#d34d4d"></uni-icons>
			<text>{{ currentCatalogError }}，点击重试</text>
		</view>

			<view class="bank-note" v-else-if="!stats.total">
				<uni-icons type="info" size="18" color="#7a7e83"></uni-icons>
				<text>该科目题库正在整理，可先切换到初级个人理财。</text>
			</view>

			<view class="bank-note error" v-if="userDataError" @tap="retryUserData">
				<uni-icons type="cloud-download" size="18" color="#d34d4d"></uni-icons>
				<text>做题记录暂存本机，点击重试云同步</text>
			</view>

		<uni-popup
			ref="subjectPopup"
			type="bottom"
			background-color="#ffffff"
		>
			<view class="subject-sheet">
				<view class="sheet-header">
					<view>
						<text class="sheet-title">切换考试科目</text>
						<text class="sheet-caption">练习记录会按科目分别保存</text>
					</view>
					<view class="sheet-close" @tap="closeSubjectPicker">
						<uni-icons type="closeempty" size="24" color="#5f6570"></uni-icons>
					</view>
				</view>

				<scroll-view class="subject-scroll" scroll-y>
					<view class="subject-group" v-for="group in subjectGroups" :key="group.level">
						<text class="group-title">{{ group.level }}</text>
						<view class="subject-options">
							<view
								class="subject-option"
								:class="{ active: subject.id === currentSubjectId, unavailable: !subjectQuestionCount(subject.id) }"
								v-for="subject in group.items"
								:key="subject.id"
								@tap="changeSubject(subject.id)"
							>
								<text>{{ subject.name }}</text>
								<text class="subject-status">{{ subjectCatalogStatusText(subject.id) }}</text>
							</view>
						</view>
					</view>
				</scroll-view>
			</view>
			</uni-popup>
	</view>
</template>

<script>
	import {
		getPracticeState,
		getSubjectById,
		getSubjectStats,
		getTodayProgress,
		selectSubject,
		subjectGroups
	} from '@/data/practice.js'
	import { getCatalog } from '@/services/question-bank.js'
	import { getPracticeSummary } from '@/services/user-practice.js'

	export default {
		data() {
			return {
				currentSubjectId: '',
				subjectGroups,
				catalogStates: {},
				catalogRequestIds: {},
				nextCatalogRequestId: 0,
				nextUserDataRequestId: 0,
				userDataError: '',
				stats: {
					total: 0,
					attempted: 0,
					correct: 0,
					wrong: 0,
					favorite: 0,
					accuracy: 0,
					completion: 0
				},
				today: { attempts: 0, goal: 20, percent: 0 },
				features: [
					{ key: 'history', title: '做题记录', desc: '回看练习轨迹', icon: 'calendar', color: '#008cff', tone: 'blue' },
					{ key: 'wrong', title: '错题集', desc: '集中攻克薄弱项', icon: 'refresh', color: '#e65757', tone: 'red' },
					{ key: 'favorite', title: '收藏夹', desc: '保存重点题目', icon: 'star', color: '#e7a721', tone: 'yellow' },
					{ key: 'knowledge', title: '知识点', desc: '按考点专项练习', icon: 'map', color: '#37a172', tone: 'green' },
					{ key: 'chapter', title: '章节练习', desc: '跟随教材顺序', icon: 'list', color: '#5966c9', tone: 'indigo' },
					{ key: 'calculator', title: '理财计算器', desc: '做题随时验算', icon: '', color: '#59616d', tone: 'gray' }
				]
			}
		},
		computed: {
			currentSubject() {
				return getSubjectById(this.currentSubjectId)
			},
			currentCatalogState() {
				return this.catalogStates[this.currentSubjectId] || {
					loading: false,
					loaded: false,
					questionCount: 0,
					error: ''
				}
			},
			currentCatalogPending() {
				return this.currentCatalogState.loading && !this.currentCatalogState.loaded
			},
			currentCatalogError() {
				return this.currentCatalogState.error || ''
			},
			completionText() {
				return this.currentCatalogPending ? '--' : `${this.stats.completion}%`
			},
			questionTotalText() {
				return this.currentCatalogPending ? '--' : this.stats.total
			}
		},
		onShow() {
			const state = getPracticeState()
			this.currentSubjectId = state.currentSubjectId
			this.refreshStats(this.subjectQuestionCount(this.currentSubjectId))
			this.loadCatalog(this.currentSubjectId)
			this.loadCloudStats(this.currentSubjectId)
		},
		methods: {
			refreshStats(questionCount) {
				const activityStats = getSubjectStats(this.currentSubjectId)
				const total = Number.isInteger(questionCount) && questionCount >= 0 ? questionCount : 0
				this.stats = Object.assign({}, activityStats, {
					total,
					completion: total
						? Math.min(100, Math.round(activityStats.attempted / total * 100))
						: 0
				})
				this.today = getTodayProgress(this.currentSubjectId)
			},
			async loadCloudStats(subjectId) {
				const requestId = ++this.nextUserDataRequestId
				this.userDataError = ''
				try {
					const summary = await getPracticeSummary(subjectId, {
						localState: getPracticeState()
					})
					if (requestId !== this.nextUserDataRequestId || subjectId !== this.currentSubjectId) return
					const total = this.stats.total
					this.stats = Object.assign({}, this.stats, summary, {
						total,
						completion: total
							? Math.min(100, Math.round(summary.attempted / total * 100))
							: 0
					})
					this.today = Object.assign({}, this.today, {
						attempts: summary.todayAttempts,
						percent: Math.min(100, Math.round(summary.todayAttempts / this.today.goal * 100))
					})
				} catch (error) {
					if (requestId !== this.nextUserDataRequestId || subjectId !== this.currentSubjectId) return
					this.userDataError = (error && (error.errMsg || error.message)) || '做题记录同步失败'
				}
			},
			retryUserData() {
				this.loadCloudStats(this.currentSubjectId)
			},
			async loadCatalog(subjectId, options) {
				const previous = this.catalogStates[subjectId] || {
					loaded: false,
					questionCount: 0,
					error: ''
				}
				const requestId = ++this.nextCatalogRequestId
				this.catalogRequestIds = Object.assign({}, this.catalogRequestIds, {
					[subjectId]: requestId
				})
				this.catalogStates = Object.assign({}, this.catalogStates, {
					[subjectId]: Object.assign({}, previous, {
						loading: true,
						error: ''
					})
				})

				try {
					const catalog = await getCatalog(subjectId, options)
					if (this.catalogRequestIds[subjectId] !== requestId) return
					const parsedCount = Number(catalog && catalog.questionCount)
					const questionCount = Number.isInteger(parsedCount) && parsedCount >= 0 ? parsedCount : 0
					this.catalogStates = Object.assign({}, this.catalogStates, {
						[subjectId]: {
							loading: false,
							loaded: true,
							questionCount,
							error: ''
						}
					})
					if (this.currentSubjectId === subjectId) {
						this.refreshStats(questionCount)
						this.loadCloudStats(subjectId)
					}
				} catch (error) {
					if (this.catalogRequestIds[subjectId] !== requestId) return
					const unavailable = error && error.errCode === 'QUESTION_BANK_SUBJECT_NOT_FOUND'
					const errorMessage = unavailable
						? ''
						: (error && (error.errMsg || error.message)) || '题库数据加载失败'
					const questionCount = unavailable
						? 0
						: (previous.loaded ? previous.questionCount : 0)
					this.catalogStates = Object.assign({}, this.catalogStates, {
						[subjectId]: {
							loading: false,
							loaded: unavailable || previous.loaded,
							questionCount,
							error: errorMessage
						}
					})
					if (this.currentSubjectId === subjectId) {
						this.refreshStats(questionCount)
						this.loadCloudStats(subjectId)
					}
				}
			},
			retryCatalog() {
				this.loadCatalog(this.currentSubjectId, { forceRefresh: true })
			},
			openSubjectPicker() {
				this.$refs.subjectPopup.open()
			},
			closeSubjectPicker() {
				this.$refs.subjectPopup.close()
			},
			changeSubject(subjectId) {
				this.currentSubjectId = subjectId
				selectSubject(subjectId)
				this.refreshStats(this.subjectQuestionCount(subjectId))
				this.closeSubjectPicker()
				this.loadCatalog(subjectId)
				this.loadCloudStats(subjectId)
			},
			subjectQuestionCount(subjectId) {
				const state = this.catalogStates[subjectId]
				return state && state.loaded ? state.questionCount : 0
			},
			subjectCatalogStatusText(subjectId) {
				const state = this.catalogStates[subjectId]
				if (state && state.loading && !state.loaded) return '加载中'
				if (state && state.error && !state.loaded) return '加载失败'
				const questionCount = this.subjectQuestionCount(subjectId)
				return questionCount ? `${questionCount}题` : '待导入'
			},
			ensureQuestions() {
				if (this.currentCatalogPending) {
					uni.showToast({ title: '题库数据正在加载', icon: 'none' })
					return false
				}
				if (this.currentCatalogError && !this.currentCatalogState.loaded) {
					uni.showToast({ title: '题库加载失败，请先重试', icon: 'none' })
					return false
				}
				if (this.stats.total) return true
				uni.showToast({ title: '该科目题库正在整理', icon: 'none' })
				return false
			},
			startPractice(mode) {
				if (!this.ensureQuestions()) return
				uni.navigateTo({ url: `/practice-pages/practice/practice?subjectId=${this.currentSubjectId}&mode=${mode}` })
			},
			goChapter(view) {
				if (!this.ensureQuestions()) return
				uni.navigateTo({ url: `/practice-pages/chapter/chapter?subjectId=${this.currentSubjectId}&view=${view}` })
			},
			goSearch() {
				if (!this.ensureQuestions()) return
				uni.navigateTo({ url: `/practice-pages/question-search/question-search?subjectId=${this.currentSubjectId}` })
			},
			handleFeature(item) {
				if (item.key === 'calculator') {
					uni.navigateTo({ url: '/pages/lcjsq/lcjsq' })
					return
				}
				if (item.key === 'chapter' || item.key === 'knowledge') {
					this.goChapter(item.key)
					return
				}
				if (!this.ensureQuestions()) return
				uni.navigateTo({ url: `/practice-pages/practice-records/practice-records?subjectId=${this.currentSubjectId}&view=${item.key}` })
			},
			featureCount(key) {
				if (key === 'wrong') return this.stats.wrong
				if (key === 'favorite') return this.stats.favorite
				if (key === 'history') return this.stats.attempted
				return 0
			}
		}
	}
</script>

<style lang="scss">
	page { background: #ffffff; color: #24272c; }
	.practice-home { min-height: 100vh; padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
	.subject-bar { display: flex; align-items: center; min-height: 96rpx; padding: 16rpx 32rpx; border-bottom: 1rpx solid #edf0f3; box-sizing: border-box; }
	.subject-symbol { display: flex; align-items: center; justify-content: center; width: 64rpx; height: 64rpx; margin-right: 20rpx; border-radius: 8rpx; background: #eaf5ff; }
	.subject-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.subject-label, .overview-subtitle, .section-caption, .sheet-caption { font-size: 24rpx; color: #7a7e83; }
	.subject-name { margin-top: 4rpx; font-size: 32rpx; font-weight: 600; }
	.subject-switch { display: flex; align-items: center; gap: 4rpx; font-size: 26rpx; color: #008cff; }
	.overview-band { padding: 32rpx; background: #008cff; color: #ffffff; }
	.overview-heading, .sheet-header, .section-heading { display: flex; align-items: center; justify-content: space-between; }
	.overview-heading > view:first-child, .sheet-header > view:first-child { display: flex; flex-direction: column; }
	.overview-title { font-size: 34rpx; font-weight: 600; }
	.overview-subtitle { margin-top: 8rpx; color: rgba(255, 255, 255, 0.78); }
	.goal-copy { font-size: 28rpx; font-weight: 600; }
	.overview-content { display: flex; align-items: center; margin-top: 30rpx; }
	.progress-ring { display: flex; align-items: center; justify-content: center; width: 190rpx; height: 190rpx; flex: 0 0 190rpx; border: 14rpx solid rgba(255, 255, 255, 0.88); border-radius: 50%; box-sizing: border-box; }
	.progress-ring-inner { display: flex; align-items: center; flex-direction: column; }
	.progress-value { font-size: 42rpx; font-weight: 600; }
	.progress-caption { margin-top: 4rpx; font-size: 22rpx; color: rgba(255, 255, 255, 0.76); }
	.stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24rpx 16rpx; flex: 1; margin-left: 40rpx; }
	.stat-item { display: flex; flex-direction: column; }
	.stat-value { font-size: 32rpx; font-weight: 600; }
	.stat-label { margin-top: 4rpx; font-size: 22rpx; color: rgba(255, 255, 255, 0.72); }
	.primary-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20rpx; padding: 28rpx 32rpx 20rpx; }
	.primary-actions button { display: flex; align-items: center; justify-content: center; gap: 12rpx; height: 84rpx; margin: 0; border-radius: 44rpx; font-size: 29rpx; font-weight: 600; line-height: 84rpx; }
	.primary-actions button::after { border: 0; }
	.primary-button { background: #008cff; color: #ffffff; }
	.secondary-button { border: 2rpx solid #008cff; background: #ffffff; color: #008cff; }
	.search-entry { display: flex; align-items: center; height: 82rpx; margin: 4rpx 32rpx 30rpx; padding: 0 24rpx; border: 1rpx solid #dfe3e8; border-radius: 8rpx; box-sizing: border-box; background: #f8f9fa; color: #858a92; font-size: 27rpx; }
	.search-entry text { flex: 1; margin-left: 14rpx; white-space: nowrap; }
	.section-heading { padding: 0 32rpx 20rpx; }
	.section-title { font-size: 32rpx; font-weight: 600; }
	.feature-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 0 16rpx; }
	.feature-item { display: flex; align-items: center; flex-direction: column; min-height: 196rpx; padding: 18rpx 8rpx; box-sizing: border-box; text-align: center; }
	.feature-icon { position: relative; display: flex; align-items: center; justify-content: center; width: 72rpx; height: 72rpx; border-radius: 8rpx; background: #eaf5ff; }
	.feature-icon.red { background: #fff0f0; }
	.feature-icon.yellow { background: #fff8e8; }
	.feature-icon.green { background: #ecf8f2; }
	.feature-icon.indigo { background: #f0f1ff; }
	.feature-icon.gray { background: #f1f3f5; }
	.feature-badge { position: absolute; top: -10rpx; right: -14rpx; min-width: 34rpx; height: 34rpx; padding: 0 8rpx; border: 3rpx solid #ffffff; border-radius: 18rpx; box-sizing: border-box; background: #e65757; color: #ffffff; font-size: 19rpx; line-height: 31rpx; }
	.feature-title { margin-top: 14rpx; font-size: 27rpx; font-weight: 500; }
	.feature-desc { margin-top: 6rpx; font-size: 21rpx; color: #8c9199; white-space: nowrap; }
	.bank-note { display: flex; align-items: center; gap: 10rpx; margin: 10rpx 32rpx 0; padding: 20rpx 22rpx; border-radius: 8rpx; background: #f5f6f8; font-size: 24rpx; color: #6f747d; }
	.bank-note.error { background: #fff2f2; color: #bd3f3f; }
	.subject-sheet { padding: 28rpx; border-radius: 16rpx 16rpx 0 0; background: #ffffff; }
	.sheet-header { padding: 0 4rpx 24rpx; border-bottom: 1rpx solid #edf0f3; }
	.sheet-title { font-size: 34rpx; font-weight: 600; }
	.sheet-caption { margin-top: 6rpx; }
	.sheet-close { padding: 12rpx; }
	.subject-scroll { max-height: 68vh; }
	.subject-group { padding: 26rpx 4rpx 4rpx; }
	.group-title { font-size: 29rpx; font-weight: 600; }
	.subject-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16rpx; margin-top: 18rpx; }
	.subject-option { display: flex; align-items: flex-start; flex-direction: column; justify-content: center; min-height: 82rpx; padding: 12rpx 18rpx; border: 2rpx solid transparent; border-radius: 8rpx; box-sizing: border-box; background: #f3f4f6; font-size: 26rpx; }
	.subject-option.active { border-color: #008cff; background: #eaf5ff; color: #0074d4; }
	.subject-option.unavailable:not(.active) { color: #7d828a; }
	.subject-status { margin-top: 4rpx; font-size: 20rpx; color: #979ca5; }
</style>
