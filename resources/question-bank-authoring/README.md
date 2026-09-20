# 银行从业题库编制工程

把各科目的三色笔记放入 `materials/<subjectId>/tricolor-notes/`。目录名与题库使用的 `subjectId` 完全一致，可直接映射到：

- AI 题源：`../question-bank/ai/<subjectId>/questions.json`
- 已生成版本：`../../outputs/question-bank/<subjectId>/<version>/`

完整出题、去重、审核和发布规则见本目录的 `AGENTS.md`。原始 PDF、Word、图片和压缩包默认不会被 Git 跟踪。

当前12个科目目录已经建立，覆盖初级和中级的银行业法律法规与综合能力、个人理财、个人贷款、公司信贷、风险管理、银行管理。
