<template>
	<view>
		<uni-card @tap="tap(toolData)">
			<view class="uni-flex uni-row">
				<view class="text" style="width: 20%;">
					<uni-icons :type="toolData.iconType" size="25" color="blue"></uni-icons>
				</view>
				<view style="-webkit-flex: 1;flex: 1;">
					<view>{{toolData.toolType}}</view>
					<view>{{toolData.toolDesc}}</view>
				</view>
				<view class="text" style="width: 25%;">
					<button size="mini" type="primary">{{toolData.action}} ></button>
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
</style>
