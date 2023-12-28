<template>
	<view :class="{'page-main-show-answer': isShowAnswer, 'page-main': !isShowAnswer}">
		<view class="uni-flex" style="justify-content: space-between; align-items: center; padding: 20rpx 48rpx">
			<view>
				<view>{{currentIndex + 1}}/{{totalNum}}</view>
			</view>
			<view>
				<button size="mini" type="default" class="dtk-btn" @click="showDtk()">答题卡</button>
			</view>
		</view>
		<swiper :class="{'swipercard-show-answer': isShowAnswer, 'swipercard': !isShowAnswer}" previous-margin="0"
			next-margin="0" :circular="false" :autoplay="false" :current="currentIndex" @change="eventHandle">
			<block v-for="(item, index) in newQuestionsAnswer" :key="index">
				<swiper-item class="swiperitem">
					<view class="itembox">
						<!-- 						<view class="box-hd">
							<view class="hdname">当前第<view class="text1">{{ index+ 1}}</view>道题</view>
							<view class="hdnum">共{{totalNum}}道题</view>
						</view> -->
						<view class="contentbox">
							<view class="boxtitle">
								<text class="textl">{{index+1}}、</text>
								<text class="textr">{{item.title}}</text>
							</view>
							<view v-if="item.problemType == 'SINGLE'">
								<view class="boxbody" v-for="(self,idxs) in item.children" :key="idxs">
									<view class="chooseitem" @click="singChoose(index,idxs)">
										<image class="sinchoose-on" v-if="returnResult1(item, self)" :src="chooseonImg"
											mode="">
										</image>
										<image class="sinchoose-on" v-else-if="returnResult2(item, self)"
											:src="chooseonImg2" mode="">
										</image>
										<view class="sinchoose" v-else></view>
										<view class="bodyr">{{self.alias}}. {{self.answer}}</view>
									</view>
								</view>
							</view>
						</view>
						<view class="footbtn">
							<view class="ftbtn1" v-if="(index + 1) > 1" @click="back(index)">上一题</view>
							<view class="ftbtn1" @click="switchShowAnser(item)">解析</view>
							<view class="ftbtn1" v-if="(index + 1) < totalNum" @click="next(index)">下一题</view>
							<!-- <view class="ftbtn2" v-else @click="submitData">提交</view> -->
						</view>

						<view class="boxbody" v-show="item.isShowAnswer">
							<view>
								<view>
									<text>正确答案：</text>
									<text>{{item.trueAnswer}}</text>
								</view>
							</view>
							<view>
								<view>
									<text>解析：</text>
									<text>{{item.explainText}}</text>
								</view>
							</view>
							<view class="ftbtn3" @click="showJsq(item.explainJsqData)">填充至计算器</view>
						</view>
					</view>
				</swiper-item>
			</block>
		</swiper>
		<liu-popup type="center" ref="center" :currentTime="currentTime">
			<view class="cu-dialog">
				<scroll-view :scroll-y=true>
					<view>
						<text>答题卡</text>
					</view>
					<uni-grid :column="3" :show-border="false" :square="false">
						<uni-grid-item v-for="(item, index) in newQuestionsAnswer" :key="index">
							<view class="grid-item-box">
								<button @click="selectSubject(index)">{{index+1}}</button>
								<text class="text">{{index+1}}</text>
							</view>
						</uni-grid-item>
					</uni-grid>
				</scroll-view>
			</view>
		</liu-popup>
	</view>
</template>

<script>
	export default {
		props: {
			//问题列表数据
			dataList: {
				type: Array,
				default () {
					return []
				}
			}
		},
		watch: {
			dataList: {
				deep: true,
				immediate: true,
				handler(newArr) {
					if (newArr.length) {
						this.newQuestionsAnswer = JSON.parse(JSON.stringify(newArr))
						this.totalNum = newArr.length
					}
				},
			}
		},
		data() {
			return {
				isShowAnswer: false,
				chooseonImg: require('../../static/image/chooseon.png'),
				chooseonImg2: require('../../static/image/chooseerror.png'),
				totalNum: 0,
				currentIndex: 0,
				newQuestionsAnswer: [],
				currentTime: 0
			};
		},
		methods: {
			//切换展示解析模块
			switchShowAnser(item) {
				item.isShowAnswer = !item.isShowAnswer,
					this.isShowAnswer = item.isShowAnswer
			},

			returnResult1(item, self) {
				// 非解析状态下，用户选什么，绿勾就在选择点显示
				if (!this.isShowAnswer && self.isSelect) {
					return true
					// 解析状态下，显示正确答案
				} else if (this.isShowAnswer && item.trueAnswer === self.alias) {
					return true
				} else {
					return false
				}
			},

			returnResult2(item, self) {
				// 解析状态下，用户进行了选择，答案又不对，显示红叉
				if (this.isShowAnswer && self.isSelect && item.trueAnswer !== self.alias) {
					return true
				} else {
					return false
				}
			},

			showJsq(jsqData) {
				this.currentTime = new Date().getTime()
				jsqData.time = this.currentTime
				this.$emit("showJsq", jsqData)
			},
			//显示答题卡弹框
			showDtk() {
				this.$refs['center'].open()
			},
			//选择题号触发动作
			selectSubject(index) {
				this.currentIndex = index
				//向子组件传递变化的时间，子组件捕获到变化后，执行关闭动作
				this.currentTime = new Date().getTime()
			},
			//单选事件
			singChoose(j, e) {
				// 解析状态下，就别瞎jb搞了
				if (this.isShowAnswer) {
					return
				}

				if (this.newQuestionsAnswer[j].children[e].isSelect) {
					this.newQuestionsAnswer[j].children[e].isSelect = 0
					// this.formSubmitData[j].userAnswer = ''
				} else {
					for (var i = 0; i < this.newQuestionsAnswer[j].children.length; i++) {
						if (this.newQuestionsAnswer[j].children[i].isSelect) {
							this.newQuestionsAnswer[j].children[i].isSelect = 0
						}
					}
					this.newQuestionsAnswer[j].children[e].isSelect = 1
				}
			},
			//swiper改变时
			eventHandle(e) {
				// 这块可以结合业务逻辑进行优化处理，如左右滑动切换题目时做一些提示处理等
				this.currentIndex = e.detail.current
				this.isShowAnswer = this.newQuestionsAnswer[this.currentIndex].isShowAnswer
			},
			// 上一题
			back(index) {
				if (!index) return
				this.currentIndex = index - 1
			},
			//下一题
			next(index) {
				this.currentIndex = index + 1
			}
		}
	};
</script>

<style scoped>
	.page-main {
		width: 100%;
		height: 80vh;
	}

	.page-main-show-answer {
		width: 100%;
		height: 120vh;
	}

	.swipercard {
		width: 100%;
		height: 80vh;
	}

	.swipercard-show-answer {
		width: 100%;
		height: 120vh;
	}

	.itembox {
		width: calc(100% - 96rpx);
		padding: 0rpx 48rpx;
	}

	.box-hd {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 4rpx dashed #f0f0f0;
		padding-bottom: 16rpx;
		padding-left: 16rpx;
	}

	.hdname {
		width: 400rpx;
		font-size: 28rpx;
		display: flex;
		align-items: flex-start;
		font-weight: 500;
		color: #666666;
		line-height: 40rpx;
	}

	.text1 {
		color: #008cff;
		font-size: 40rpx;
		line-height: 32rpx;
	}

	.hdnum {
		font-size: 28rpx;
		font-weight: 400;
		color: #666666;
		line-height: 42rpx;
	}

	.contentbox {
		font-size: 30rpx;
		color: #333333;
		/* 		margin-top: 10rpx; */
	}

	.boxtitle .textl {
		width: 50rpx;
		height: 34rpx;
	}

	.boxbody {
		padding-left: 40rpx;
		line-height: 64rpx;
		margin: 16rpx 0;
	}

	.chooseitem {
		display: flex;
		align-items: center;
	}

	.sinchoose {
		width: 28rpx;
		height: 28rpx;
		margin-right: 16rpx;
		border-radius: 50%;
		background: #FFFFFF;
		border: 2rpx solid #BFBDBD;
	}

	.sinchoose-on {
		width: 32rpx;
		height: 32rpx;
		margin-right: 16rpx;
	}

	.writeitem textarea {
		min-height: 164rpx;
		margin: 24rpx auto;
		padding: 16rpx;
		border: 2rpx solid #EBEBEB;
		border-radius: 4px;
		font-size: 30rpx;
		color: #333333;
	}

	.footbtn {
		display: flex;
		justify-content: center;
		margin-top: 112rpx;
		padding: 0 24rpx;
	}

	.ftbtn1 {
		width: 400rpx;
		height: 80rpx;
		line-height: 80rpx;
		text-align: center;
		border: 2rpx solid #008cff;
		font-size: 30rpx;
		font-weight: 500;
		color: #008cff;
		margin: 0 10rpx;
	}

	.ftbtn2 {
		width: 400rpx;
		height: 80rpx;
		line-height: 80rpx;
		text-align: center;
		border: 2rpx solid #008cff;
		background: #008cff;
		font-size: 30rpx;
		font-weight: 500;
		color: #FFFFFF;
		margin: 0 10rpx;
	}

	.ftbtn3 {
		width: 250rpx;
		height: 80rpx;
		line-height: 80rpx;
		text-align: center;
		border: 2rpx solid #008cff;
		font-size: 30rpx;
		font-weight: 500;
		color: #008cff;
	}

	.dtk-btn {
		background-color: #008cff !important;
		color: #ffffff !important;
	}

	.cu-dialog {
		display: inline-block;
		vertical-align: middle;
		width: 600rpx;
		max-width: 100%;
		background-color: #f8f8f8;
		border-radius: 1rpx;
	}
</style>