import {
  ArrowLeft,
  ArrowRight,
  Droplets,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SkillAtlasSvg } from '@/components/SkillTreeSvg';
import { Drawer, Popconfirm, Tooltip } from '@/components/ui/overlays';
import { Button } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import {
  fetchServerSyncSnapshot,
  getLocalDateKey,
  logDailyLifeHabit,
  saveWallPersonalConfig,
} from '@/core/db';
import { isUnitCleared } from '@/core/gatekeeper';
import { computeWallViewModel } from '@/core/wallAdapter';
import { cn } from '@/lib/utils';
import type {
  GlassClarityMode,
  TelemetrySnapshot,
  WallCountdownItem,
  WallExternalSyncPayload,
} from '@/types/schema';

interface StatusWallViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  initialSubView?: 'main' | 'b1';
  pureView?: boolean;
  onTogglePureView?: () => void;
  onTelemetryChange?: (next: TelemetrySnapshot) => void;
}

const WALL_BRANCH_SHORT: Record<string, string> = {
  B1: 'AI与软件',
  B2: '财经',
  B3: '心理',
  B4: '健康',
  B5: '表达',
  B6: '精力',
  B7: '自保',
};

function getClockParts(date: Date) {
  return {
    hh: String(date.getHours()).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0'),
  };
}

function formatEditorialDate(date: Date): string {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y} · ${m} · ${d}   ${weekdays[date.getDay()]}`;
}

function formatDotDate(iso: string): string {
  return iso.replace(/-/g, '.');
}

export function StatusWallView({
  content,
  telemetry,
  initialSubView = 'main',
  pureView = false,
  onTogglePureView,
  onTelemetryChange,
}: StatusWallViewProps) {
  const [subView, setSubView] = useState<'main' | 'b1'>(initialSubView);
  const [now, setNow] = useState<Date>(() => new Date());
  const [externalSync, setExternalSync] = useState<WallExternalSyncPayload | null>(null);
  const [forcePreviewDemo, setForcePreviewDemo] = useState<boolean>(false);

  // 右侧状态墙个人配置 Drawer
  const [configOpen, setConfigOpen] = useState<boolean>(false);
  const [configTab, setConfigTab] = useState<'countdowns' | 'life' | 'display'>('countdowns');

  const todayKey = getLocalDateKey(now);
  const personal = telemetry.wallPersonal;
  const todayLife = telemetry.dailyLifeLogs?.[todayKey];
  const autoRotateSeconds = personal?.autoRotateSeconds ?? 0;
  const glassClarity: GlassClarityMode = personal?.glassClarity ?? 'clear';

  // 倒计时新增草稿
  const [newCdLabel, setNewCdLabel] = useState<string>('');
  const [newCdDate, setNewCdDate] = useState<string>('');

  // 生活打卡与吉光草稿
  const [sleepDraft, setSleepDraft] = useState<string>(
    todayLife?.sleepHours !== undefined ? String(todayLife.sleepHours) : ''
  );
  const [runDraft, setRunDraft] = useState<string>(
    todayLife?.runningKm !== undefined ? String(todayLife.runningKm) : ''
  );
  const [quoteDraft, setQuoteDraft] = useState<string>(personal?.quote ?? '');
  const [movieDraft, setMovieDraft] = useState<string>(personal?.movie ?? '');
  const [weatherDraft, setWeatherDraft] = useState<string>(personal?.weatherNote ?? '');

  useEffect(() => {
    setSubView(initialSubView);
  }, [initialSubView]);

  useEffect(() => {
    setSleepDraft(todayLife?.sleepHours !== undefined ? String(todayLife.sleepHours) : '');
    setRunDraft(todayLife?.runningKm !== undefined ? String(todayLife.runningKm) : '');
  }, [todayLife?.sleepHours, todayLife?.runningKm]);

  useEffect(() => {
    setQuoteDraft(personal?.quote ?? '');
    setMovieDraft(personal?.movie ?? '');
    setWeatherDraft(personal?.weatherNote ?? '');
  }, [personal?.quote, personal?.movie, personal?.weatherNote]);

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // 主墙 ⇄ B1 专项看板自动轮播（配置抽屉打开或纯净观景时暂停）
  useEffect(() => {
    if (!autoRotateSeconds || configOpen || pureView) return;
    const timer = setInterval(() => {
      setSubView((prev) => (prev === 'main' ? 'b1' : 'main'));
    }, autoRotateSeconds * 1000);
    return () => clearInterval(timer);
  }, [autoRotateSeconds, configOpen, pureView]);

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
    todayKey,
    forcePreviewDemo ? 'DEMO' : undefined
  );

  const currentCountdowns: WallCountdownItem[] =
    personal?.countdowns && personal.countdowns.length > 0
      ? personal.countdowns
      : content.wallConfig.countdowns;

  const handleQuickWater = async (delta: number) => {
    const next = await logDailyLifeHabit({ waterDelta: delta }, todayKey);
    onTelemetryChange?.(next);
    const cups = next.dailyLifeLogs?.[todayKey]?.waterCups ?? 0;
    const goal = next.dailyLifeLogs?.[todayKey]?.waterGoal ?? 8;
    toast.success(`已记录喝水：${cups} / ${goal} 杯`);
  };

  const handleAddCountdown = async () => {
    if (!newCdLabel.trim() || !newCdDate) return;
    const baseList = personal?.countdowns ? [...personal.countdowns] : [];
    const nextList: WallCountdownItem[] = [
      ...baseList,
      {
        id: `cd_${Date.now()}`,
        label: newCdLabel.trim(),
        targetDate: newCdDate,
        isSample: false,
      },
    ];
    const next = await saveWallPersonalConfig({ countdowns: nextList });
    onTelemetryChange?.(next);
    setNewCdLabel('');
    setNewCdDate('');
    toast.success('已添加倒计时节点');
  };

  const handleRemoveCountdown = async (id: string) => {
    const nextList = currentCountdowns.filter((c) => c.id !== id);
    const next = await saveWallPersonalConfig({ countdowns: nextList });
    onTelemetryChange?.(next);
    toast('已移除倒计时节点');
  };

  const handleSaveLifeAndContent = async () => {
    const sleepNum = sleepDraft.trim() === '' ? null : Number(sleepDraft);
    const runNum = runDraft.trim() === '' ? null : Number(runDraft);
    await logDailyLifeHabit(
      {
        sleepHours: sleepNum !== null && !Number.isNaN(sleepNum) ? sleepNum : null,
        runningKm: runNum !== null && !Number.isNaN(runNum) ? runNum : null,
      },
      todayKey
    );
    const next = await saveWallPersonalConfig({
      quote: quoteDraft.trim() || undefined,
      movie: movieDraft.trim() || undefined,
      weatherNote: weatherDraft.trim() || undefined,
    });
    onTelemetryChange?.(next);
    toast.success('已更新书桌打卡与每日金句');
  };

  const handleSetRotate = async (secs: 0 | 30 | 60) => {
    const next = await saveWallPersonalConfig({ autoRotateSeconds: secs });
    onTelemetryChange?.(next);
    toast(secs === 0 ? '已关闭自动轮播' : `已开启每 ${secs} 秒自动轮播`);
  };

  const handleSetClarity = async (mode: GlassClarityMode) => {
    const next = await saveWallPersonalConfig({ glassClarity: mode });
    onTelemetryChange?.(next);
    toast(`浮岛通透度已切至：${mode === 'clear' ? '极透' : mode === 'regular' ? '柔雾' : '深读'}`);
  };

  const rawDualMinutes = vm.b1Kanban.aiLineMinutes + vm.b1Kanban.softwareLineMinutes;
  const aiRatioPercent =
    rawDualMinutes > 0 ? Math.round((vm.b1Kanban.aiLineMinutes / rawDualMinutes) * 100) : 0;
  const swRatioPercent = rawDualMinutes > 0 ? 100 - aiRatioPercent : 0;

  const b1Branch = content.catalog.branches.find((b) => b.id === 'B1');
  const swPacks = (b1Branch?.tracks ?? []).filter((t) => t.kind === 'software_pack');

  const clock = getClockParts(now);
  const primaryCountdown = vm.countdowns[0];
  const secondaryCountdowns = vm.countdowns.slice(1, 3);
  const waterGoal = Math.max(1, vm.lifeBlock.waterGoalToday || 8);
  const waterFilled = Math.min(waterGoal, Math.max(0, vm.lifeBlock.waterCupsToday));

  const configDrawer = (
    <Drawer
      open={configOpen}
      onOpenChange={setConfigOpen}
      title="书桌常亮墙配置"
      description="倒计时、喝水睡眠与金句仅保存于本机浏览器，实时与主页联动"
      widthClassName="w-[min(480px,94vw)]"
    >
      <div className="space-y-4">
        <div className="glass-plate grid grid-cols-3 gap-1 p-1" role="tablist">
          {(
            [
              { id: 'countdowns', label: '重要日子' },
              { id: 'life', label: '打卡与金句' },
              { id: 'display', label: '通透与轮播' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={configTab === t.id}
              onClick={() => setConfigTab(t.id)}
              className={cn(
                'min-h-[34px] cursor-pointer rounded-[8px] text-[13px] font-medium transition-colors',
                configTab === t.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {configTab === 'countdowns' && (
          <div className="space-y-4">
            <div className="glass-plate space-y-2.5 p-4">
              <div className="text-[13px] font-semibold text-[var(--ink-1)]">新增倒计时</div>
              <input
                type="text"
                className="v3-input text-[14px]"
                placeholder="如：大创中期答辩 / 期末考试 / 出行"
                value={newCdLabel}
                onChange={(e) => setNewCdLabel(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="v3-input font-mono-num flex-1 text-[13.5px]"
                  value={newCdDate}
                  onChange={(e) => setNewCdDate(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!newCdLabel.trim() || !newCdDate}
                  onClick={handleAddCountdown}
                >
                  <Plus size={14} strokeWidth={1.7} />
                  <span>添加</span>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[12.5px] text-[var(--ink-3)]">
                主画布右侧固定展示最近 3 项，第一项自动高亮
              </div>
              {currentCountdowns.map((cd) => (
                <div
                  key={cd.id}
                  className="glass-plate flex items-center justify-between gap-2 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-[var(--ink-1)]">
                      {cd.label}
                    </div>
                    <div className="font-mono-num text-[12px] text-[var(--ink-3)]">
                      {cd.targetDate}
                    </div>
                  </div>
                  <Popconfirm
                    title={`删除「${cd.label}」？`}
                    confirmLabel="删除"
                    tone="danger"
                    onConfirm={() => handleRemoveCountdown(cd.id)}
                  >
                    <Button size="sm" variant="danger" aria-label={`删除倒计时：${cd.label}`}>
                      <Trash2 size={13} strokeWidth={1.6} />
                    </Button>
                  </Popconfirm>
                </div>
              ))}
            </div>
          </div>
        )}

        {configTab === 'life' && (
          <div className="space-y-4">
            <div className="glass-plate space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                  今日饮水：{vm.lifeBlock.waterCupsToday} / {vm.lifeBlock.waterGoalToday} 杯
                </span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="subtle" onClick={() => handleQuickWater(-1)}>
                    -1
                  </Button>
                  <Button size="sm" variant="growth" onClick={() => handleQuickWater(1)}>
                    +1 杯
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="space-y-1 text-[12px] text-[var(--ink-2)]">
                  <span>昨夜睡眠（小时）</span>
                  <input
                    type="number"
                    step="0.5"
                    className="v3-input font-mono-num text-[13.5px]"
                    placeholder="如 7.5"
                    value={sleepDraft}
                    onChange={(e) => setSleepDraft(e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-[12px] text-[var(--ink-2)]">
                  <span>今日运动（km）</span>
                  <input
                    type="number"
                    step="0.5"
                    className="v3-input font-mono-num text-[13.5px]"
                    placeholder="如 5.0"
                    value={runDraft}
                    onChange={(e) => setRunDraft(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="glass-plate space-y-3 p-4">
              <label className="block space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>今日天气 / 城市简标</span>
                <input
                  type="text"
                  className="v3-input text-[13.5px]"
                  placeholder="如：晴 · 21°C · 书桌"
                  value={weatherDraft}
                  onChange={(e) => setWeatherDraft(e.target.value)}
                />
              </label>
              <label className="block space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>大时钟下方金句</span>
                <textarea
                  rows={2}
                  className="v3-textarea text-[13.5px]"
                  placeholder="写一句想浮在星空下提醒自己的话…"
                  value={quoteDraft}
                  onChange={(e) => setQuoteDraft(e.target.value)}
                />
              </label>
              <label className="block space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>近期想看的电影 / 书单</span>
                <input
                  type="text"
                  className="v3-input text-[13.5px]"
                  placeholder="如：《白日梦想家》· 周末待看"
                  value={movieDraft}
                  onChange={(e) => setMovieDraft(e.target.value)}
                />
              </label>
              <div className="flex justify-end">
                <Button size="sm" variant="primary" onClick={handleSaveLifeAndContent}>
                  保存更新
                </Button>
              </div>
            </div>
          </div>
        )}

        {configTab === 'display' && (
          <div className="space-y-4">
            <div className="glass-plate space-y-2.5 p-4">
              <div className="text-[13px] font-semibold text-[var(--ink-1)]">
                底部浮岛通透度
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { v: 'clear', label: '极透' },
                    { v: 'regular', label: '柔雾' },
                    { v: 'frosted', label: '深读' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.v}
                    type="button"
                    onClick={() => handleSetClarity(item.v)}
                    className={cn(
                      'min-h-[38px] cursor-pointer rounded-[10px] border text-[13px] font-medium transition-colors',
                      glassClarity === item.v
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                        : 'border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--line-strong)]'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-plate space-y-2.5 p-4">
              <div className="text-[13px] font-semibold text-[var(--ink-1)]">
                画报主墙 ⇄ B1 专项看板自动轮播
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { v: 0, label: '关闭轮播' },
                    { v: 30, label: '每 30 秒' },
                    { v: 60, label: '每 60 秒' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.v}
                    type="button"
                    onClick={() => handleSetRotate(item.v)}
                    className={cn(
                      'min-h-[38px] cursor-pointer rounded-[10px] border text-[13px] font-medium transition-colors',
                      autoRotateSeconds === item.v
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                        : 'border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--line-strong)]'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-plate flex items-center justify-between gap-3 p-4">
              <div className="text-[12.5px] text-[var(--ink-2)]">
                数据演示切换（用于查看满进度星盘效果）
              </div>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setForcePreviewDemo((v) => !v)}
              >
                {forcePreviewDemo ? '恢复实况' : '预览演示数据'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );

  // ============================================================================
  // 二级切换子视图：B1 AI 与软件专项数字看板（同步极简细线玻璃语言）
  // ============================================================================
  if (subView === 'b1') {
    return (
      <div className="wall-viewport" aria-label="1080P B1 AI与软件专项数字看板（二级视图）">
        {configDrawer}
        <div className="wall-b1-subview">
          <header className="wall-b1-topbar">
            <div className="wall-b1-topbar-group">
              <button type="button" className="wall-btn" onClick={() => setSubView('main')}>
                <ArrowLeft size={14} strokeWidth={1.6} />
                <span>返回画报主墙</span>
              </button>
              <h1 className="wall-panel-title">
                <span className="wall-dot" />
                B1 · AI 与软件专项数字看板
              </h1>
            </div>
            <div className="wall-b1-topbar-group">
              {autoRotateSeconds > 0 && (
                <span className="wall-tag">
                  <RefreshCw size={11} strokeWidth={1.7} />
                  {autoRotateSeconds}s 轮播中
                </span>
              )}
              <span
                className={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}
              >
                {vm.dataMode === 'LIVE' ? 'LIVE 实况' : 'DEMO 预览'}
              </span>
              <span className="wall-tag font-mono-num">
                {clock.hh}:{clock.mm}:{clock.ss}
              </span>
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
              <div className="wall-kpi-foot">全部 5 层已开放自由精读</div>
            </div>

            <div className="wall-panel wall-kpi-card">
              <div className="wall-kpi-sub">当前焦点层级</div>
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
              <div className="wall-kpi-sub">今日小事完成度</div>
              <div className="wall-kpi-hero" style={{ color: 'var(--wall-green)' }}>
                {vm.learning.todayDone}/{vm.learning.todayTotal}
              </div>
              <div className="wall-kpi-foot">完成率 {vm.learning.todayPercent}% · 做完即停</div>
            </div>
          </div>

          <section className="wall-panel wall-b1-layers">
            <div className="wall-panel-head">
              <h2 className="wall-panel-title">AI 能力线 L1–L5 掌握度与产出矩阵</h2>
              <span className="wall-tag">按阅读与练习留痕聚合</span>
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
                        backgroundColor: layer.isCleared ? '#5eead4' : '#5ea8ff',
                      }}
                    />
                  </div>
                  <span className={`wall-tag ${layer.isCleared ? 'wall-tag-live' : ''}`}>
                    {layer.isCleared ? '已完成' : '开放精读'}
                  </span>
                </div>
              ))}
            </div>
          </section>

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
                    style={{ width: `${Math.max(6, aiRatioPercent)}%`, backgroundColor: '#5ea8ff' }}
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
                    style={{ width: `${Math.max(6, swRatioPercent)}%`, backgroundColor: '#5eead4' }}
                  />
                </div>
              </div>
            </div>

            <div className="wall-sw-packs-strip">
              <div className="wall-kpi-sub" style={{ marginBottom: '8px' }}>
                软件技能分包（即查即用）
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
                        {`${cleared}/${total} 篇`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="wall-weakness-box">
              <div className="wall-kpi-sub">待温习概念 TOP 5</div>
              <div className="wall-weakness-items">
                {vm.learning.weaknessTop5.length === 0 ? (
                  <span className="wall-kpi-sub">当前无积压温习项</span>
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
  // 默认主视图：留白画报 × 悬浮液态玻璃（Apple StandBy / 桌面艺术挂钟风）
  // - 中央与中上方星海原画大片呼吸，零沉重盒中盒墙面
  // - 140px 超细艺术时钟 + 衬线体每日金句无框浮于深空之上
  // - 右上轻浮倒计时焦点 + 底部 3 座极透液态玻璃浮岛
  // ============================================================================
  return (
    <div
      className="wall-viewport wall-editorial-viewport"
      aria-label="1080P 个人常亮画报状态墙"
    >
      {configDrawer}

      {/* 极轻局部渐暗光晕：仅柔和托起左上时钟与底部浮岛，中央地平线与人物 100% 透亮呼吸 */}
      <div className="wall-editorial-vignette" aria-hidden="true" />

      {pureView && onTogglePureView && (
        <div className="fixed top-5 right-6 z-50">
          <button type="button" className="wall-whisper-btn" onClick={onTogglePureView}>
            <EyeOff size={14} strokeWidth={1.6} />
            <span>退出纯净观景 (ESC)</span>
          </button>
        </div>
      )}

      <div
        className="wall-editorial-canvas"
        style={{
          opacity: pureView ? 0 : 1,
          pointerEvents: pureView ? 'none' : 'auto',
          transition: 'opacity 320ms ease',
        }}
      >
        {/* 1. 顶部无框微光信息条（零厚重顶栏，极轻悬浮） */}
        <header className="wall-ambient-rail" aria-label="状态墙顶部环境与控制">
          <div className="wall-ambient-left">
            <span
              className={cn(
                'wall-status-pulse',
                vm.dataMode === 'LIVE' ? 'is-live' : 'is-demo'
              )}
              aria-hidden="true"
            />
            <span className="wall-ambient-date font-mono-num">{formatEditorialDate(now)}</span>
            <span className="wall-ambient-sep" aria-hidden="true">
              /
            </span>
            <span className="wall-ambient-weather">{vm.weather}</span>
            {vm.lifeBlock.todayMood && (
              <span className="wall-mood-whisper">
                {vm.lifeBlock.todayMood === 'relaxed'
                  ? '今日状态 · 松弛'
                  : vm.lifeBlock.todayMood === 'focused'
                    ? '今日状态 · 充实'
                    : '今日状态 · 慢一点'}
              </span>
            )}
          </div>

          <div className="wall-ambient-right">
            <span
              className={cn(
                'wall-mode-pill',
                vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'
              )}
            >
              {vm.dataMode === 'LIVE' ? 'LIVE' : 'DEMO'}
            </span>
            {autoRotateSeconds > 0 && (
              <span className="wall-mode-pill">
                <RefreshCw size={11} strokeWidth={1.6} />
                {autoRotateSeconds}s
              </span>
            )}
            <Tooltip content="切换查看 B1 AI 与软件专项看板" side="bottom">
              <button
                type="button"
                className="wall-whisper-btn"
                onClick={() => setSubView('b1')}
              >
                <span>B1 专项</span>
                <ArrowRight size={13} strokeWidth={1.6} />
              </button>
            </Tooltip>
            <Tooltip content="自定义重要日子、喝水睡眠、金句与通透度" side="bottom">
              <button
                type="button"
                className="wall-whisper-btn"
                data-testid="wall-config-drawer-trigger"
                onClick={() => setConfigOpen(true)}
              >
                <SlidersHorizontal size={13} strokeWidth={1.6} />
                <span>配置</span>
              </button>
            </Tooltip>
            {onTogglePureView && (
              <Tooltip content="隐去全部文字，静静欣赏星海画面" side="bottom">
                <button type="button" className="wall-whisper-btn" onClick={onTogglePureView}>
                  <Eye size={13} strokeWidth={1.6} />
                  <span>观景</span>
                </button>
              </Tooltip>
            )}
            <a href="#/" className="wall-whisper-btn no-underline">
              <ArrowLeft size={13} strokeWidth={1.6} />
              <span>返回站内</span>
            </a>
          </div>
        </header>

        {/* 2. 中上开放留白画报舞台：中央星海与人物完全敞开，左右轻浮无框排版 */}
        <section className="wall-hero-stage" aria-label="主视觉时钟与每日金句">
          {/* 左上无框巨幅艺术时钟 + 衬线体每日金句 */}
          <div className="wall-hero-editorial">
            <div className="wall-clock" aria-label={`当前时间 ${clock.hh}:${clock.mm}:${clock.ss}`}>
              <span className="wall-clock-digits">{clock.hh}</span>
              <span className="wall-clock-colon" aria-hidden="true">
                :
              </span>
              <span className="wall-clock-digits">{clock.mm}</span>
              <span className="wall-clock-sec">{clock.ss}</span>
            </div>

            <div className="wall-hero-hairline" aria-hidden="true" />

            <blockquote className="wall-serif-quote">「{vm.contentBlock.quote}」</blockquote>

            <div className="wall-quote-meta">
              <span>{vm.contentBlock.quoteSource}</span>
              {vm.contentBlock.movie && (
                <>
                  <span className="wall-meta-dot" aria-hidden="true">
                    ·
                  </span>
                  <span>片单 {vm.contentBlock.movie}</span>
                </>
              )}
            </div>
          </div>

          {/* 右上无框倒计时焦点（避开画面中央地平线人物） */}
          {primaryCountdown && (
            <aside className="wall-hero-countdown" aria-label="重要日子倒计时">
              <div className="wall-cd-hero-eyebrow">
                <span className="wall-cd-eyebrow-dot" aria-hidden="true" />
                <span>{personal?.countdowns?.length ? '我的倒数日' : '重要日子'}</span>
              </div>

              <div className="wall-cd-hero-main">
                <div className="wall-cd-hero-info">
                  <div className="wall-cd-hero-title">{primaryCountdown.label}</div>
                  <div className="wall-cd-hero-date font-mono-num">
                    {formatDotDate(primaryCountdown.targetDate)}
                  </div>
                </div>
                <div
                  className={cn(
                    'wall-cd-hero-num',
                    primaryCountdown.isUrgent && 'is-urgent'
                  )}
                >
                  <span>{primaryCountdown.daysLeft}</span>
                  <small>天</small>
                </div>
              </div>

              <div className="wall-cd-thread" aria-hidden="true">
                <div
                  className="wall-cd-thread-fill"
                  style={{
                    width: `${Math.max(
                      12,
                      Math.min(100, Math.round(100 - Math.min(primaryCountdown.daysLeft, 365) / 3.65))
                    )}%`,
                    background: primaryCountdown.isUrgent
                      ? 'linear-gradient(90deg, rgba(251,133,133,0.4), #fb8585)'
                      : 'linear-gradient(90deg, rgba(245,184,154,0.32), #f5b89a)',
                  }}
                />
              </div>

              {secondaryCountdowns.length > 0 && (
                <div className="wall-cd-secondary-list">
                  {secondaryCountdowns.map((cd) => (
                    <div className="wall-cd-secondary-row" key={cd.id}>
                      <span className="wall-cd-sec-label">{cd.label}</span>
                      <span className="wall-cd-sec-days font-mono-num">
                        <strong>{cd.daysLeft}</strong> 天
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
        </section>

        {/* 3. 底部三座极透悬浮液态玻璃岛（无盒中盒嵌套，仅极细折射高光边） */}
        <section className="wall-dock-islands" aria-label="书桌生活与成长浮岛">
          {/* 浮岛 A：今日节奏与每日一招 */}
          <article className="wall-island wall-island-today" aria-label="今日节奏">
            <div className="wall-island-head">
              <div className="wall-island-title">
                <span className="wall-dot" style={{ background: 'var(--wall-amber)' }} />
                <span>今日节奏</span>
              </div>
              <span className="wall-island-stat font-mono-num">
                {vm.learning.todayDone} / {vm.learning.todayTotal}
              </span>
            </div>

            <ul className="wall-clean-todo-list">
              {vm.todos.slice(0, 3).map((item, idx) => (
                <li className="wall-clean-todo-row" key={idx}>
                  <span className="wall-clean-bullet" aria-hidden="true" />
                  <span className="wall-clean-todo-text">{item}</span>
                </li>
              ))}
            </ul>

            <div className="wall-island-whisper-foot">
              <Sparkles size={12} strokeWidth={1.8} className="shrink-0 text-[var(--wall-amber)]" />
              <span className="truncate">每日一招 · {vm.learning.dailyTipTitle}</span>
            </div>
          </article>

          {/* 浮岛 B：身体照顾与可视化饮水打卡 */}
          <article className="wall-island wall-island-body" aria-label="身体照顾与饮水">
            <div className="wall-island-head">
              <div className="wall-island-title">
                <Droplets size={14} strokeWidth={1.7} className="text-[var(--wall-green)]" />
                <span>身体照顾</span>
              </div>
              <div className="wall-island-actions">
                <span
                  data-testid="wall-life-source-tag"
                  className={cn(
                    'wall-island-badge',
                    vm.lifeBlock.sourceLabel === '个人打卡' && 'is-active'
                  )}
                >
                  {vm.lifeBlock.sourceLabel}
                </span>
                <Tooltip content="顺手记一杯水，实时同步主页与周报" side="top">
                  <button
                    type="button"
                    data-testid="wall-water-plus-btn"
                    className="wall-water-plus-btn"
                    onClick={() => handleQuickWater(1)}
                  >
                    +1 杯
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* 可视化 8 格水位条 */}
            <div className="wall-hydration-block">
              <div className="wall-hydration-row">
                <span className="wall-micro-eyebrow">今日饮水</span>
                <strong className="wall-hydration-num font-mono-num" data-testid="wall-water-val">
                  {vm.lifeBlock.water}
                </strong>
              </div>
              <div className="wall-water-capsules" aria-hidden="true">
                {Array.from({ length: waterGoal }).map((_, idx) => (
                  <span
                    key={idx}
                    className={cn('wall-water-capsule', idx < waterFilled && 'is-filled')}
                  />
                ))}
              </div>
            </div>

            {/* 睡眠 & 运动无框双列排版（零内部黑盒） */}
            <div className="wall-body-metrics-pair">
              <div className="wall-body-metric">
                <span className="wall-micro-eyebrow">睡眠照顾</span>
                <div className="wall-body-metric-val font-mono-num">{vm.lifeBlock.sleepMetric}</div>
                <span className="wall-body-metric-sub">{vm.lifeBlock.sleepCaption}</span>
              </div>
              <div className="wall-body-metric-divider" aria-hidden="true" />
              <div className="wall-body-metric">
                <span className="wall-micro-eyebrow">本周运动</span>
                <div className="wall-body-metric-val font-mono-num">
                  {vm.lifeBlock.runningMetric}
                </div>
                <span className="wall-body-metric-sub">{vm.lifeBlock.runningCaption}</span>
              </div>
            </div>
          </article>

          {/* 浮岛 C：星盘微览与 7 域丝线进度 */}
          <article className="wall-island wall-island-growth" aria-label="成长与技能微览">
            <div className="wall-island-head">
              <div className="wall-island-title">
                <span className="wall-dot" />
                <span>成长微星盘</span>
              </div>
              <span className="wall-island-stat font-mono-num">
                {vm.learning.activeDaysTotal} 天足迹 · 连 {vm.learning.consecutiveDays} 天
              </span>
            </div>

            <div className="wall-growth-split">
              <div className="wall-atlas-floating">
                <SkillAtlasSvg
                  content={content}
                  telemetry={telemetry}
                  variant="wall"
                  demoFallback={vm.dataMode === 'DEMO'}
                />
              </div>

              <div className="wall-spark-list">
                {vm.learning.branchProgress.map((bp) => (
                  <div className="wall-spark-row" key={bp.id}>
                    <span className="wall-spark-name">
                      {WALL_BRANCH_SHORT[bp.id] ?? bp.name.slice(0, 3)}
                    </span>
                    <div className="wall-spark-track">
                      <div
                        className="wall-spark-fill"
                        style={{
                          width: `${Math.max(4, bp.percent)}%`,
                          backgroundColor: bp.accentToken,
                        }}
                      />
                    </div>
                    <span className="wall-spark-pct font-mono-num">{bp.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
