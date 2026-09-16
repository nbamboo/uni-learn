<template>
	<view class="about-page">
		<view class="account-card">
			<view class="account-avatar">{{ profileInitial }}</view>
			<view class="account-copy">
				<text class="account-name">{{ accountName }}</text>
				<text class="account-status">{{ accountStatus }}</text>
				<text class="account-pending" v-if="pendingCount">{{ pendingCount }} 条记录等待同步</text>
			</view>
			<uni-icons
				:type="membership.isMember ? 'cloud-upload' : 'person-filled'"
				size="24"
				color="#ffffff"
			></uni-icons>
		</view>

		<view class="about-menu-card">
			<uni-list :border="false">
				<uni-list-item
					:showExtraIcon="true"
					:showArrow="true"
					:extraIcon="{ type: 'vip-filled', color: '#008cff', size: '25' }"
					title="会员中心"
					:rightText="membershipText"
					to="/pages/membership/membership"
				/>
				<uni-list-item
					:showExtraIcon="true"
					:showArrow="true"
					:extraIcon="{ type: 'map', color: '#008cff', size: '25' }"
					to="/pages/course/course"
					@click="onClick"
					title="图文教程"
				/>
				<view class="feedback-list-wrapper">
					<uni-list-item
						:showExtraIcon="true"
						:showArrow="true"
						:extraIcon="{ type: 'paperplane', color: '#008cff', size: '25' }"
						title="分享好友"
					/>
					<button class="feedback-overlay-btn" open-type="share"></button>
				</view>
				<view class="feedback-list-wrapper">
					<uni-list-item
						:showExtraIcon="true"
						:showArrow="true"
						:extraIcon="{ type: 'email', color: '#008cff', size: '25' }"
						title="问题反馈"
					/>
					<button class="feedback-overlay-btn" open-type="feedback"></button>
				</view>
			</uni-list>
		</view>
	</view>
</template>

	<script>
		import { pendingPracticeEventCount } from '@/services/user-practice.js'
		import {
			getCachedMembership,
			getMembership
		} from '@/services/membership.js'

		export default {
			data() {
				return {
					pendingCount: pendingPracticeEventCount(),
					membership: getCachedMembership()
				}
			},
			computed: {
				accountName() {
					return this.membership.isMember ? '会员用户' : '普通用户'
				},
				profileInitial() {
					return this.accountName.slice(0, 1)
				},
				accountStatus() {
					if (!this.membership.isMember) return '做题数据仅保存在本机'
					return '做题数据已开启云同步'
				},
				membershipText() {
					if (!this.membership.isMember) return '未开通'
					const date = new Date(this.membership.expiresAt)
					return `有效至 ${date.getMonth() + 1}月${date.getDate()}日`
				}
			},
			onShow() {
				this.pendingCount = pendingPracticeEventCount()
				this.loadMembership()
			},
			methods: {
				async loadMembership() {
					try {
						this.membership = await getMembership()
					} catch (error) {
						this.membership = getCachedMembership()
					} finally {
						this.pendingCount = pendingPracticeEventCount()
					}
				},
				onClick(e) {
					console.log('执行click事件', e.data)
				}
			}
		}
</script>

<style lang="scss">
		page {
			background: #f4f6f8;
		}

		.about-page {
			width: 100%;
			max-width: 820px;
			min-height: 100vh;
			margin: 0 auto;
			padding: 24rpx 0 calc(24rpx + env(safe-area-inset-bottom));
			box-sizing: border-box;
		}

		.account-card {
			display: flex;
			align-items: center;
			min-height: 144rpx;
			margin: 0 24rpx 24rpx;
			padding: 28rpx 24rpx;
			border-radius: 16rpx;
			box-sizing: border-box;
			background: linear-gradient(135deg, #008cff, #36a9ff);
			color: #ffffff;
		}

		.account-avatar {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 78rpx;
			height: 78rpx;
			flex: 0 0 78rpx;
			border: 4rpx solid rgba(255, 255, 255, 0.55);
			border-radius: 50%;
			background: rgba(255, 255, 255, 0.2);
			font-size: 34rpx;
			font-weight: 600;
		}

		.account-copy {
			display: flex;
			flex: 1;
			flex-direction: column;
			min-width: 0;
			margin: 0 20rpx;
		}

		.account-name {
			font-size: 34rpx;
			font-weight: 600;
		}

		.account-status,
		.account-pending {
			margin-top: 8rpx;
			font-size: 26rpx;
			color: rgba(255, 255, 255, 0.82);
			line-height: 1.4;
		}

		.account-pending {
			color: #fff2c7;
		}

	.about-menu-card {
		margin: 0 24rpx;
		overflow: hidden;
		border: 1rpx solid #e4eaf0;
		border-radius: 16rpx;
		background: #ffffff;
		box-shadow: 0 5rpx 18rpx rgba(31, 48, 65, 0.04);
	}

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

	:deep(.uni-list-item__container) {
		align-items: center;
		min-height: 112rpx;
		padding: 20rpx 24rpx !important;
		box-sizing: border-box;
	}

	:deep(.uni-list-item__content-title) {
		font-size: 32rpx !important;
		font-weight: 600;
		line-height: 1.35;
	}

	:deep(.uni-list-item__extra-text) {
		font-size: 26rpx !important;
		line-height: 1.35;
	}

	:deep(.uni-list-item__icon) {
		margin-right: 18rpx;
	}
</style>
