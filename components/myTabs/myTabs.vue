<template>
	<view :class="{'my-tabs':true,'space-between':formatBe}">
		<view  v-for="(item,index) in getModelData" :key="index" :class="{'tab-item':true,'active':formatIndex==index}" @tap="tap(index)">
			{{item.label}}
		</view>
	</view>
</template>

<script>
	export default {
		props:['modelData','initIndex'],
		data() {
			return {
				
			}
		},
		computed:{
			getModelData(){
				return this.modelData
			},
			formatBe(){
				return this.modelData
						?this.modelData.length>4?true:false
						:false
			},
			formatIndex(){
				return this.initIndex
			}
		},
		methods: {
			tap(index){
				console.log("我点击了",index);
				this.$emit("change",index);
			}
		}
	}
</script>
<style lang='scss'>
	.my-tabs {
		background-color: #ffffff;
		height: 44px;
		font-size: 16px;
		display: flex;
		justify-content: space-around;
		box-sizing: border-box;
		min-width: 100%;
		overflow-x: auto;
		
		.tab-item{
			line-height: 24px;
			padding: 10px;
			min-width: 50px;
			text-align: center;
		}
		.tab-item.active{
			position: relative;
			color: #008cff;
		}
		.tab-item.active::after{
			content: "";
			position: absolute;
			bottom: 0;
			left: 50%;
			transform: translateX(-50%);
			width: 100%;
			border-bottom: 2px solid #008cff;
			animation: test ease 1 0s;
		}
	}
	.my-tabs.space-between{
		justify-content: space-between;
	}
	@keyframes test{
		0%{width: 100%}
		50%{width: 150%}
		100%{width: 100%}
	}
</style>
