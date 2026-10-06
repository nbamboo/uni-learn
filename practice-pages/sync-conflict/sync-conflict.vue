<template>
	<view class="sync-page" :class="{ 'night-mode': nightMode }">
		<view class="intro-card">
			<view class="intro-icon">
				<uni-icons type="cloud-upload" :size="32" color="#008cff"></uni-icons>
			</view>
			<text class="intro-title">选择要保留的学习进度</text>
			<text class="intro-desc">
				本机和云端的进度不会自动合并。选择后将对全部科目生效，夜间模式始终保留本机设置。
			</text>
		</view>

		<view class="compare-grid" v-if="hasOverview">
			<view class="progress-card local-card">
				<view class="card-heading">
					<text class="card-title">当前本机</text>
					<text class="card-tag">本机</text>
				</view>
				<view class="metric-main">{{ localOverview.attempted || 0 }}<text> 道已答</text></view>
				<view class="metric-row">
					<text>错题 {{ localOverview.wrong || 0 }}</text>
					<text>收藏 {{ localOverview.favorite || 0 }}</text>
				</view>
				<text class="metric-meta">涉及 {{ localOverview.subjectCount || 0 }} 个科目</text>
				<text class="metric-meta">最近更新：{{ formatTime(localOverview.updatedAt) }}</text>
			</view>

			<view class="progress-card cloud-card">
				<view class="card-heading">
					<text class="card-title">已有云端</text>
					<text class="card-tag cloud">云端</text>
				</view>
				<view class="metric-main">{{ cloudOverview.attempted || 0 }}<text> 道已答</text></view>
				<view class="metric-row">
					<text>错题 {{ cloudOverview.wrong || 0 }}</text>
					<text>收藏 {{ cloudOverview.favorite || 0 }}</text>
				</view>
				<text class="metric-meta">涉及 {{ cloudOverview.subjectCount || 0 }} 个科目</text>
				<text class="metric-meta">最近更新：{{ formatTime(cloudOverview.updatedAt) }}</text>
			</view>
		</view>

		<view class="status-card" v-if="isChecking || isOperating || state.error || isReady">
			<view class="status-line">
				<uni-icons
					:type="isReady ? 'checkmarkempty' : (state.error ? 'refreshempty' : 'spinner-cycle')"
					:size="24"
					:color="isReady ? '#18a66a' : (state.error ? '#d34d4d' : '#008cff')"
				></uni-icons>
				<view class="status-copy">
					<text class="status-title">{{ statusTitle }}</text>
					<text class="status-desc">{{ statusDescription }}</text>
				</view>
			</view>
			<view class="progress-track" v-if="isOperating">
				<view class="progress-fill" :style="{ width: operationPercent + '%' }"></view>
			</view>
		</view>

		<view class="action-area" v-if="state.status === 'required'">
			<button class="action-button primary" :disabled="working" @tap="confirmChoice('local')">
				继续当前本地进度
			</button>
			<text class="action-note">删除并重建云端进度，以本机全部科目为准</text>
			<button class="action-button secondary" :disabled="working" @tap="confirmChoice('cloud')">
				恢复云端进度
			</button>
			<text class="action-note">覆盖本机学习数据，以云端全部科目为准</text>
			<button class="later-button" :disabled="working" @tap="goBack">稍后处理</button>
		</view>

		<view class="action-area" v-else-if="state.error || isReady">
			<button v-if="state.error" class="action-button primary" :disabled="working" @tap="retry">
				{{ working ? '正在重试' : '重试' }}
			</button>
			<button v-if="isReady" class="action-button primary" @tap="goBack">完成</button>
			<button v-if="state.error && !isOperating" class="later-button" @tap="goBack">稍后处理</button>
		</view>

		<view class="safe-note">
			<uni-icons type="info" :size="18" :color="nightMode ? '#8f99a5' : '#7a828c'"></uni-icons>
			<text>处理完成前，会员权益可正常使用；学习记录保存在本机，云同步暂时暂停。</text>
		</view>
	</view>
</template>

<script>
	import { subjectGroups } from '@/data/practice.js'
	import {
		choosePracticeReconciliation,
		getLocalPracticePreferences,
		getPracticeReconciliationState,
		preparePracticeReconciliation
	} from '@/services/user-practice.js'

	export default {
		data() {
			return {
				nightMode: Boolean(getLocalPracticePreferences().nightMode),
				state: getPracticeReconciliationState(),
				working: false,
				subjectIds: subjectGroups.reduce((result, group) => (
					result.concat(group.items.map(item => item.id))
				), [])
			}
		},
		computed: {
			localOverview() {
				return this.state.overview && this.state.overview.local || {}
			},
			cloudOverview() {
				return this.state.overview && this.state.overview.cloud || {}
			},
			hasOverview() {
				return Boolean(this.state.overview)
			},
			isChecking() {
				return this.state.status === 'checking' && !this.state.error
			},
			isOperating() {
				return ['replacing', 'restoring'].indexOf(this.state.status) > -1
			},
			isReady() {
				return this.state.status === 'ready'
			},
			operationPercent() {
				const total = Number(this.state.subjectTotal) || this.subjectIds.length || 1
				return Math.max(0, Math.min(100, Math.round((Number(this.state.subjectIndex) || 0) / total * 100)))
			},
			statusTitle() {
				if (this.isReady) return '学习进度已处理完成'
				if (this.state.error) return '处理暂时中断'
				if (this.state.status === 'replacing') return '正在用本机进度重建云端'
				if (this.state.status === 'restoring') return '正在恢复云端进度到本机'
				return '正在检查本机与云端进度'
			},
			statusDescription() {
				if (this.state.error) return this.state.error
				if (this.isReady) return '云同步已恢复，可以继续学习。'
				if (this.isOperating) {
					const total = Number(this.state.subjectTotal) || this.subjectIds.length
					const completed = Math.min(total, Number(this.state.subjectIndex) || 0)
					const resource = this.resourceLabel(this.state.currentResource)
					return `已处理 ${completed}/${total} 个科目${resource ? ` · ${resource}` : ''}`
				}
				return '请稍候，检查期间不会上传或覆盖任何学习记录。'
			}
		},
		onShow() {
			this.loadState()
		},
		methods: {
			applyState(value) {
				this.state = Object.assign({}, value || getPracticeReconciliationState())
			},
			async loadState() {
				if (this.working) return
				this.working = true
				try {
					this.applyState(await preparePracticeReconciliation({
						subjectIds: this.subjectIds,
						onProgress: state => this.applyState(state)
					}))
				} catch (error) {
					this.applyState(getPracticeReconciliationState())
				} finally {
					this.working = false
				}
			},
			confirmChoice(choice) {
				const useLocal = choice === 'local'
				uni.showModal({
					title: useLocal ? '保留本机进度？' : '恢复云端进度？',
					content: useLocal
						? '将删除全部科目的云端学习进度，并以当前本机数据重新建立。开始后不能改选云端进度。'
						: '将删除本机未同步的学习进度，并以云端数据为准。开始后不能改选本机进度。',
					cancelText: '取消',
					confirmText: useLocal ? '保留本机' : '恢复云端',
					confirmColor: useLocal ? '#008cff' : '#d34d4d',
					success: result => {
						if (result.confirm) this.runChoice(choice)
					}
				})
			},
			async runChoice(choice) {
				if (this.working) return
				this.working = true
				try {
					this.applyState(await choosePracticeReconciliation(choice, {
						subjectIds: this.subjectIds,
						onProgress: state => this.applyState(state)
					}))
					uni.showToast({ title: '云同步已恢复', icon: 'success' })
				} catch (error) {
					this.applyState(getPracticeReconciliationState())
					uni.showToast({
						title: error && (error.errMsg || error.message) || '处理失败，请重试',
						icon: 'none'
					})
				} finally {
					this.working = false
				}
			},
			retry() {
				if (this.state.status === 'replacing') return this.runChoice('local')
				if (this.state.status === 'restoring') return this.runChoice('cloud')
				return this.loadState()
			},
			goBack() {
				uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/exam/exam' }) })
			},
			resourceLabel(resource) {
				return {
					states: '题目状态',
					progress: '答题位置',
					rounds: '章节轮次',
					examDrafts: '考试草稿',
					'准备云端空间': '准备云端空间'
				}[resource] || ''
			},
			formatTime(timestamp) {
				if (!Number(timestamp)) return '暂无'
				const date = new Date(Number(timestamp))
				const pad = value => value < 10 ? `0${value}` : String(value)
				return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
			}
		}
	}
</script>

<style lang="scss">
	page { background: #f4f6f8; color: #222b34; }
	.sync-page { min-height: 100vh; padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
	.intro-card, .progress-card, .status-card { border: 1rpx solid #e5ebf0; border-radius: 20rpx; background: #ffffff; box-shadow: 0 6rpx 24rpx rgba(34, 49, 64, 0.05); }
	.intro-card { display: flex; align-items: center; flex-direction: column; padding: 34rpx 30rpx; text-align: center; }
	.intro-icon { display: flex; align-items: center; justify-content: center; width: 82rpx; height: 82rpx; border-radius: 41rpx; background: #eaf5ff; }
	.intro-title { margin-top: 20rpx; font-size: 34rpx; font-weight: 650; }
	.intro-desc { margin-top: 13rpx; color: #727c87; font-size: 25rpx; line-height: 1.65; }
	.compare-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16rpx; margin-top: 20rpx; }
	.progress-card { padding: 24rpx 22rpx; }
	.card-heading { display: flex; align-items: center; justify-content: space-between; }
	.card-title { font-size: 28rpx; font-weight: 600; }
	.card-tag { padding: 5rpx 10rpx; border-radius: 12rpx; background: #eaf5ff; color: #008cff; font-size: 20rpx; }
	.card-tag.cloud { background: #eef1ff; color: #526bd7; }
	.metric-main { margin-top: 24rpx; color: #18222d; font-size: 44rpx; font-weight: 700; }
	.metric-main text { color: #737d87; font-size: 22rpx; font-weight: 400; }
	.metric-row { display: flex; justify-content: space-between; margin-top: 18rpx; color: #4f5a65; font-size: 23rpx; }
	.metric-meta { display: block; margin-top: 12rpx; color: #8b949d; font-size: 21rpx; line-height: 1.4; }
	.status-card { margin-top: 20rpx; padding: 24rpx; }
	.status-line { display: flex; align-items: flex-start; }
	.status-copy { display: flex; flex: 1; flex-direction: column; margin-left: 15rpx; }
	.status-title { font-size: 28rpx; font-weight: 600; }
	.status-desc { margin-top: 8rpx; color: #747e88; font-size: 23rpx; line-height: 1.5; }
	.progress-track { height: 10rpx; margin-top: 20rpx; overflow: hidden; border-radius: 5rpx; background: #e9edf1; }
	.progress-fill { height: 100%; border-radius: 5rpx; background: #008cff; transition: width 0.2s ease; }
	.action-area { margin-top: 28rpx; }
	.action-button { height: 88rpx; border-radius: 44rpx; font-size: 28rpx; font-weight: 600; line-height: 88rpx; }
	.action-button::after, .later-button::after { border: 0; }
	.action-button.primary { background: #008cff; color: #ffffff; }
	.action-button.secondary { margin-top: 26rpx; border: 2rpx solid #008cff; background: #ffffff; color: #008cff; }
	.action-button[disabled] { opacity: 0.55; }
	.action-note { display: block; margin-top: 10rpx; color: #89929c; font-size: 22rpx; text-align: center; }
	.later-button { margin-top: 20rpx; background: transparent; color: #727c87; font-size: 25rpx; }
	.safe-note { display: flex; align-items: flex-start; gap: 10rpx; margin-top: 28rpx; padding: 0 10rpx; color: #7a828c; font-size: 22rpx; line-height: 1.55; }
	.night-mode { background: #12171d; color: #e6e9ed; }
	.night-mode .intro-card, .night-mode .progress-card, .night-mode .status-card { border-color: #2d3741; background: #1b222a; box-shadow: none; }
	.night-mode .intro-icon, .night-mode .card-tag { background: #17364d; color: #63b9f6; }
	.night-mode .card-tag.cloud { background: #29314e; color: #99a9ff; }
	.night-mode .intro-desc, .night-mode .metric-main text, .night-mode .metric-row,
	.night-mode .metric-meta, .night-mode .status-desc, .night-mode .action-note,
	.night-mode .safe-note { color: #8f99a5; }
	.night-mode .metric-main { color: #e6e9ed; }
	.night-mode .progress-track { background: #303943; }
	.night-mode .action-button.secondary { background: #1b222a; color: #63b9f6; border-color: #269df0; }
	.night-mode .later-button { color: #9ca6b1; }
	@media screen and (min-width: 768px) {
		.sync-page { width: 100%; max-width: 820px; margin: 0 auto; padding: 24px 24px calc(48px + env(safe-area-inset-bottom)); }
	}
</style>
