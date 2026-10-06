# questionBankUser

题库用户数据云函数。`userId` 始终由 `uni-id-common` 校验客户端 token 后取得，客户端不能指定其他用户。学习数据同步 action 要求有效会员；自然到期享有最多 6 小时宽限，`revoked` 或退款撤销不享有宽限。`getUserProfile` 与 `submitQuestionFeedback` 只要求登录，非会员也可以提交题目反馈；非会员的做题数据和待同步事件保存在本机，续订发生冲突时必须先选择本机或云端整份进度。

支持的 action：

- `syncEvents`：批量同步会员的答题、收藏、轮次重置和最近学习进度。章节/小节答题与位置写入当前练习轮次；重置时间会拦截更早但延迟到达的答案和位置事件。科目正在整份替换时拒绝普通同步，且替换清理时间之前的旧事件只确认丢弃、不会重新写回。响应中的 `summaries` 返回本批次涉及科目的最新长期统计。
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
- `submitQuestionFeedback`：登录用户提交题目问题。云端按科目、题库版本和题目 ID 读取可信题目快照；同用户、同版本、同题、同问题类型的未处理记录会合并，并通过 `clientRequestId` 保证重试幂等。该 action 不要求会员。
- `getPreferences`：读取会员的答题模式、夜间模式及所有科目共用的 `smartPractice` 组题偏好。新版客户端只应用答题模式和智能练习设置，夜间模式保留在当前设备；返回夜间模式是为了兼容旧客户端。
- `updatePreferences`：校验并保存答题偏好，用户 ID 只取自已验证 token；`nightMode` 和 `smartPractice` 均允许新版或旧版按需省略，省略时保留云端原值。
- `clearCurrentSubjectData`：答题设置中的数据清理入口，仅接受固定确认值，并按 token 用户和 `subjectId` 删除该科目的长期状态、统计、练习轮次、考试草稿及知识点进度；同时记录清空截止时间，防止旧设备的延迟事件恢复已清数据。不会删除答题偏好或任何 `uni-id` 账号信息。
- `getSyncReconciliationOverview`：按科目返回云端答题、错题、收藏、会话数据和更新时间摘要，供续订冲突页比较，不返回整份明细。
- `beginSubjectDataReplacement`：使用稳定 `replacementId` 幂等地清空一个科目的云端学习数据并进入替换状态；相同任务重试不会再次清空。
- `uploadSubjectDataBatch`：在替换状态下分批写入题目状态、位置、章节轮次和考试草稿；普通状态和位置每批最多 50 条，轮次和草稿每批最多 1 条。
- `completeSubjectDataReplacement`：根据已经上传的题目状态重新计算云端统计，并把该科目恢复为可正常同步状态。
- `getSubjectDataExportPage`：按科目和资源分页导出云端学习明细，供“恢复云端进度”完整替换本机数据。

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
上传 `question_bank_user_preferences.schema.json` 和 `question_bank_sync_controls.schema.json` 及索引，检查部署结果后再发布客户端；无需重新导入题库。
