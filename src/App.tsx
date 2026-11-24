import { useEffect, useState } from 'preact/hooks';
import { loadPlatformContent, type PlatformContentBundle } from './core/contentLoader';
import {
  clearTelemetry,
  exportTelemetryJson,
  hasLiveTelemetry,
  importTelemetryJson,
  loadTelemetry,
   saveDailyPlanSnapshot,
  setDailyLowBatteryMode,
  setDailyTipAcknowledged,
  subscribeTelemetrySync,
  toggleDailyTaskCompletion,
} from './core/db';
import { ensureTodayPlanSnapshot } from './core/scheduler';
import type { ScheduledTaskItem, TelemetrySnapshot } from './types/schema';
import { TodayView } from './views/TodayView';

type NavRoute = 'today' | 'branches' | 'events' | 'lab' | 'wall';

function parseHashRoute(hash: string): NavRoute {
  const clean = hash.replace(/^#\/?/, '').split('?')[0];
  if (clean === 'branches') return 'branches';
  if (clean === 'events') return 'events';
  if (clean === 'lab') return 'lab';
  if (clean === 'wall') return 'wall';
  return 'today';
}

function formatMinutes(ms: number): string {
  const mins = ms / 60000;
  return mins < 1 && mins > 0 ? '<1 min' : `${Math.round(mins)} min`;
}

export function App() {
  const [route, setRoute] = useState<NavRoute>(() =>
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : 'today'
  );
  const [content, setContent] = useState<PlatformContentBundle | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [backupPreview, setBackupPreview] = useState<string>('');

  useEffect(() => {
    const onHashChange = () => setRoute(parseHashRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadPlatformContent(), loadTelemetry()])
      .then(async ([bundle, snap]) => {
        if (!mounted) return;
        setContent(bundle);
        const { plan, isNewlyGenerated } = ensureTodayPlanSnapshot(bundle, snap);
        if (isNewlyGenerated) {
          const saved = await saveDailyPlanSnapshot(plan);
          if (mounted) setTelemetry(saved);
        } else {
          setTelemetry(snap);
        }
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      });

    const unsub = subscribeTelemetrySync(() => {
      loadTelemetry().then((latest) => {
        if (mounted) setTelemetry(latest);
      });
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  if (error) {
    return (
      <main class="page-shell">
        <div class="section-card">加载失败：{error}</div>
      </main>
    );
  }

  if (!content || !telemetry || !telemetry.currentDailyPlan) {
    return (
      <main class="page-shell">
        <div class="section-card">正在准备今天的节奏单…</div>
      </main>
    );
  }

  const plan = telemetry.currentDailyPlan;
  const isLive = hasLiveTelemetry(telemetry);

  const handleToggleLowBattery = async (enabled: boolean) => {
    const next = await setDailyLowBatteryMode(enabled);
    setTelemetry(next);
  };

  const handleToggleTipAck = async (ack: boolean) => {
    const next = await setDailyTipAcknowledged(ack);
    setTelemetry(next);
  };

  const handleToggleTask = async (task: ScheduledTaskItem) => {
    const next = await toggleDailyTaskCompletion(task);
    setTelemetry(next);
  };

  const handleExport = async () => {
    const json = await exportTelemetryJson();
    setBackupPreview(json);
    setStatusMsg('已导出当前 IndexedDB 全量留痕与今日进度 JSON 快照。');
  };

  const handleImport = async () => {
    if (!backupPreview.trim()) {
      setStatusMsg('请先导出备份或在文本框内粘贴合法的 JSON 快照。');
      return;
    }
    try {
      const imported = await importTelemetryJson(backupPreview);
      const { plan: ensured, isNewlyGenerated } = ensureTodayPlanSnapshot(content, imported);
      const finalSnap = isNewlyGenerated ? await saveDailyPlanSnapshot(ensured) : imported;
      setTelemetry(finalSnap);
      setStatusMsg('备份 JSON 导入成功，已同步更新本地状态。');
    } catch (err) {
      setStatusMsg(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleReset = async () => {
    const empty = await clearTelemetry();
    const { plan: freshPlan } = ensureTodayPlanSnapshot(content, empty);
    const saved = await saveDailyPlanSnapshot(freshPlan);
    setTelemetry(saved);
    setBackupPreview('');
    setStatusMsg('已重置本地留痕并重新生成干净的今日清单。');
  };

  const aiDurationMs = telemetry.sessionDurations
    .filter((d) => d.lineKind === 'b1_ai')
    .reduce((acc, d) => acc + d.durationMs, 0);
  const swDurationMs = telemetry.sessionDurations
    .filter((d) => d.lineKind === 'b1_software')
    .reduce((acc, d) => acc + d.durationMs, 0);

  return (
    <div>
      {/* DESIGN.md 1.5.1 全站轻量五项导航栏 */}
      <header class="site-topbar">
        <div class="site-topbar-inner">
          <a href="#/" class="site-brand">
            <span class="site-brand-title">现代必备生存指南</span>
            <span class="site-brand-sub">过日子的生产力与生活掌控感</span>
          </a>

          <nav class="site-nav" aria-label="主导航">
            <a
              href="#/"
              class={`site-nav-link ${route === 'today' ? 'is-active' : ''}`}
            >
              今天
            </a>
            <a
              href="#/branches"
              class={`site-nav-link ${route === 'branches' ? 'is-active' : ''}`}
            >
              七分支与技能树
            </a>
            <a
              href="#/events"
              class={`site-nav-link ${route === 'events' ? 'is-active' : ''}`}
            >
              生活事件包
            </a>
            <a
              href="#/lab"
              class={`site-nav-link ${route === 'lab' ? 'is-active' : ''}`}
            >
              真实任务与实验室
            </a>
            <a
              href="#/wall"
              class={`site-nav-link is-wall-link ${route === 'wall' ? 'is-active' : ''}`}
            >
              状态墙 ↗
            </a>
          </nav>
        </div>
      </header>

      <main class="page-shell">
        {route === 'today' && (
          <TodayView
            content={content}
            telemetry={telemetry}
            plan={plan}
            onToggleLowBattery={handleToggleLowBattery}
            onToggleTipAck={handleToggleTipAck}
            onToggleTask={handleToggleTask}
          />
        )}

        {route === 'branches' && (
          <section aria-label="七大生存分支结构概览">
            <h1 class="hero-title" style={{ marginBottom: '6px' }}>
              七大生存分支目录概览
            </h1>
            <p class="hero-subtitle" style={{ marginBottom: '20px' }}>
              统一路径图、7 步学习单元播放器与 eudaimonia 生存技能树将在 M3 / M6 按序实装。
            </p>
            <div class="branches-grid">
              {content.catalog.branches.map((branch) => (
                <article class="branch-card" key={branch.id}>
                  <span
                    class="branch-tag"
                    style={{ backgroundColor: branch.accentToken }}
                  >
                    {branch.id} · {branch.name}
                  </span>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>
                    {branch.subtitle}
                  </div>
                  <ul class="track-list">
                    {branch.tracks.map((track) => (
                      <li key={track.id}>
                        <strong>{track.title}</strong>
                        {track.unlockAfterTrackId
                          ? `（需先过 ${track.unlockAfterTrackId}）`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        )}

        {route === 'events' && (
          <section class="section-card">
            <h1 class="section-heading">生活事件包（M7 实装留位）</h1>
            <p class="hero-subtitle">
              按真实生活事件（「要做课程汇报/组会展示」「周末/假期短途出行」）跨分支组课与工具箱清单将在 M7 里程碑上线。
            </p>
          </section>
        )}

        {route === 'lab' && (
          <section class="section-card" aria-label="留痕与数据备份面板">
            <h1 class="section-heading">
              <span>本地留痕快照与数据备份（真实任务池与生活实验室将于 M6–M7 挂载）</span>
              <span class={`badge-pill ${isLive ? 'badge-live' : 'badge-demo'}`}>
                {isLive ? '● LIVE · 已有真实留痕' : '○ DEMO · 尚无留痕'}
              </span>
            </h1>
            <div class="metrics-grid">
              <div class="metric-box">
                <div class="metric-label">累计点亮天数</div>
                <div class="metric-value">{telemetry.activeDates.length} 天</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">AI 能力线投入</div>
                <div class="metric-value">{formatMinutes(aiDurationMs)}</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">软件技能线投入</div>
                <div class="metric-value">{formatMinutes(swDurationMs)}</div>
              </div>
              <div class="metric-box">
                <div class="metric-label">今日已完成项</div>
                <div class="metric-value">{plan.completedTaskIds.length} 项</div>
              </div>
            </div>
            <div class="btn-row">
              <button type="button" class="btn-primary" onClick={handleExport}>
                导出 JSON 备份
              </button>
              <button type="button" onClick={handleImport}>
                导入校验 JSON
              </button>
              <button type="button" onClick={handleReset}>
                重置本地留痕与今日清单
              </button>
            </div>
            {statusMsg && <div class="status-note">{statusMsg}</div>}
            {backupPreview && (
              <textarea
                aria-label="JSON 备份内容"
                value={backupPreview}
                onInput={(e) => setBackupPreview((e.target as HTMLTextAreaElement).value)}
                rows={6}
                style={{
                  width: '100%',
                  marginTop: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-warm)',
                  background: 'var(--bg-subtle)',
                }}
              />
            )}
          </section>
        )}

        {route === 'wall' && (
          <section class="section-card">
            <h1 class="section-heading">1080P 个人状态墙（M5 实装留位）</h1>
            <p class="hero-subtitle" style={{ marginBottom: '14px' }}>
              独立深底高对比零滚动六宫格状态墙（主视图）及 B1 二级切换看板将于 M5 里程碑实装。
            </p>
            <a href="#/" class="site-nav-link is-active">
              ← 返回「今天」
            </a>
          </section>
        )}
      </main>
    </div>
  );
}
