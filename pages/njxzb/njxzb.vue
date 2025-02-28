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
						b: 0.990,
						c: 0.980,
						d: 0.971,
						e: 0.962,
						f: 0.952,
						g: 0.943,
						h: 0.935,
						i: 0.926,
						j: 0.917,
						k: 0.909
					},
					{
						a: 2,
						b: 1.970,
						c: 1.943,
						d: 1.913,
						e: 1.886,
						f: 1.859,
						g: 1.833,
						h: 1.808,
						i: 1.783,
						j: 1.760,
						k: 1.736
					},
					{
						a: 3,
						b: 2.941,
						c: 2.884,
						d: 2.829,
						e: 2.775,
						f: 2.723,
						g: 2.673,
						h: 2.624,
						i: 2.577,
						j: 2.531,
						k: 2.487
					},
					{
						a: 4,
						b: 3.902,
						c: 3.807,
						d: 3.717,
						e: 3.630,
						f: 3.546,
						g: 3.465,
						h: 3.387,
						i: 3.312,
						j: 3.240,
						k: 3.170
					},
					{
						a: 5,
						b: 4.853,
						c: 4.713,
						d: 4.580,
						e: 4.452,
						f: 4.329,
						g: 4.212,
						h: 4.100,
						i: 3.993,
						j: 3.890,
						k: 3.791
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
						f: 5.076,
						g: 4.917,
						h: 4.767,
						i: 4.623,
						j: 4.486,
						k: 4.355
					},
					{
						a: 7,
						b: 6.728,
						c: 6.472,
						d: 6.230,
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
						b: 7.652,
						c: 7.325,
						d: 7.020,
						e: 6.733,
						f: 6.463,
						g: 6.210,
						h: 5.971,
						i: 5.747,
						j: 5.535,
						k: 5.335
					},
					{
						a: 9,
						b: 8.566,
						c: 8.162,
						d: 7.786,
						e: 7.435,
						f: 7.108,
						g: 6.802,
						h: 6.515,
						i: 6.247,
						j: 5.995,
						k: 5.759
					},
					{
						a: 10,
						b: 9.471,
						c: 8.983,
						d: 8.530,
						e: 8.110,
						f: 7.722,
						g: 7.360,
						h: 7.024,
						i: 6.710,
						j: 6.418,
						k: 6.145
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
						b: 10.368,
						c: 9.787,
						d: 9.253,
						e: 8.760,
						f: 8.306,
						g: 7.887,
						h: 7.499,
						i: 7.139,
						j: 6.805,
						k: 6.495
					},
					{
						a: 12,
						b: 11.255,
						c: 10.575,
						d: 9.954,
						e: 9.385,
						f: 8.863,
						g: 8.384,
						h: 7.943,
						i: 7.536,
						j: 7.161,
						k: 6.814
					},
					{
						a: 13,
						b: 12.134,
						c: 11.348,
						d: 10.635,
						e: 9.986,
						f: 9.394,
						g: 8.853,
						h: 8.358,
						i: 7.904,
						j: 7.487,
						k: 7.103
					},
					{
						a: 14,
						b: 13.004,
						c: 12.106,
						d: 11.296,
						e: 10.563,
						f: 9.899,
						g: 9.295,
						h: 8.745,
						i: 8.244,
						j: 7.786,
						k: 7.367
					},
					{
						a: 15,
						b: 13.865,
						c: 12.849,
						d: 11.938,
						e: 11.118,
						f: 10.380,
						g: 9.712,
						h: 9.108,
						i: 8.559,
						j: 8.061,
						k: 7.606,
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
						a: 16,
						b: 14.717,
						c: 13.577,
						d: 12.561,
						e: 11.652,
						f: 10.837,
						g: 10.105,
						h: 9.446,
						i: 8.851,
						j: 8.312,
						k: 7.824,
					},
					{
                        a: 17,
                        b: 15.562,
                        c: 14.291,
                        d: 13.166,
                        e: 12.165,
                        f: 11.274,
                        g: 10.477,
                        h: 9.763,
                        i: 9.121,
                        j: 8.543,
                        k: 8.022
					},
					{
                        a: 18,
                        b: 16.398,
                        c: 14.992,
                        d: 13.753,
                        e: 12.659,
                        f: 11.689,
                        g: 10.827,
                        h: 10.059,
                        i: 9.371,
                        j: 8.755,
                        k: 8.201
					},
					{
						a: 19,
						b: 17.226,
						c: 15.678,
						d: 14.323,
						e: 13.133,
						f: 12.085,
						g: 11.158,
						h: 10.335,
						i: 9.603,
						j: 8.950,
						k: 8.365
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
				tableHeight: (24 + 1) * 40,
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
		width: 95%;
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