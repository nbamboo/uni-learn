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
						b: 2.01,
						c: 2.02,
						d: 2.03,
						e: 2.04,
						f: 2.05,
						g: 2.06,
						h: 2.07,
						i: 2.08,
						j: 2.09,
						k: 2.1
					},
					{
						a: 3,
						b: 3.03,
						c: 3.06,
						d: 3.091,
						e: 3.122,
						f: 3.153,
						g: 3.184,
						h: 3.215,
						i: 3.246,
						j: 3.278,
						k: 3.31
					},
					{
						a: 4,
						b: 4.06,
						c: 4.122,
						d: 4.184,
						e: 4.246,
						f: 4.31,
						g: 4.375,
						h: 4.44,
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
						b: 2.01,
						c: 2.02,
						d: 2.03,
						e: 2.04,
						f: 2.05,
						g: 2.06,
						h: 2.07,
						i: 2.08,
						j: 2.09,
						k: 2.1
					},
					{
						a: 3,
						b: 3.03,
						c: 3.06,
						d: 3.091,
						e: 3.122,
						f: 3.153,
						g: 3.184,
						h: 3.215,
						i: 3.246,
						j: 3.278,
						k: 3.31
					},
					{
						a: 4,
						b: 4.06,
						c: 4.122,
						d: 4.184,
						e: 4.246,
						f: 4.31,
						g: 4.375,
						h: 4.44,
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
						b: 2.01,
						c: 2.02,
						d: 2.03,
						e: 2.04,
						f: 2.05,
						g: 2.06,
						h: 2.07,
						i: 2.08,
						j: 2.09,
						k: 2.1
					},
					{
						a: 3,
						b: 3.03,
						c: 3.06,
						d: 3.091,
						e: 3.122,
						f: 3.153,
						g: 3.184,
						h: 3.215,
						i: 3.246,
						j: 3.278,
						k: 3.31
					},
					{
						a: 4,
						b: 4.06,
						c: 4.122,
						d: 4.184,
						e: 4.246,
						f: 4.31,
						g: 4.375,
						h: 4.44,
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
						a: 20,
						b: 22.019,
						c: 24.297,
						d: 26.87,
						e: 29.778,
						f: 33.066,
						g: 36.786,
						h: 40.995,
						i: 45.762,
						j: 51.16,
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
		border-left: 1px solid black;
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
		border-left: 1px solid black;
		border-bottom: 1px solid black;
	}

	.table__row__td:nth-child(1) {
		margin-right: 0px;
		padding-left: 0px;
		width: 100px;
		position: sticky;
		z-index: 10;
		left: 0;
	}

	.table__row__text {
		display: inline;
		padding-left: 40%;
	}
</style>