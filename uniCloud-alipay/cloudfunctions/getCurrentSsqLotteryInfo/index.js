'use strict';
const db = uniCloud.database();
exports.main = async (event, context) => {
	let res = await db.collection('current-ssq-lottery-info').field().get();
	return res;
};
