<template>
	<view class="settings-page" :class="{ 'night-mode': nightMode }">
		<view class="settings-section">
			<view class="section-heading">
				<text class="section-title">答题模式</text>
				<text class="section-desc">答案与解析将在不同阶段展示</text>
			</view>

			<view class="mode-list">
				<view
					class="mode-option"
					:class="{ selected: answerMode === item.key, 'is-saving': saving }"
					v-for="item in answerModes"
					:key="item.key"
					@tap="selectAnswerMode(item.key)"
				>
					<view class="mode-icon" :class="item.tone">
						<uni-icons :type="item.icon" size="24" :color="item.color"></uni-icons>
					</view>
					<view class="mode-copy">
						<view class="mode-title-row">
							<text class="mode-name">{{ item.name }}</text>
							<text class="current-tag" v-if="answerMode === item.key">当前模式</text>
						</view>
						<text class="mode-desc">{{ item.desc }}</text>
					</view>
					<view class="radio-mark">
						<view class="radio-dot" v-if="answerMode === item.key"></view>
					</view>
				</view>
			</view>
		</view>

		<view class="settings-section display-section">
			<view class="section-heading">
				<text class="section-title">显示设置</text>
				<text class="section-desc">调整答题页面的视觉体验</text>
			</view>

			<view class="night-option" :class="{ 'is-saving': saving }" @tap="toggleNightMode">
				<view class="night-icon">
					<view class="moon-shape">
						<view class="moon-cutout"></view>
					</view>
				</view>
				<view class="night-copy">
					<text class="night-title">夜间模式</text>
					<text class="night-desc">在刷题相关页面生效</text>
				</view>
				<view class="night-control">
					<text class="switch-status">{{ nightMode ? '开启' : '关闭' }}</text>
					<view class="switch-preview" :class="{ active: nightMode }">
						<view class="switch-thumb"></view>
					</view>
				</view>
			</view>
		</view>

		<view class="sync-note" v-if="syncError" @tap="retrySync">
			<uni-icons type="cloud-upload" size="17" color="#b36a1d"></uni-icons>
			<text>{{ syncError }}，点击重试</text>
		</view>
	</view>
</template>

<script>
	import {
		getLocalPracticePreferences,
		getPracticePreferences,
		updatePracticePreferences
	} from '@/services/user-practice.js'

	export default {
		data() {
			const localPreferences = getLocalPracticePreferences()
			return {
				answerMode: localPreferences.answerMode,
				nightMode: Boolean(localPreferences.nightMode),
				saving: false,
				syncError: '',
				answerModes: [
					{
						key: 'exam',
						name: '考试模式',
						desc: '提交整套试卷后统一查看答案与解析',
						icon: 'locked-filled',
						color: '#008cff',
						tone: 'blue'
					},
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
					}
				]
			}
		},
		onLoad() {
			this.applyPreferences(getLocalPracticePreferences())
			this.loadPreferences()
		},
		methods: {
			applyPreferences(preferences) {
				this.answerMode = preferences.answerMode
				this.nightMode = Boolean(preferences.nightMode)
				this.applyNavigationTheme()
			},
			applyNavigationTheme() {
				uni.setNavigationBarColor({
					frontColor: this.nightMode ? '#ffffff' : '#000000',
					backgroundColor: this.nightMode ? '#171c22' : '#ffffff'
				})
			},
			async loadPreferences() {
				if (this.saving) return
				this.saving = true
				this.syncError = ''
				try {
					const preferences = await getPracticePreferences()
					this.applyPreferences(preferences)
					this.syncError = preferences._syncError || ''
				} finally {
					this.saving = false
				}
			},
			selectAnswerMode(answerMode) {
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
					nightMode: this.nightMode
				}, changes)
				this.applyPreferences(next)
				this.saving = true
				this.syncError = ''
				try {
					const saved = await updatePracticePreferences(next)
					this.applyPreferences(saved)
					uni.showToast({ title: '设置已同步', icon: 'success' })
				} catch (error) {
					this.syncError = '设置已保存本机，云端同步失败'
					uni.showToast({ title: '云同步失败，稍后将重试', icon: 'none' })
				} finally {
					this.saving = false
				}
			},
			retrySync() {
				this.loadPreferences()
			}
		}
	}
</script>

<style lang="scss">
	page { background: #f5f6f8; color: #262a30; }
	.settings-page { min-height: 100vh; padding: 34rpx 28rpx calc(56rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
	.settings-section { margin-bottom: 38rpx; }
	.section-heading { display: flex; flex-direction: column; margin: 0 4rpx 18rpx; }
	.section-title { font-size: 29rpx; font-weight: 650; }
	.section-desc { margin-top: 6rpx; color: #9298a0; font-size: 22rpx; }
	.mode-list { display: flex; flex-direction: column; gap: 16rpx; }
	.mode-option { display: flex; align-items: center; min-height: 128rpx; padding: 22rpx 24rpx; border: 2rpx solid transparent; border-radius: 14rpx; box-sizing: border-box; background: #ffffff; box-shadow: 0 5rpx 18rpx rgba(31, 45, 61, 0.045); }
	.mode-option.is-saving, .night-option.is-saving { opacity: 0.72; }
	.mode-option.selected { border-color: #79c2ff; background: #f4faff; box-shadow: 0 7rpx 22rpx rgba(0, 140, 255, 0.09); }
	.mode-icon { display: flex; align-items: center; justify-content: center; width: 70rpx; height: 70rpx; flex: 0 0 70rpx; margin-right: 22rpx; border-radius: 16rpx; }
	.mode-icon.blue { background: #e4f3ff; }
	.mode-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.mode-title-row { display: flex; align-items: center; }
	.mode-name { font-size: 29rpx; font-weight: 600; }
	.current-tag { margin-left: 14rpx; padding: 4rpx 10rpx; border-radius: 6rpx; background: #008cff; color: #ffffff; font-size: 18rpx; line-height: 1.3; }
	.mode-desc { margin-top: 8rpx; color: #858c95; font-size: 22rpx; line-height: 1.45; }
	.radio-mark { display: flex; align-items: center; justify-content: center; width: 38rpx; height: 38rpx; flex: 0 0 38rpx; margin-left: 18rpx; border: 3rpx solid #d3d8de; border-radius: 50%; box-sizing: border-box; }
	.radio-dot { width: 20rpx; height: 20rpx; border-radius: 50%; background: #008cff; }
	.mode-option.selected .radio-mark { border-color: #008cff; }
	.display-section { margin-bottom: 0; }
	.night-option { display: flex; align-items: center; min-height: 124rpx; padding: 22rpx 24rpx; border-radius: 14rpx; box-sizing: border-box; background: #ffffff; box-shadow: 0 5rpx 18rpx rgba(31, 45, 61, 0.045); }
	.night-icon { display: flex; align-items: center; justify-content: center; width: 70rpx; height: 70rpx; flex: 0 0 70rpx; margin-right: 22rpx; border-radius: 16rpx; background: #e4f3ff; }
	.moon-shape { position: relative; width: 34rpx; height: 34rpx; overflow: hidden; border-radius: 50%; background: #008cff; }
	.moon-cutout { position: absolute; top: -5rpx; right: -5rpx; width: 32rpx; height: 32rpx; border-radius: 50%; background: #e4f3ff; }
	.night-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
	.night-title { font-size: 29rpx; font-weight: 600; }
	.night-desc { margin-top: 8rpx; color: #858c95; font-size: 22rpx; }
	.night-control { display: flex; align-items: center; margin-left: 18rpx; }
	.switch-status { margin-right: 12rpx; color: #9298a0; font-size: 21rpx; }
	.switch-preview { position: relative; width: 82rpx; height: 46rpx; flex: 0 0 82rpx; border-radius: 24rpx; background: #dfe3e8; }
	.switch-preview.active { background: #008cff; }
	.switch-thumb { position: absolute; top: 4rpx; left: 4rpx; width: 38rpx; height: 38rpx; border-radius: 50%; background: #ffffff; box-shadow: 0 2rpx 8rpx rgba(31, 45, 61, 0.2); transition: left 0.2s ease; }
	.switch-preview.active .switch-thumb { left: 40rpx; }
	.sync-note { display: flex; align-items: center; justify-content: center; gap: 8rpx; margin-top: 24rpx; color: #a86218; font-size: 22rpx; }

	.settings-page.night-mode { background: #12171d; color: #e6e9ed; }
	.night-mode .section-desc,
	.night-mode .mode-desc,
	.night-mode .night-desc,
	.night-mode .switch-status { color: #8f99a5; }
	.night-mode .mode-option,
	.night-mode .night-option { background: #1b222a; box-shadow: 0 5rpx 18rpx rgba(0, 0, 0, 0.16); }
	.night-mode .mode-option.selected { border-color: #269df0; background: #17364d; box-shadow: 0 7rpx 22rpx rgba(0, 0, 0, 0.2); }
	.night-mode .mode-icon.blue,
	.night-mode .night-icon { background: #17364d; }
	.night-mode .mode-option.selected .mode-icon.blue { background: #1d4663; }
	.night-mode .radio-mark { border-color: #56616d; }
	.night-mode .mode-option.selected .radio-mark { border-color: #269df0; }
	.night-mode .moon-cutout { background: #17364d; }
	.night-mode .switch-preview { background: #3b4651; }
	.night-mode .switch-preview.active { background: #168ee5; }
	.night-mode .sync-note { color: #e0a15f; }
</style>
