<template>
	<view class='popup-box'>
		<!-- 弹出层 -->
		<view :catchtouchmove="isShow" :class="['scroll-popup', (animation && !typeData) ? 'scroll-animation' : '']"
			:style="scrollPopup">
			<!-- 自定义宽度，自定义背景色，自定义圆角 -->
			<view class="scroll-box" :style="scrollBox">
				<slot></slot>
			</view>
		</view>
		<!-- 遮罩层 -->
		<view v-show="isShow" :catchtouchmove="isShow" @click.stop="isMask ? close() : ''" class="scroll-mask">
			<image class="closeBtn" :src="closeImg"></image>
		</view>
	</view>
</template>

<script>
	export default {
		props: {
			//是否开启动画
			animation: {
				type: Boolean,
				default: true,
			},
			//是否点击阴影关闭
			isMask: {
				type: Boolean,
				default: true,
			},
			//是否开启安全条
			safeArea: {
				type: Boolean,
				default: true,
			},
			//圆角，单位rpx
			radius: {
				type: String,
				default: '50rpx',
			},
			//弹出方向
			type: {
				type: String,
				default: 'bottom',
			},
			//宽
			width: {
				type: String,
				default: 'auto',
			},
			//高
			height: {
				type: String,
				default: 'auto',
			},
			//背景色
			bgColor: {
				type: String,
				default: '#FFFFFF',
			},
			//是否开启自定义导航栏
			isBar:{
				type: Boolean,
				default: false,
			},
			//距离顶部的边距
			top: {
				type: String,
				default: () => {
					const statusBarHeight = uni.getSystemInfoSync().statusBarHeight;
					// #ifndef H5 || APP-PLUS
					const custom = uni.getMenuButtonBoundingClientRect();
					console.log(JSON.stringify(custom))
					if (custom) {
					    const navigationBarHeight = custom.top - statusBarHeight;
					    const navHeight = navigationBarHeight * 2 + custom.bottom;
					    return navHeight + 'px';
					}
					return statusBarHeight + 44 + 'px';
					// #endif
					// #ifdef H5 || APP-PLUS
					return statusBarHeight + 'px'
					// #endif
				},
			}
		},
		data() {
			return {
				isShow: false,
				typeData: '',
				closeImg: require('../../static/image/close.png'),
			};
		},
		// 计算属性
		computed: {
			scrollBox() {
				if ((this.typeData || this.type) == 'center') {
					return `
				
				`;
				}

				return `${[this.typeData || this.type]} : 0px !important;
				${[['top', 'bottom'].includes(this.typeData || this.type) ? 'left' : 'top']} : 0;
				`;
			},
			safeBottom(){
				return this.safeArea && ['left','right', 'bottom'].includes(this.typeData || this.type) ? 'env(safe-area-inset-bottom)' : '0px'
			},
			scrollPopup() {
				//获取页面标签高度
				if ((this.typeData || this.type) == 'center') {
					return `
				top:50%;
				left:50%;
				opacity: ${this.isShow ? '1' : '0'};
				transform: ${this.isShow ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0)'};
				width: ${this.isShow ? this.width : 'auto' } ;
				height: ${this.isShow ? this.height : 'auto' };
				max-width:100%;
				max-height:100%;
				border-radius: ${this.getRadius()};
				background:${this.bgColor};
				`;
				}
				
				return `${[this.typeData || this.type]} : ${this.isShow ? '0px !important' : '-100vh'};
				max-width:100%;
				max-height:100%;
				width: ${['top', 'bottom'].includes(this.typeData || this.type) ? '100%' : this.width}; 
				height: ${['top', 'bottom'].includes(this.typeData || this.type) ? this.height : this.isBar ? `calc(100% - ${this.top} - ${this.safeBottom})` : `calc(100% - ${this.safeBottom})`};
				${[['top', 'bottom'].includes(this.typeData || this.type) ? 'left' : 'top']} : 0;
				padding-bottom: ${this.safeBottom};
				background:${this.bgColor};
				border-radius: ${this.getRadius()};
				opacity: 1;
				margin-top:${this.isBar ? this.top : 0};
				`;
			},
		},
		mounted() {
			// #ifdef H5
			document.querySelector('.scroll-popup').addEventListener('touchmove', function(event) {
				event.preventDefault();
			}, {
				passive: false
			});

			document.querySelector('.scroll-mask').addEventListener('touchmove', function(event) {
				event.preventDefault();
			}, {
				passive: false
			});
			// #endif
		},

		methods: {
			getRadius() {
				var status = this.typeData || this.type;
				if (status == 'left') {
					return `0 ${this.radius} ${this.radius} 0`;
				}
				if (status == 'right') {
					return `${this.radius} 0 0 ${this.radius}`;
				}
				if (status == 'top') {
					return `0 0  ${this.radius} ${this.radius}`;
				}
				if (status == 'bottom') {
					return `${this.radius} ${this.radius} 0 0 `;
				}
				if (status == 'center') {
					return `${this.radius}`;
				}
			},
			open(type) {
				if (type && this.animation) console.warn('如果您传入了参数，则不会开启动画')
				this.typeData = type;
				this.isShow = true;
				this.$emit('open');
			},
			close() {
				this.isShow = false;
				this.$emit('close');
			},
		},
	};
</script>

<style lang="scss" scoped>
	.closeBtn {
		width: 100rpx;
		height: 100rpx;
	}

	.scroll-animation {
		transition: all 0.15s ease 0s;
		opacity: 0;
	}

	/* 遮罩层样式 */
	.scroll-mask {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 998;
		overflow: hidden;
	}

	.scroll-popup {
		position: fixed;
		z-index: 999;
		overflow: auto;
	}

	.scroll-box {
		position: relative;
		overflow: auto;
	}

	.popup-box {
		width: 100%;
		height: 100%;
	}
</style>