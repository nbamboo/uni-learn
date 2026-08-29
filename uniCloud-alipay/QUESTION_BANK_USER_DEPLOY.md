# 用户题库云端功能部署

代码已经接入微信静默登录、离线待同步队列、单用户唯一学习进度，以及错题/收藏夹的云端读取。系统不保存历史答题流水。

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

然后上传 `questionBankUser` 云函数。该云函数必须能解析 `uni-id-common` 依赖。

推荐顺序是：先上传三个 Schema，再配置三个集合的索引，最后上传 `questionBankUser`。如果 HBuilderX 当前版本没有对单个 `.index.json` 提供上传菜单，可在 uniCloud Web 控制台按文件内容创建同名索引，不要改用整库初始化。

## 5. 联调检查

在微信开发者工具中运行小程序：

1. 进入“刷题”页，应在 `uni-id-users` 自动创建或复用当前微信用户。
2. 进入“关于”页，应显示“微信账号已连接，做题数据已开启云同步”。微信静默登录不会自动取得昵称和头像，未主动设置资料时显示“微信用户”是正常现象。
3. 进入章节练习并切换题目，确认 `question_bank_user_progress` 始终只有当前用户的一条数据。
4. 同一道题作答两次，确认不产生历史流水；“错题集”只反映最后一次作答结果。
5. 点击“做题记录”，确认跳回上次科目、章节和题目；错题集、收藏夹继续从云端读取。
6. 关闭并重新打开小程序，确认进度仍存在。
7. 换一个微信账号测试，确认不同用户的数据完全隔离。

本地旧数据首次登录时只迁移每道题的最新状态，不迁移历史流水。答题事件带稳定事件 ID，网络重试不会重复计数。同步失败时，最新状态和学习进度仍保留在本机待同步队列中。
