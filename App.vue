<script>
	export default {
		onLaunch: function() {
			console.warn('当前组件仅支持 uni_modules 目录结构 ，请升级 HBuilderX 到 3.1.0 版本以上！')
			console.log('App Launch')
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
	/*每个页面公共css */
	@import '@/uni_modules/uni-scss/index.scss';
	/* #ifndef APP-NVUE */
	/* uni.css - 通用组件、模板样式库，可以当作一套ui库应用 */
	@import './common/uni.css';
	@import '@/static/customicons.css';

	// 设置整个项目的背景色
	page {
		background-color: #f5f5f5;
	}

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
		background: blue;
	}
	
	checkbox .uni-checkbox-input.uni-checkbox-input-checked {
		background: blue;
	}

	/* 选中后的勾子样式 */
	checkbox .wx-checkbox-input.wx-checkbox-input-checked::before {
		color: #FFF;
	}
	
	checkbox .uni-checkbox-input.uni-checkbox-input-checked::before {
		color: #FFF;
	}
</style>