<template>
	<view>
		<view class="example">
			<!-- 基础表单校验 -->
			<uni-forms ref="valiForm" :rules="rules" :model="valiFormData" labelWidth="36%">
				<!-- 利率输入项 -->
				<uni-forms-item name="rate">
					<view class="cb1">
						<text class="content_size">利率</text>
					</view>
					<!-- 自定义输入框：点击打开键盘 -->
					<view class="custom-input" :class="{ 'has-value': valiFormData.rate, 'disabled': !inputItems.rate.enabled, 'focused': currentField === 'rate' && keyboardVisible }"
						@click="openKeyboard('rate')">
						<text class="input-value" v-if="inputItems.rate.enabled">{{ keyboardValue && currentField === 'rate' ? keyboardValue : valiFormData.rate }}</text>
						<text class="input-value" v-else>{{ valiFormData.rate }}</text>
						<view v-if="currentField === 'rate' && keyboardVisible" class="cursor"></view>
					</view>
					<uni-icons class="tb" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
					<text class="bfb">%</text>
				</uni-forms-item>

				<checkbox-group @change="checkboxChange">
					<!-- 期数输入项 -->
					<uni-forms-item name="nper">
						<view class="cb2">
							<label class="content_size">
								<checkbox value="nper" style="transform:scale(0.5)" :checked="parmitems[0].checked"
									:disabled="parmitems[0].checkboxDisabledValue" />期数
							</label>
						</view>
						<view class="custom-input" :class="{ 'has-value': valiFormData.nper, 'disabled': !inputItems.nper.enabled, 'focused': currentField === 'nper' && keyboardVisible }"
							@click="openKeyboard('nper')">
							<text class="input-value" v-if="inputItems.nper.enabled">{{ keyboardValue && currentField === 'nper' ? keyboardValue : valiFormData.nper }}</text>
							<text class="input-value" v-else>{{ valiFormData.nper }}</text>
							<view v-if="currentField === 'nper' && keyboardVisible" class="cursor"></view>
						</view>
						<uni-icons class="tb" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
					</uni-forms-item>

					<!-- 现值输入项 -->
					<uni-forms-item name="pv">
						<view class="cb2">
							<label class="content_size">
								<checkbox value="pv" style="transform:scale(0.5)" :checked="parmitems[1].checked"
									:disabled="parmitems[1].checkboxDisabledValue" />现值
							</label>
						</view>
						<view class="custom-input" :class="{ 'has-value': valiFormData.pv, 'disabled': !inputItems.pv.enabled, 'focused': currentField === 'pv' && keyboardVisible }"
							@click="openKeyboard('pv')">
							<text class="input-value" v-if="inputItems.pv.enabled">{{ keyboardValue && currentField === 'pv' ? keyboardValue : valiFormData.pv }}</text>
							<text class="input-value" v-else>{{ valiFormData.pv }}</text>
							<view v-if="currentField === 'pv' && keyboardVisible" class="cursor"></view>
						</view>
						<uni-icons class="tb" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
					</uni-forms-item>

					<!-- 终值输入项 -->
					<uni-forms-item name="fv">
						<view class="cb2">
							<label class="content_size">
								<checkbox value="fv" style="transform:scale(0.5)" :checked="parmitems[2].checked"
									:disabled="parmitems[2].checkboxDisabledValue" />终值
							</label>
						</view>
						<view class="custom-input" :class="{ 'has-value': valiFormData.fv, 'disabled': !inputItems.fv.enabled, 'focused': currentField === 'fv' && keyboardVisible }"
							@click="openKeyboard('fv')">
							<text class="input-value" v-if="inputItems.fv.enabled">{{ keyboardValue && currentField === 'fv' ? keyboardValue : valiFormData.fv }}</text>
							<text class="input-value" v-else>{{ valiFormData.fv }}</text>
							<view v-if="currentField === 'fv' && keyboardVisible" class="cursor"></view>
						</view>
						<uni-icons class="tb" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
					</uni-forms-item>

					<!-- 每期付款额输入项 -->
					<uni-forms-item name="pmt">
						<view class="cb2">
							<label class="content_size">
								<checkbox value="pmt" style="transform:scale(0.5)" :checked="parmitems[3].checked"
									:disabled="parmitems[3].checkboxDisabledValue" />每期付款额
							</label>
						</view>
						<view class="custom-input" :class="{ 'has-value': valiFormData.pmt, 'disabled': !inputItems.pmt.enabled, 'focused': currentField === 'pmt' && keyboardVisible }"
							@click="openKeyboard('pmt')">
							<text class="input-value" v-if="inputItems.pmt.enabled">{{ keyboardValue && currentField === 'pmt' ? keyboardValue : valiFormData.pmt }}</text>
							<text class="input-value" v-else>{{ valiFormData.pmt }}</text>
							<view v-if="currentField === 'pmt' && keyboardVisible" class="cursor"></view>
						</view>
						<uni-icons class="tb" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
					</uni-forms-item>

					<!-- 期初期末单选 -->
					<uni-forms-item>
						<view class="cb2">
							<radio-group class="radio_flex" @change="radioChange">
								<label class="radio_flex" v-for="(item, index) in items" :key="item.value"
									style="padding-right: 135rpx;">
									<view>
										<radio :value="item.value" :checked="index === current"
											style="transform:scale(0.5)" />
									</view>
									<view class="content_size">{{item.name}}</view>
								</label>
							</radio-group>
						</view>
					</uni-forms-item>
				</checkbox-group>
			</uni-forms>

			<!-- 计算结果 -->
			<view class="result-wrapper">
				<text class="result-caption">计算结果{{' '}}={{' '}} </text>
				<text class="result">{{result}}</text>
			</view>

			<!-- 操作按钮 -->
			<div style="text-align: right;">
				<button type="default" size="mini" class="pmt-btn-clear" @click="reset()">清空</button>
				<button type="default" size="mini" class="pmt-btn-cal" hover-class="btn-hover"
					@click="submit('valiForm')">计算</button>
			</div>
		</view>

		<!-- 自定义数字键盘 -->
		<number-input-keyboard
			:visible="keyboardVisible"
			:value="keyboardValue"
			:allow-negative="currentKeyboardConfig.allowNegative"
			:allow-decimal="currentKeyboardConfig.allowDecimal"
			:max-decimal-places="currentKeyboardConfig.maxDecimalPlaces"
			:tab-bar="false"
			@input="handleKeyboardInput"
			@confirm="handleKeyboardConfirm"
			@cancel="handleKeyboardCancel"
		/>
	</view>
</template>

<script>
	import NumberInputKeyboard from '@/components/num-keyboard/num-keyboard.vue'

	export default {
		components: {
			NumberInputKeyboard
		},
		props: {
			dataResourceType: {
				type: String,
				default: 'inside',
			},
			dataContent: {
				type: String,
				default: ''
			}
		},
		data() {
			return {
				// 键盘相关状态
				keyboardVisible: false,      // 键盘显示状态
				currentField: '',             // 当前编辑的字段名
				keyboardValue: '',            // 键盘当前输入值
				currentKeyboardConfig: {      // 当前键盘配置
					allowNegative: false,
					allowDecimal: true,
					maxDecimalPlaces: 4
				},
				// 各输入项的启用状态配置
				inputItems: {
					rate: { enabled: true, allowNegative: false, allowDecimal: true, maxDecimalPlaces: 4 },
					nper: { enabled: false, allowNegative: false, allowDecimal: false, maxDecimalPlaces: 0 },
					pv: { enabled: false, allowNegative: true, allowDecimal: true, maxDecimalPlaces: 4 },
					fv: { enabled: false, allowNegative: true, allowDecimal: true, maxDecimalPlaces: 4 },
					pmt: { enabled: false, allowNegative: true, allowDecimal: true, maxDecimalPlaces: 4 }
				},
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
				result: ''
			}
		},
		methods: {
			/**
			 * 键盘输入事件 - 实时更新输入值
			 * @param {string} value - 当前输入值
			 */
			handleKeyboardInput(value) {
				this.keyboardValue = value
				// 实时保存到 valiFormData，避免切换字段时丢失输入
				if (this.currentField) {
					this.$set(this.valiFormData, this.currentField, value)
				}
			},

			/**
			 * 打开数字键盘
			 * @param {string} fieldName - 字段名
			 */
			openKeyboard(fieldName) {
				// 检查字段是否可用
				if (!this.inputItems[fieldName].enabled) {
					return
				}

				this.currentField = fieldName
				const config = this.inputItems[fieldName]

				// 设置键盘配置
				this.currentKeyboardConfig = {
					allowNegative: config.allowNegative,
					allowDecimal: config.allowDecimal,
					maxDecimalPlaces: config.maxDecimalPlaces
				}

				// 设置当前值
				this.keyboardValue = this.valiFormData[fieldName] || ''

				// 打开键盘
				this.keyboardVisible = true
			},

			/**
			 * 键盘确认事件
			 * @param {string} value - 输入值
			 */
			handleKeyboardConfirm(value) {
				if (this.currentField) {
					this.$set(this.valiFormData, this.currentField, value)
					// 保持输入框可编辑，不禁用
				}
				this.keyboardVisible = false
			},

			/**
			 * 键盘取消事件
			 */
			handleKeyboardCancel() {
				this.keyboardVisible = false
			},

			/**
			 * 表单提交计算
			 * @param {string} ref - 表单引用
			 */
			submit(ref) {
				this.$refs[ref].validate().then(res => {
					this.calculateResult(res, this.current);
				}).catch(err => {
					console.log('err', err);
				})
			},

			/**
			 * 计算结果
			 * @param {Object} params - 参数对象
			 * @param {number} current - 当前期初/期末
			 */
			calculateResult(params, current) {
				if (this.showResult(params) > 1) {
					this.result = '';
					return;
				}
				if (params.nper === null) {
					var nper = this.nper(params.rate, params.pv, params.fv, params.pmt, current);
					this.result = nper.toString();
				} else if (params.pv === null) {
					var pv = this.pv(params.rate, params.nper, params.fv, params.pmt, current);
					this.result = pv.toString();
				} else if (params.fv === null) {
					var fv = this.fv(params.rate, params.nper, params.pv, params.pmt, current);
					this.result = fv.toString();
				} else if (params.pmt === null) {
					var pmt = this.pmt(params.rate, params.nper, params.pv, params.fv, current);
					this.result = pmt.toString();
				}
				this.$set(this.result)
			},

			/**
			 * 重置表单
			 */
			reset() {
				// 逐个属性清空，避免Vue 2响应式问题
				this.$set(this.valiFormData, 'rate', '')
				this.$set(this.valiFormData, 'nper', '')
				this.$set(this.valiFormData, 'pv', '')
				this.$set(this.valiFormData, 'fv', '')
				this.$set(this.valiFormData, 'pmt', '')

				// 重置checkbox状态
				this.parmitems.forEach((item, index) => {
					this.$set(this.parmitems[index], 'checked', false)
					this.$set(this.parmitems[index], 'inputDisabledValue', true)
					this.$set(this.parmitems[index], 'checkboxDisabledValue', false)
				})

				// 重置输入项启用状态（只有利率默认启用，其他需要勾选）
				this.$set(this.inputItems.rate, 'enabled', true)
				this.$set(this.inputItems.nper, 'enabled', false)
				this.$set(this.inputItems.pv, 'enabled', false)
				this.$set(this.inputItems.fv, 'enabled', false)
				this.$set(this.inputItems.pmt, 'enabled', false)

				// 重置键盘值
				this.keyboardValue = ''
				this.currentField = ''

				this.current = 1
				this.result = ''
			},

			/**
			 * 期初期末单选变化
			 * @param {Object} evt - 事件对象
			 */
			radioChange: function(evt) {
				for (let i = 0; i < this.items.length; i++) {
					if (this.items[i].value === evt.detail.value) {
						this.current = i;
						break;
					}
				}
			},

			/**
			 * 复选框变化事件
			 * @param {Object} e - 事件对象
			 */
			checkboxChange: function(e) {
				const values = e.detail.value;
				const chooseNumber = values.length;

				// 遍历每个选项，更新状态
				for (let i = 0; i < this.parmitems.length; i++) {
					const item = this.parmitems[i];
					const isChecked = values.indexOf(item.value) > -1;
					const wasChecked = item.checked;

					// 更新选中状态
					this.$set(this.parmitems[i], 'checked', isChecked);
					this.$set(this.parmitems[i], 'inputDisabledValue', !isChecked);

					// 更新禁用状态（当已选3个时，禁用其他未选项）
					this.$set(this.parmitems[i], 'checkboxDisabledValue', !isChecked && chooseNumber === 3);

					// 更新输入框启用状态
					this.$set(this.inputItems[item.value], 'enabled', isChecked);

					// 如果是取消勾选，清空值
					if (wasChecked && !isChecked) {
						// 使用 Vue.set 确保响应式更新
						this.$set(this.valiFormData, item.value, '');
						// 如果当前正在编辑该字段，同时清空键盘值
						if (this.currentField === item.value) {
							this.keyboardValue = '';
						}
					}
				}
			},

			/**
			 * 检查结果数量
			 * @param {Object} params - 参数对象
			 * @returns {number} 空值数量
			 */
			showResult: function(params) {
				let nullCount = 0;
				if (params.rate == null) {
					nullCount++;
				}
				if (params.nper == null) {
					nullCount++;
				}
				if (params.pv == null) {
					nullCount++;
				}
				if (params.fv == null) {
					nullCount++;
				}
				if (params.pmt == null) {
					nullCount++;
				}
				return nullCount;
			},

			/**
			 * 计算期数
			 */
			nper: function(rate1, pv1, fv1, pmt1, type1) {
				let rate = Number(rate1) / 100;
				let type = Number(type1);
				let pv = Number(pv1);
				let fv = Number(fv1);
				let pmt = Number(pmt1);

				if (!fv) fv = 0;

				if (rate == 0) return -(pv + fv) / pmt;

				if (type === 0) {
					pmt = (1 + rate) * pmt;
				}

				let nper = Math.log((pmt - rate * fv) / (pmt + rate * pv)) / Math.log(1 + rate);
				// 计算器中如需求"期数"的，其计算结果向上取整。例如，如计算结果为10.0001（年），10.5（年）,10.95（年）等情况的，都近似为11（年）。
				return Math.ceil(nper);
			},

			/**
			 * 计算现值
			 */
			pv: function(rate1, nper1, fv1, pmt1, type1) {
				let rate = Number(rate1) / 100;
				let type = Number(type1);
				let nper = Number(nper1);
				let fv = Number(fv1);
				let pmt = Number(pmt1);

				if (!fv) fv = 0;

				if (rate === 0) return -pmt * nper - fv;

				if (type === 0) {
					pmt = (1 + rate) * pmt;
				}

				let pow = Math.pow(1 + rate, nper);
				let pv = ((-pmt * (pow - 1)) / rate - fv) / pow;
				return pv.toFixed(4);
			},

			/**
			 * 计算终值
			 */
			fv: function(rate1, nper1, pv1, pmt1, type1) {
				let rate = Number(rate1) / 100;
				let type = Number(type1);
				let nper = Number(nper1);
				let pv = Number(pv1);
				let pmt = Number(pmt1);

				if (rate === 0) return -pmt * nper - pv;

				if (type === 0) {
					pmt = (1 + rate) * pmt;
				}

				let pow = Math.pow(1 + rate, nper);
				let fv = (-pmt * (pow - 1)) / rate - pv * pow;
				return fv.toFixed(4);
			},

			/**
			 * 计算每期付款额
			 */
			pmt: function(rate1, nper1, pv1, fv1, type1) {
				let rate = Number(rate1) / 100;
				let type = Number(type1);
				let nper = Number(nper1);
				let pv = Number(pv1);
				let fv = Number(fv1);

				if (!fv) fv = 0;
				if (rate == 0) return -(pv + fv) / nper;

				let pow = Math.pow(1 + rate, nper);
				let pmt = (rate / (pow - 1)) * -(pv * pow + fv);

				if (type == 0) {
					pmt /= 1 + rate;
				}
				return pmt.toFixed(4);
			},

			/**
			 * 处理外部数据变化
			 */
			handleChange() {
				if (this.dataResourceType === "outer") {
					var outerDataContent = JSON.parse(this.dataContent)

					this.valiFormData = {
							rate: outerDataContent.rate,
							nper: outerDataContent.nper,
							pv: outerDataContent.pv,
							fv: outerDataContent.fv,
							pmt: outerDataContent.pmt,
						}
					this.parmitems = [{
							value: "nper",
							inputDisabledValue: outerDataContent.nper === '',
							checkboxDisabledValue: true,
							checked: !(outerDataContent.nper === '')
						},
						{
							value: "pv",
							inputDisabledValue: outerDataContent.pv === '',
							checkboxDisabledValue: true,
							checked: !(outerDataContent.pv === '')
						},
						{
							value: "fv",
							inputDisabledValue: outerDataContent.fv === '',
							checkboxDisabledValue: true,
							checked: !(outerDataContent.fv === '')
						},
						{
							value: "pmt",
							inputDisabledValue: outerDataContent.pmt === '',
							checkboxDisabledValue: true,
							checked: !(outerDataContent.pmt === '')
						}
					]
					// 更新输入项启用状态
					this.inputItems = {
						rate: { enabled: true, allowNegative: false, allowDecimal: true, maxDecimalPlaces: 4 },
						nper: { enabled: !(outerDataContent.nper === ''), allowNegative: false, allowDecimal: false, maxDecimalPlaces: 0 },
						pv: { enabled: !(outerDataContent.pv === ''), allowNegative: true, allowDecimal: true, maxDecimalPlaces: 4 },
						fv: { enabled: !(outerDataContent.fv === ''), allowNegative: true, allowDecimal: true, maxDecimalPlaces: 4 },
						pmt: { enabled: !(outerDataContent.pmt === ''), allowNegative: true, allowDecimal: true, maxDecimalPlaces: 4 }
					}
					this.current = outerDataContent.current
					this.result = outerDataContent.result
				} else {
					this.reset()
				}
			}
		},
		mounted() {
			this.$watch(() => this.dataContent, (newVal, oldVal) => {
				if (newVal !== oldVal) {
					this.handleChange();
				}
			});
		}
	}
</script>

<style>
	.example {
		padding: 8%;
		background-color: #fff;
	}

	.content_size {
		font-size: 16px;
	}

	.bfb {
		position: absolute;
		right: -8%;
		top: 24%;
		font-size: 16px;
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

	/* 自定义输入框样式 */
	.custom-input {
		width: 100%;
		height: 70rpx;
		border: 1rpx solid #d9d9d9;
		border-radius: 8rpx;
		padding: 0 20rpx;
		display: flex;
		align-items: center;
		background-color: #ffffff;
		transition: all 0.2s;
	}

	.custom-input.disabled {
		background-color: #f5f5f5;
		color: #999;
		/* 微信小程序禁用点击 */
		pointer-events: none;
	}

	.custom-input.focused {
		border-color: #008cff;
		box-shadow: 0 0 0 2rpx rgba(0, 140, 255, 0.2);
	}

	/* 闪烁光标 */
	.cursor {
		width: 2rpx;
		height: 36rpx;
		background-color: #008cff;
		margin-left: 4rpx;
		animation: blink 1s infinite;
	}

	@keyframes blink {
		0%, 50% {
			opacity: 1;
		}
		51%, 100% {
			opacity: 0;
		}
	}

	.custom-input.has-value .input-value {
		color: #333;
	}

	.custom-input:not(.has-value):not(.disabled) .input-value {
		color: #999;
	}

	.input-value {
		font-size: 28rpx;
		color: #999;
	}

	.result-wrapper {
		margin-top: 4%;
		padding: 8% 0;
		border-top: 1rpx solid #ddd;
	}

	.result-caption {
		font-weight: 600;
		font-size: 16px;
	}

	.result {
		font-weight: 600;
		font-size: 30px;
		color: #333;
	}

	.pmt-btn-clear {
		margin-right: 10rpx;
		font-size: 18px;
	}

	.pmt-btn-cal {
		background-color: #008cff!important;
		color: #ffffff !important;
		margin-right: 10rpx;
		font-size: 18px;
	}

	.btn-hover {
		background-color: #0c6bf9 !important;
	}
</style>
