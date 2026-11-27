/**
 * 「现代必备生存指南」官方联盟实时券源 Cloudflare Worker 转发模板
 *
 * 合规与安全原则：
 * 1. 仅对接官方开放联盟 API（美团联盟 / 淘宝联盟 / 抖音精选联盟）或用户自定义 JSON 变量；
 *    严禁抓包、逆向或绕过任何登录/验证码/反爬限制。
 * 2. 所有 AppKey / AppSecret 均通过 Cloudflare Worker Secrets 环境变量注入（env.*），
 *    绝不写入前端代码或提交到公开 Git 仓库。
 * 3. 默认启用 Cloudflare Edge Cache（15 分钟 TTL），保护个人免费额度与官方 API 配额。
 *
 * 零依赖：可直接复制到 Cloudflare Dashboard -> Workers 编辑器部署，或使用 `wrangler deploy`。
 */

const DEFAULT_CACHE_TTL_SECONDS = 900;

function corsHeaders(env) {
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return toHex(sig);
}

/**
 * 1. 立即体验通道：读取环境变量 CUSTOM_DEALS_JSON（JSON 数组）
 *    在联盟审核通过前，你可以在 Cloudflare 后台变量中维护几条自己常用的券/链接，
 *    立刻验证前端实时拉取闭环。
 */
async function fetchCustomEnvDeals(env) {
  if (!env.CUSTOM_DEALS_JSON) return [];
  const parsed = JSON.parse(env.CUSTOM_DEALS_JSON);
  if (!Array.isArray(parsed)) return [];
  return parsed;
}

/**
 * 2. 美团联盟 Open API 适配器骨架（union.meituan.com）
 *    环境变量：
 *    - MEITUAN_APP_KEY
 *    - MEITUAN_APP_SECRET
 *    - MEITUAN_SID（推广位标识）
 *    - MEITUAN_API_ENDPOINT（按美团联盟最新文档填写，例如分销活动取链/商品查询接口）
 */
async function fetchMeituanUnionDeals(env) {
  if (!env.MEITUAN_APP_KEY || !env.MEITUAN_APP_SECRET || !env.MEITUAN_API_ENDPOINT) {
    return [];
  }

  const ts = Math.floor(Date.now() / 1000);
  const params = {
    appkey: env.MEITUAN_APP_KEY,
    sid: env.MEITUAN_SID || 'default',
    ts: String(ts),
  };

  // 按美团联盟文档对参数键名升序拼接后签名（请按你开通的具体接口文档核对签名算法）
  const sortedQuery = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  const sign = await hmacSha256Hex(env.MEITUAN_APP_SECRET, sortedQuery);

  const url = new URL(env.MEITUAN_API_ENDPOINT);
  for (const [k, v] of Object.entries({ ...params, sign })) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Meituan API HTTP ${res.status}`);
  }
  const payload = await res.json();
  const list = Array.isArray(payload?.data?.list)
    ? payload.data.list
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  return list.slice(0, 12).map((item, idx) => ({
    id: `mt-${item.id || item.actId || idx}`,
    platform: 'meituan',
    title: String(item.title || item.name || '美团官方活动券'),
    merchant: item.shopName ? String(item.shopName) : '美团联盟',
    discountBadge: String(item.couponInfo || item.discountBadge || '官方券'),
    finalPrice: typeof item.finalPrice === 'number' ? item.finalPrice : undefined,
    originalPrice: typeof item.originalPrice === 'number' ? item.originalPrice : undefined,
    minSpend: item.minSpend ? String(item.minSpend) : undefined,
    promoCode: item.token ? String(item.token) : undefined,
    url: item.clickUrl || item.shortLink || undefined,
    expiresAt: item.endTime ? String(item.endTime) : undefined,
    note: '美团官方联盟实时下发',
  }));
}

/**
 * 3. 淘宝联盟 Open API 适配器骨架（pub.alimama.com）
 *    环境变量：
 *    - TAOBAO_APP_KEY
 *    - TAOBAO_APP_SECRET
 *    - TAOBAO_ADZONE_ID
 *    - TAOBAO_MATERIAL_ID（如官方物料 ID）
 *    - TAOBAO_API_ENDPOINT（默认 https://eco.taobao.com/router/rest）
 */
async function fetchTaobaoUnionDeals(env) {
  if (!env.TAOBAO_APP_KEY || !env.TAOBAO_APP_SECRET || !env.TAOBAO_ADZONE_ID) {
    return [];
  }

  const endpoint = env.TAOBAO_API_ENDPOINT || 'https://eco.taobao.com/router/rest';
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);

  const params = {
    method: 'taobao.tbk.dg.optimus.material',
    app_key: env.TAOBAO_APP_KEY,
    sign_method: 'hmac-sha256',
    timestamp,
    format: 'json',
    v: '2.0',
    adzone_id: env.TAOBAO_ADZONE_ID,
    material_id: env.TAOBAO_MATERIAL_ID || '27446',
    page_size: '10',
  };

  const baseStr = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  const sign = (await hmacSha256Hex(env.TAOBAO_APP_SECRET, baseStr)).toUpperCase();

  const body = new URLSearchParams({ ...params, sign });
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Taobao API HTTP ${res.status}`);
  }
  const payload = await res.json();
  const list = payload?.tbk_dg_optimus_material_response?.result_list?.map_data || [];

  return list.slice(0, 12).map((item, idx) => {
    const couponAmount = Number(item.coupon_amount || 0);
    const zkPrice = Number(item.zk_final_price || 0);
    const finalPrice =
      zkPrice > 0 ? Math.max(0, Math.round((zkPrice - couponAmount) * 10) / 10) : undefined;
    const rawLink = item.coupon_share_url || item.click_url || '';
    const fullUrl = rawLink.startsWith('//') ? `https:${rawLink}` : rawLink || undefined;

    return {
      id: `tb-${item.item_id || idx}`,
      platform: 'taobao',
      title: String(item.title || '淘宝联盟补贴商品'),
      merchant: item.shop_title ? String(item.shop_title) : '淘宝官方联盟',
      discountBadge: couponAmount > 0 ? `领券立减 ¥${couponAmount}` : '官方特惠',
      finalPrice,
      originalPrice: zkPrice > 0 ? zkPrice : undefined,
      minSpend: item.coupon_start_fee ? `满 ${item.coupon_start_fee} 元可用` : undefined,
      url: fullUrl,
      expiresAt: item.coupon_end_time ? String(item.coupon_end_time) : undefined,
      note: '淘宝官方联盟实时下发',
    };
  });
}

/**
 * 4. 抖音精选联盟适配器骨架（buyin.jinritemai.com）
 *    环境变量：
 *    - DOUYIN_API_ENDPOINT
 *    - DOUYIN_BEARER_TOKEN
 */
async function fetchDouyinUnionDeals(env) {
  if (!env.DOUYIN_API_ENDPOINT || !env.DOUYIN_BEARER_TOKEN) {
    return [];
  }
  const res = await fetch(env.DOUYIN_API_ENDPOINT, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.DOUYIN_BEARER_TOKEN}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Douyin API HTTP ${res.status}`);
  }
  const payload = await res.json();
  const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];

  return list.slice(0, 10).map((item, idx) => ({
    id: `dy-${item.id || idx}`,
    platform: 'douyin',
    title: String(item.title || '抖音生活团购券'),
    merchant: item.merchant ? String(item.merchant) : '抖音精选联盟',
    discountBadge: String(item.discountBadge || '官方团购'),
    finalPrice: typeof item.finalPrice === 'number' ? item.finalPrice : undefined,
    originalPrice: typeof item.originalPrice === 'number' ? item.originalPrice : undefined,
    url: item.url || undefined,
    expiresAt: item.expiresAt ? String(item.expiresAt) : undefined,
    note: '抖音官方联盟实时下发',
  }));
}

export default {
  async fetch(request, env, ctx) {
    const headers = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'modern-survival-guide-deals-worker',
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers }
      );
    }

    if (url.pathname !== '/' && url.pathname !== '/deals') {
      return new Response(JSON.stringify({ error: 'Not Found. Use GET /deals' }), {
        status: 404,
        headers,
      });
    }

    const forceRefresh = url.searchParams.get('refresh') === '1';
    const cache = caches.default;
    const cacheKey = new Request(url.origin + '/deals', { method: 'GET' });

    if (!forceRefresh) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(cached.body, {
          status: cached.status,
          headers: { ...headers, 'X-Deals-Cache': 'HIT' },
        });
      }
    }

    const results = await Promise.allSettled([
      fetchCustomEnvDeals(env),
      fetchMeituanUnionDeals(env),
      fetchTaobaoUnionDeals(env),
      fetchDouyinUnionDeals(env),
    ]);

    const items = [];
    const warnings = [];
    const sourceNames = ['custom', 'meituan', 'taobao', 'douyin'];

    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        items.push(...r.value);
      } else if (r.status === 'rejected') {
        warnings.push(`${sourceNames[idx]}: ${String(r.reason?.message || r.reason)}`);
      }
    });

    const bodyPayload = {
      updatedAt: new Date().toISOString(),
      sourceName: env.SOURCE_NAME || '我的个人联盟实时券源',
      items,
      ...(warnings.length > 0 ? { warnings } : {}),
    };

    const ttl = Number(env.CACHE_TTL_SECONDS || DEFAULT_CACHE_TTL_SECONDS);
    const response = new Response(JSON.stringify(bodyPayload, null, 2), {
      status: 200,
      headers: {
        ...headers,
        'Cache-Control': `public, max-age=${ttl}`,
        'X-Deals-Cache': 'MISS',
      },
    });

    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
};
