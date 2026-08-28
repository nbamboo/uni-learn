<template>
	<view class="tool-home">
		<view class="workspace-header">
			<view class="mode-tabs">
				<view
					v-for="(mode, index) in modes"
					:key="mode.key"
					class="mode-tab"
					:class="{ active: activeMode === index }"
					@tap="switchMode(index)"
				>
					<text>{{ mode.label }}</text>
				</view>
			</view>
		</view>

		<scroll-view class="workspace-scroll" scroll-y>
			<view v-show="activeMode === 0" class="calculator-pane">
				<finance-calculator
					ref="calculator"
					:embedded="true"
				></finance-calculator>
			</view>

			<view v-if="activeMode === 1" class="parameter-pane">
				<view class="parameter-list">
					<my-unit
						v-for="item in parameterTools"
						:key="item.url"
						:tool-data="item"
						@change="openTool"
					></my-unit>
				</view>
			</view>
		</scroll-view>
	</view>
</template>

<script>
	import FinanceCalculator from '@/components/finance-calculator/finance-calculator.vue'
	import MyUnit from '@/components/myUnit/myUnit.vue'

	export default {
		components: {
			FinanceCalculator,
			MyUnit
		},
		data() {
			return {
				activeMode: 0,
				modes: [
					{ key: 'calculator', label: '理财计算器' },
					{ key: 'parameters', label: '参数表' }
				],
				parameterTools: [
					{
						toolType: '年金终值表',
						toolDesc: '普通期末年金终值',
						iconType: 'icon-biaoge-chakan',
						action: '查看',
						url: '/pages/njzzb/njzzb'
					},
					{
						toolType: '年金现值表',
						toolDesc: '普通期末年金现值',
						iconType: 'icon-dizhiguanli',
						action: '查看',
						url: '/pages/njxzb/njxzb'
					},
					{
						toolType: '复利现值表',
						toolDesc: 'PV = FV / (1 + r)^n',
						iconType: 'icon-fuwuxiangmuzongbi',
						action: '查看',
						url: '/pages/flxzb/flxzb'
					},
					{
						toolType: '复利终值表',
						toolDesc: 'FV = PV(1 + r)^n',
						iconType: 'icon-a-MenuYingfumingxi2x',
						action: '查看',
						url: '/pages/flzzb/flzzb'
					},
					{
						toolType: '个人所得税税率表',
						toolDesc: '综合所得适用',
						iconType: 'icon-a-MenuCaiwuguanli2x',
						action: '查看',
						url: '/pages/swbzh/swbzh'
					},
					{
						toolType: '个人劳务报酬所得预扣率表',
						toolDesc: '劳务报酬所得预扣预缴适用',
						iconType: 'icon-a-MenuCaiwuguanli2x',
						action: '查看',
						url: '/pages/swblw/swblw'
					},
					{
						toolType: '个人所得税税率表',
						toolDesc: '经营所得适用',
						iconType: 'icon-a-MenuCaigouduizhang2x',
						action: '查看',
						url: '/pages/swbjy/swbjy'
					},
					{
						toolType: '个人所得税税率表',
						toolDesc: '年终奖适用',
						iconType: 'icon-qianbao',
						action: '查看',
						url: '/pages/swbnzj/swbnzj'
					}
				]
			}
		},
		onShareAppMessage() {
			return {
				title: '银行从业理财计算器',
				path: '/pages/index/index'
			}
		},
		onHide() {
			if (this.$refs.calculator) {
				this.$refs.calculator.dismissKeyboard()
			}
		},
		methods: {
			switchMode(index) {
				if (index === this.activeMode) return

				if (this.$refs.calculator) {
					this.$refs.calculator.dismissKeyboard()
				}
				this.activeMode = index
			},
			openTool(toolData) {
				uni.navigateTo({
					url: toolData.url
				})
			}
		}
	}
</script>

<style lang="scss">
	page {
		background: #f4f6f8;
	}

	.tool-home {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
		background: #f4f6f8;
		color: #24272c;
	}

	/* #ifdef H5 */
	.tool-home {
		height: calc(100vh - var(--window-top) - var(--window-bottom));
	}
	/* #endif */

	.workspace-header {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 16rpx;
		padding: 16rpx 24rpx;
		border-bottom: 1rpx solid #e8ebef;
		background: #ffffff;
	}

	.mode-tabs {
		display: grid;
		flex: 1;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		height: 72rpx;
		padding: 4rpx;
		border-radius: 12rpx;
		background: #eef1f4;
		box-sizing: border-box;
	}

	.mode-tab {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		border-radius: 9rpx;
		font-size: 17px;
		font-weight: 500;
		color: #6f7580;
		transition: background-color 0.18s ease, color 0.18s ease;
	}

	.mode-tab.active {
		background: #ffffff;
		box-shadow: 0 2rpx 8rpx rgba(31, 38, 46, 0.08);
		font-weight: 600;
		color: #0077d9;
	}

	.workspace-scroll {
		flex: 1;
		height: 0;
		min-height: 0;
	}

	.calculator-pane,
	.parameter-pane {
		width: 100%;
		max-width: 820px;
		min-height: 100%;
		margin: 0 auto;
		background: #ffffff;
		box-sizing: border-box;
	}

	.parameter-pane {
		padding-bottom: 24rpx;
		background: #f4f6f8;
	}

	.parameter-list {
		padding: 8rpx 12rpx 20rpx;
	}

	@media screen and (min-width: 900px) {
		.workspace-header {
			padding-right: calc((100% - 820px) / 2);
			padding-left: calc((100% - 820px) / 2);
		}
	}
</style>
