<template>
	<view class="catalog-page" :class="{ 'night-mode': nightMode }">
		<view class="catalog-summary">
			<view>
				<text class="summary-label">{{ view === 'knowledge' ? '专项考点' : '教材目录' }}</text>
				<text class="summary-title">{{ subject.name }}</text>
			</view>
		</view>

		<view class="catalog-search" v-if="view === 'knowledge'">
			<uni-icons type="search" size="19" color="#8a8f99"></uni-icons>
			<input
				v-model="keyword"
				placeholder="搜索知识点"
				:placeholder-style="nightMode ? 'color:#6f7a86' : 'color:#a0a5ad'"
				confirm-type="search"
			/>
			<view v-if="keyword" @tap="keyword = ''">
				<uni-icons type="clear" size="18" color="#a0a5ad"></uni-icons>
			</view>
		</view>

		<view class="loading-state" v-if="loading">
			<uni-load-more status="loading" :color="nightMode ? '#8f99a5' : '#777777'"></uni-load-more>
		</view>

		<view class="empty-state error-state" v-else-if="loadError">
			<uni-icons type="refreshempty" size="38" color="#d34d4d"></uni-icons>
			<text>{{ loadError }}</text>
			<button @tap="retryLoad">重新加载</button>
		</view>

		<view class="catalog-list" v-else-if="filteredItems.length">
			<view class="catalog-item" v-for="(item, index) in filteredItems" :key="item.id" @tap="startItem(item)">
				<view class="item-index">{{ index + 1 }}</view>
				<view class="item-content">
					<text class="item-title">{{ item.name }}</text>
					<text class="item-meta" v-if="view === 'knowledge'">{{ item.chapter }}</text>
					<view class="item-progress-row" v-if="answerMode !== 'exam'">
						<view class="item-progress">
							<view class="item-progress-fill" :style="{ width: item.progress.percent + '%' }"></view>
						</view>
						<text>{{ item.progress.attempted }}/{{ item.progress.total }}</text>
					</view>
				</view>
				<view class="item-action">
					<uni-icons type="right" size="18" color="#008cff"></uni-icons>
				</view>
			</view>
		</view>

		<view class="empty-state" v-else>
			<uni-icons type="search" size="38" color="#a3a8af"></uni-icons>
			<text>{{ view === 'knowledge' ? '没有找到相关知识点' : '当前科目没有可用章节' }}</text>
		</view>
	</view>
</template>

<script>
	import {
		getChapterProgress,
		getPracticeState,
		getSubjectById
	} from '@/data/practice.js'
	import { getCatalog } from '@/services/question-bank.js'
	import {
		getChapterPracticePosition,
		getLocalPracticePreferences,
		getKnowledgePracticePosition,
		getPracticeStateSnapshot
	} from '@/services/user-practice.js'

	export default {
		data() {
			const localPreferences = getLocalPracticePreferences()
			return {
				subjectId: '',
				view: 'chapter',
				keyword: '',
				items: [],
				loading: true,
				loadError: '',
				catalogName: '',
				answerMode: localPreferences.answerMode,
				nightMode: Boolean(localPreferences.nightMode)
			}
		},
		computed: {
			subject() {
				const subject = getSubjectById(this.subjectId)
				return Object.assign({}, subject, {
					name: this.catalogName || subject.name
				})
			},
			filteredItems() {
				const keyword = this.keyword.trim().toLowerCase()
				if (!keyword) return this.items
				return this.items.filter(item => `${item.name} ${item.chapter || ''}`.toLowerCase().indexOf(keyword) > -1)
			}
		},
			onLoad(options) {
			this.subjectId = options.subjectId
			this.view = options.view === 'knowledge' ? 'knowledge' : 'chapter'
			uni.setNavigationBarTitle({ title: this.view === 'knowledge' ? '知识点练习' : '章节练习' })
			this.applyNavigationTheme()
			this.loadItems()
		},
		onShow() {
			const localPreferences = getLocalPracticePreferences()
			const previousAnswerMode = this.answerMode
			this.answerMode = localPreferences.answerMode
			this.nightMode = Boolean(localPreferences.nightMode)
			this.applyNavigationTheme()
			if (previousAnswerMode !== this.answerMode && this.items.length) {
				this.loadItems()
				return
			}
			if (this.answerMode !== 'exam' && this.view === 'chapter' && this.items.length) {
				this.refreshChapterProgress()
			}
		},
		methods: {
			applyNavigationTheme() {
				uni.setNavigationBarColor({
					frontColor: this.nightMode ? '#ffffff' : '#000000',
					backgroundColor: this.nightMode ? '#171c22' : '#ffffff'
				})
			},
			refreshChapterProgress() {
				if (this.answerMode === 'exam') return
				this.items = this.items.map(item => {
					const localProgress = getChapterProgress(this.subjectId, item.id, item.count)
					const attempted = Math.max(item.progress.attempted, localProgress.attempted)
					return Object.assign({}, item, {
						progress: Object.assign({}, item.progress, {
							attempted,
							percent: item.count ? Math.min(100, Math.round(attempted / item.count * 100)) : 0
						})
					})
				})
			},
			async loadItems(forceRefresh) {
				this.loading = true
				this.loadError = ''
				try {
					const catalog = await getCatalog(this.subjectId, {
						forceRefresh: Boolean(forceRefresh)
					})
					this.catalogName = catalog.name || ''
					const shouldLoadProgress = this.answerMode !== 'exam'
					let cloudState = null
					if (shouldLoadProgress) {
						try {
							cloudState = await getPracticeStateSnapshot(this.subjectId, {
								localState: getPracticeState(),
								forceRefresh: Boolean(forceRefresh)
							})
						} catch (syncError) {
							cloudState = null
						}
					}

					if (this.view === 'chapter') {
						const chapters = Array.isArray(catalog.chapters) ? catalog.chapters : []
						const chapterPositions = cloudState && cloudState.progressPositions
							? cloudState.progressPositions.chapter || {}
							: {}
						this.items = chapters.map(item => {
							if (!shouldLoadProgress) {
								return {
									...item,
									progress: {
										attempted: 0,
										total: item.count,
										percent: 0,
										positionQuestionId: ''
									}
								}
							}
							const localProgress = getChapterProgress(this.subjectId, item.id, item.count)
							const attempted = cloudState
								? (cloudState.chapterAttempts[item.id] || 0)
								: localProgress.attempted
							return {
								...item,
								progress: Object.assign({}, localProgress, {
									attempted,
									percent: item.count ? Math.min(100, Math.round(attempted / item.count * 100)) : 0,
									positionQuestionId: chapterPositions[item.id] || ''
								})
							}
						})
						return
					}

					const attemptedByKnowledge = {}
					if (shouldLoadProgress) {
						const state = getPracticeState()
						Object.keys(state.answers).forEach(questionId => {
							const answer = state.answers[questionId]
							const isLegacyDefault = !answer.subjectId
								&& this.subjectId === 'junior-personal-finance'
								&& questionId.indexOf('ipf-') === 0
							if (answer.subjectId !== this.subjectId && !isLegacyDefault) return
							if (!Array.isArray(answer.practiceModes) || answer.practiceModes.indexOf('knowledge') === -1) return
							if (!answer.knowledge) return
							attemptedByKnowledge[answer.knowledge] = (attemptedByKnowledge[answer.knowledge] || 0) + 1
						})
					}
					const knowledgeGroups = Array.isArray(catalog.knowledgeGroups) ? catalog.knowledgeGroups : []
					const knowledgePositions = cloudState && cloudState.progressPositions
						? cloudState.progressPositions.knowledge || {}
						: {}
					this.items = knowledgeGroups.map(item => {
						const attempted = !shouldLoadProgress
							? 0
							: cloudState
							? (cloudState.knowledgeAttempts[item.name] || 0)
							: (attemptedByKnowledge[item.name] || 0)
						const total = Number.isInteger(item.count) && item.count >= 0 ? item.count : 0
						return {
							...item,
							id: `${item.chapterId}:${item.name}`,
							progress: {
								attempted,
								total,
								percent: total ? Math.min(100, Math.round(attempted / total * 100)) : 0,
								positionQuestionId: shouldLoadProgress
									? knowledgePositions[item.name] || ''
									: ''
							}
						}
					})
				} catch (error) {
					this.items = []
					this.loadError = error && error.errCode === 'QUESTION_BANK_SUBJECT_NOT_FOUND'
						? '该科目题库尚未发布'
						: (error && (error.errMsg || error.message)) || '章节目录加载失败'
				} finally {
					this.loading = false
				}
			},
			retryLoad() {
				this.loadItems(true)
			},
			startItem(item) {
				let url = `/practice-pages/practice/practice?subjectId=${this.subjectId}`
				if (this.view === 'knowledge') {
					url += `&mode=knowledge&knowledge=${encodeURIComponent(item.name)}`
					if (this.answerMode !== 'exam') {
						const savedPosition = getKnowledgePracticePosition(this.subjectId, item.name)
						const startId = savedPosition && savedPosition.questionId
							|| item.progress.positionQuestionId
						if (startId) {
							url += `&startId=${encodeURIComponent(startId)}`
						} else if (item.progress.attempted > 0) {
							url += `&startNumber=${Math.min(item.progress.attempted, item.progress.total)}`
						}
					}
				} else {
					url += `&mode=chapter&chapterId=${item.id}`
					if (this.answerMode !== 'exam') {
						const savedPosition = getChapterPracticePosition(this.subjectId, item.id)
						const startId = savedPosition && savedPosition.questionId
							|| item.progress.positionQuestionId
						if (startId) {
							url += `&startId=${encodeURIComponent(startId)}`
						} else if (item.progress.attempted > 0) {
							url += `&startNumber=${Math.min(item.progress.attempted, item.progress.total)}`
						}
					}
				}
				uni.navigateTo({ url })
			}
		}
	}
</script>

<style lang="scss">
	page { background: #f5f6f8; color: #292d32; }
	.catalog-page { min-height: 100vh; padding-bottom: 40rpx; }
	.catalog-summary { display: flex; align-items: center; justify-content: space-between; padding: 30rpx 32rpx; background: #008cff; color: #ffffff; }
	.catalog-summary > view { display: flex; flex-direction: column; }
	.summary-label { font-size: 23rpx; color: rgba(255, 255, 255, 0.76); }
	.summary-title { margin-top: 7rpx; font-size: 34rpx; font-weight: 600; }
	.catalog-search { display: flex; align-items: center; height: 78rpx; margin: 24rpx 24rpx 0; padding: 0 22rpx; border: 1rpx solid #dfe3e8; border-radius: 8rpx; box-sizing: border-box; background: #ffffff; }
	.catalog-search input { flex: 1; height: 100%; margin-left: 12rpx; font-size: 27rpx; }
	.catalog-list { padding: 20rpx 24rpx 0; }
	.catalog-item { display: flex; align-items: center; min-height: 142rpx; margin-bottom: 16rpx; padding: 22rpx 22rpx; border-radius: 8rpx; box-sizing: border-box; background: #ffffff; }
	.item-index { display: flex; align-items: center; justify-content: center; width: 54rpx; height: 54rpx; flex: 0 0 54rpx; margin-right: 20rpx; border-radius: 8rpx; background: #eaf5ff; color: #008cff; font-size: 25rpx; font-weight: 600; }
	.item-content { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.item-title { font-size: 29rpx; font-weight: 500; line-height: 1.45; }
	.item-meta { margin-top: 7rpx; overflow: hidden; color: #858b93; font-size: 22rpx; text-overflow: ellipsis; white-space: nowrap; }
	.item-progress-row { display: flex; align-items: center; margin-top: 16rpx; color: #858b93; font-size: 21rpx; }
	.item-progress { height: 7rpx; flex: 1; margin-right: 16rpx; overflow: hidden; border-radius: 4rpx; background: #e7eaee; }
	.item-progress-fill { height: 100%; background: #008cff; }
	.item-action { display: flex; align-items: center; justify-content: center; width: 52rpx; height: 52rpx; margin-left: 18rpx; border-radius: 8rpx; background: #f1f8fe; }
	.empty-state { display: flex; align-items: center; flex-direction: column; padding: 160rpx 30rpx; color: #92979f; font-size: 27rpx; }
	.loading-state { display: flex; align-items: center; justify-content: center; min-height: 45vh; }
	.empty-state text { margin-top: 18rpx; }
	.empty-state button { min-width: 220rpx; height: 76rpx; margin-top: 28rpx; border: 0; border-radius: 38rpx; background: #008cff; color: #ffffff; font-size: 27rpx; line-height: 76rpx; }
	.empty-state button::after { border: 0; }
	.error-state { color: #bd3f3f; }
	.catalog-page.night-mode { background: #12171d; color: #e6e9ed; }
	.night-mode .catalog-summary { background: #086cae; }
	.night-mode .catalog-search { border-color: #39434e; background: #1b222a; }
	.night-mode .catalog-search input { color: #e6e9ed; }
	.night-mode .catalog-item { background: #1b222a; }
	.night-mode .item-index,
	.night-mode .item-action { background: #17364d; color: #63b9f6; }
	.night-mode .item-meta,
	.night-mode .item-progress-row,
	.night-mode .empty-state { color: #8f99a5; }
	.night-mode .item-progress { background: #303943; }
	.night-mode .item-progress-fill { background: #269df0; }
	.night-mode .empty-state button { background: #168ee5; }
	.night-mode .error-state { color: #ef9a9a; }
</style>
