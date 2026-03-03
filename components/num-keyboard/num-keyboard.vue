<template>
	<view class="number-keyboard-mask" v-if="visible" @click="handleMaskClick">
		<view class="keyboard-container" :class="{ 'show': isAnimating }" @click.stop>
			<!-- 键盘头部 -->
			<view class="keyboard-header">
				<view class="handle-bar"></view>
				<text class="keyboard-title">{{ title }}</text>
				<text class="complete-btn" @click="handleComplete">完成</text>
			</view>

			<!-- 键盘按键区 -->
			<view class="keyboard-body">
				<!-- 第一行：负号, 1, 2, 3 -->
				<view class="key-row">
					<view class="key-btn" :class="{ 'disabled': isNegativeDisabled }" @click="handleKeyClick('-')">
						<text class="key-text">-</text>
					</view>
					<view class="key-btn" @click="handleKeyClick('1')">
						<text class="key-text">1</text>
					</view>
					<view class="key-btn" @click="handleKeyClick('2')">
						<text class="key-text">2</text>
					</view>
					<view class="key-btn" @click="handleKeyClick('3')">
						<text class="key-text">3</text>
					</view>
					<view class="key-btn key-btn-backspace" @click="handleBackspace">
						<uni-icons type="backspace" size="24" color="#666"></uni-icons>
					</view>
				</view>

				<!-- 第二行：空, 4, 5, 6, 清空 -->
				<view class="key-row">
					<view class="key-btn key-btn-empty"></view>
					<view class="key-btn" @click="handleKeyClick('4')">
						<text class="key-text">4</text>
					</view>
					<view class="key-btn" @click="handleKeyClick('5')">
						<text class="key-text">5</text>
					</view>
					<view class="key-btn" @click="handleKeyClick('6')">
						<text class="key-text">6</text>
					</view>
					<view class="key-btn key-btn-clear" @click="handleClear">
						<text class="key-text">清空</text>
					</view>
				</view>

				<!-- 第三行：空, 7, 8, 9, 完成确认 -->
				<view class="key-row">
					<view class="key-btn key-btn-empty"></view>
					<view class="key-btn" @click="handleKeyClick('7')">
						<text class="key-text">7</text>
					</view>
					<view class="key-btn" @click="handleKeyClick('8')">
						<text class="key-text">8</text>
					</view>
					<view class="key-btn" @click="handleKeyClick('9')">
						<text class="key-text">9</text>
					</view>
					<view class="key-btn key-btn-confirm" @click="handleConfirm">
						<text class="key-text">确认</text>
					</view>
				</view>

				<!-- 第四行：小数点, 0, 空格 -->
				<view class="key-row">
					<view class="key-btn" :class="{ 'disabled': isDecimalDisabled }" @click="handleKeyClick('.')">
						<text class="key-text">.</text>
					</view>
					<view class="key-btn" @click="handleKeyClick('0')">
						<text class="key-text">0</text>
					</view>
					<view class="key-btn key-btn-empty"></view>
					<view class="key-btn key-btn-empty"></view>
					<view class="key-btn key-btn-empty"></view>
				</view>
			</view>

			<!-- 兼容 iOS 安全区域 -->
			<!-- #ifdef APP-PLUS || MP-WEIXIN -->
			<view class="safe-area-bottom"></view>
			<!-- #endif -->
		</view>
	</view>
</template>

<script>
export default {
	name: 'NumberInputKeyboard',
	props: {
		/** 键盘标题 */
		title: {
			type: String,
			default: '数字键盘'
		},
		/** 键盘显示状态 */
		visible: {
			type: Boolean,
			default: false
		},
		/** 输入框值 */
		value: {
			type: String,
			default: ''
		},
		/** 是否允许负数 */
		allowNegative: {
			type: Boolean,
			default: true
		},
		/** 是否允许小数 */
		allowDecimal: {
			type: Boolean,
			default: true
		},
		/** 最大小数位数 */
		maxDecimalPlaces: {
			type: Number,
			default: 4
		},
		/** 点击遮罩是否关闭键盘 */
		closeOnMask: {
			type: Boolean,
			default: true
		},
		/** 是否显示 tabBar（需要时隐藏） */
		tabBar: {
			type: Boolean,
			default: false
		}
	},
	data() {
		return {
			/** 动画状态 */
			isAnimating: false,
			/** 当前输入值 */
			inputValue: ''
		}
	},
	computed: {
		/** 判断负号是否可用（只能在第一位且值不为空时禁用） */
		isNegativeDisabled() {
			if (!this.allowNegative) return true
			if (this.inputValue.length > 0 && this.inputValue !== '-') return true
			return false
		},
		/** 判断小数点是否可用（只能有一个小数点） */
		isDecimalDisabled() {
			if (!this.allowDecimal) return true
			return this.inputValue.includes('.')
		}
	},
	watch: {
		/** 监听外部 value 变化 */
		value(newVal) {
			this.inputValue = newVal
		},
		/** 监听键盘显示状态 */
		visible(newVal) {
			if (newVal) {
				this.inputValue = this.value
				if (this.tabBar) {
					uni.hideTabBar()
				}
				this.$nextTick(() => {
					setTimeout(() => {
						this.isAnimating = true
					}, 30)
				})
			} else {
				this.isAnimating = false
				setTimeout(() => {
					if (this.tabBar) {
						uni.showTabBar()
					}
				}, 300)
			}
		},
		/** 监听输入值变化 */
		inputValue(newVal) {
			this.$emit('input', newVal)
			this.$emit('change', newVal)
		}
	},
	methods: {
		/**
		 * 处理按键点击
		 * @param {string} key - 按键值
		 */
		handleKeyClick(key) {
			let newValue = this.inputValue

			// 处理负号
			if (key === '-') {
				if (newValue === '') {
					newValue = '-'
				}
				this.inputValue = newValue
				return
			}

			// 处理小数点
			if (key === '.') {
				if (!newValue.includes('.')) {
					newValue = newValue === '-' ? '-.' : newValue + '.'
				}
				this.inputValue = newValue
				return
			}

			// 处理数字输入
			if (newValue === '-') {
				newValue = key
			} else {
				// 检查小数位数限制
				if (newValue.includes('.')) {
					const decimalPart = newValue.split('.')[1]
					if (decimalPart && decimalPart.length >= this.maxDecimalPlaces) {
						return
					}
				}
				newValue += key
			}

			this.inputValue = newValue
		},

		/**
		 * 处理退格键
		 */
		handleBackspace() {
			if (this.inputValue.length > 0) {
				this.inputValue = this.inputValue.slice(0, -1)
			}
		},

		/**
		 * 处理清空
		 */
		handleClear() {
			this.inputValue = ''
		},

		/**
		 * 处理确认
		 */
		handleConfirm() {
			this.$emit('confirm', this.inputValue)
			this.closeKeyboard()
		},

		/**
		 * 处理完成按钮
		 */
		handleComplete() {
			this.$emit('cancel')
			this.closeKeyboard()
		},

		/**
		 * 处理遮罩点击
		 */
		handleMaskClick() {
			if (this.closeOnMask) {
				this.handleComplete()
			}
		},

		/**
		 * 关闭键盘
		 */
		closeKeyboard() {
			this.isAnimating = false
			this.$emit('update:visible', false)
		}
	}
}
</script>

<style lang="scss" scoped>
/* 遮罩层 */
.number-keyboard-mask {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.5);
	z-index: 999;
	display: flex;
	align-items: flex-end;
}

/* 键盘容器 */
.keyboard-container {
	width: 100%;
	background-color: #f5f5f5;
	border-top-left-radius: 32rpx;
	border-top-right-radius: 32rpx;
	overflow: hidden;
	transform: translateY(100%);
	transition: transform 0.3s ease-out;
}

.keyboard-container.show {
	transform: translateY(0);
}

/* 键盘头部 */
.keyboard-header {
	background-color: #ffffff;
	padding: 20rpx 32rpx;
	display: flex;
	align-items: center;
	position: relative;
	border-bottom: 1rpx solid #e5e5e5;
}

.handle-bar {
	position: absolute;
	top: 12rpx;
	left: 50%;
	transform: translateX(-50%);
	width: 80rpx;
	height: 8rpx;
	background-color: #e0e0e0;
	border-radius: 4rpx;
}

.keyboard-title {
	flex: 1;
	text-align: center;
	font-size: 32rpx;
	color: #333;
	font-weight: 500;
}

.complete-btn {
	font-size: 28rpx;
	color: #008cff;
	padding: 10rpx 20rpx;
}

/* 键盘主体 */
.keyboard-body {
	padding: 16rpx 12rpx;
	background-color: #d1d5db;
}

.key-row {
	display: flex;
	gap: 12rpx;
	margin-bottom: 12rpx;
}

.key-row:last-child {
	margin-bottom: 0;
}

/* 按键样式 */
.key-btn {
	flex: 1;
	height: 96rpx;
	background-color: #ffffff;
	border-radius: 12rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.15s ease;
	position: relative;
	overflow: hidden;
}

.key-btn:active {
	background-color: #e5e7eb;
	transform: scale(0.95);
}

.key-btn.disabled {
	opacity: 0.3;
	pointer-events: none;
}

.key-btn-empty {
	background-color: transparent;
	pointer-events: none;
}

.key-text {
	font-size: 40rpx;
	color: #333;
	font-weight: 500;
	letter-spacing: 2rpx;
}

/* 特殊按键样式 */
.key-btn-backspace {
	background-color: #ffffff;
}

.key-btn-clear {
	background-color: #e5e7eb;
}

.key-btn-clear .key-text {
	font-size: 28rpx;
	color: #666;
}

.key-btn-confirm {
	background-color: #008cff;
}

.key-btn-confirm .key-text {
	font-size: 28rpx;
	color: #ffffff;
}

.key-btn-confirm:active {
	background-color: #0078d7;
}

/* iOS 安全区域 */
.safe-area-bottom {
	/* #ifdef APP-PLUS */
	height: env(safe-area-inset-bottom);
	/* #endif */
	/* #ifdef MP-WEIXIN */
	height: constant(safe-area-inset-bottom);
	height: env(safe-area-inset-bottom);
	/* #endif */
	background-color: #f5f5f5;
}
</style>
