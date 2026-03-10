<template>
	<view>
		<uni-list>
			<uni-list-item :showExtraIcon="true" :showArrow="true" :extraIcon="{type: 'map', color: '#008cff', size: '36'}"
				:to="`/pages/course/course`" @click="onClick"
				title="图文教程"
				titleStyle="font-size: 60rpx;" />
			<!-- 问题反馈 - 使用uni-list-item保持样式一致 -->
			<view class="feedback-list-wrapper">
				<uni-list-item :showExtraIcon="true" :showArrow="true" :extraIcon="{type: 'paperplane', color: '#008cff', size: '36'}"
					title="分享好友"
					titleStyle="font-size: 60rpx;" />
				<button class="feedback-overlay-btn" open-type="share"></button>
			</view>
			<view class="feedback-list-wrapper">
				<uni-list-item :showExtraIcon="true" :showArrow="true" :extraIcon="{type: 'email', color: '#008cff', size: '36'}"
					title="问题反馈"
					titleStyle="font-size: 60rpx;" />
				<button class="feedback-overlay-btn" open-type="feedback"></button>
			</view>
		</uni-list>
	</view>
</template>

<script>
	export default {
		data() {
		},
		methods: {
			onClick(e) {
				console.log('执行click事件', e.data)
			}
		}
	}
</script>

<style lang="scss">
	/* 问题反馈列表项容器 */
	.feedback-list-wrapper {
		position: relative;
	}

	/* 覆盖按钮 - 覆盖整个uni-list-item */
	.feedback-overlay-btn {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		z-index: 10;
	}

	.feedback-overlay-btn::after {
		border: none;
	}

	/* 增大列表项字体 */
	:deep(.uni-list-item__content-title) {
		font-size: 32rpx !important;
	}

	:deep(.uni-list-item__icon-img) {
		width: 44rpx !important;
		height: 44rpx !important;
	}
</style>