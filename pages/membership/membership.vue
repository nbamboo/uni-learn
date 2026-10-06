<template>
	<view class="membership-page">
		<view class="hero-card" :class="{ active: membership.isMember }">
			<view class="hero-copy">
				<text class="hero-caption hero-caption-top">{{ membershipCaption }}</text>
				<view class="countdown-line" v-if="examCountdownConfig.enabled">
					<text class="hero-title">{{ examCountdownConfig.title }}</text>
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
					:class="{
						selected: selectedProductId === plan.productId,
						disabled: planUnavailableForCurrentMember(plan)
					}"
					v-for="plan in plans"
					:key="plan.productId"
					@tap="selectPlan(plan)"
				>
					<text v-if="planUnavailableForCurrentMember(plan)" class="plan-restriction">仅限非会员</text>
					<text class="plan-name">{{ plan.name }}</text>
					<view class="plan-price">
						<text class="price-symbol">¥</text>
						<text class="price-value">{{ formatPrice(plan.priceFen) }}</text>
					</view>
					<text v-if="plan.showRegularPrice && plan.regularPriceFen" class="plan-regular-price">
						¥{{ formatPrice(plan.regularPriceFen) }}
					</text>
					<text v-else class="plan-average">{{ averageText(plan) }}</text>
				</view>
			</view>
			<button class="purchase-button" :loading="purchasing" :disabled="purchasing || loading || selectedPlanUnavailable" @tap="purchase">
				{{ purchasing ? '正在处理' : purchaseButtonText }}
			</button>
		</view>
	</view>
</template>

<script>
	import { subjectGroups } from '@/data/practice.js'
	import {
		getCachedMembership,
		getExamCountdownDays,
		getMembership,
		purchaseMembership
	} from '@/services/membership.js'
	import {
		getPracticeReconciliationState,
		preparePracticeReconciliation
	} from '@/services/user-practice.js'

	const FALLBACK_PLANS = [
		{ productId: 'membership_1m', name: '全科31天', months: 1, days: 31, priceFen: 100, regularPriceFen: 1200, showRegularPrice: true, activeMemberPurchasable: false },
		{ productId: 'membership_3m', name: '全科93天', months: 3, days: 93, priceFen: 1900, regularPriceFen: 2900, activeMemberPurchasable: true },
		{ productId: 'membership_6m', name: '全科186天', months: 6, days: 186, priceFen: 3500, regularPriceFen: 5200, activeMemberPurchasable: true },
		{ productId: 'membership_12m', name: '全科366天', months: 12, days: 366, priceFen: 5900, regularPriceFen: 8900, activeMemberPurchasable: true }
	]

	function mergePlanDefaults(plans) {
		return plans.map(plan => Object.assign(
			{},
			FALLBACK_PLANS.find(item => item.productId === plan.productId) || {},
			plan
		))
	}

	export default {
		data() {
			const cached = getCachedMembership()
			return {
				membership: cached,
				plans: FALLBACK_PLANS,
				selectedProductId: 'membership_12m',
				loading: false,
				purchasing: false,
				examCountdownConfig: cached.examCountdown,
				examCountdown: { days: String(getExamCountdownDays(cached.examCountdown)) },
				countdownTimer: null,
				benefits: [
					{ title: '屏蔽全部广告', desc: '学习和查看成绩时不再展示广告', icon: 'eye-slash' },
					{ title: '云端学习数据同步', desc: '同一微信账号跨设备登录，答题记录与学习进度自动同步', icon: 'cloud-upload' },
					{ title: '解锁完整练习功能', desc: '使用错题集、收藏夹和背题模式，智能练习每组最高可设置50题', icon: 'vip-filled' }
				]
			}
		},
		computed: {
			selectedPlan() {
				return this.plans.find(item => item.productId === this.selectedProductId) || null
			},
			selectedPlanUnavailable() {
				return this.planUnavailableForCurrentMember(this.selectedPlan)
			},
			membershipCaption() {
				if (!this.membership.isMember) return '开通会员，享受免广告与云端同步'
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
			allSubjectIds() {
				return subjectGroups.reduce((result, group) => (
					result.concat(group.items.map(item => item.id))
				), [])
			},
			async refreshPracticeReconciliation() {
				if (!this.membership.isMember) return getPracticeReconciliationState()
				try {
					return await preparePracticeReconciliation({ subjectIds: this.allSubjectIds() })
				} catch (error) {
					return getPracticeReconciliationState()
				}
			},
			openPracticeReconciliation(state) {
				if (['checking', 'required', 'replacing', 'restoring'].indexOf(state && state.status) === -1) return
				uni.navigateTo({ url: '/practice-pages/sync-conflict/sync-conflict' })
			},
			planUnavailableForCurrentMember(plan) {
				return Boolean(
					this.membership.isMember
					&& plan
					&& plan.activeMemberPurchasable === false
				)
			},
			showMonthlyPlanRestriction() {
				uni.showModal({
					title: '暂不可购买',
					content: '全科31天仅限非会员购买，当前会员请选择全科93天、186天或366天续费。',
					showCancel: false
				})
			},
			selectPlan(plan) {
				if (this.planUnavailableForCurrentMember(plan)) {
					this.showMonthlyPlanRestriction()
					return
				}
				this.selectedProductId = plan.productId
			},
			ensureSelectedPlanAvailable() {
				if (this.selectedPlan && !this.selectedPlanUnavailable) return
				const availablePlan = this.plans.find(plan => !this.planUnavailableForCurrentMember(plan))
				this.selectedProductId = availablePlan ? availablePlan.productId : ''
			},
			updateExamCountdown() {
				this.examCountdown = {
					days: String(getExamCountdownDays(this.examCountdownConfig))
				}
			},
			startExamCountdown() {
				this.stopExamCountdown()
				if (!this.examCountdownConfig.enabled) return
				this.updateExamCountdown()
				this.countdownTimer = setInterval(() => this.updateExamCountdown(), 60 * 1000)
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
				this.examCountdownConfig = value.examCountdown || getCachedMembership().examCountdown
				if (value.plans && value.plans.length) this.plans = mergePlanDefaults(value.plans)
				this.ensureSelectedPlanAvailable()
				this.startExamCountdown()
			},
			async loadMembership() {
				if (this.loading || this.purchasing) return
				this.loading = true
				try {
					this.applyMembership(await getMembership({ forceRefresh: true }))
					await this.refreshPracticeReconciliation()
				} catch (error) {
					uni.showToast({ title: error && (error.errMsg || error.message) || '会员状态加载失败', icon: 'none' })
				} finally {
					this.loading = false
				}
			},
			async purchase() {
				if (this.purchasing || !this.selectedPlan) return
				if (this.selectedPlanUnavailable) {
					this.showMonthlyPlanRestriction()
					return
				}
				this.purchasing = true
				try {
					const result = await purchaseMembership(this.selectedPlan.productId)
					if (result && result.membership) this.applyMembership(result.membership)
					const delivered = result && result.order && result.order.status === 'delivered'
					const reconciliation = delivered
						? await this.refreshPracticeReconciliation()
						: getPracticeReconciliationState()
					uni.showModal({
						title: delivered ? '会员已开通' : '支付结果确认中',
						content: delivered ? '会员权益已到账，有效期已更新。' : '服务器正在确认微信订单，请稍后重新进入会员中心查看。',
						showCancel: false,
						success: () => this.openPracticeReconciliation(reconciliation)
					})
				} catch (error) {
					if (error && error.errCode === 'VIRTUAL_PAYMENT_CANCELLED') return
					if (error && error.errCode === 'VIRTUAL_PAYMENT_PRODUCT_NOT_AVAILABLE_FOR_ACTIVE_MEMBER') {
						this.showMonthlyPlanRestriction()
						return
					}
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
	.plan-item { position: relative; display: flex; align-items: center; flex-direction: column; min-height: 152rpx; padding: 20rpx 12rpx; border: 2rpx solid #e5e9ed; border-radius: 16rpx; box-sizing: border-box; background: #fafbfc; overflow: hidden; }
	.plan-item.selected { border-color: #008cff; background: #edf8ff; box-shadow: 0 5rpx 18rpx rgba(0, 140, 255, 0.1); }
	.plan-item.disabled { border-color: #e4e7ea; background: #f3f4f5; color: #9aa1a8; box-shadow: none; }
	.plan-item.disabled .plan-price { color: #9aa1a8; }
	.plan-restriction { position: absolute; top: 0; right: 0; padding: 4rpx 10rpx; border-bottom-left-radius: 10rpx; background: #d9dde1; color: #7c858e; font-size: 17rpx; line-height: 1.4; }
	.plan-name { font-size: 25rpx; font-weight: 600; }
	.plan-price { display: flex; align-items: baseline; margin-top: 10rpx; color: #007bd1; }
	.price-symbol { font-size: 22rpx; }
	.price-value { margin-left: 3rpx; font-size: 39rpx; font-weight: 700; }
	.plan-regular-price { margin-top: 4rpx; color: #9aa2aa; font-size: 19rpx; text-decoration: line-through; }
	.plan-average { margin-top: 4rpx; color: #89929b; font-size: 19rpx; }
	.purchase-button { height: 88rpx; margin-top: 26rpx; border-radius: 46rpx; background: #008cff; color: #ffffff; font-size: 29rpx; font-weight: 600; line-height: 88rpx; }
	.purchase-button::after { border: 0; }
	.purchase-button[disabled] { background: #85c9f7; color: #ffffff; }

	@media screen and (min-width: 768px) {
		.membership-page { width: 100%; max-width: 820px; margin: 0 auto; padding: 24px 24px calc(48px + env(safe-area-inset-bottom)); }
		.hero-card { min-height: 196px; padding: 32px; border-radius: 22px; box-shadow: 0 12px 34px rgba(35, 51, 70, 0.18); }
		.hero-title { margin-right: 14px; font-size: 23px; }
		.countdown-line { margin-top: 10px; }
		.countdown-value { font-size: 42px; }
		.countdown-unit { margin-left: 3px; font-size: 20px; }
		.hero-caption { font-size: 23px; }
		.hero-caption-top { font-size: 31px; }
		.member-badge { padding: 8px 16px; border-radius: 22px; font-size: 21px; }
		.section-card { margin-top: 22px; padding: 28px; border-radius: 18px; box-shadow: 0 6px 24px rgba(33, 45, 58, 0.055); }
		.section-title { font-size: 31px; }
		.section-note { font-size: 21px; }
		.benefit-list { margin-top: 12px; }
		.benefit-item { padding: 18px 0; }
		.benefit-icon { width: 72px; height: 72px; flex-basis: 72px; margin-right: 20px; border-radius: 18px; }
		.benefit-title { font-size: 27px; }
		.benefit-desc { margin-top: 7px; font-size: 22px; }
		.plan-grid { gap: 16px; margin-top: 24px; }
		.plan-item { min-height: 152px; padding: 20px 12px; border-width: 2px; border-radius: 16px; }
		.plan-restriction { padding: 4px 10px; border-bottom-left-radius: 10px; font-size: 17px; }
		.plan-name { font-size: 25px; }
		.plan-price { margin-top: 10px; }
		.price-symbol { font-size: 22px; }
		.price-value { margin-left: 3px; font-size: 39px; }
		.plan-regular-price,
		.plan-average { margin-top: 4px; font-size: 19px; }
		.purchase-button { height: 88px; margin-top: 26px; border-radius: 46px; font-size: 29px; line-height: 88px; }
	}

	@media screen and (min-width: 700px) and (max-height: 1150px) {
		.membership-page { padding: 16px 18px calc(32px + env(safe-area-inset-bottom)); }
		.hero-card { min-height: 148px; padding: 22px; }
		.hero-title { font-size: 20px; }
		.countdown-value { font-size: 34px; }
		.countdown-unit { font-size: 18px; }
		.hero-caption { font-size: 20px; }
		.hero-caption-top { font-size: 27px; }
		.member-badge { padding: 6px 12px; font-size: 18px; }
		.section-card { margin-top: 14px; padding: 20px; }
		.section-title { font-size: 26px; }
		.section-note { font-size: 19px; }
		.benefit-list { margin-top: 8px; }
		.benefit-item { padding: 12px 0; }
		.benefit-icon { width: 56px; height: 56px; flex-basis: 56px; margin-right: 16px; }
		.benefit-title { font-size: 23px; }
		.benefit-desc { margin-top: 4px; font-size: 19px; }
		.plan-grid { gap: 12px; margin-top: 16px; }
		.plan-item { min-height: 124px; padding: 16px 10px; }
		.plan-name { font-size: 22px; }
		.plan-price { margin-top: 6px; }
		.price-symbol { font-size: 19px; }
		.price-value { font-size: 33px; }
		.plan-regular-price,
		.plan-average { font-size: 17px; }
		.purchase-button { height: 64px; margin-top: 18px; font-size: 24px; line-height: 64px; }
	}
</style>
