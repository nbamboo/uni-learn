<template>
	<view class="settings-page" :class="{ 'night-mode': nightMode }">
		<view class="settings-section">
			<view class="section-heading"><text class="section-title">答题模式</text></view>
			<view class="settings-card mode-card" :class="{ 'is-saving': saving }">
				<view class="mode-segments">
					<view v-for="item in answerModes" :key="item.key" class="mode-segment"
						:class="{ selected: answerMode === item.key }" @tap="selectAnswerMode(item.key)">
						<text>{{ item.name }}</text>
						<text class="mode-member-badge" v-if="item.key === 'review' && !membership.isMember">会员</text>
					</view>
				</view>
				<text class="mode-active-desc">{{ selectedAnswerMode.desc }}</text>
			</view>
		</view>

		<view class="settings-section smart-section">
			<view class="section-heading"><text class="section-title">智能练习设置</text></view>
			<view class="smart-card">
				<view class="strategy-segments" :class="{ 'is-saving': saving }">
					<view v-for="item in smartStrategies" :key="item.key" class="strategy-segment"
						:class="{ selected: smartPractice.strategy === item.key }"
						@tap="selectSmartStrategy(item.key)"><text>{{ item.name }}</text></view>
				</view>
				<view class="smart-summary-list">
					<view class="smart-summary-row adjustable" @tap="openSmartEditor">
						<text class="smart-summary-label">每组题量</text>
						<view class="smart-summary-main">
							<text class="smart-summary-count">{{ smartPractice.questionCount }}题</text>
							<view class="row-chevron smart-summary-chevron"></view>
						</view>
					</view>
					<view class="smart-summary-divider"></view>
					<view class="smart-summary-row" :class="{ adjustable: smartPractice.strategy === 'custom' }"
						@tap="openSmartRatioEditor">
						<text class="smart-summary-label">{{ smartPractice.strategy === 'custom' ? '自定义组成' : '预计组成' }}</text>
						<view class="smart-summary-main">
							<view class="ratio-summary-values">
								<text>未答{{ smartQuotas.fresh }}题</text>
								<text class="ratio-summary-separator">·</text>
								<text>错题{{ smartQuotas.wrong }}题</text>
								<text class="ratio-summary-separator">·</text>
								<text>已答对{{ smartQuotas.mastered }}题</text>
							</view>
							<view class="row-chevron smart-summary-chevron" v-if="smartPractice.strategy === 'custom'"></view>
						</view>
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

		<view class="save-bar" :class="{ 'night-mode': nightMode }">
			<button class="save-button" :disabled="saving || !hasUnsavedChanges" @tap="savePreferences">
				{{ saving && hasUnsavedChanges ? '保存中…' : '保存设置' }}
			</button>
		</view>

		<uni-popup
			ref="smartEditorPopup"
			type="bottom"
			:background-color="nightMode ? '#1b222a' : '#ffffff'"
			:safe-area="false"
		>
			<view class="smart-editor-sheet" :class="{ 'night-mode': nightMode }">
				<view class="smart-editor-header">
					<view>
						<text class="smart-editor-title">智能练习设置</text>
						<text class="smart-editor-caption">修改后需点击页面底部保存，下次练习生效</text>
					</view>
					<view class="smart-editor-done" @tap="closeSmartEditor">完成</view>
				</view>

				<view class="smart-editor-body">
					<view class="smart-editor-section">
						<view class="smart-editor-section-heading">
							<text class="smart-editor-section-title">每组题量</text>
							<text class="smart-editor-section-note">每次调整 {{ smartQuestionCountStep }} 题</text>
						</view>
						<view class="smart-editor-stepper">
							<button class="smart-editor-step" :disabled="saving || smartPractice.questionCount <= smartQuestionCountMin"
								@tap="adjustSmartQuestionCount(-smartQuestionCountStep)">−</button>
							<text class="smart-editor-value">{{ smartPractice.questionCount }}题</text>
							<button class="smart-editor-step" :disabled="saving || smartPractice.questionCount >= smartQuestionCountMax"
								@tap="adjustSmartQuestionCount(smartQuestionCountStep)">＋</button>
						</view>
					</view>

					<view class="smart-editor-section ratio-editor-section" v-if="smartPractice.strategy === 'custom'">
						<view class="smart-editor-section-heading">
							<text class="smart-editor-section-title">自定义组成</text>
							<text class="smart-editor-section-note">已答对题自动取剩余比例</text>
						</view>
						<view class="smart-editor-ratio-row" v-for="item in smartCategories" :key="item.key">
							<view class="smart-editor-ratio-copy">
								<text class="smart-editor-ratio-name">{{ item.name }}</text>
								<text class="smart-editor-ratio-count">{{ smartQuotas[item.key] }}题</text>
							</view>
							<view class="smart-editor-ratio-control">
								<button class="smart-editor-step" :disabled="saving || item.key === 'mastered' || smartRatios[item.key] === 0"
									@tap="adjustSmartRatio(item.key, -5)">−</button>
								<text class="smart-editor-percent">{{ smartRatios[item.key] }}%</text>
								<button class="smart-editor-step" :disabled="saving || item.key === 'mastered' || smartRatioAtMaximum(item.key)"
									@tap="adjustSmartRatio(item.key, 5)">＋</button>
							</view>
						</view>
					</view>
				</view>
			</view>
		</uni-popup>
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
		FREE_SMART_QUESTION_COUNT_MAX,
		getEffectiveAnswerMode,
		getEffectiveSmartPractice,
		getLocalPracticePreferences,
		getPracticePreferences,
		updatePracticePreferences
	} from '@/services/user-practice.js'
	import {
		getCachedMembership,
		getMembership,
		showMembershipUpsell
	} from '@/services/membership.js'
	const LEAVE_ALERT_MESSAGE = '答题设置尚未保存，确定放弃修改并离开吗？'

	function normalizeStoredPreferences(preferences) {
		const source = preferences || {}
		return {
			answerMode: source.answerMode,
			nightMode: Boolean(source.nightMode),
			smartPractice: normalizeSmartPractice(source.smartPractice)
		}
	}

	function cloneStoredPreferences(preferences) {
		const normalized = normalizeStoredPreferences(preferences)
		return {
			answerMode: normalized.answerMode,
			nightMode: normalized.nightMode,
			smartPractice: Object.assign({}, normalized.smartPractice, {
				custom: Object.assign({}, normalized.smartPractice.custom)
			})
		}
	}

	function preferencesFingerprint(preferences) {
		const normalized = normalizeStoredPreferences(preferences)
		return JSON.stringify({
			answerMode: normalized.answerMode,
			nightMode: normalized.nightMode,
			smartPractice: normalized.smartPractice
		})
	}

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
			const cachedMembership = getCachedMembership()
			const storedPreferences = normalizeStoredPreferences(localPreferences)
			return {
				membership: cachedMembership,
				membershipLoaded: false,
				savedPreferences: cloneStoredPreferences(storedPreferences),
				storedPreferences: cloneStoredPreferences(storedPreferences),
				answerMode: getEffectiveAnswerMode(storedPreferences.answerMode, cachedMembership.isMember),
				nightMode: storedPreferences.nightMode,
				smartPractice: getEffectiveSmartPractice(storedPreferences.smartPractice, cachedMembership.isMember),
				hasUnsavedChanges: false,
				leaveAlertEnabled: false,
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
						key: 'exam',
						name: '考试模式',
						desc: '提交整套试卷后统一查看答案与解析',
						icon: 'paperplane-filled',
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
			this.applyPreferences(getLocalPracticePreferences())
			await this.loadPreferences({ forceRefresh: true })
		},
		async onShow() {
			if (!this.membershipLoaded) return
			await this.refreshMembership({ forceRefresh: true })
			this.applyDraftPreferences(this.storedPreferences)
		},
		onUnload() {
			this.setLeaveAlertEnabled(false)
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
				const stored = cloneStoredPreferences(preferences)
				this.savedPreferences = cloneStoredPreferences(stored)
				this.applyDraftPreferences(stored)
			},
			applyDraftPreferences(preferences) {
				const stored = cloneStoredPreferences(preferences)
				this.storedPreferences = stored
				this.answerMode = getEffectiveAnswerMode(stored.answerMode, this.membership.isMember)
				this.nightMode = stored.nightMode
				this.smartPractice = getEffectiveSmartPractice(stored.smartPractice, this.membership.isMember)
				this.hasUnsavedChanges = preferencesFingerprint(stored) !== preferencesFingerprint(this.savedPreferences)
				this.applyNavigationTheme()
				this.setLeaveAlertEnabled(this.hasUnsavedChanges)
			},
			nextStoredSmartPractice(changes) {
				const stored = normalizeSmartPractice(this.storedPreferences.smartPractice)
				const next = Object.assign({}, stored, changes || {})
				next.custom = Object.assign({}, changes && changes.custom || stored.custom)
				return next
			},
			applyNavigationTheme() {
				uni.setNavigationBarColor({
					frontColor: this.nightMode ? '#ffffff' : '#000000',
					backgroundColor: this.nightMode ? '#171c22' : '#ffffff'
				})
			},
			async loadPreferences(options) {
				if (this.saving) return
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
			setLeaveAlertEnabled(enabled) {
				const nextEnabled = Boolean(enabled)
				if (nextEnabled === this.leaveAlertEnabled) return
				// #ifdef MP-WEIXIN
				if (typeof wx === 'undefined') return
				if (typeof wx.enableAlertBeforeUnload !== 'function'
					|| typeof wx.disableAlertBeforeUnload !== 'function') return
				const methodName = nextEnabled ? 'enableAlertBeforeUnload' : 'disableAlertBeforeUnload'
				const previousEnabled = this.leaveAlertEnabled
				this.leaveAlertEnabled = nextEnabled
				try {
					wx[methodName](nextEnabled ? { message: LEAVE_ALERT_MESSAGE } : {})
				} catch (error) {
					this.leaveAlertEnabled = previousEnabled
				}
				// #endif
			},
			stagePreferences(changes) {
				const next = Object.assign({}, this.storedPreferences, changes)
				this.applyDraftPreferences(next)
				this.syncError = ''
			},
			async savePreferences() {
				if (this.saving || !this.hasUnsavedChanges) return
				this.saving = true
				this.syncError = ''
				try {
					const saved = await updatePracticePreferences(cloneStoredPreferences(this.storedPreferences))
					this.applyPreferences(saved)
					uni.showToast({ title: '保存成功', icon: 'success' })
					return saved
				} catch (error) {
					const local = getLocalPracticePreferences()
					this.applyPreferences(local)
					this.syncError = '设置已保存本机，云端同步失败'
					uni.showToast({ title: '云同步失败，稍后可重试', icon: 'none' })
					return local
				} finally {
					this.saving = false
				}
			},
			openSmartEditor() {
				if (this.$refs && this.$refs.smartEditorPopup) {
					this.$refs.smartEditorPopup.open()
				}
			},
			openSmartRatioEditor() {
				if (this.smartPractice.strategy !== 'custom') return
				this.openSmartEditor()
			},
			closeSmartEditor() {
				if (this.$refs && this.$refs.smartEditorPopup) {
					this.$refs.smartEditorPopup.close()
				}
			},
			selectSmartStrategy(strategy) {
				if (this.saving || strategy === this.smartPractice.strategy) return
				return this.stagePreferences({
					smartPractice: this.nextStoredSmartPractice({ strategy })
				})
			},
			async adjustSmartQuestionCount(delta) {
				if (this.saving) return
				const questionCount = Math.max(
					this.smartQuestionCountMin,
					Math.min(this.smartQuestionCountMax, this.smartPractice.questionCount + delta)
				)
				if (questionCount === this.smartPractice.questionCount) return
				if (questionCount > FREE_SMART_QUESTION_COUNT_MAX) {
					if (!this.membershipLoaded) await this.refreshMembership()
					if (!this.membership.isMember) {
						await showMembershipUpsell('非会员每组最多设置30题，开通会员后最高可设置50题。')
						return
					}
				}
				return this.stagePreferences({
					smartPractice: this.nextStoredSmartPractice({ questionCount })
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
				return this.stagePreferences({
					smartPractice: this.nextStoredSmartPractice({ strategy: 'custom', custom })
				})
			},
			async selectAnswerMode(answerMode) {
				if (this.saving || answerMode === this.answerMode) return
				if (answerMode === 'review') {
					if (!this.membershipLoaded) await this.refreshMembership()
					if (!this.membership.isMember) {
						await showMembershipUpsell('开通会员后即可使用背题模式，进入题目后直接查看答案与解析。')
						return
					}
				}
				return this.stagePreferences({ answerMode })
			},
			toggleNightMode() {
				if (this.saving) return
				this.stagePreferences({ nightMode: !this.nightMode })
			},
			async retrySync() {
				if (this.saving) return
				this.saving = true
				try {
					const saved = await getPracticePreferences()
					this.applyPreferences(saved)
					if (saved._syncError) {
						this.syncError = '设置已保存本机，云端同步失败'
						uni.showToast({ title: '云同步失败，稍后可重试', icon: 'none' })
					} else {
						this.syncError = ''
						uni.showToast({ title: '云端同步成功', icon: 'success' })
					}
					return saved
				} catch (error) {
					this.syncError = '设置已保存本机，云端同步失败'
					uni.showToast({ title: '云同步失败，稍后可重试', icon: 'none' })
				} finally {
					this.saving = false
				}
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
	.settings-page { min-height: 100vh; padding: 24rpx 24rpx calc(164rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
	.settings-section { margin-bottom: 28rpx; }
	.section-heading { display: flex; flex-direction: column; margin: 0 4rpx 16rpx; }
	.section-title { font-size: 32rpx; font-weight: 600; }
	.section-desc { margin-top: 4rpx; color: #7c8692; font-size: 24rpx; }
	.settings-card, .smart-card { border: 1rpx solid #edf0f3; border-radius: 16rpx; box-sizing: border-box; background: #ffffff; box-shadow: 0 4rpx 14rpx rgba(31, 45, 61, 0.04); }
	.settings-card.is-saving, .night-option.is-saving { opacity: 0.72; }

	.mode-card { padding: 16rpx; }
	.mode-segments { display: flex; padding: 5rpx; border-radius: 12rpx; background: #f1f4f7; }
	.mode-segment { display: flex; align-items: center; justify-content: center; height: 68rpx; flex: 1; border-radius: 9rpx; color: #69737f; font-size: 29rpx; font-weight: 600; }
	.mode-segment.selected { color: #ffffff; background: #008cff; box-shadow: 0 4rpx 12rpx rgba(0, 140, 255, 0.2); }
	.mode-member-badge { margin-left: 7rpx; padding: 2rpx 7rpx; border-radius: 8rpx; background: #30465f; color: #ffffff; font-size: 18rpx; font-weight: 500; line-height: 1.2; }
	.mode-active-desc { display: block; padding: 18rpx 10rpx 6rpx 32rpx; color: #737d88; font-size: 24rpx; line-height: 1.45; }

	.smart-card { padding: 20rpx; }
	.strategy-segments { display: flex; padding: 5rpx; border-radius: 12rpx; background: #f1f4f7; }
	.strategy-segments.is-saving { opacity: 0.72; }
	.strategy-segment { display: flex; align-items: center; justify-content: center; height: 64rpx; flex: 1; min-width: 0; border-radius: 9rpx; color: #69737f; font-size: 29rpx; font-weight: 600; white-space: nowrap; }
	.strategy-segment.selected { color: #ffffff; background: #008cff; box-shadow: 0 3rpx 10rpx rgba(0, 140, 255, 0.18); }
	.smart-summary-list { margin-top: 10rpx; }
	.smart-summary-row { display: flex; align-items: center; justify-content: space-between; min-height: 74rpx; padding: 0 4rpx 0 28rpx; box-sizing: border-box; }
	.smart-summary-row.adjustable { cursor: pointer; }
	.smart-summary-label { flex: 0 0 auto; color: inherit; font-size: 28rpx; }
	.smart-summary-main { display: flex; align-items: center; justify-content: flex-end; min-width: 0; margin-left: 20rpx; }
	.smart-summary-count { color: #008cff; font-size: 30rpx; font-weight: 600; }
	.smart-summary-divider { height: 1rpx; margin-left: 28rpx; background: #edf0f3; }
	.ratio-summary-values { display: flex; align-items: center; justify-content: flex-end; min-width: 0; color: #008cff; font-size: 26rpx; font-weight: 600; white-space: nowrap; }
	.ratio-summary-separator { padding: 0 9rpx; color: #aeb6bf; font-weight: 400; }
	.smart-summary-chevron { margin-right: 8rpx; }

	.smart-editor-sheet { max-height: 82vh; padding-bottom: env(safe-area-inset-bottom); overflow: hidden; border-radius: 20rpx 20rpx 0 0; box-sizing: border-box; background: #ffffff; color: #262a30; }
	.smart-editor-header { display: flex; align-items: center; justify-content: space-between; min-height: 104rpx; padding: 18rpx 28rpx; border-bottom: 1rpx solid #edf0f3; box-sizing: border-box; }
	.smart-editor-header > view:first-child { display: flex; flex-direction: column; min-width: 0; }
	.smart-editor-title { font-size: 32rpx; font-weight: 600; }
	.smart-editor-caption { margin-top: 5rpx; color: #7c8692; font-size: 24rpx; }
	.smart-editor-done { margin-left: 24rpx; padding: 18rpx 8rpx 18rpx 24rpx; color: #008cff; font-size: 28rpx; font-weight: 600; }
	.smart-editor-body { max-height: calc(82vh - 104rpx - env(safe-area-inset-bottom)); padding: 24rpx 28rpx 30rpx; overflow-y: auto; box-sizing: border-box; }
	.smart-editor-section-heading { display: flex; align-items: baseline; justify-content: space-between; }
	.smart-editor-section-title { font-size: 30rpx; font-weight: 600; }
	.smart-editor-section-note { margin-left: 20rpx; color: #7c8692; font-size: 24rpx; }
	.smart-editor-stepper { display: flex; align-items: center; justify-content: center; gap: 28rpx; margin-top: 22rpx; }
	.smart-editor-step { display: flex; align-items: center; justify-content: center; width: 112rpx; height: 88rpx; padding: 0; margin: 0; border-radius: 14rpx; background: #edf7ff; color: #008cff; font-size: 39rpx; line-height: 1; }
	.smart-editor-step::after { border: none; }
	.smart-editor-step[disabled] { opacity: 0.42; }
	.smart-editor-value { min-width: 150rpx; color: #008cff; font-size: 39rpx; font-weight: 600; text-align: center; }
	.ratio-editor-section { margin-top: 30rpx; padding-top: 26rpx; border-top: 1rpx solid #edf0f3; }
	.smart-editor-ratio-row { display: flex; align-items: center; justify-content: space-between; min-height: 116rpx; }
	.smart-editor-ratio-copy { display: flex; align-items: baseline; flex: 1; min-width: 0; }
	.smart-editor-ratio-name { font-size: 29rpx; }
	.smart-editor-ratio-count { margin-left: 14rpx; color: #7c8692; font-size: 24rpx; }
	.smart-editor-ratio-control { display: flex; align-items: center; gap: 14rpx; margin-left: 24rpx; }
	.smart-editor-ratio-control .smart-editor-step { width: 88rpx; height: 88rpx; }
	.smart-editor-percent { width: 104rpx; color: #008cff; font-size: 35rpx; font-weight: 600; text-align: center; }

	.other-section { margin-bottom: 0; }
	.other-card { padding: 0 24rpx; }
	.setting-row { display: flex; align-items: center; min-height: 116rpx; }
	.setting-divider { height: 1rpx; margin-left: 72rpx; background: #edf0f4; }
	.setting-icon { display: flex; align-items: center; justify-content: center; width: 56rpx; height: 56rpx; flex: 0 0 56rpx; margin-right: 16rpx; border-radius: 13rpx; background: #e4f3ff; }
	.setting-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.setting-title { overflow: hidden; color: #30353c; font-size: 29rpx; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
	.setting-desc { overflow: hidden; margin-top: 6rpx; color: #737d88; font-size: 24rpx; text-overflow: ellipsis; white-space: nowrap; }
	.night-option.is-saving, .clear-option.is-clearing { opacity: 0.64; }
	.moon-shape { position: relative; width: 29rpx; height: 29rpx; overflow: hidden; border-radius: 50%; background: #008cff; }
	.moon-cutout { position: absolute; top: -4rpx; right: -4rpx; width: 27rpx; height: 27rpx; border-radius: 50%; background: #e4f3ff; }
	.night-control { display: flex; align-items: center; margin-left: 16rpx; }
	.row-chevron { width: 13rpx; height: 13rpx; flex: 0 0 13rpx; margin: 0 7rpx 0 16rpx; border-top: 3rpx solid #aeb6bf; border-right: 3rpx solid #aeb6bf; transform: rotate(45deg); }
	.switch-preview { position: relative; width: 76rpx; height: 42rpx; flex: 0 0 76rpx; border-radius: 22rpx; background: #dfe3e8; }
	.switch-preview.active { background: #008cff; }
	.switch-thumb { position: absolute; top: 4rpx; left: 4rpx; width: 34rpx; height: 34rpx; border-radius: 50%; background: #ffffff; box-shadow: 0 2rpx 7rpx rgba(31, 45, 61, 0.2); transition: left 0.2s ease; }
	.switch-preview.active .switch-thumb { left: 38rpx; }

	.sync-note { display: flex; align-items: center; justify-content: center; gap: 8rpx; margin-top: 18rpx; color: #a86218; font-size: 24rpx; }
	.settings-ad-container { display: block; width: 100%; margin-top: 28rpx; border-radius: 16rpx; box-sizing: border-box; background: #ffffff; }
	.settings-ad { display: block; width: 100%; border-radius: 16rpx; }
	.save-bar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; padding: 18rpx 24rpx calc(18rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #e8ecf0; box-sizing: border-box; background: rgba(255, 255, 255, 0.96); }
	.save-button { display: flex; align-items: center; justify-content: center; width: 100%; height: 84rpx; margin: 0; padding: 0; border-radius: 14rpx; background: #008cff; color: #ffffff; font-size: 30rpx; font-weight: 600; line-height: 1; }
	.save-button::after { border: none; }
	.save-button[disabled] { background: #c8d0d8; color: #ffffff; opacity: 1; }

	.settings-page.night-mode { background: #12171d; color: #e6e9ed; }
	.night-mode .settings-card, .night-mode .smart-card { border-color: #2a343e; background: #1b222a; box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.15); }
	.night-mode .section-desc, .night-mode .mode-active-desc,
	.night-mode .setting-desc { color: #8f99a5; }
	.night-mode .mode-segments { background: #242d37; }
	.night-mode .mode-segment { color: #aeb8c4; }
	.night-mode .mode-segment.selected { color: #ffffff; background: #168ee5; }
	.night-mode .mode-member-badge { background: #49637f; }
	.night-mode .strategy-segments { background: #242d37; }
	.night-mode .strategy-segment { color: #aeb8c4; }
	.night-mode .strategy-segment.selected { color: #ffffff; background: #168ee5; }
	.night-mode .setting-title { color: #e6e9ed; }
	.night-mode .ratio-summary-values,
	.night-mode .smart-summary-count { color: #53b5ff; }
	.night-mode .ratio-summary-separator { color: #65717d; }
	.night-mode .smart-summary-divider { background: #303b47; }
	.night-mode .setting-divider { background: #303b47; }
	.night-mode .setting-icon { background: #17364d; }
	.night-mode .row-chevron { border-color: #687582; }
	.night-mode .moon-cutout { background: #17364d; }
	.night-mode .switch-preview { background: #3b4651; }
	.night-mode .switch-preview.active { background: #168ee5; }
	.night-mode .sync-note { color: #e0a15f; }
	.night-mode .settings-ad-container { background: #1b222a; }
	.save-bar.night-mode { border-color: #303b47; background: rgba(23, 28, 34, 0.96); }
	.save-bar.night-mode .save-button[disabled] { background: #3b4651; color: #7f8a96; }
	.smart-editor-sheet.night-mode { background: #1b222a; color: #e6e9ed; }
	.smart-editor-sheet.night-mode .smart-editor-header,
	.smart-editor-sheet.night-mode .ratio-editor-section { border-color: #303b47; }
	.smart-editor-sheet.night-mode .smart-editor-caption,
	.smart-editor-sheet.night-mode .smart-editor-section-note,
	.smart-editor-sheet.night-mode .smart-editor-ratio-count { color: #8f99a5; }
	.smart-editor-sheet.night-mode .smart-editor-step { background: #17364d; color: #53b5ff; }
	.smart-editor-sheet.night-mode .smart-editor-value,
	.smart-editor-sheet.night-mode .smart-editor-percent,
	.smart-editor-sheet.night-mode .smart-editor-done { color: #53b5ff; }
</style>
