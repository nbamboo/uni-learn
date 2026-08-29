<template>
	<view class="settings-page">
		<view class="page-intro">
			<text class="intro-title">答题偏好</text>
			<text class="intro-desc">选择适合自己的答题节奏</text>
		</view>

		<view class="settings-section">
			<view class="section-heading">
				<text class="section-title">答题模式</text>
				<text class="section-desc">答案与解析将在不同阶段展示</text>
			</view>

			<view class="mode-list">
				<view
					class="mode-option"
					:class="{ selected: item.selected }"
					v-for="item in answerModes"
					:key="item.key"
				>
					<view class="mode-icon" :class="item.tone">
						<uni-icons :type="item.icon" size="24" :color="item.color"></uni-icons>
					</view>
					<view class="mode-copy">
						<view class="mode-title-row">
							<text class="mode-name">{{ item.name }}</text>
							<text class="current-tag" v-if="item.selected">当前模式</text>
						</view>
						<text class="mode-desc">{{ item.desc }}</text>
					</view>
					<view class="radio-mark">
						<view class="radio-dot" v-if="item.selected"></view>
					</view>
				</view>
			</view>
		</view>

		<view class="settings-section display-section">
			<view class="section-heading">
				<text class="section-title">显示设置</text>
				<text class="section-desc">调整答题页面的视觉体验</text>
			</view>

			<view class="night-option">
				<view class="night-icon">
					<view class="moon-shape">
						<view class="moon-cutout"></view>
					</view>
				</view>
				<view class="night-copy">
					<text class="night-title">夜间模式</text>
					<text class="night-desc">仅在答题页面生效</text>
				</view>
				<view class="night-control">
					<text class="switch-status">关闭</text>
					<view class="switch-preview">
						<view class="switch-thumb"></view>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				answerModes: [
					{
						key: 'exam',
						name: '考试模式',
						desc: '提交整套试卷后统一查看答案与解析',
						icon: 'locked-filled',
						color: '#008cff',
						tone: 'blue',
						selected: false
					},
					{
						key: 'practice',
						name: '做题模式',
						desc: '每题作答后显示答案与解析',
						icon: 'checkbox-filled',
						color: '#008cff',
						tone: 'blue',
						selected: true
					},
					{
						key: 'review',
						name: '背题模式',
						desc: '进入题目后直接显示答案与解析',
						icon: 'eye-filled',
						color: '#008cff',
						tone: 'blue',
						selected: false
					}
				]
			}
		}
	}
</script>

<style lang="scss">
	page { background: #f5f6f8; color: #262a30; }
	.settings-page { min-height: 100vh; padding: 34rpx 28rpx calc(56rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
	.page-intro { display: flex; flex-direction: column; padding: 4rpx 4rpx 34rpx; }
	.intro-title { font-size: 40rpx; font-weight: 700; letter-spacing: 1rpx; }
	.intro-desc { margin-top: 10rpx; color: #848b94; font-size: 25rpx; }
	.settings-section { margin-bottom: 38rpx; }
	.section-heading { display: flex; flex-direction: column; margin: 0 4rpx 18rpx; }
	.section-title { font-size: 29rpx; font-weight: 650; }
	.section-desc { margin-top: 6rpx; color: #9298a0; font-size: 22rpx; }
	.mode-list { display: flex; flex-direction: column; gap: 16rpx; }
	.mode-option { display: flex; align-items: center; min-height: 128rpx; padding: 22rpx 24rpx; border: 2rpx solid transparent; border-radius: 14rpx; box-sizing: border-box; background: #ffffff; box-shadow: 0 5rpx 18rpx rgba(31, 45, 61, 0.045); }
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
	.switch-thumb { position: absolute; top: 4rpx; left: 4rpx; width: 38rpx; height: 38rpx; border-radius: 50%; background: #ffffff; box-shadow: 0 2rpx 8rpx rgba(31, 45, 61, 0.2); }
</style>
