<template>
	<view class="number-keyboard-mask" v-if="visible" @click="handleMaskClick">
		<view class="keyboard-container" :class="{ 'show': isAnimating }" @click.stop>
			<!-- 键盘按键区 -->
			<view class="keyboard-body">
				<!-- 左侧区域：3列 -->
				<view class="keyboard-left">
					<!-- 第一行：1, 2, 3 -->
					<view class="key-row">
						<view class="key-btn" @click="handleKeyClick('1')">
							<text class="key-text">1</text>
						</view>
						<view class="key-btn" @click="handleKeyClick('2')">
							<text class="key-text">2</text>
						</view>
						<view class="key-btn" @click="handleKeyClick('3')">
							<text class="key-text">3</text>
						</view>
					</view>

					<!-- 第二行：4, 5, 6 -->
					<view class="key-row">
						<view class="key-btn" @click="handleKeyClick('4')">
							<text class="key-text">4</text>
						</view>
						<view class="key-btn" @click="handleKeyClick('5')">
							<text class="key-text">5</text>
						</view>
						<view class="key-btn" @click="handleKeyClick('6')">
							<text class="key-text">6</text>
						</view>
					</view>

					<!-- 第三行：7, 8, 9 -->
					<view class="key-row">
						<view class="key-btn" @click="handleKeyClick('7')">
							<text class="key-text">7</text>
						</view>
						<view class="key-btn" @click="handleKeyClick('8')">
							<text class="key-text">8</text>
						</view>
						<view class="key-btn" @click="handleKeyClick('9')">
							<text class="key-text">9</text>
						</view>
					</view>

					<!-- 第四行：负号, 0, 小数点 -->
					<view class="key-row">
						<view class="key-btn" :class="{ 'disabled': isNegativeDisabled }" @click="handleKeyClick('-')">
							<text class="key-text">-</text>
						</view>
						<view class="key-btn" @click="handleKeyClick('0')">
							<text class="key-text">0</text>
						</view>
						<view class="key-btn" :class="{ 'disabled': isDecimalDisabled }" @click="handleKeyClick('.')">
							<text class="key-text">.</text>
						</view>
					</view>
				</view>

				<!-- 右侧区域：1列（功能键）-->
				<view class="keyboard-right">
					<view class="key-btn key-btn-backspace" @click="handleBackspace">
						<image class="backspace-icon-svg" src="data:image/svg+xml;base64,PHN2ZyBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEzNTUgMTAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCI+PHBhdGggZD0iTTQxMC4xNjYgMTIxLjQ2N2g3NzUuMzIzdjc4MS4wNjZINDEwLjE2NkwxNTkuOTk1IDUxMmwyNTAuMTctMzkwLjUzM3ptNTUzLjM2MiAxOTQuNzM4Yy04LjcwNy0xMS42OTMtMjguOTkxLTExLjY5My0zNy42OTggMEw3NjkuMTU3IDQ3NC4wMjZsLTE1Ni42MjYtMTU3LjgyYy04LjcwNy0xMS42OTQtMjYuMTItOC43NzYtMzcuNzIxIDAtMTEuNjAxIDguNzc1LTExLjYwMSAyNi4zMDMgMCAzNy45OTZMNzMxLjQ4MyA1MTIgNTc0LjgxIDY2OS44MjFjLTExLjYwMSA4Ljc1My0xMS42MDEgMjYuMjggMCAzNy45NzQgOC43MyAxMS42OTMgMjYuMTIgMTEuNjkzIDM3LjcyIDBsMTU2LjY1LTE1Ny44MjEgMTU2LjY1IDE1Ny44MmM4LjcwNyAxMS42OTQgMjYuMDk3IDExLjY5NCAzNy42OTggMCAxMS42MDEtOC43NzUgMTEuNjAxLTI2LjMwMyAwLTM3Ljk5Nkw4MDYuOTAxIDUxMmwxNTYuNjczLTE1Ny44MjFjMTEuNTc4LTguNzUzIDExLjU3OC0yNi4yOCAwLTM3Ljk3NHoiIGRhdGEtc3BtLWFuY2hvci1pZD0iYTMxM3guc2VhcmNoX2luZGV4LjAuaTAuMTU2NjNhODFoUEZCc0EiIGNsYXNzPSJzZWxlY3RlZCIvPjwvc3ZnPg==" mode="aspectFill"></image>
					</view>
					<view class="key-btn key-btn-clear" @click="handleClear">
						<text class="key-text">清空</text>
					</view>
					<!-- 确认按钮 - 占据两行高度 -->
					<view class="key-btn key-btn-confirm" @click="handleConfirm">
						<text class="confirm-text">确认</text>
					</view>
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
		/** 判断负号是否可用 */
		isNegativeDisabled() {
			if (!this.allowNegative) return true
			if (this.inputValue.length > 0 && this.inputValue !== '-') return true
			return false
		},
		/** 判断小数点是否可用 */
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
				this.$nextTick(() => {
					setTimeout(() => {
						this.isAnimating = true
					}, 30)
				})
			} else {
				this.isAnimating = false
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
				newValue = '-' + key
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
		 * 处理遮罩点击
		 */
		handleMaskClick() {
			if (this.closeOnMask) {
				this.$emit('cancel')
				this.closeKeyboard()
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
	z-index: 999;
	display: flex;
	align-items: flex-end;
}

/* 键盘容器 */
.keyboard-container {
	width: 100%;
	background-color: #d1d5db;
	border-top-left-radius: 32rpx;
	border-top-right-radius: 32rpx;
	overflow: hidden;
	transform: translateY(100%);
	transition: transform 0.3s ease-out;
	padding: 16rpx 12rpx;
	box-sizing: border-box;
}

.keyboard-container.show {
	transform: translateY(0);
}

/* 键盘主体 - 左右布局 */
.keyboard-body {
	display: flex;
	gap: 12rpx;
}

/* 左侧区域 - 3列 */
.keyboard-left {
	flex: 3;
	display: flex;
	flex-direction: column;
	gap: 12rpx;
}

/* 右侧区域 - 1列 */
.keyboard-right {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 12rpx;
}

/* 行样式 */
.key-row {
	display: flex;
	gap: 12rpx;
}

/* 按键样式 */
.key-btn {
	flex: 1;
	height: 110rpx;
	background-color: #ffffff;
	border-radius: 12rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.15s ease;
}

.key-btn:active {
	background-color: #e5e7eb;
	transform: scale(0.95);
}

.key-btn.disabled {
	opacity: 0.3;
	pointer-events: none;
}

.key-text {
	font-size: 40rpx;
	color: #333;
	font-weight: 500;
}

/* 退格键SVG图标 */
.backspace-icon-svg {
	width: 64rpx;
	height: 64rpx;
}

/* 清空键 */
.key-btn-clear {
	background-color: #e5e7eb;
}

.key-btn-clear .key-text {
	font-size: 28rpx;
	color: #666;
}

/* 确认按钮 - 占据两行高度 */
.key-btn-confirm {
	background-color: #008cff;
	flex: 2;
	min-height: 232rpx; /* 110rpx * 2 + 12rpx gap */
}

.key-btn-confirm .confirm-text {
	font-size: 32rpx;
	color: #ffffff;
	font-weight: 500;
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
