import {
  Briefcase,
  Compass,
  Eye,
  EyeOff,
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
import { GlossaryDrawerProvider } from '@/components/GlossaryDrawer';
import { AlertBanner, Modal, Tooltip } from '@/components/ui/overlays';
import { Badge, Button, Card, Skeleton } from '@/components/ui/primitives';
import { UnitPreviewDrawer } from '@/components/UnitPreviewDrawer';
import { WaveBackdrop } from '@/components/WaveBackdrop';
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
import { useLiquidGlass } from '@/lib/liquidGlass';
import { cn } from '@/lib/utils';
import type { BranchId, LearningUnit, ScheduledTaskItem, TelemetrySnapshot } from '@/types/schema';
import { BranchesView } from '@/views/BranchesView';
import { EventPacksView } from '@/views/EventPacksView';
import { LifeLabWeeklyView } from '@/views/LifeLabWeeklyView';
import { LifeNotebookView } from '@/views/LifeNotebookView';
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

interface TopAlertState {
  tone: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
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
  { key: 'today', label: '今天', short: '今天', href: '#/', icon: Sparkles },
  { key: 'branches', label: '生活技能', short: '技能', href: '#/branches', icon: Compass },
  { key: 'review', label: '温习本', short: '温习', href: '#/review?tab=retest', icon: Layers },
  { key: 'events', label: '遇事速查', short: '速查', href: '#/events', icon: Briefcase },
  { key: 'lab', label: '生活手账', short: '手账', href: '#/lab', icon: FlaskConical },
] as const;

export function App() {
  const [route, setRoute] = useState<ParsedRoute>(() =>
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : { page: 'today' }
  );
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [pureView, setPureView] = useState<boolean>(false);
  const [cmdkOpen, setCmdkOpen] = useState<boolean>(false);
  const [content, setContent] = useState<PlatformContentBundle | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);

  // 顶部系统 Alert 状态（严格单条仲裁，绝不堆叠）
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [backupError, setBackupError] = useState<string | null>(null);
  const [dueAlertDismissed, setDueAlertDismissed] = useState<boolean>(false);

  // 实验室备份 & 强打断 Modal 确认态（仅用于高风险不可逆操作）
  const [backupPreview, setBackupPreview] = useState<string>('');
  const [resetModalOpen, setResetModalOpen] = useState<boolean>(false);
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [labTab, setLabTab] = useState<'pool' | 'experiment' | 'notes' | 'weekly' | 'backup'>('pool');

  // 共享学习内容速览 Drawer
  const [previewUnit, setPreviewUnit] = useState<LearningUnit | null>(null);

  // Chromium 悬浮导航胶囊：真 2D Smooth-Min SDF 组合 + RGB 三通道棱镜折射色散
  const navPillRef = useLiquidGlass<HTMLElement>({
    enabled: route.page !== 'wall' && route.page !== 'unit',
    sdfMode: 'compound',
    scale: -26,
    chroma: 4.8,
    border: 0.16,
    blur: 11,
    saturate: 1.82,
    brightness: 1.07,
    maxWidth: 700,
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.clarity = telemetry?.wallPersonal?.glassClarity ?? 'clear';
    root.classList.toggle('dark', theme === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'light' ? '#dce8f8' : '#071226');
    }
    try {
      window.localStorage.setItem('msg-theme-v3', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme, telemetry?.wallPersonal?.glassClarity]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
      setPureView(false);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline = () => {
      setIsOffline(false);
      toast.success('网络已恢复连接');
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    if (!pureView) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPureView(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pureView]);

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
      <div className="relative min-h-screen">
        <WaveBackdrop mode="home" />
        <main className="relative z-10 mx-auto flex min-h-screen max-w-[540px] items-center justify-center px-5">
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
      </div>
    );
  }

  if (!content || !telemetry || !telemetry.currentDailyPlan) {
    return (
      <div className="relative min-h-screen">
        <WaveBackdrop mode="home" />
        <div className="relative z-10">
          <div className="h-[56px] border-b border-[var(--line)] bg-[var(--surface-glass)] backdrop-blur-md" />
          <main className="mx-auto max-w-[1160px] space-y-5 px-4 py-8 sm:px-6">
            <Skeleton className="h-7 w-48" />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
              <Skeleton className="h-[260px] w-full rounded-[18px]" />
              <Skeleton className="h-[260px] w-full rounded-[18px]" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Skeleton className="h-[140px] w-full rounded-[18px]" />
              <Skeleton className="h-[140px] w-full rounded-[18px]" />
              <Skeleton className="h-[140px] w-full rounded-[18px]" />
            </div>
          </main>
        </div>
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

  const handlePreviewUnit = (unitId: string) => {
    const found = content.units.find((u) => u.id === unitId) ?? null;
    setPreviewUnit(found);
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
    toast.success('阶段实战产出已归档');
  };

  const handleExport = async () => {
    const json = await exportTelemetryJson();
    setBackupPreview(json);
    setBackupError(null);
    toast.success('已生成本地 JSON 备份，可复制保存');
  };

  const executeImport = async () => {
    if (!backupPreview.trim()) {
      setBackupError('请先点击「导出 JSON 备份」或在下方粘贴合法的备份 JSON');
      return;
    }
    try {
      const imported = await importTelemetryJson(backupPreview);
      const { plan: ensured, isNewlyGenerated } = ensureTodayPlanSnapshot(content, imported);
      const finalSnap = isNewlyGenerated
        ? await saveDailyPlanSnapshot({ ...ensured, lowBatteryMode: false })
        : imported;
      setTelemetry(finalSnap);
      setBackupError(null);
      toast.success('备份导入成功，本地进度已同步');
    } catch (err) {
      setBackupError(`备份 JSON 校验失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleImportClick = () => {
    if (!backupPreview.trim()) {
      setBackupError('请先点击「导出 JSON 备份」或在下方粘贴合法的备份 JSON');
      return;
    }
    if (isLive) {
      setImportModalOpen(true);
    } else {
      void executeImport();
    }
  };

  const executeReset = async () => {
    const empty = await clearTelemetry();
    const { plan: freshPlan } = ensureTodayPlanSnapshot(content, empty);
    const saved = await saveDailyPlanSnapshot({ ...freshPlan, lowBatteryMode: false });
    setTelemetry(saved);
    setBackupPreview('');
    setBackupError(null);
    toast('已清空本地学习留痕');
  };

  const aiDurationMs = telemetry.sessionDurations
    .filter((d) => d.lineKind === 'b1_ai')
    .reduce((acc, d) => acc + d.durationMs, 0);
  const swDurationMs = telemetry.sessionDurations
    .filter((d) => d.lineKind === 'b1_software')
    .reduce((acc, d) => acc + d.durationMs, 0);

  const activeUnit =
    route.page === 'unit' ? content.units.find((u) => u.id === route.unitId) : undefined;

  // 顶部系统 Alert 严格单条仲裁（同一时刻最多展示 1 条最高优先级告警，绝不堆叠）
  const activeTopAlert: TopAlertState | null = isOffline
    ? {
        tone: 'warning',
        title: '当前已离线',
        message: '学习进度仍保存在本机浏览器 IndexedDB，联网后可继续同步外部资源。',
      }
    : backupError
      ? {
          tone: 'danger',
          title: '备份校验异常',
          message: backupError,
          dismissible: true,
          onDismiss: () => setBackupError(null),
        }
      : retestQueue.dueItems.length > 0 && !dueAlertDismissed && route.page !== 'review'
        ? {
            tone: 'info',
            title: '间隔重测提醒',
            message: `今日有 ${retestQueue.dueItems.length} 项错题/模糊概念到达 1/3/7 天复习节点。`,
            dismissible: true,
            onDismiss: () => setDueAlertDismissed(true),
            actionLabel: '立即重测',
            onAction: () => navigateHash('#/review?tab=retest'),
          }
        : null;

  // 1080P 全屏个人状态墙路由
  if (route.page === 'wall') {
    return (
      <div className="relative min-h-screen">
        <WaveBackdrop mode="wall" pureView={pureView} />
        <Toaster
          theme="dark"
          position="bottom-right"
          duration={2600}
          toastOptions={{ className: 'glass-popover !text-[var(--ink-1)]' }}
        />
        <StatusWallView
          content={content}
          telemetry={telemetry}
          initialSubView={route.wallSub ?? 'main'}
          pureView={pureView}
          onTogglePureView={() => setPureView((v) => !v)}
          onTelemetryChange={setTelemetry}
        />
      </div>
    );
  }

  // 互动学习单元专注模式（带 Wave 深海景深 + 术语/资料抽屉）
  if (route.page === 'unit') {
    return (
      <GlossaryDrawerProvider
        content={content}
        onOpenUnit={handleOpenUnit}
        onOpenCards={() => navigateHash('#/review?tab=cards')}
      >
        <div className="study-mode-scope relative min-h-screen text-[var(--ink-1)]">
          <WaveBackdrop mode="study" />
          <a href="#main-content" className="skip-link">
            跳至主内容
          </a>
          <Toaster
            theme={theme}
            position="bottom-right"
            duration={2600}
            toastOptions={{ className: 'glass-popover !text-[var(--ink-1)]' }}
          />
          <CommandPalette
            open={cmdkOpen}
            onOpenChange={setCmdkOpen}
            content={content}
            onNavigate={navigateHash}
          />
          <div className="relative z-10">
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
        </div>
      </GlossaryDrawerProvider>
    );
  }

  return (
    <GlossaryDrawerProvider
      content={content}
      onOpenUnit={handleOpenUnit}
      onOpenCards={() => navigateHash('#/review?tab=cards')}
    >
      <div className="relative min-h-screen text-[var(--ink-1)] pb-[76px] md:pb-14">
        <WaveBackdrop mode="home" pureView={pureView} />

        <a href="#main-content" className="skip-link">
          跳至主内容
        </a>
        <Toaster
          theme={theme}
          position="bottom-right"
          duration={2600}
          toastOptions={{ className: 'glass-popover !text-[var(--ink-1)]' }}
        />
        <CommandPalette
          open={cmdkOpen}
          onOpenChange={setCmdkOpen}
          content={content}
          onNavigate={navigateHash}
        />
        <UnitPreviewDrawer
          unit={previewUnit}
          content={content}
          telemetry={telemetry}
          onClose={() => setPreviewUnit(null)}
          onOpenUnit={handleOpenUnit}
        />

        {/* 强打断 Modal：仅用于清空本地全部留痕与覆盖导入 */}
        <Modal
          open={resetModalOpen}
          onOpenChange={setResetModalOpen}
          tone="danger"
          title="确认清空全部本地学习留痕？"
          description="此操作将永久清除本机所有过关单元、刷卡记录、真实任务与月度实验数据，无法恢复。建议先导出 JSON 备份。"
          confirmLabel="确认清空"
          cancelLabel="先保留"
          onConfirm={executeReset}
        />
        <Modal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          tone="warning"
          title="导入备份将覆盖当前进度"
          description="当前浏览器已有真实学习留痕，继续导入会用下方 JSON 快照整体替换现有记录。"
          confirmLabel="确认覆盖导入"
          cancelLabel="取消"
          onConfirm={executeImport}
        />

        {/* 纯净观景悬浮退出胶囊 */}
        {pureView && (
          <div className="fixed top-4 right-4 z-50">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPureView(false)}
              className="glass-dock rounded-full px-4"
            >
              <EyeOff size={14} strokeWidth={1.6} />
              <span>退出纯净观景 (ESC)</span>
            </Button>
          </div>
        )}

        {/* 顶部清透悬浮玻璃导航 Dock */}
        <header
          className={cn(
            'sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--surface-glass)] backdrop-blur-md transition-opacity duration-300',
            pureView && 'pointer-events-none opacity-0'
          )}
        >
          <div className="mx-auto flex h-[56px] max-w-[1180px] items-center justify-between gap-2 px-3 sm:px-5 lg:gap-3 lg:px-6">
            <a
              href="#/"
              className="flex shrink-0 items-center gap-2 text-[var(--ink-1)] no-underline"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-plate)]">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#ffe2cc] to-[#5ea8ff]"
                />
              </span>
              <span className="whitespace-nowrap text-[13.5px] font-semibold tracking-[-0.01em] lg:text-[14.5px]">
                现代必备生存指南
              </span>
            </a>

            {/* 桌面悬浮液态玻璃导航胶囊 */}
            <nav
              ref={navPillRef}
              aria-label="主导航"
              className="glass-dock hidden items-center gap-0.5 rounded-full p-1 md:flex lg:gap-1"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = route.page === item.key;
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    data-sdf-pill=""
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap no-underline transition-colors lg:gap-1.5 lg:px-3.5 lg:text-[13.5px]',
                      isActive
                        ? 'text-[var(--ink-1)]'
                        : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="dock-active-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-full border border-[var(--line-strong)] bg-[var(--accent-soft)]"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1 lg:gap-1.5">
                      <Icon size={14} strokeWidth={1.6} className="hidden lg:inline" />
                      <span>{item.label}</span>
                      {item.key === 'review' && pendingRetestCount > 0 && (
                        <span className="font-mono-num rounded-full bg-[var(--warning-soft)] px-1.5 text-[11px] text-[var(--warning)]">
                          {pendingRetestCount}
                        </span>
                      )}
                    </span>
                  </a>
                );
              })}
            </nav>

            {/* 右侧工具组（全部挂载一句话 Tooltip） */}
            <div className="flex shrink-0 items-center gap-1.5">
              <Tooltip content="全局快速搜索学习单元与概念（⌘K）">
                <button
                  type="button"
                  data-testid="cmdk-trigger"
                  aria-label="全局快速搜索"
                  onClick={() => setCmdkOpen(true)}
                  className="inline-flex h-[36px] max-[480px]:h-[44px] cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-plate)] px-2.5 text-[13px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--ink-1)] lg:px-3"
                >
                  <Search size={14} strokeWidth={1.6} />
                  <span className="hidden xl:inline">搜索</span>
                  <kbd className="font-mono-num hidden rounded border border-[var(--line)] px-1.5 py-0.2 text-[11px] text-[var(--ink-3)] lg:inline">
                    ⌘K
                  </kbd>
                </button>
              </Tooltip>

              <Tooltip content="纯净观景：收起界面欣赏 Wave 星海">
                <button
                  type="button"
                  data-testid="pure-view-toggle"
                  aria-label="进入纯净观景模式"
                  onClick={() => setPureView(true)}
                  className="hidden h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-plate)] text-[var(--ink-2)] transition-colors hover:border-[var(--dawn-border)] hover:text-[var(--dawn)] lg:inline-flex"
                >
                  <Eye size={15} strokeWidth={1.6} />
                </button>
              </Tooltip>

              <Tooltip content={theme === 'dark' ? '切换晨曦冰晶浅色模式' : '切换暮海星光暗色模式'}>
                <button
                  type="button"
                  data-testid="theme-toggle"
                  aria-label={theme === 'dark' ? '切换至冰蓝宣白浅色主题' : '切换至深空炭墨暗色主题'}
                  onClick={toggleTheme}
                  className="inline-flex h-[36px] w-[36px] max-[480px]:h-[44px] max-[480px]:w-[44px] cursor-pointer items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-plate)] text-[var(--ink-2)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--ink-1)]"
                >
                  {theme === 'dark' ? (
                    <Sun size={15} strokeWidth={1.6} />
                  ) : (
                    <Moon size={15} strokeWidth={1.6} />
                  )}
                </button>
              </Tooltip>

              <Tooltip content="打开 1080P 全屏个人状态墙">
                <a
                  href="#/wall"
                  aria-label="打开 1080P 状态墙"
                  className="inline-flex h-[36px] max-[480px]:h-[44px] items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-plate)] px-2.5 text-[13px] font-medium text-[var(--ink-1)] no-underline transition-colors hover:border-[var(--accent-border)] lg:px-3"
                >
                  <Monitor size={14} strokeWidth={1.6} className="text-[var(--accent)]" />
                  <span className="hidden lg:inline">状态墙</span>
                </a>
              </Tooltip>
            </div>
          </div>
        </header>

        {/* 主工作区（纯净观景时平滑淡出，露出完整 Wave 原画） */}
        <main
          id="main-content"
          className={cn(
            'relative z-10 mx-auto max-w-[1160px] space-y-5 px-4 py-6 transition-all duration-300 sm:px-6 sm:py-8',
            pureView && 'pointer-events-none scale-[0.985] opacity-0'
          )}
        >
          {/* 顶部系统 Alert 警告条（全局同一时刻严格只显示 1 条，绝不堆叠） */}
          {activeTopAlert && (
            <AlertBanner
              tone={activeTopAlert.tone}
              title={activeTopAlert.title}
              message={activeTopAlert.message}
              onDismiss={activeTopAlert.dismissible ? activeTopAlert.onDismiss : undefined}
              action={
                activeTopAlert.actionLabel && activeTopAlert.onAction ? (
                  <Button size="sm" variant="primary" onClick={activeTopAlert.onAction}>
                    {activeTopAlert.actionLabel}
                  </Button>
                ) : undefined
              }
            />
          )}

          {route.page === 'today' && (
            <TodayView
              content={content}
              telemetry={telemetry}
              plan={plan}
              onToggleTipAck={handleToggleTipAck}
              onToggleTask={handleToggleTask}
              onPreviewUnit={handlePreviewUnit}
              onTelemetryChange={setTelemetry}
            />
          )}

          {route.page === 'branches' && (
            <BranchesView
              content={content}
              telemetry={telemetry}
              initialBranchId={route.branchId ?? 'B1'}
              onOpenUnit={handleOpenUnit}
              onPreviewUnit={handlePreviewUnit}
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
              onPreviewUnit={handlePreviewUnit}
            />
          )}

          {route.page === 'lab' && (
            <div className="space-y-6">
              <header className="space-y-1.5">
                <h1 className="sky-heading m-0 text-[24px] font-semibold tracking-[-0.02em] text-[var(--ink-1)] sm:text-[28px]">
                  生活手账
                </h1>
                <p className="sky-heading m-0 text-[14.5px] text-[var(--ink-2)]">
                  记下最近要办的小事、挑一个轻松的日常小挑战，随手收好自己的生活备忘与每周小结
                </p>
              </header>

              <div
                className="flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--line)] pb-px"
                role="tablist"
                aria-label="生活手账子视图"
              >
                {(
                  [
                    { id: 'pool', label: '生活待办' },
                    { id: 'experiment', label: '日常小挑战' },
                    { id: 'notes', label: '生活笔记' },
                    { id: 'weekly', label: '每周小结' },
                    { id: 'backup', label: '本机备份' },
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
                  onPreviewUnit={handlePreviewUnit}
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

              {labTab === 'notes' && (
                <LifeNotebookView
                  content={content}
                  telemetry={telemetry}
                  onTelemetryChange={setTelemetry}
                  onOpenUnit={handleOpenUnit}
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
                    <div className="glass-plate p-3.5">
                      <div className="text-[12px] text-[var(--ink-3)]">累计点亮天数</div>
                      <strong className="font-mono-num mt-1 block text-[22px] font-semibold text-[var(--ink-1)]">
                        {telemetry.activeDates.length} 天
                      </strong>
                    </div>
                    <div className="glass-plate p-3.5">
                      <div className="text-[12px] text-[var(--ink-3)]">AI 能力线投入</div>
                      <strong className="font-mono-num mt-1 block text-[22px] font-semibold text-[var(--ink-1)]">
                        {formatMinutes(aiDurationMs)}
                      </strong>
                    </div>
                    <div className="glass-plate p-3.5">
                      <div className="text-[12px] text-[var(--ink-3)]">软件技能线投入</div>
                      <strong className="font-mono-num mt-1 block text-[22px] font-semibold text-[var(--ink-1)]">
                        {formatMinutes(swDurationMs)}
                      </strong>
                    </div>
                    <div className="glass-plate p-3.5">
                      <div className="text-[12px] text-[var(--ink-3)]">已过关单元</div>
                      <strong className="font-mono-num mt-1 block text-[22px] font-semibold text-[var(--ink-1)]">
                        {Object.values(telemetry.unitSubmissions).filter((u) => u.isCleared).length}{' '}
                        节
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button variant="primary" onClick={handleExport}>
                      导出 JSON 备份
                    </Button>
                    <Button variant="outline" onClick={handleImportClick}>
                      导入校验 JSON
                    </Button>
                    <Button
                      variant="danger"
                      data-testid="reset-telemetry-trigger"
                      onClick={() => setResetModalOpen(true)}
                    >
                      重置本地留痕
                    </Button>
                  </div>

                  {backupPreview && (
                    <textarea
                      aria-label="JSON 备份内容"
                      className="v3-textarea font-mono-num text-[12.5px]"
                      value={backupPreview}
                      onChange={(e) => {
                        setBackupPreview(e.target.value);
                        if (backupError) setBackupError(null);
                      }}
                      rows={6}
                    />
                  )}
                </Card>
              )}
            </div>
          )}
        </main>

        {/* 手机端固定底部 5 项清透玻璃 Dock（≥44px 触控热区） */}
        <nav
          aria-label="手机主导航"
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[var(--line)] bg-[var(--surface-glass)] backdrop-blur-md transition-opacity duration-300 md:hidden',
            pureView && 'pointer-events-none opacity-0'
          )}
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
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--ink-2)]'
                )}
              >
                <Icon size={18} strokeWidth={1.6} />
                <span>{item.short}</span>
              </a>
            );
          })}
        </nav>
      </div>
    </GlossaryDrawerProvider>
  );
}
