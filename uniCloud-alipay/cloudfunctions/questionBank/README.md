# questionBank 云函数

统一提供题库目录、练习分页、搜索、按 ID 回取和判题接口。所有查询都会先读取
`question_bank_catalogs.activeVersion`，客户端不能直接访问未发布的题库版本。

## 调用方式

```js
const response = await uniCloud.callFunction({
	name: 'questionBank',
	data: {
		action: 'getCatalog',
		subjectId: 'junior-personal-finance'
	}
})

const result = response.result
if (result.errCode !== 0) throw new Error(result.errMsg)
console.log(result.data)
```

统一响应结构：

```js
{
	errCode: 0,
	errMsg: 'ok',
	data: {},
	requestId: ''
}
```

## action

### getCatalog

获取科目、章节、知识点和当前题库版本。

```js
{
	action: 'getCatalog',
	subjectId: 'junior-personal-finance'
}
```

### getPracticePage

按 `sortOrder` 游标分页获取练习题。`pageSize` 默认为 20，最大为 50。

```js
{
	action: 'getPracticePage',
	subjectId: 'junior-personal-finance',
	mode: 'sequence',
	cursor: 0,
	pageSize: 20
}
```

支持的模式及附加参数：

- `sequence`：整科顺序练习。
- `chapter`：必须传 `chapterId`。
- `knowledge`：必须传 `knowledge`。
- `search`：必须传 `keyword`，返回完整题目。
- `smart`：可传 `answeredQuestionIds`、`wrongQuestionIds` 和 `seed`，按未做、错题、已掌握的顺序抽取题目。

普通分页响应包含 `total`、`nextCursor`、`hasMore` 和 `items`。当前试点版本会在完整题目中返回
`answer` 与 `explanation`，后续切换服务端判题时可从练习响应中移除这两个字段。

### searchQuestions

搜索题干、章节、小节、知识点和选项文本，只返回题目摘要。

```js
{
	action: 'searchQuestions',
	subjectId: 'junior-personal-finance',
	keyword: '货币时间价值',
	cursor: 0,
	pageSize: 20
}
```

### getQuestionsByIds

用于错题、收藏和历史记录，按传入 ID 顺序返回完整题目。单次最多 100 个 ID。

```js
{
	action: 'getQuestionsByIds',
	subjectId: 'junior-personal-finance',
	questionIds: ['ipf-3199419', 'ipf-3476405']
}
```

### checkAnswer

服务端判题并返回答案和解析。

```js
{
	action: 'checkAnswer',
	subjectId: 'junior-personal-finance',
	questionId: 'ipf-3199419',
	selected: ['C']
}
```

## 本地验证

```bash
cd uniCloud-alipay/cloudfunctions/questionBank
npm test
```
