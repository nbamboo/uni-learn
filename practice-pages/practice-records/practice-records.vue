<template>
	<view class="records-page" :class="{ 'night-mode': nightMode }">
		<view class="records-header">
			<view class="subject-info">
				<text class="subject-label">当前科目</text>
				<text class="subject-name">{{ subject.name }}</text>
			</view>
			<view class="record-tabs">
				<view class="record-tab" :class="{ active: activeView === tab.key }" v-for="tab in tabs" :key="tab.key" @tap="switchView(tab.key)">
					{{ tab.label }}
				</view>
			</view>
		</view>

		<view class="records-summary">
			<view class="summary-count">
				<text class="summary-value">{{ total }}</text>
				<text class="summary-label">{{ activeTab.unit }}</text>
			</view>
			<button v-if="records.length" @tap="startAll">开始练习</button>
		</view>

		<view class="loading-state" v-if="loading">
			<uni-load-more status="loading" :color="nightMode ? '#8f99a5' : '#777777'"></uni-load-more>
		</view>

		<view class="empty-state error-state" v-else-if="loadError">
			<view class="empty-icon">
				<uni-icons type="cloud-download" size="42" color="#d34d4d"></uni-icons>
			</view>
			<text class="empty-title">记录加载失败</text>
			<text class="empty-caption">{{ loadError }}</text>
			<button @tap="retryLoad">重新加载</button>
		</view>

		<view class="record-list" v-else-if="records.length">
			<view class="record-item" v-for="(item, index) in records" :key="item.recordId" @tap="startFrom(item.question.id)">
				<view class="record-index">{{ index + 1 }}</view>
				<view class="record-content">
					<text class="record-title">{{ item.question.title }}</text>
					<view class="record-meta">
						<text>{{ item.question.knowledge }}</text>
						<text v-if="item.time">{{ item.time }}</text>
					</view>
				</view>
				<view class="record-status" :class="item.correct ? 'correct' : 'wrong'" v-if="activeView !== 'favorite'">
					<uni-icons :type="item.correct ? 'checkmarkempty' : 'closeempty'" size="18" :color="item.correct ? '#28a665' : '#e45151'"></uni-icons>
				</view>
				<view class="record-status favorite" v-else>
					<uni-icons type="star-filled" size="19" color="#e7a721"></uni-icons>
				</view>
			</view>
			<uni-load-more
				v-if="hasMore"
				:status="loadingMore ? 'loading' : 'more'"
				:color="nightMode ? '#8f99a5' : '#777777'"
				:content-text="{ contentdown: '加载更多', contentrefresh: '正在加载', contentnomore: '没有更多了' }"
				@clickLoadMore="loadMore"
			></uni-load-more>
		</view>

		<view class="empty-state" v-else>
			<view class="empty-icon">
				<uni-icons :type="activeTab.icon" size="42" :color="nightMode ? '#717c88' : '#9da3ab'"></uni-icons>
			</view>
			<text class="empty-title">{{ activeTab.emptyTitle }}</text>
			<text class="empty-caption">{{ activeTab.emptyCaption }}</text>
			<button @tap="goPractice">去刷题</button>
		</view>
	</view>
</template>

<script>
	import { getSubjectById } from '@/data/practice.js'
	import { getQuestionsByIds } from '@/services/question-bank.js'
	import {
		getLocalPracticePreferences,
		getPracticeRecords
	} from '@/services/user-practice.js'

	function formatRecordTime(timestamp) {
		const date = new Date(timestamp)
		const pad = value => value < 10 ? `0${value}` : value
		return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
	}

	export default {
		data() {
			const localPreferences = getLocalPracticePreferences()
			return {
				subjectId: '',
				activeView: 'wrong',
				records: [],
				total: 0,
				page: 1,
				hasMore: false,
				loading: true,
				loadingMore: false,
				loadError: '',
				requestId: 0,
				nightMode: Boolean(localPreferences.nightMode),
				tabs: [
					{ key: 'wrong', label: '错题集', unit: '道题待巩固', icon: 'refresh', emptyTitle: '暂时没有错题', emptyCaption: '继续保持，答错的题目会自动加入这里。' },
					{ key: 'favorite', label: '收藏夹', unit: '道题已收藏', icon: 'star', emptyTitle: '还没有收藏题目', emptyCaption: '刷题时点亮星标，重点题目会出现在这里。' }
				]
			}
		},
		computed: {
			subject() {
				return getSubjectById(this.subjectId)
			},
			activeTab() {
				return this.tabs.find(item => item.key === this.activeView) || this.tabs[0]
			}
		},
		onLoad(options) {
			this.subjectId = options.subjectId
			this.activeView = this.tabs.some(item => item.key === options.view) ? options.view : 'wrong'
			this.applyNavigationTheme()
		},
		onShow() {
			this.nightMode = Boolean(getLocalPracticePreferences().nightMode)
			this.applyNavigationTheme()
			this.loadRecords()
		},
		methods: {
			applyNavigationTheme() {
				uni.setNavigationBarColor({
					frontColor: this.nightMode ? '#ffffff' : '#000000',
					backgroundColor: this.nightMode ? '#171c22' : '#ffffff'
				})
			},
			switchView(view) {
				this.activeView = view
				this.loadRecords(true)
			},
			async loadRecords(reset, forceRefresh) {
				const shouldReset = reset !== false
				const requestId = ++this.requestId
				if (shouldReset) {
					this.loading = true
					this.loadError = ''
					this.records = []
					this.total = 0
					this.page = 1
				} else {
					this.loadingMore = true
				}
				try {
					const result = await getPracticeRecords({
						subjectId: this.subjectId,
						type: this.activeView,
						page: this.page,
						pageSize: 20,
						forceRefresh: Boolean(forceRefresh)
					})
					if (requestId !== this.requestId) return
					let sourceItems = result.items || []
					if (result._localOnly && sourceItems.length) {
						const questionIds = sourceItems.map(item => item.question.id)
						const questions = await getQuestionsByIds({
							subjectId: this.subjectId,
							questionIds
						})
						const questionMap = new Map((questions.items || []).map(question => [question.id, question]))
						sourceItems = sourceItems.map(item => Object.assign({}, item, {
							question: questionMap.get(item.question.id)
						})).filter(item => item.question)
					}
					if (requestId !== this.requestId) return
					const items = sourceItems.map(item => Object.assign({}, item, {
						time: item.timestamp ? formatRecordTime(item.timestamp) : ''
					}))
					this.records = shouldReset ? items : this.records.concat(items)
					if (result.total !== null && result.total !== undefined) {
						this.total = Number(result.total) || 0
					}
					this.hasMore = Boolean(result.hasMore)
				} catch (error) {
					if (requestId !== this.requestId) return
					this.loadError = (error && (error.errMsg || error.message)) || '记录加载失败'
				} finally {
					if (requestId === this.requestId) {
						this.loading = false
						this.loadingMore = false
					}
				}
			},
			loadMore() {
				if (!this.hasMore || this.loadingMore) return
				this.page += 1
				this.loadRecords(false)
			},
			retryLoad() {
				this.loadRecords(true, true)
			},
			startAll() {
				uni.navigateTo({ url: `/practice-pages/practice/practice?subjectId=${this.subjectId}&mode=${this.activeView}` })
			},
			startFrom(questionId) {
				uni.navigateTo({ url: `/practice-pages/practice/practice?subjectId=${this.subjectId}&mode=${this.activeView}&startId=${questionId}` })
			},
			goPractice() {
				uni.navigateTo({ url: `/practice-pages/practice/practice?subjectId=${this.subjectId}&mode=smart` })
			}
		}
	}
</script>

<style lang="scss">
	page { background: #f5f6f8; color: #292d32; }
	.records-page { min-height: 100vh; padding-bottom: 40rpx; }
	.records-header { padding: 28rpx 24rpx 22rpx; background: #ffffff; }
	.subject-info { display: flex; flex-direction: column; padding: 0 6rpx; }
	.subject-label { color: #9aa1aa; font-size: 21rpx; line-height: 1.2; }
	.subject-name { margin-top: 8rpx; color: #292d32; font-size: 30rpx; font-weight: 600; line-height: 1.35; }
	.record-tabs { display: flex; height: 72rpx; margin-top: 24rpx; padding: 6rpx; border-radius: 14rpx; box-sizing: border-box; background: #f1f3f6; }
	.record-tab { display: flex; align-items: center; justify-content: center; flex: 1; border-radius: 10rpx; color: #68707a; font-size: 26rpx; transition: color 0.16s ease, background-color 0.16s ease; }
	.record-tab.active { background: #ffffff; color: #008cff; font-weight: 600; box-shadow: 0 2rpx 8rpx rgba(35, 54, 72, 0.08); }
	.records-summary { display: flex; align-items: center; justify-content: space-between; min-height: 112rpx; margin: 18rpx 24rpx 0; padding: 22rpx 24rpx; border: 1rpx solid #e0edf7; border-radius: 14rpx; box-sizing: border-box; background: #ffffff; box-shadow: 0 4rpx 14rpx rgba(29, 47, 63, 0.035); }
	.summary-count { display: flex; align-items: baseline; min-width: 0; }
	.summary-value { color: #008cff; font-size: 42rpx; font-weight: 700; line-height: 1; }
	.summary-label { margin-left: 10rpx; color: #68717c; font-size: 23rpx; }
	.records-summary button { display: flex; align-items: center; justify-content: center; height: 62rpx; margin: 0 0 0 24rpx; padding: 0 26rpx; border: 0; border-radius: 31rpx; box-sizing: border-box; background: #008cff; color: #ffffff; font-size: 24rpx; font-weight: 500; line-height: 1; }
	.records-summary button::after, .empty-state button::after { border: 0; }
	.record-list { padding: 16rpx 24rpx 0; }
	.record-item { display: flex; align-items: flex-start; min-height: 126rpx; margin-bottom: 14rpx; padding: 22rpx 20rpx; border: 1rpx solid #edf1f5; border-radius: 14rpx; box-sizing: border-box; background: #ffffff; }
	.record-index { display: flex; align-items: center; justify-content: center; width: 48rpx; height: 48rpx; flex: 0 0 48rpx; margin: 2rpx 18rpx 0 0; border-radius: 10rpx; background: #f0f2f5; color: #707680; font-size: 23rpx; }
	.record-content { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.record-title { display: -webkit-box; overflow: hidden; font-size: 27rpx; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
	.record-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 11rpx; color: #92979f; font-size: 21rpx; }
	.record-meta text:first-child { max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.record-status { display: flex; align-items: center; justify-content: center; width: 46rpx; height: 46rpx; flex: 0 0 46rpx; margin: 2rpx 0 0 16rpx; border-radius: 50%; }
	.record-status.correct { background: #eff9f4; }
	.record-status.wrong { background: #fff2f2; }
	.record-status.favorite { background: #fff8e6; }
	.empty-state { display: flex; align-items: center; flex-direction: column; padding: 150rpx 52rpx; text-align: center; }
	.loading-state { display: flex; align-items: center; justify-content: center; min-height: 45vh; }
	.empty-icon { display: flex; align-items: center; justify-content: center; width: 100rpx; height: 100rpx; border-radius: 8rpx; background: #eceff2; }
	.empty-title { margin-top: 26rpx; font-size: 31rpx; font-weight: 600; }
	.empty-caption { margin-top: 12rpx; color: #8a9098; font-size: 25rpx; line-height: 1.6; }
	.empty-state button { height: 76rpx; margin-top: 30rpx; padding: 0 42rpx; border-radius: 40rpx; background: #008cff; color: #ffffff; font-size: 27rpx; line-height: 76rpx; }
	.error-state { color: #bd3f3f; }
	.records-page.night-mode { background: #12171d; color: #e6e9ed; }
	.night-mode .records-header { background: #171c22; }
	.night-mode .subject-label,
	.night-mode .record-tab,
	.night-mode .summary-label,
	.night-mode .record-meta,
	.night-mode .empty-caption { color: #8f99a5; }
	.night-mode .subject-name { color: #e6e9ed; }
	.night-mode .record-tabs { background: #11161b; }
	.night-mode .record-tab.active { background: #25303a; box-shadow: none; }
	.night-mode .record-tab.active,
	.night-mode .summary-value { color: #63b9f6; }
	.night-mode .records-summary { border-color: #2b3c49; background: #1b222a; box-shadow: none; }
	.night-mode .records-summary button,
	.night-mode .empty-state button { background: #168ee5; }
	.night-mode .record-item { border-color: #29333d; background: #1b222a; }
	.night-mode .record-index,
	.night-mode .empty-icon { background: #242c35; color: #aeb7c1; }
	.night-mode .record-status.correct { background: #1e372e; }
	.night-mode .record-status.wrong { background: #3b2327; }
	.night-mode .record-status.favorite { background: #3a321e; }
	.night-mode .error-state { color: #ef9a9a; }
</style>
