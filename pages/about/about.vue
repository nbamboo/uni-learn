<template>
	<view>
		<uni-section title="图文教程" type="line">
			<uni-collapse ref="collapse" v-model="value" @change="change">
				<uni-collapse-item title="理财计算器" :open="true">
					<view class="content">
						<view>第一步：【利率%】，输入题目中的利率，不要输入百分号，例如7%，只需要输入数字7即可;</view>
						<view class="image-content">
							<image class="image-view" mode="widthFix" :src="src[0]" @error="imageError"></image>
						</view>
						<view>第二步：【期数】，输入数字时，需要先点击前面，出现“对勾”即为选中，才可输入数字;</view>
						<view class="image-content">
							<image class="image-view" mode="widthFix" :src="src[1]" @error="imageError"></image>
						</view>
						<view>第三步：【现值】，操作同上;</view>
						<view class="image-content">
							<image class="image-view" mode="widthFix" :src="src[2]" @error="imageError"></image>
						</view>
						<view>第四步：【终值】，操作同上;</view>
						<view class="image-content">
							<image class="image-view" mode="widthFix" :src="src[3]" @error="imageError"></image>
						</view>
						<view>第五步：需要求的参数，不需要点击前面，不需要出现“对勾”;</view>
						<view class="image-content">
							<image class="image-view" mode="widthFix" :src="src[4]" @error="imageError"></image>
						</view>
						<view>第六步：【期初】【期末】，根据情况选择即可。但是在没有特别说明的情况下，默认选择【期末】即可。</view>
						<view class="image-content">
							<image class="image-view" mode="widthFix" :src="src[5]" @error="imageError"></image>
						</view>
						<view>第七步：点击计算或清空按钮显示或清除计算结果，-号表示资金流入方向。</view>
						<view class="image-content">
							<image class="image-view" mode="widthFix" :src="src[6]" @error="imageError"></image>
						</view>
					</view>
				</uni-collapse-item>
				<!-- 				<uni-collapse-item title="参数表">
					<view class="content">
						<view>第一步：【利率%】，输入题目中的利率，不要输入百分号，例如7%，只需要输入数字7即可;</view>
						<view>第二步：【期数】，输入数字时，需要先点击前面，出现“对勾”即为选中，才可输入数字;</view>
						<view>第三步：【现值】，操作同上;</view>
						<view>第四步：【终值】，操作同上;</view>
						<view>第五步：需要求的参数，不需要点击前面，不需要出现“对勾”;</view>
						<view>第六步：【期初】【期末】，根据情况选择即可。但是在没有特别说明的情况下，默认选择【期末】即可。</view>
					</view>
				</uni-collapse-item> -->
			</uni-collapse>
		</uni-section>
		<!-- 		<uni-section title="视频教程" type="line">
			<uni-collapse ref="collapse" v-model="value" @change="change">
				<uni-collapse-item title="理财计算器" :open="true">
					<view class="content">
						<view>
							<video id="myVideo" src="http://cdn.gptgo.club/syl.mp4"
								direction="0"></video>
						</view>
					</view>
				</uni-collapse-item>
			</uni-collapse>
		</uni-section> -->
	</view>
</template>

<script>
	export default {
		data() {
			return {
				src: [
					'../../static/image/about1.png',
					'../../static/image/about2.png',
					'../../static/image/about3.png',
					'../../static/image/about4.png',
					'../../static/image/about5.png',
					'../../static/image/about6.png',
					'../../static/image/about7.png',
				],
				value: ['1'],
			};
		},
		methods: {
			imageError: function(e) {
				console.error('image发生error事件，携带值为' + e.detail.errMsg)
			},
			change(e) {
				console.log(e);
			}
		}
	}
</script>

<style lang="scss">
	.content {
		padding: 15px;
		font-size: 14px;
	}

	.image-content {
		margin-top: 1%;
	}

	.image-view {}
</style>