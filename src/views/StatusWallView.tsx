import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SkillAtlasSvg } from '@/components/SkillTreeSvg';
import type { PlatformContentBundle } from '@/core/contentLoader';
import { fetchServerSyncSnapshot, getLocalDateKey } from '@/core/db';
import { isUnitCleared } from '@/core/gatekeeper';
import { computeWallViewModel } from '@/core/wallAdapter';
import type { TelemetrySnapshot, WallExternalSyncPayload } from '@/types/schema';

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

  const b1Branch = content.catalog.branches.find((b) => b.id === 'B1');
  const swPacks = (b1Branch?.tracks ?? []).filter((t) => t.kind === 'software_pack');

  const ringR = 34;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - vm.learning.todayPercent / 100);

  // ============================================================================
  // 二级切换子视图：B1 AI 与软件专项数字看板
  // ============================================================================
  if (subView === 'b1') {
    return (
      <div className="wall-viewport" aria-label="1080P B1 AI与软件专项数字看板（二级视图）">
        <div className="wall-b1-subview">
          <header className="wall-b1-topbar">
            <div className="wall-b1-topbar-group">
              <button type="button" className="wall-btn" onClick={() => setSubView('main')}>
                <ArrowLeft size={14} strokeWidth={1.6} />
                <span>返回六宫格个人状态墙</span>
              </button>
              <h1 className="wall-panel-title">
                <span className="wall-dot" />
                B1 · AI 与软件专项数字看板
              </h1>
            </div>
            <div className="wall-b1-topbar-group">
              <span
                className={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}
              >
                {vm.dataMode === 'LIVE' ? 'LIVE 真实留痕' : 'DEMO 示例演示'}
              </span>
              <span className="wall-tag font-mono-num">{formatClock(now)}</span>
              <a href="#/" className="wall-btn no-underline">
                返回站内
              </a>
            </div>
          </header>

          <div className="wall-b1-kpis">
            <div className="wall-panel wall-kpi-card">
              <div className="wall-kpi-sub">AI 五层路径总进度</div>
              <div className="wall-kpi-hero" style={{ color: 'var(--wall-green)' }}>
                {vm.b1Kanban.fiveLayerOverallPercent}%
              </div>
              <div className="wall-kpi-foot">逐层过关 + 实战项目验收</div>
            </div>

            <div className="wall-panel wall-kpi-card">
              <div className="wall-kpi-sub">当前层级与产出完成度</div>
              <div className="wall-kpi-mid-title">{vm.b1Kanban.currentLayerTitle}</div>
              <div className="wall-kpi-hero" style={{ color: 'var(--wall-amber)' }}>
                {vm.b1Kanban.currentDeliverablePercent}%
              </div>
              <div className="wall-kpi-foot">产出：{vm.b1Kanban.currentDeliverableTitle}</div>
            </div>

            <div className="wall-panel wall-kpi-card">
              <div className="wall-kpi-sub">连续 / 累计点亮天数</div>
              <div className="wall-kpi-hero">
                {vm.learning.consecutiveDays}
                <span className="wall-kpi-unit"> 连续 · 共 {vm.learning.activeDaysTotal} 天</span>
              </div>
              <div className="wall-kpi-foot">正向累积 · 断更不清零</div>
            </div>

            <div className="wall-panel wall-kpi-card">
              <div className="wall-kpi-sub">今日流程完成情况</div>
              <div className="wall-kpi-hero" style={{ color: 'var(--wall-green)' }}>
                {vm.learning.todayDone}/{vm.learning.todayTotal}
              </div>
              <div className="wall-kpi-foot">完成率 {vm.learning.todayPercent}%（做完即停）</div>
            </div>
          </div>

          {/* 中左：L1–L5 各层掌握度矩阵 */}
          <section className="wall-panel wall-b1-layers">
            <div className="wall-panel-head">
              <h2 className="wall-panel-title">AI 能力线 L1–L5 各层掌握度与产出矩阵</h2>
              <span className="wall-tag">按答题与单元过关聚合</span>
            </div>
            <div className="wall-layers-stack">
              {vm.b1Kanban.layers.map((layer) => (
                <div className="wall-layer-row" key={layer.trackId}>
                  <strong className="wall-layer-code">{layer.shortLabel}</strong>
                  <div className="wall-layer-info">
                    <div className="wall-layer-name">{layer.title.replace(/^AI L\d · /, '')}</div>
                    <div className="wall-layer-meta">
                      掌握度 {layer.masteryPercent}% · 实战产出 {layer.deliverablePercent}%
                    </div>
                  </div>
                  <div className="wall-bar-track is-thick">
                    <div
                      className="wall-bar-fill"
                      style={{
                        width: `${Math.max(4, layer.masteryPercent)}%`,
                        backgroundColor: layer.unlocked ? '#3b82f6' : '#3a424d',
                      }}
                    />
                  </div>
                  <span className={`wall-tag ${layer.isCleared ? 'wall-tag-live' : ''}`}>
                    {layer.isCleared ? '已过关' : layer.unlocked ? '当前可学' : '待解锁'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 中右：双线时长 + 软件分包 + 薄弱 TOP 5 */}
          <section className="wall-panel wall-b1-duration">
            <div className="wall-panel-head">
              <h2 className="wall-panel-title">双线投入时长与软件技能分包</h2>
              <span className="wall-tag">精确留痕聚合</span>
            </div>

            <div className="wall-dual-bars">
              <div className="wall-dual-item">
                <div className="wall-dual-label-row">
                  <span className="wall-dual-name">AI 能力线（L1–L5）</span>
                  <strong className="wall-dual-val font-mono-num">
                    {vm.b1Kanban.aiLineMinutes} min（{aiRatioPercent}%）
                  </strong>
                </div>
                <div className="wall-bar-track is-xl">
                  <div
                    className="wall-bar-fill"
                    style={{ width: `${Math.max(6, aiRatioPercent)}%`, backgroundColor: '#3b82f6' }}
                  />
                </div>
              </div>

              <div className="wall-dual-item">
                <div className="wall-dual-label-row">
                  <span className="wall-dual-name">软件技能线（Blender / Git 等）</span>
                  <strong className="wall-dual-val font-mono-num">
                    {vm.b1Kanban.softwareLineMinutes} min（{swRatioPercent}%）
                  </strong>
                </div>
                <div className="wall-bar-track is-xl">
                  <div
                    className="wall-bar-fill"
                    style={{ width: `${Math.max(6, swRatioPercent)}%`, backgroundColor: '#34d399' }}
                  />
                </div>
              </div>
            </div>

            <div className="wall-sw-packs-strip">
              <div className="wall-kpi-sub" style={{ marginBottom: '8px' }}>
                软件技能分包状态（按需即学即用）
              </div>
              <div className="wall-sw-grid">
                {swPacks.map((pack) => {
                  const total = pack.unitIds.length;
                  const cleared = pack.unitIds.filter((uid) => isUnitCleared(uid, telemetry)).length;
                  return (
                    <div className="wall-sw-chip" key={pack.id}>
                      <span className="wall-sw-chip-name">
                        {pack.title.replace(/^软件包 S\d · /, '')}
                      </span>
                      <span className="wall-sw-chip-stat font-mono-num">
                        {total > 0 ? `${cleared}/${total} 节` : '规划中'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="wall-weakness-box">
              <div className="wall-kpi-sub">薄弱概念 TOP 5（待 1/3/7 天重测）</div>
              <div className="wall-weakness-items">
                {vm.learning.weaknessTop5.length === 0 ? (
                  <span className="wall-kpi-sub">当前无积压错题</span>
                ) : (
                  vm.learning.weaknessTop5.map((w) => (
                    <span className="wall-weak-chip" key={w.label}>
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
  // 默认主视图：1080P 全站个人状态墙六宫格 + 底部 36px 极简状态条
  // ============================================================================
  return (
    <div className="wall-viewport" aria-label="1080P 个人状态墙六宫格主视图">
      <div className="wall-bento-grid">
        {/* [1] 今日总览 */}
        <section className="wall-panel wall-panel-today" aria-label="今日总览">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">
              <span className="wall-dot" />
              今日总览
            </h2>
            <span className="wall-tag">{vm.weather}</span>
          </div>

          <div className="wall-today-hero">
            <div>
              <div className="wall-clock">{formatClock(now)}</div>
              <div className="wall-date-weather">{formatDateLabel(now)}</div>
            </div>
            <div className="wall-ring-wrap" title={`今日完成 ${vm.learning.todayPercent}%`}>
              <svg width="84" height="84" viewBox="0 0 84 84">
                <circle cx="42" cy="42" r={ringR} fill="none" stroke="#20283a" strokeWidth="7" />
                <circle
                  cx="42"
                  cy="42"
                  r={ringR}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={ringC}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 42 42)"
                />
                <text
                  x="42"
                  y="40"
                  textAnchor="middle"
                  fontSize="16"
                  fontWeight="600"
                  fontFamily="var(--font-mono)"
                  fill="#eef0f5"
                >
                  {vm.learning.todayDone}/{vm.learning.todayTotal}
                </text>
                <text x="42" y="55" textAnchor="middle" fontSize="10" fill="#98a2b3">
                  今日进度
                </text>
              </svg>
            </div>
          </div>

          <ul className="wall-todo-list">
            {vm.todos.slice(0, 4).map((item, idx) => (
              <li className="wall-todo-item" key={idx}>
                <span className="wall-todo-bullet" />
                <span className="wall-todo-text">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* [3] 生存指南学习块 */}
        <section className="wall-panel wall-panel-learning" aria-label="生存指南学习块">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">
              <span className="wall-dot" />
              生存指南学习块
            </h2>
            <div className="wall-head-actions">
              <span
                className={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}
              >
                {vm.dataMode === 'LIVE' ? 'LIVE' : 'DEMO'}
              </span>
              <button
                type="button"
                className="wall-btn"
                onClick={() => setSubView('b1')}
                title="切换查看 B1 AI 与软件专项数字看板"
              >
                <span>B1 专项看板</span>
                <ArrowRight size={13} strokeWidth={1.6} />
              </button>
            </div>
          </div>

          <div className="wall-learning-body">
            <div className="wall-tree-summary-col">
              <div className="wall-kpi-sub">七分支技能星图</div>
              <SkillAtlasSvg
                content={content}
                telemetry={telemetry}
                variant="wall"
                demoFallback={vm.dataMode === 'DEMO'}
              />
              <div className="wall-tree-metrics">
                <div className="wall-big-kpi font-mono-num">{vm.learning.activeDaysTotal}</div>
                <div className="wall-kpi-sub">
                  累计点亮（连学 {vm.learning.consecutiveDays} 天）
                </div>
                <div className="wall-dual-mini font-mono-num">
                  AI {vm.b1Kanban.aiLineMinutes}m · 软件 {vm.b1Kanban.softwareLineMinutes}m
                </div>
              </div>
            </div>

            <div className="wall-branches-col">
              <div className="wall-branch-bars">
                {vm.learning.branchProgress.map((bp) => (
                  <div className="wall-bar-row" key={bp.id}>
                    <span className="wall-bar-name">
                      {bp.id} {bp.name.slice(0, 2)}
                    </span>
                    <div className="wall-bar-track is-thick">
                      <div
                        className="wall-bar-fill"
                        style={{
                          width: `${Math.max(4, bp.percent)}%`,
                          backgroundColor: bp.accentToken,
                        }}
                      />
                    </div>
                    <span className="wall-bar-pct font-mono-num">{bp.percent}%</span>
                  </div>
                ))}
              </div>

              <div className="wall-weakness-box">
                <div className="wall-tip-inline">
                  <span className="wall-tip-tag">每日一招</span>
                  <span className="wall-tip-title">{vm.learning.dailyTipTitle}</span>
                </div>
                <div className="wall-weakness-items">
                  {vm.learning.weaknessTop5.length === 0 ? (
                    <span className="wall-kpi-sub">暂无错题积压 · 今日状态稳健</span>
                  ) : (
                    vm.learning.weaknessTop5.slice(0, 3).map((w) => (
                      <span className="wall-weak-chip" key={w.label}>
                        {w.branchId} · {w.label}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* [2] 关键节点倒计时块 */}
        <section className="wall-panel wall-panel-countdown" aria-label="关键节点倒计时">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">
              <span className="wall-dot" style={{ background: 'var(--wall-amber)' }} />
              关键节点
            </h2>
            <span className="wall-tag">倒计时</span>
          </div>
          <div className="wall-countdown-stack">
            {vm.countdowns.slice(0, 3).map((cd) => {
              const urgencyPct = Math.max(
                8,
                Math.min(100, Math.round(100 - Math.min(cd.daysLeft, 365) / 3.65))
              );
              return (
                <div className="wall-cd-card" key={cd.id}>
                  <div className="wall-cd-top">
                    <div>
                      <div className="wall-cd-label">{cd.label}</div>
                      <div className="wall-cd-date font-mono-num">{cd.targetDate}</div>
                    </div>
                    <div className={`wall-cd-days font-mono-num ${cd.isUrgent ? 'is-urgent' : ''}`}>
                      {cd.daysLeft}
                      <span>天</span>
                    </div>
                  </div>
                  <div className="wall-cd-bar">
                    <div
                      className="wall-cd-bar-fill"
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

        {/* [4] 生活节律与实验 */}
        <section className="wall-panel wall-panel-life" aria-label="生活节律与实验">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">
              <span className="wall-dot" />
              生活节律与实验
            </h2>
            <span className="wall-tag">
              {vm.lifeBlock.isExternalSynced ? '同步源' : '示例占位'}
            </span>
          </div>
          <div className="wall-life-grid-2x2">
            <div className="wall-micro-tile">
              <span className="wall-micro-label">跑步习惯</span>
              <strong className="wall-micro-val">{vm.lifeBlock.running}</strong>
            </div>
            <div className="wall-micro-tile">
              <span className="wall-micro-label">睡眠复盘</span>
              <strong className="wall-micro-val">{vm.lifeBlock.sleep}</strong>
            </div>
            <div className="wall-micro-tile">
              <span className="wall-micro-label">饮水节律</span>
              <strong className="wall-micro-val">{vm.lifeBlock.water}</strong>
            </div>
            <div className="wall-micro-tile is-accent-tile">
              <span className="wall-micro-label">月度生活实验</span>
              <strong className="wall-micro-val">{vm.lifeBlock.experimentLine}</strong>
            </div>
          </div>
        </section>

        {/* [6] 服务与数据状态 */}
        <section className="wall-panel wall-panel-status" aria-label="服务与数据状态">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">服务与数据状态</h2>
            <span className="wall-tag">每 {content.wallConfig.refreshIntervalSeconds}s 刷新</span>
          </div>
          <div className="wall-status-two-col">
            <div className="wall-micro-tile">
              <span className="wall-micro-label">服务器运行态</span>
              <strong className="wall-micro-val">{vm.statusBlock.serverExpiry}</strong>
            </div>
            <div className="wall-micro-tile">
              <span className="wall-micro-label">本地数据通道</span>
              <strong className="wall-micro-val">{vm.statusBlock.cloudSync}</strong>
            </div>
          </div>
        </section>

        {/* [5] 今日吉光 */}
        <section className="wall-panel wall-panel-content" aria-label="今日吉光">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">今日吉光</h2>
            <span className="wall-tag">
              {vm.contentBlock.isExternalSynced ? '同步源' : '示例占位'}
            </span>
          </div>
          <div className="wall-quote-body">
            <p className="wall-quote-text">{vm.contentBlock.quote}</p>
          </div>
          <div className="wall-movie-foot">{vm.contentBlock.movie}</div>
        </section>
      </div>

      {/* 底部极简 36px 细系统状态栏 */}
      <footer className="wall-slim-footer" aria-label="状态墙控制栏">
        <div className="wall-slim-footer-left">
          <span className={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}>
            {vm.dataMode === 'LIVE' ? 'LIVE 真实留痕驱动' : 'DEMO 示例数据演示'}
          </span>
          <span className="wall-kpi-sub">现代必备生存指南 · 常亮状态墙</span>
        </div>
        <div className="wall-slim-footer-right">
          <button
            type="button"
            className="wall-btn"
            onClick={() => setForcePreviewDemo((v) => !v)}
          >
            {forcePreviewDemo ? '恢复实况判定' : '预览 DEMO 态'}
          </button>
          <a href="#/" className="wall-btn no-underline">
            <ArrowLeft size={13} strokeWidth={1.6} />
            <span>返回站内</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
