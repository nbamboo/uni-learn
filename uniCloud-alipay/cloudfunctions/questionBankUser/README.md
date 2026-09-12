# questionBankUser

会员专用的题库用户数据云函数。`userId` 始终由 `uni-id-common` 校验客户端 token 后取得，客户端不能指定其他用户。除安全资料摘要外，所有 action 都要求有效会员；自然到期享有最多 6 小时宽限，`revoked` 或退款撤销不享有宽限。非会员的做题数据只保存在本机。

支持的 action：

- `syncEvents`：批量同步会员的答题、收藏、轮次重置和最近学习进度。章节/小节答题与位置写入当前练习轮次；重置时间会拦截更早但延迟到达的答案和位置事件。响应中的 `summaries` 返回本批次涉及科目的最新长期统计。
- `getSummary`：读取单科汇总，首页只需读取一条记录。
- `getStateSnapshot`：章节/小节进度和位置从当前练习轮次读取；知识点次数仍从单科统计读取。仅在传入 `questionIds` 时返回这些题目的长期作答、错题和收藏状态，最多 100 道。
- `getPracticeRound`：一次读取指定章节或小节当前轮次的全部答案与最后停留题目，不受 `getStateSnapshot` 的 100 道题限制。
- `getProgress`：章节/小节位置从当前练习轮次读取，知识点位置继续从独立进度集合读取。
- `getSmartPractice`：从最多 100 个随机题目候选和近期错题中生成智能练习，不扫描整科题号或整科用户状态。
- `getRecords`：分页读取会员的错题集或收藏夹。第一页从单科统计文档读取总数，避免对用户题目状态执行集合 `count()`；后续页通过多取一条判断 `hasMore`。
- `getUserProfile`：读取当前登录用户的安全资料摘要，仅返回 UID、昵称、头像、微信绑定状态和时间信息。
- `getPreferences`：读取会员的答题模式和夜间模式。
- `updatePreferences`：校验并覆盖会员的答题模式和夜间模式，用户 ID 只取自已验证 token。
- `clearCurrentSubjectData`：答题设置中的数据清理入口，仅接受固定确认值，并按 token 用户和 `subjectId` 删除该科目的长期状态、统计、练习轮次及知识点进度；不会删除答题偏好或任何 `uni-id` 账号信息。

部署前必须关联 `uni-id-common` 公共模块，并配置、上传 `uni-id-co` 和 `uni-id` 配置。
