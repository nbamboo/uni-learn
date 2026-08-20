'use strict';
const db = uniCloud.database();
exports.main = async (event, context) => {
	let res = await db.collection('exam_items').field().get();
	return res;
};