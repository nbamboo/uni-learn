const QUESTION_BANK_TAB_INDEX = 1
// 更换标识即可在下次题库更新时开启新一轮提示。
const NOTICE_STORAGE_KEY = 'questionBankTabNoticeSeen_20260927'

export function syncQuestionBankTabNotice() {
	// #ifdef MP-WEIXIN
	if (uni.getStorageSync(NOTICE_STORAGE_KEY) === true) {
		uni.hideTabBarRedDot({ index: QUESTION_BANK_TAB_INDEX })
	} else {
		uni.showTabBarRedDot({ index: QUESTION_BANK_TAB_INDEX })
	}
	// #endif
}

export function markQuestionBankTabNoticeSeen() {
	// #ifdef MP-WEIXIN
	uni.setStorageSync(NOTICE_STORAGE_KEY, true)
	uni.hideTabBarRedDot({ index: QUESTION_BANK_TAB_INDEX })
	// #endif
}
