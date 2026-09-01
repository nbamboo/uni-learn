# 题库导入流程

本项目使用 `scripts/generate-question-bank-import.py` 将指定路径的题目整理 Excel 转换为可导入 uniCloud 的题库文件。

## 生成导入文件

输入只需要 Excel 路径：

```bash
python3 scripts/generate-question-bank-import.py "resources/topic/题目整理.xlsx"
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

## 解析与校验规则

- 只处理“权限状态”为“可查看”的题目。
- 章节、小节、知识点、题干、选项和答案必须完整。
- 判断题答案 `1/0` 转换为 `A/B`。
- 一个答案生成 `single`，多个答案生成 `multiple`。
- `sortOrder` 必须在过滤后重新生成，并从 1 连续到题目总数。
- 不得静默删除题干、选项或解析中的图片标记；图片题写入 `rejected.json`。
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

在导入前检查 `validation-report.json`，确认所有 `checks` 均为 `true`，并确认接受、拒绝和跳过的题目数量符合预期。

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
- 单选、多选和判断题能正确判题。
- 搜索、收藏、错题和学习进度功能正常。
- 题目 ID 使用当前科目的稳定前缀。

发布异常时，将 `question_bank_catalogs.activeVersion` 切回上一版本。旧版本验证完成前不要删除。
