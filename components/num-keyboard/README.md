# 数字输入键盘组件使用说明

## 组件介绍
`number-input-keyboard` 是一个支持数字、小数点和负号的自定义数字键盘组件。

## 功能特性
- ✅ 支持数字 0-9 输入
- ✅ 支持小数点输入（可选）
- ✅ 支持负号输入（可选）
- ✅ 负号只能在首位
- ✅ 小数点只能输入一次
- ✅ 支持最大小数位数限制
- ✅ 支持退格、清空操作
- ✅ 平滑的动画效果
- ✅ 多端兼容（H5、小程序、App）
- ✅ 支持底部安全区域适配

## 基础用法

```vue
<template>
	<view>
		<!-- 只读输入框，点击时打开键盘 -->
		<view class="input-wrapper" @click="showKeyboard('rate')">
			<text>利率</text>
			<text class="input-value">{{ rate || '请输入' }}</text>
		</view>

		<!-- 数字键盘组件 -->
		<number-input-keyboard
			:visible="keyboardVisible"
			v-model="currentValue"
			:allow-negative="allowNegative"
			:allow-decimal="allowDecimal"
			:max-decimal-places="maxDecimalPlaces"
			@confirm="handleConfirm"
			@cancel="handleCancel"
		/>
	</view>
</template>

<script setup>
import { ref } from 'vue'
import NumberInputKeyboard from '@/components/number-input-keyboard/number-input-keyboard.vue'

// 当前选中的字段名
const currentField = ref('')

// 输入值
const rate = ref('')
const nper = ref('')
const pv = ref('')
const fv = ref('')
const pmt = ref('')

// 当前键盘显示的值
const currentValue = ref('')

// 键盘配置
const keyboardVisible = ref(false)
const allowNegative = ref(true)
const allowDecimal = ref(true)
const maxDecimalPlaces = ref(4)

/**
 * 显示键盘
 * @param {string} field - 字段名
 */
const showKeyboard = (field) => {
	currentField.value = field

	// 根据字段设置键盘配置
	switch (field) {
		case 'rate':      // 利率：不能为负，支持小数
			allowNegative.value = false
			allowDecimal.value = true
			maxDecimalPlaces.value = 4
			break
		case 'nper':      // 期数：不能为负，不能有小数
			allowNegative.value = false
			allowDecimal.value = false
			break
		case 'pv':        // 现值：可以为负，支持小数
			allowNegative.value = true
			allowDecimal.value = true
			maxDecimalPlaces.value = 4
			break
		case 'fv':        // 终值：可以为负，支持小数
			allowNegative.value = true
			allowDecimal.value = true
			maxDecimalPlaces.value = 4
			break
		case 'pmt':       // 每期付款：可以为负，支持小数
			allowNegative.value = true
			allowDecimal.value = true
			maxDecimalPlaces.value = 4
			break
	}

	// 设置当前值
	currentValue.value = eval(field + '.value')

	// 打开键盘
	keyboardVisible.value = true
}

/**
 * 确认输入
 */
const handleConfirm = (value) => {
	// 将值赋给对应字段
	eval(currentField.value + '.value = value')
	// 关闭键盘
	keyboardVisible.value = false
}

/**
 * 取消输入
 */
const handleCancel = () => {
	keyboardVisible.value = false
}
</script>

<style scoped>
.input-wrapper {
	padding: 20rpx;
	border: 1rpx solid #e5e5e5;
	border-radius: 8rpx;
	margin-bottom: 20rpx;
}

.input-value {
	color: #999;
}
</style>
```

## Props 参数

| 参数 | 说明 | 类型 | 默认值 |
|------|------|------|--------|
| visible | 键盘显示状态 | Boolean | false |
| modelValue | 输入框值（v-model） | String | '' |
| title | 键盘标题 | String | '数字键盘' |
| allowNegative | 是否允许负数 | Boolean | true |
| allowDecimal | 是否允许小数 | Boolean | true |
| maxDecimalPlaces | 最大小数位数 | Number | 4 |
| closeOnMask | 点击遮罩是否关闭 | Boolean | true |
| tabBar | 是否需要处理 tabBar | Boolean | false |

## Events 事件

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| update:visible | 键盘显示状态变化 | (value: boolean) |
| update:modelValue | 输入值变化 | (value: string) |
| confirm | 确认按钮点击 | (value: string) |
| cancel | 取消/完成按钮点击 | - |
| change | 值变化 | (value: string) |

## Methods 方法（通过 ref 调用）

| 方法名 | 说明 | 参数 |
|--------|------|------|
| open() | 打开键盘 | - |
| close() | 关闭键盘 | - |
| clear() | 清空输入 | - |
| getValue() | 获取当前值 | - |

## 注意事项

1. **负号限制**：负号只能出现在字符串开头，且已存在内容时不能再次添加
2. **小数点限制**：小数点在整个字符串中只能出现一次
3. **小数位数限制**：通过 `maxDecimalPlaces` 控制小数点后的位数
4. **H5 兼容**：在 H5 端，原生 input 会弹出系统键盘，建议使用 readonly 属性配合自定义键盘使用
5. **小程序兼容**：小程序端已添加条件编译处理底部安全区域
