<template>
	<view>
		<uni-card margin="10px" @tap="tap(toolData)">
			<view class="uni-flex uni-row tool-row">
				<view class="text tool-icon-column">
					<uni-icons custom-prefix="iconfont" :type="toolData.iconType" :size="wideScreen ? 44 : 25"></uni-icons>
				</view>
				<view class="tool-copy">
					<view class="tool-title">{{toolData.toolType}}</view>
					<view class="tool-desc">{{toolData.toolDesc}}</view>
				</view>
				<view class="text tool-action-column">
					<button :size="wideScreen ? 'default' : 'mini'" type="default" class="pmt-btn" hover-class="btn-hover">{{toolData.action}}</button>
				</view>
			</view>
		</uni-card>
	</view>
</template>

<script>
	export default {
		props: {
			toolData: Object,
			wideScreen: {
				type: Boolean,
				default: false
			}
		},
		data() {
			return {
				
			}
		},
		methods: {
			tap(toolData){
				this.$emit("change", toolData);
			}
		}
	}
</script>

<style>
	.text {
		padding-top: 4%;
	}

	.tool-icon-column { width: 20%; }
	.tool-action-column { width: 25%; }

	.tool-copy {
		-webkit-flex: 1;
		flex: 1;
		min-width: 0;
	}

	.tool-title {
		color: #30353c;
		font-size: 32rpx;
		font-weight: 600;
		line-height: 1.35;
	}

	.tool-desc {
		margin-top: 7rpx;
		color: #8c949d;
		font-size: 28rpx;
		line-height: 1.35;
	}

	.pmt-btn {
		background-color: #008cff!important;
		color: #ffffff !important;
		font-size: 28rpx;
		font-weight: 500;
	}
	
	.btn-hover {
		background-color: #0c6bf9 !important;
	}

	@media screen and (min-width: 768px) {
		.tool-row { align-items: center; min-height: 96px; }

		.tool-icon-column {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 80px;
			flex: 0 0 80px;
			padding-top: 0;
		}

		.tool-action-column {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 132px;
			flex: 0 0 132px;
			padding-top: 0;
		}

		.tool-copy {
			padding-right: 12px;
		}

		.tool-title {
			font-size: 32px;
		}

		.tool-desc {
			margin-top: 7px;
			font-size: 28px;
		}

		.pmt-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 120px;
			height: 52px;
			margin: 0;
			padding: 0;
			border-radius: 10px;
			font-size: 28px;
			line-height: 1;
		}

		.pmt-btn::after { border: 0; }
	}
</style>
