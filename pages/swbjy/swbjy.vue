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
						b: "不超过36000元的",
						c: 5
					},
					{
						a: 2,
						b: "超过30000元至90000元的部分",
						c: 10,
					},
					{
						a: 3,
						b: "超过90000元至300000元的部分",
						c: 20,
					},
					{
						a: 4,
						b: "超过300000元至500000元的部分",
						c: 30,
					},
					{
						a: 5,
						b: "超过500000元的部分",
						c: 35,
					}
				],
				dataAttribute: [{
						title: '级数 ',
						key: 'a'
					},
					{
						title: '全年应纳税所得额 ',
						key: 'b'
					},
					{
						title: '税率(%) ',
						key: 'c'
					}
				],
				tableHeight: (5 + 1) * 40,
				tableWidth: 100 * 5
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
	
	.table__head__td:nth-child(2) {
		padding-left: 0px;
		width: 300px;
		margin-right: 0px;
	}

	.table__head__td__text {
		display: inline;
		padding-left: 40%;
	}
	
	.table__head__td:nth-child(2) .table__head__td__text{
		display: inline;
		padding-left: 20%;
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
	
	.table__row__td:nth-child(2) {
		margin-right: 0px;
		padding-left: 0px;
		width: 300px;
	}

	.table__row__text {
		display: inline;
		padding-left: 40%;
	}
	
	.table__row__td:nth-child(2) .table__row__text {
		display: inline;
		padding-left: 20%;
	}
</style>