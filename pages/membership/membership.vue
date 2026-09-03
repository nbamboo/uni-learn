<template>
	<view class="membership-page">
		<view class="hero-card" :class="{ active: membership.isMember }">
			<view class="hero-copy">
				<text class="hero-caption hero-caption-top">{{ membershipCaption }}</text>
				<view class="countdown-line">
					<text class="hero-title">考试倒计时</text>
					<view class="countdown-row">
						<view class="countdown-block">
							<text class="countdown-value">{{ examCountdown.days }}</text>
							<text class="countdown-unit">天</text>
						</view>
					</view>
				</view>
			</view>
			<view class="member-badge">{{ membership.isMember ? '有效' : '未开通' }}</view>
		</view>

		<view class="section-card">
			<text class="section-title">会员权益</text>
			<view class="benefit-list">
				<view class="benefit-item" v-for="item in benefits" :key="item.title">
					<view class="benefit-icon">
						<uni-icons :type="item.icon" size="23" color="#008cff"></uni-icons>
					</view>
					<view class="benefit-copy">
						<text class="benefit-title">{{ item.title }}</text>
						<text class="benefit-desc">{{ item.desc }}</text>
					</view>
				</view>
			</view>
		</view>

		<view class="section-card">
			<view class="section-heading">
				<text class="section-title">选择时长</text>
				<text class="section-note">购买后自动累加有效期</text>
			</view>
			<view class="plan-grid">
				<view
					class="plan-item"
					:class="{ selected: selectedProductId === plan.productId }"
					v-for="plan in plans"
					:key="plan.productId"
					@tap="selectedProductId = plan.productId"
				>
					<text class="plan-name">{{ plan.name }}</text>
					<view class="plan-price">
						<text class="price-symbol">¥</text>
						<text class="price-value">{{ formatPrice(plan.priceFen) }}</text>
					</view>
					<text class="plan-average">{{ averageText(plan) }}</text>
				</view>
			</view>
			<button class="purchase-button" :loading="purchasing" :disabled="purchasing || loading" @tap="purchase">
				{{ purchasing ? '正在处理' : purchaseButtonText }}
			</button>
		</view>
	</view>
</template>

<script>
	import {
		getCachedMembership,
		getMembership,
		purchaseMembership
	} from '@/services/membership.js'

	const FALLBACK_PLANS = [
		{ productId: 'membership_1m', name: '1个月会员', months: 1, priceFen: 300 },
		{ productId: 'membership_3m', name: '3个月会员', months: 3, priceFen: 600 },
		{ productId: 'membership_6m', name: '半年会员', months: 6, priceFen: 1000 },
		{ productId: 'membership_12m', name: '1年会员', months: 12, priceFen: 1500 }
	]

	function getNextExamTargetAt() {
		const now = new Date()
		const target = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
		if (target.getTime() <= now.getTime()) target.setFullYear(target.getFullYear() + 1)
		return target.getTime()
	}

	export default {
		data() {
			const cached = getCachedMembership()
			return {
				membership: cached,
				plans: cached.plans.length ? cached.plans : FALLBACK_PLANS,
				selectedProductId: 'membership_12m',
				loading: false,
				purchasing: false,
				examTargetAt: getNextExamTargetAt(),
				examCountdown: { days: '0' },
				countdownTimer: null,
				benefits: [
					{ title: '屏蔽全部广告', desc: '学习和查看成绩时不再展示广告', icon: 'eye-slash' },
					{ title: '错题集与收藏夹', desc: '集中回顾薄弱题目和重点内容', icon: 'star' },
					{ title: '考试模式与背题模式', desc: '按需要切换统一交卷或直接查看解析', icon: 'checkbox' },
					{ title: '云端学习数据同步', desc: '同一微信账号跨设备登录，答题记录与学习进度自动同步', icon: 'cloud-upload' }
				]
			}
		},
		computed: {
			selectedPlan() {
				return this.plans.find(item => item.productId === this.selectedProductId) || this.plans[0]
			},
			membershipCaption() {
				if (!this.membership.isMember) return '开通会员即可解锁完整答题体验'
				return `有效期至 ${this.formatDate(this.membership.expiresAt)}`
			},
			purchaseButtonText() {
				const plan = this.selectedPlan
				if (!plan) return '请选择会员时长'
				return `${this.membership.isMember ? '续费' : '立即开通'} ${plan.name} · ¥${this.formatPrice(plan.priceFen)}`
			}
		},
		onShow() {
			this.startExamCountdown()
			this.loadMembership()
		},
		onHide() {
			this.stopExamCountdown()
		},
		onUnload() {
			this.stopExamCountdown()
		},
		methods: {
			updateExamCountdown() {
				const remainingSeconds = Math.max(0, Math.floor((this.examTargetAt - Date.now()) / 1000))
				this.examCountdown = {
					days: String(Math.max(0, Math.floor(remainingSeconds / 86400)))
				}
			},
			startExamCountdown() {
				this.stopExamCountdown()
				this.updateExamCountdown()
				this.countdownTimer = setInterval(() => this.updateExamCountdown(), 1000)
			},
			stopExamCountdown() {
				if (!this.countdownTimer) return
				clearInterval(this.countdownTimer)
				this.countdownTimer = null
			},
			formatPrice(priceFen) {
				const value = Number(priceFen) || 0
				return value % 100 ? (value / 100).toFixed(2) : String(value / 100)
			},
			formatDate(timestamp) {
				const date = new Date(timestamp)
				const pad = value => value < 10 ? `0${value}` : value
				return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
			},
			averageText(plan) {
				if (!plan || !plan.months) return ''
				return `约 ¥${(Number(plan.priceFen) / 100 / Number(plan.months)).toFixed(2)}/月`
			},
			applyMembership(value) {
				this.membership = value
				if (value.plans && value.plans.length) this.plans = value.plans
			},
			async loadMembership() {
				if (this.loading || this.purchasing) return
				this.loading = true
				try {
					this.applyMembership(await getMembership({ forceRefresh: true }))
				} catch (error) {
					uni.showToast({ title: error && (error.errMsg || error.message) || '会员状态加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			async purchase() {
				if (this.purchasing || !this.selectedPlan) return
				this.purchasing = true
				try {
					const result = await purchaseMembership(this.selectedPlan.productId)
					if (result && result.membership) this.applyMembership(result.membership)
					const delivered = result && result.order && result.order.status === 'delivered'
					uni.showModal({
						title: delivered ? '会员已开通' : '支付结果确认中',
						content: delivered ? '会员权益已到账，有效期已更新。' : '服务器正在确认微信订单，请稍后重新进入会员中心查看。',
						showCancel: false
					})
				} catch (error) {
					if (error && error.errCode === 'VIRTUAL_PAYMENT_CANCELLED') return
					uni.showModal({
						title: '支付未完成',
						content: error && (error.errMsg || error.message) || '支付失败，请稍后重试',
						showCancel: false
					})
				} finally {
					this.purchasing = false
				}
			}
		}
	}
</script>

<style lang="scss">
	page { background: #f4f6f8; color: #222b34; }
	.membership-page { min-height: 100vh; padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
	.hero-card { display: flex; align-items: flex-start; justify-content: space-between; min-height: 196rpx; padding: 32rpx; border-radius: 22rpx; box-sizing: border-box; background: linear-gradient(135deg, #253447, #465c76); color: #ffffff; box-shadow: 0 12rpx 34rpx rgba(35, 51, 70, 0.18); }
	.hero-card.active { background: linear-gradient(135deg, #006bb3, #19a2ff); }
	.hero-copy { display: flex; flex-direction: column; min-width: 0; }
	.hero-title { margin-right: 14rpx; font-size: 23rpx; font-weight: 600; white-space: nowrap; }
	.countdown-line { display: flex; align-items: baseline; margin-top: 10rpx; }
	.countdown-row { display: flex; align-items: baseline; }
	.countdown-block { display: flex; align-items: baseline; }
	.countdown-value { font-size: 42rpx; font-weight: 700; font-variant-numeric: tabular-nums; }
	.countdown-unit { margin-left: 3rpx; color: rgba(255,255,255,0.8); font-size: 20rpx; }
	.hero-caption { color: rgba(255,255,255,0.82); font-size: 23rpx; line-height: 1.5; }
	.hero-caption-top { margin: 0; font-size: 31rpx; font-weight: 600; line-height: 1.35; }
	.member-badge { padding: 8rpx 16rpx; border: 1rpx solid rgba(255,255,255,0.48); border-radius: 22rpx; background: rgba(255,255,255,0.12); font-size: 21rpx; white-space: nowrap; }
	.section-card { margin-top: 22rpx; padding: 28rpx; border-radius: 18rpx; background: #ffffff; box-shadow: 0 6rpx 24rpx rgba(33, 45, 58, 0.055); }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; }
	.section-title { font-size: 31rpx; font-weight: 650; }
	.section-note { color: #8d969f; font-size: 21rpx; }
	.benefit-list { margin-top: 12rpx; }
	.benefit-item { display: flex; align-items: center; padding: 18rpx 0; border-bottom: 1rpx solid #edf0f2; }
	.benefit-item:last-child { border-bottom: 0; }
	.benefit-icon { display: flex; align-items: center; justify-content: center; width: 72rpx; height: 72rpx; flex: 0 0 72rpx; margin-right: 20rpx; border-radius: 18rpx; background: #eaf5ff; }
	.benefit-copy { display: flex; flex-direction: column; }
	.benefit-title { font-size: 27rpx; font-weight: 600; }
	.benefit-desc { margin-top: 7rpx; color: #838c95; font-size: 22rpx; line-height: 1.4; }
	.plan-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16rpx; margin-top: 24rpx; }
	.plan-item { display: flex; align-items: center; flex-direction: column; min-height: 152rpx; padding: 20rpx 12rpx; border: 2rpx solid #e5e9ed; border-radius: 16rpx; box-sizing: border-box; background: #fafbfc; }
	.plan-item.selected { border-color: #008cff; background: #edf8ff; box-shadow: 0 5rpx 18rpx rgba(0, 140, 255, 0.1); }
	.plan-name { font-size: 25rpx; font-weight: 600; }
	.plan-price { display: flex; align-items: baseline; margin-top: 10rpx; color: #007bd1; }
	.price-symbol { font-size: 22rpx; }
	.price-value { margin-left: 3rpx; font-size: 39rpx; font-weight: 700; }
	.plan-average { margin-top: 4rpx; color: #89929b; font-size: 19rpx; }
	.purchase-button { height: 88rpx; margin-top: 26rpx; border-radius: 46rpx; background: #008cff; color: #ffffff; font-size: 29rpx; font-weight: 600; line-height: 88rpx; }
	.purchase-button::after { border: 0; }
	.purchase-button[disabled] { background: #85c9f7; color: #ffffff; }
</style>
