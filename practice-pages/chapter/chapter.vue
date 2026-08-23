<template>
	<view class="catalog-page">
		<view class="catalog-summary">
			<view>
				<text class="summary-label">{{ view === 'knowledge' ? '专项考点' : '教材目录' }}</text>
				<text class="summary-title">{{ subject.name }}</text>
			</view>
			<text class="summary-count">{{ filteredItems.length }} 项</text>
		</view>

		<view class="catalog-search" v-if="view === 'knowledge'">
			<uni-icons type="search" size="19" color="#8a8f99"></uni-icons>
			<input v-model="keyword" placeholder="搜索知识点" confirm-type="search" />
			<view v-if="keyword" @tap="keyword = ''">
				<uni-icons type="clear" size="18" color="#a0a5ad"></uni-icons>
			</view>
		</view>

		<view class="loading-state" v-if="loading">
			<uni-load-more status="loading"></uni-load-more>
		</view>

		<view class="catalog-list" v-else-if="filteredItems.length">
			<view class="catalog-item" v-for="(item, index) in filteredItems" :key="item.id" @tap="startItem(item)">
				<view class="item-index">{{ index + 1 }}</view>
				<view class="item-content">
					<text class="item-title">{{ item.name }}</text>
					<text class="item-meta" v-if="view === 'knowledge'">{{ item.chapter }}</text>
					<view class="item-progress-row">
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
			<text>没有找到相关知识点</text>
		</view>
	</view>
</template>

<script>
	import {
		getChapterProgress,
		getChaptersBySubject,
		getPracticeState,
		getSubjectById
	} from '@/data/practice.js'
	import { getKnowledgeGroups, getQuestionsBySubject } from '@/data/practice-questions.js'

	export default {
		data() {
			return {
				subjectId: '',
				view: 'chapter',
				keyword: '',
				items: [],
				loading: true
			}
		},
		computed: {
			subject() {
				return getSubjectById(this.subjectId)
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
			this.loadItems()
		},
		methods: {
			async loadItems() {
				this.loading = true
				if (this.view === 'chapter') {
					this.items = getChaptersBySubject(this.subjectId).map(item => ({
						...item,
						progress: getChapterProgress(this.subjectId, item.id)
					}))
					this.loading = false
					return
				}

				const state = getPracticeState()
				const [questions, knowledgeGroups] = await Promise.all([
					getQuestionsBySubject(this.subjectId),
					getKnowledgeGroups(this.subjectId)
				])
				this.items = knowledgeGroups.map(item => {
					const related = questions.filter(question => question.knowledge === item.name)
					const attempted = related.filter(question => state.answers[question.id]).length
					return {
						...item,
						id: item.name,
						progress: {
							attempted,
							total: related.length,
							percent: related.length ? Math.round(attempted / related.length * 100) : 0
						}
					}
				})
				this.loading = false
			},
			startItem(item) {
				let url = `/practice-pages/practice/practice?subjectId=${this.subjectId}`
				if (this.view === 'knowledge') url += `&mode=knowledge&knowledge=${encodeURIComponent(item.name)}`
				else url += `&mode=chapter&chapterId=${item.id}`
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
	.summary-count { font-size: 27rpx; }
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
</style>
