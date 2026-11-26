import {
  Briefcase,
  Compass,
  FlaskConical,
  Layers,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { CommandPalette } from '@/components/CommandPalette';
import { Badge, Button, Card, Skeleton } from '@/components/ui/primitives';
import { loadPlatformContent, type PlatformContentBundle } from '@/core/contentLoader';
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
} from '@/core/db';
import { ensureTodayPlanSnapshot } from '@/core/scheduler';
import { getRetestQueue } from '@/core/srs';
import { cn } from '@/lib/utils';
import type { BranchId, ScheduledTaskItem, TelemetrySnapshot } from '@/types/schema';
import { BranchesView } from '@/views/BranchesView';
import { EventPacksView } from '@/views/EventPacksView';
import { LifeLabWeeklyView } from '@/views/LifeLabWeeklyView';
import { ReviewDeckView } from '@/views/ReviewDeckView';
import { StatusWallView } from '@/views/StatusWallView';
import { TaskPoolView } from '@/views/TaskPoolView';
import { TodayView } from '@/views/TodayView';
import { UnitPlayerView } from '@/views/UnitPlayerView';

interface ParsedRoute {
  page: 'today' | 'branches' | 'unit' | 'review' | 'events' | 'lab' | 'wall';
  unitId?: string;
  branchId?: BranchId;
  reviewTab?: 'retest' | 'cards';
  wallSub?: 'main' | 'b1';
}

type ThemeMode = 'dark' | 'light';

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

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem('msg-theme-v3');
    return saved === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function formatMinutes(ms: number): string {
  const mins = ms / 60000;
  return mins < 1 && mins > 0 ? '<1 min' : `${Math.round(mins)} min`;
}

const NAV_ITEMS = [
  { key: 'today', label: '今日主线', short: '今天', href: '#/', icon: Sparkles },
  { key: 'branches', label: '技能星图', short: '星图', href: '#/branches', icon: Compass },
  { key: 'review', label: '刷卡重测', short: '重测', href: '#/review?tab=retest', icon: Layers },
  { key: 'events', label: '事件包', short: '事件', href: '#/events', icon: Briefcase },
  { key: 'lab', label: '实验室', short: '实验', href: '#/lab', icon: FlaskConical },
] as const;

export function App() {
  const [route, setRoute] = useState<ParsedRoute>(() =>
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : { page: 'today' }
  );
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [cmdkOpen, setCmdkOpen] = useState<boolean>(false);
  const [content, setContent] = useState<PlatformContentBundle | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [backupPreview, setBackupPreview] = useState<string>('');
  const [labTab, setLabTab] = useState<'pool' | 'experiment' | 'weekly' | 'backup'>('pool');

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#f5f7fa' : '#0b0d12');
    }
    try {
      window.localStorage.setItem('msg-theme-v3', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    setError(null);
    Promise.all([loadPlatformContent(), loadTelemetry()])
      .then(async ([bundle, snap]) => {
        if (!mounted) return;
        setContent(bundle);
        const { plan, isNewlyGenerated } = ensureTodayPlanSnapshot(bundle, snap);
        let latest = snap;
        if (isNewlyGenerated) {
          latest = await saveDailyPlanSnapshot({ ...plan, lowBatteryMode: false });
        } else if (snap.currentDailyPlan?.lowBatteryMode) {
          // 清理历史遗留的保底开关态，确保所有当日任务正常展示
          latest = await setDailyLowBatteryMode(false);
        }
        if (mounted) setTelemetry(latest);
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
  }, [reloadTick]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const navigateHash = (hash: string) => {
    window.location.hash = hash;
  };

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[540px] items-center justify-center px-5">
        <Card className="w-full space-y-4">
          <Badge tone="danger">数据加载异常</Badge>
          <h1 className="m-0 text-[20px] font-semibold text-[var(--ink-1)]">
            无法读取学习内容包
          </h1>
          <p className="m-0 text-[14px] text-[var(--ink-2)]">{error}</p>
          <Button variant="primary" onClick={() => setReloadTick((t) => t + 1)}>
            <RefreshCw size={15} strokeWidth={1.5} />
            <span>重新加载</span>
          </Button>
        </Card>
      </main>
    );
  }

  if (!content || !telemetry || !telemetry.currentDailyPlan) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="h-[56px] border-b border-[var(--line)] bg-[var(--surface-glass)]" />
        <main className="mx-auto max-w-[1200px] space-y-5 px-4 py-8 sm:px-6">
          <Skeleton className="h-7 w-48" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Skeleton className="h-[280px] w-full rounded-[14px]" />
            <Skeleton className="h-[280px] w-full rounded-[14px]" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Skeleton className="h-[150px] w-full rounded-[14px]" />
            <Skeleton className="h-[150px] w-full rounded-[14px]" />
            <Skeleton className="h-[150px] w-full rounded-[14px]" />
          </div>
        </main>
      </div>
    );
  }

  const plan = telemetry.currentDailyPlan;
  const isLive = hasLiveTelemetry(telemetry);
  const retestQueue = getRetestQueue(content.knowledgeGraph, content.units, telemetry);
  const pendingRetestCount = retestQueue.dueItems.length + retestQueue.upcomingItems.length;

  const handleToggleTipAck = async (ack: boolean) => {
    const next = await setDailyTipAcknowledged(ack);
    setTelemetry(next);
    if (ack) toast.success('已收起今日一招');
  };

  const handleToggleTask = async (task: ScheduledTaskItem) => {
    const wasDone = plan.completedTaskIds.includes(task.id);
    const next = await toggleDailyTaskCompletion(task);
    setTelemetry(next);
    toast(wasDone ? `已取消完成：${task.title}` : `已完成：${task.title}`);
  };

  const handleOpenUnit = (unitId: string) => {
    navigateHash(`#/unit/${encodeURIComponent(unitId)}`);
  };

  const handleBackToBranches = (branchId: BranchId) => {
    navigateHash(`#/branches?b=${branchId}`);
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
    toast.success('阶段实战产出已登记归档');
  };

  const handleExport = async () => {
    const json = await exportTelemetryJson();
    setBackupPreview(json);
    setStatusMsg('已生成当前本地学习记录 JSON 快照，可复制保存');
    toast.success('已生成本地 JSON 备份');
  };

  const handleImport = async () => {
    if (!backupPreview.trim()) {
      setStatusMsg('请先点击「导出 JSON 备份」或在下方粘贴合法的备份 JSON');
      return;
    }
    try {
      const imported = await importTelemetryJson(backupPreview);
      const { plan: ensured, isNewlyGenerated } = ensureTodayPlanSnapshot(content, imported);
      const finalSnap = isNewlyGenerated
        ? await saveDailyPlanSnapshot({ ...ensured, lowBatteryMode: false })
        : imported;
      setTelemetry(finalSnap);
      setStatusMsg('备份 JSON 导入成功，本地记录与今日进度已同步更新');
      toast.success('备份导入成功');
    } catch (err) {
      const msg = `导入失败：${err instanceof Error ? err.message : String(err)}`;
      setStatusMsg(msg);
      toast.error(msg);
    }
  };

  const handleReset = async () => {
    const empty = await clearTelemetry();
    const { plan: freshPlan } = ensureTodayPlanSnapshot(content, empty);
    const saved = await saveDailyPlanSnapshot({ ...freshPlan, lowBatteryMode: false });
    setTelemetry(saved);
    setBackupPreview('');
    setStatusMsg('已重置本地留痕并重新生成干净的今日清单');
    toast('已重置本地学习记录');
  };

  const aiDurationMs = telemetry.sessionDurations
    .filter((d) => d.lineKind === 'b1_ai')
    .reduce((acc, d) => acc + d.durationMs, 0);
  const swDurationMs = telemetry.sessionDurations
    .filter((d) => d.lineKind === 'b1_software')
    .reduce((acc, d) => acc + d.durationMs, 0);

  const activeUnit =
    route.page === 'unit' ? content.units.find((u) => u.id === route.unitId) : undefined;

  // 1080P 全屏个人状态墙路由
  if (route.page === 'wall') {
    return (
      <StatusWallView
        content={content}
        telemetry={telemetry}
        initialSubView={route.wallSub ?? 'main'}
      />
    );
  }

  // 互动学习单元专注分屏模式
  if (route.page === 'unit') {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--ink-1)]">
        <a href="#main-content" className="skip-link">
          跳至主内容
        </a>
        <Toaster theme={theme} position="bottom-right" />
        <CommandPalette
          open={cmdkOpen}
          onOpenChange={setCmdkOpen}
          content={content}
          onNavigate={navigateHash}
        />
        {activeUnit ? (
          <UnitPlayerView
            key={activeUnit.id}
            unit={activeUnit}
            content={content}
            telemetry={telemetry}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenCommandPalette={() => setCmdkOpen(true)}
            onTelemetryChange={setTelemetry}
            onBackToBranches={handleBackToBranches}
            onOpenUnit={handleOpenUnit}
          />
        ) : (
          <main id="main-content" className="mx-auto max-w-[640px] px-4 py-12">
            <Card className="space-y-4">
              <h1 className="m-0 text-[22px] font-semibold">未找到对应学习单元</h1>
              <p className="m-0 text-[14px] text-[var(--ink-2)]">
                该单元编号不存在或尚未发布，可返回技能星图查看全部开放单元
              </p>
              <Button variant="primary" onClick={() => navigateHash('#/branches')}>
                返回七分支技能星图
              </Button>
            </Card>
          </main>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink-1)] pb-[76px] md:pb-12">
      <a href="#main-content" className="skip-link">
        跳至主内容
      </a>
      <Toaster theme={theme} position="bottom-right" />
      <CommandPalette
        open={cmdkOpen}
        onOpenChange={setCmdkOpen}
        content={content}
        onNavigate={navigateHash}
      />

      {/* 顶部悬浮精密导航 Dock（56px） */}
      <header className="sticky top-0 z-40 h-[56px] border-b border-[var(--line)] bg-[var(--surface-glass)] backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
          {/* 品牌标识（零渐变底块，纯几何刻线标志） */}
          <a
            href="#/"
            className="flex items-center gap-2.5 text-[var(--ink-1)] no-underline shrink-0"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-[var(--line-strong)] bg-[var(--surface)]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
                <path
                  d="M8 3.2L10.8 8L8 12.8L5.2 8L8 3.2Z"
                  fill="var(--accent)"
                />
              </svg>
            </span>
            <span className="text-[14.5px] font-semibold tracking-[-0.01em] whitespace-nowrap">
              现代必备生存指南
            </span>
          </a>

          {/* 桌面主导航（Motion layoutId 平滑滑轨） */}
          <nav
            aria-label="主导航"
            className="hidden md:flex items-center gap-1 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-1"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = route.page === item.key;
              return (
                <a
                  key={item.key}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13.5px] font-medium no-underline transition-colors',
                    isActive
                      ? 'text-[var(--ink-1)]'
                      : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="dock-active-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-[7px] bg-[var(--surface-raised)] border border-[var(--line-strong)]"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <Icon size={14} strokeWidth={1.5} />
                    <span>{item.label}</span>
                    {item.key === 'review' && pendingRetestCount > 0 && (
                      <span className="font-mono-num rounded bg-[var(--warning-soft)] px-1.5 py-0.2 text-[11px] text-[var(--warning)]">
                        {pendingRetestCount}
                      </span>
                    )}
                  </span>
                </a>
              );
            })}
          </nav>

          {/* 右侧工具组：⌘K 全局检索 + 明暗双主题 + 1080P 状态墙 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="cmdk-trigger"
              aria-label="全局快速搜索"
              onClick={() => setCmdkOpen(true)}
              className="inline-flex h-[36px] max-[480px]:h-[44px] cursor-pointer items-center gap-2 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--ink-1)]"
            >
              <Search size={14} strokeWidth={1.5} />
              <span className="hidden lg:inline">快速跳转</span>
              <kbd className="hidden sm:inline font-mono-num rounded border border-[var(--line)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[11px] text-[var(--ink-3)]">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              data-testid="theme-toggle"
              aria-label={theme === 'dark' ? '切换至冰蓝宣白浅色主题' : '切换至深空炭墨暗色主题'}
              onClick={toggleTheme}
              className="inline-flex h-[36px] w-[36px] max-[480px]:h-[44px] max-[480px]:w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--ink-1)]"
            >
              {theme === 'dark' ? (
                <Sun size={15} strokeWidth={1.5} />
              ) : (
                <Moon size={15} strokeWidth={1.5} />
              )}
            </button>

            <a
              href="#/wall"
              aria-label="打开 1080P 状态墙"
              className="inline-flex h-[36px] max-[480px]:h-[44px] items-center gap-1.5 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-[13px] font-medium text-[var(--ink-1)] no-underline transition-colors hover:bg-[var(--surface-raised)]"
            >
              <Monitor size={14} strokeWidth={1.5} className="text-[var(--accent)]" />
              <span className="hidden sm:inline">状态墙</span>
            </a>
          </div>
        </div>
      </header>

      {/* 主学习工作画布 */}
      <main id="main-content" className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        {route.page === 'today' && (
          <TodayView
            content={content}
            telemetry={telemetry}
            plan={plan}
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
          <div className="space-y-6">
            <header className="space-y-1.5">
              <h1 className="m-0 text-[24px] sm:text-[28px] font-semibold tracking-[-0.02em] text-[var(--ink-1)]">
                真实任务与生活实验室
              </h1>
              <p className="m-0 text-[14.5px] text-[var(--ink-2)]">
                把真实待办接进学习行动步，按月做可控变量生活实验，并随时导出本地 JSON 备份
              </p>
            </header>

            <div
              className="flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--line)] pb-px"
              role="tablist"
              aria-label="实践实验室子视图"
            >
              {(
                [
                  { id: 'pool', label: '真实任务池' },
                  { id: 'experiment', label: '月度生活实验室' },
                  { id: 'weekly', label: '每周生活复盘' },
                  { id: 'backup', label: '本地留痕与备份' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={labTab === t.id}
                  onClick={() => setLabTab(t.id)}
                  className={cn(
                    'cursor-pointer whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[14px] font-medium transition-colors',
                    labTab === t.id
                      ? 'border-[var(--accent)] text-[var(--ink-1)]'
                      : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  )}
                >
                  {t.label}
                </button>
              ))}
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
              <Card className="space-y-5" aria-label="留痕与数据备份面板">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
                      本地数据快照与跨设备备份
                    </h2>
                    <p className="mt-1 mb-0 text-[13.5px] text-[var(--ink-2)]">
                      全部数据保存在当前浏览器 IndexedDB，跨设备迁移请导出 JSON 并在新设备导入
                    </p>
                  </div>
                  <Badge tone={isLive ? 'growth' : 'warning'}>
                    {isLive ? '已有真实留痕' : '当前为空白态'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="v3-card-raised p-3.5">
                    <div className="text-[12px] text-[var(--ink-3)]">累计点亮天数</div>
                    <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
                      {telemetry.activeDates.length} 天
                    </strong>
                  </div>
                  <div className="v3-card-raised p-3.5">
                    <div className="text-[12px] text-[var(--ink-3)]">AI 能力线投入</div>
                    <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
                      {formatMinutes(aiDurationMs)}
                    </strong>
                  </div>
                  <div className="v3-card-raised p-3.5">
                    <div className="text-[12px] text-[var(--ink-3)]">软件技能线投入</div>
                    <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
                      {formatMinutes(swDurationMs)}
                    </strong>
                  </div>
                  <div className="v3-card-raised p-3.5">
                    <div className="text-[12px] text-[var(--ink-3)]">已过关单元</div>
                    <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
                      {Object.values(telemetry.unitSubmissions).filter((u) => u.isCleared).length}{' '}
                      节
                    </strong>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <Button variant="primary" onClick={handleExport}>
                    导出 JSON 备份
                  </Button>
                  <Button variant="outline" onClick={handleImport}>
                    导入校验 JSON
                  </Button>
                  <Button variant="danger" onClick={handleReset}>
                    重置本地留痕
                  </Button>
                </div>

                {statusMsg && (
                  <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[13.5px] text-[var(--ink-2)]">
                    {statusMsg}
                  </div>
                )}

                {backupPreview && (
                  <textarea
                    aria-label="JSON 备份内容"
                    className="v3-textarea font-mono-num text-[12.5px]"
                    value={backupPreview}
                    onChange={(e) => setBackupPreview(e.target.value)}
                    rows={6}
                  />
                )}
              </Card>
            )}
          </div>
        )}
      </main>

      {/* 手机端固定底部 5 项 Dock（≥44px 触控热区） */}
      <nav
        aria-label="手机主导航"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[var(--line)] bg-[var(--surface-glass)] backdrop-blur-md md:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = route.page === item.key;
          return (
            <a
              key={item.key}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium no-underline transition-colors',
                isActive ? 'text-[var(--accent)]' : 'text-[var(--ink-3)]'
              )}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span>{item.short}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
