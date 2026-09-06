'use strict';
const db = uniCloud.database();
exports.main = async (event, context) => {
	let res = await db.collection('cur-ssq-lotto-detail-data').field().get();
	return res;
};