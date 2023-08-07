<template>
	<view>
		<uni-card @tap="tap(toolData)">
			<view class="uni-flex uni-row">
				<view class="text" style="width: 20%;">
					<uni-icons custom-prefix="iconfont" :type="toolData.iconType" size="25"></uni-icons>
				</view>
				<view style="-webkit-flex: 1;flex: 1;">
					<view style="font-size: 16px;">{{toolData.toolType}}</view>
					<view style="font-size: 14px;">{{toolData.toolDesc}}</view>
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
	
	.pmt-btn {
	  background-color: #008cff !important;
	  color: #ffffff !important;
	}
	
	.btn-hover {
		background-color: #0c6bf9 !important;
	}
</style>
