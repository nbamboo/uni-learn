# virtualPayment

个人主体微信小程序会员虚拟支付云函数，支持：

- `getMembership`：返回当前登录用户的会员状态、权益和四个固定商品；自然到期享有最多 6 小时宽限，`revoked` 状态不享有宽限。
- `createOrder`：校验登录用户与支付 openid，生成唯一订单和 `wx.requestVirtualPayment` 所需签名。
- `queryOrder`：调用微信 `query_order`，在订单已支付时补发会员权益。
- URL 化回调：接收 `xpay_goods_deliver_notify` 和 `xpay_refund_notify`，验签、核单、幂等发货或撤销权益。
- 定时触发：每 5 分钟补查最多 50 笔待支付订单；微信连续返回“订单不存在”至少 3 次且订单已超过 30 分钟时关闭无效本地订单，延迟发货通知仍可重新发货。

密钥、上传顺序与现网验收步骤见 `uniCloud-alipay/VIRTUAL_PAYMENT_DEPLOY.md`。

客户端普通页面缓存会员状态 6 小时。退款回调会立即撤销对应授权，后台人工撤销必须将会员状态设为 `revoked`；两者都会在下一次会员状态校验时覆盖客户端本地缓存。会员的云端学习数据 action 仍由 `questionBankUser` 在服务端独立校验，不能依赖客户端缓存绕过。
