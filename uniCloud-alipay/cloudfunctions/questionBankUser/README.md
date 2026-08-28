# questionBankUser

需要登录的题库用户数据云函数。`userId` 始终由 `uni-id-common` 校验客户端 token 后取得，客户端不能指定其他用户。

支持的 action：

- `syncEvents`：批量同步答题与收藏事件，每批最多 50 条；答题事件按 `eventId` 幂等。
- `getSummary`：读取单科汇总，首页只需读取一条记录。
- `getStateSnapshot`：读取错题、收藏、已做题 ID 以及章节/知识点进度。
- `getRecords`：分页读取做题记录、错题集或收藏夹。

部署前必须关联 `uni-id-common` 公共模块，并配置、上传 `uni-id-co` 和 `uni-id` 配置。
