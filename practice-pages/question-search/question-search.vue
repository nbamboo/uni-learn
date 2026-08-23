<template>
	<view class="search-page">
		<view class="search-bar">
			<uni-icons type="search" size="21" color="#737983"></uni-icons>
			<input v-model="keyword" :focus="true" placeholder="输入题目、章节或知识点" confirm-type="search" />
			<view class="clear-button" v-if="keyword" @tap="keyword = ''">
				<uni-icons type="clear" size="19" color="#a0a5ad"></uni-icons>
			</view>
		</view>

		<view class="loading-state" v-if="loading">
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
				<text>{{ results.length }} 道</text>
			</view>
			<view class="result-list" v-if="results.length">
				<view class="result-item" v-for="(question, index) in visibleResults" :key="question.id" @tap="startQuestion(question.id)">
					<view class="result-index">{{ index + 1 }}</view>
					<view class="result-content">
						<text class="result-title">{{ question.title }}</text>
						<view class="result-meta">
							<text>{{ question.knowledge }}</text>
							<text>{{ question.type === 'multiple' ? '多选题' : '单选题' }}</text>
						</view>
					</view>
					<uni-icons type="right" size="17" color="#a4a9b0"></uni-icons>
				</view>
			</view>

			<view class="empty-state" v-else>
				<uni-icons type="search" size="42" color="#a1a7ae"></uni-icons>
				<text class="empty-title">没有找到相关题目</text>
				<text class="empty-caption">换个关键词试试</text>
			</view>
		</view>
	</view>
</template>

<script>
	import { getKnowledgeGroups, getQuestionsBySubject } from '@/data/practice-questions.js'
	import { getSubjectById } from '@/data/practice.js'

	export default {
		data() {
			return {
				subjectId: '',
				keyword: '',
				questions: [],
				popularKnowledge: [],
				loading: true
			}
		},
		computed: {
			subject() {
				return getSubjectById(this.subjectId)
			},
			results() {
				const keyword = this.keyword.trim().toLowerCase()
				if (!keyword) return []
				return this.questions.filter(question => {
					const source = [
						question.title,
						question.chapter,
						question.section,
						question.knowledge,
						question.options.map(item => item.text).join(' ')
					].join(' ').toLowerCase()
					return source.indexOf(keyword) > -1
				})
			},
			visibleResults() {
				return this.results.slice(0, 80)
			}
		},
		async onLoad(options) {
			this.subjectId = options.subjectId
			const [questions, knowledgeGroups] = await Promise.all([
				getQuestionsBySubject(this.subjectId),
				getKnowledgeGroups(this.subjectId)
			])
			this.questions = questions
			this.popularKnowledge = knowledgeGroups.slice(0, 10)
			this.loading = false
		},
		methods: {
			startQuestion(questionId) {
				const keyword = encodeURIComponent(this.keyword.trim())
				uni.navigateTo({
					url: `/practice-pages/practice/practice?subjectId=${this.subjectId}&mode=search&keyword=${keyword}&startId=${questionId}`
				})
			}
		}
	}
</script>

<style lang="scss">
	page { background: #f5f6f8; color: #292d32; }
	.search-page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; }
	.search-bar { display: flex; align-items: center; height: 84rpx; padding: 0 22rpx; border: 2rpx solid #008cff; border-radius: 8rpx; box-sizing: border-box; background: #ffffff; }
	.search-bar input { flex: 1; height: 100%; margin-left: 14rpx; font-size: 28rpx; }
	.clear-button { padding: 12rpx 0 12rpx 16rpx; }
	.section-heading, .result-heading { display: flex; align-items: center; justify-content: space-between; padding: 30rpx 4rpx 18rpx; }
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
</style>
