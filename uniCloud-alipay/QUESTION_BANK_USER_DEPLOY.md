# 用户题库云端功能部署

代码已经按会员状态拆分用户数据：非会员的答题、统计、章节/知识点进度和偏好仅保存在本机；会员继续使用离线待同步队列和云端跨设备同步，并从云端读取错题/收藏夹。系统不在云端保存历史答题流水。

当前版本把知识点范围升级为 `chapterId + knowledge`，并允许客户端从完整章节缓存中直接生成知识点练习、非会员智能练习和本地搜索结果。升级时需要同时更新 `question_bank_questions` 索引、`question_bank_user_stats`/`question_bank_user_progress` Schema，并重新部署 `questionBank` 和 `questionBankUser`；会员旧汇总会在首次读取时自动迁移，不需要手工改数据。

会员的单科做题汇总在客户端内存和本地各缓存 10 分钟；冷启动先展示上次云端汇总，小程序重新回到前台后按实际查看科目刷新。本机答题会立即使内存汇总失效，待同步事件存在时不会用旧云端汇总覆盖本机即时统计，`syncEvents` 返回的最新汇总会直接更新缓存。

## 1. 导入 uni-id-pages

在 HBuilderX 插件市场将最新版 `uni-id-pages` 导入当前项目。这里主要使用插件提供的 `uni-id-co` 云对象、`uni-id-users` 数据表以及相关公共模块；当前业务不会弹出头像、昵称授权页。

## 2. 配置微信小程序登录

微信小程序 AppID 已在 `manifest.json` 中配置为 `wxea609870c354d0bb`。登录微信公众平台取得该小程序的 AppSecret，然后填写：

`uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json`

最小配置示例：

```json
{
  "dcloudAppid": "__UNI__6D9FCF0",
  "passwordSecret": [
    {
      "type": "hmac-sha256",
      "version": 1
    }
  ],
  "tokenSecret": "请替换为另一个高强度随机字符串",
  "mp-weixin": {
    "tokenExpiresIn": 259200,
    "tokenExpiresThreshold": 86400,
    "oauth": {
      "weixin": {
        "appid": "wxea609870c354d0bb",
        "appsecret": "请填写微信小程序AppSecret"
      }
    }
  }
}
```

不要把 AppSecret 或 `tokenSecret` 提交到 Git。项目的 `.gitignore` 已忽略上述真实配置文件，并保留不含密钥的 `config.example.json` 作为模板。

## 3. 上传 uni-id 资源

填写配置后，先在项目根目录执行部署前检查：

```bash
node scripts/check-user-cloud-readiness.js
```

只有看到“用户题库云端功能部署前检查通过”后再继续上传。检查脚本只验证密钥是否已填写，不会输出密钥内容。

在 HBuilderX 中确认 `uniCloud-alipay` 已关联到准备使用的服务空间，然后只上传本次微信静默登录需要的三个数据库 Schema：

- `uni_modules/uni-id-pages/uniCloud/database/uni-id-users.schema.json`
- `uni_modules/uni-id-pages/uniCloud/database/uni-id-log.schema.json`
- `uni_modules/uni-open-bridge-common/uniCloud/database/opendb-open-data.schema.json`

接着上传 `uni-id-co` 云对象。它的 `package.json` 已通过本地 `file:` 依赖声明 `uni-config-center`、`uni-id-common`、`uni-open-bridge-common`、`uni-captcha` 和 `uni-cloud-s2s`，新版 HBuilderX 会在上传云对象时一并打包这些依赖。若 HBuilderX 明确提示某个公共模块缺失，再按提示单独上传对应模块。

不要在项目的 `database` 根目录执行“初始化云数据库”：该目录还包含 822 道题的 `question_bank_questions.init_data.json`，整库初始化会产生不必要的题库数据写入。

## 4. 上传本功能的数据库与云函数

逐个上传以下 Schema，并按同名 `.index.json` 创建/更新索引；这些集合不需要初始化数据：

- `question_bank_user_states`
- `question_bank_user_stats`
- `question_bank_user_progress`
- `question_bank_user_preferences`

然后上传 `questionBankUser` 云函数。该云函数必须能解析 `uni-id-common` 依赖。

推荐顺序是：先上传三个 Schema，再配置三个集合的索引，最后上传 `questionBankUser`。如果 HBuilderX 当前版本没有对单个 `.index.json` 提供上传菜单，可在 uniCloud Web 控制台按文件内容创建同名索引，不要改用整库初始化。

## 5. 联调检查

在微信开发者工具中运行小程序：

1. 进入“刷题”页，应在 `uni-id-users` 自动创建或复用当前微信用户。
2. 使用非会员账号答题并切换章节/知识点，确认本机重启后状态仍存在，同时 `question_bank_user_states`、`question_bank_user_stats`、`question_bank_user_progress` 和 `question_bank_user_preferences` 均不产生该用户的数据。
3. 非会员进入“关于”页，应显示“做题数据仅保存在本机”。
4. 开通会员后继续答题，确认本地待同步事件被上传，`question_bank_user_progress` 在同一章节或知识点内始终覆盖原记录。
5. 同一道题作答两次，确认云端不产生历史流水；“错题集”只反映最后一次作答结果。
6. 点击“做题记录”，确认跳回上次科目、章节和题目；会员的错题集、收藏夹从云端读取。
7. 关闭并重新打开小程序，确认会员进度仍存在，并可在另一台设备使用同一微信账号恢复。
8. 换一个微信账号测试，确认不同用户的数据完全隔离。
9. 在“答题设置”中切换考试/做题/背题模式及夜间模式，确认非会员只写本机、会员写入 `question_bank_user_preferences`；会员更换设备后设置仍然生效。

答题事件带稳定事件 ID，网络重试不会重复计数。非会员事件只保留在本机，开通会员后再按批次同步；同步失败时，最新状态、学习进度和答题偏好仍保留在本机，并在后续页面请求时重试同步。
