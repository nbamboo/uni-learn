<template>
	<view>
		<view class="example">
			<!-- 基础表单校验 -->
			<uni-forms ref="valiForm" :rules="rules" :model="valiFormData" labelWidth="36%">
				<uni-forms-item>
					<view class="cb1">
						<text>利率</text>
					</view>
					<uni-easyinput v-model="valiFormData.name" />
					<text class="bfb">%</text>
				</uni-forms-item>
				<uni-forms-item>
					<view class="cb2">
						<label>
							<checkbox class="checkbox-backgroun-yellow" value="cb" style="transform:scale(0.5)" />期数
						</label>
					</view>
					<uni-easyinput v-model="valiFormData.age" />
					<uni-icons class="tb" type="color" size="22"></uni-icons>
				</uni-forms-item>
				<uni-forms-item>
					<view class="cb2">
						<label>
							<checkbox value="cb" style="transform:scale(0.5)" />现值
						</label>
					</view>
					<uni-easyinput v-model="valiFormData.age" />
					<uni-icons class="tb" type="color" size="22"></uni-icons>
				</uni-forms-item>
				<uni-forms-item>
					<view class="cb2">
						<label>
							<checkbox value="cb" style="transform:scale(0.5)" />终值
						</label>
					</view>
					<uni-easyinput v-model="valiFormData.age" />
					<uni-icons class="tb" type="color" size="22"></uni-icons>
				</uni-forms-item>
				<uni-forms-item>
					<view class="cb2">
						<label>
							<checkbox value="cb" style="transform:scale(0.5)" />每期付款额
						</label>
					</view>
					<uni-easyinput v-model="valiFormData.age" />
					<uni-icons class="tb" type="color" size="22"></uni-icons>
				</uni-forms-item>
				<uni-forms-item>
					<view class="cb2">
						<radio-group class="radio_flex" @change="radioChange" >
							<label class="radio_flex" v-for="(item, index) in items" :key="item.value" style="padding-right: 80px;">
								<view>
									<radio :value="item.value" :checked="index === current" style="transform:scale(0.5)"/>
								</view>
								<view>{{item.name}}</view>
							</label>
						</radio-group>
					</view>
				</uni-forms-item>
			</uni-forms>
			<!-- <button type="primary" @click="submit('valiForm')">提交</button> -->
		</view>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				// 校验表单数据
				valiFormData: {
					name: '',
					age: '',
					introduction: '',
				},
				// 校验规则
				rules: {
					name: {
						rules: [{
							required: true,
							errorMessage: '姓名不能为空'
						}]
					},
					age: {
						rules: [{
							required: true,
							errorMessage: '年龄不能为空'
						}, {
							format: 'number',
							errorMessage: '年龄只能输入数字'
						}]
					}
				},
				items: [{
						value: 'USA',
						name: '期初',
						checked: 'true'
					},
					{
						value: 'CHN',
						name: '期末'
					}
				],
				current: 0
			}
		},
		methods: {

		}
	}
</script>

<style>
	.example {
		padding: 8%;
		background-color: #fff;
	}

	.bfb {
		position: absolute;
		right: -8%;
		top: 24%;
	}

	.cb1 {
		position: absolute;
		left: -50%;
		top: 24%;
	}

	.cb2 {
		position: absolute;
		left: -64%;
		top: 24%;
	}
	
	.radio_flex {
		display: flex;
		justify-content: flex-start;
		align-items: center;
	}
	
	.tb {
		position: absolute;
		right: 4%;
		top: 24%;
	}
</style>