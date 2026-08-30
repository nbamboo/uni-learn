# questionBankUser

需要登录的题库用户数据云函数。`userId` 始终由 `uni-id-common` 校验客户端 token 后取得，客户端不能指定其他用户。

支持的 action：

- `syncEvents`：批量同步答题、收藏和最近学习进度；不保存历史答题流水。
- `getSummary`：读取单科汇总，首页只需读取一条记录。
- `getStateSnapshot`：读取错题、收藏、已做题 ID、最近选择答案以及章节/知识点进度。
- `getProgress`：按章节或知识点读取用户最后停留的题目进度。
- `getRecords`：分页读取错题集或收藏夹。
- `getUserProfile`：读取当前登录用户的安全资料摘要，仅返回 UID、昵称、头像、微信绑定状态和时间信息。
- `getPreferences`：读取当前用户的答题模式和夜间模式，未保存时返回做题模式和关闭夜间模式。
- `updatePreferences`：校验并覆盖当前用户的答题模式和夜间模式；用户 ID 只取自已验证 token。

部署前必须关联 `uni-id-common` 公共模块，并配置、上传 `uni-id-co` 和 `uni-id` 配置。
