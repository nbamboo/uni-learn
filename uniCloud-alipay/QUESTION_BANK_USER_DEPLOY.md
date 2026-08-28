# 用户题库云端功能部署

代码已经接入微信静默登录、离线待同步队列、历史本地数据迁移，以及做题记录/错题/收藏夹的云端读取。首次联调前还需要在 HBuilderX 和微信公众平台完成以下配置。

## 1. 导入 uni-id-pages

在 HBuilderX 插件市场将最新版 `uni-id-pages` 导入当前项目。这里主要使用插件提供的 `uni-id-co` 云对象、`uni-id-users` 数据表以及相关公共模块；当前业务不会弹出头像、昵称授权页。

## 2. 配置微信小程序登录

微信小程序 AppID 已在 `manifest.json` 中配置为 `wxea609870c354d0bb`。登录微信公众平台取得该小程序的 AppSecret，然后填写：

`uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json`

最小配置示例：

```json
{
  "dcloudAppid": "__UNI__6D9FCF0",
  "isDefaultConfig": true,
  "passwordSecret": "请替换为独立的高强度随机字符串",
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

不要把 AppSecret、`passwordSecret` 或 `tokenSecret` 提交到 Git。项目的 `.gitignore` 已忽略上述配置文件。

## 3. 上传 uni-id 资源

在 HBuilderX 中关联当前 uniCloud 服务空间，然后上传：

1. `uni-config-center`、`uni-id-common`、`uni-open-bridge-common` 等 `uni-id-co` 所需公共模块。
2. `uni-id-co` 云对象。
3. `uni-id-pages` 带来的 `uni-id-users` 等数据库 Schema。

是否需要单独上传 `uni-open-bridge`，以导入的 `uni-id-pages` 版本及 HBuilderX 的依赖提示为准。

## 4. 上传本功能的数据库与云函数

上传以下 Schema 和索引，集合无需初始化数据：

- `question_bank_user_states`
- `question_bank_user_attempts`
- `question_bank_user_stats`

然后上传 `questionBankUser` 云函数。该云函数必须能解析 `uni-id-common` 依赖。

## 5. 联调检查

在微信开发者工具中运行小程序：

1. 进入“刷题”页，应在 `uni-id-users` 自动创建或复用当前微信用户。
2. 做一题并收藏，确认三个用户题库集合出现对应数据。
3. 进入“做题记录”“错题集”“收藏夹”，确认数据来自云端。
4. 关闭并重新打开小程序，确认记录仍存在。
5. 换一个微信账号测试，确认不同用户的数据完全隔离。

本地旧记录会在首次登录后按 50 条一批迁移；答题事件带稳定事件 ID，网络重试不会重复计数。迁移和日常写入失败时，原始记录仍保留在本机待同步队列中。
