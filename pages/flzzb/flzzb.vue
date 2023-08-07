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
						b: 1.01,
						c: 1.02,
						d: 1.03,
						e: 1.04,
						f: 1.05,
						g: 1.06,
						h: 1.07,
						i: 1.08,
						j: 1.09,
						k: 1.1,
					},
					{
						a: 2,
						b: 1.0201,
						c: 1.0404,
						d: 1.0609,
						e: 1.0816,
						f: 1.1025,
						g: 1.1236,
						h: 1.1449,
						i: 1.1664,
						j: 1.1881,
						k: 1.21,
					},
					{
						a: 3,
						b: 1.0303,
						c: 1.0612,
						d: 1.0927,
						e: 1.1249,
						f: 1.1576,
						g: 1.191,
						h: 1.225,
						i: 1.2597,
						j: 1.295,
						k: 1.331
					},
					{
						a: 4,
						b: 1.0406,
						c: 1.0824,
						d: 1.1255,
						e: 1.1699,
						f: 1.2155,
						g: 1.2625,
						h: 1.3108,
						i: 1.3605,
						j: 1.4116,
						k: 1.4641,
					},
					{
						a: 5,
						b: 1.051,
						c: 1.1041,
						d: 1.1593,
						e: 1.2167,
						f: 1.2763,
						g: 1.3382,
						h: 1.4026,
						i: 1.4693,
						j: 1.5386,
						k: 1.6105,
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
						b: 1.0615,
						c: 1.1262,
						d: 1.1941,
						e: 1.2653,
						f: 1.3401,
						g: 1.4185,
						h: 1.5007,
						i: 1.5869,
						j: 1.6771,
						k: 1.7716
					},
					{
						a: 7,
						b: 1.0721,
						c: 1.1487,
						d: 1.2299,
						e: 1.3159,
						f: 1.4071,
						g: 1.5036,
						h: 1.6058,
						i: 1.7138,
						j: 1.828,
						k: 1.9487
					},
					{
						a: 8,
						b: 1.0829,
						c: 1.1717,
						d: 1.2668,
						e: 1.3686,
						f: 1.4775,
						g: 1.5938,
						h: 1.7182,
						i: 1.8509,
						j: 1.9926,
						k: 2.1436
					},
					{
						a: 9,
						b: 1.0937,
						c: 1.1951,
						d: 1.3048,
						e: 1.4233,
						f: 1.5513,
						g: 1.6895,
						h: 1.8385,
						i: 1.999,
						j: 2.1719,
						k: 2.3579
					},
					{
						a: 10,
						b: 1.1046,
						c: 1.219,
						d: 1.3439,
						e: 1.4802,
						f: 1.6289,
						g: 1.7908,
						h: 1.9672,
						i: 2.1589,
						j: 2.3674,
						k: 2.5937
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
						b: 1.1157,
						c: 1.2434,
						d: 1.3842,
						e: 1.5395,
						f: 1.7103,
						g: 1.8983,
						h: 2.1049,
						i: 2.3316,
						j: 2.5804,
						k: 2.8531
					},
					{
						a: 12,
						b: 1.1268,
						c: 1.2682,
						d: 1.4258,
						e: 1.601,
						f: 1.7959,
						g: 2.0122,
						h: 2.2522,
						i: 2.5182,
						j: 2.8127,
						k: 3.1384
					},
					{
						a: 13,
						b: 1.1381,
						c: 1.2936,
						d: 1.4685,
						e: 1.6651,
						f: 1.8856,
						g: 2.1329,
						h: 2.4098,
						i: 2.7196,
						j: 3.0658,
						k: 3.4523
					},
					{
						a: 14,
						b: 1.1495,
						c: 1.3195,
						d: 1.5126,
						e: 1.7317,
						f: 1.9799,
						g: 2.2609,
						h: 2.5785,
						i: 2.9372,
						j: 3.3417,
						k: 3.7975
					},
					{
						a: 15,
						b: 1.161,
						c: 1.3459,
						d: 1.558,
						e: 1.8009,
						f: 2.0789,
						g: 2.3966,
						h: 2.759,
						i: 3.1722,
						j: 3.6425,
						k: 4.1772
					},
					{
						a: 20,
						b: 1.2202,
						c: 1.4859,
						d: 1.8061,
						e: 2.1911,
						f: 2.6533,
						g: 3.2071,
						h: 3.8697,
						i: 4.661,
						j: 5.6044,
						k: 6.7275
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