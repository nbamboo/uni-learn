<template>
	<view class="dtk">
		<uni-section type="line" title="答题卡">
			<view class="answer-sheet">
				<view class="question-number" :class="{ active: currentIndex == index}" v-for="(item, index) in newQuestionsAnswer" :key="index" 
				@click="selectSubject(item, index)">{{index + 1}}</view>
			</view>
		</uni-section>
	</view>
</template>

<script>
	export default {		
		props: {
			subjectList: {
				type: Array,
				default () {
					return []
				}
			},
			
			currentIndex: {
				type: Number,
				default: 0
			}
		},
		
		watch: {
			subjectList: {
				deep: true,
				immediate: true,
				handler(newArr) {
					if (newArr.length) {
						console.log(newArr)
						this.newQuestionsAnswer = JSON.parse(JSON.stringify(newArr))
						this.totalNum = newArr.length
						
					}
				},
			}
		},
			
		data() {
			return {
				totalNum: 0,
				newQuestionsAnswer: [],
			}
		},
		
		methods: {
			selectSubject: function(item, index) {
				this.$emit("selectSubject", index)
			}
		}
	}
</script>


<style lang="scss">
	.dtk {
		width: 600rpx;
		height: 800rpx;
		margin: 10rpx;
	}

	.text {
		margin-left: 15px;
	}

	.answer-sheet {
		display: flex;
		flex-wrap: wrap;
	}

	.question-number {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		margin: 10px;
		border: 1px solid #808080;
		background-color: #FFFFFF;
		font-size: 16px;
	}
	
	.active {
		background-color: #c2c2c2;
	}
</style>