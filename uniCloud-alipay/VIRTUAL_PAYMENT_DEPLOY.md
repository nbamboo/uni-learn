# 个人主体小程序虚拟支付部署与验收

本项目按微信官方“虚拟支付：个人”指引接入，只使用一次性“道具直购”，不引入代币或自动续费订阅。会员商品、价格和发放时长均由服务端固定，客户端不能修改金额。

## 1. 开通条件与费用说明

开通前需在微信公众平台确认：

- 小程序主体为持中国大陆居民身份证的个人。
- 服务类目包含“工具”。
- 已完成小程序认证和备案。
- 个人主体小程序全终端月支付限额为 10 万元。

结算与退款规则：

- Android、鸿蒙、Windows 等终端按 T+3 结算，腾讯技术服务费为 1%。
- iOS 由 Apple 结算，通常约 45-60 天，Apple 佣金为 12%。
- Android 等终端可在 MP 后台退款，或调用退款接口；iOS 由用户向 App Store 申请，开发者不能主动发起。
- 支付后 180 天内退款，平台退还手续费；超过 180 天不退手续费。
- 退款成功后，本项目通过 `xpay_refund_notify` 撤销对应会员订单并重算会员有效期。

## 2. MP 后台开通与创建道具

在微信公众平台进入【支付与交易 → 虚拟支付】，完成资料提交、审核和扫码签约。记录 AppID、OfferID 和“现网 AppKey”。如果支持 iOS 支付，还需先配置小程序简称，并在虚拟支付基本配置中开通 Apple IAP 支付。

在【虚拟支付 → 道具管理】创建并发布下面四个现网道具。道具 ID 和价格必须完全一致，金额单位是分：

| 道具 ID | 名称 | 价格 | 发放时长 |
| --- | --- | ---: | ---: |
| `membership_1m` | 1个月会员 | 300 分 | 1 个月 |
| `membership_3m` | 3个月会员 | 600 分 | 3 个月 |
| `membership_6m` | 半年会员 | 1000 分 | 6 个月 |
| `membership_12m` | 1年会员 | 1500 分 | 12 个月 |

道具发布后通常需要约 10 分钟生效。不要在客户端维护另一份可修改价格；服务端的商品表是下单金额的唯一来源。

## 3. 服务端密钥配置

推荐在本机交互式终端运行：

```bash
node scripts/setup-virtual-payment-config.js
```

按提示输入 OfferID、小程序原始 ID 和现网 AppKey。AppKey 输入时不会显示；脚本会生成随机的 `callbackToken` 和 `encodingAESKey`，并只写入被 Git 忽略的本地配置文件。脚本不会覆盖已有配置。

也可以手动复制以下文件：

```text
uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/virtual-payment/config.example.json
```

为同目录下的 `config.json`，填写：

```json
{
  "offerId": "MP后台的OfferID",
  "appKey": "MP后台的现网AppKey",
  "callbackToken": "发货推送消息验签Token",
  "encodingAESKey": "安全模式的43位EncodingAESKey；明文模式可留空",
  "originalId": "小程序原始ID，通常以gh_开头"
}
```

`callbackToken` 必须与 MP 后台消息/发货推送配置使用的 Token 完全一致。建议使用微信推荐的安全模式，并填写对应的 `encodingAESKey`；代码同时兼容明文 XML/JSON 推送。AppID 和 AppSecret 复用 `uni-id/config.json` 中已配置的微信小程序登录信息。两个真实 `config.json` 均已加入 `.gitignore`，不得提交密钥。

`encodingAESKey` 必须是 43 位数字或英文字母，不能包含 `+`、`/`、`-`、`_` 等符号。如果历史配置由旧版脚本生成并被 MP 后台拒绝，可运行以下命令只轮换该密钥（不会改动 OfferID、AppKey、Token 或原始 ID），随后重新上传 `uni-config-center`：

```bash
node scripts/setup-virtual-payment-config.js --rotate-encoding-aes-key
```

配置后运行：

```bash
node scripts/check-user-cloud-readiness.js
node scripts/check-virtual-payment-readiness.js
```

检查脚本只判断配置是否存在，不会输出密钥内容。

## 4. 上传数据库和云函数

不要在 `uniCloud-alipay/database` 根目录执行“初始化云数据库”。应逐个上传 Schema，并按同名 `.index.json` 创建索引：

1. `question_bank_payment_orders.schema.json`
2. `question_bank_payment_orders.index.json`
3. `question_bank_memberships.schema.json`
4. `question_bank_memberships.index.json`

线上需确认存在以下 5 个业务索引（不含数据库自带的 `_id_`）：

| 数据表 | 索引名 | 字段（按顺序） | 属性 | 稀疏 |
| --- | --- | --- | --- | --- |
| `question_bank_memberships` | `memberships_user_unique` | `userId` 升序 `varchar` | 唯一 | 否 |
| `question_bank_memberships` | `memberships_status_expires` | `status` 升序 `varchar`、`expiresAt` 升序 `date` | 非唯一 | 是 |
| `question_bank_payment_orders` | `payment_orders_user_created` | `userId` 升序 `varchar`、`createdAt` 降序 `date` | 非唯一 | 否 |
| `question_bank_payment_orders` | `payment_orders_status_updated` | `status` 升序 `varchar`、`env` 升序 `int`、`updatedAt` 升序 `date` | 非唯一 | 否 |
| `question_bank_payment_orders` | `payment_orders_wx_order_unique` | `wxOrderId` 升序 `varchar` | 唯一 | 是 |

随后重新上传 `questionBankUser` 云函数，再上传 `virtualPayment` 云函数。`virtualPayment/package.json` 已配置：

- Node.js 18；
- URL 化路径 `/virtual-payment-notify`；
- 每 5 分钟查一次待支付订单的定时触发器；
- `uni-id-common` 与 `uni-config-center` 依赖。

上传后在 uniCloud Web 控制台确认 URL 化和定时触发器均已生效。复制完整 HTTPS URL，在 MP 后台【虚拟支付 → 基本配置 → 基础配置 → 发货推送配置】填写该地址。微信验证 URL 时，云函数会校验 `signature` 并原样返回 `echostr`。

在 MP 后台提交 URL 前，先用同一份本地配置验证已部署端点。脚本只从忽略提交的配置文件读取 Token，不会打印密钥：

```bash
node scripts/verify-virtual-payment-callback.js "https://实际云函数域名/virtual-payment-notify"
```

如果 MP 后台启用了接口调用 IP 白名单，需将当前支付宝云/uniCloud 服务空间的固定出口 IP 加入白名单，否则获取 `access_token` 和调用 `query_order` 会失败。

## 5. 实现的支付与权益链路

1. 会员页先调用 `uni.login` 获取一次性 code，再请求 `virtualPayment.createOrder`。
2. 云函数校验 uni-id token，并用 `auth.code2Session` 取得 `openid` 与 `session_key`；支付账号必须与当前 uni-id 用户绑定的 openid 一致。
3. 云函数生成唯一的 8-32 位 `outTradeNo`，保存待支付订单，并按原始 `signData` 计算 `paySig` 和用户态 `signature`。
4. 小程序调用 `wx.requestVirtualPayment`。iOS 会校验微信版本不低于 8.0.68。
5. 支付成功后，以 `xpay_goods_deliver_notify` 为主路径发货；服务端校验消息签名、用户、环境、道具、数量和金额，以 `wx_order_id` 幂等发放会员。
6. 前端支付回调只触发服务端查单，不直接开通会员。定时器每 5 分钟调用 `query_order` 补发漏单。微信连续返回“订单不存在”至少 3 次且本地订单已超过 30 分钟时，系统关闭该次未拉起支付的无效订单，避免永久重复查单；若之后仍收到有效发货推送，会照常幂等发货。
7. `questionBankUser` 在服务端限制错题集、收藏夹、收藏写入、考试模式和背题模式；会员过期后无法绕过前端直接调用这些接口。
8. 会员在答题结果页不渲染广告；非会员仍显示原有广告。

## 6. 本地自动验收

```bash
node uniCloud-alipay/cloudfunctions/virtualPayment/test.js
node uniCloud-alipay/cloudfunctions/questionBankUser/test.js
node scripts/test-membership-service.js
node scripts/test-user-practice-service.js
node scripts/test-practice-answer-modes.js
node scripts/check-user-cloud-readiness.js
node scripts/check-virtual-payment-readiness.js
```

其中支付测试使用微信官方签名示例固定向量，覆盖下单金额、两套签名、查单发货、重复推送幂等和退款撤销权益。

## 7. 官方“部署前检查清单”验收记录

代码完成不等于现网通过。以下项目只有拿到 MP 后台配置并完成真机小额支付后才能勾选：

- [x] 开放条件确认：个人主体 + 中国大陆居民身份证 + “工具”类目 + 已认证、备案。
- [x] 已在产品说明和会员页告知月支付限额为 10 万元。
- [x] MP 后台虚拟支付已开通。
- [x] 已取得并配置 AppID / OfferID / 现网 AppKey。
- [x] 四个现网道具已发布并在线复核：`membership_1m` 3 元、`membership_3m` 6 元、`membership_6m` 10 元、`membership_12m` 15 元。
- [ ] 如需 iOS 支付，已配置小程序简称并开通 Apple IAP。
- [x] 支付订单表与会员表已部署，5 个业务索引已在线逐项核验通过。
- [x] `virtualPayment` 已上传，消息推送接收 URL 化已部署；HTTPS、Token 签名和 `echostr` 回包已验证通过。
- [x] MP 后台发货推送 URL 已配置并启用；线上复核为安全模式、XML，URL 与已部署端点一致。
- [x] 微信后台当前开发/体验版本为 `3.7.1`（项目备注“虚拟支付功能1”，提交时间 2026-09-02 19:45:55）。
- [ ] 已用当前体验版完成一笔最低价测试支付。
- [x] 两套 HMAC-SHA256 签名函数已用官方固定示例核对通过。
- [x] 发货以微信 `wx_order_id` 幂等，重复推送单元测试通过。
- [ ] 真机 `wx.requestVirtualPayment` 已支付成功并收到发货推送。
- [x] `query_order` 前端补查和每 5 分钟定时补单已就绪；线上运行日志已核验定时器按 5 分钟触发。
- [x] 未拉起微信订单的历史 `pending` 记录已在线验证：第 3 次查单后自动转为 `closed`，不再永久占用补单队列。
- [x] 全业务源码广告扫描通过：仅存在答题结果页 1 个广告组件，并受有效会员状态控制。
- [x] 已在本文说明退款规则、结算周期和费率（Android 等 1%、iOS 12%）。
- [ ] 上线后已用小额真单核对“支付 → 推送 → 发货 → 会员生效 → 后台账单金额”。

真单验证时购买最低价的 `membership_1m`，确认 `question_bank_payment_orders.status` 为 `delivered`、`question_bank_memberships.expiresAt` 延长一个月，并验证广告、错题集/收藏夹、考试/背题模式三类权益。随后从 MP 后台执行一笔退款，确认订单变为 `refunded` 且相应时长被撤销。
