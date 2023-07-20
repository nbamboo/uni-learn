<template>
	<view>
		<view class="example">
			<!-- 基础表单校验 -->
			<uni-forms ref="valiForm" :rules="rules" :model="valiFormData" labelWidth="36%">
				<uni-forms-item name="rate">
					<view class="cb1">
						<text>利率</text>
					</view>
					<uni-easyinput v-model="valiFormData.rate" type="number" />
					<text class="bfb">%</text>

				</uni-forms-item>
				<checkbox-group @change="checkboxChange">
					<uni-forms-item name="nper">
						<view class="cb2">
							<label>
								<checkbox value="nper" style="transform:scale(0.5)" :checked="parmitems[0].checked"
									:disabled="parmitems[0].checkboxDisabledValue" />期数
							</label>
						</view>
						<uni-easyinput v-model="valiFormData.nper" type="number"
							:disabled="parmitems[0].inputDisabledValue" />
						<uni-icons class="tb" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
					</uni-forms-item>
					<uni-forms-item name="pv">
						<view class="cb2">
							<label>
								<checkbox value="pv" style="transform:scale(0.5)" :checked="parmitems[1].checked"
									:disabled="parmitems[1].checkboxDisabledValue" />现值
							</label>
						</view>
						<uni-easyinput v-model="valiFormData.pv" type="number"
							:disabled="parmitems[1].inputDisabledValue" />
						<uni-icons class="tb" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
					</uni-forms-item>
					<uni-forms-item name="fv">
						<view class="cb2">
							<label>
								<checkbox value="fv" style="transform:scale(0.5)" :checked="parmitems[2].checked"
									:disabled="parmitems[2].checkboxDisabledValue" />终值
							</label>
						</view>
						<uni-easyinput v-model="valiFormData.fv" type="number"
							:disabled="parmitems[2].inputDisabledValue" />
						<uni-icons class="tb" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
					</uni-forms-item>
					</uni-forms-item>
					<uni-forms-item name="pmt">
						<view class="cb2">
							<label>
								<checkbox value="pmt" style="transform:scale(0.5)" :checked="parmitems[3].checked"
									:disabled="parmitems[3].checkboxDisabledValue" />
								每期付款额
							</label>
						</view>
						<uni-easyinput v-model="valiFormData.pmt" type="number"
							:disabled="parmitems[3].inputDisabledValue" />
						<uni-icons class="tb" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
					</uni-forms-item>
					</uni-forms-item>
					<uni-forms-item>
						<view class="cb2">
							<radio-group class="radio_flex" @change="radioChange">
								<label class="radio_flex" v-for="(item, index) in items" :key="item.value"
									style="padding-right: 135rpx;">
									<view>
										<radio :value="item.value" :checked="index === current"
											style="transform:scale(0.5)" />
									</view>
									<view>{{item.name}}</view>
								</label>
							</radio-group>
						</view>
					</uni-forms-item>
				</checkbox-group>
			</uni-forms>
			<view class="result-wrapper">
				<text class="result-caption">&nbsp;计算结果 = {{result}}</text>
				<text class="result"></text>
			</view>
			<div style="text-align: right">
				<button type="default" size="mini" class="pmt-btn-clear" @click="reset()">清空</button>
				<button type="default" size="mini" class="pmt-btn-cal" hover-class="btn-hover"
					@click="submit('valiForm')">计算</button>
			</div>
		</view>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				// 校验表单数据
				valiFormData: {
					rate: '',
					nper: '',
					pv: '',
					fv: '',
					pmt: '',
				},
				// 表单禁用初始值
				parmitems: [{
						value: "nper",
						inputDisabledValue: true,
						checkboxDisabledValue: false,
						checked: false
					},
					{
						value: "pv",
						inputDisabledValue: true,
						checkboxDisabledValue: false,
						checked: false
					},
					{
						value: "fv",
						inputDisabledValue: true,
						checkboxDisabledValue: false,
						checked: false
					},
					{
						value: "pmt",
						inputDisabledValue: true,
						checkboxDisabledValue: false,
						checked: false
					}
				],
				// 校验规则
				rules: {
					rate: {
						rules: [{
							format: 'number',
							errorMessage: '利率只能输入数字'
						}]
					},
					nper: {
						rules: [{
							format: 'number',
							errorMessage: '期数只能输入数字'
						}]
					},
					pv: {
						rules: [{
							format: 'number',
							errorMessage: '现值只能输入数字'
						}]
					},
					fv: {
						rules: [{
							format: 'number',
							errorMessage: '终值只能输入数字'
						}]
					},
					pmt: {
						rules: [{
							format: 'number',
							errorMessage: '每期付款额只能输入数字'
						}]
					}
				},
				items: [{
						value: 'begining',
						name: '期初',
					},
					{
						value: 'ending',
						name: '期末'
					}
				],
				current: 1,
				result: ""
			}
		},
		methods: {
			submit(ref) {
				console.log(this.valiFormData);
				this.$refs[ref].validate().then(res => {
					console.log('success', res);
					this.result = this.calculateResult(res, this.current);
				}).catch(err => {
					console.log('err', err);
				})
			},

			calculateResult(params, current) {
				console.log(params);
				console.log(current);
			},

			reset() {
				this.valiFormData = {
						rate: '',
						nper: '',
						pv: '',
						fv: '',
						pmt: '',
					},
					this.parmitems = [{
							value: "nper",
							inputDisabledValue: true,
							checkboxDisabledValue: false,
							checked: false
						},
						{
							value: "pv",
							inputDisabledValue: true,
							checkboxDisabledValue: false,
							checked: false
						},
						{
							value: "fv",
							inputDisabledValue: true,
							checkboxDisabledValue: false,
							checked: false
						},
						{
							value: "pmt",
							inputDisabledValue: true,
							checkboxDisabledValue: false,
							checked: false
						}
					],
					this.current = 1
			},

			radioChange: function(evt) {
				for (let i = 0; i < this.items.length; i++) {
					if (this.items[i].value === evt.detail.value) {
						this.current = i;
						break;
					}
				}
			},

			checkboxChange: function(e) {
				var items = this.parmitems,
					values = e.detail.value;
				var chooseNumber = values.length;
				for (var i = 0, lenI = items.length; i < lenI; ++i) {
					const item = items[i]
					if (values.includes(item.value)) {
						item.checked = true;
						item.inputDisabledValue = false;
					} else {
						if (chooseNumber === 3) {
							item.checkboxDisabledValue = true;
						} else {
							item.checkboxDisabledValue = false;
						}
						item.checked = false;
						item.inputDisabledValue = true;
					}
				}
			}
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

	.result-wrapper {
		margin-top: 4%;
		padding: 8% 0;
		border-top: 1rpx solid #ddd;
	}

	.result-caption {
		font-weight: 600;
	}

	.result {
		font-size: 60rpx;
		color: #333;
	}

	.pmt-btn-clear {
		margin-right: 10rpx;
	}

	.pmt-btn-cal {
		background-color: #008cff !important;
		color: #ffffff !important;
		margin-right: 10rpx;
	}

	.btn-hover {
		background-color: #0c6bf9 !important;
	}
</style>