<template>
	<view class="records-page">
		<view class="records-header">
			<text class="subject-name">{{ subject.name }}</text>
			<view class="record-tabs">
				<view class="record-tab" :class="{ active: activeView === tab.key }" v-for="tab in tabs" :key="tab.key" @tap="switchView(tab.key)">
					{{ tab.label }}
				</view>
			</view>
		</view>

		<view class="records-summary">
			<view>
				<text class="summary-value">{{ records.length }}</text>
				<text class="summary-label">{{ activeTab.unit }}</text>
			</view>
			<button v-if="records.length" @tap="startAll">开始练习</button>
		</view>

		<view class="loading-state" v-if="loading">
			<uni-load-more status="loading"></uni-load-more>
		</view>

		<view class="record-list" v-else-if="records.length">
			<view class="record-item" v-for="(item, index) in records" :key="item.question.id" @tap="startFrom(item.question.id)">
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
				<uni-icons v-else type="star-filled" size="20" color="#e7a721"></uni-icons>
			</view>
		</view>

		<view class="empty-state" v-else>
			<view class="empty-icon">
				<uni-icons :type="activeTab.icon" size="42" color="#9da3ab"></uni-icons>
			</view>
			<text class="empty-title">{{ activeTab.emptyTitle }}</text>
			<text class="empty-caption">{{ activeTab.emptyCaption }}</text>
			<button @tap="goPractice">去刷题</button>
		</view>
	</view>
</template>

<script>
	import {
		formatHistoryTime,
		getPracticeState,
		getSubjectById
	} from '@/data/practice.js'
	import { getQuestionsBySubject } from '@/data/practice-questions.js'

	export default {
		data() {
			return {
				subjectId: '',
				activeView: 'history',
				records: [],
				loading: true,
				tabs: [
					{ key: 'history', label: '做题记录', unit: '道已练习', icon: 'calendar', emptyTitle: '还没有做题记录', emptyCaption: '完成练习后，记录会自动保存在这里。' },
					{ key: 'wrong', label: '错题集', unit: '道待巩固', icon: 'refresh', emptyTitle: '暂时没有错题', emptyCaption: '继续保持，答错的题目会自动加入这里。' },
					{ key: 'favorite', label: '收藏夹', unit: '道已收藏', icon: 'star', emptyTitle: '还没有收藏题目', emptyCaption: '刷题时点亮星标，重点题目会出现在这里。' }
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
			this.activeView = this.tabs.some(item => item.key === options.view) ? options.view : 'history'
		},
		onShow() {
			this.loadRecords()
		},
		methods: {
			switchView(view) {
				this.activeView = view
				this.loadRecords()
			},
			async loadRecords() {
				this.loading = true
				const state = getPracticeState()
				const subjectQuestions = await getQuestionsBySubject(this.subjectId)
				const questionMap = subjectQuestions.reduce((map, question) => {
					map[question.id] = question
					return map
				}, {})

				if (this.activeView === 'wrong') {
					this.records = subjectQuestions
						.filter(question => state.answers[question.id] && !state.answers[question.id].correct)
						.map(question => this.toRecord(question, state.answers[question.id]))
					this.loading = false
					return
				}

				if (this.activeView === 'favorite') {
					this.records = state.favorites
						.map(id => questionMap[id])
						.filter(question => question && question.subjectId === this.subjectId)
						.map(question => this.toRecord(question, state.answers[question.id]))
					this.loading = false
					return
				}

				const ids = []
				this.records = state.history
					.filter(item => item.subjectId === this.subjectId && ids.indexOf(item.questionId) === -1 && ids.push(item.questionId))
					.map(item => {
						const question = questionMap[item.questionId]
						return question ? this.toRecord(question, item) : null
					})
					.filter(Boolean)
				this.loading = false
			},
			toRecord(question, answer) {
				return {
					question,
					correct: answer ? answer.correct : false,
					time: answer && answer.timestamp ? formatHistoryTime(answer.timestamp) : ''
				}
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
	.records-header { padding: 26rpx 24rpx 0; background: #ffffff; }
	.subject-name { display: block; margin-bottom: 22rpx; padding-left: 8rpx; font-size: 25rpx; color: #7c828a; }
	.record-tabs { display: grid; grid-template-columns: repeat(3, 1fr); height: 76rpx; }
	.record-tab { position: relative; display: flex; align-items: center; justify-content: center; color: #626871; font-size: 27rpx; }
	.record-tab.active { color: #008cff; font-weight: 600; }
	.record-tab.active::after { position: absolute; bottom: 0; left: 25%; width: 50%; height: 4rpx; border-radius: 2rpx; background: #008cff; content: ''; }
	.records-summary { display: flex; align-items: center; justify-content: space-between; margin: 22rpx 24rpx 0; padding: 24rpx; border-radius: 8rpx; background: #eaf5ff; }
	.records-summary > view { display: flex; align-items: baseline; }
	.summary-value { color: #008cff; font-size: 40rpx; font-weight: 600; }
	.summary-label { margin-left: 10rpx; color: #68717c; font-size: 24rpx; }
	.records-summary button { height: 64rpx; margin: 0; padding: 0 24rpx; border-radius: 34rpx; background: #008cff; color: #ffffff; font-size: 25rpx; line-height: 64rpx; }
	.records-summary button::after, .empty-state button::after { border: 0; }
	.record-list { padding: 18rpx 24rpx 0; }
	.record-item { display: flex; align-items: center; min-height: 126rpx; margin-bottom: 14rpx; padding: 20rpx; border-radius: 8rpx; box-sizing: border-box; background: #ffffff; }
	.record-index { display: flex; align-items: center; justify-content: center; width: 48rpx; height: 48rpx; flex: 0 0 48rpx; margin-right: 18rpx; border-radius: 8rpx; background: #f0f2f5; color: #707680; font-size: 23rpx; }
	.record-content { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.record-title { display: -webkit-box; overflow: hidden; font-size: 27rpx; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
	.record-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 11rpx; color: #92979f; font-size: 21rpx; }
	.record-meta text:first-child { max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.record-status { display: flex; align-items: center; justify-content: center; width: 46rpx; height: 46rpx; margin-left: 16rpx; border-radius: 50%; }
	.record-status.correct { background: #eff9f4; }
	.record-status.wrong { background: #fff2f2; }
	.empty-state { display: flex; align-items: center; flex-direction: column; padding: 150rpx 52rpx; text-align: center; }
	.loading-state { display: flex; align-items: center; justify-content: center; min-height: 45vh; }
	.empty-icon { display: flex; align-items: center; justify-content: center; width: 100rpx; height: 100rpx; border-radius: 8rpx; background: #eceff2; }
	.empty-title { margin-top: 26rpx; font-size: 31rpx; font-weight: 600; }
	.empty-caption { margin-top: 12rpx; color: #8a9098; font-size: 25rpx; line-height: 1.6; }
	.empty-state button { height: 76rpx; margin-top: 30rpx; padding: 0 42rpx; border-radius: 40rpx; background: #008cff; color: #ffffff; font-size: 27rpx; line-height: 76rpx; }
</style>
