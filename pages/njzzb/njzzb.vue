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
						b: 1,
						c: 1,
						d: 1,
						e: 1,
						f: 1,
						g: 1,
						h: 1,
						i: 1,
						j: 1,
						k: 1
					},
					{
						a: 2,
						b: 2.010,
						c: 2.020,
						d: 2.030,
						e: 2.040,
						f: 2.050,
						g: 2.060,
						h: 2.070,
						i: 2.080,
						j: 2.090,
						k: 2.100
					},
					{
						a: 3,
						b: 3.030,
						c: 3.060,
						d: 3.091,
						e: 3.122,
						f: 3.153,
						g: 3.184,
						h: 3.215,
						i: 3.246,
						j: 3.278,
						k: 3.310
					},
					{
						a: 4,
						b: 4.060,
						c: 4.122,
						d: 4.184,
						e: 4.246,
						f: 4.310,
						g: 4.375,
						h: 4.440,
						i: 4.506,
						j: 4.573,
						k: 4.641
					},
					{
						a: 5,
						b: 5.101,
						c: 5.204,
						d: 5.309,
						e: 5.416,
						f: 5.526,
						g: 5.637,
						h: 5.751,
						i: 5.867,
						j: 5.985,
						k: 6.105
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
						b: 6.152,
						c: 6.308,
						d: 6.468,
						e: 6.633,
						f: 6.802,
						g: 6.975,
						h: 7.153,
						i: 7.336,
						j: 7.523,
						k: 7.716
					},
					{
						a: 7,
						b: 7.214,
						c: 7.434,
						d: 7.662,
						e: 7.898,
						f: 8.142,
						g: 8.394,
						h: 8.654,
						i: 8.923,
						j: 9.200,
						k: 9.487
					},
					{
						a: 8,
						b: 8.286,
						c: 8.583,
						d: 8.892,
						e: 9.214,
						f: 9.549,
						g: 9.879,
						h: 10.260,
						i: 10.637,
						j: 11.028,
						k: 11.436
					},
					{
						a: 9,
						b: 9.369,
						c: 9.755,
						d: 10.159,
						e: 10.583,
						f: 11.027,
						g: 11.491,
						h: 11.978,
						i: 12.488,
						j: 13.021,
						k: 13.579
					},
					{
						a: 10,
						b: 10.462,
						c: 10.950,
						d: 11.464,
						e: 12.006,
						f: 12.578,
						g: 13.181,
						h: 13.816,
						i: 14.487,
						j: 15.913,
						k: 15.937
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
						b: 11.567,
						c: 12.169,
						d: 12.808,
						e: 13.486,
						f: 14.207,
						g: 14.972,
						h: 15.784,
						i: 16.645,
						j: 17.560,
						k: 18.531
					},
					{
						a: 12,
						b: 12.683,
						c: 13.412,
						d: 14.192,
						e: 15.026,
						f: 15.917,
						g: 16.870,
						h: 17.888,
						i: 18.977,
						j: 20.141,
						k: 21.384
					},
					{
						a: 13,
						b: 13.809,
						c: 14.680,
						d: 15.618,
						e: 16.627,
						f: 17.713,
						g: 18.882,
						h: 20.141,
						i: 21.495,
						j: 22.953,
						k: 24.523
					},
					{
						a: 14,
						b: 14.947,
						c: 15.974,
						d: 17.086,
						e: 18.292,
						f: 19.599,
						g: 21.015,
						h: 22.550,
						i: 24.215,
						j: 26.019,
						k: 27.975
					},
					{
						a: 15,
						b: 16.097,
						c: 17.293,
						d: 18.599,
						e: 20.024,
						f: 21.579,
						g: 23.276,
						h: 25.129,
						i: 27.152,
						j: 29.361,
						k: 31.772
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
						b: 17.258,
						c: 18.639,
						d: 20.157,
						e: 21.825,
						f: 23.657,
						g: 25.673,
						h: 27.888,
						i: 30.324,
						j: 33.003,
						k: 35.950
					},
					{
						a: 17,
						b: 18.430,
						c: 20.012,
						d: 21.762,
						e: 23.698,
						f: 25.840,
						g: 28.213,
						h: 30.840,
						i: 33.750,
						j: 36.974,
						k: 40.545
					},
					{
						a: 18,
						b: 19.615,
						c: 21.412,
						d: 23.414,
						e: 25.645,
						f: 28.132,
						g: 30.906,
						h: 33.999,
						i: 37.450,
						j: 41.301,
						k: 45.599
					},
					{
						a: 19,
						b: 20.811,
						c: 22.841,
						d: 25.117,
						e: 27.671,
						f: 30.539,
						g: 33.760,
						h: 37.379,
						i: 41.446,
						j: 46.018,
						k: 51.159
					},
					{
						a: 20,
						b: 22.019,
						c: 24.297,
						d: 26.870,
						e: 29.778,
						f: 33.066,
						g: 36.786,
						h: 40.995,
						i: 45.762,
						j: 51.160,
						k: 57.275
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