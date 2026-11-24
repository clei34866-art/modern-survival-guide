/**
 * M8 · 权威公开白名单抓源与缺口清单生成管线 (Node.js 离线构建脚本，配合 Scrapling MCP 协同核验)
 * 规则：
 * 1. 严格读取 config/whitelist.json，仅访问 allowedDomains 内的公开链接；
 * 2. 绝不绕过登录墙、付费墙、人机验证（401/403/429、Cloudflare Turnstile / CAPTCHA 立即中止并记入缺口清单）；
 * 3. 成功提取标题、章节大纲与摘要的公开源写入 public/data/scraped-sources.json（固化 sourceUrl / sourceOrg / fetchedAt / reviewAfter）；
 * 4. 不可达、404 或纯前端 SPA 空壳页面如实写入 public/data/content-gaps.json。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const whitelistPath = path.join(rootDir, 'config', 'whitelist.json');
const outSourcesPath = path.join(rootDir, 'public', 'data', 'scraped-sources.json');
const outGapsPath = path.join(rootDir, 'public', 'data', 'content-gaps.json');

const CHALLENGE_MARKERS = [
  'cf-turnstile',
  'g-recaptcha',
  'hcaptcha',
  'verify you are human',
  'just a moment...',
  'attention required! | cloudflare',
];

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMatchList(html, regex, maxItems = 8) {
  const results = [];
  let match;
  while ((match = regex.exec(html)) !== null && results.length < maxItems) {
    const clean = stripTags(match[1]);
    if (clean.length >= 3 && !results.includes(clean)) {
      results.push(clean.slice(0, 140));
    }
  }
  return results;
}

function getLocalDateIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchTarget(target, allowedDomains, todayIso, nowIso) {
  let parsedUrl;
  try {
    parsedUrl = new URL(target.url);
  } catch {
    return {
      ok: false,
      gap: {
        id: target.id,
        branchId: target.branchId,
        topic: target.topic,
        sourceOrg: target.sourceOrg,
        url: target.url,
        reason: 'URL 格式不合法',
        recordedAt: nowIso,
      },
    };
  }

  if (!allowedDomains.has(parsedUrl.hostname)) {
    return {
      ok: false,
      gap: {
        id: target.id,
        branchId: target.branchId,
        topic: target.topic,
        sourceOrg: target.sourceOrg,
        url: target.url,
        reason: `域名 ${parsedUrl.hostname} 不在白名单 allowedDomains 内，已拒绝抓取`,
        recordedAt: nowIso,
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(target.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'ModernSurvivalGuide-WhitelistArchiver/1.0 (PublicOpenAccessOnly)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });

    if ([401, 402, 403, 407, 429].includes(res.status)) {
      return {
        ok: false,
        gap: {
          id: target.id,
          branchId: target.branchId,
          topic: target.topic,
          sourceOrg: target.sourceOrg,
          url: target.url,
          reason: `HTTP ${res.status} 访问受限或存在权限门禁，严格遵循红线不予绕过`,
          recordedAt: nowIso,
        },
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        gap: {
          id: target.id,
          branchId: target.branchId,
          topic: target.topic,
          sourceOrg: target.sourceOrg,
          url: target.url,
          reason: `HTTP ${res.status} 页面不存在或暂时不可用`,
          recordedAt: nowIso,
        },
      };
    }

    const html = (await res.text()).slice(0, 450000);
    const headLower = html.slice(0, 8000).toLowerCase();
    for (const marker of CHALLENGE_MARKERS) {
      if (headLower.includes(marker)) {
        return {
          ok: false,
          gap: {
            id: target.id,
            branchId: target.branchId,
            topic: target.topic,
            sourceOrg: target.sourceOrg,
            url: target.url,
            reason: `检测到人机验证/防护挑战 (${marker})，按红线停止并记入缺口清单`,
            recordedAt: nowIso,
          },
        };
      }
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? stripTags(titleMatch[1]) : '';
    const headings = extractMatchList(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, 10);
    const paragraphs = extractMatchList(html, /<p[^>]*>([\s\S]*?)<\/p>/gi, 6).filter(
      (p) => p.length >= 25
    );

    if (headings.length === 0 && paragraphs.length === 0) {
      return {
        ok: false,
        gap: {
          id: target.id,
          branchId: target.branchId,
          topic: target.topic,
          sourceOrg: target.sourceOrg,
          url: target.url,
          reason: '公开静态请求仅返回前端 SPA 空壳（无服务端渲染正文），记入缺口待人工核阅',
          recordedAt: nowIso,
        },
      };
    }

    const item = {
      id: target.id,
      branchId: target.branchId,
      trackId: target.trackId,
      topic: target.topic,
      sourceOrg: target.sourceOrg,
      sourceUrl: target.url,
      finalUrl: res.url || target.url,
      fetchedAt: todayIso,
      pageTitle: pageTitle || target.topic,
      headings,
      excerpts: paragraphs.slice(0, 3),
    };
    if (target.publishedYear) item.publishedYear = target.publishedYear;
    if (target.reviewAfter) item.reviewAfter = target.reviewAfter;

    return { ok: true, item };
  } catch (err) {
    return {
      ok: false,
      gap: {
        id: target.id,
        branchId: target.branchId,
        topic: target.topic,
        sourceOrg: target.sourceOrg,
        url: target.url,
        reason: `公开网络直连超时或中断 (${err instanceof Error ? err.message : String(err)})`,
        recordedAt: nowIso,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const whitelist = JSON.parse(await fs.readFile(whitelistPath, 'utf-8'));
  const allowedDomains = new Set(whitelist.allowedDomains);
  const todayIso = getLocalDateIso();
  const nowIso = new Date().toISOString();

  const results = await Promise.all(
    whitelist.targets.map((t) => fetchTarget(t, allowedDomains, todayIso, nowIso))
  );

  const items = results.filter((r) => r.ok).map((r) => r.item);
  const gaps = results.filter((r) => !r.ok).map((r) => r.gap);

  await fs.writeFile(
    outSourcesPath,
    JSON.stringify(
      {
        version: '1.0.0',
        generatedAt: nowIso,
        engine: 'scrapling-mcp+node-whitelist-archiver',
        totalTargets: whitelist.targets.length,
        fetchedCount: items.length,
        items,
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );

  await fs.writeFile(
    outGapsPath,
    JSON.stringify(
      {
        version: '1.0.0',
        generatedAt: nowIso,
        policy: whitelist.policy,
        gapCount: gaps.length,
        gaps,
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );

  console.log(
    `[fetch:resources] 白名单抓源完成：总计 ${whitelist.targets.length} 条，成功归档 ${items.length} 条，记入 content-gaps.json 缺口清单 ${gaps.length} 条。`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
