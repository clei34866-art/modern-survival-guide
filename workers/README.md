# 官方联盟实时券源 Cloudflare Worker 部署指南

本目录提供一份 **零依赖、可直接部署在 Cloudflare Workers 免费额度** 的只读转发模板（`coupons-worker.js`），用于给「现代必备生存指南」的 **遇事速查 → 日常省钱与领券台** 提供实时优惠券数据。

> **合规与安全说明**
> - 本模板仅调用你个人合法申请的官方开放联盟 API（美团联盟、淘宝联盟、抖音精选联盟），**不包含任何抓包、绕过登录或反爬爬虫代码**。
> - 所有 `AppKey` / `AppSecret` 均保存在 Cloudflare 后台加密 Secrets 中，前端只消费公开只读 JSON，永不泄露密钥。

---

## 3 分钟快速上手（先跑通，再接联盟 Key）

### 第一步：在 Cloudflare 免费部署 Worker
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)（免费套餐每天 10 万次请求足够个人使用）。
2. 进入左侧 **Workers & Pages → Create Worker**，命名如 `my-deals-hub`。
3. 点击 **Edit code**，把本仓库的 `workers/coupons-worker.js` 全部内容粘贴进去并点击 **Deploy**。
   - 如果你习惯命令行，也可以在本目录执行：
     ```bash
     npx wrangler deploy
     ```

### 第二步：先用 `CUSTOM_DEALS_JSON` 立刻测试实时下发（可选）
在联盟账号审核通过前，你可以先在 Worker 的 **Settings → Variables and Secrets** 新增一个普通变量 `CUSTOM_DEALS_JSON`，填入以下 JSON 测试：

```json
[
  {
    "id": "demo-mt-1",
    "platform": "meituan",
    "title": "工作日午饭满 25 减 10 神券",
    "merchant": "美团外卖",
    "discountBadge": "满 25 减 10",
    "finalPrice": 15,
    "originalPrice": 25,
    "minSpend": "满 25 元可用",
    "promoCode": "天天神券",
    "expiresAt": "2026-12-31",
    "note": "来自你的个人 Cloudflare Worker 实时推送"
  }
]
```

### 第三步：填进本站「配置实时券源」
1. 打开网站 **遇事速查（`#/events`）→ 落地生活省钱台 → 配置实时券源**。
2. 粘贴你的 Worker 地址（例如 `https://my-deals-hub.你的子域.workers.dev/deals`）。
3. 点击 **保存并同步实时券**，实时卡片会立刻出现在页面顶部并自动本地缓存。

---

## 正式接入各大官方联盟（全部支持个人免费申请）

| 平台 | 官方开放联盟入口 | 需要添加到 Worker Secrets 的环境变量 |
| --- | --- | --- |
| 美团外卖 / 到店 | `union.meituan.com`（美团联盟） | `MEITUAN_APP_KEY`, `MEITUAN_APP_SECRET`, `MEITUAN_SID`, `MEITUAN_API_ENDPOINT` |
| 淘宝 / 天猫 | `pub.alimama.com`（淘宝联盟） | `TAOBAO_APP_KEY`, `TAOBAO_APP_SECRET`, `TAOBAO_ADZONE_ID`, `TAOBAO_MATERIAL_ID` |
| 抖音团购 | `buyin.jinritemai.com`（抖音精选联盟） | `DOUYIN_API_ENDPOINT`, `DOUYIN_BEARER_TOKEN` |

### 安全建议
- 上线后建议把 `ALLOWED_ORIGIN` 环境变量从 `*` 改为你的站点域名（例如 `https://clei34866-art.github.io`），防止他人盗刷你的 Worker 额度。
- 默认开启 15 分钟边缘缓存（`CACHE_TTL_SECONDS=900`）；需要强制立即刷新时可请求 `/deals?refresh=1`。
