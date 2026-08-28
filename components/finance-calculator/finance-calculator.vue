<template>
	<view class="finance-calculator" :class="{ 'finance-calculator--embedded': embedded }">
		<view class="example">
			<!-- 基础表单校验 -->
			<uni-forms ref="valiForm" :rules="rules" :model="valiFormData" labelWidth="0">
				<!-- 利率输入项 -->
				<uni-forms-item name="rate">
					<view class="form-row">
						<view class="field-label field-label--plain">
							<text class="content_size">利率</text>
						</view>
						<view class="field-control">
							<view class="custom-input" :class="{ 'has-value': valiFormData.rate, 'disabled': !inputItems.rate.enabled, 'focused': currentField === 'rate' && keyboardVisible }"
								@click="openKeyboard('rate')">
								<text class="input-value" v-if="inputItems.rate.enabled">{{ keyboardValue && currentField === 'rate' ? keyboardValue : valiFormData.rate }}</text>
								<text class="input-value" v-else>{{ valiFormData.rate }}</text>
								<view v-if="currentField === 'rate' && keyboardVisible" class="cursor"></view>
								<uni-icons class="input-icon" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
							</view>
							<text class="input-suffix">%</text>
						</view>
					</view>
				</uni-forms-item>

				<!-- 期数输入项 -->
				<uni-forms-item name="nper">
					<view class="form-row">
						<view class="field-label">
							<checkbox-group class="field-checkbox-group" @change="checkboxChange($event, 'nper')">
								<label class="checkbox-label content_size">
									<view class="field-checkbox-wrap">
										<checkbox class="field-checkbox" value="nper" :checked="parmitems[0].checked"
											:disabled="parmitems[0].checkboxDisabledValue" />
									</view>
									<text>期数</text>
								</label>
							</checkbox-group>
						</view>
						<view class="field-control">
							<view class="custom-input" :class="{ 'has-value': valiFormData.nper, 'disabled': !inputItems.nper.enabled, 'focused': currentField === 'nper' && keyboardVisible }"
								@click="openKeyboard('nper')">
								<text class="input-value" v-if="inputItems.nper.enabled">{{ keyboardValue && currentField === 'nper' ? keyboardValue : valiFormData.nper }}</text>
								<text class="input-value" v-else>{{ valiFormData.nper }}</text>
								<view v-if="currentField === 'nper' && keyboardVisible" class="cursor"></view>
								<uni-icons class="input-icon" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
							</view>
						</view>
					</view>
				</uni-forms-item>

				<!-- 现值输入项 -->
				<uni-forms-item name="pv">
					<view class="form-row">
						<view class="field-label">
							<checkbox-group class="field-checkbox-group" @change="checkboxChange($event, 'pv')">
								<label class="checkbox-label content_size">
									<view class="field-checkbox-wrap">
										<checkbox class="field-checkbox" value="pv" :checked="parmitems[1].checked"
											:disabled="parmitems[1].checkboxDisabledValue" />
									</view>
									<text>现值</text>
								</label>
							</checkbox-group>
						</view>
						<view class="field-control">
							<view class="custom-input" :class="{ 'has-value': valiFormData.pv, 'disabled': !inputItems.pv.enabled, 'focused': currentField === 'pv' && keyboardVisible }"
								@click="openKeyboard('pv')">
								<text class="input-value" v-if="inputItems.pv.enabled">{{ keyboardValue && currentField === 'pv' ? keyboardValue : valiFormData.pv }}</text>
								<text class="input-value" v-else>{{ valiFormData.pv }}</text>
								<view v-if="currentField === 'pv' && keyboardVisible" class="cursor"></view>
								<uni-icons class="input-icon" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
							</view>
						</view>
					</view>
				</uni-forms-item>

				<!-- 终值输入项 -->
				<uni-forms-item name="fv">
					<view class="form-row">
						<view class="field-label">
							<checkbox-group class="field-checkbox-group" @change="checkboxChange($event, 'fv')">
								<label class="checkbox-label content_size">
									<view class="field-checkbox-wrap">
										<checkbox class="field-checkbox" value="fv" :checked="parmitems[2].checked"
											:disabled="parmitems[2].checkboxDisabledValue" />
									</view>
									<text>终值</text>
								</label>
							</checkbox-group>
						</view>
						<view class="field-control">
							<view class="custom-input" :class="{ 'has-value': valiFormData.fv, 'disabled': !inputItems.fv.enabled, 'focused': currentField === 'fv' && keyboardVisible }"
								@click="openKeyboard('fv')">
								<text class="input-value" v-if="inputItems.fv.enabled">{{ keyboardValue && currentField === 'fv' ? keyboardValue : valiFormData.fv }}</text>
								<text class="input-value" v-else>{{ valiFormData.fv }}</text>
								<view v-if="currentField === 'fv' && keyboardVisible" class="cursor"></view>
								<uni-icons class="input-icon" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
							</view>
						</view>
					</view>
				</uni-forms-item>

				<!-- 每期付款额输入项 -->
				<uni-forms-item name="pmt">
					<view class="form-row">
						<view class="field-label">
							<checkbox-group class="field-checkbox-group" @change="checkboxChange($event, 'pmt')">
								<label class="checkbox-label content_size">
									<view class="field-checkbox-wrap">
										<checkbox class="field-checkbox" value="pmt" :checked="parmitems[3].checked"
											:disabled="parmitems[3].checkboxDisabledValue" />
									</view>
									<text>每期付款额</text>
								</label>
							</checkbox-group>
						</view>
						<view class="field-control">
							<view class="custom-input" :class="{ 'has-value': valiFormData.pmt, 'disabled': !inputItems.pmt.enabled, 'focused': currentField === 'pmt' && keyboardVisible }"
								@click="openKeyboard('pmt')">
								<text class="input-value" v-if="inputItems.pmt.enabled">{{ keyboardValue && currentField === 'pmt' ? keyboardValue : valiFormData.pmt }}</text>
								<text class="input-value" v-else>{{ valiFormData.pmt }}</text>
								<view v-if="currentField === 'pmt' && keyboardVisible" class="cursor"></view>
								<uni-icons class="input-icon" custom-prefix="iconfont" type="icon-icon-" size="20"></uni-icons>
							</view>
						</view>
					</view>
				</uni-forms-item>

				<!-- 期初期末单选 -->
				<uni-forms-item>
					<view class="radio-row">
						<radio-group class="radio-options" @change="radioChange">
							<label class="radio-option" v-for="(item, index) in items" :key="item.value">
								<view class="field-radio-wrap">
									<radio class="field-radio" :value="item.value" :checked="index === current" />
								</view>
								<view class="content_size">{{item.name}}</view>
							</label>
						</radio-group>
					</view>
				</uni-forms-item>
			</uni-forms>

			<!-- 计算结果 -->
			<view class="result-wrapper">
				<text class="result-caption">计算结果{{' '}}={{' '}} </text>
				<text class="result">{{result}}</text>
			</view>

			<!-- 操作按钮 -->
			<view class="calculator-actions">
				<button type="default" size="mini" class="pmt-btn-clear" @click="reset()">清空</button>
				<button type="default" size="mini" class="pmt-btn-cal" hover-class="btn-hover"
					@click="submit('valiForm')">计算</button>
			</view>
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
		name: 'FinanceCalculator',
		components: {
			NumberInputKeyboard
		},
		props: {
			embedded: {
				type: Boolean,
				default: false
			},
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
			dismissKeyboard() {
				this.keyboardVisible = false
			},
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
			checkboxChange: function(e, fieldName) {
				const index = this.parmitems.findIndex(item => item.value === fieldName)
				if (index < 0) return

				const item = this.parmitems[index]
				const isChecked = e.detail.value.indexOf(fieldName) > -1
				const wasChecked = item.checked

				this.$set(this.parmitems[index], 'checked', isChecked)
				this.$set(this.parmitems[index], 'inputDisabledValue', !isChecked)
				this.$set(this.inputItems[fieldName], 'enabled', isChecked)

				if (wasChecked && !isChecked) {
					this.$set(this.valiFormData, fieldName, '')
					if (this.currentField === fieldName) {
						this.keyboardValue = ''
					}
				}

				const chooseNumber = this.parmitems.filter(parm => parm.checked).length
				this.parmitems.forEach((parm, parmIndex) => {
					this.$set(this.parmitems[parmIndex], 'checkboxDisabledValue', !parm.checked && chooseNumber === 3)
				})
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
		watch: {
			dataContent(newVal, oldVal) {
				if (newVal !== oldVal) {
					this.handleChange()
				}
			},
			keyboardVisible(visible) {
				this.$emit('keyboard-change', visible)
			}
		},
		beforeDestroy() {
			if (this.keyboardVisible) {
				this.$emit('keyboard-change', false)
			}
		}
	}
</script>

<style scoped>
	.example {
		padding: 8%;
		background-color: #fff;
	}

	.finance-calculator--embedded .example {
		padding: 48rpx 48rpx 36rpx;
	}

	.content_size {
		font-size: 16px;
	}

	.form-row {
		display: flex;
		align-items: center;
		width: 100%;
	}

	.field-label {
		display: flex;
		flex: 0 0 32%;
		align-items: center;
		min-width: 0;
		min-height: 70rpx;
		padding-left: 12rpx;
		box-sizing: border-box;
	}

	.checkbox-label,
	.radio-option,
	.radio-options {
		display: flex;
		align-items: center;
	}

	.checkbox-label {
		position: relative;
		width: 100%;
		min-width: 0;
		padding-left: 56rpx;
		box-sizing: border-box;
		white-space: nowrap;
	}

	.field-label--plain {
		padding-left: 68rpx;
	}

	.field-checkbox-group {
		width: 100%;
	}

	.field-checkbox-wrap {
		position: absolute;
		top: 50%;
		left: 12rpx;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		width: 48rpx;
		height: 70rpx;
		transform: translateY(-50%);
	}

	.field-checkbox {
		transform: scale(0.5);
		transform-origin: left center;
	}

	.field-control {
		display: flex;
		flex: 1;
		align-items: center;
		min-width: 0;
		gap: 14rpx;
	}

	.radio-row {
		width: 100%;
	}

	.radio-options {
		width: 100%;
	}

	.radio-option:first-child {
		flex: 0 0 32%;
		padding-left: 24rpx;
		box-sizing: border-box;
	}

	.radio-option:last-child {
		flex: 1;
		min-width: 0;
	}

	.field-radio-wrap {
		display: flex;
		flex: 0 0 48rpx;
		align-items: center;
		justify-content: flex-start;
		width: 48rpx;
		height: 70rpx;
	}

	.field-radio {
		transform: scale(0.5);
		transform-origin: left center;
	}

	@media screen and (max-width: 599px) {
		.field-label,
		.radio-option:first-child {
			flex-basis: 140px;
		}
	}

	/* 自定义输入框样式 */
	.custom-input {
		position: relative;
		width: calc(100% - 42rpx);
		height: 70rpx;
		border: 1rpx solid #d9d9d9;
		border-radius: 8rpx;
		padding: 0 20rpx;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		background-color: #ffffff;
		transition: all 0.2s;
	}

	.field-control .custom-input {
		flex: 0 0 calc(100% - 42rpx);
		min-width: 0;
	}

	.input-icon {
		flex: 0 0 auto;
		margin-left: auto;
	}

	.input-suffix {
		flex: 0 0 auto;
		min-width: 28rpx;
		font-size: 16px;
		color: #24272c;
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
		min-width: 0;
		overflow: hidden;
		font-size: 16px;
		color: #999;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		font-size: 24px;
		color: #333;
	}

	.calculator-actions {
		text-align: right;
	}

	.pmt-btn-clear {
		margin-right: 10rpx;
		font-size: 16px;
	}

	.pmt-btn-cal {
		background-color: #008cff!important;
		color: #ffffff !important;
		margin-right: 10rpx;
		font-size: 16px;
	}

	.btn-hover {
		background-color: #0c6bf9 !important;
	}
</style>
