<template>
	<view class='purchase-list'>
		<my-tabs @change="tapChange" :modelData="modelData" :initIndex="initIndex"></my-tabs>
		<my-unit @change="tapTool" v-for="(item, index) in toolDatas" :key="index" :toolData="item"></my-unit>
	</view>

</template>

<script>
	import myTabs from '@/components/myTabs/myTabs.vue'
	import myUnit from '@/components/myUnit/myUnit.vue'
	export default {
		components: {
			myTabs,
			myUnit
		},
		data() {
			return {
				initIndex: 0,
				modelData: [{
						label: "理财计算器"
					},
					{
						label: "参数表"
					}
				],
				toolDatas: [{
					"toolType": "理财计算器",
					"toolDesc": "66666",
					"iconType": "icon-jisuanqi2",
					"action": "计算",
					"url":"/pages/lcjsq/lcjsq"
				}]
			}
		},
		methods: {
			/**
			 * @name 改变tab
			 * @param val 索引
			 */
			tapChange(val) {
				this.initIndex = val


				if (val == 0) {
					this.toolDatas = [{
						"toolType": "理财计算器",
						"toolDesc": "66666",
						"iconType": "icon-jisuanqi2",
						"action": "计算",
						"url":"/pages/lcjsq/lcjsq"
					}]
				} else if (val == 1) {
					this.toolDatas = [{
							"toolType": "年金终值表",
							"toolDesc": "66666",
							"iconType": "icon-biaoge-chakan",
							"action": "查看",
							"url":"/pages/view/view"
						},
						{
							"toolType": "年金现值表",
							"toolDesc": "66666",
							"iconType": "icon-dizhiguanli",
							"action": "查看",
							"url":"/pages/view/view"
						},
						{
							"toolType": "复利现值表",
							"toolDesc": "66666",
							"iconType": "icon-fuwuxiangmuzongbi",
							"action": "查看"	,
							"url":"/pages/view/view"
						},
						{
							"toolType": "复利终值表",
							"toolDesc": "66666",
							"iconType": "icon-a-MenuYingfumingxi2x",
							"action": "查看"	,						
							"url":"/pages/view/view"
						},
						{
							"toolType": "个人所得税税率表",
							"toolDesc": "（综合所得适用）",
							"iconType": "icon-a-MenuCaiwuguanli2x",
							"action": "查看",
							"url":"/pages/view/view"
						},
						{
							"toolType": "个人所得税税率表",
							"toolDesc": "经营所得适用",
							"iconType": "icon-a-MenuCaigouduizhang2x",
							"action": "查看",
							"url":"/pages/view/view"
						},
						{
							"toolType": "个人所得税税率表",
							"toolDesc": "年终奖适用",
							"iconType": "icon-qianbao",
							"action": "查看",
							"url":"/pages/view/view"
						}
					]
				}
			},
            /**
             * @name 点击理财工具
             * @param toolData 理财工具对象
             */
		    tapTool(toolData) {
				console.log(toolData)
				uni.navigateTo({
					url: toolData.url
				});
			}
		},
	}
</script>

<style lang='scss'>
	.purchase-list {
		background-color: #f5f5f5;
		height: 100%;
		overflow: hidden;

		.purchase-body {
			height: calc(100% - 88upx);
			overflow: auto
		}
	}
</style>