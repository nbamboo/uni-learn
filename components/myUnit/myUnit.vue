<template>
	<view>
		<uni-card margin="10px" @tap="tap(toolData)">
			<view class="uni-flex uni-row">
				<view class="text" style="width: 20%;">
					<uni-icons custom-prefix="iconfont" :type="toolData.iconType" size="25"></uni-icons>
				</view>
				<view class="tool-copy">
					<view class="tool-title">{{toolData.toolType}}</view>
					<view class="tool-desc">{{toolData.toolDesc}}</view>
				</view>
				<view class="text" style="width: 25%;">
					<button size="mini" type="default" class="pmt-btn" hover-class="btn-hover">{{toolData.action}}</button>
				</view>
			</view>
		</uni-card>
	</view>
</template>

<script>
	export default {
		props:['toolData'],
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

	.tool-copy {
		-webkit-flex: 1;
		flex: 1;
		min-width: 0;
	}

	.tool-title {
		color: #30353c;
		font-size: 30rpx;
		font-weight: 600;
		line-height: 1.35;
	}

	.tool-desc {
		margin-top: 7rpx;
		color: #8c949d;
		font-size: 26rpx;
		line-height: 1.35;
	}

	.pmt-btn {
		background-color: #008cff!important;
		color: #ffffff !important;
		font-size: 26rpx;
		font-weight: 500;
	}
	
	.btn-hover {
		background-color: #0c6bf9 !important;
	}
</style>
