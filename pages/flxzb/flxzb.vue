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
						b: 0.9901,
						c: 0.9804,
						d: 0.9709,
						e: 0.9615,
						f: 0.9524,
						g: 0.9434,
						h: 0.9346,
						i: 0.9259,
						j: 0.9174,
						k: 0.9091
					},
					{
						a: 2,
						b: 0.9803,
						c: 0.9612,
						d: 0.9426,
						e: 0.9246,
						f: 0.907,
						g: 0.89,
						h: 0.8734,
						i: 0.8573,
						j: 0.8417,
						k: 0.8264
					},
					{
						a: 3,
						b: 0.9706,
						c: 0.9423,
						d: 0.9151,
						e: 0.889,
						f: 0.8638,
						g: 0.8396,
						h: 0.8163,
						i: 0.7938,
						j: 0.7722,
						k: 0.7513
					},
					{
						a: 4,
						b: 0.961,
						c: 0.9238,
						d: 0.8885,
						e: 0.8548,
						f: 0.8227,
						g: 0.7921,
						h: 0.7629,
						i: 0.735,
						j: 0.7084,
						k: 0.683,
					},
					{
						a: 5,
						b: 0.9515,
						c: 0.9057,
						d: 0.8626,
						e: 0.8219,
						f: 0.7835,
						g: 0.7473,
						h: 0.713,
						i: 0.6806,
						j: 0.6499,
						k: 0.6209,
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
						b: 0.942,
						c: 0.888,
						d: 0.8375,
						e: 0.7903,
						f: 0.7462,
						g: 0.705,
						h: 0.6663,
						i: 0.6302,
						j: 0.5963,
						k: 0.5645,
					},
					{
						a: 7,
						b: 0.9327,
						c: 0.8706,
						d: 0.8131,
						e: 0.7599,
						f: 0.7107,
						g: 0.6651,
						h: 0.6227,
						i: 0.5835,
						j: 0.547,
						k: 0.5132,
					},
					{
						a: 8,
						b: 0.9235,
						c: 0.8535,
						d: 0.7894,
						e: 0.7307,
						f: 0.6768,
						g: 0.6274,
						h: 0.582,
						i: 0.5403,
						j: 0.5019,
						k: 0.4665,
					},
					{
						a: 9,
						b: 0.9143,
						c: 0.8368,
						d: 0.7664,
						e: 0.7026,
						f: 0.6446,
						g: 0.5919,
						h: 0.5439,
						i: 0.5002,
						j: 0.4604,
						k: 0.4241,
					},
					{
						a: 10,
						b: 0.9053,
						c: 0.8203,
						d: 0.7441,
						e: 0.6756,
						f: 0.6139,
						g: 0.5584,
						h: 0.5083,
						i: 0.4632,
						j: 0.4224,
						k: 0.3855,
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
						b: 0.8963,
						c: 0.8043,
						d: 0.7224,
						e: 0.6496,
						f: 0.5847,
						g: 0.5268,
						h: 0.4751,
						i: 0.4289,
						j: 0.3875,
						k: 0.3505,
					},
					{
						a: 12,
						b: 0.8874,
						c: 0.7885,
						d: 0.7014,
						e: 0.6246,
						f: 0.5568,
						g: 0.497,
						h: 0.444,
						i: 0.3971,
						j: 0.3555,
						k: 0.3186,
					},
					{
						a: 13,
						b: 0.8787,
						c: 0.773,
						d: 0.681,
						e: 0.6006,
						f: 0.5303,
						g: 0.4688,
						h: 0.415,
						i: 0.3677,
						j: 0.3262,
						k: 0.2897,
					},
					{
						a: 14,
						b: 0.87,
						c: 0.7579,
						d: 0.6611,
						e: 0.5775,
						f: 0.5051,
						g: 0.4423,
						h: 0.3878,
						i: 0.3405,
						j: 0.2992,
						k: 0.2633,
					},
					{
						a: 15,
						b: 0.8613,
						c: 0.743,
						d: 0.6419,
						e: 0.5553,
						f: 0.481,
						g: 0.4173,
						h: 0.3624,
						i: 0.3152,
						j: 0.2745,
						k: 0.2394,
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
						b: 0.8528,
						c: 0.7284,
						d: 0.6232,
						e: 0.5339,
						f: 0.4581,
						g: 0.3936,
						h: 0.3387,
						i: 0.2919,
						j: 0.2519,
						k: 0.2176,
					},
					{
						a: 17,
						b: 0.8444,
						c: 0.7142,
						d: 0.605,
						e: 0.5134,
						f: 0.4363,
						g: 0.3714,
						h: 0.3166,
						i: 0.2703,
						j: 0.2311,
						k: 0.1978,
					},
					{
						a: 18,
						b: 0.836,
						c: 0.7002,
						d: 0.5874,
						e: 0.4936,
						f: 0.4155,
						g: 0.3503,
						h: 0.2959,
						i: 0.2502,
						j: 0.212,
						k: 0.1799,
					},
					{
						a: 19,
						b: 0.8277,
						c: 0.6864,
						d: 0.5703,
						e: 0.4746,
						f: 0.3957,
						g: 0.3305,
						h: 0.2765,
						i: 0.2317,
						j: 0.1945,
						k: 0.1635
					},
					{
						a: 20,
						b: 0.8195,
						c: 0.673,
						d: 0.5537,
						e: 0.4564,
						f: 0.3769,
						g: 0.3118,
						h: 0.2584,
						i: 0.2145,
						j: 0.1784,
						k: 0.1486,
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