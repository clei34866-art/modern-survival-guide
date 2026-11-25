import { useEffect, useState } from 'preact/hooks';
import {
  IconBranches,
  IconBriefcase,
  IconCards,
  IconClose,
  IconExternal,
  IconFlask,
  IconMenu,
  IconMonitor,
  IconSprout,
  IconSun,
} from './components/Icons';
import { loadPlatformContent, type PlatformContentBundle } from './core/contentLoader';
import {
  clearTelemetry,
  exportTelemetryJson,
  hasLiveTelemetry,
  importTelemetryJson,
  loadTelemetry,
  recordMilestoneSubmission,
  saveDailyPlanSnapshot,
  setDailyLowBatteryMode,
  setDailyTipAcknowledged,
  subscribeTelemetrySync,
  toggleDailyTaskCompletion,
} from './core/db';
import {
  computeContinuityFootprint,
  ensureTodayPlanSnapshot,
  getEffectiveDailyProgress,
} from './core/scheduler';
import { getRetestQueue } from './core/srs';
import type { BranchId, ScheduledTaskItem, TelemetrySnapshot } from './types/schema';
import { BranchesView } from './views/BranchesView';
import { EventPacksView } from './views/EventPacksView';
import { LifeLabWeeklyView } from './views/LifeLabWeeklyView';
import { ReviewDeckView } from './views/ReviewDeckView';
import { StatusWallView } from './views/StatusWallView';
import { TaskPoolView } from './views/TaskPoolView';
import { TodayView } from './views/TodayView';
import { UnitPlayerView } from './views/UnitPlayerView';

interface ParsedRoute {
  page: 'today' | 'branches' | 'unit' | 'review' | 'events' | 'lab' | 'wall';
  unitId?: string;
  branchId?: BranchId;
  reviewTab?: 'retest' | 'cards';
  wallSub?: 'main' | 'b1';
}

function parseHashRoute(hash: string): ParsedRoute {
  const clean = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = clean.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(queryPart ?? '');

  if (segments[0] === 'unit' && segments[1]) {
    return { page: 'unit', unitId: decodeURIComponent(segments[1]) };
  }
  if (segments[0] === 'review') {
    const t = params.get('tab');
    return { page: 'review', reviewTab: t === 'cards' ? 'cards' : 'retest' };
  }
  if (segments[0] === 'branches') {
    const b = params.get('b') as BranchId | null;
    return { page: 'branches', branchId: b ?? undefined };
  }
  if (segments[0] === 'events') return { page: 'events' };
  if (segments[0] === 'lab') return { page: 'lab' };
  if (segments[0] === 'wall') {
    return { page: 'wall', wallSub: params.get('sub') === 'b1' ? 'b1' : 'main' };
  }
  return { page: 'today' };
}

function formatMinutes(ms: number): string {
  const mins = ms / 60000;
  return mins < 1 && mins > 0 ? '<1 min' : `${Math.round(mins)} min`;
}

const PAGE_LABELS: Record<ParsedRoute['page'], string> = {
  today: '今天',
  branches: '七分支与技能树',
  unit: '沉浸学习单元',
  review: '重测与闪卡',
  events: '生活事件包',
  lab: '任务与实验室',
  wall: '1080P 状态墙',
};

export function App() {
  const [route, setRoute] = useState<ParsedRoute>(() =>
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : { page: 'today' }
  );
  const [content, setContent] = useState<PlatformContentBundle | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [backupPreview, setBackupPreview] = useState<string>('');
  const [labTab, setLabTab] = useState<'pool' | 'experiment' | 'weekly' | 'backup'>('pool');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
      setDrawerOpen(false);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
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
      <main class="focus-shell">
        <div class="surface-card">加载失败：{error}</div>
      </main>
    );
  }

  if (!content || !telemetry || !telemetry.currentDailyPlan) {
    return (
      <main class="focus-shell">
        <div class="surface-card loading-skeleton">正在准备今天的节奏台…</div>
      </main>
    );
  }

  const plan = telemetry.currentDailyPlan;
  const isLive = hasLiveTelemetry(telemetry);
  const todayProgress = getEffectiveDailyProgress(plan);
  const continuity = computeContinuityFootprint(telemetry.activeDates, plan.dateKey);
  const retestQueue = getRetestQueue(content.knowledgeGraph, content.units, telemetry);
  const pendingRetestCount = retestQueue.dueItems.length + retestQueue.upcomingItems.length;

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

  const handleOpenUnit = (unitId: string) => {
    window.location.hash = `#/unit/${encodeURIComponent(unitId)}`;
  };

  const handleBackToBranches = (branchId: BranchId) => {
    window.location.hash = `#/branches?b=${branchId}`;
  };

  const handleSaveMilestone = async (input: {
    trackId: string;
    branchId: BranchId;
    completionPercent: number;
    artifactSummary: string;
    isApproved: boolean;
  }) => {
    const next = await recordMilestoneSubmission(input);
    setTelemetry(next);
  };

  const handleExport = async () => {
    const json = await exportTelemetryJson();
    setBackupPreview(json);
    setStatusMsg('已生成当前本地学习记录 JSON 快照，可全选复制或另存为文件。');
  };

  const handleImport = async () => {
    if (!backupPreview.trim()) {
      setStatusMsg('请先点击「导出 JSON 备份」或在下方粘贴合法的备份 JSON。');
      return;
    }
    try {
      const imported = await importTelemetryJson(backupPreview);
      const { plan: ensured, isNewlyGenerated } = ensureTodayPlanSnapshot(content, imported);
      const finalSnap = isNewlyGenerated ? await saveDailyPlanSnapshot(ensured) : imported;
      setTelemetry(finalSnap);
      setStatusMsg('备份 JSON 导入成功，本地记录与今日进度已同步更新。');
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

  const activeUnit =
    route.page === 'unit'
      ? content.units.find((u) => u.id === route.unitId)
      : undefined;

  // 独立全屏 1080P 个人状态墙路由
  if (route.page === 'wall') {
    return (
      <StatusWallView
        content={content}
        telemetry={telemetry}
        initialSubView={route.wallSub ?? 'main'}
      />
    );
  }

  // 学习单元专注全屏接管模式（隐藏侧栏与底部 Tab，100% 聚焦动图导学与自测）
  if (route.page === 'unit') {
    return (
      <div class="focus-mode-root">
        {activeUnit ? (
          <UnitPlayerView
            key={activeUnit.id}
            unit={activeUnit}
            content={content}
            telemetry={telemetry}
            onTelemetryChange={setTelemetry}
            onBackToBranches={handleBackToBranches}
            onOpenUnit={handleOpenUnit}
          />
        ) : (
          <main class="focus-shell">
            <section class="surface-card">
              <h1 class="page-h1">未找到对应学习单元</h1>
              <a href="#/branches" class="btn btn-primary">
                返回七分支路径图
              </a>
            </section>
          </main>
        )}
      </div>
    );
  }

  return (
    <div class="workbench-shell">
      {/* 移动端与平板精简顶栏 */}
      <header class="mobile-topbar">
        <div class="mobile-topbar-left">
          <button
            type="button"
            class="icon-only-btn tablet-drawer-btn"
            aria-label="打开导航抽屉"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {drawerOpen ? <IconClose size={18} /> : <IconMenu size={18} />}
          </button>
          <a href="#/" class="mobile-brand-link">
            <span class="brand-mark-badge">
              <IconSprout size={15} />
            </span>
            <span class="mobile-brand-name">现代必备生存指南</span>
          </a>
          <span class="mobile-route-sep">/</span>
          <span class="mobile-route-label">{PAGE_LABELS[route.page]}</span>
        </div>
        <a href="#/wall" class="mobile-wall-link" aria-label="打开状态墙">
          <IconMonitor size={15} />
          <span>状态墙</span>
        </a>
      </header>

      {/* 平板抽屉遮罩 */}
      {drawerOpen && (
        <div
          class="sidebar-scrim"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 桌面固定左侧工作区侧栏（244px） */}
      <aside class={`workbench-sidebar ${drawerOpen ? 'is-open' : ''}`} aria-label="主工作区导航">
        <a href="#/" class="sidebar-brand">
          <span class="brand-mark-badge">
            <IconSprout size={17} />
          </span>
          <div class="sidebar-brand-copy">
            <span class="sidebar-brand-title">现代必备生存指南</span>
            <span class="sidebar-brand-sub">生产力与生活掌控台</span>
          </div>
        </a>

        <nav class="sidebar-nav" aria-label="主导航">
          <div class="sidebar-group-label">日常学习</div>
          <a
            href="#/"
            class={`sidebar-link ${route.page === 'today' ? 'is-active' : ''}`}
            aria-current={route.page === 'today' ? 'page' : undefined}
          >
            <IconSun size={17} />
            <span class="sidebar-link-text">今天</span>
            <span class="sidebar-badge tabular-num">
              {todayProgress.completedActiveCount}/{todayProgress.totalActiveCount}
            </span>
          </a>

          <a
            href="#/branches"
            class={`sidebar-link ${route.page === 'branches' ? 'is-active' : ''}`}
            aria-current={route.page === 'branches' ? 'page' : undefined}
          >
            <IconBranches size={17} />
            <span class="sidebar-link-text">七分支路径</span>
          </a>

          <a
            href="#/review?tab=retest"
            class={`sidebar-link ${route.page === 'review' ? 'is-active' : ''}`}
            aria-current={route.page === 'review' ? 'page' : undefined}
          >
            <IconCards size={17} />
            <span class="sidebar-link-text">重测与闪卡</span>
            {pendingRetestCount > 0 && (
              <span class="sidebar-badge is-alert tabular-num">{pendingRetestCount}</span>
            )}
          </a>

          <div class="sidebar-group-label">生活实践</div>
          <a
            href="#/events"
            class={`sidebar-link ${route.page === 'events' ? 'is-active' : ''}`}
            aria-current={route.page === 'events' ? 'page' : undefined}
          >
            <IconBriefcase size={17} />
            <span class="sidebar-link-text">生活事件包</span>
          </a>

          <a
            href="#/lab"
            class={`sidebar-link ${route.page === 'lab' ? 'is-active' : ''}`}
            aria-current={route.page === 'lab' ? 'page' : undefined}
          >
            <IconFlask size={17} />
            <span class="sidebar-link-text">任务与实验室</span>
          </a>
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-streak-box" title="累计活跃天数，断更不清零">
            <div class="sidebar-streak-head">
              <span class="sidebar-streak-label">累计点亮</span>
              <strong class="sidebar-streak-val tabular-num">{continuity.totalActiveDays} 天</strong>
            </div>
            <div class="mini-dots-row" aria-label="近 7 天点亮足迹">
              {continuity.recent14Days.slice(-7).map((d) => (
                <span
                  key={d.dateKey}
                  class={`mini-dot ${d.isActive ? 'is-lit' : ''} ${d.isToday ? 'is-today' : ''}`}
                  title={d.dateKey}
                />
              ))}
            </div>
          </div>

          <a href="#/wall" class="sidebar-wall-btn">
            <IconMonitor size={16} />
            <span>1080P 状态墙</span>
            <IconExternal size={13} class="wall-ext-icon" />
          </a>
        </div>
      </aside>

      {/* 右侧主学习画布 */}
      <main class="workbench-main">
        <div class="workbench-content">
          {route.page === 'today' && (
            <TodayView
              content={content}
              telemetry={telemetry}
              plan={plan}
              onToggleLowBattery={handleToggleLowBattery}
              onToggleTipAck={handleToggleTipAck}
              onToggleTask={handleToggleTask}
            />
          )}

          {route.page === 'branches' && (
            <BranchesView
              content={content}
              telemetry={telemetry}
              initialBranchId={route.branchId ?? 'B1'}
              onOpenUnit={handleOpenUnit}
              onSaveMilestone={handleSaveMilestone}
            />
          )}

          {route.page === 'review' && (
            <ReviewDeckView
              content={content}
              telemetry={telemetry}
              initialTab={route.reviewTab}
              onTelemetryChange={setTelemetry}
              onOpenUnit={handleOpenUnit}
            />
          )}

          {route.page === 'events' && (
            <EventPacksView
              content={content}
              telemetry={telemetry}
              onTelemetryChange={setTelemetry}
              onOpenUnit={handleOpenUnit}
            />
          )}

          {route.page === 'lab' && (
            <div class="lab-workspace">
              <header class="page-header-strip">
                <div>
                  <h1 class="page-h1">真实任务与生活实验室</h1>
                  <p class="page-subtitle">
                    把真实待办接进学习行动步，按月做可控变量生活实验，并随时导出本地 JSON 备份。
                  </p>
                </div>
              </header>

              <div class="underline-tabs" role="tablist" aria-label="实践实验室子视图">
                <button
                  type="button"
                  role="tab"
                  aria-selected={labTab === 'pool'}
                  class={`underline-tab ${labTab === 'pool' ? 'is-active' : ''}`}
                  onClick={() => setLabTab('pool')}
                >
                  真实任务池
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={labTab === 'experiment'}
                  class={`underline-tab ${labTab === 'experiment' ? 'is-active' : ''}`}
                  onClick={() => setLabTab('experiment')}
                >
                  月度生活实验室
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={labTab === 'weekly'}
                  class={`underline-tab ${labTab === 'weekly' ? 'is-active' : ''}`}
                  onClick={() => setLabTab('weekly')}
                >
                  每周生活复盘
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={labTab === 'backup'}
                  class={`underline-tab ${labTab === 'backup' ? 'is-active' : ''}`}
                  onClick={() => setLabTab('backup')}
                >
                  本地留痕与 JSON 备份
                </button>
              </div>

              {labTab === 'pool' && (
                <TaskPoolView
                  content={content}
                  telemetry={telemetry}
                  onTelemetryChange={setTelemetry}
                  onOpenUnit={handleOpenUnit}
                />
              )}

              {labTab === 'experiment' && (
                <LifeLabWeeklyView
                  content={content}
                  telemetry={telemetry}
                  mode="lab"
                  onTelemetryChange={setTelemetry}
                />
              )}

              {labTab === 'weekly' && (
                <LifeLabWeeklyView
                  content={content}
                  telemetry={telemetry}
                  mode="weekly"
                  onTelemetryChange={setTelemetry}
                />
              )}

              {labTab === 'backup' && (
                <section class="surface-card" aria-label="留痕与数据备份面板">
                  <div class="section-head-row">
                    <div>
                      <h2 class="section-h2">本地数据快照与跨设备备份</h2>
                      <p class="muted-desc">
                        全部数据保存在当前浏览器 IndexedDB（无云同步），跨设备迁移请导出 JSON 并在新设备导入。
                      </p>
                    </div>
                    <span class={`status-chip ${isLive ? 'chip-growth' : 'chip-warning'}`}>
                      {isLive ? '已有真实留痕' : '当前为空白态'}
                    </span>
                  </div>

                  <div class="kpi-strip-4">
                    <div class="kpi-cell">
                      <span class="kpi-label">累计点亮天数</span>
                      <strong class="kpi-num tabular-num">{telemetry.activeDates.length} 天</strong>
                    </div>
                    <div class="kpi-cell">
                      <span class="kpi-label">AI 能力线投入</span>
                      <strong class="kpi-num tabular-num">{formatMinutes(aiDurationMs)}</strong>
                    </div>
                    <div class="kpi-cell">
                      <span class="kpi-label">软件技能线投入</span>
                      <strong class="kpi-num tabular-num">{formatMinutes(swDurationMs)}</strong>
                    </div>
                    <div class="kpi-cell">
                      <span class="kpi-label">已过关单元</span>
                      <strong class="kpi-num tabular-num">
                        {Object.values(telemetry.unitSubmissions).filter((u) => u.isCleared).length} 节
                      </strong>
                    </div>
                  </div>

                  <div class="btn-row">
                    <button type="button" class="btn btn-primary" onClick={handleExport}>
                      导出 JSON 备份
                    </button>
                    <button type="button" class="btn" onClick={handleImport}>
                      导入校验 JSON
                    </button>
                    <button type="button" class="btn btn-danger-ghost" onClick={handleReset}>
                      重置本地留痕
                    </button>
                  </div>

                  {statusMsg && <div class="status-note">{statusMsg}</div>}
                  {backupPreview && (
                    <textarea
                      aria-label="JSON 备份内容"
                      class="backup-textarea"
                      value={backupPreview}
                      onInput={(e) => setBackupPreview((e.target as HTMLTextAreaElement).value)}
                      rows={6}
                    />
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* 手机端固定底部 5 项 Tab 栏 */}
      <nav class="mobile-bottom-tabs" aria-label="手机主导航">
        <a
          href="#/"
          class={`mobile-tab-item ${route.page === 'today' ? 'is-active' : ''}`}
          aria-current={route.page === 'today' ? 'page' : undefined}
        >
          <IconSun size={19} />
          <span>今天</span>
        </a>
        <a
          href="#/branches"
          class={`mobile-tab-item ${route.page === 'branches' ? 'is-active' : ''}`}
          aria-current={route.page === 'branches' ? 'page' : undefined}
        >
          <IconBranches size={19} />
          <span>分支</span>
        </a>
        <a
          href="#/review?tab=retest"
          class={`mobile-tab-item ${route.page === 'review' ? 'is-active' : ''}`}
          aria-current={route.page === 'review' ? 'page' : undefined}
        >
          <IconCards size={19} />
          <span>重测</span>
        </a>
        <a
          href="#/events"
          class={`mobile-tab-item ${route.page === 'events' ? 'is-active' : ''}`}
          aria-current={route.page === 'events' ? 'page' : undefined}
        >
          <IconBriefcase size={19} />
          <span>事件</span>
        </a>
        <a
          href="#/lab"
          class={`mobile-tab-item ${route.page === 'lab' ? 'is-active' : ''}`}
          aria-current={route.page === 'lab' ? 'page' : undefined}
        >
          <IconFlask size={19} />
          <span>实验</span>
        </a>
      </nav>
    </div>
  );
}
