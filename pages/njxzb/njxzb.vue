<template>
	<scroll-view class="table" scroll-x scroll-y bindscrolltolower="handleScrollToLower">
		<view class="sticky-box" v-bind:style="{height: tableHeight + 'px'}">
			<view class="table__head" v-bind:style="{width: tableWidth + 'px', position: 'sticky'}">
				<view class="table__head__td" v-for="(attrItem,attrIndex) in dataAttribute" :key="attrIndex">
					<text class="table__head__td__text">{{attrItem.title}}</text>
				</view>
			</view>
			<view class="table__row" v-for="(dataItem,dataIndex) in listData" :key="dataIndex"
				v-bind:style="{width: tableWidth + 'px'}">
				<view class="table__row__td" v-for="(attrItem,attrIndex) in dataAttribute" :key="attrIndex">
					<text class="table__row__text">{{dataItem[attrItem.key]}}</text>
				</view>
			</view>
		</view>
	</scroll-view>
</template>


<script>
	export default {
		data() {
			return {
				listData: [{
						a: 1,
						b: 0.99,
						c: 0.98,
						d: 0.97,
						e: 0.961,
						f: 0.952,
						g: 0.943,
						h: 0.935,
						i: 0.925,
						j: 0.917,
						k: 0.909
					},
					{
						a: 2,
						b: 1.97,
						c: 1.941,
						d: 1.913,
						e: 1.886,
						f: 1.859,
						g: 1.833,
						h: 1.808,
						i: 1.783,
						j: 1.76,
						k: 1.735
					},
					{
						a: 3,
						b: 2.94,
						c: 2.883,
						d: 2.828,
						e: 2.775,
						f: 2.723,
						g: 2.673,
						h: 2.624,
						i: 2.577,
						j: 2.531,
						k: 2.486
					},
					{
						a: 4,
						b: 3.901,
						c: 3.807,
						d: 3.717,
						e: 3.629,
						f: 3.545,
						g: 3.465,
						h: 3.387,
						i: 3.312,
						j: 3.24,
						k: 3.169
					},
					{
						a: 5,
						b: 4.853,
						c: 4.713,
						d: 4.579,
						e: 4.451,
						f: 4.329,
						g: 4.212,
						h: 4.1,
						i: 3.992,
						j: 3.89,
						k: 3.79
					},
					{
						a: "",
						b: "",
						c: "",
						d: "",
						e: "",
						f: "",
						g: "",
						h: "",
						i: "",
						j: "",
						k: ""
					},
					{
						a: 6,
						b: 5.795,
						c: 5.601,
						d: 5.417,
						e: 5.242,
						f: 5.075,
						g: 4.917,
						h: 4.767,
						i: 4.622,
						j: 4.486,
						k: 4.355
					},
					{
						a: 7,
						b: 6.728,
						c: 6.471,
						d: 6.23,
						e: 6.002,
						f: 5.786,
						g: 5.582,
						h: 5.389,
						i: 5.206,
						j: 5.033,
						k: 4.868
					},
					{
						a: 8,
						b: 7.651,
						c: 7.325,
						d: 7.019,
						e: 6.732,
						f: 6.463,
						g: 6.209,
						h: 5.971,
						i: 5.746,
						j: 5.535,
						k: 5.334
					},
					{
						a: 9,
						b: 8.566,
						c: 8.162,
						d: 7.786,
						e: 7.435,
						f: 7.107,
						g: 6.801,
						h: 6.515,
						i: 6.246,
						j: 5.995,
						k: 5.759
					},
					{
						a: 10,
						b: 9.471,
						c: 8.982,
						d: 8.53,
						e: 8.11,
						f: 7.721,
						g: 7.36,
						h: 7.024,
						i: 6.71,
						j: 6.418,
						k: 6.144
					},
					{
						a: "",
						b: "",
						c: "",
						d: "",
						e: "",
						f: "",
						g: "",
						h: "",
						i: "",
						j: "",
						k: ""
					},
					{
						a: 11,
						b: 10.367,
						c: 9.786,
						d: 9.252,
						e: 8.76,
						f: 8.306,
						g: 7.886,
						h: 7.5,
						i: 7.138,
						j: 6.805,
						k: 6.495,
					},
					{
						a: 12,
						b: 11.255,
						c: 10.575,
						d: 9.954,
						e: 9.385,
						f: 8.863,
						g: 8.383,
						h: 7.943,
						i: 7.536,
						j: 7.161,
						k: 6.813,
					},
					{
						a: 13,
						b: 12.133,
						c: 11.348,
						d: 10.634,
						e: 9.985,
						f: 9.393,
						g: 8.852,
						h: 8.358,
						i: 7.903,
						j: 7.487,
						k: 7.103,
					},
					{
						a: 14,
						b: 13.003,
						c: 12.106,
						d: 11.296,
						e: 10.563,
						f: 9.898,
						g: 9.294,
						h: 8.746,
						i: 8.244,
						j: 7.786,
						k: 7.366
					},
					{
						a: 15,
						b: 13.865,
						c: 12.849,
						d: 11.937,
						e: 11.118,
						f: 10.379,
						g: 9.712,
						h: 9.108,
						i: 8.559,
						j: 8.061,
						k: 7.606,
					},
					{
						a: 20,
						b: 18.045,
						c: 16.351,
						d: 14.877,
						e: 13.59,
						f: 12.462,
						g: 11.469,
						h: 10.594,
						i: 9.818,
						j: 9.129,
						k: 8.513
					}
				],
				dataAttribute: [{
						title: 'n/i',
						key: 'a'
					},
					{
						title: '1%',
						key: 'b'
					},
					{
						title: '2%',
						key: 'c'
					},
					{
						title: '3%',
						key: 'd'
					},
					{
						title: '4%',
						key: 'e'
					},
					{
						title: '5%',
						key: 'f'
					},
					{
						title: '6%',
						key: 'g'
					},
					{
						title: '7%',
						key: 'h'
					},
					{
						title: '8%',
						key: 'i'
					},
					{
						title: '9%',
						key: 'j'
					},
					{
						title: '10%',
						key: 'k'
					},
				],
				tableHeight: (20 + 1) * 40,
				tableWidth: 100 * 11
			}
		},
		methods: {

		}
	}
</script>

<style>
	page {
		margin-top: 1%;
		margin-left: 1%;
		font-size: 26px;
		line-height: 60px;
		color: #222;
		height: 100%;
		width: 100%;
	}

	.table {
		display: block;
		position: relative;
		overflow: scroll;
		width: 100%;
		height: 100%;
	}

	.sticky-box {}

	.table__head {
		white-space: nowrap;
		position: sticky;
		top: 0px;
		z-index: 100;
		height: 40px;
		font-size: 14px;
		line-height: 40px;
		background-color: #f8f8f8;
		white-space: nowrap;
		display: flex;
	}

	.table__head__td {
		width: 100px;
		display: flex;
		justify-content: flex-start;
		align-items: center;
		background-color: #fff;
		box-sizing: border-box;
		position: relative;
		overflow: hidden;
		white-space: nowrap;
		-o-text-overflow: ellipsis;
		text-overflow: ellipsis;
		border-right: 1px solid black;
		border-top: 1px solid black;
		border-bottom: 1px solid black;
	}

	.table__head__td:nth-child(1) {
		padding-left: 0px;
		width: 100px;
		margin-right: 0px;
		position: sticky;
		z-index: 101;
		left: 0px;
		border-left: 1px solid black;
	}

	.table__head__td__text {
		display: inline;
		padding-left: 40%;
	}

	.table__row {
		position: relative;
		height: 41px;
		white-space: nowrap;
		display: flex;
		justify-content: flex-start;
		align-items: center;
	}

	.table__row__td {
		overflow: scroll;
		width: 100px;
		display: inline-block;
		background-color: #fff;
		box-sizing: border-box;
		font-size: 14px;
		line-height: 40px;
		position: relative;
		overflow: hidden;
		white-space: nowrap;
		-o-text-overflow: ellipsis;
		text-overflow: ellipsis;
		border-right: 1px solid black;
		border-bottom: 1px solid black;
	}

	.table__row__td:nth-child(1) {
		margin-right: 0px;
		padding-left: 0px;
		width: 100px;
		position: sticky;
		z-index: 10;
		left: 0;
		border-left: 1px solid black;
	}

	.table__row__text {
		display: inline;
		padding-left: 40%;
	}
</style>