<template>
	<finance-calculator :tool-page="true"></finance-calculator>
</template>

<script>
	import FinanceCalculator from '@/components/finance-calculator/finance-calculator.vue'

	export default {
		components: {
			FinanceCalculator
		}
	}
</script>

<style>
	page { background: #ffffff; }
</style>
