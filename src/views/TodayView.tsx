import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Droplets,
  Layers,
  Lightbulb,
  Shuffle,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RichText } from '@/components/RichText';
import { Drawer, Tooltip } from '@/components/ui/overlays';
import { Badge, Button, ProgressBar } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import {
  DEFAULT_SCHEDULE_PREFS,
  logDailyLifeHabit,
  saveWallPersonalConfig,
  swapDailyPlanTask,
  updateSchedulePrefs,
} from '@/core/db';
import {
  computeContinuityFootprint,
  detectCurrentEnergyBand,
  getEnergySlotsWithPrefs,
  pickAlternativeUnitTask,
} from '@/core/scheduler';
import { getRetestQueue } from '@/core/srs';
import { cn } from '@/lib/utils';
import type {
  BranchCatalog,
  BranchId,
  DailyPlanSnapshot,
  EnergyBand,
  GlassClarityMode,
  ScheduledTaskItem,
  TelemetrySnapshot,
} from '@/types/schema';

interface TodayViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  plan: DailyPlanSnapshot;
  onToggleTipAck: (ack: boolean) => void;
  onToggleTask: (task: ScheduledTaskItem) => void;
  onPreviewUnit: (unitId: string) => void;
  onTelemetryChange: (next: TelemetrySnapshot) => void;
}

const BAND_SHORT: Record<EnergyBand, string> = {
  fragment: '早间',
  peak: '高精力',
  low: '睡前',
};

const CLARITY_OPTIONS: Array<{ value: GlassClarityMode; label: string; desc: string }> = [
  { value: 'clear', label: '清透', desc: '星海通透感最高' },
  { value: 'regular', label: '标准', desc: '亮度与清晰均衡' },
  { value: 'frosted', label: '深读', desc: '长文护眼高对比' },
];

function formatReadableDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${m} 月 ${d} 日 · ${weekdays[dt.getDay()]}`;
}

function getBranchMeta(branches: BranchCatalog[], id: string) {
  return (
    branches.find((b) => b.id === id) ?? {
      id: 'B1',
      name: id,
      accentToken: '#4c9aff',
    }
  );
}

export function TodayView({
  content,
  telemetry,
  plan,
  onToggleTipAck,
  onToggleTask,
  onPreviewUnit,
  onTelemetryChange,
}: TodayViewProps) {
  const prefs = telemetry.schedulePrefs ?? DEFAULT_SCHEDULE_PREFS;
  const energySlots = getEnergySlotsWithPrefs(prefs);
  const currentBand = detectCurrentEnergyBand(new Date(), prefs);

  const [selectedBand, setSelectedBand] = useState<EnergyBand>(currentBand);
  const [rhythmDrawerOpen, setRhythmDrawerOpen] = useState(false);
  const [tipDrawerOpen, setTipDrawerOpen] = useState(false);

  // 节律偏好 Drawer 表单态
  const [fragHour, setFragHour] = useState<number>(prefs.fragmentStartHour);
  const [peakHour, setPeakHour] = useState<number>(prefs.peakStartHour);
  const [lowHour, setLowHour] = useState<number>(prefs.lowStartHour);
  const [prefBranch, setPrefBranch] = useState<BranchId | 'ALL'>(prefs.preferredBranchId ?? 'ALL');

  const todayLife = telemetry.dailyLifeLogs?.[plan.dateKey];
  const [sleepInput, setSleepInput] = useState<string>(
    todayLife?.sleepHours !== undefined ? String(todayLife.sleepHours) : ''
  );
  const [runInput, setRunInput] = useState<string>(
    todayLife?.runningKm !== undefined ? String(todayLife.runningKm) : ''
  );

  useEffect(() => {
    setFragHour(prefs.fragmentStartHour);
    setPeakHour(prefs.peakStartHour);
    setLowHour(prefs.lowStartHour);
    setPrefBranch(prefs.preferredBranchId ?? 'ALL');
  }, [prefs.fragmentStartHour, prefs.peakStartHour, prefs.lowStartHour, prefs.preferredBranchId]);

  useEffect(() => {
    setSleepInput(todayLife?.sleepHours !== undefined ? String(todayLife.sleepHours) : '');
    setRunInput(todayLife?.runningKm !== undefined ? String(todayLife.runningKm) : '');
  }, [todayLife?.sleepHours, todayLife?.runningKm]);

  const allTasks = plan.tasks;
  const completedCount = allTasks.filter((t) => plan.completedTaskIds.includes(t.id)).length;
  const totalCount = allTasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllDone = totalCount > 0 && completedCount >= totalCount;

  const continuity = computeContinuityFootprint(telemetry.activeDates, plan.dateKey);
  let consecutiveDays = 0;
  for (let i = continuity.recent14Days.length - 1; i >= 0; i -= 1) {
    if (continuity.recent14Days[i].isActive) consecutiveDays += 1;
    else break;
  }
  const retestQueue = getRetestQueue(content.knowledgeGraph, content.units, telemetry);
  const dailyTip =
    content.dailyTips.find((t) => t.id === plan.dailyTipId) ?? content.dailyTips[0];
  const tipBranch = getBranchMeta(content.catalog.branches, dailyTip.branchId);

  const selectedSlotMeta =
    energySlots.find((s) => s.band === selectedBand) ?? energySlots[1];
  const selectedSlotTasks = allTasks.filter((t) => t.slot === selectedBand);

  const focalTask: ScheduledTaskItem | undefined =
    selectedSlotTasks.find((t) => Boolean(t.unitId) && !plan.completedTaskIds.includes(t.id)) ??
    selectedSlotTasks.find((t) => !plan.completedTaskIds.includes(t.id)) ??
    allTasks.find((t) => Boolean(t.unitId) && !plan.completedTaskIds.includes(t.id)) ??
    allTasks.find((t) => !plan.completedTaskIds.includes(t.id)) ??
    selectedSlotTasks[0] ??
    allTasks[0];

  const focalBranch = focalTask
    ? getBranchMeta(content.catalog.branches, focalTask.branchId)
    : undefined;
  const focalDone = focalTask ? plan.completedTaskIds.includes(focalTask.id) : false;
  const focalHref = focalTask
    ? focalTask.unitId
      ? `#/unit/${encodeURIComponent(focalTask.unitId)}`
      : focalTask.kind === 'retest_review'
        ? '#/review?tab=retest'
        : '#/review?tab=cards'
    : '#/branches';

  const currentClarity: GlassClarityMode = telemetry.wallPersonal?.glassClarity ?? 'clear';

  const handleSwapFocalTask = async () => {
    if (!focalTask || !focalTask.unitId) return;
    const alt = pickAlternativeUnitTask(content, telemetry, focalTask, plan.dateKey, prefBranch);
    if (!alt) {
      toast('当前偏好分支暂无更多可替换单元');
      return;
    }
    const next = await swapDailyPlanTask(focalTask.id, alt);
    onTelemetryChange(next);
    toast.success(`已切换今日学习题：${alt.branchId} · ${alt.title.slice(0, 18)}`);
  };

  const handleSaveRhythmPrefs = async () => {
    const next = await updateSchedulePrefs({
      fragmentStartHour: fragHour,
      peakStartHour: peakHour,
      lowStartHour: lowHour,
      preferredBranchId: prefBranch,
    });
    onTelemetryChange(next);
    const updatedBand = detectCurrentEnergyBand(new Date(), next.schedulePrefs);
    setSelectedBand(updatedBand);
    toast.success('已保存个人作息节律与偏好分支');
  };

  const handleQuickWater = async (delta: number) => {
    const next = await logDailyLifeHabit({ waterDelta: delta }, plan.dateKey);
    onTelemetryChange(next);
    const cups = next.dailyLifeLogs?.[plan.dateKey]?.waterCups ?? 0;
    toast(`今日饮水：${cups} / ${todayLife?.waterGoal ?? 8} 杯`);
  };

  const handleSaveLifeInputs = async () => {
    const sleepNum = sleepInput.trim() === '' ? null : Number(sleepInput);
    const runNum = runInput.trim() === '' ? null : Number(runInput);
    const next = await logDailyLifeHabit(
      {
        sleepHours: sleepNum !== null && !Number.isNaN(sleepNum) ? sleepNum : null,
        runningKm: runNum !== null && !Number.isNaN(runNum) ? runNum : null,
      },
      plan.dateKey
    );
    onTelemetryChange(next);
    toast.success('已同步今日生活打卡至状态墙与周报');
  };

  const handleSetClarity = async (mode: GlassClarityMode) => {
    const next = await saveWallPersonalConfig({ glassClarity: mode });
    onTelemetryChange(next);
    toast(`玻璃通透度已切至：${CLARITY_OPTIONS.find((c) => c.value === mode)?.label}`);
  };

  return (
    <div className="flex flex-col justify-between gap-7 py-2 sm:py-5 lg:min-h-[calc(100vh-132px)] lg:gap-10">
      {/* 右侧 Drawer 1：每日生活一招详情（不把首页撑成大卡片） */}
      <Drawer
        open={tipDrawerOpen}
        onOpenChange={setTipDrawerOpen}
        title={dailyTip.title}
        description={`${dailyTip.branchId} ${tipBranch.name} · 约 ${dailyTip.readSeconds} 秒阅读`}
        footer={
          <Button
            size="sm"
            variant={plan.tipAcknowledged ? 'outline' : 'primary'}
            onClick={() => {
              onToggleTipAck(!plan.tipAcknowledged);
              if (!plan.tipAcknowledged) setTipDrawerOpen(false);
            }}
          >
            {plan.tipAcknowledged ? '取消已读标记' : '记下了'}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="glass-plate p-4 text-[15px] leading-[1.75] text-[var(--ink-1)]">
            <RichText text={dailyTip.tipBody} />
          </div>
          {dailyTip.actionHint && (
            <div className="glass-plate space-y-1 p-4 text-[14px] leading-[1.65] text-[var(--ink-2)]">
              <div className="text-[12px] font-semibold text-[var(--dawn)]">顺手一试</div>
              <p className="m-0">{dailyTip.actionHint}</p>
            </div>
          )}
          <div className="font-mono-num text-[12px] text-[var(--ink-3)]">
            来源：{dailyTip.sourceOrg} · {dailyTip.fetchedAt}
          </div>
        </div>
      </Drawer>

      {/* 右侧 Drawer 2：个人节律、14 日点亮足迹、生活轻打卡与玻璃通透度 */}
      <Drawer
        open={rhythmDrawerOpen}
        onOpenChange={setRhythmDrawerOpen}
        title="节律偏好与今日打卡"
        description="自定义三时段作息与偏好分支，所有记录本地保存并联动 1080P 状态墙"
        footer={
          <Button size="sm" variant="primary" onClick={handleSaveRhythmPrefs}>
            保存作息与偏好
          </Button>
        }
      >
        <div className="space-y-5">
          {/* 14 日点亮矩阵 */}
          <section className="glass-plate space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                近 14 天成长足迹（累计 {continuity.totalActiveDays} 天）
              </span>
              <Badge tone="neutral">连学 {consecutiveDays} 天</Badge>
            </div>
            <div className="grid grid-cols-7 gap-1.5" aria-label="近 14 天活跃足迹">
              {continuity.recent14Days.map((day) => (
                <Tooltip
                  key={day.dateKey}
                  content={`${day.dateKey}${day.isActive ? ' · 已留痕' : ' · 休息'}`}
                  side="top"
                  className="w-full"
                >
                  <span
                    tabIndex={0}
                    className={cn(
                      'block h-6 w-full rounded-[6px] border',
                      day.isActive
                        ? 'border-[var(--growth-border)] bg-[var(--growth)]'
                        : 'border-[var(--line)] bg-[var(--surface-raised)]',
                      day.isToday && 'ring-2 ring-[var(--dawn)]'
                    )}
                  />
                </Tooltip>
              ))}
            </div>
            <div className="text-[12px] text-[var(--ink-3)]">正向累积，断更不清零、不掉级</div>
          </section>

          {/* 三时段作息 */}
          <section className="glass-plate space-y-3 p-4">
            <div className="text-[13px] font-semibold text-[var(--ink-1)]">三时段作息起止</div>
            <div className="grid grid-cols-3 gap-2.5">
              <label className="space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>早间起</span>
                <select
                  className="v3-select font-mono-num text-[13px]"
                  value={fragHour}
                  onChange={(e) => setFragHour(Number(e.target.value))}
                >
                  {[5, 6, 7, 8, 9, 10].map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>高精力起</span>
                <select
                  className="v3-select font-mono-num text-[13px]"
                  value={peakHour}
                  onChange={(e) => setPeakHour(Number(e.target.value))}
                >
                  {[13, 14, 15, 16, 17, 18, 19, 20].map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>睡前起</span>
                <select
                  className="v3-select font-mono-num text-[13px]"
                  value={lowHour}
                  onChange={(e) => setLowHour(Number(e.target.value))}
                >
                  {[20, 21, 22, 23].map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1 text-[12px] text-[var(--ink-2)]">
              <span>「换一题」优先分支</span>
              <select
                className="v3-select text-[13.5px]"
                value={prefBranch}
                onChange={(e) => setPrefBranch(e.target.value as BranchId | 'ALL')}
              >
                <option value="ALL">全部分支智能混排</option>
                {content.catalog.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {/* 今日生活轻打卡 */}
          <section className="glass-plate space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ink-1)]">
                <Droplets size={14} strokeWidth={1.7} className="text-[var(--growth)]" />
                <span>今日生活轻打卡</span>
              </div>
              <span className="font-mono-num text-[12px] text-[var(--ink-3)]">{plan.dateKey}</span>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2">
              <span className="text-[13px] text-[var(--ink-2)]">
                饮水：
                <strong className="font-mono-num text-[var(--ink-1)]">
                  {todayLife?.waterCups ?? 0} / {todayLife?.waterGoal ?? 8} 杯
                </strong>
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
                  min="0"
                  max="16"
                  className="v3-input font-mono-num text-[13.5px]"
                  placeholder="如 7.5"
                  value={sleepInput}
                  onChange={(e) => setSleepInput(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>今日跑步（km）</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  className="v3-input font-mono-num text-[13.5px]"
                  placeholder="如 5.0"
                  value={runInput}
                  onChange={(e) => setRunInput(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={handleSaveLifeInputs}>
                保存睡眠与跑步
              </Button>
            </div>
          </section>

          {/* 玻璃通透度三档 */}
          <section className="glass-plate space-y-2.5 p-4">
            <div className="text-[13px] font-semibold text-[var(--ink-1)]">玻璃通透度</div>
            <div className="grid grid-cols-3 gap-2">
              {CLARITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSetClarity(opt.value)}
                  className={cn(
                    'cursor-pointer rounded-[10px] border p-2.5 text-left transition-colors',
                    currentClarity === opt.value
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                      : 'border-[var(--line)] bg-transparent text-[var(--ink-2)] hover:border-[var(--line-strong)]'
                  )}
                >
                  <div className="text-[13px] font-semibold">{opt.label}</div>
                  <div className="mt-0.5 text-[11px] opacity-80">{opt.desc}</div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </Drawer>

      {/* 1. 极简留白页头（不加分割线，不堆按钮） */}
      <header className="flex flex-wrap items-end justify-between gap-4" aria-label="今日节律简报">
        <div className="space-y-1">
          <div className="sky-heading font-mono-num text-[13px] text-[var(--ink-2)]">
            {formatReadableDate(plan.dateKey)} · {selectedSlotMeta.timeHint}
          </div>
          <h1 className="sky-heading m-0 text-[28px] font-semibold leading-[1.2] tracking-[-0.025em] text-[var(--ink-1)] sm:text-[32px]">
            今日学习主线
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-[150px] space-y-1.5" aria-label={`今日完成度 ${progressPct}%`}>
            <div className="sky-heading flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--ink-2)]">进度</span>
              <strong className="font-mono-num text-[var(--ink-1)]">
                {completedCount}/{totalCount}
              </strong>
            </div>
            <ProgressBar percent={progressPct} color="var(--growth)" />
          </div>

          <Tooltip content="自定义作息、偏好分支、今日打卡与玻璃通透度">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              data-testid="today-rhythm-drawer-trigger"
              onClick={() => setRhythmDrawerOpen(true)}
            >
              <SlidersHorizontal size={13} strokeWidth={1.7} />
              <span>节律</span>
            </Button>
          </Tooltip>
        </div>
      </header>

      {/* 全部完成收工态 */}
      {isAllDone && (
        <section
          className="glass-alert flex items-center gap-3 rounded-full border border-[var(--growth-border)] bg-[var(--growth-soft)] px-5 py-3 self-start"
          aria-live="polite"
        >
          <CheckCircle2 size={18} strokeWidth={1.8} className="shrink-0 text-[var(--growth)]" />
          <span className="text-[14px] text-[var(--ink-1)]">
            <strong>今日定额已收工</strong> · 明天自动翻篇，去休息吧
          </span>
        </section>
      )}

      {/* 2. 主舞台：左侧单焦清透玻璃卡 + 中轴完全留白给 Wave 银河与少女 + 右下轻量时段索引 */}
      <section
        className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,480px)_1fr_minmax(0,300px)]"
        aria-label="今日主线与三时段"
      >
        {/* 左：唯一焦点大卡（零内嵌黑框、大呼吸留白、单一主按钮） */}
        {focalTask && focalBranch && (
          <div
            className="v3-card flex flex-col justify-between gap-7 p-6 sm:p-8"
            aria-label="此刻焦点任务"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 text-[12.5px] text-[var(--ink-2)]">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: focalBranch.accentToken }}
                  />
                  <span>
                    {BAND_SHORT[focalTask.slot]} · {focalTask.branchId} {focalBranch.name}
                  </span>
                </span>
                <span className="font-mono-num text-[var(--ink-3)]">
                  {focalDone ? '已完成' : `${focalTask.estimatedMinutes}m`}
                </span>
              </div>

              <h2
                data-testid="today-focal-title"
                className="m-0 text-[22px] font-semibold leading-[1.36] tracking-[-0.02em] text-[var(--ink-1)] sm:text-[25px]"
              >
                {focalTask.title}
              </h2>

              <p className="m-0 text-[15px] leading-[1.75] text-[var(--ink-2)]">
                <RichText text={focalTask.humanHint} concepts={content.knowledgeGraph.nodes} />
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href={focalHref}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[var(--btn-solid-bg)] px-6 py-2.5 text-[14.5px] font-semibold text-[var(--btn-solid-fg)] no-underline shadow-[0_8px_22px_rgba(245,184,154,0.3)] transition-colors hover:bg-[var(--btn-solid-hover)]"
                >
                  <span>
                    {focalTask.unitId
                      ? '开始学习'
                      : focalTask.kind === 'retest_review'
                        ? '开始重测'
                        : '打开闪卡'}
                  </span>
                  <ArrowRight size={15} strokeWidth={1.8} />
                </a>

                {focalTask.unitId && (
                  <Tooltip content="右侧抽屉速览本节要点，不离开首页">
                    <Button
                      variant="outline"
                      size="lg"
                      className="rounded-full"
                      data-testid="today-unit-preview-btn"
                      onClick={() => onPreviewUnit(focalTask.unitId!)}
                    >
                      <BookOpen size={15} strokeWidth={1.6} />
                      <span>速览</span>
                    </Button>
                  </Tooltip>
                )}
              </div>

              <div className="flex items-center gap-4 pt-1 text-[13px] text-[var(--ink-3)]">
                {focalTask.unitId && (
                  <Tooltip content="按偏好分支换一个今日学习单元">
                    <button
                      type="button"
                      data-testid="today-swap-task-btn"
                      onClick={handleSwapFocalTask}
                      className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
                    >
                      <Shuffle size={13} strokeWidth={1.7} />
                      <span>换一题</span>
                    </button>
                  </Tooltip>
                )}

                <button
                  type="button"
                  onClick={() => onToggleTask(focalTask)}
                  className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] text-[var(--ink-2)] transition-colors hover:text-[var(--growth)]"
                >
                  <Check size={13} strokeWidth={2} />
                  <span>{focalDone ? '取消完成' : '直接标为完成'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 中轴视觉呼吸走廊：在桌面端完全让给 Wave 银河、少女剪影与落日海面 */}
        <div className="hidden lg:block" aria-hidden="true" />

        {/* 右：克制的轻量化三时段排期（紧凑停靠，绝不抢占视野） */}
        <div
          className="v3-card flex flex-col gap-3.5 p-4 sm:p-5 lg:self-end"
          aria-label="今日三时段任务排期"
        >
          <div
            className="grid grid-cols-3 gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-plate)] p-1"
            role="tablist"
            aria-label="精力时段切换"
          >
            {energySlots.map((slot) => {
              const slotItems = allTasks.filter((t) => t.slot === slot.band);
              const doneItems = slotItems.filter((t) => plan.completedTaskIds.includes(t.id));
              const isSelected = selectedBand === slot.band;
              return (
                <button
                  key={slot.band}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedBand(slot.band)}
                  className={cn(
                    'flex min-h-[34px] cursor-pointer items-center justify-center gap-1 rounded-full px-2 text-[12.5px] font-medium transition-colors',
                    isSelected
                      ? 'bg-[var(--accent-soft)] text-[var(--ink-1)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  )}
                >
                  <span>{BAND_SHORT[slot.band]}</span>
                  <span className="font-mono-num text-[11px] opacity-75">
                    {doneItems.length}/{slotItems.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="divide-y divide-[var(--line)]">
            {selectedSlotTasks.map((task) => {
              const isChecked = plan.completedTaskIds.includes(task.id);
              const href = task.unitId
                ? `#/unit/${encodeURIComponent(task.unitId)}`
                : task.kind === 'retest_review'
                  ? '#/review?tab=retest'
                  : '#/review?tab=cards';
              return (
                <div
                  key={task.id}
                  className={cn(
                    'flex items-center gap-2.5 py-2.5 first:pt-1 last:pb-0.5',
                    isChecked && 'opacity-55'
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    aria-label={`标记完成：${task.title}`}
                    onClick={() => onToggleTask(task)}
                    className={cn(
                      'flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors',
                      isChecked
                        ? 'border-[var(--growth)] bg-[var(--growth)] text-[#081510]'
                        : 'border-[var(--line-strong)] bg-transparent hover:border-[var(--accent)]'
                    )}
                  >
                    {isChecked && <Check size={11} strokeWidth={2.5} />}
                  </button>

                  <a
                    href={href}
                    className={cn(
                      'min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--ink-1)] no-underline hover:text-[var(--accent)]',
                      isChecked && 'line-through'
                    )}
                  >
                    {task.title}
                  </a>

                  <span className="font-mono-num shrink-0 text-[11.5px] text-[var(--ink-3)]">
                    {task.estimatedMinutes}m
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. 底部单行清透信息丝带（把原本 3 张厚重大卡片收束成一条轻盈玻璃胶囊带） */}
      <footer
        className="v3-card flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[20px] px-5 py-3.5"
        aria-label="今日轻量辅助条"
      >
        {/* 每日一招：单行胶囊，点击在右侧抽屉细读 */}
        <Tooltip content="点击在右侧抽屉阅读完整今日一招" side="top">
          <button
            type="button"
            onClick={() => setTipDrawerOpen(true)}
            className="flex min-w-0 max-w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-[13.5px] text-[var(--ink-1)] transition-colors hover:text-[var(--dawn)]"
          >
            <Lightbulb size={15} strokeWidth={1.7} className="shrink-0 text-[var(--dawn)]" />
            <span className="shrink-0 text-[12px] text-[var(--ink-3)]">每日一招</span>
            <span className="truncate font-medium">{dailyTip.title}</span>
          </button>
        </Tooltip>

        {/* 右侧极简状态组：重测计数 + 7日点亮微光点 */}
        <div className="flex flex-wrap items-center gap-4 text-[13px]">
          <a
            href="#/review?tab=retest"
            className="inline-flex items-center gap-1.5 text-[var(--ink-2)] no-underline transition-colors hover:text-[var(--ink-1)]"
          >
            <Layers size={14} strokeWidth={1.6} className="text-[var(--accent)]" />
            <span>
              重测{' '}
              <strong className="font-mono-num text-[var(--ink-1)]">
                {retestQueue.dueItems.length}
              </strong>{' '}
              到期
            </span>
          </a>

          <span className="h-3.5 w-px bg-[var(--line)]" aria-hidden="true" />

          <Tooltip content="点击打开 14 日足迹与生活打卡抽屉" side="top">
            <button
              type="button"
              onClick={() => setRhythmDrawerOpen(true)}
              className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[13px] text-[var(--ink-2)] hover:text-[var(--ink-1)]"
            >
              <span>
                点亮{' '}
                <strong className="font-mono-num text-[var(--ink-1)]">
                  {continuity.totalActiveDays}
                </strong>{' '}
                天
              </span>
              <span className="inline-flex items-center gap-1" aria-label="近 7 天活跃足迹">
                {continuity.recent14Days.slice(-7).map((day) => (
                  <span
                    key={day.dateKey}
                    className={cn(
                      'h-2.5 w-2.5 rounded-full border',
                      day.isActive
                        ? 'border-[var(--growth-border)] bg-[var(--growth)]'
                        : 'border-[var(--line-strong)] bg-transparent',
                      day.isToday && 'ring-1 ring-[var(--dawn)]'
                    )}
                  />
                ))}
              </span>
            </button>
          </Tooltip>
        </div>
      </footer>
    </div>
  );
}
