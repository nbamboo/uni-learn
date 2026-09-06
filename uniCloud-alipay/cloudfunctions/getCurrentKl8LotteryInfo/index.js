'use strict';
const db = uniCloud.database();
exports.main = async (event, context) => {
	let res = await db.collection('current-kl8-lottery-info').field().get();
	return res;
};