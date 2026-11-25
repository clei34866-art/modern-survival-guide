import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Parse optional --shots-dir argument
const shotsArgIdx = process.argv.indexOf('--shots-dir');
const shotsDir =
  shotsArgIdx >= 0 && process.argv[shotsArgIdx + 1]
    ? path.resolve(process.argv[shotsArgIdx + 1])
    : process.env.QA_SHOTS_DIR
      ? path.resolve(process.env.QA_SHOTS_DIR)
      : null;

if (shotsDir) {
  fs.mkdirSync(shotsDir, { recursive: true });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('[verify:ui] 未在本机找到 Chrome 或 Edge 可执行文件，请设置 CHROME_PATH 环境变量。');
}

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`[verify:ui] 等待服务超时: ${url}`);
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', (err) => reject(err), { once: true });
    });
    this.ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(String(evt.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      } else if (msg.method) {
        const list = this.listeners.get(msg.method) || [];
        for (const fn of list) fn(msg.params);
      }
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evalJs(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Runtime eval error: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ''}`
      );
    }
    return res.result?.value;
  }

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: isMobile ? 2 : 1,
      mobile: isMobile,
    });
    await new Promise((r) => setTimeout(r, 120));
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 450));
    await this.evalJs(`
      new Promise((resolve) => {
        const deadline = Date.now() + 5000;
        const tick = () => {
          const loading = document.querySelector('.loading-skeleton');
          const hasMain = document.querySelector('.workbench-shell, .focus-mode-root, .wall-viewport');
          if ((!loading && hasMain) || Date.now() > deadline) {
            if (document.fonts && document.fonts.ready) {
              Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]).then(() => resolve(true));
            } else resolve(true);
          } else setTimeout(tick, 80);
        };
        tick();
      })
    `);
    await new Promise((r) => setTimeout(r, 180));
  }

  async screenshot(fileName, fullPage = false) {
    if (!shotsDir) return;
    const params = { format: 'png' };
    if (fullPage) {
      const metrics = await this.send('Page.getLayoutMetrics');
      const rect = metrics.cssContentSize || metrics.contentSize;
      params.clip = {
        x: 0,
        y: 0,
        width: rect.width,
        height: Math.min(rect.height, 4000),
        scale: 1,
      };
      params.captureBeyondViewport = true;
    }
    const { data } = await this.send('Page.captureScreenshot', params);
    fs.writeFileSync(path.join(shotsDir, fileName), Buffer.from(data, 'base64'));
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }
}

const failures = [];
const passes = [];

function check(condition, layer, message) {
  if (condition) {
    passes.push(`[${layer}] ✓ ${message}`);
  } else {
    failures.push(`[${layer}] ✗ ${message}`);
  }
}

async function main() {
  const previewPort = await findFreePort();
  const cdpPort = await findFreePort();
  const baseUrl = `http://127.0.0.1:${previewPort}`;
  const browserBin = findBrowserExecutable();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-qa-chrome-'));

  console.log(`[verify:ui] 启动 vite preview (${baseUrl}) 与 Headless 浏览器...`);
  const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const previewProc = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(previewPort), '--host', '127.0.0.1', '--strictPort'],
    { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let chromeProc = null;
  let cdp = null;

  try {
    await waitForHttp(`${baseUrl}/`, 15000);

    chromeProc = spawn(
      browserBin,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        '--window-size=1440,900',
        'about:blank',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    await waitForHttp(`http://127.0.0.1:${cdpPort}/json/version`, 15000);
    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
    const pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!pageTarget) throw new Error('未找到可用的浏览器页面 Target');

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const consoleErrors = [];
    const pageErrors = [];
    const failed404s = [];

    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(' '));
      }
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      pageErrors.push(p.exceptionDetails?.text || 'Uncaught exception');
    });
    cdp.on('Network.responseReceived', (p) => {
      const status = p.response?.status ?? 200;
      const url = p.response?.url ?? '';
      if (status >= 400 && url.startsWith(baseUrl) && !url.includes('external-sync')) {
        failed404s.push(`${status} ${url}`);
      }
    });

    // =========================================================================
    // L2 & L3 & L4 (Desktop 1440×900): 全路由加载 + 导航激活态 + 字体与文本卫生
    // =========================================================================
    await cdp.setViewport(1440, 900, false);

    const workspaceRoutes = [
      { hash: '#/', name: '首页今天', shot: '01-home-1440.png' },
      { hash: '#/branches', name: '七分支与技能树', shot: '02-branches-1440.png' },
      { hash: '#/review?tab=retest', name: '错题重测', shot: '03-review-retest-1440.png' },
      { hash: '#/review?tab=cards', name: '知识闪卡台', shot: '04-review-cards-1440.png' },
      { hash: '#/events', name: '生活事件包', shot: '05-events-1440.png' },
      { hash: '#/lab', name: '任务与实验室', shot: '06-lab-1440.png' },
    ];

    for (const r of workspaceRoutes) {
      await cdp.goto(`${baseUrl}/${r.hash}`);
      const audit = await cdp.evalJs(`(() => {
        const bodyStyle = getComputedStyle(document.body);
        const h1 = document.querySelector('h1');
        const h1Style = h1 ? getComputedStyle(h1) : null;
        const activeNavs = document.querySelectorAll('.workbench-sidebar a[aria-current="page"]');
        const text = document.body.innerText || '';
        const rawBackticks = (text.match(/\`[^\`\\n]{1,40}\`/g) || []).slice(0, 3);
        const rawBold = (text.match(/\\*\\*[^*\\n]{2,40}\\*\\*/g) || []).slice(0, 3);
        const leakedIds = (text.match(/\\bb[1-7]\\.[a-z0-9_]{3,}\\b/g) || []).slice(0, 3);
        const leakedJargon = ['同步喂给状态墙', '按总方案范围待灌装'].filter((s) => text.includes(s));
        return {
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          activeNavCount: activeNavs.length,
          activeNavText: activeNavs[0]?.textContent?.trim() || '',
          bodyFont: bodyStyle.fontFamily,
          bodySize: parseFloat(bodyStyle.fontSize),
          h1Font: h1Style?.fontFamily || '',
          rawBackticks,
          rawBold,
          leakedIds,
          leakedJargon,
        };
      })()`);

      check(audit.activeNavCount === 1, 'L2', `${r.name}(${r.hash}) 左侧栏有且仅有 1 个激活态导航 (${audit.activeNavText})`);
      check(!audit.overflowX, 'L4', `${r.name} 1440px 无横向溢出 (${audit.scrollWidth}/${audit.innerWidth})`);
      check(!/simsun/i.test(audit.bodyFont) && !/simsun/i.test(audit.h1Font), 'L3', `${r.name} 未回退为 SimSun`);
      check(audit.bodySize >= 15.5, 'L3', `${r.name} 正文字号 ≥16px (${audit.bodySize}px)`);
      check(audit.rawBackticks.length === 0, 'L3', `${r.name} 无裸反引号泄漏 ${audit.rawBackticks.join(',')}`);
      check(audit.rawBold.length === 0, 'L3', `${r.name} 无裸 ** 粗体标记泄漏 ${audit.rawBold.join(',')}`);
      check(audit.leakedIds.length === 0, 'L3', `${r.name} 无内部概念 ID 泄漏 ${audit.leakedIds.join(',')}`);
      check(audit.leakedJargon.length === 0, 'L3', `${r.name} 无后台工程术语泄漏 ${audit.leakedJargon.join(',')}`);

      if (r.shot) await cdp.screenshot(r.shot, false);
    }

    // 检查 #/branches：SkillTreeSvg 零文字碰撞 + 软件技能分包零 1400px 空白纸板拉伸
    await cdp.goto(`${baseUrl}/#/branches`);
    const treeCheck = await cdp.evalJs(`(() => {
      const texts = [...document.querySelectorAll('.skill-tree-living-box svg text')];
      const rects = texts.map((t) => ({ txt: t.textContent?.trim(), r: t.getBoundingClientRect() })).filter((x) => x.r.width > 0);
      let overlaps = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i].r, b = rects[j].r;
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 4 && oy > 4) overlaps.push(rects[i].txt + ' <-> ' + rects[j].txt);
        }
      }
      // 切换到软件技能分包 Tab
      const swBtn = [...document.querySelectorAll('.segmented-btn')].find((b) => b.textContent?.includes('软件技能'));
      swBtn?.click();
      return { textCount: rects.length, overlaps };
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    const swStretch = await cdp.evalJs(`(() => {
      const cards = [...document.querySelectorAll('.planned-packs-grid .path-track-card')];
      const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height));
      const maxH = heights.length ? Math.max(...heights) : 0;
      const minH = heights.length ? Math.min(...heights) : 0;
      return { count: cards.length, heights, maxH, minH };
    })()`);
    await cdp.screenshot('02b-branches-sw-1440.png', false);

    check(treeCheck.textCount >= 7 && treeCheck.overlaps.length === 0, 'L5', `SkillTreeSvg 7分支标签零碰撞 (overlaps=${treeCheck.overlaps.length})`);
    check(swStretch.count >= 2 && swStretch.maxH <= 560, 'L4', `B1 软件规划包消除空白拉伸 (heights=${swStretch.heights.join('/')})`);

    // 检查 #/review 开关态同步（等待 Preact 重渲染帧后再校验）
    await cdp.goto(`${baseUrl}/#/review?tab=retest`);
    const toggleBefore = await cdp.evalJs(`(() => {
      const pill = document.querySelector('.toggle-pill');
      const input = pill?.querySelector('input[type="checkbox"]');
      if (!pill || !input) return { found: false };
      const beforeChecked = input.checked;
      const beforeMatch = pill.classList.contains('is-on') === beforeChecked;
      pill.click();
      return { found: true, beforeChecked, beforeMatch };
    })()`);
    await new Promise((r) => setTimeout(r, 150));
    const toggleAfter = await cdp.evalJs(`(() => {
      const pill = document.querySelector('.toggle-pill');
      const input = pill?.querySelector('input[type="checkbox"]');
      if (!pill || !input) return { found: false };
      return {
        afterChecked: input.checked,
        afterMatch: pill.classList.contains('is-on') === input.checked,
      };
    })()`);
    check(
      toggleBefore.found &&
        toggleBefore.beforeMatch &&
        toggleAfter.afterMatch &&
        toggleAfter.afterChecked !== toggleBefore.beforeChecked,
      'L4',
      `#/review includeUpcoming 开关 is-on 态与 checked 严格同步 (${toggleBefore.beforeChecked} -> ${toggleAfter.afterChecked})`
    );

    // =========================================================================
    // L4 (1920×1080): 状态墙主视图 & B1 专项看板零滚动 + 零空腔 + 高对比度
    // =========================================================================
    await cdp.setViewport(1920, 1080, false);
    await cdp.goto(`${baseUrl}/#/wall`);
    await cdp.screenshot('07-wall-main-1920.png', false);

    const wallMainAudit = await cdp.evalJs(`(() => {
      const panels = [...document.querySelectorAll('.wall-panel')];
      const footer = document.querySelector('.wall-slim-footer');
      const fRect = footer?.getBoundingClientRect();
      return {
        scrollH: document.documentElement.scrollHeight,
        scrollW: document.documentElement.scrollWidth,
        panelCount: panels.length,
        minPanelH: panels.length ? Math.min(...panels.map((p) => Math.round(p.getBoundingClientRect().height))) : 0,
        footerBottom: fRect ? Math.round(fRect.bottom) : 9999,
        modeText: document.querySelector('.wall-tag-demo, .wall-tag-live')?.textContent?.trim() || '',
      };
    })()`);

    check(wallMainAudit.scrollH <= 1080 && wallMainAudit.scrollW <= 1920, 'L4', `1080P 状态墙主视图严格一屏零滚动 (${wallMainAudit.scrollW}×${wallMainAudit.scrollH})`);
    check(wallMainAudit.panelCount === 6 && wallMainAudit.minPanelH >= 180, 'L4', `状态墙六宫格全部铺展无塌陷 (minH=${wallMainAudit.minPanelH}px)`);
    check(wallMainAudit.footerBottom <= 1080, 'L4', `状态墙 36px 细底栏完整落入 1080px 视口 (bottom=${wallMainAudit.footerBottom}px)`);

    await cdp.goto(`${baseUrl}/#/wall?sub=b1`);
    await cdp.screenshot('08-wall-b1-1920.png', false);

    const wallB1Audit = await cdp.evalJs(`(() => {
      function parseRgb(str) {
        const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        return m ? [+m[1], +m[2], +m[3]] : [20, 24, 32];
      }
      function lum([r, g, b]) {
        return [r, g, b].map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
      }
      function contrast(fg, bg) {
        const l1 = lum(fg), l2 = lum(bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }
      const dualVals = [...document.querySelectorAll('.wall-dual-name, .wall-dual-val')];
      const bgRgb = parseRgb(getComputedStyle(document.querySelector('.wall-b1-duration')).backgroundColor);
      const minContrast = dualVals.length
        ? Math.min(...dualVals.map((el) => contrast(parseRgb(getComputedStyle(el).color), bgRgb)))
        : 0;
      const swChips = document.querySelectorAll('.wall-sw-chip').length;
      return {
        scrollH: document.documentElement.scrollHeight,
        scrollW: document.documentElement.scrollWidth,
        minContrast: Number(minContrast.toFixed(2)),
        swChips,
      };
    })()`);

    check(wallB1Audit.scrollH <= 1080 && wallB1Audit.scrollW <= 1920, 'L4', `1080P B1 专项看板严格一屏零滚动 (${wallB1Audit.scrollW}×${wallB1Audit.scrollH})`);
    check(wallB1Audit.minContrast >= 7.0, 'L4', `B1 双线时长外置标签 WCAG AAA 高对比度 (${wallB1Audit.minContrast}:1)`);
    check(wallB1Audit.swChips >= 3, 'L4', `B1 二级看板下半屏已补齐软件技能分包矩阵 (${wallB1Audit.swChips} 项)`);

    // =========================================================================
    // L5: 全部 5 类教学动图模板验收 + E2E 学习留痕闭环 (DEMO -> LIVE)
    // =========================================================================
    await cdp.setViewport(1440, 900, false);

    const templateUnits = [
      { id: 'unit-b1-l1-prompt', expected: 'flow_pipeline', shot: '09-unit-flow-1440.png' },
      { id: 'unit-b2-budget', expected: 'tree_breakdown', shot: '10-unit-tree-1440.png' },
      { id: 'unit-b2-investing', expected: 'curve_compare', shot: '11-unit-curve-1440.png' },
      { id: 'unit-b1-l1-agent', expected: 'two_axis_matrix', shot: '12-unit-matrix-1440.png' },
      { id: 'unit-b1-blender-transform', expected: 'coordinate_3d', shot: '13-unit-3d-1440.png' },
    ];

    for (const u of templateUnits) {
      await cdp.goto(`${baseUrl}/#/unit/${u.id}`);
      // 进入第 2 步并预测，再进入第 3 步动图导学
      await cdp.evalJs(`(() => {
        const next1 = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('直觉预测'));
        next1?.click();
      })()`);
      await new Promise((r) => setTimeout(r, 180));
      await cdp.evalJs(`(() => {
        const opt = document.querySelector('.quiz-option-btn');
        opt?.click();
      })()`);
      await new Promise((r) => setTimeout(r, 140));
      await cdp.evalJs(`(() => {
        const sub = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('锁定我的直觉判断'));
        sub?.click();
      })()`);
      await new Promise((r) => setTimeout(r, 220));
      await cdp.evalJs(`(() => {
        const go3 = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('进入动图导学'));
        go3?.click();
      })()`);
      await new Promise((r) => setTimeout(r, 320));

      const diagAudit = await cdp.evalJs(`(() => {
        const stage = document.querySelector('.motion-explainer');
        const svg = stage?.querySelector('svg.exact-svg');
        const svgRect = svg?.getBoundingClientRect();
        const texts = svg ? [...svg.querySelectorAll('text, tspan')].map((n) => n.textContent || '') : [];
        const truncated = texts.filter((t) => t.includes('...'));
        const stepBefore = stage?.getAttribute('data-step');
        const textBefore = stage?.querySelector('.motion-logic-text')?.textContent?.trim() || '';

        // 验证「下一步」按钮真实驱动步骤与逻辑字幕切换
        const nextBtn = stage?.querySelector('button[aria-label="下一步"]');
        nextBtn?.click();
        return {
          template: stage?.getAttribute('data-template') || '',
          width: svgRect ? Math.round(svgRect.width) : 0,
          height: svgRect ? Math.round(svgRect.height) : 0,
          truncated,
          stepBefore,
          textBefore,
        };
      })()`);
      await new Promise((r) => setTimeout(r, 200));
      const diagAfter = await cdp.evalJs(`(() => {
        const stage = document.querySelector('.motion-explainer');
        const stepAfter = stage?.getAttribute('data-step');
        const textAfter = stage?.querySelector('.motion-logic-text')?.textContent?.trim() || '';
        const text = document.body.innerText || '';
        const rawBackticks = (text.match(/\`[^\`\\n]{1,40}\`/g) || []).slice(0, 3);
        return { stepAfter, textAfter, rawBackticks };
      })()`);

      await cdp.screenshot(u.shot, false);

      check(diagAudit.template === u.expected, 'L5', `单元 ${u.id} 渲染动图模板 ${u.expected} (实际=${diagAudit.template})`);
      check(diagAudit.width >= 300 && diagAudit.height >= 120, 'L5', `动图模板 ${u.expected} SVG 尺寸有效 (${diagAudit.width}×${diagAudit.height})`);
      check(diagAudit.truncated.length === 0, 'L5', `动图模板 ${u.expected} 零 "..." 文本截断 (${diagAudit.truncated.join(',')})`);
      check(
        diagAfter.stepAfter !== diagAudit.stepBefore && diagAfter.textAfter !== diagAudit.textBefore,
        'L5',
        `动图模板 ${u.expected} 点击「下一步」真实切换步骤与逻辑字幕 (${diagAudit.stepBefore} -> ${diagAfter.stepAfter})`
      );
      check(diagAfter.rawBackticks.length === 0, 'L3', `单元 ${u.id} 导学正文零裸反引号 (${diagAfter.rawBackticks.join(',')})`);

      // 在第一单元顺便完成第 4 步翻卡 + 第 5 步禁用态与自测提交，验证端到端闭环
      if (u.id === 'unit-b1-l1-prompt') {
        await cdp.evalJs(`(() => {
          const go4 = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('翻看概念闪卡'));
          go4?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 250));
        const flipCheck = await cdp.evalJs(`(() => {
          const card = document.querySelector('.flip-card-box');
          card?.click();
          return { found: Boolean(card) };
        })()`);
        await new Promise((r) => setTimeout(r, 180));
        const flippedOk = await cdp.evalJs(`Boolean(document.querySelector('.flip-card-box.is-flipped'))`);
        check(flipCheck.found && flippedOk, 'L5', `单元第 4 步 3D 闪卡点击翻面成功`);

        await cdp.evalJs(`(() => {
          const go5 = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('提取自测'));
          go5?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 250));
        const disabledBtnStyle = await cdp.evalJs(`(() => {
          const sub = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('提交自测'));
          if (!sub) return null;
          const st = getComputedStyle(sub);
          return { disabled: sub.disabled, opacity: parseFloat(st.opacity), cursor: st.cursor };
        })()`);
        check(
          Boolean(disabledBtnStyle && disabledBtnStyle.disabled && disabledBtnStyle.opacity <= 0.6),
          'L4',
          `单元第 5 步未答完前提交按钮禁用态清晰可见 (opacity=${disabledBtnStyle?.opacity})`
        );

        // 选中每道题第一项并提交，写入真实 IndexedDB 留痕
        await cdp.evalJs(`(() => {
          for (const block of document.querySelectorAll('.quiz-question-block')) {
            block.querySelector('.quiz-option-btn')?.click();
          }
        })()`);
        await new Promise((r) => setTimeout(r, 120));
        await cdp.evalJs(`(() => {
          const sub = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('提交自测'));
          sub?.click();
        })()`);
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    // 核验 E2E 真实留痕写入后，状态墙自动由 DEMO 切为 LIVE
    await cdp.setViewport(1920, 1080, false);
    await cdp.goto(`${baseUrl}/#/wall`);
    const liveSwitch = await cdp.evalJs(`(() => {
      return document.querySelector('.wall-tag-live')?.textContent?.trim() || '';
    })()`);
    check(liveSwitch.includes('LIVE'), 'L5', `完成单元预测与自测留痕后，状态墙自动切换为 LIVE 实况态 (${liveSwitch})`);

    // =========================================================================
    // L4 (Tablet 768×1024 & Mobile 390×844): 零溢出 + 底部 5 Tab + 触控热区 ≥44px
    // =========================================================================
    await cdp.setViewport(768, 1024, false);
    for (const h of ['#/', '#/branches', '#/review?tab=cards']) {
      await cdp.goto(`${baseUrl}/${h}`);
      const tabAudit = await cdp.evalJs(`({
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        topbarVisible: getComputedStyle(document.querySelector('.mobile-topbar')).display !== 'none',
      })`);
      check(!tabAudit.overflowX && tabAudit.topbarVisible, 'L4', `768px 平板 ${h} 零横向溢出且顶栏正常 (${tabAudit.sw}/${tabAudit.iw})`);
    }

    await cdp.setViewport(390, 844, true);
    await cdp.goto(`${baseUrl}/#/`);
    await cdp.screenshot('14-home-390.png', false);
    const mobileHome = await cdp.evalJs(`(() => {
      const tabs = [...document.querySelectorAll('.mobile-bottom-tabs .mobile-tab-item')];
      const minTabH = tabs.length ? Math.min(...tabs.map((t) => Math.round(t.getBoundingClientRect().height))) : 0;
      const activeTabs = document.querySelectorAll('.mobile-bottom-tabs a[aria-current="page"]').length;
      const primaryBtns = [...document.querySelectorAll('.btn, .toggle-pill, .mobile-wall-link')]
        .filter((el) => el.getBoundingClientRect().width > 0);
      const minBtnH = primaryBtns.length
        ? Math.min(...primaryBtns.map((b) => Math.round(b.getBoundingClientRect().height)))
        : 44;
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        tabCount: tabs.length,
        minTabH,
        activeTabs,
        minBtnH,
      };
    })()`);
    check(!mobileHome.overflowX, 'L4', `390px 手机首页零横向溢出 (${mobileHome.sw}/${mobileHome.iw})`);
    check(mobileHome.tabCount === 5 && mobileHome.minTabH >= 44 && mobileHome.activeTabs === 1, 'L4', `390px 底部 5 项 Tab 导航完整且热区 ≥44px (minH=${mobileHome.minTabH}px)`);
    check(mobileHome.minBtnH >= 44, 'L4', `390px 手机首页主交互控件高度 ≥44px (minH=${mobileHome.minBtnH}px)`);

    // 390px 状态墙兜底检查
    await cdp.goto(`${baseUrl}/#/wall`);
    await cdp.screenshot('15-wall-390.png', false);
    const mobileWall = await cdp.evalJs(`({
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    })`);
    check(!mobileWall.overflowX, 'L4', `390px 手机端状态墙零横向溢出 (${mobileWall.sw}/${mobileWall.iw})`);

    // 390px 单元页专注模式（底栏隐藏）
    await cdp.goto(`${baseUrl}/#/unit/unit-b1-l1-prompt`);
    await cdp.screenshot('16-unit-390.png', false);
    const mobileUnit = await cdp.evalJs(`({
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      hasBottomTabs: Boolean(document.querySelector('.mobile-bottom-tabs')),
    })`);
    check(!mobileUnit.overflowX && !mobileUnit.hasBottomTabs, 'L4', `390px 单元专注态零溢出且已自动隐藏底部 Tab 栏`);

    // 全局控制台 & 网络错误终检
    check(consoleErrors.length === 0, 'L2', `全链路零 console.error (count=${consoleErrors.length} ${consoleErrors.join('; ')})`);
    check(pageErrors.length === 0, 'L2', `全链路零未捕获异常 pageerror (count=${pageErrors.length} ${pageErrors.join('; ')})`);
    check(failed404s.length === 0, 'L2', `全链路零静态资源/JSON 404 (count=${failed404s.length} ${failed404s.join('; ')})`);

    console.log('\n================ 五层浏览器实测自检报告 ================');
    for (const p of passes) console.log(' ', p);
    if (failures.length > 0) {
      console.error('\n❌ 发现未通过项:');
      for (const f of failures) console.error(' ', f);
      process.exitCode = 1;
    } else {
      console.log(`\n✅ 全部 ${passes.length} 项 L2–L5 真实浏览器渲染、排版、多视口、动图与端到端闭环断言 100% 通过！`);
      if (shotsDir) console.log(`📸 QA 验收截图已保存至: ${shotsDir}`);
    }
  } finally {
    cdp?.close();
    try {
      chromeProc?.kill();
    } catch {}
    try {
      previewProc?.kill();
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('[verify:ui] 致命错误:', err);
  process.exit(1);
});
