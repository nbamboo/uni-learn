# questionBankUser

会员专用的题库用户数据云函数。`userId` 始终由 `uni-id-common` 校验客户端 token 后取得，客户端不能指定其他用户。除安全资料摘要外，所有 action 都要求有效会员；自然到期享有最多 6 小时宽限，`revoked` 或退款撤销不享有宽限。非会员的做题数据只保存在本机。

支持的 action：

- `syncEvents`：批量同步会员的答题、收藏、轮次重置和最近学习进度。章节/小节答题与位置写入当前练习轮次；重置时间会拦截更早但延迟到达的答案和位置事件。响应中的 `summaries` 返回本批次涉及科目的最新长期统计。
- `getSummary`：读取单科汇总，首页只需读取一条记录。
- `getStateSnapshot`：章节/小节进度和位置从当前练习轮次读取；知识点次数仍从单科统计读取。仅在传入 `questionIds` 时返回这些题目的长期作答、错题和收藏状态，最多 100 道。
- `getPracticeRound`：一次读取指定章节或小节当前轮次的全部答案与最后停留题目，不受 `getStateSnapshot` 的 100 道题限制。
- `getExamDraft`：读取指定考试范围尚未交卷的题目顺序、已选答案与停留位置。
- `getExamDraftSummaries`：一次读取指定科目各考试范围的临时进度，供章节、知识点、错题、收藏和搜索入口展示。
- `syncEvents` 同时接受考试草稿开始、答案、位置、题目对账、重置和完成事件；未交卷草稿与长期答题状态隔离，正式交卷时由客户端另行提交已答题答案，更新长期统计，错误和部分得分题进入错题集。
- `getProgress`：章节/小节位置从当前练习轮次读取，知识点位置继续从独立进度集合读取。
- `getSmartPractice`：从最多 100 个随机题目候选和近期错题中生成智能练习，不扫描整科题号或整科用户状态。
- `getRecords`：分页读取会员的错题集或收藏夹。第一页从单科统计文档读取总数，避免对用户题目状态执行集合 `count()`；后续页通过多取一条判断 `hasMore`。
- `getUserProfile`：读取当前登录用户的安全资料摘要，仅返回 UID、昵称、头像、微信绑定状态和时间信息。
- `getPreferences`：读取会员的答题模式、夜间模式及所有科目共用的 `smartPractice` 组题偏好。
- `updatePreferences`：校验并保存答题偏好，用户 ID 只取自已验证 token；旧客户端未传 `smartPractice` 时保留云端原值。
- `clearCurrentSubjectData`：答题设置中的数据清理入口，仅接受固定确认值，并按 token 用户和 `subjectId` 删除该科目的长期状态、统计、练习轮次、考试草稿及知识点进度；不会删除答题偏好或任何 `uni-id` 账号信息。

部署前必须关联 `uni-id-common` 公共模块，并配置、上传 `uni-id-co` 和 `uni-id` 配置。

智能练习偏好 `smartPractice` 的结构为 `{ strategy, questionCount, custom: { fresh, wrong, mastered } }`，
其中 `questionCount` 为 10～50 的 5 的整数倍，默认 20，所有科目共用。
默认方案为 `fresh`（新题优先）；`fresh`、`balanced`、`wrong` 分别为 80/20/0、60/30/10、20/70/10；
`custom` 使用保存的自定义值，每项为 0～100 的 5 的整数倍且合计 100，切换预设不丢弃自定义值。
`getSmartPractice` 由客户端传入当前配置，不额外读取偏好表。候选题与近期错题查询仍分别限制在最多 100 道；
配额通过最大余数法计算，类别不足时按未答题→错题→已答对题补位，最终去重、混合打乱。
比例是候选范围内的目标，不保证全科范围的精确比例。

答题设置页面的变更先立即写入本地，再以 800ms 防抖合并调用 `updatePreferences`；页面隐藏或卸载时会立即补同步最新配置。

发布组题比例功能时，先部署 `questionBank` 和 `questionBankUser`（包含各自的 `smart-practice.js`），
上传 `question_bank_user_preferences.schema.json`，检查部署结果后再发布客户端；无需重新导入题库。
