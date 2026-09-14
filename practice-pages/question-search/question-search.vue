<template>
	<view class="search-page" :class="{ 'night-mode': nightMode }">
		<view class="search-bar">
			<uni-icons type="search" size="21" :color="nightMode ? '#8fa0af' : '#737983'"></uni-icons>
			<input v-model="keyword" :focus="true" placeholder="输入题目、章节或知识点" placeholder-class="search-placeholder" confirm-type="search" />
			<view class="clear-button" v-if="keyword" @tap="keyword = ''">
				<uni-icons type="clear" size="19" :color="nightMode ? '#8fa0af' : '#a0a5ad'"></uni-icons>
			</view>
		</view>

		<view class="loading-state" v-if="loading && !results.length">
			<uni-load-more status="loading"></uni-load-more>
		</view>

		<view class="quick-keywords" v-else-if="!keyword">
			<view class="section-heading">
				<text>热门知识点</text>
				<text>{{ subject.name }}</text>
			</view>
			<view class="keyword-list">
				<view class="keyword-chip" v-for="item in popularKnowledge" :key="item.name" @tap="keyword = item.name">
					<text>{{ item.name }}</text>
					<text>{{ item.count }}题</text>
				</view>
			</view>
		</view>

		<view v-else>
			<view class="result-heading">
				<text>搜索结果</text>
				<view class="result-counts">
					<text class="exam-progress-copy" v-if="answerMode === 'exam' && examProgress.hasProgress">测试进度 {{ examProgress.answered }}/{{ examProgress.total }}</text>
					<text>{{ total }} 道</text>
				</view>
			</view>
			<view class="result-list" v-if="results.length">
				<view class="result-item" v-for="(question, index) in results" :key="question.id" @tap="startQuestion(question.id)">
					<view class="result-index">{{ index + 1 }}</view>
					<view class="result-content">
						<text class="result-title">{{ question.title }}</text>
						<view class="result-meta">
							<text>{{ question.knowledge }}</text>
							<text>{{ questionTypeLabel(question.type) }}</text>
						</view>
					</view>
					<uni-icons type="right" size="17" color="#a4a9b0"></uni-icons>
				</view>
				<uni-load-more
					v-if="hasMore"
					:status="loadingMore ? 'loading' : 'more'"
					:content-text="{ contentdown: '加载更多', contentrefresh: '正在加载', contentnomore: '没有更多了' }"
					@clickLoadMore="loadMore"
				></uni-load-more>
			</view>

			<view class="empty-state" v-else>
				<uni-icons type="search" size="42" :color="nightMode ? '#72808d' : '#a1a7ae'"></uni-icons>
				<text class="empty-title">没有找到相关题目</text>
				<text class="empty-caption">换个关键词试试</text>
			</view>
		</view>

		<!-- #ifdef MP-WEIXIN -->
		<view class="search-ad-container" v-if="showAds">
			<ad-custom
				unit-id="adunit-482241fd0b438f17"
				@load="adLoad"
				@error="adError"
				@close="adClose"
			></ad-custom>
		</view>
		<!-- #endif -->
	</view>
</template>

<script>
	import { getKnowledgeGroups } from '@/data/practice-questions.js'
	import { getSubjectById } from '@/data/practice.js'
	import { getQuestionTypeLabel } from '@/data/question-types.js'
	import { searchQuestionBank } from '@/services/question-bank.js'
	import { getCachedMembership, getMembership } from '@/services/membership.js'
	import {
		examDraftHasProgress,
		getExamDraftScope,
		getExamDraftSummaries,
		getLocalPracticePreferences,
		resetExamDraft
	} from '@/services/user-practice.js'

	export default {
		data() {
			const preferences = getLocalPracticePreferences()
			return {
				nightMode: Boolean(preferences.nightMode),
				membership: getCachedMembership(),
				membershipLoaded: false,
				subjectId: '',
				keyword: '',
				results: [],
				total: 0,
				cursor: 0,
				hasMore: false,
				popularKnowledge: [],
				loading: true,
				loadingMore: false,
				searchTimer: null,
				searchRequestId: 0,
				answerMode: preferences.answerMode,
				examProgress: {},
				entryActionPending: false
			}
		},
		computed: {
			subject() {
				return getSubjectById(this.subjectId)
			},
			showAds() {
				return this.membershipLoaded && !this.membership.isMember
			}
		},
		watch: {
			keyword() {
				if (this.searchTimer) clearTimeout(this.searchTimer)
				this.searchTimer = setTimeout(() => this.search(true), 300)
			}
		},
		async onLoad(options) {
			this.applyNightMode(getLocalPracticePreferences())
			this.subjectId = options.subjectId
			const membershipTask = this.refreshMembership()
			try {
				const knowledgeGroups = await getKnowledgeGroups(this.subjectId)
				this.popularKnowledge = knowledgeGroups.slice(0, 10)
			} catch (error) {
				this.popularKnowledge = []
			} finally {
				this.loading = false
			}
			await membershipTask
		},
		onShow() {
			this.applyNightMode(getLocalPracticePreferences())
			this.answerMode = getLocalPracticePreferences().answerMode
			if (this.keyword.trim()) this.refreshExamProgress(this.keyword.trim())
		},
		onUnload() {
			if (this.searchTimer) clearTimeout(this.searchTimer)
		},
		methods: {
			questionTypeLabel(type) {
				return getQuestionTypeLabel(type)
			},
			applyNightMode(preferences) {
				this.nightMode = Boolean(preferences && preferences.nightMode)
				uni.setNavigationBarColor({
					frontColor: this.nightMode ? '#ffffff' : '#000000',
					backgroundColor: this.nightMode ? '#171c22' : '#ffffff'
				})
			},
			async refreshMembership() {
				try {
					this.membership = await getMembership()
				} catch (error) {
					this.membership = getCachedMembership()
				} finally {
					this.membershipLoaded = true
				}
			},
			async search(reset) {
				const keyword = this.keyword.trim()
				const requestId = ++this.searchRequestId
				if (!keyword) {
					this.results = []
					this.total = 0
					this.cursor = 0
					this.hasMore = false
					this.loading = false
					this.loadingMore = false
					return
				}
				if (reset) {
					this.loading = true
					this.results = []
					this.total = 0
					this.cursor = 0
				} else {
					this.loadingMore = true
				}
				try {
					const result = await searchQuestionBank({
						subjectId: this.subjectId,
						keyword,
						cursor: reset ? 0 : this.cursor,
						pageSize: 20
					})
					if (requestId !== this.searchRequestId || keyword !== this.keyword.trim()) return
					const items = result.items || []
					this.results = reset ? items : this.results.concat(items)
					if (result.total !== null && result.total !== undefined) this.total = Number(result.total) || 0
					this.cursor = Number(result.nextCursor) || 0
					this.hasMore = Boolean(result.hasMore)
					if (reset) this.refreshExamProgress(keyword)
				} catch (error) {
					if (requestId === this.searchRequestId) {
						uni.showToast({ title: (error && (error.errMsg || error.message)) || '搜索失败', icon: 'none' })
					}
				} finally {
					if (requestId === this.searchRequestId) {
						this.loading = false
						this.loadingMore = false
					}
				}
			},
			loadMore() {
				if (!this.hasMore || this.loadingMore) return
				this.search(false)
			},
			async refreshExamProgress(keyword) {
				if (this.answerMode !== 'exam' || !keyword) {
					this.examProgress = {}
					return
				}
				const scope = getExamDraftScope({
					subjectId: this.subjectId,
					mode: 'search',
					keyword
				})
				const result = await getExamDraftSummaries(this.subjectId)
				if (keyword !== this.keyword.trim()) return
				this.examProgress = scope && result && result.summaries
					? result.summaries[scope.scopeKey] || {}
					: {}
			},
			startQuestion(questionId) {
				const keyword = encodeURIComponent(this.keyword.trim())
				let url = `/practice-pages/practice/practice?subjectId=${this.subjectId}&mode=search&keyword=${keyword}&startId=${questionId}`
				if (this.answerMode !== 'exam') {
					uni.navigateTo({ url })
					return
				}
				if (this.entryActionPending) return
				const scope = getExamDraftScope({
					subjectId: this.subjectId,
					mode: 'search',
					keyword: this.keyword.trim()
				})
				const summary = this.examProgress
				const navigate = action => uni.navigateTo({ url: `${url}&examAction=${action}` })
				if (!examDraftHasProgress(summary)) {
					navigate('restart')
					return
				}
				this.entryActionPending = true
				uni.showActionSheet({
					itemList: ['重新做题', '继续做题'],
					success: result => {
						if (result.tapIndex === 0) {
							resetExamDraft(Object.assign({}, scope, { roundId: summary.roundId }))
							navigate('restart')
						} else if (result.tapIndex === 1) {
							navigate('continue')
						}
					},
					complete: () => { this.entryActionPending = false }
				})
			},
			adLoad() {
				console.log('原生模板广告加载成功')
			},
			adError(error) {
				console.error('原生模板广告加载失败', error)
			},
			adClose() {
				console.log('原生模板广告关闭')
			}
		}
	}
</script>

<style lang="scss">
	page { background: #f5f6f8; color: #292d32; }
	.search-page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; background: #f5f6f8; }
	.search-bar { display: flex; align-items: center; height: 84rpx; padding: 0 22rpx; border: 2rpx solid #008cff; border-radius: 8rpx; box-sizing: border-box; background: #ffffff; }
	.search-bar input { flex: 1; height: 100%; margin-left: 14rpx; color: #292d32; font-size: 28rpx; }
	.search-placeholder { color: #8d949d; }
	.clear-button { padding: 12rpx 0 12rpx 16rpx; }
	.section-heading, .result-heading { display: flex; align-items: center; justify-content: space-between; padding: 30rpx 4rpx 18rpx; }
	.result-counts { display: flex; align-items: center; gap: 18rpx; color: #7a8088; font-size: 22rpx; }
	.exam-progress-copy { color: #008cff; }
	.section-heading text:first-child, .result-heading text:first-child { font-size: 31rpx; font-weight: 600; }
	.section-heading text:last-child, .result-heading text:last-child { color: #838991; font-size: 23rpx; }
	.keyword-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14rpx; }
	.keyword-chip { display: flex; align-items: center; justify-content: space-between; min-height: 76rpx; padding: 12rpx 18rpx; border: 1rpx solid #e2e5e9; border-radius: 8rpx; box-sizing: border-box; background: #ffffff; }
	.keyword-chip text:first-child { max-width: 75%; overflow: hidden; font-size: 25rpx; text-overflow: ellipsis; white-space: nowrap; }
	.keyword-chip text:last-child { color: #008cff; font-size: 20rpx; }
	.result-item { display: flex; align-items: center; min-height: 126rpx; margin-bottom: 14rpx; padding: 20rpx; border-radius: 8rpx; box-sizing: border-box; background: #ffffff; }
	.result-index { display: flex; align-items: center; justify-content: center; width: 48rpx; height: 48rpx; flex: 0 0 48rpx; margin-right: 18rpx; border-radius: 8rpx; background: #eaf5ff; color: #008cff; font-size: 23rpx; }
	.result-content { display: flex; flex: 1; flex-direction: column; min-width: 0; margin-right: 14rpx; }
	.result-title { display: -webkit-box; overflow: hidden; font-size: 27rpx; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
	.result-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 10rpx; color: #90969e; font-size: 21rpx; }
	.result-meta text:first-child { max-width: 72%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.empty-state { display: flex; align-items: center; flex-direction: column; padding-top: 180rpx; }
	.loading-state { display: flex; align-items: center; justify-content: center; min-height: 45vh; }
	.empty-title { margin-top: 22rpx; font-size: 30rpx; font-weight: 600; }
	.empty-caption { margin-top: 10rpx; color: #8d939b; font-size: 25rpx; }
	.search-ad-container { margin-top: 28rpx; overflow: hidden; border-radius: 8rpx; }

	.search-page.night-mode { background: #12171d; color: #e6e9ed; }
	.night-mode .search-bar { border-color: #269df0; background: #1b222a; }
	.night-mode .search-bar input { color: #e6e9ed; }
	.night-mode .search-placeholder { color: #7f8b97; }
	.night-mode .result-counts,
	.night-mode .section-heading text:last-child,
	.night-mode .result-heading text:last-child,
	.night-mode .result-meta,
	.night-mode .empty-caption { color: #8f99a5; }
	.night-mode .keyword-chip,
	.night-mode .result-item { border-color: #29333d; background: #1b222a; }
	.night-mode .keyword-chip text:first-child,
	.night-mode .result-title,
	.night-mode .empty-title { color: #e6e9ed; }
	.night-mode .keyword-chip text:last-child,
	.night-mode .exam-progress-copy { color: #63b9f6; }
	.night-mode .result-index { background: #17364d; color: #63b9f6; }
	.night-mode .empty-state { color: #e6e9ed; }
</style>
