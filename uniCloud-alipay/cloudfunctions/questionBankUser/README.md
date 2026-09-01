# questionBankUser

需要登录的题库用户数据云函数。`userId` 始终由 `uni-id-common` 校验客户端 token 后取得，客户端不能指定其他用户。

支持的 action：

- `syncEvents`：批量同步答题、收藏和最近学习进度；新版客户端直接上传本地判题结果、章节和知识点，云端不再读取题库目录或题目答案；响应中的 `summaries` 返回本批次涉及科目的最新统计。旧版答题事件在发布过渡期内仍兼容云端判题。
- `getSummary`：读取单科汇总，首页只需读取一条记录。
- `getStateSnapshot`：章节/知识点次数改从单科统计文档读取；仅在传入 `questionIds` 时返回这些题目的作答、错题和收藏状态，最多 100 道，响应不再随用户累计做题量无限增长。旧用户的章节/知识点聚合会在首次读取时一次性回填。
- `getProgress`：按章节或知识点读取用户最后停留的题目进度。
- `getSmartPractice`：从最多 100 个随机题目候选和近期错题中生成智能练习，不扫描整科题号或整科用户状态。
- `getRecords`：分页读取错题集或收藏夹；仅第一页统计总数，后续页通过多取一条判断 `hasMore`。
- `getUserProfile`：读取当前登录用户的安全资料摘要，仅返回 UID、昵称、头像、微信绑定状态和时间信息。
- `getPreferences`：读取当前用户的答题模式和夜间模式，未保存时返回做题模式和关闭夜间模式。
- `updatePreferences`：校验并覆盖当前用户的答题模式和夜间模式；用户 ID 只取自已验证 token。
- `clearCurrentSubjectData`：答题设置中的数据清理入口，仅接受固定确认值，并按 token 用户和 `subjectId` 删除该科目的答题状态、统计及章节/知识点进度；不会删除答题偏好或任何 `uni-id` 账号信息。

部署前必须关联 `uni-id-common` 公共模块，并配置、上传 `uni-id-co` 和 `uni-id` 配置。
