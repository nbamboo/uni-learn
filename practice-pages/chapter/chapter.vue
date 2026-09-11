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

		<view class="catalog-list chapter-list" v-else-if="view === 'chapter' && filteredItems.length">
			<view class="chapter-card" v-for="(item, index) in filteredItems" :key="item.id">
				<view class="catalog-item chapter-item">
					<view
						v-if="item.sections.length"
						class="chapter-expand"
						:class="{ expanded: expandedChapterId === item.id }"
						@tap.stop="toggleChapter(item)"
					>
						<view class="expand-glyph"></view>
					</view>
					<view class="item-index" v-else>{{ index + 1 }}</view>
					<view class="item-content">
						<text class="item-title">{{ item.name }}</text>
						<view class="item-progress-row" v-if="answerMode !== 'exam'">
							<view class="item-progress">
								<view class="item-progress-fill" :style="{ width: item.progress.percent + '%' }"></view>
							</view>
							<text>{{ item.progress.attempted }}/{{ item.progress.total }}</text>
						</view>
					</view>
					<button class="practice-action" @tap.stop="startChapter(item)">答题</button>
				</view>
				<view class="section-list" v-if="item.sections.length && expandedChapterId === item.id">
					<view class="section-item" v-for="section in item.sections" :key="section.name">
						<view class="section-guide"></view>
						<view class="item-content">
							<text class="section-title">{{ section.name }}</text>
							<view class="item-progress-row" v-if="answerMode !== 'exam'">
								<view class="item-progress">
									<view class="item-progress-fill" :style="{ width: section.progress.percent + '%' }"></view>
								</view>
								<text>{{ section.progress.attempted }}/{{ section.progress.total }}</text>
							</view>
						</view>
						<button class="practice-action section-action" @tap.stop="startSection(item, section)">答题</button>
					</view>
				</view>
			</view>
		</view>

		<view class="catalog-list" v-else-if="filteredItems.length">
			<block v-for="(item, index) in filteredItems" :key="item.id">
				<view class="catalog-item" @tap="startItem(item)">
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

				<!-- #ifdef MP-WEIXIN -->
				<view class="knowledge-ad-container" v-if="shouldShowKnowledgeAd(index)">
					<ad-custom
						unit-id="adunit-e55002bf7256a6bb"
						@load="adLoad(index + 1)"
						@error="adError($event, index + 1)"
						@close="adClose(index + 1)"
					></ad-custom>
				</view>
				<!-- #endif -->
			</block>
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
		getSectionProgress,
		PRACTICE_PROGRESS_UPDATED_EVENT,
		getPracticeState,
		savePracticeState,
		getSubjectById
	} from '@/data/practice.js'
	import { getCatalog, getQuestionsByIds } from '@/services/question-bank.js'
	import {
		getChapterPracticePosition,
		getKnowledgeScopeKey,
		getLocalPracticePreferences,
		getKnowledgePracticePosition,
		getSectionPracticePosition,
		getSectionScopeKey,
		getPracticeStateSnapshot
	} from '@/services/user-practice.js'
	import { getCachedMembership, getMembership } from '@/services/membership.js'

	let interstitialAd = null
	let chapterInterstitialShownThisLaunch = false
	let chapterInterstitialShowing = false
	const EXPANDED_CHAPTER_STORAGE_KEY = 'uni-learn-expanded-chapter-v1:'

	export default {
		data() {
			const localPreferences = getLocalPracticePreferences()
			return {
				membership: getCachedMembership(),
				membershipLoaded: false,
				subjectId: '',
				view: 'chapter',
				keyword: '',
				items: [],
				loading: true,
				loadError: '',
				catalogName: '',
				expandedChapterId: '',
				answerMode: localPreferences.answerMode,
				nightMode: Boolean(localPreferences.nightMode),
				pageActive: false,
				hiddenKnowledgeAdPositions: {},
				practiceProgressUpdatedHandler: null
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
			this.pageActive = true
			this.subjectId = options.subjectId
			this.view = options.view === 'knowledge' ? 'knowledge' : 'chapter'
			if (this.view === 'knowledge') this.refreshMembership()
			else this.showChapterInterstitialAd()
			if (typeof uni.$on === 'function') {
				this.practiceProgressUpdatedHandler = event => this.handlePracticeProgressUpdated(event)
				uni.$on(PRACTICE_PROGRESS_UPDATED_EVENT, this.practiceProgressUpdatedHandler)
			}
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
			if (this.answerMode !== 'exam' && this.items.length) {
				if (this.view === 'knowledge') this.refreshKnowledgeProgress()
				else this.refreshChapterProgress()
			}
		},
		onUnload() {
			this.pageActive = false
			if (this.practiceProgressUpdatedHandler && typeof uni.$off === 'function') {
				uni.$off(PRACTICE_PROGRESS_UPDATED_EVENT, this.practiceProgressUpdatedHandler)
			}
			this.practiceProgressUpdatedHandler = null
			this.destroyChapterInterstitialAd()
		},
		methods: {
			async backfillLocalSectionMetadata() {
				try {
					const state = getPracticeState()
					const answers = state && state.answers && typeof state.answers === 'object'
						? state.answers
						: {}
					const questionIds = Object.keys(answers).filter(questionId => {
						const answer = answers[questionId] || {}
						const modes = Array.isArray(answer.practiceModes) ? answer.practiceModes : []
						const isLegacyDefault = !answer.subjectId
							&& this.subjectId === 'junior-personal-finance'
							&& questionId.indexOf('ipf-') === 0
						return (answer.subjectId === this.subjectId || isLegacyDefault)
							&& !answer.section
							&& (modes.indexOf('chapter') > -1 || modes.indexOf('section') > -1)
					}).slice(0, 2000)
					if (!questionIds.length) return false
					const result = await getQuestionsByIds({
						subjectId: this.subjectId,
						questionIds
					})
					let changed = false
					;(result.items || []).forEach(question => {
						const questionId = question.questionId || question.id
						const answer = answers[questionId]
						if (!answer || !question.section) return
						if (!answer.subjectId) answer.subjectId = this.subjectId
						if (!answer.chapterId && question.chapterId) {
							answer.chapterId = String(question.chapterId)
						}
						answer.section = question.section
						changed = true
					})
					if (changed) savePracticeState(state)
					return changed
				} catch (error) {
					// 历史数据补全失败不阻塞目录，云端聚合或后续刷新仍可恢复进度。
					return false
				}
			},
			async refreshMembership() {
				try {
					this.membership = await getMembership()
				} catch (error) {
					this.membership = getCachedMembership()
				} finally {
					this.membershipLoaded = true
				}
				return this.membership
			},
			async showChapterInterstitialAd() {
				if (this.view !== 'chapter'
					|| chapterInterstitialShownThisLaunch
					|| chapterInterstitialShowing) return
				const membership = await this.refreshMembership()
				if (!this.pageActive
					|| membership.isMember
					|| chapterInterstitialShownThisLaunch
					|| chapterInterstitialShowing) return

				// #ifdef MP-WEIXIN
				if (typeof wx === 'undefined' || !wx.createInterstitialAd) return
				chapterInterstitialShowing = true
				try {
					interstitialAd = wx.createInterstitialAd({
						adUnitId: 'adunit-4ea7a830fe0d7db2'
					})
					interstitialAd.onLoad(() => {})
					interstitialAd.onError(error => {
						console.error('插屏广告加载失败', error)
					})
					interstitialAd.onClose(() => {})
					await interstitialAd.show()
					chapterInterstitialShownThisLaunch = true
				} catch (error) {
					console.error('插屏广告显示失败', error)
				} finally {
					chapterInterstitialShowing = false
				}
				// #endif
			},
			destroyChapterInterstitialAd() {
				if (interstitialAd && typeof interstitialAd.destroy === 'function') {
					interstitialAd.destroy()
				}
				interstitialAd = null
			},
			shouldShowKnowledgeAd(index) {
				const position = Number(index) + 1
				return this.view === 'knowledge'
					&& this.membershipLoaded
					&& !this.membership.isMember
					&& (position === 5 || position === 10)
					&& !this.hiddenKnowledgeAdPositions[position]
			},
			adLoad(position) {
				console.log(`第 ${position} 个知识点后的原生模板广告加载成功`)
			},
			adError(error, position) {
				console.error(`第 ${position} 个知识点后的原生模板广告加载失败`, error)
				this.hiddenKnowledgeAdPositions = Object.assign({}, this.hiddenKnowledgeAdPositions, {
					[position]: true
				})
			},
			adClose(position) {
				console.log(`第 ${position} 个知识点后的原生模板广告关闭`)
				this.hiddenKnowledgeAdPositions = Object.assign({}, this.hiddenKnowledgeAdPositions, {
					[position]: true
				})
			},
			handlePracticeProgressUpdated(event) {
				if (!event
					|| event.subjectId !== this.subjectId
					|| (this.view === 'knowledge'
						? event.mode !== 'knowledge'
						: ['chapter', 'section'].indexOf(event.mode) === -1)
					|| this.answerMode === 'exam'
					|| !this.items.length) return
				if (this.view === 'knowledge') this.refreshKnowledgeProgress()
				else this.refreshChapterProgress()
			},
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
						}),
						sections: item.sections.map(section => {
							const sectionProgress = getSectionProgress(
								this.subjectId,
								item.id,
								section.name,
								section.count
							)
							const sectionAttempted = Math.max(section.progress.attempted, sectionProgress.attempted)
							return Object.assign({}, section, {
								progress: Object.assign({}, section.progress, {
									attempted: sectionAttempted,
									percent: section.count
										? Math.min(100, Math.round(sectionAttempted / section.count * 100))
										: 0
								})
							})
						})
					})
				})
			},
			expandedChapterStorageKey() {
				return `${EXPANDED_CHAPTER_STORAGE_KEY}${this.subjectId}`
			},
			restoreExpandedChapter(chapters) {
				let saved = ''
				try {
					saved = String(uni.getStorageSync(this.expandedChapterStorageKey()) || '')
				} catch (error) {
					saved = ''
				}
				this.expandedChapterId = chapters.some(item => (
					String(item.id) === saved && Array.isArray(item.sections) && item.sections.length
				)) ? saved : ''
			},
			toggleChapter(item) {
				if (!item || !Array.isArray(item.sections) || !item.sections.length) return
				this.expandedChapterId = this.expandedChapterId === String(item.id) ? '' : String(item.id)
				try {
					if (this.expandedChapterId) {
						uni.setStorageSync(this.expandedChapterStorageKey(), this.expandedChapterId)
					} else {
						uni.removeStorageSync(this.expandedChapterStorageKey())
					}
				} catch (error) {
					// 展开状态记忆失败不影响章节练习。
				}
			},
			getLocalKnowledgeAttempts() {
				const attemptedByKnowledge = {}
				const state = getPracticeState()
				Object.keys(state.answers).forEach(questionId => {
					const answer = state.answers[questionId]
					const isLegacyDefault = !answer.subjectId
						&& this.subjectId === 'junior-personal-finance'
						&& questionId.indexOf('ipf-') === 0
					if (answer.subjectId !== this.subjectId && !isLegacyDefault) return
					if (!Array.isArray(answer.practiceModes) || answer.practiceModes.indexOf('knowledge') === -1) return
					if (!answer.knowledge) return
					const scopeKey = getKnowledgeScopeKey(answer.chapterId, answer.knowledge)
					const key = scopeKey || answer.knowledge
					attemptedByKnowledge[key] = (attemptedByKnowledge[key] || 0) + 1
				})
				return attemptedByKnowledge
			},
			refreshKnowledgeProgress() {
				if (this.answerMode === 'exam') return
				const attemptedByKnowledge = this.getLocalKnowledgeAttempts()
				this.items = this.items.map(item => {
					const scopeKey = getKnowledgeScopeKey(item.chapterId, item.name)
					const localAttempted = attemptedByKnowledge[scopeKey]
						|| attemptedByKnowledge[item.name]
						|| 0
					const attempted = Math.max(item.progress.attempted, localAttempted)
					return Object.assign({}, item, {
						progress: Object.assign({}, item.progress, {
							attempted,
							percent: item.progress.total
								? Math.min(100, Math.round(attempted / item.progress.total * 100))
								: 0
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
						await this.backfillLocalSectionMetadata()
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
						const sectionPositions = cloudState && cloudState.progressPositions
							? cloudState.progressPositions.section || {}
							: {}
						this.items = chapters.map(item => {
							const sections = Array.isArray(item.sections) ? item.sections : []
							const mappedSections = sections.map(section => {
								const total = Number.isInteger(section.count) && section.count >= 0 ? section.count : 0
								const scopeKey = getSectionScopeKey(item.id, section.name)
								const localProgress = getSectionProgress(
									this.subjectId,
									item.id,
									section.name,
									total
								)
								const attempted = !shouldLoadProgress
									? 0
									: Math.max(
										localProgress.attempted,
										cloudState ? ((cloudState.sectionAttempts || {})[scopeKey] || 0) : 0
									)
								return Object.assign({}, section, {
									progress: {
										attempted,
										total,
										percent: total ? Math.min(100, Math.round(attempted / total * 100)) : 0,
										positionQuestionId: shouldLoadProgress ? sectionPositions[scopeKey] || '' : ''
									}
								})
							})
							if (!shouldLoadProgress) {
								return {
									...item,
									sections: mappedSections,
									progress: {
										attempted: 0,
										total: item.count,
										percent: 0,
										positionQuestionId: ''
									}
								}
							}
							const localProgress = getChapterProgress(this.subjectId, item.id, item.count)
							const attempted = Math.max(
								localProgress.attempted,
								cloudState ? ((cloudState.chapterAttempts || {})[item.id] || 0) : 0
							)
							return {
								...item,
								sections: mappedSections,
								progress: Object.assign({}, localProgress, {
									attempted,
									percent: item.count ? Math.min(100, Math.round(attempted / item.count * 100)) : 0,
									positionQuestionId: chapterPositions[item.id] || ''
								})
							}
						})
						this.restoreExpandedChapter(this.items)
						return
					}

					const attemptedByKnowledge = shouldLoadProgress ? this.getLocalKnowledgeAttempts() : {}
					const knowledgeGroups = Array.isArray(catalog.knowledgeGroups) ? catalog.knowledgeGroups : []
					const knowledgePositions = cloudState && cloudState.progressPositions
						? cloudState.progressPositions.knowledge || {}
						: {}
					this.items = knowledgeGroups.map(item => {
						const scopeKey = getKnowledgeScopeKey(item.chapterId, item.name)
						const attempted = !shouldLoadProgress
							? 0
							: cloudState
							? ((cloudState.knowledgeAttempts || {})[scopeKey]
								|| (cloudState.knowledgeAttempts || {})[item.name]
								|| 0)
							: (attemptedByKnowledge[scopeKey]
								|| attemptedByKnowledge[item.name]
								|| 0)
						const total = Number.isInteger(item.count) && item.count >= 0 ? item.count : 0
						return {
							...item,
							id: `${item.chapterId}:${item.name}`,
							progress: {
								attempted,
								total,
								percent: total ? Math.min(100, Math.round(attempted / total * 100)) : 0,
								positionQuestionId: shouldLoadProgress
									? knowledgePositions[scopeKey] || knowledgePositions[item.name] || ''
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
				if (this.view === 'chapter') {
					this.startChapter(item)
					return
				}
				let url = `/practice-pages/practice/practice?subjectId=${this.subjectId}`
				if (this.view === 'knowledge') {
					url += `&mode=knowledge&chapterId=${encodeURIComponent(item.chapterId)}&knowledge=${encodeURIComponent(item.name)}`
					if (this.answerMode !== 'exam') {
						const savedPosition = getKnowledgePracticePosition(this.subjectId, item.chapterId, item.name)
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
			},
			startChapter(item) {
				let url = `/practice-pages/practice/practice?subjectId=${this.subjectId}`
				url += `&mode=chapter&chapterId=${encodeURIComponent(item.id)}`
				if (this.answerMode !== 'exam') {
					const savedPosition = getChapterPracticePosition(this.subjectId, item.id)
					const startId = savedPosition && savedPosition.questionId
						|| item.progress.positionQuestionId
					if (startId) url += `&startId=${encodeURIComponent(startId)}`
					else if (item.progress.attempted > 0) {
						url += `&startNumber=${Math.min(item.progress.attempted, item.progress.total)}`
					}
				}
				uni.navigateTo({ url })
			},
			startSection(chapter, section) {
				let url = `/practice-pages/practice/practice?subjectId=${this.subjectId}`
				url += `&mode=section&chapterId=${encodeURIComponent(chapter.id)}`
				url += `&section=${encodeURIComponent(section.name)}`
				if (this.answerMode !== 'exam') {
					const savedPosition = getSectionPracticePosition(
						this.subjectId,
						chapter.id,
						section.name
					)
					const startId = savedPosition && savedPosition.questionId
						|| section.progress.positionQuestionId
					if (startId) url += `&startId=${encodeURIComponent(startId)}`
					else if (section.progress.attempted > 0) {
						url += `&startNumber=${Math.min(section.progress.attempted, section.progress.total)}`
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
	.chapter-card { margin-bottom: 16rpx; overflow: hidden; border: 1rpx solid #edf1f5; border-radius: 14rpx; background: #ffffff; box-shadow: 0 4rpx 14rpx rgba(29, 47, 63, 0.035); }
	.chapter-card .catalog-item { margin-bottom: 0; }
	.chapter-item { min-height: 136rpx; padding: 24rpx; }
	.chapter-expand { position: relative; display: flex; align-items: center; justify-content: center; width: 50rpx; height: 50rpx; flex: 0 0 50rpx; margin-right: 20rpx; border: 2rpx solid #80c7fb; border-radius: 50%; box-sizing: border-box; color: #008cff; }
	.chapter-expand.expanded { border-color: #008cff; background: #eaf5ff; }
	.expand-glyph { position: relative; width: 22rpx; height: 22rpx; color: inherit; }
	.expand-glyph::before,
	.expand-glyph::after { position: absolute; top: 50%; left: 50%; border-radius: 2rpx; background: currentColor; content: ''; transform: translate(-50%, -50%); transform-origin: center; }
	.expand-glyph::before { width: 22rpx; height: 4rpx; }
	.expand-glyph::after { width: 4rpx; height: 22rpx; transition: opacity 0.16s ease, transform 0.16s ease; }
	.chapter-expand.expanded .expand-glyph::after { opacity: 0; transform: translate(-50%, -50%) scaleY(0); }
	.practice-action { display: flex; align-items: center; justify-content: center; width: 100rpx; height: 56rpx; flex: 0 0 100rpx; margin: 0 0 0 20rpx; padding: 0; border: 1rpx solid #b9ddf8; border-radius: 28rpx; box-sizing: border-box; background: #eaf5ff; color: #008cff; font-size: 24rpx; font-weight: 500; line-height: 1; }
	.practice-action::after { border: 0; }
	.section-list { border-top: 1rpx solid #edf0f3; background: #fbfcfd; }
	.section-item { display: flex; align-items: center; min-height: 116rpx; padding: 20rpx 24rpx 20rpx 56rpx; box-sizing: border-box; border-bottom: 1rpx solid #f0f2f5; }
	.section-item:last-child { border-bottom: 0; }
	.section-guide { width: 18rpx; height: 18rpx; flex: 0 0 18rpx; margin-right: 24rpx; border-bottom: 3rpx solid #9ccff5; border-left: 3rpx solid #9ccff5; box-sizing: border-box; }
	.section-title { color: #3f454c; font-size: 27rpx; line-height: 1.45; }
	.section-action { width: 92rpx; flex-basis: 92rpx; background: #ffffff; color: #008cff; }
	.knowledge-ad-container { margin-bottom: 16rpx; overflow: hidden; border-radius: 8rpx; }
	.item-index { display: flex; align-items: center; justify-content: center; width: 54rpx; height: 54rpx; flex: 0 0 54rpx; margin-right: 20rpx; border-radius: 8rpx; background: #eaf5ff; color: #008cff; font-size: 25rpx; font-weight: 600; }
	.item-content { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.item-title { font-size: 29rpx; font-weight: 600; line-height: 1.4; }
	.item-meta { margin-top: 7rpx; overflow: hidden; color: #858b93; font-size: 22rpx; text-overflow: ellipsis; white-space: nowrap; }
	.item-progress-row { display: flex; align-items: center; min-height: 24rpx; margin-top: 13rpx; color: #858b93; font-size: 21rpx; line-height: 1; }
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
	.night-mode .chapter-card { border-color: #29333d; background: #1b222a; box-shadow: none; }
	.night-mode .chapter-expand { border-color: #397da9; color: #63b9f6; }
	.night-mode .chapter-expand.expanded,
	.night-mode .practice-action { border-color: #315a77; background: #17364d; color: #63b9f6; }
	.night-mode .section-list { border-top-color: #303943; }
	.night-mode .section-list,
	.night-mode .section-item { background: #192028; }
	.night-mode .section-item { border-bottom-color: #2a333c; }
	.night-mode .section-guide { border-color: #397da9; }
	.night-mode .section-title { color: #d7dce2; }
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
