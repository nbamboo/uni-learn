<template>
	<view>
		<view class="uni-margin-wrap">
			<swiper class="swiper" circular="true" :indicator-dots="indicatorDots" :autoplay="autoplay" 
			:interval="interval" :duration="duration">
				<swiper-item>
					<view class="swiper-item uni-bg-red">A</view>
				</swiper-item>
				<swiper-item>
					<view class="swiper-item uni-bg-green">B</view>
				</swiper-item>
				<swiper-item>
					<view class="swiper-item uni-bg-blue">C</view>
				</swiper-item>
			</swiper>
			
			<view class="swiper-list">
				<view class="uni-list-cell uni-list-cell-pd">
					<view class="uni-list-cell-db">指示点</view>
					<switch checked="indicatorDots" @change="changeIndicatorDots"></switch>
				</view>
				<view class="uni-list-cell uni-list-cell-pd">
					<view class="uni-list-cell-db">循环播放</view>
					<switch checked="autoplay" @change="changeAutoplay"></switch>
				</view>
			</view>
			
			<view class="uni-padding-wrap">
				<view class="uni-common-mt">
					<text>幻灯片切换时长(ms)</text>
					<text class="info">{{duration}}</text>
				</view>
				<slider @change="changeDuration" :value="duration" min="1" max="2000"></slider>
				<view class="uni-common-mt">
					<text>自动播放间隔时长(ms)</text>
					<text class="info">{{interval}}</text>
				</view>
				<slider @change="changeInterval" :value="interval" min="100" max="10000"></slider>
			</view>
		</view>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				indicatorDots: true,
				autoplay: true,
				duration: 500,
				interval: 2000
			}
		},
		methods: {
			changeIndicatorDots: function(e) {
				this.indicatorDots = !this.indicatorDots
			},
			
			changeAutoplay: function(e) {
				this.autoplay = !this.autoplay
			},
			
			changeDuration: function(e) {
				this.duration = e.detail.value
			},
			
			changeInterval: function(e) {
				this.interval = e.detail.value
			}
		}
	}
</script>

<style>
	.uni-margin-wrap {
		width:690rpx;
		width: 100%;;
	}
	.swiper {
		height: 300rpx;
	}
	.swiper-item {
		display: block;
		height: 300rpx;
		line-height: 300rpx;
		text-align: center;
	}

	.swiper-list {
		margin-top: 40rpx;
		margin-bottom: 0;
	}

	.uni-common-mt{
		margin-top:60rpx;
		position:relative;
	}

	.info {
		position: absolute;
		right:20rpx;
	}

    .uni-padding-wrap {
        width:550rpx;
        padding:0 100rpx;
    }
</style>
