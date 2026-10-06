<template>
	<view class="practice-home" :class="{ 'night-mode': nightMode }">
		<view class="subject-bar" @tap="openSubjectPicker">
			<view class="subject-copy">
				<text class="subject-label">当前科目</text>
				<text class="subject-name">{{ currentSubject.name }}</text>
			</view>
			<view class="subject-switch">
				<text>切换</text>
				<uni-icons type="bottom" :size="wideScreen ? 20 : 15" color="#008cff"></uni-icons>
			</view>
		</view>

		<view class="overview-card">
			<view class="card-heading">
				<text class="card-title">学习概况</text>
			</view>

			<view class="completion-heading">
				<view class="completion-copy">
					<text class="overview-subtitle">已练习 {{ stats.attempted }} / {{ questionTotalText }} 题</text>
				</view>
				<text class="completion-value">{{ completionText }}</text>
			</view>

			<view class="completion-progress">
				<view class="completion-progress-fill" :style="{ width: stats.completion + '%' }"></view>
			</view>

			<view class="stat-grid">
				<view class="stat-item">
					<text class="stat-value">{{ stats.correct }}</text>
					<text class="stat-label">答对题数</text>
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

			<view class="practice-card">
			<view class="card-heading">
				<text class="card-title">开始练习</text>
			</view>

			<view class="search-entry" @tap="goSearch">
				<uni-icons type="search" :size="wideScreen ? 30 : 20" color="#008cff"></uni-icons>
				<text>搜索题目或知识点</text>
				<uni-icons type="right" :size="wideScreen ? 22 : 16" color="#b6bbc3"></uni-icons>
			</view>

			<view class="feature-grid">
				<view class="feature-item" @tap="startPractice('smart')">
					<view class="feature-icon">
						<uni-icons type="scan" :size="wideScreen ? 40 : 25" color="#008cff"></uni-icons>
					</view>
					<view class="feature-copy">
						<text class="feature-title">智能练习</text>
						<text class="feature-desc">智能推荐练习题目</text>
					</view>
				</view>
				<view class="feature-item" @tap="goChapter('chapter')">
					<view class="feature-icon">
						<uni-icons type="list" :size="wideScreen ? 40 : 25" color="#008cff"></uni-icons>
					</view>
					<view class="feature-copy">
						<text class="feature-title">章节练习</text>
						<text class="feature-desc">按章节系统练习</text>
					</view>
				</view>
				<view class="feature-item" v-for="item in features" :key="item.key" @tap="handleFeature(item)">
					<view class="feature-icon" :class="item.tone">
						<uni-icons :type="item.icon" :size="wideScreen ? 40 : 25" :color="item.color"></uni-icons>
						<view class="feature-member-badge" v-if="isLockedPracticeFeature(item.key)">会员</view>
						<view class="feature-badge" v-else-if="featureCount(item.key)">{{ featureCount(item.key) }}</view>
					</view>
					<view class="feature-copy">
						<text class="feature-title">{{ item.title }}</text>
						<text class="feature-desc">{{ item.desc }}</text>
					</view>
				</view>
			</view>
			</view>

			<view class="bank-note sync-warning" v-if="cloudSyncPending" @tap="openSyncConflict">
				<uni-icons
					:type="reconciliationState.error ? 'refreshempty' : 'cloud-upload'"
					:size="wideScreen ? 24 : 18"
					color="#a76a00"
				></uni-icons>
				<text>{{ cloudSyncNoticeText }}</text>
				<uni-icons type="right" :size="wideScreen ? 21 : 15" color="#a76a00"></uni-icons>
			</view>

			<view class="bank-note" v-if="currentCatalogPending">
			<uni-icons type="spinner-cycle" :size="wideScreen ? 24 : 18" color="#7a7e83"></uni-icons>
			<text>正在从云端加载题库数据...</text>
		</view>

			<view class="bank-note error" v-else-if="currentCatalogError" @tap="retryCatalog">
			<uni-icons type="refreshempty" :size="wideScreen ? 24 : 18" color="#d34d4d"></uni-icons>
			<text>{{ currentCatalogError }}，点击重试</text>
		</view>

			<view class="bank-note" v-else-if="!stats.total">
				<uni-icons type="info" :size="wideScreen ? 24 : 18" color="#7a7e83"></uni-icons>
				<text>该科目题库正在整理，可先切换到初级个人理财。</text>
			</view>

			<view
				class="bank-note"
				:class="{ error: !userDataSyncing }"
				v-if="userDataSyncing || userDataError"
				@tap="retryUserData"
			>
				<uni-icons
					:type="userDataSyncing ? 'spinner-cycle' : 'cloud-download'"
					:size="wideScreen ? 24 : 18"
					:color="userDataSyncing ? '#7a7e83' : '#d34d4d'"
				></uni-icons>
				<text v-if="userDataSyncing">{{ userDataSyncText }}</text>
				<text v-else>{{ userDataErrorText }}</text>
			</view>

		<uni-popup
			ref="subjectPopup"
			type="bottom"
			:background-color="nightMode ? '#1b222a' : '#ffffff'"
			@change="handleSubjectPopupChange"
		>
			<view class="subject-sheet">
				<view class="sheet-header">
					<view>
						<text class="sheet-title">切换考试科目</text>
						<text class="sheet-caption">练习记录会按科目分别保存</text>
					</view>
					<view class="sheet-close" @tap="closeSubjectPicker">
						<uni-icons type="closeempty" :size="wideScreen ? 30 : 24" :color="nightMode ? '#b6bec8' : '#5f6570'"></uni-icons>
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
	import { getCatalog, getCatalogSummaries } from '@/services/question-bank.js'
	import { markQuestionBankTabNoticeSeen } from '@/services/question-bank-tab-notice.js'
	import {
		flushPracticeEvents,
		getCachedPracticeSummary,
		getLocalPracticePreferences,
		getPracticePreferences,
		getPracticeReconciliationState,
		getPracticeSummary,
		pendingPracticeEventCount,
		preparePracticeReconciliation
	} from '@/services/user-practice.js'
	import {
		getCachedMembership,
		getMembership,
		showMembershipUpsell
	} from '@/services/membership.js'
	export default {
		data() {
			const localPreferences = getLocalPracticePreferences()
			const windowWidth = uni.getSystemInfoSync().windowWidth
			return {
				wideScreen: windowWidth >= 768,
				nightMode: Boolean(localPreferences.nightMode),
				subjectPickerVisible: false,
				membership: getCachedMembership(),
				membershipLoaded: false,
				currentSubjectId: '',
				subjectGroups,
				catalogStates: {},
				catalogRequestIds: {},
				nextCatalogRequestId: 0,
				nextCatalogSummariesRequestId: 0,
				nextUserDataRequestId: 0,
				userDataError: '',
				userDataSyncing: false,
				userDataPendingCount: pendingPracticeEventCount(),
				reconciliationState: getPracticeReconciliationState(),
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
					{ key: 'wrong', title: '错题集', desc: '集中攻克薄弱项', icon: 'refresh', color: '#008cff', tone: 'blue' },
					{ key: 'favorite', title: '收藏夹', desc: '保存重点题目', icon: 'star', color: '#008cff', tone: 'blue' },
					{ key: 'knowledge', title: '知识点', desc: '按考点专项练习', icon: 'map', color: '#008cff', tone: 'blue' },
					{ key: 'settings', title: '答题设置', desc: '答题模式与夜间模式', icon: 'tune', color: '#008cff', tone: 'blue' }
				]
			}
		},
		computed: {
			cloudSyncPending() {
				return ['checking', 'required', 'replacing', 'restoring'].indexOf(
					this.reconciliationState.status
				) > -1
			},
			cloudSyncNoticeText() {
				if (this.reconciliationState.error) {
					return `${this.reconciliationState.error}，点击继续处理`
				}
				if (this.reconciliationState.status === 'required') {
					return '本机与云端学习进度不同，点击选择保留哪一份'
				}
				if (this.reconciliationState.status === 'replacing') {
					return '正在用本机进度重建云端，点击查看进度'
				}
				if (this.reconciliationState.status === 'restoring') {
					return '正在恢复云端学习进度，点击查看进度'
				}
				return '正在检查本机与云端学习进度'
			},
			userDataSyncText() {
				const pending = this.userDataPendingCount
				return `正在同步${pending ? `，剩余 ${pending} 条` : ''}，请保持小程序在前台`
			},
			userDataErrorText() {
				const pending = this.userDataPendingCount
				return `云同步失败${pending ? `，剩余 ${pending} 条` : ''}：${this.userDataError}，点击重试`
			},
			currentSubject() {
				return getSubjectById(this.currentSubjectId)
			},
			currentCatalogState() {
				return this.catalogStates[this.currentSubjectId] || {
					loading: false,
					loaded: false,
					questionCount: 0,
					activeVersion: '',
					source: '',
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
			},
			todayGoalReached() {
				const goal = Number(this.today.goal) || 0
				return goal > 0 && Number(this.today.attempts) >= goal
			},
			todayGoalStatus() {
				return this.todayGoalReached
					? '已达标'
					: `${this.today.attempts}/${this.today.goal}题`
			},
			todayGoalCaption() {
				if (this.todayGoalReached) return `今天已完成 ${this.today.attempts} 题`
				const remaining = Math.max(0, Number(this.today.goal) - Number(this.today.attempts))
				return `再完成 ${remaining} 题即可达标`
			},
			todayProgressPercent() {
				return Math.max(0, Math.min(100, Number(this.today.percent) || 0))
			}
		},
		async onShow() {
			this.subjectPickerVisible = false
			// #ifdef MP-WEIXIN
			uni.showTabBar({ animation: false })
			// #endif
			markQuestionBankTabNoticeSeen()
			this.userDataPendingCount = pendingPracticeEventCount()
			const membershipTask = this.refreshMembership()
			try {
				await this.refreshNightMode()
			} catch (error) {
				this.applyNightMode(getLocalPracticePreferences())
			}
			const state = getPracticeState()
			this.currentSubjectId = state.currentSubjectId
			this.refreshStats(this.subjectQuestionCount(this.currentSubjectId))
			await Promise.all([
				this.loadCatalog(this.currentSubjectId),
				membershipTask
			])
		},
		onResize(event) {
			const width = Number(event && event.size && event.size.windowWidth)
			this.wideScreen = (width || uni.getSystemInfoSync().windowWidth) >= 768
		},
		onHide() {
			this.subjectPickerVisible = false
			this.applyTabBarTheme(false)
		},
		methods: {
			handleSubjectPopupChange(event) {
				this.subjectPickerVisible = Boolean(event && event.show)
				// #ifdef MP-WEIXIN
				if (this.subjectPickerVisible) uni.hideTabBar({ animation: false })
				else uni.showTabBar({ animation: false })
				// #endif
			},
			async refreshMembership() {
				try {
					this.membership = await getMembership()
				} catch (error) {
					this.membership = getCachedMembership()
				} finally {
					this.membershipLoaded = true
				}
				if (this.membership.isMember) {
					try {
						this.reconciliationState = await preparePracticeReconciliation({
							subjectIds: this.allSubjectIds(),
							onProgress: state => { this.reconciliationState = Object.assign({}, state) }
						})
					} catch (error) {
						this.reconciliationState = getPracticeReconciliationState()
					}
				} else {
					this.reconciliationState = getPracticeReconciliationState()
				}
				if (this.reconciliationState.status === 'ready' && this.currentSubjectId) {
					this.refreshStats(this.subjectQuestionCount(this.currentSubjectId))
					this.loadCloudStats(this.currentSubjectId)
				}
				return this.membership
			},
			allSubjectIds() {
				return this.subjectGroups.reduce((result, group) => (
					result.concat(group.items.map(item => item.id))
				), [])
			},
			openSyncConflict() {
				uni.navigateTo({ url: '/practice-pages/sync-conflict/sync-conflict' })
			},
			applyNightMode(preferences) {
				this.nightMode = Boolean(preferences && preferences.nightMode)
				uni.setNavigationBarColor({
					frontColor: this.nightMode ? '#ffffff' : '#000000',
					backgroundColor: this.nightMode ? '#171c22' : '#ffffff'
				})
				this.applyTabBarTheme(this.nightMode)
			},
			applyTabBarTheme(nightMode) {
				uni.setTabBarStyle({
					color: nightMode ? '#8f99a5' : '#7A7E83',
					selectedColor: '#008cff',
					backgroundColor: nightMode ? '#171c22' : '#ffffff',
					borderStyle: 'black'
				})
			},
			async refreshNightMode() {
				this.applyNightMode(getLocalPracticePreferences())
				const preferences = await getPracticePreferences()
				this.applyNightMode(preferences)
			},
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
				this.userDataPendingCount = pendingPracticeEventCount()
				const cachedSummary = getCachedPracticeSummary(subjectId)
				if (cachedSummary && subjectId === this.currentSubjectId) {
					this.applyCloudSummary(cachedSummary)
				}
				try {
					const summary = await getPracticeSummary(subjectId, {
						localState: getPracticeState()
					})
					if (requestId !== this.nextUserDataRequestId || subjectId !== this.currentSubjectId) return
					this.applyCloudSummary(summary)
					this.userDataPendingCount = pendingPracticeEventCount()
				} catch (error) {
					if (requestId !== this.nextUserDataRequestId || subjectId !== this.currentSubjectId) return
					this.userDataPendingCount = pendingPracticeEventCount()
					this.userDataError = (error && (error.errMsg || error.message)) || '做题记录同步失败'
				}
			},
			applyCloudSummary(summary) {
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
			},
			async retryUserData() {
				if (this.userDataSyncing) return
				this.reconciliationState = getPracticeReconciliationState()
				if (this.cloudSyncPending) {
					this.openSyncConflict()
					return
				}
				this.userDataSyncing = true
				this.userDataError = ''
				this.userDataPendingCount = pendingPracticeEventCount()
				const pendingTimer = setInterval(() => {
					this.userDataPendingCount = pendingPracticeEventCount()
				}, 300)
				try {
					const syncResult = await flushPracticeEvents({ localState: getPracticeState() })
					this.userDataPendingCount = pendingPracticeEventCount()
					const summary = await getPracticeSummary(this.currentSubjectId, {
						forceRefresh: true,
						localState: getPracticeState()
					})
					this.applyCloudSummary(summary)
					if (syncResult && syncResult.rejectedEventCount) {
						uni.showToast({
							title: `同步完成，跳过 ${syncResult.rejectedEventCount} 条失效记录`,
							icon: 'none'
						})
					} else {
						uni.showToast({ title: '云同步完成', icon: 'success' })
					}
				} catch (error) {
					this.userDataPendingCount = pendingPracticeEventCount()
					this.userDataError = (error && (error.errMsg || error.message)) || '做题记录同步失败'
					uni.showToast({ title: '同步失败，请稍后重试', icon: 'none' })
				} finally {
					clearInterval(pendingTimer)
					this.userDataSyncing = false
				}
			},
			async loadCatalogSummaries(options) {
				const config = options || {}
				const requestId = ++this.nextCatalogSummariesRequestId
				const subjects = []
				this.subjectGroups.forEach(group => {
					group.items.forEach(subject => subjects.push(subject))
				})
				const loadingStates = Object.assign({}, this.catalogStates)
				subjects.forEach(subject => {
					const previous = loadingStates[subject.id] || {
						loaded: false,
						questionCount: 0,
						activeVersion: '',
						source: '',
						error: ''
					}
					loadingStates[subject.id] = Object.assign({}, previous, {
						loading: !previous.loaded,
						error: ''
					})
				})
				this.catalogStates = loadingStates
				try {
					const summaries = await getCatalogSummaries(config)
					if (requestId !== this.nextCatalogSummariesRequestId) return
					const currentState = this.catalogStates[this.currentSubjectId]
					const currentSummary = (summaries || []).find(item => (
						item && item.subjectId === this.currentSubjectId
					))
					const currentSummaryCount = Number(currentSummary && currentSummary.questionCount)
					const summaryConflictsWithCatalog = currentState
						&& currentState.loaded
						&& currentState.source === 'catalog'
						&& currentState.questionCount > 0
						&& (!currentSummary
							|| !Number.isInteger(currentSummaryCount)
							|| currentSummaryCount <= 0
							|| currentState.activeVersion
								&& (currentSummary.activeVersion !== currentState.activeVersion
									|| currentSummaryCount !== currentState.questionCount))
					if (!config.forceRefresh && summaryConflictsWithCatalog) {
						return this.loadCatalogSummaries({ forceRefresh: true })
					}
					const summaryBySubject = {}
					;(summaries || []).forEach(item => {
						if (item && item.subjectId) summaryBySubject[item.subjectId] = item
					})
					const nextStates = Object.assign({}, this.catalogStates)
					subjects.forEach(subject => {
						const summary = summaryBySubject[subject.id]
						const parsedCount = Number(summary && summary.questionCount)
						const previous = nextStates[subject.id] || {}
						const preserveCatalog = previous.loaded
							&& previous.source === 'catalog'
							&& previous.questionCount > 0
							&& (!summary
								|| !Number.isInteger(parsedCount)
								|| parsedCount <= 0
								|| (previous.activeVersion
									&& summary.activeVersion === previous.activeVersion))
						if (preserveCatalog) {
							nextStates[subject.id] = Object.assign({}, previous, {
								loading: false,
								error: ''
							})
							return
						}
						nextStates[subject.id] = {
							loading: false,
							loaded: true,
							questionCount: Number.isInteger(parsedCount) && parsedCount >= 0
								? parsedCount
								: 0,
							activeVersion: summary && summary.activeVersion || '',
							source: 'summary',
							error: ''
						}
					})
					this.catalogStates = nextStates
					this.refreshStats(this.subjectQuestionCount(this.currentSubjectId))
				} catch (error) {
					if (requestId !== this.nextCatalogSummariesRequestId) return
					const errorMessage = (error && (error.errMsg || error.message)) || '题库目录加载失败'
					const nextStates = Object.assign({}, this.catalogStates)
					subjects.forEach(subject => {
						const previous = nextStates[subject.id] || {}
						nextStates[subject.id] = Object.assign({}, previous, {
							loading: false,
							error: previous.loaded ? '' : errorMessage
						})
					})
					this.catalogStates = nextStates
					await this.loadCatalog(this.currentSubjectId, config)
				}
			},
			async loadCatalog(subjectId, options) {
				const previous = this.catalogStates[subjectId] || {
					loaded: false,
					questionCount: 0,
					activeVersion: '',
					source: '',
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
							activeVersion: catalog && catalog.activeVersion || '',
							source: 'catalog',
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
						[subjectId]: Object.assign({}, previous, {
							loading: false,
							loaded: unavailable || previous.loaded,
							questionCount,
							error: errorMessage
						})
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
				const request = this.loadCatalogSummaries()
				this.$refs.subjectPopup.open()
				return request
			},
			closeSubjectPicker() {
				this.$refs.subjectPopup.close()
			},
			changeSubject(subjectId) {
				this.currentSubjectId = subjectId
				selectSubject(subjectId)
				this.refreshStats(this.subjectQuestionCount(subjectId))
				this.closeSubjectPicker()
				return this.loadCatalog(subjectId)
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
			goAnswerSettings() {
				uni.navigateTo({ url: '/practice-pages/answer-settings/answer-settings' })
			},
			async handleFeature(item) {
				if (item.key === 'settings') {
					this.goAnswerSettings()
					return
				}
				if (item.key === 'knowledge') {
					this.goChapter(item.key)
					return
				}
				if (item.key === 'wrong' || item.key === 'favorite') {
					if (!this.membershipLoaded) await this.refreshMembership()
					if (!this.membership.isMember) {
						await showMembershipUpsell(item.key === 'wrong'
							? '开通会员后即可使用错题集，集中巩固薄弱题目。'
							: '开通会员后即可使用收藏夹，随时复习重点题目。')
						return
					}
				}
				if (!this.ensureQuestions()) return
				uni.navigateTo({ url: `/practice-pages/practice-records/practice-records?subjectId=${this.currentSubjectId}&view=${item.key}` })
			},
			isLockedPracticeFeature(key) {
				return (key === 'wrong' || key === 'favorite') && !this.membership.isMember
			},
			featureCount(key) {
				if (this.isLockedPracticeFeature(key)) return 0
				if (key === 'wrong') return this.stats.wrong
				if (key === 'favorite') return this.stats.favorite
				return 0
			}
		}
	}
</script>

<style lang="scss">
	page { background: #f5f6f8; color: #24272c; }
	.practice-home { min-height: 100vh; padding-bottom: calc(24rpx + env(safe-area-inset-bottom)); background: #f5f6f8; }
	.subject-bar { display: flex; align-items: center; min-height: 104rpx; padding: 18rpx 24rpx; border-bottom: 1rpx solid #edf0f3; box-sizing: border-box; background: #ffffff; }
	.subject-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; margin-left: 24rpx; }
	.subject-label, .sheet-caption { color: #7a828c; font-size: 25rpx; }
	.subject-name { margin-top: 5rpx; font-size: 33rpx; font-weight: 600; line-height: 1.3; }
	.subject-switch { display: flex; align-items: center; gap: 4rpx; padding: 10rpx 12rpx; border-radius: 12rpx; background: #f1f8fe; color: #008cff; font-size: 27rpx; }
	.overview-card,
	.practice-card { margin: 17rpx 24rpx 0; padding: 24rpx; border: 1rpx solid #e4eaf0; border-radius: 18rpx; background: #ffffff; box-shadow: 0 5rpx 18rpx rgba(31, 48, 65, 0.04); }
	.overview-card { margin-top: 21rpx; }
	.card-heading, .completion-heading, .sheet-header { display: flex; align-items: center; justify-content: space-between; }
	.card-title { font-size: 33rpx; font-weight: 600; }
	.completion-heading { margin-top: 24rpx; }
	.completion-copy, .sheet-header > view:first-child { display: flex; flex-direction: column; }
	.overview-subtitle { color: #7a828c; font-size: 27rpx; }
	.completion-value { color: #008cff; font-size: 41rpx; font-weight: 600; line-height: 1; }
	.completion-progress { height: 12rpx; margin-top: 18rpx; overflow: hidden; border-radius: 6rpx; background: #e9edf1; }
	.completion-progress-fill { height: 100%; border-radius: 6rpx; background: #008cff; transition: width 0.2s ease; }
	.stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12rpx; margin-top: 22rpx; padding-top: 22rpx; border-top: 1rpx solid #eef1f4; }
	.stat-item { display: flex; align-items: center; flex-direction: column; justify-content: center; min-height: 88rpx; border-radius: 12rpx; background: #f5f9fc; text-align: center; }
	.stat-value { color: #2f3944; font-size: 31rpx; font-weight: 600; line-height: 1.1; }
	.stat-label { margin-top: 8rpx; color: #7f8892; font-size: 25rpx; }
	.search-entry { display: flex; align-items: center; height: 82rpx; margin-top: 17rpx; padding: 0 20rpx; border: 1rpx solid #d6e7f4; border-radius: 14rpx; box-sizing: border-box; background: #f7fbfe; color: #56616d; font-size: 29rpx; }
	.search-entry text { flex: 1; margin-left: 14rpx; white-space: nowrap; }
	.feature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15rpx; margin-top: 17rpx; }
	.feature-item { display: flex; align-items: center; min-height: 126rpx; padding: 20rpx; border: 1rpx solid #edf1f4; border-radius: 14rpx; box-sizing: border-box; background: #f8fafc; }
	.feature-icon { position: relative; display: flex; align-items: center; justify-content: center; width: 72rpx; height: 72rpx; flex: 0 0 72rpx; border-radius: 12rpx; background: #eaf5ff; }
	.feature-badge { position: absolute; top: -10rpx; right: -14rpx; display: flex; align-items: center; justify-content: center; min-width: 34rpx; height: 34rpx; padding: 0 8rpx; border: 3rpx solid #ffffff; border-radius: 18rpx; box-sizing: border-box; background: #e65757; color: #ffffff; font-size: 18rpx; line-height: 1; text-align: center; }
	.feature-member-badge { position: absolute; top: -14rpx; right: -22rpx; height: 34rpx; padding: 0 10rpx; border: 3rpx solid #ffffff; border-radius: 18rpx; box-sizing: border-box; background: #30465f; color: #ffffff; font-size: 19rpx; line-height: 30rpx; white-space: nowrap; }
	.feature-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; margin-left: 18rpx; }
	.feature-title { font-size: 29rpx; font-weight: 600; line-height: 1.25; }
	.feature-desc { margin-top: 7rpx; color: #8c949d; font-size: 25rpx; line-height: 1.35; }
	.bank-note { display: flex; align-items: center; gap: 10rpx; margin: 11rpx 32rpx 0; padding: 20rpx 22rpx; border-radius: 8rpx; background: #f5f6f8; font-size: 25rpx; color: #6f747d; }
	.bank-note.sync-warning { background: #fff7e7; color: #8c5a00; }
	.bank-note.sync-warning text { flex: 1; }
	.bank-note.error { background: #fff2f2; color: #bd3f3f; }
	.subject-sheet { padding: 28rpx; border-radius: 16rpx 16rpx 0 0; background: #ffffff; }
	.sheet-header { padding: 0 4rpx 24rpx; border-bottom: 1rpx solid #edf0f3; }
	.sheet-title { font-size: 33rpx; font-weight: 600; }
	.sheet-caption { margin-top: 6rpx; }
	.sheet-close { padding: 12rpx; }
	.subject-scroll { height: 60vh; }
	.subject-group { padding: 26rpx 4rpx 4rpx; }
	.subject-group:last-child { padding-bottom: 28rpx; }
	.group-title { font-size: 31rpx; font-weight: 600; }
	.subject-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16rpx; margin-top: 18rpx; }
	.subject-option { display: flex; align-items: flex-start; flex-direction: column; justify-content: center; min-height: 82rpx; padding: 12rpx 18rpx; border: 2rpx solid transparent; border-radius: 8rpx; box-sizing: border-box; background: #f3f4f6; font-size: 29rpx; }
	.subject-option.active { border-color: #008cff; background: #eaf5ff; color: #0074d4; }
	.subject-option.unavailable:not(.active) { color: #7d828a; }
	.subject-status { margin-top: 4rpx; font-size: 23rpx; color: #979ca5; }

	.practice-home.night-mode { background: #12171d; color: #e6e9ed; }
	.night-mode .subject-bar { border-color: #303943; background: #171c22; }
	.night-mode .feature-icon { background: #17364d; }
	.night-mode .subject-switch { background: #17364d; color: #63b9f6; }
	.night-mode .subject-label,
	.night-mode .overview-subtitle,
	.night-mode .stat-label,
	.night-mode .feature-desc,
	.night-mode .sheet-caption { color: #8f99a5; }
	.night-mode .overview-card,
	.night-mode .practice-card { border-color: #29333d; background: #1b222a; box-shadow: none; }
	.night-mode .feature-item { border-color: #303943; background: #202933; }
	.night-mode .completion-value { color: #63b9f6; }
	.night-mode .completion-progress { background: #303943; }
	.night-mode .completion-progress-fill { background: #269df0; }
	.night-mode .stat-grid { border-color: #303943; }
	.night-mode .stat-item { background: #202933; }
	.night-mode .stat-value { color: #e6e9ed; }
	.night-mode .search-entry { border-color: #39434e; background: #202933; color: #c2c9d1; }
	.night-mode .feature-badge { border-color: #12171d; }
	.night-mode .feature-member-badge { border-color: #12171d; background: #49637f; }
	.night-mode .bank-note { background: #1b222a; color: #aeb7c1; }
	.night-mode .bank-note.sync-warning { background: #352d1f; color: #e0b45e; }
	.night-mode .bank-note.error { background: #3b2327; color: #ef9a9a; }
	.night-mode .subject-sheet { background: #1b222a; color: #e6e9ed; }
	.night-mode .sheet-header { border-color: #303943; }
	.night-mode .subject-option { background: #242c35; color: #c9d0d8; }
	.night-mode .subject-option.active { border-color: #269df0; background: #17364d; color: #63b9f6; }
	.night-mode .subject-option.unavailable:not(.active) { color: #8d97a2; }
	.night-mode .subject-status { color: #818c98; }

	@media screen and (min-width: 768px) {
		.practice-home {
			width: 100%;
			max-width: 820px;
			margin: 0 auto;
			padding-bottom: calc(24px + env(safe-area-inset-bottom));
			box-sizing: border-box;
		}

		.subject-bar { min-height: 104px; padding: 18px 24px; }
		.subject-copy { margin-left: 24px; }
		.subject-label, .sheet-caption { font-size: 25px; }
		.subject-name { margin-top: 5px; font-size: 33px; }
		.subject-switch { gap: 4px; padding: 10px 12px; border-radius: 12px; font-size: 27px; }
		.overview-card,
		.practice-card { margin: 17px 24px 0; padding: 24px; border-radius: 18px; }
		.overview-card { margin-top: 21px; }
		.card-title { font-size: 33px; }
		.completion-heading { margin-top: 24px; }
		.overview-subtitle { font-size: 27px; }
		.completion-value { font-size: 41px; }
		.completion-progress { height: 12px; margin-top: 18px; border-radius: 6px; }
		.stat-grid { gap: 12px; margin-top: 22px; padding-top: 22px; }
		.stat-item { min-height: 88px; border-radius: 12px; }
		.stat-value { font-size: 31px; }
		.stat-label { margin-top: 8px; font-size: 25px; }
		.search-entry { height: 82px; margin-top: 17px; padding: 0 20px; border-radius: 14px; font-size: 29px; }
		.search-entry text { margin-left: 14px; }
		.feature-grid { gap: 15px; margin-top: 17px; }
		.feature-item { min-height: 126px; padding: 20px; border-radius: 14px; }
		.feature-icon { width: 72px; height: 72px; flex-basis: 72px; border-radius: 12px; }
		.feature-badge { top: -10px; right: -14px; min-width: 34px; height: 34px; padding: 0 8px; border-width: 3px; border-radius: 18px; font-size: 18px; }
		.feature-member-badge { top: -14px; right: -22px; height: 34px; padding: 0 10px; border-width: 3px; border-radius: 18px; font-size: 19px; line-height: 30px; }
		.feature-copy { margin-left: 18px; }
		.feature-title { font-size: 29px; }
		.feature-desc { margin-top: 7px; font-size: 25px; }
		.bank-note { gap: 10px; margin: 11px 32px 0; padding: 20px 22px; border-radius: 8px; font-size: 25px; }
		.subject-sheet { max-width: 820px; margin: 0 auto; padding: 28px; border-radius: 16px 16px 0 0; box-sizing: border-box; }
		.sheet-header { padding: 0 4px 24px; }
		.sheet-title { font-size: 33px; }
		.sheet-caption { margin-top: 6px; }
		.sheet-close { padding: 12px; }
		.subject-group { padding: 26px 4px 4px; }
		.group-title { font-size: 31px; }
		.subject-options { gap: 16px; margin-top: 18px; }
		.subject-option { min-height: 82px; padding: 12px 18px; border-width: 2px; border-radius: 8px; font-size: 29px; }
		.subject-status { margin-top: 4px; font-size: 23px; }
	}

	/* 竖屏小尺寸平板：宽度够用，但纵向空间接近手机。 */
	@media screen and (min-width: 768px) and (max-height: 1050px) {
		.subject-bar { min-height: 78px; padding: 8px 22px; }
		.subject-copy { margin-left: 20px; }
		.subject-label { font-size: 21px; }
		.subject-name { margin-top: 2px; font-size: 27px; }
		.subject-switch { padding: 8px 10px; font-size: 23px; }
		.overview-card,
		.practice-card { margin: 10px 20px 0; padding: 16px 20px; border-radius: 14px; }
		.overview-card { margin-top: 12px; }
		.card-title { font-size: 28px; }
		.completion-heading { margin-top: 12px; }
		.overview-subtitle { font-size: 22px; }
		.completion-value { font-size: 34px; }
		.completion-progress { height: 8px; margin-top: 10px; }
		.stat-grid { gap: 10px; margin-top: 11px; padding-top: 11px; }
		.stat-item { min-height: 58px; }
		.stat-value { font-size: 26px; }
		.stat-label { margin-top: 4px; font-size: 20px; }
		.search-entry { height: 58px; margin-top: 10px; padding: 0 14px; font-size: 23px; }
		.feature-grid { gap: 8px; margin-top: 10px; }
		.feature-item { min-height: 84px; padding: 10px; }
		.feature-icon { width: 56px; height: 56px; flex-basis: 56px; }
		.feature-copy { margin-left: 14px; }
		.feature-title { font-size: 25px; }
		.feature-desc { margin-top: 3px; font-size: 21px; }
	}

</style>
