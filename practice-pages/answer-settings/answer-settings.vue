<template>
	<view class="settings-page" :class="{ 'night-mode': nightMode }">
		<view class="settings-section">
			<view class="section-heading"><text class="section-title">答题模式</text></view>
			<view class="settings-card mode-card" :class="{ 'is-saving': saving }">
				<view class="mode-segments">
					<view v-for="item in answerModes" :key="item.key" class="mode-segment"
						:class="{ selected: answerMode === item.key }" @tap="selectAnswerMode(item.key)">
						<text>{{ item.name }}</text>
					</view>
				</view>
				<text class="mode-active-desc">{{ selectedAnswerMode.desc }}</text>
			</view>
		</view>

		<view class="settings-section smart-section">
			<view class="section-heading smart-heading">
				<text class="section-title">智能练习设置</text>
				<view class="smart-question-count-control">
					<button class="ratio-step count-step" :disabled="saving || smartPractice.questionCount <= smartQuestionCountMin"
						@tap="adjustSmartQuestionCount(-smartQuestionCountStep)">−</button>
					<text class="smart-question-count-value">{{ smartPractice.questionCount }}题</text>
					<button class="ratio-step count-step" :disabled="saving || smartPractice.questionCount >= smartQuestionCountMax"
						@tap="adjustSmartQuestionCount(smartQuestionCountStep)">＋</button>
				</view>
			</view>
			<view class="smart-card">
				<view class="strategy-segments" :class="{ 'is-saving': saving }">
					<view v-for="item in smartStrategies" :key="item.key" class="strategy-segment"
						:class="{ selected: smartPractice.strategy === item.key }"
						@tap="selectSmartStrategy(item.key)"><text>{{ item.name }}</text></view>
				</view>
				<view v-if="smartPractice.strategy === 'custom'" class="custom-ratio-list">
					<view class="smart-ratio-row" v-for="item in smartCategories" :key="item.key">
						<text class="smart-category">{{ item.name }}</text>
						<view class="smart-ratio-control">
							<button class="ratio-step" :disabled="saving || item.key === 'mastered' || smartRatios[item.key] === 0" @tap="adjustSmartRatio(item.key, -5)">−</button>
							<text class="smart-percent">{{ smartRatios[item.key] }}%</text>
							<button class="ratio-step" :disabled="saving || item.key === 'mastered' || smartRatioAtMaximum(item.key)" @tap="adjustSmartRatio(item.key, 5)">＋</button>
						</view>
						<text class="smart-count">{{ smartQuotas[item.key] }}题</text>
					</view>
				</view>
				<view v-else class="ratio-summary">
					<text class="ratio-summary-title">预计组成</text>
					<view class="ratio-summary-values">
						<text>未答{{ smartQuotas.fresh }}题</text>
						<text class="ratio-summary-separator">·</text>
						<text>错题{{ smartQuotas.wrong }}题</text>
						<text class="ratio-summary-separator">·</text>
						<text>已答对{{ smartQuotas.mastered }}题</text>
					</view>
				</view>
			</view>
		</view>

		<view class="settings-section other-section">
			<view class="section-heading"><text class="section-title">其他设置</text></view>
			<view class="settings-card other-card">
				<view class="setting-row night-option" :class="{ 'is-saving': saving }" @tap="toggleNightMode">
					<view class="setting-icon night-icon"><view class="moon-shape"><view class="moon-cutout"></view></view></view>
					<view class="setting-copy">
						<text class="setting-title">夜间模式</text>
						<text class="setting-desc">在题库相关页面生效</text>
					</view>
					<view class="night-control">
						<view class="switch-preview" :class="{ active: nightMode }"><view class="switch-thumb"></view></view>
					</view>
				</view>
				<view class="setting-divider"></view>
				<view class="setting-row clear-option" :class="{ 'is-clearing': clearingSubjectData }" @tap="confirmClearSubjectData">
					<view class="setting-icon clear-icon"><uni-icons type="trash" size="21" color="#008cff"></uni-icons></view>
					<view class="setting-copy">
						<text class="setting-title">清除当前科目做题数据</text>
						<text class="setting-desc">{{ currentSubjectName }} · 答题、错题、收藏和进度</text>
					</view>
					<view class="row-chevron"></view>
				</view>
			</view>
		</view>

		<view class="sync-note" v-if="syncError" @tap="retrySync">
			<uni-icons type="cloud-upload" size="17" color="#b36a1d"></uni-icons>
			<text>{{ syncError }}，点击重试</text>
		</view>

		<!-- #ifdef MP-WEIXIN -->
		<view class="settings-ad-container" v-if="showAds">
			<ad-custom class="settings-ad" unit-id="adunit-a5cd0c36c24ffd76"
				@load="adLoad" @error="adError" @close="adClose"></ad-custom>
		</view>
		<!-- #endif -->
	</view>
</template>

<script>
	const {
		MIN_SMART_QUESTION_COUNT,
		MAX_SMART_QUESTION_COUNT,
		SMART_QUESTION_COUNT_STEP,
		normalizeSmartPractice,
		smartPracticeRatios,
		smartPracticeQuotas
	} = require('@/services/smart-practice.js')
	import {
		clearSubjectPracticeState,
		getPracticeState,
		getSubjectById
	} from '@/data/practice.js'
	import {
		clearCurrentSubjectPracticeData,
		getLocalPracticePreferences,
		getPracticePreferences,
		updatePracticePreferences
	} from '@/services/user-practice.js'
	import {
		getCachedMembership,
		getMembership
	} from '@/services/membership.js'
	const PREFERENCES_SYNC_DEBOUNCE_MS = 800

	function showConfirm(title, content, confirmText) {
		return new Promise(resolve => {
			uni.showModal({
				title,
				content,
				confirmText,
				confirmColor: '#d64545',
				success: result => resolve(Boolean(result.confirm)),
				fail: () => resolve(false)
			})
		})
	}

	export default {
		data() {
			const localPreferences = getLocalPracticePreferences()
			const practiceState = getPracticeState()
			return {
				membership: getCachedMembership(),
				membershipLoaded: false,
				preferenceSyncTimer: null,
				preferenceSyncRequest: null,
				answerMode: localPreferences.answerMode,
				nightMode: Boolean(localPreferences.nightMode),
				smartPractice: normalizeSmartPractice(localPreferences.smartPractice),
				smartStrategies: [
					{ key: 'fresh', name: '新题优先' },
					{ key: 'balanced', name: '均衡练习' }, { key: 'wrong', name: '错题巩固' },
					{ key: 'custom', name: '自定义' }
				],
				smartCategories: [
					{ key: 'fresh', name: '未答题' }, { key: 'wrong', name: '错题' },
					{ key: 'mastered', name: '已答对题' }
				],
				smartQuestionCountMin: MIN_SMART_QUESTION_COUNT,
				smartQuestionCountMax: MAX_SMART_QUESTION_COUNT,
				smartQuestionCountStep: SMART_QUESTION_COUNT_STEP,
				saving: false,
				clearingSubjectData: false,
				currentSubjectId: practiceState.currentSubjectId,
				syncError: '',
				answerModes: [
					{
						key: 'practice',
						name: '做题模式',
						desc: '每题作答后显示答案与解析',
						icon: 'checkbox-filled',
						color: '#008cff',
						tone: 'blue'
					},
					{
						key: 'review',
						name: '背题模式',
						desc: '进入题目后直接显示答案与解析',
						icon: 'eye-filled',
						color: '#008cff',
						tone: 'blue'
					},
					{
						key: 'exam',
						name: '考试模式',
						desc: '提交整套试卷后统一查看答案与解析',
						icon: 'paperplane-filled',
						color: '#008cff',
						tone: 'blue'
					}
				]
			}
		},
		computed: {
			selectedAnswerMode() {
				return this.answerModes.find(item => item.key === this.answerMode) || this.answerModes[0]
			},
			smartRatios() { return smartPracticeRatios(this.smartPractice) },
			smartQuotas() {
				return smartPracticeQuotas(this.smartPractice, this.smartPractice.questionCount)
			},
			currentSubjectName() {
				return getSubjectById(this.currentSubjectId).name
			},
			showAds() {
				return this.membershipLoaded && !this.membership.isMember
			}
		},
		async onLoad() {
			this.applyPreferences(getLocalPracticePreferences())
			await this.refreshMembership()
			await this.loadPreferences({ forceRefresh: true })
		},
		onHide() {
			this.flushPendingPreferences({ notify: false })
		},
		onUnload() {
			this.flushPendingPreferences({ notify: false })
		},
		methods: {
			async refreshMembership(options) {
				try {
					this.membership = await getMembership(options)
				} catch (error) {
					this.membership = getCachedMembership()
				} finally {
					this.membershipLoaded = true
				}
			},
			async confirmClearSubjectData() {
				if (this.clearingSubjectData) return
				const confirmed = await showConfirm(
					'清除当前科目数据',
					this.membership.isMember
						? `将永久删除“${this.currentSubjectName}”的本地及云端答题记录、错题、收藏、统计和练习进度。微信账号、答题偏好及其他科目不受影响。`
						: `将永久删除“${this.currentSubjectName}”保存在本机的答题记录、错题、收藏、统计和练习进度。微信账号、答题偏好及其他科目不受影响。`,
					'确认清除'
				)
				if (!confirmed) return
				this.clearingSubjectData = true
				uni.showLoading({ title: '正在清除', mask: true })
				try {
					const cleared = await clearCurrentSubjectPracticeData(this.currentSubjectId)
					clearSubjectPracticeState(this.currentSubjectId)
					uni.hideLoading()
					uni.showModal({
						title: '清除完成',
						content: cleared.localOnly
							? `“${this.currentSubjectName}”的本地做题数据已清除。`
							: `“${this.currentSubjectName}”的本地和云端做题数据已清除。`,
						showCancel: false
					})
				} catch (error) {
					uni.hideLoading()
					uni.showToast({
						title: (error && (error.errMsg || error.message)) || '清除失败，请重试',
						icon: 'none'
					})
				} finally {
					this.clearingSubjectData = false
				}
			},
			applyPreferences(preferences) {
				this.answerMode = preferences.answerMode
				this.nightMode = Boolean(preferences.nightMode)
				this.smartPractice = normalizeSmartPractice(preferences.smartPractice)
				this.applyNavigationTheme()
			},
			applyNavigationTheme() {
				uni.setNavigationBarColor({
					frontColor: this.nightMode ? '#ffffff' : '#000000',
					backgroundColor: this.nightMode ? '#171c22' : '#ffffff'
				})
			},
			async loadPreferences(options) {
				if (this.saving) return
				this.clearPreferenceSyncTimer()
				this.saving = true
				this.syncError = ''
				try {
					const preferences = await getPracticePreferences(options)
					this.applyPreferences(preferences)
					this.syncError = preferences._syncError || ''
				} finally {
					this.saving = false
				}
			},
			clearPreferenceSyncTimer() {
				if (!this.preferenceSyncTimer) return
				clearTimeout(this.preferenceSyncTimer)
				this.preferenceSyncTimer = null
			},
			schedulePreferenceSync() {
				this.clearPreferenceSyncTimer()
				this.preferenceSyncTimer = setTimeout(() => {
					this.preferenceSyncTimer = null
					this.flushPendingPreferences({ notify: true })
				}, PREFERENCES_SYNC_DEBOUNCE_MS)
			},
			flushPendingPreferences(options) {
				this.clearPreferenceSyncTimer()
				if (this.preferenceSyncRequest) return this.preferenceSyncRequest
				const localPreferences = getLocalPracticePreferences()
				if (!localPreferences._syncPending) return Promise.resolve(localPreferences)
				const config = options || {}
				this.saving = true
				this.preferenceSyncRequest = (async () => {
					try {
						const saved = await getPracticePreferences()
						this.applyPreferences(saved)
						if (saved._syncError) {
							this.syncError = '设置已保存本机，云端同步失败'
							if (config.notify !== false) {
								uni.showToast({ title: '云同步失败，稍后将重试', icon: 'none' })
							}
						} else {
							this.syncError = ''
						}
						return saved
					} catch (error) {
						const local = getLocalPracticePreferences()
						this.applyPreferences(local)
						this.syncError = '设置已保存本机，云端同步失败'
						if (config.notify !== false) {
							uni.showToast({ title: '云同步失败，稍后将重试', icon: 'none' })
						}
						return local
					} finally {
						this.saving = false
						this.preferenceSyncRequest = null
					}
				})()
				return this.preferenceSyncRequest
			},
			selectSmartStrategy(strategy) {
				if (this.saving || strategy === this.smartPractice.strategy) return
				return this.persistPreferences({ smartPractice: Object.assign({}, this.smartPractice, { strategy }) })
			},
			adjustSmartQuestionCount(delta) {
				if (this.saving) return
				const questionCount = Math.max(
					this.smartQuestionCountMin,
					Math.min(this.smartQuestionCountMax, this.smartPractice.questionCount + delta)
				)
				if (questionCount === this.smartPractice.questionCount) return
				return this.persistPreferences({
					smartPractice: Object.assign({}, this.smartPractice, { questionCount })
				})
			},
			smartRatioAtMaximum(key) {
				if (key === 'mastered') return true
				return this.smartPractice.custom[key] >= (key === 'fresh' ? 100 : 100 - this.smartPractice.custom.fresh)
			},
			adjustSmartRatio(key, delta) {
				if (this.saving || key === 'mastered') return
				const custom = Object.assign({}, this.smartPractice.custom)
				custom[key] = Math.max(0, Math.min(key === 'fresh' ? 100 : 100 - custom.fresh, custom[key] + delta))
				custom.wrong = Math.min(custom.wrong, 100 - custom.fresh)
				custom.mastered = 100 - custom.fresh - custom.wrong
				return this.persistPreferences({
					smartPractice: Object.assign({}, this.smartPractice, { strategy: 'custom', custom })
				})
			},
			async selectAnswerMode(answerMode) {
				if (this.saving || answerMode === this.answerMode) return
				this.persistPreferences({ answerMode })
			},
			toggleNightMode() {
				if (this.saving) return
				this.persistPreferences({ nightMode: !this.nightMode })
			},
			async persistPreferences(changes) {
				const next = Object.assign({
					answerMode: this.answerMode,
					nightMode: this.nightMode,
					smartPractice: this.smartPractice
				}, changes)
				this.applyPreferences(next)
				this.syncError = ''
				try {
					const saved = await updatePracticePreferences(next, { deferSync: true })
					this.applyPreferences(saved)
					if (saved._syncPending) this.schedulePreferenceSync()
					else this.clearPreferenceSyncTimer()
				} catch (error) {
					this.applyPreferences(getLocalPracticePreferences())
					this.syncError = '设置已保存本机，云端同步失败'
					uni.showToast({ title: '云同步失败，稍后将重试', icon: 'none' })
				}
			},
			retrySync() {
				this.flushPendingPreferences({ notify: true })
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
	page { background: #f5f6f8; color: #262a30; }
	.settings-page { min-height: 100vh; padding: 24rpx 24rpx calc(38rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
	.settings-section { margin-bottom: 24rpx; }
	.section-heading { display: flex; flex-direction: column; margin: 0 4rpx 12rpx; }
	.section-title { font-size: 29rpx; font-weight: 600; }
	.section-desc { margin-top: 4rpx; color: #7c8692; font-size: 21rpx; }
	.settings-card, .smart-card { border: 1rpx solid #edf0f3; border-radius: 16rpx; box-sizing: border-box; background: #ffffff; box-shadow: 0 4rpx 14rpx rgba(31, 45, 61, 0.04); }
	.settings-card.is-saving, .night-option.is-saving { opacity: 0.72; }

	.mode-card { padding: 14rpx; }
	.mode-segments { display: flex; padding: 5rpx; border-radius: 12rpx; background: #f1f4f7; }
	.mode-segment { display: flex; align-items: center; justify-content: center; height: 64rpx; flex: 1; border-radius: 9rpx; color: #69737f; font-size: 24rpx; font-weight: 600; }
	.mode-segment.selected { color: #ffffff; background: #008cff; box-shadow: 0 4rpx 12rpx rgba(0, 140, 255, 0.2); }
	.mode-active-desc { display: block; padding: 14rpx 10rpx 2rpx; color: #737d88; font-size: 21rpx; line-height: 1.45; }

	.smart-card { padding: 18rpx 20rpx; }
	.strategy-segments { display: flex; padding: 5rpx; border-radius: 12rpx; background: #f1f4f7; }
	.strategy-segments.is-saving { opacity: 0.72; }
	.strategy-segment { display: flex; align-items: center; justify-content: center; height: 58rpx; flex: 1; min-width: 0; border-radius: 9rpx; color: #69737f; font-size: 24rpx; font-weight: 600; white-space: nowrap; }
	.strategy-segment.selected { color: #ffffff; background: #008cff; box-shadow: 0 3rpx 10rpx rgba(0, 140, 255, 0.18); }
	.smart-heading { flex-direction: row; align-items: center; justify-content: space-between; min-height: 52rpx; }
	.smart-question-count-control { display: flex; align-items: center; gap: 6rpx; }
	.smart-question-count-value { width: 76rpx; text-align: center; color: #008cff; font-size: 24rpx; font-weight: 600; }
	.ratio-step.count-step { width: 46rpx; height: 46rpx; border-radius: 8rpx; font-size: 24rpx; }
	.ratio-step::after { border: none; }
	.ratio-step[disabled] { opacity: 0.5; }
	.ratio-summary { display: flex; align-items: center; justify-content: space-between; min-height: 62rpx; padding: 4rpx 2rpx 0; }
	.ratio-summary-title { flex: 0 0 auto; color: #737d88; font-size: 21rpx; }
	.ratio-summary-values { display: flex; align-items: center; justify-content: flex-end; min-width: 0; color: #008cff; font-size: 22rpx; font-weight: 600; white-space: nowrap; }
	.ratio-summary-separator { padding: 0 9rpx; color: #aeb6bf; font-weight: 400; }
	.custom-ratio-list { padding: 2rpx 5rpx 0; }
	.smart-ratio-row { display: flex; align-items: center; min-height: 66rpx; gap: 10rpx; }
	.smart-category { flex: 1; font-size: 22rpx; }
	.smart-ratio-control { display: flex; align-items: center; gap: 7rpx; }
	.smart-percent { width: 68rpx; text-align: center; color: #008cff; font-size: 24rpx; font-weight: 600; }
	.ratio-step { display: flex; align-items: center; justify-content: center; width: 52rpx; height: 52rpx; padding: 0; margin: 0; border-radius: 9rpx; color: #008cff; background: #edf7ff; font-size: 26rpx; line-height: 1; }
	.smart-count { width: 48rpx; text-align: right; color: #737d88; font-size: 21rpx; }

	.other-section { margin-bottom: 0; }
	.other-card { padding: 0 18rpx; }
	.setting-row { display: flex; align-items: center; min-height: 104rpx; }
	.setting-divider { height: 1rpx; margin-left: 72rpx; background: #edf0f4; }
	.setting-icon { display: flex; align-items: center; justify-content: center; width: 56rpx; height: 56rpx; flex: 0 0 56rpx; margin-right: 16rpx; border-radius: 13rpx; background: #e4f3ff; }
	.setting-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.setting-title { overflow: hidden; color: #30353c; font-size: 25rpx; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
	.setting-desc { overflow: hidden; margin-top: 4rpx; color: #737d88; font-size: 21rpx; text-overflow: ellipsis; white-space: nowrap; }
	.night-option.is-saving, .clear-option.is-clearing { opacity: 0.64; }
	.moon-shape { position: relative; width: 29rpx; height: 29rpx; overflow: hidden; border-radius: 50%; background: #008cff; }
	.moon-cutout { position: absolute; top: -4rpx; right: -4rpx; width: 27rpx; height: 27rpx; border-radius: 50%; background: #e4f3ff; }
	.night-control { display: flex; align-items: center; margin-left: 16rpx; }
	.row-chevron { width: 13rpx; height: 13rpx; flex: 0 0 13rpx; margin: 0 7rpx 0 16rpx; border-top: 3rpx solid #aeb6bf; border-right: 3rpx solid #aeb6bf; transform: rotate(45deg); }
	.switch-preview { position: relative; width: 76rpx; height: 42rpx; flex: 0 0 76rpx; border-radius: 22rpx; background: #dfe3e8; }
	.switch-preview.active { background: #008cff; }
	.switch-thumb { position: absolute; top: 4rpx; left: 4rpx; width: 34rpx; height: 34rpx; border-radius: 50%; background: #ffffff; box-shadow: 0 2rpx 7rpx rgba(31, 45, 61, 0.2); transition: left 0.2s ease; }
	.switch-preview.active .switch-thumb { left: 38rpx; }

	.sync-note { display: flex; align-items: center; justify-content: center; gap: 8rpx; margin-top: 18rpx; color: #a86218; font-size: 21rpx; }
	.settings-ad-container { display: block; width: 100%; margin-top: 28rpx; border-radius: 16rpx; box-sizing: border-box; background: #ffffff; }
	.settings-ad { display: block; width: 100%; border-radius: 16rpx; }

	.settings-page.night-mode { background: #12171d; color: #e6e9ed; }
	.night-mode .settings-card, .night-mode .smart-card { border-color: #2a343e; background: #1b222a; box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.15); }
	.night-mode .section-desc, .night-mode .mode-active-desc,
	.night-mode .ratio-summary-title, .night-mode .smart-count,
	.night-mode .setting-desc { color: #8f99a5; }
	.night-mode .mode-segments { background: #242d37; }
	.night-mode .mode-segment { color: #aeb8c4; }
	.night-mode .mode-segment.selected { color: #ffffff; background: #168ee5; }
	.night-mode .strategy-segments { background: #242d37; }
	.night-mode .strategy-segment { color: #aeb8c4; }
	.night-mode .strategy-segment.selected { color: #ffffff; background: #168ee5; }
	.night-mode .setting-title { color: #e6e9ed; }
	.night-mode .ratio-summary-values, .night-mode .smart-percent,
	.night-mode .smart-question-count-value { color: #53b5ff; }
	.night-mode .ratio-summary-separator { color: #65717d; }
	.night-mode .ratio-step { color: #53b5ff; background: #17364d; }
	.night-mode .setting-divider { background: #303b47; }
	.night-mode .setting-icon { background: #17364d; }
	.night-mode .row-chevron { border-color: #687582; }
	.night-mode .moon-cutout { background: #17364d; }
	.night-mode .switch-preview { background: #3b4651; }
	.night-mode .switch-preview.active { background: #168ee5; }
	.night-mode .sync-note { color: #e0a15f; }
	.night-mode .settings-ad-container { background: #1b222a; }
</style>
