<script>
	export default {
		globalData: {
			inputType: 'text'
		},
		onLaunch: function() {
			console.warn('当前组件仅支持 uni_modules 目录结构 ，请升级 HBuilderX 到 3.1.0 版本以上！')
			console.log('App Launch')
			uni.getSystemInfo({
				success: e => {
					console.log(e.osName);
					this.globalData.inputType = e.osName == "ios" ? "digit" : "text";
				}
			})
		},
		onShow: function() {
			console.log('App Show')
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style lang="scss">
	@import "@/static/iconfont.css";
	// font-family: "iconfont"; /* Project id 4166063 */
	// src: url('/static/iconfont.ttf') format('truetype');
	/*每个页面公共css */
	@import '@/uni_modules/uni-scss/index.scss';
	/* #ifndef APP-NVUE */
	/* uni.css - 通用组件、模板样式库，可以当作一套ui库应用 */
	@import './common/uni.css';
	@import '@/static/customicons.css';

	/* #endif */
	.example-info {
		font-size: 14px;
		color: #333;
		padding: 10px;
	}

	/* 未选中的背景样式 */
	checkbox .wx-checkbox-input {
		border: 1rpx solid gray;
	}

	checkbox .uni-checkbox-input {
		border: 1rpx solid gray;
	}

	/* 选中后的背景样式 */
	checkbox .wx-checkbox-input.wx-checkbox-input-checked {
		background: #008cff;
	}

	checkbox .uni-checkbox-input.uni-checkbox-input-checked {
		background: #008cff;
	}

	/* 选中后的勾子样式 */
	checkbox .wx-checkbox-input.wx-checkbox-input-checked::before {
		color: #FFF;
	}

	checkbox .uni-checkbox-input.uni-checkbox-input-checked::before {
		color: #FFF;
	}

	// 单选按钮样式
	radio .wx-radio-wrapper .wx-radio-input,
	radio .uni-radio-wrapper .uni-radio-input {
		background-color: transparent;
		border: 4rpx solid gray;
		width: 40rpx;
		height: 40rpx;
	}

	// 隐藏对号
	radio .wx-radio::before,
	radio .uni-radio::before {
		display: none;
	}

	radio .wx-radio-wrapper .wx-radio-input.wx-radio-input-checked,
	radio .uni-radio-wrapper .uni-radio-input.uni-radio-input-checked {
		background-color: rgba($color: #008cff, $alpha: 0) !important;
		border: 4rpx solid #008cff;
		position: relative;

		&::before {
			display: inline-block;
			content: '';
			width: 70%;
			height: 70%;
			position: absolute;
			left: 50%;
			top: 48%;
			transform: translate(-50%, -50%);
			background-color: #008cff;
			border: none;
			border-radius: 50%;
		}
	}
</style>