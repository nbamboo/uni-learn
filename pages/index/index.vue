<template>
	<view class='purchase-list'>
		<my-tabs @change="tapChange" :modelData="modelData" :initIndex="initIndex"></my-tabs>
		<my-unit @change="tapTool" v-for="(item, index) in toolDatas" :key="index" :toolData="item"></my-unit>
		<view style="text-align: center; padding: 10%;">
			<button open-type="share" type="primary" size="default" class="pmt-btn">分享给好友</button>
		</view>
		<ad unit-id="adunit-3e42e98e41630403" ad-type="video" ad-theme="white"></ad>
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
					"toolDesc": "期末年金与期初年金",
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
						"toolDesc": "期末年金与期初年金",
						"iconType": "icon-jisuanqi2",
						"action": "计算",
						"url":"/pages/lcjsq/lcjsq"
					}]
				} else if (val == 1) {
					this.toolDatas = [{
							"toolType": "年金终值表",
							"toolDesc": "普通期末年金终值",
							"iconType": "icon-biaoge-chakan",
							"action": "查看",
							"url":"/pages/njzzb/njzzb"
						},
						{
							"toolType": "年金现值表",
							"toolDesc": "普通期末年金现值",
							"iconType": "icon-dizhiguanli",
							"action": "查看",
							"url":"/pages/njxzb/njxzb"
						},
						{
							"toolType": "复利现值表",
							"toolDesc": "PV = FV/(1 + r)^n",
							"iconType": "icon-fuwuxiangmuzongbi",
							"action": "查看"	,
							"url":"/pages/flxzb/flxzb"
						},
						{
							"toolType": "复利终值表",
							"toolDesc": "FV = PV(1 + r)^n ",
							"iconType": "icon-a-MenuYingfumingxi2x",
							"action": "查看"	,						
							"url":"/pages/flzzb/flzzb"
						},
						{
							"toolType": "个人所得税税率表",
							"toolDesc": "综合所得适用",
							"iconType": "icon-a-MenuCaiwuguanli2x",
							"action": "查看",
							"url":"/pages/swbzh/swbzh"
						},
						{
							"toolType": "个人所得税税率表",
							"toolDesc": "经营所得适用",
							"iconType": "icon-a-MenuCaigouduizhang2x",
							"action": "查看",
							"url":"/pages/swbjy/swbjy"
						},
						{
							"toolType": "个人所得税税率表",
							"toolDesc": "年终奖适用",
							"iconType": "icon-qianbao",
							"action": "查看",
							"url":"/pages/swbnzj/swbnzj"
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
	
	.active {
		position: absolute; 
		bottom: 0rpx
	}
	
	.purchase-list {
		background-color: #ffffff;
		height: 100%;
		overflow: hidden;

		.purchase-body {
			height: calc(100% - 88upx);
			overflow: auto
		}
	}
	
	.pmt-btn {
	  background-color: #008cff!important;
	  color: #ffffff !important;
	  border-radius: 25px;
	}
</style>