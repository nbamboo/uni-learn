<template>
	<view class="page-main">
		<liu-slide-questions :dataList="list" @showJsq="showJsq"></liu-slide-questions>
		<liu-drag-button @clickBtn="showJsq">
			<image class="sinchoose-on" :src="backimg"></image>
		</liu-drag-button>
		<liu-popup type="bottom" ref="bottom">
			<lcjsq :dataResourceType="resourceType" :dataContent="dataContentFromOuter"></lcjsq>
		</liu-popup>
	</view>
</template>

<script>
	import lcjsq from '@/pages/lcjsq/lcjsq.vue'
	export default {
		components: {
			'lcjsq': lcjsq
		},
		data() {
			return {
				backimg: require('../../static/image/count.png'),
				showDragButton: true,
				resourceType: "inside",
				dataContentFromOuter: "",
				list: [{
					id: '1',
					title: '张先生以10％年利率借款500000元投资于一个5年期项目。每年年末至少要收回（  ）元。该项目才是可以获利的。',
					problemType: 'SINGLE',
					trueAnswer: "A",
					isShowAnswer: false,
					explainText: "22222",
					explainJsqData: {
						rate: '10',
						nper: '5',
						pv: '-500000',
						fv: '0',
						pmt: '',
						current: 1,
						result: '131898.7404'
					},
					children: [{
						alias: 'A',
						answer: '100000',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}, {
						alias: 'B',
						answer: '131899',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}, {
						alias: 'C',
						answer: '150000',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}, {
						alias: 'D',
						answer: '161051',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}],
				}, {
					id: '2',
					title: '张先生以10％年利率借款500000元投资于一个5年期项目。每年年末至少要收回（  ）元。该项目才是可以获利的。',
					problemType: 'SINGLE',
					trueAnswer: "A",
					isShowAnswer: false,
					explainText: "22222",
					explainJsqData: {
						rate: '10',
						nper: '5',
						pv: '-500000',
						fv: '0',
						pmt: '',
						current: 1,
						result: '131898.7404'
					},
					explainImageSrc: '../../static/image/about2.png',
					children: [{
						alias: 'A',
						answer: '100000',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}, {
						alias: 'B',
						answer: '131899',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}, {
						alias: 'C',
						answer: '150000',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}, {
						alias: 'D',
						answer: '161051',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}],
				}, {
					id: '3',
					title: '李女士未来2年内每年年末存入银行10000元，假定年利率为10％，每年付息一次，则该笔投资2年后的本利和是（  ）元。 ',
					problemType: 'SINGLE',
					trueAnswer: "A",
					isShowAnswer: false,
					explainText: "22222",
					explainJsqData: {
						rate: '10',
						nper: '5',
						pv: '-500000',
						fv: '0',
						pmt: '',
						current: 1,
						result: '131898.7404'
					},
					explainImageSrc: '../../static/image/about2.png',
					children: [{
						alias: 'A',
						answer: '23000',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}, {
						alias: 'B',
						answer: '20000',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}, {
						alias: 'C',
						answer: '21000',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}, {
						alias: 'D',
						answer: '23100',
						isSelect: 0 //这个是用来回显的字段(0:未选中；1:选中)(可不传)
					}],
				}], //问题列表数据
			}
		},
		methods: {
			//点击提交
			showJsq(data) {
				// console.log('提交的数据：' + JSON.stringify(data))
				this.resourceType = JSON.stringify(data) ? 'outer' : 'inside'
				this.dataContentFromOuter = JSON.stringify(data) ? JSON.stringify(data) : null
				this.$refs['bottom'].open()
			}
		}
	}
</script>

<style lang="scss">
	.sinchoose-on {
		width: 100rpx;
		height: 100rpx;
	}
</style>