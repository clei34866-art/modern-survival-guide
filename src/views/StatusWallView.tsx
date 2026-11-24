import { useEffect, useState } from 'preact/hooks';
import type { PlatformContentBundle } from '../core/contentLoader';
import { fetchServerSyncSnapshot, getLocalDateKey } from '../core/db';
import { computeWallViewModel } from '../core/wallAdapter';
import type { TelemetrySnapshot, WallExternalSyncPayload } from '../types/schema';

interface StatusWallViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  initialSubView?: 'main' | 'b1';
}

function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatDateLabel(date: Date): string {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')} ${weekdays[date.getDay()]}`;
}

export function StatusWallView({
  content,
  telemetry,
  initialSubView = 'main',
}: StatusWallViewProps) {
  const [subView, setSubView] = useState<'main' | 'b1'>(initialSubView);
  const [now, setNow] = useState<Date>(() => new Date());
  const [externalSync, setExternalSync] = useState<WallExternalSyncPayload | null>(null);
  const [forcePreviewDemo, setForcePreviewDemo] = useState<boolean>(false);

  // 每秒更新时钟，确保 1080P 常开挂屏鲜活
  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // 按配置每 60 秒静默拉取现有服务器 content/sync 数据（未配置则自动跳过回退本地）
  useEffect(() => {
    let active = true;
    const pullExternal = () => {
      fetchServerSyncSnapshot(content.wallConfig.externalSyncUrl).then((payload) => {
        if (active && payload) setExternalSync(payload);
      });
    };
    pullExternal();
    const refreshMs = Math.max(15, content.wallConfig.refreshIntervalSeconds) * 1000;
    const syncTimer = setInterval(pullExternal, refreshMs);
    return () => {
      active = false;
      clearInterval(syncTimer);
    };
  }, [content.wallConfig.externalSyncUrl, content.wallConfig.refreshIntervalSeconds]);

  const vm = computeWallViewModel(
    content,
    telemetry,
    externalSync,
    getLocalDateKey(now),
    forcePreviewDemo ? 'DEMO' : undefined
  );

  const totalDualMinutes = Math.max(
    1,
    vm.b1Kanban.aiLineMinutes + vm.b1Kanban.softwareLineMinutes
  );
  const aiRatioPercent = Math.round((vm.b1Kanban.aiLineMinutes / totalDualMinutes) * 100);
  const swRatioPercent = 100 - aiRatioPercent;

  // ============================================================================
  // 二级切换子视图：B1 AI 与软件专项数字看板（按需切入，一键返回六宫格主墙）
  // ============================================================================
  if (subView === 'b1') {
    return (
      <div class="wall-viewport" aria-label="1080P B1 AI与软件专项数字看板（二级视图）">
        <div class="wall-b1-subview">
          <header class="wall-b1-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                type="button"
                class="wall-btn"
                onClick={() => setSubView('main')}
              >
                ← 返回六宫格个人状态墙（主视图）
              </button>
              <h1 class="wall-panel-title">
                <span class="wall-dot" />
                B1 · AI 与软件专项数字看板（二级视图）
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                class={`wall-tag ${
                  vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'
                }`}
              >
                {vm.dataMode === 'LIVE'
                  ? '● LIVE · 真实留痕驱动'
                  : '○ DEMO · 示例数据演示'}
              </span>
              <span class="wall-tag">{formatClock(now)}</span>
              <a href="#/" class="wall-btn">
                返回站内
              </a>
            </div>
          </header>

          {/* 顶栏四联 KPI */}
          <div class="wall-b1-kpis">
            <div class="wall-panel">
              <div class="wall-kpi-sub">AI 五层路径总进度</div>
              <div class="wall-clock" style={{ color: 'var(--wall-green)', marginTop: '6px' }}>
                {vm.b1Kanban.fiveLayerOverallPercent}%
              </div>
              <div class="wall-kpi-sub" style={{ marginTop: '6px' }}>
                逐层过关 + 实战项目验收
              </div>
            </div>

            <div class="wall-panel">
              <div class="wall-kpi-sub">当前推进层级 & 产出完成度</div>
              <div style={{ fontSize: '16px', fontWeight: 600, margin: '6px 0 4px' }}>
                {vm.b1Kanban.currentLayerTitle}
              </div>
              <div class="wall-big-kpi" style={{ color: 'var(--wall-amber)' }}>
                {vm.b1Kanban.currentDeliverablePercent}%
              </div>
              <div class="wall-kpi-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                产出：{vm.b1Kanban.currentDeliverableTitle}
              </div>
            </div>

            <div class="wall-panel">
              <div class="wall-kpi-sub">连续 / 累计点亮天数</div>
              <div class="wall-clock" style={{ marginTop: '6px' }}>
                {vm.learning.consecutiveDays}{' '}
                <span style={{ fontSize: '18px', color: 'var(--wall-text-muted)' }}>
                  连续 / 共 {vm.learning.activeDaysTotal} 天
                </span>
              </div>
              <div class="wall-kpi-sub" style={{ marginTop: '6px' }}>
                断更不清零 · 正向累积
              </div>
            </div>

            <div class="wall-panel">
              <div class="wall-kpi-sub">今日流程完成情况</div>
              <div class="wall-clock" style={{ color: 'var(--wall-green)', marginTop: '6px' }}>
                {vm.learning.todayDone}/{vm.learning.todayTotal}
              </div>
              <div class="wall-kpi-sub" style={{ marginTop: '6px' }}>
                完成率 {vm.learning.todayPercent}%
                {vm.learning.lowBatteryMode ? '（保底版生效中）' : '（做完即停）'}
              </div>
            </div>
          </div>

          {/* 中左：L1–L5 各层掌握度矩阵 */}
          <section class="wall-panel wall-b1-layers">
            <div class="wall-panel-head">
              <h2 class="wall-panel-title">AI 能力线 L1–L5 各层掌握度与产出矩阵</h2>
              <span class="wall-tag">按答题正确率与单元过关聚合</span>
            </div>
            <div style={{ overflow: 'hidden' }}>
              {vm.b1Kanban.layers.map((layer) => (
                <div class="wall-layer-row" key={layer.trackId}>
                  <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--wall-green)' }}>
                    {layer.shortLabel}
                  </strong>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {layer.title.replace(/^AI L\d · /, '')}
                  </div>
                  <div>
                    <div class="wall-bar-track">
                      <div
                        class="wall-bar-fill"
                        style={{
                          width: `${layer.masteryPercent}%`,
                          backgroundColor: layer.unlocked ? '#3D7A8A' : '#3a424d',
                        }}
                      />
                    </div>
                    <div class="wall-kpi-sub" style={{ marginTop: '3px' }}>
                      掌握度 {layer.masteryPercent}% · 产出 {layer.deliverablePercent}%
                    </div>
                  </div>
                  <span class={`wall-tag ${layer.isCleared ? 'wall-tag-live' : ''}`}>
                    {layer.isCleared ? '✓ 已过关' : layer.unlocked ? '当前可学' : '🔒 待解锁'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 中右：AI 能力线 vs 软件技能线投入时长对照 */}
          <section class="wall-panel wall-b1-duration">
            <div class="wall-panel-head">
              <h2 class="wall-panel-title">双线投入时长对照（AI 线 vs 软件线）</h2>
              <span class="wall-tag">精确留痕聚合</span>
            </div>

            <svg viewBox="0 0 420 150" style={{ width: '100%', height: 'auto', marginBottom: '12px' }}>
              <rect x="0" y="14" width="420" height="46" rx="8" fill="#1F252C" />
              <rect
                x="0"
                y="14"
                width={Math.max(18, Math.round((aiRatioPercent / 100) * 420))}
                height="46"
                rx="8"
                fill="#3D7A8A"
              />
              <text x="14" y="42" fill="#F2EFE9" font-size="14" font-weight="600">
                AI 能力线：{vm.b1Kanban.aiLineMinutes} min（{aiRatioPercent}%）
              </text>

              <rect x="0" y="82" width="420" height="46" rx="8" fill="#1F252C" />
              <rect
                x="0"
                y="82"
                width={Math.max(18, Math.round((swRatioPercent / 100) * 420))}
                height="46"
                rx="8"
                fill="#63C787"
              />
              <text x="14" y="110" fill="#F2EFE9" font-size="14" font-weight="600">
                软件技能线（Blender/Git等）：{vm.b1Kanban.softwareLineMinutes} min（{swRatioPercent}%）
              </text>
            </svg>

            <div class="wall-weakness-box">
              <div class="wall-kpi-sub">薄弱概念 TOP 5（待 1/3/7 天重测）</div>
              <div class="wall-weakness-items">
                {vm.learning.weaknessTop5.length === 0 ? (
                  <span class="wall-kpi-sub">当前无积压错题</span>
                ) : (
                  vm.learning.weaknessTop5.map((w) => (
                    <span class="wall-weak-chip" key={w.label}>
                      [{w.branchId}] {w.label} · {w.detail}
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 默认主视图：1080P 全站个人状态墙六宫格（学习仅占其中一块，不喧宾夺主）
  // ============================================================================
  return (
    <div class="wall-viewport" aria-label="1080P 个人状态墙六宫格主视图">
      <div class="wall-bento-grid">
        {/* [1] 今日块 (4列 × 3行) */}
        <section class="wall-panel wall-panel-today" aria-label="今日块">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">
              <span class="wall-dot" />
              今日总览
            </h2>
            <span class="wall-tag">
              今日流程 {vm.learning.todayDone}/{vm.learning.todayTotal}（{vm.learning.todayPercent}%）
            </span>
          </div>
          <div class="wall-clock">{formatClock(now)}</div>
          <div class="wall-date-weather">
            {formatDateLabel(now)} · {vm.weather}
          </div>
          <ul class="wall-todo-list">
            {vm.todos.map((item, idx) => (
              <li class="wall-todo-item" key={idx}>
                • {item}
              </li>
            ))}
          </ul>
        </section>

        {/* [3] 学习块 (5列 × 4行) */}
        <section class="wall-panel wall-panel-learning" aria-label="学习块">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">
              <span class="wall-dot" />
              生存指南学习块
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                class={`wall-tag ${
                  vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'
                }`}
              >
                {vm.dataMode === 'LIVE' ? '● LIVE 真实留痕' : '○ DEMO 示例演示'}
              </span>
              <button
                type="button"
                class="wall-btn"
                onClick={() => setSubView('b1')}
                title="切换查看 B1 AI 与软件专项数字看板"
              >
                B1 专项看板 →
              </button>
            </div>
          </div>

          <div class="wall-learning-body">
            {/* 左栏：eudaimonia 小树缩略与活跃天数 */}
            <div class="wall-tree-summary-col">
              <div class="wall-kpi-sub">eudaimonia 技能树</div>
              <svg width="96" height="104" viewBox="0 0 96 104" aria-hidden="true">
                <ellipse cx="48" cy="94" rx="32" ry="6" fill="#26302B" />
                <path d="M48 92V44" stroke="#8C6D53" stroke-width="4" stroke-linecap="round" />
                <path d="M48 68L26 50" stroke="#8C6D53" stroke-width="2.5" stroke-linecap="round" />
                <path d="M48 62L70 46" stroke="#8C6D53" stroke-width="2.5" stroke-linecap="round" />
                <circle cx="48" cy="34" r="16" fill="#63C787" fill-opacity="0.88" />
                <circle cx="26" cy="46" r="11" fill="#3D7A8A" fill-opacity="0.85" />
                <circle cx="70" cy="42" r="11" fill="#F0B35A" fill-opacity="0.85" />
              </svg>
              <div>
                <div class="wall-big-kpi">{vm.learning.activeDaysTotal}</div>
                <div class="wall-kpi-sub">
                  累计点亮天（连学 {vm.learning.consecutiveDays} 天）
                </div>
              </div>
              <div class="wall-kpi-sub">
                AI {vm.b1Kanban.aiLineMinutes}m / 软件 {vm.b1Kanban.softwareLineMinutes}m
              </div>
            </div>

            {/* 右栏：七分支进度阵列 + 薄弱 TOP5 + 每日一招 */}
            <div class="wall-branches-col">
              <div class="wall-branch-bars">
                {vm.learning.branchProgress.map((bp) => (
                  <div class="wall-bar-row" key={bp.id}>
                    <span style={{ color: 'var(--wall-text-muted)' }}>
                      {bp.id} {bp.name.slice(0, 2)}
                    </span>
                    <div class="wall-bar-track">
                      <div
                        class="wall-bar-fill"
                        style={{
                          width: `${Math.max(4, bp.percent)}%`,
                          backgroundColor: bp.accentToken,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'right',
                        color: 'var(--wall-text-muted)',
                      }}
                    >
                      {bp.percent}%
                    </span>
                  </div>
                ))}
              </div>

              <div class="wall-weakness-box">
                <div class="wall-kpi-sub">
                  薄弱 TOP5 & 每日一招：{vm.learning.dailyTipTitle}
                </div>
                <div class="wall-weakness-items">
                  {vm.learning.weaknessTop5.length === 0 ? (
                    <span class="wall-kpi-sub">暂无错题积压 · 今日状态稳健</span>
                  ) : (
                    vm.learning.weaknessTop5.slice(0, 3).map((w) => (
                      <span class="wall-weak-chip" key={w.label}>
                        {w.branchId}:{w.label}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* [2] 倒计时块 (3列 × 3行) */}
        <section class="wall-panel wall-panel-countdown" aria-label="关键节点倒计时块">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">
              <span class="wall-dot" style={{ background: 'var(--wall-amber)' }} />
              关键节点
            </h2>
            <span class="wall-tag">示例配置</span>
          </div>
          <div class="wall-countdown-stack">
            {vm.countdowns.slice(0, 3).map((cd) => (
              <div class="wall-cd-card" key={cd.id}>
                <div>
                  <div class="wall-cd-label">{cd.label}</div>
                  <div class="wall-cd-date">{cd.targetDate}</div>
                </div>
                <div class={`wall-cd-days ${cd.isUrgent ? 'is-urgent' : ''}`}>
                  {cd.daysLeft}
                  <span style={{ fontSize: '13px', marginLeft: '3px', fontWeight: 400 }}>
                    天
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* [4] 生活块 · 留位 (4列 × 3行) */}
        <section class="wall-panel wall-panel-life" aria-label="生活习惯与实验室块">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">
              <span class="wall-dot" />
              生活节律与实验
            </h2>
            <span class="wall-tag">
              {vm.lifeBlock.isExternalSynced ? '同步源' : '留位·示例占位'}
            </span>
          </div>
          <div class="wall-kv-list">
            <div class="wall-kv-row">
              <span class="wall-kpi-sub">跑步习惯</span>
              <span class="wall-kv-val">{vm.lifeBlock.running}</span>
            </div>
            <div class="wall-kv-row">
              <span class="wall-kpi-sub">睡眠复盘</span>
              <span class="wall-kv-val">{vm.lifeBlock.sleep}</span>
            </div>
            <div class="wall-kv-row">
              <span class="wall-kpi-sub">饮水节律</span>
              <span class="wall-kv-val">{vm.lifeBlock.water}</span>
            </div>
            <div class="wall-kv-row">
              <span class="wall-kpi-sub">生活实验室</span>
              <span class="wall-kv-val">{vm.lifeBlock.experimentLine}</span>
            </div>
          </div>
        </section>

        {/* [5] 内容块 · 留位 (3列 × 2行) */}
        <section class="wall-panel wall-panel-content" aria-label="每日文学与电影内容块">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">今日吉光</h2>
            <span class="wall-tag">
              {vm.contentBlock.isExternalSynced ? '同步源' : '示例占位'}
            </span>
          </div>
          <div class="wall-quote-text">“{vm.contentBlock.quote}”</div>
          <div class="wall-kpi-sub" style={{ marginTop: 'auto' }}>
            {vm.contentBlock.movie}
          </div>
        </section>

        {/* [6] 状态块 · 留位 (5列 × 2行) */}
        <section class="wall-panel wall-panel-status" aria-label="服务与同步状态块">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">服务与数据状态</h2>
            <span class="wall-tag">每 {content.wallConfig.refreshIntervalSeconds}s 自动刷新</span>
          </div>
          <div class="wall-kv-list">
            <div class="wall-kv-row">
              <span class="wall-kpi-sub">服务器状态</span>
              <span class="wall-kv-val">{vm.statusBlock.serverExpiry}</span>
            </div>
            <div class="wall-kv-row">
              <span class="wall-kpi-sub">数据通道</span>
              <span class="wall-kv-val">{vm.statusBlock.cloudSync}</span>
            </div>
          </div>
        </section>

        {/* 右下角系统状态与返回条 (3列 × 1行) */}
        <footer class="wall-panel wall-panel-footerbar" aria-label="状态墙控制栏">
          <button
            type="button"
            class="wall-btn"
            onClick={() => setForcePreviewDemo((v) => !v)}
            title="在真实留痕与示例演示数据之间切换核对"
          >
            {forcePreviewDemo ? '恢复实况自动判定' : '预览 DEMO 态'}
          </button>
          <a href="#/" class="wall-btn">
            ← 返回站内「今天」
          </a>
        </footer>
      </div>
    </div>
  );
}
