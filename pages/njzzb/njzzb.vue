<template>
	<scroll-view class="table" scroll-x scroll-y bindscrolltolower="handleScrollToLower">
		<view class="sticky-box" v-bind:style="{height: tableHeight + 'px'}">
			<view class="table__head" v-bind:style="{width: tableWidth + 'px', position: 'sticky'}">
				<view class="table__head__td"  v-for="(attrItem,attrIndex) in dataAttribute" :key="attrIndex">
					<text
					  class="table__head__td__text"
					>{{attrItem.title}}</text>
				</view>
			</view>
			<view class="table__row" v-for="(dataItem,dataIndex) in listData" :key="dataIndex" v-bind:style="{width: tableWidth + 'px'}">
				<text class="table__row__td" v-for="(attrItem,attrIndex) in dataAttribute" :key="attrIndex">{{dataItem[attrItem.key] || '-'}}</text>
			</view>
		</view>
	</scroll-view>
</template>


<script>
	export default {
		data() {
			return {
				listData: [
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				  {
					a: 123,
					b: 456,
					c: 489,
					d: 789,
					e: 458,
					f: 789
				  },
				],
				dataAttribute: [
				  {
					title: '第一列',
					key: 'a'
				  },
				  {
					title: '第2列',
					key: 'b'
				  },
				  {
					title: '第3列',
					key: 'c'
				  },
				  {
					title: '第4列',
					key: 'd'
				  },
				  {
					title: '第5列',
					key: 'e'
				  },
				  {
					title: '第6列',
					key: 'f'
				  }
				],
				tableHeight: (20 + 1) * 96,
				tableWidth: 200 * 6 + 60
			}
		},
		methods: {

		}
	}
</script>

<style>

page{
  font-size: 26px;
  line-height: 60px;
  color: #222;
  height: 100%;
  width: 100%;
}
.table{
  display: block;
  position: relative;
  overflow: scroll;
  width: 100%;
  height: 100%;
}
.sticky-box{
}
.table__head{
  height: 96px;
  white-space: nowrap;
  position: sticky;
  top: 0px;
  z-index: 100;
  height: 88px;
  font-size: 24px;
  line-height: 88px;
  color: #aaabbd;
  background-color: #f8f8f8;
  border-bottom: 2px solid #ecf1f8;
  background-color: #fff;
  white-space: nowrap;
  display: flex;
}
.table__head__td{
  width: 200px;
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
}
.table__head__td:nth-child(1) {
  padding-left: 24px;
  width: 260px;
  margin-right: 40px;
  position: sticky;
  z-index: 101;
  left: 0px;
}
.table__head__td__text{
  display: inline;
}
.table__row{
  position: relative;
  height: 96px;
  white-space: nowrap;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  border-bottom: 2px solid #ecf1f8;
}
.table__row__td{
  overflow: scroll;
  white-space: nowrap;
  width: 200px;
  display: inline-block;
  background-color: #fff;
  box-sizing: border-box;
  font-size: 26px;
  line-height: 96px;
  position: relative;
  overflow: hidden;
  white-space: nowrap;
  -o-text-overflow: ellipsis;
  text-overflow: ellipsis;
}
.table__row__td:nth-child(1) {
  margin-right: 40px;
  padding-left: 24px;
  width: 260px;
  position: sticky;
  z-index: 10;
  left: 0;
}
</style>

