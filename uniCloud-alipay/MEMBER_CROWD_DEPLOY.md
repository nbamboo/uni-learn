# 会员广告屏蔽人群包部署说明

该模块把题库会员同步到微信 We分析人群包，并在创建成功后发布人群播控。云端部署完成后，定时任务由 UniCloud 执行，不依赖 Codex 或开发电脑保持运行。

## 已适配本项目的数据结构

- 会员集合：`question_bank_memberships`
- 用户关联：`membership.userId -> uni-id-users._id`
- 有效会员：`status === "active"` 且 `expiresAt + 6 小时宽限期 > 当前时间`
- 小程序 OpenID：`uni-id-users.wx_openid.mp`
- 禁用用户：存在 `user.status` 且不等于 `0` 时排除

现有 `memberships_status_expires` 和 `memberships_user_unique` 索引已经覆盖查询需要，无需覆盖或重建会员表索引。

## 迁入的云函数

- `cloudfunctions/common/member-crowd-core`：公共状态机和微信 API 客户端。
- `cloudfunctions/member-crowd-admin`：管理员手动启动及查询状态。
- `cloudfunctions/member-crowd-daily`：每天北京时间 00:00、08:00、10:00、12:00、14:00、16:00、18:00、20:00、22:00 入队。
- `cloudfunctions/member-crowd-worker`：每 10 分钟推进待处理任务，固定在每小时的 05、15、25、35、45、55 分触发，避开 daily 的整点创建时刻。

单个任务执行期限为 8 小时，以便覆盖微信人群包状态查询及最多三次发布尝试。如果已有任务仍处于 `queued` 或 `processing`，下一次 daily 只会返回现有任务，不会重复创建。

新增私有集合：

- `member_crowd_sync_jobs`
- `member_crowd_runtime`

## 凭据来源

worker 按以下优先级读取微信凭据：

1. 云函数环境变量 `WECHAT_APPID`、`WECHAT_APPSECRET`；
2. 当前项目 `uni-config-center/uni-id/config.json` 中的 `mp-weixin.oauth.weixin` 配置。

后备配置沿用当前项目微信登录和虚拟支付使用的同一套小程序凭据。请确认该 AppID 正是生成 `wx_openid.mp` 的小程序。

## 本地检查

```bash
cd uniCloud-alipay/cloudfunctions/common/member-crowd-core
npm test

node --check ../member-crowd-admin/index.js
node --check ../member-crowd-daily/index.js
node --check ../member-crowd-worker/index.js
```

测试只使用虚构 OpenID 和 mock 微信响应，不会请求真实接口。

## 部署清单

不要在 `uniCloud-alipay/database` 根目录执行“初始化云数据库”，避免影响现有题库数据。只上传本次新增的两个 schema/index。

- [ ] 在 HBuilderX 中分别上传 `member_crowd_sync_jobs.schema.json`、对应 index 和 `member_crowd_runtime.schema.json`。
- [ ] 上传公共模块 `member-crowd-core`。
- [ ] 对三个新云函数执行“管理公共模块依赖”或重新安装依赖。
- [ ] 上传部署 `member-crowd-admin`、`member-crowd-daily`、`member-crowd-worker`。
- [ ] 检查 daily（00、08、10、12、14、16、18、20、22 点）和 worker（每 10 分钟）两个定时触发器已经创建并启用。
- [ ] 检查微信接口权限及云函数出口 IP 白名单。
- [ ] 先手动执行一次真实同步并核对人数，再等待自动任务。

## 首次验证

没有 admin 角色账号时，可先在 HBuilderX/UniCloud 控制台用定时事件测试：

```json
{"Type":"Timer","TriggerName":"manual-deploy-check"}
```

1. 用上述事件调用 `member-crowd-daily`，应返回新建的 `jobId`。
2. 用同样事件调用 `member-crowd-worker`，应完成 CSV 上传并得到 `crowdId`，状态通常进入 `waiting`。
3. 微信处理完成后再次手动调用 worker，直到任务变为 `published/complete`；自动触发时 worker 每 10 分钟检查一次。
4. 在 `member_crowd_sync_jobs` 检查 `member_count`、`uploaded_count`、`effective_count`。
5. 再次触发 daily；会员集合未变化时，最终应得到 `skipped/unchanged`。

失败时不会清除或替换最近成功发布记录。微信返回人群包数量上限时，需要到 We分析后台删除旧的 API 人群包。
