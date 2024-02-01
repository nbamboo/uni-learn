<template>
	<view >
		<view class="page-main" v-if="loadState">
			<liu-slide-questions :dataList="list" :chooseIndex="chooseIndex" @showJsq="showJsq"
				@showDtk="showDtk"></liu-slide-questions>
			<liu-drag-button @clickBtn="showJsq" :bottomPx="150">
				<image class="sinchoose-on" :src="backimg1"></image>
			</liu-drag-button>
			<liu-drag-button @clickBtn="dialogToggle()" :bottomPx="80">
				<image class="sinchoose-on" :src="backimg2"></image>
			</liu-drag-button>
			<liu-popup type="bottom" ref="bottom">
				<lcjsq :dataResourceType="resourceType" :dataContent="dataContentFromOuter"></lcjsq>
			</liu-popup>
			<liu-popup type="center" ref="center">
				<subject :subjectList="list" :currentIndex="chooseIndex" @selectSubject="selectSubject"></subject>
			</liu-popup>
			<uni-popup ref="alertDialog" type="dialog">
				<uni-popup-dialog :type="msgType" cancelText="残忍拒绝" confirmText="鼓励一下" title="集美集帅们"
					content="制作不易,看个广告鼓励一下叭" @confirm="dialogConfirm" @close="dialogClose"></uni-popup-dialog>
			</uni-popup>
		</view>
		<view v-else>
			<uni-load-more iconType="circle" status="loading" />
		</view>
	</view>
</template>

<script>
	import lcjsq from '@/pages/lcjsq/lcjsq.vue'
	import subject from '@/pages/subject/subject.vue'
	export default {
		components: {
			'lcjsq': lcjsq,
			'subject': subject
		},
		data() {
			return {
				backimg1: require('../../static/image/count.png'),
				backimg2: require('../../static/image/good.png'),
				showDragButton: true,
				loadState: false,
				msgType: "error",
				resourceType: "inside",
				dataContentFromOuter: "",
				chooseIndex: 0,
				list: []
			}
		},
		onLoad() {
			uniCloud.callFunction({
				name: "getExamItem"
			}).then(res => {
				this.loadState = true
				this.list = res.result.data
			})
		},
		methods: {
			showJsq(data) {
				this.resourceType = JSON.stringify(data) ? 'outer' : 'inside'
				this.dataContentFromOuter = JSON.stringify(data) ? JSON.stringify(data) : null
				this.$refs['bottom'].open()
			},

			showDtk(data) {
				this.chooseIndex = data
				this.$refs['center'].open()
			},

			selectSubject(data) {
				console.log(data)
				this.chooseIndex = data
				this.$refs['center'].close()
			},

			dialogToggle() {
				this.$refs.alertDialog.open()
			},

			dialogConfirm() {
				this.showAD()
			},

			dialogClose() {
				console.log('点击关闭')
			},

			showAD() {
				// 若在开发者工具中无法预览广告，请切换开发者工具中的基础库版本
				// 在页面中定义激励视频广告
				let videoAd = null

				// 在页面onLoad回调事件中创建激励视频广告实例
				if (wx.createRewardedVideoAd) {
					videoAd = wx.createRewardedVideoAd({
						adUnitId: 'adunit-43dce5c0fde475fa'
					})
					videoAd.onLoad(() => {})
					videoAd.onError((err) => {
						console.error('激励视频光告加载失败', err)
					})
					videoAd.onClose((res) => {})
				}

				// 用户触发广告后，显示激励视频广告
				if (videoAd) {
					videoAd.show().catch(() => {
						// 失败重试
						videoAd.load()
							.then(() => videoAd.show())
							.catch(err => {
								console.error('激励视频 广告显示失败', err)
							})
					})
				}
			}
		}

	}
</script>

<style lang="scss">
	.sinchoose-on {
		width: 80rpx;
		height: 80rpx;
	}
</style>