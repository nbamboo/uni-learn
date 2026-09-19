# 注意事项

1. 微信小程序体验版相关操作无需使用 computer use。需要构建、预览、上传或发布体验版时，列出操作提示并提醒用户自行在微信开发者工具或相关管理后台完成。
2. uniCloud 的云函数上传和 database schema 上传无需使用 computer use。涉及这些操作时，只列出清单并提醒用户自行完成：
   - [ ] 上传并部署 uniCloud 云函数。
   - [ ] 上传 database schema。
   - [ ] 检查云函数部署结果及 database schema 上传结果。
3. 后续在工程中新增但不参与项目运行、无需纳入版本控制的文件，应及时添加到 `.gitignore`，避免误提交；项目运行所需文件不得忽略。

# 题库导入流程

本项目使用 `scripts/generate-question-bank-import.py` 将指定路径的题目整理 Excel 转换为可导入 uniCloud 的题库文件。

## 生成导入文件

只生成爬取题库时输入 Excel 路径：

```bash
python3 scripts/generate-question-bank-import.py "resources/topic/银行从业初级银行管理_章节练习_题目整理.xlsx"
```

脚本从 Excel 的“说明”工作表识别科目，并将文件生成到：

```text
outputs/question-bank/<subjectId>/<version>/
```

如果脚本提示科目未配置，应先在脚本的 `SUBJECT_CONFIGS` 中添加稳定的：

- `subjectId`
- 科目名称 `name`
- 级别 `level`
- 全局唯一题目前缀 `questionPrefix`

不要使用 Excel 行号作为题目 ID。题目 ID 必须由稳定前缀和源题目 ID 组成，例如 `jlaw-3448325`。

## AI 题目扩充流程

长期使用 AI 扩充题库时，AI 题不得直接写入爬取 Excel，也不得直接插入云端当前激活版本。爬取 Excel 与 AI 题源分别维护，由生成器在发布新版本时合并。

### AI 题源目录

每个已配置科目使用独立目录：

```text
resources/question-bank/ai/<subjectId>/questions.jsonl
```

例如：

```text
resources/question-bank/ai/junior-personal-finance/questions.jsonl
resources/question-bank/ai/middle-personal-finance/questions.jsonl
```

AI 题源是正式题库源数据，必须纳入版本控制，不得加入 `.gitignore`。`questions.jsonl` 必须是 JSONL 格式，每行一道完整 AI 题，不能写成 JSON 数组。

当前各科目目录中的 `*-ai-20260919-001` 为合并流程测试例题，处于 `approved + enabled` 状态；显式传入对应 AI 目录时会进入生成结果。正式发布前必须逐题复核，不准备发布的测试题必须改为 `enabled: false`。

### 生成命令

使用 `--ai-questions` 显式指定 AI 科目目录或具体的 `questions.jsonl`：

```bash
python3 scripts/generate-question-bank-import.py \
  "resources/topic/银行从业初级个人理财_第一章至附录_题目整理.xlsx" \
  --ai-questions "resources/question-bank/ai/junior-personal-finance" \
  --version "2026-09-19-v2"
```

如果 `--ai-questions` 指向目录，生成器自动读取目录中的 `questions.jsonl`。不传该参数时保持原有行为，只生成 Excel 中的爬取题，不能自动扫描或隐式加入 AI 测试题。

每次修改、启用、停用或重新锚定 AI 题都必须发布新版本，不得覆盖已经启用的旧版本。建议按批次集中发布 AI 题，避免每增加一题就创建一个完整题库版本。

### AI 题源字段

处于 `approved + enabled` 状态的记录必须包含：

- `questionId`：完整且永久稳定的题目 ID。
- `subjectId`、`chapterId`、`chapter`、`section`、`knowledge`。
- `insertAfterQuestionId`：必须指向同一科目、章节和小节中的爬取题。
- `insertOrder`：同一锚点下 AI 题的正整数顺序。
- `type`、`selectionMode`、`title`、`options`、`answer`、`explanation`。
- `reviewStatus`：只能为 `draft`、`approved` 或 `rejected`。
- `enabled`：必须为布尔值。
- `provenance`：必须包含 `type: "ai"`、`provider`、`model`、`createdAt` 和 `sourceNote`。

`insertAfterQuestionId`、`insertOrder`、`reviewStatus`、`enabled` 和 `provenance` 只用于本地合并、审核与追踪，不写入最终 `question_bank_questions` 文档。第一阶段不改变现有 `questionSchemaVersion: 3`。

AI 题初次生成时应使用 `reviewStatus: "draft"`。核对教材依据、题型、选项、答案、解析、章节、小节、知识点和锚点后才能改为 `approved`。只有同时满足以下条件的记录会参与合并：

```json
{"reviewStatus":"approved","enabled":true}
```

`draft`、`rejected` 或 `enabled: false` 的记录会保留在题源中但不会进入输出。被停用或替代的 AI 题应设置 `enabled: false`，不要直接删除，以保留审核记录。

### AI 题目 ID

AI 题 ID 使用：

```text
<科目前缀>-ai-<创建日期>-<流水号>
```

例如：

```text
ipf-ai-20260919-001
jlaw-ai-20260919-001
```

AI 题 ID 不得由 ChatGPT 随意覆盖或复用。修正错别字、标点或不改变题意的解析时可以保留原 ID；题意、正确答案、选项含义或考查知识点发生实质变化时必须创建新 ID，并停用旧题。

### 锚点和插入顺序

- `insertAfterQuestionId` 只能锚定有效爬取题，禁止锚定另一道 AI 题。
- 锚点必须存在于本次 Excel 解析后的有效题目中。
- AI 题与锚点的 `subjectId`、`chapterId`、`chapter`、`section` 必须一致。
- AI 题与锚点的 `knowledge` 不一致时生成器记录警告，发布前必须人工确认。
- 找不到锚点或锚点范围不匹配时生成必须失败，禁止自动移动到章节或小节末尾。
- 锚点属于材料题时，生成器把 AI 题放在整个材料题组之后，不得拆开材料题组。
- 同一锚点可以插入多道 AI 题，使用唯一的 `insertOrder` 排序；建议使用 `100、200、300`，为后续插入预留间隔。
- AI 题源不得填写最终 `sortOrder`。生成器先保持所有爬取题之间的相对顺序，再插入 AI 题，最后对合并结果统一生成从 1 开始连续的 `sortOrder`。

### AI 题型和内容限制

第一阶段 AI 题只支持：

- `single`，对应 `selectionMode: "single"`。
- `judgment`，对应 `selectionMode: "single"`，必须恰好两个选项，答案为 `A/B`。
- `multiple`，对应 `selectionMode: "multiple"`，必须有多个正确答案。

第一阶段禁止 AI 材料题。后续支持材料题时必须以完整材料组为单位设计和发布，使用独立稳定的 `materialGroupId`，保证材料组连续且子题序号为 `1..N`，不得向爬取材料组中单独插入 AI 子题。

AI 题不得包含未处理的图片标记，不得缺少题干、选项、答案或解析，不得超过现有 Schema 字段长度，不得与爬取题或其他 AI 题重复。已经标记为 `approved + enabled` 的 AI 题只要有一项校验失败，整个生成命令就必须失败，禁止静默跳过后继续发布。

### 合并、报告和测试

生成器必须按以下顺序处理：

1. 解析并校验 Excel 爬取题。
2. 按章节、小节和来源顺序排列有效爬取题。
3. 读取并校验显式指定的 AI JSONL。
4. 建立爬取题 `questionId` 锚点索引。
5. 按 `insertAfterQuestionId` 和 `insertOrder` 合并 AI 题。
6. 对合并后的题目统一生成连续 `sortOrder`。
7. 使用合并后的完整题目重新生成章节、小节、知识点计数和 `smartPracticeUnits`。

`validation-report.json` 必须记录爬取题、AI 源记录、AI 接受题、AI 跳过题和合并后总题数，并保证下列 AI 检查为 `true`：

- `aiJsonlValid`
- `aiQuestionIdsUnique`
- `aiQuestionPrefixesMatch`
- `aiQuestionsReviewed`
- `aiAnchorsExist`
- `aiAnchorsAreCrawledQuestions`
- `aiAnchorScopesMatch`
- `aiInsertOrdersUnique`
- `aiQuestionTypesMatch`
- `aiSelectionModesMatch`
- `aiAnswersValid`
- `aiQuestionsNotDuplicated`

`manifest.json` 必须记录 Excel 和 AI JSONL 的文件路径、大小、SHA-256，以及 AI 题接受和跳过数量。修改生成器或任何 AI 题源后运行：

```bash
python3 scripts/test-question-bank-ai-import.py
```

该测试必须验证所有 `SUBJECT_CONFIGS` 科目均存在对应 AI 目录和例题、锚点紧邻关系正确、合并后计数增加、全部输出检查通过，并确认缺失锚点会使生成失败。

## 解析与校验规则

- 只处理“权限状态”为“可查看”的题目。
- 章节、小节、知识点、题干、选项和答案必须完整。
- Excel 判断题答案必须已是 `A/B`；转换器不接受 `1/0`。
- Excel G 列“题型”必须按固定优先级编码：X 列存在材料正文为 `4`；非材料且恰好两个选项为 `2`；其余多个答案为 `3`、单个答案为 `1`；缺少答案且无法可靠判断的权限题保留来源值。H 列只保存子题题干，U-X 分别为材料组 ID、材料内序号、材料题数和材料正文，非材料题 U-X 必须为空。
- JSON 题型只由 Excel G 列决定：`1 -> single`、`2 -> judgment`、`3 -> multiple`、`4 -> material`，不得根据答案数量重新推断题型。
- JSON 必须包含 `selectionMode`：`single` 和 `judgment` 为 `single`，`multiple` 和 `material` 固定为 `multiple`。
- `catalog.json` 必须包含 `questionSchemaVersion: 3`，`manifest.json` 必须使用 `schemaVersion: 3`。材料题必须包含 `materialGroupId`、`materialText`、`materialQuestionIndex`、`materialQuestionCount`，同一材料组连续且组内序号为 `1..N`；非材料题不得包含这些字段。
- `sortOrder` 必须在过滤后重新生成，并从 1 连续到题目总数。
- `catalog.json` 中每章的小节必须按名称开头的自然序号排列，同时识别“第一节、第二节……”和“第一部分、第二部分……”；无法识别序号时才按题目首次出现顺序排列。
- 答案解析中的图片必须先下载并识别其中的文字，结合题干、选项和答案整理成与现有解析一致的文字段落，写回 Excel 的“答案解析”列后再生成导入文件。
- 不得只删除答案解析中的图片标记而丢失图片信息；图片无法可靠识别时才写入 `rejected.json`，并保留图片地址供人工复核。
- 题干或选项中的图片不能仅通过答案解析 OCR 代替；仍需保留图片标记并写入 `rejected.json`，等待单独处理。
- 重复题目 ID、非法答案、空题干和超长字段必须拒绝。
- 内容发生变化时发布新版本，不覆盖已经启用的旧版本。

生成结果包括：

```text
questions.json
catalog.json
rejected.json
validation-report.json
manifest.json
```

uniCloud 虽然要求上传文件扩展名为 `.json`，但 `questions.json`、`catalog.json` 和 `rejected.json` 的内容必须是 JSONL 格式，即每行一条完整 JSON 记录，不能是 JSON 数组。

## 导入 uniCloud

在导入前检查 `validation-report.json`，确认包括 `questionTypesMatch`、`jsonQuestionTypesMatch`、`selectionModesMatch`、`judgmentAnswersNormalized`、`questionSchemaVersionMatch`、`materialFieldsMatch`、`materialGroupsMatch`、`materialGroupsContiguous` 和 `noSourceQuestionOrdinalReferences` 在内的所有 `checks` 均为 `true`，并确认接受、拒绝和跳过的题目数量符合预期。

导入顺序不能颠倒：

1. 在 uniCloud Web 控制台打开 `question_bank_questions`。
2. 上传 `questions.json`，冲突模式选择 `upsert`。
3. 确认云端题目数量与报告中的 `acceptedQuestions` 一致。
4. 打开 `question_bank_catalogs`。
5. 上传 `catalog.json`，冲突模式选择 `upsert`。

必须先导入并验证题目，最后导入目录。目录中的 `activeVersion` 生效后，该版本题目才会对客户端发布。

不要在 `uniCloud-alipay/database` 根目录执行“初始化云数据库”，避免重复写入已有题库数据。

## 发布后检查

- 科目题目总数正确。
- 章节数量及各章题数与 `catalog.json` 一致。
- 顺序练习、章节练习和知识点练习能加载题目。
- 单选、判断、多选和材料题能正确显示与判题；材料题必须使用多选确认交互。
- 搜索、收藏、错题和学习进度功能正常。
- 题目 ID 使用当前科目的稳定前缀。

发布异常时，将 `question_bank_catalogs.activeVersion` 切回上一版本。旧版本验证完成前不要删除。
