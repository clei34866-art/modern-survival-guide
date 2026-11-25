import { useEffect, useState } from 'preact/hooks';
import { IconArrowLeft, IconArrowRight } from '../components/Icons';
import { SkillTreeSvg } from '../components/SkillTreeSvg';
import type { PlatformContentBundle } from '../core/contentLoader';
import { fetchServerSyncSnapshot, getLocalDateKey } from '../core/db';
import { isUnitCleared } from '../core/gatekeeper';
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

  useEffect(() => {
    setSubView(initialSubView);
  }, [initialSubView]);

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

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

  // B1 软件技能分包实况，用于填实二级看板下半屏并呈现完整双轨
  const b1Branch = content.catalog.branches.find((b) => b.id === 'B1');
  const swPacks = (b1Branch?.tracks ?? []).filter((t) => t.kind === 'software_pack');

  // 环形进度 SVG 参数
  const ringR = 34;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - vm.learning.todayPercent / 100);

  // ============================================================================
  // 二级切换子视图：B1 AI 与软件专项数字看板（高对比无空腔）
  // ============================================================================
  if (subView === 'b1') {
    return (
      <div class="wall-viewport" aria-label="1080P B1 AI与软件专项数字看板（二级视图）">
        <div class="wall-b1-subview">
          <header class="wall-b1-topbar">
            <div class="wall-b1-topbar-group">
              <button type="button" class="wall-btn" onClick={() => setSubView('main')}>
                <IconArrowLeft size={14} />
                <span>返回六宫格个人状态墙</span>
              </button>
              <h1 class="wall-panel-title">
                <span class="wall-dot" />
                B1 · AI 与软件专项数字看板
              </h1>
            </div>
            <div class="wall-b1-topbar-group">
              <span
                class={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}
              >
                {vm.dataMode === 'LIVE' ? '● LIVE 真实留痕' : '○ DEMO 示例演示'}
              </span>
              <span class="wall-tag tabular-num">{formatClock(now)}</span>
              <a href="#/" class="wall-btn">
                返回站内
              </a>
            </div>
          </header>

          <div class="wall-b1-kpis">
            <div class="wall-panel wall-kpi-card">
              <div class="wall-kpi-sub">AI 五层路径总进度</div>
              <div class="wall-kpi-hero" style={{ color: 'var(--wall-green)' }}>
                {vm.b1Kanban.fiveLayerOverallPercent}%
              </div>
              <div class="wall-kpi-foot">逐层过关 + 实战项目验收</div>
            </div>

            <div class="wall-panel wall-kpi-card">
              <div class="wall-kpi-sub">当前层级与产出完成度</div>
              <div class="wall-kpi-mid-title">{vm.b1Kanban.currentLayerTitle}</div>
              <div class="wall-kpi-hero" style={{ color: 'var(--wall-amber)' }}>
                {vm.b1Kanban.currentDeliverablePercent}%
              </div>
              <div class="wall-kpi-foot">产出：{vm.b1Kanban.currentDeliverableTitle}</div>
            </div>

            <div class="wall-panel wall-kpi-card">
              <div class="wall-kpi-sub">连续 / 累计点亮天数</div>
              <div class="wall-kpi-hero">
                {vm.learning.consecutiveDays}
                <span class="wall-kpi-unit"> 连续 · 共 {vm.learning.activeDaysTotal} 天</span>
              </div>
              <div class="wall-kpi-foot">正向累积 · 断更不清零</div>
            </div>

            <div class="wall-panel wall-kpi-card">
              <div class="wall-kpi-sub">今日流程完成情况</div>
              <div class="wall-kpi-hero" style={{ color: 'var(--wall-green)' }}>
                {vm.learning.todayDone}/{vm.learning.todayTotal}
              </div>
              <div class="wall-kpi-foot">
                完成率 {vm.learning.todayPercent}%
                {vm.learning.lowBatteryMode ? '（保底模式）' : '（做完即停）'}
              </div>
            </div>
          </div>

          {/* 中左：L1–L5 各层掌握度矩阵（均匀撑满，零黑洞） */}
          <section class="wall-panel wall-b1-layers">
            <div class="wall-panel-head">
              <h2 class="wall-panel-title">AI 能力线 L1–L5 各层掌握度与产出矩阵</h2>
              <span class="wall-tag">按答题与单元过关聚合</span>
            </div>
            <div class="wall-layers-stack">
              {vm.b1Kanban.layers.map((layer) => (
                <div class="wall-layer-row" key={layer.trackId}>
                  <strong class="wall-layer-code">{layer.shortLabel}</strong>
                  <div class="wall-layer-info">
                    <div class="wall-layer-name">{layer.title.replace(/^AI L\d · /, '')}</div>
                    <div class="wall-layer-meta">
                      掌握度 {layer.masteryPercent}% · 实战产出 {layer.deliverablePercent}%
                    </div>
                  </div>
                  <div class="wall-bar-track is-thick">
                    <div
                      class="wall-bar-fill"
                      style={{
                        width: `${Math.max(4, layer.masteryPercent)}%`,
                        backgroundColor: layer.unlocked ? '#3D8C9E' : '#3a424d',
                      }}
                    />
                  </div>
                  <span class={`wall-tag ${layer.isCleared ? 'wall-tag-live' : ''}`}>
                    {layer.isCleared ? '✓ 已过关' : layer.unlocked ? '当前可学' : '待解锁'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 中右：双线时长高对比外置标签 + 软件分包状态 + 薄弱 TOP 5 */}
          <section class="wall-panel wall-b1-duration">
            <div class="wall-panel-head">
              <h2 class="wall-panel-title">双线投入时长与软件技能分包</h2>
              <span class="wall-tag">精确留痕聚合</span>
            </div>

            <div class="wall-dual-bars">
              <div class="wall-dual-item">
                <div class="wall-dual-label-row">
                  <span class="wall-dual-name">AI 能力线（L1–L5）</span>
                  <strong class="wall-dual-val tabular-num">
                    {vm.b1Kanban.aiLineMinutes} min（{aiRatioPercent}%）
                  </strong>
                </div>
                <div class="wall-bar-track is-xl">
                  <div
                    class="wall-bar-fill"
                    style={{ width: `${Math.max(6, aiRatioPercent)}%`, backgroundColor: '#3D8C9E' }}
                  />
                </div>
              </div>

              <div class="wall-dual-item">
                <div class="wall-dual-label-row">
                  <span class="wall-dual-name">软件技能线（Blender / Git 等）</span>
                  <strong class="wall-dual-val tabular-num">
                    {vm.b1Kanban.softwareLineMinutes} min（{swRatioPercent}%）
                  </strong>
                </div>
                <div class="wall-bar-track is-xl">
                  <div
                    class="wall-bar-fill"
                    style={{ width: `${Math.max(6, swRatioPercent)}%`, backgroundColor: '#4CC38A' }}
                  />
                </div>
              </div>
            </div>

            <div class="wall-sw-packs-strip">
              <div class="wall-kpi-sub" style={{ marginBottom: '8px' }}>
                软件技能分包状态（按需即学即用）
              </div>
              <div class="wall-sw-grid">
                {swPacks.map((pack) => {
                  const total = pack.unitIds.length;
                  const cleared = pack.unitIds.filter((uid) => isUnitCleared(uid, telemetry)).length;
                  return (
                    <div class="wall-sw-chip" key={pack.id}>
                      <span class="wall-sw-chip-name">
                        {pack.title.replace(/^软件包 S\d · /, '')}
                      </span>
                      <span class="wall-sw-chip-stat tabular-num">
                        {total > 0 ? `${cleared}/${total} 节` : '规划中'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div class="wall-weakness-box">
              <div class="wall-kpi-sub">薄弱概念 TOP 5（待 1/3/7 天重测）</div>
              <div class="wall-weakness-items">
                {vm.learning.weaknessTop5.length === 0 ? (
                  <span class="wall-kpi-sub">当前无积压错题</span>
                ) : (
                  vm.learning.weaknessTop5.map((w) => (
                    <span class="wall-weak-chip" key={w.label}>
                      [{w.branchId}] {w.label}
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
  // 默认主视图：1080P 全站个人状态墙六宫格 + 底部 36px 极简状态条（零黑洞空腔）
  // ============================================================================
  return (
    <div class="wall-viewport" aria-label="1080P 个人状态墙六宫格主视图">
      <div class="wall-bento-grid">
        {/* [1] 今日总览 (4列 × 3行)：大时钟 + 完成度圆环 + 紧凑待办 */}
        <section class="wall-panel wall-panel-today" aria-label="今日总览">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">
              <span class="wall-dot" />
              今日总览
            </h2>
            <span class="wall-tag">{vm.weather}</span>
          </div>

          <div class="wall-today-hero">
            <div>
              <div class="wall-clock">{formatClock(now)}</div>
              <div class="wall-date-weather">{formatDateLabel(now)}</div>
            </div>
            <div class="wall-ring-wrap" title={`今日完成 ${vm.learning.todayPercent}%`}>
              <svg width="84" height="84" viewBox="0 0 84 84">
                <circle
                  cx="42"
                  cy="42"
                  r={ringR}
                  fill="none"
                  stroke="#232A34"
                  stroke-width="7"
                />
                <circle
                  cx="42"
                  cy="42"
                  r={ringR}
                  fill="none"
                  stroke="#4CC38A"
                  stroke-width="7"
                  stroke-linecap="round"
                  stroke-dasharray={ringC}
                  stroke-dashoffset={ringOffset}
                  transform="rotate(-90 42 42)"
                />
                <text
                  x="42"
                  y="40"
                  text-anchor="middle"
                  font-size="16"
                  font-weight="700"
                  font-family="JetBrains Mono, monospace"
                  fill="#F3F2EE"
                >
                  {vm.learning.todayDone}/{vm.learning.todayTotal}
                </text>
                <text
                  x="42"
                  y="55"
                  text-anchor="middle"
                  font-size="10"
                  fill="#959EA8"
                >
                  今日进度
                </text>
              </svg>
            </div>
          </div>

          <ul class="wall-todo-list">
            {vm.todos.slice(0, 4).map((item, idx) => (
              <li class="wall-todo-item" key={idx}>
                <span class="wall-todo-bullet" />
                <span class="wall-todo-text">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* [3] 生存指南学习块 (5列 × 4行)：技能树 + 粗进度条阵列 + 薄弱与一招 */}
        <section class="wall-panel wall-panel-learning" aria-label="生存指南学习块">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">
              <span class="wall-dot" />
              生存指南学习块
            </h2>
            <div class="wall-head-actions">
              <span
                class={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}
              >
                {vm.dataMode === 'LIVE' ? '● LIVE' : '○ DEMO'}
              </span>
              <button
                type="button"
                class="wall-btn"
                onClick={() => setSubView('b1')}
                title="切换查看 B1 AI 与软件专项数字看板"
              >
                <span>B1 专项看板</span>
                <IconArrowRight size={13} />
              </button>
            </div>
          </div>

          <div class="wall-learning-body">
            <div class="wall-tree-summary-col">
              <div class="wall-kpi-sub">eudaimonia 技能树</div>
              <SkillTreeSvg
                content={content}
                telemetry={telemetry}
                variant="wall"
                demoFallback={vm.dataMode === 'DEMO'}
              />
              <div class="wall-tree-metrics">
                <div class="wall-big-kpi tabular-num">{vm.learning.activeDaysTotal}</div>
                <div class="wall-kpi-sub">
                  累计点亮（连学 {vm.learning.consecutiveDays} 天）
                </div>
                <div class="wall-dual-mini tabular-num">
                  AI {vm.b1Kanban.aiLineMinutes}m · 软件 {vm.b1Kanban.softwareLineMinutes}m
                </div>
              </div>
            </div>

            <div class="wall-branches-col">
              <div class="wall-branch-bars">
                {vm.learning.branchProgress.map((bp) => (
                  <div class="wall-bar-row" key={bp.id}>
                    <span class="wall-bar-name">
                      {bp.id} {bp.name.slice(0, 2)}
                    </span>
                    <div class="wall-bar-track is-thick">
                      <div
                        class="wall-bar-fill"
                        style={{
                          width: `${Math.max(4, bp.percent)}%`,
                          backgroundColor: bp.accentToken,
                        }}
                      />
                    </div>
                    <span class="wall-bar-pct tabular-num">{bp.percent}%</span>
                  </div>
                ))}
              </div>

              <div class="wall-weakness-box">
                <div class="wall-tip-inline">
                  <span class="wall-tip-tag">每日一招</span>
                  <span class="wall-tip-title">{vm.learning.dailyTipTitle}</span>
                </div>
                <div class="wall-weakness-items">
                  {vm.learning.weaknessTop5.length === 0 ? (
                    <span class="wall-kpi-sub">暂无错题积压 · 今日状态稳健</span>
                  ) : (
                    vm.learning.weaknessTop5.slice(0, 3).map((w) => (
                      <span class="wall-weak-chip" key={w.label}>
                        {w.branchId} · {w.label}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* [2] 关键节点倒计时块 (3列 × 3行) */}
        <section class="wall-panel wall-panel-countdown" aria-label="关键节点倒计时">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">
              <span class="wall-dot" style={{ background: 'var(--wall-amber)' }} />
              关键节点
            </h2>
            <span class="wall-tag">倒计时</span>
          </div>
          <div class="wall-countdown-stack">
            {vm.countdowns.slice(0, 3).map((cd) => {
              const urgencyPct = Math.max(8, Math.min(100, Math.round(100 - Math.min(cd.daysLeft, 365) / 3.65)));
              return (
                <div class="wall-cd-card" key={cd.id}>
                  <div class="wall-cd-top">
                    <div>
                      <div class="wall-cd-label">{cd.label}</div>
                      <div class="wall-cd-date tabular-num">{cd.targetDate}</div>
                    </div>
                    <div class={`wall-cd-days tabular-num ${cd.isUrgent ? 'is-urgent' : ''}`}>
                      {cd.daysLeft}
                      <span>天</span>
                    </div>
                  </div>
                  <div class="wall-cd-bar">
                    <div
                      class="wall-cd-bar-fill"
                      style={{
                        width: `${urgencyPct}%`,
                        backgroundColor: cd.isUrgent ? 'var(--wall-coral)' : 'var(--wall-amber)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* [4] 生活节律与实验 (4列 × 3行)：2×2 微指标网格消除空洞 */}
        <section class="wall-panel wall-panel-life" aria-label="生活节律与实验">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">
              <span class="wall-dot" />
              生活节律与实验
            </h2>
            <span class="wall-tag">
              {vm.lifeBlock.isExternalSynced ? '同步源' : '示例占位'}
            </span>
          </div>
          <div class="wall-life-grid-2x2">
            <div class="wall-micro-tile">
              <span class="wall-micro-label">跑步习惯</span>
              <strong class="wall-micro-val">{vm.lifeBlock.running}</strong>
            </div>
            <div class="wall-micro-tile">
              <span class="wall-micro-label">睡眠复盘</span>
              <strong class="wall-micro-val">{vm.lifeBlock.sleep}</strong>
            </div>
            <div class="wall-micro-tile">
              <span class="wall-micro-label">饮水节律</span>
              <strong class="wall-micro-val">{vm.lifeBlock.water}</strong>
            </div>
            <div class="wall-micro-tile is-accent-tile">
              <span class="wall-micro-label">月度生活实验</span>
              <strong class="wall-micro-val">{vm.lifeBlock.experimentLine}</strong>
            </div>
          </div>
        </section>

        {/* [6] 服务与数据状态 (5列 × 2行)：双列仪表卡 */}
        <section class="wall-panel wall-panel-status" aria-label="服务与数据状态">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">服务与数据状态</h2>
            <span class="wall-tag">每 {content.wallConfig.refreshIntervalSeconds}s 刷新</span>
          </div>
          <div class="wall-status-two-col">
            <div class="wall-micro-tile">
              <span class="wall-micro-label">服务器运行态</span>
              <strong class="wall-micro-val">{vm.statusBlock.serverExpiry}</strong>
            </div>
            <div class="wall-micro-tile">
              <span class="wall-micro-label">本地数据通道</span>
              <strong class="wall-micro-val">{vm.statusBlock.cloudSync}</strong>
            </div>
          </div>
        </section>

        {/* [5] 今日吉光 (3列 × 3行)：编辑部排版金句 + 电影卡 */}
        <section class="wall-panel wall-panel-content" aria-label="今日吉光">
          <div class="wall-panel-head">
            <h2 class="wall-panel-title">今日吉光</h2>
            <span class="wall-tag">
              {vm.contentBlock.isExternalSynced ? '同步源' : '示例占位'}
            </span>
          </div>
          <div class="wall-quote-body">
            <span class="wall-quote-mark" aria-hidden="true">“</span>
            <p class="wall-quote-text">{vm.contentBlock.quote}</p>
          </div>
          <div class="wall-movie-foot">{vm.contentBlock.movie}</div>
        </section>
      </div>

      {/* 底部极简 36px 细系统状态栏（腾出完整 12×6 网格空间） */}
      <footer class="wall-slim-footer" aria-label="状态墙控制栏">
        <div class="wall-slim-footer-left">
          <span class={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}>
            {vm.dataMode === 'LIVE' ? '● LIVE 真实留痕驱动' : '○ DEMO 示例数据演示'}
          </span>
          <span class="wall-kpi-sub">现代必备生存指南 · 常亮状态墙</span>
        </div>
        <div class="wall-slim-footer-right">
          <button
            type="button"
            class="wall-btn"
            onClick={() => setForcePreviewDemo((v) => !v)}
          >
            {forcePreviewDemo ? '恢复实况判定' : '预览 DEMO 态'}
          </button>
          <a href="#/" class="wall-btn">
            <IconArrowLeft size={13} />
            <span>返回站内</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
