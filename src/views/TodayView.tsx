import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  CloudRain,
  Droplets,
  Layers,
  Lightbulb,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Timer,
  Volume2,
  VolumeX,
  Waves,
  Wind,
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
  getGreetingByHour,
  pickAlternativeUnitTask,
} from '@/core/scheduler';
import { getRetestQueue } from '@/core/srs';
import { type AmbientSoundKind, deskAmbientEngine } from '@/lib/ambientAudio';
import { useLiquidGlass } from '@/lib/liquidGlass';
import { cn } from '@/lib/utils';
import type {
  BranchCatalog,
  BranchId,
  DailyMood,
  DailyPlanSnapshot,
  EnergyBand,
  GlassClarityMode,
  ScheduledTaskItem,
  TelemetrySnapshot,
  WallCountdownItem,
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
  fragment: '上午',
  peak: '傍晚',
  low: '睡前',
};

const MOOD_OPTIONS: Array<{ value: DailyMood; label: string; reply: string }> = [
  { value: 'relaxed', label: '松弛', reply: '慢慢来最舒服，挑件顺手的小事就行' },
  { value: 'focused', label: '充实', reply: '状态不错，顺手把今天最值的一件事搞定' },
  { value: 'tired', label: '有点累', reply: '辛苦啦，今天喝杯温水早点歇着也很好' },
];

const CLARITY_OPTIONS: Array<{ value: GlassClarityMode; label: string; desc: string }> = [
  { value: 'clear', label: '清透', desc: '星海通透感最高' },
  { value: 'regular', label: '标准', desc: '亮度与清晰均衡' },
  { value: 'frosted', label: '深读', desc: '长文护眼高对比' },
];

const SOUND_OPTIONS: Array<{ id: Exclude<AmbientSoundKind, 'off'>; label: string; icon: typeof Waves }> = [
  { id: 'waves', label: '海浪', icon: Waves },
  { id: 'rain', label: '细雨', icon: CloudRain },
  { id: 'breeze', label: '夜风', icon: Wind },
];

function formatReadableDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${y} · ${String(m).padStart(2, '0')} · ${String(d).padStart(2, '0')}  ${weekdays[dt.getDay()]}`;
}

function diffDaysSimple(fromDateKey: string, toDateKey: string): number {
  const [y1, m1, d1] = fromDateKey.split('-').map(Number);
  const [y2, m2, d2] = toDateKey.split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000));
}

function getBranchMeta(branches: BranchCatalog[], id: string) {
  return (
    branches.find((b) => b.id === id) ?? {
      id: 'B7',
      name: id,
      accentToken: '#4c9aff',
    }
  );
}

function formatTimerClock(totalSeconds: number): string {
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
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
  const [now, setNow] = useState<Date>(() => new Date());

  // 书桌轻生活小件：25 分钟专注时钟 + 原生 Web Audio 氛围声（海浪 / 细雨 / 夜风）
  const [focusSeconds, setFocusSeconds] = useState<number>(25 * 60);
  const [focusRunning, setFocusRunning] = useState<boolean>(false);
  const [soundMode, setSoundMode] = useState<AmbientSoundKind>(() => deskAmbientEngine.getMode());

  // 真 SDF 折射色散玻璃透镜（仅用于左右两块悬浮玻璃卡片，中轴留给电影感星海人物）
  const focalGlassRef = useLiquidGlass<HTMLDivElement>({
    sdfMode: 'single',
    scale: -22,
    chroma: 4.2,
    border: 0.13,
    blur: 16,
    saturate: 1.82,
    maxWidth: 540,
  });
  const lifeCardGlassRef = useLiquidGlass<HTMLDivElement>({
    sdfMode: 'compound',
    scale: -20,
    chroma: 4.5,
    border: 0.15,
    blur: 16,
    saturate: 1.82,
    maxWidth: 420,
  });

  // 节律与生活打卡 Drawer 表单态
  const [fragHour, setFragHour] = useState<number>(prefs.fragmentStartHour);
  const [peakHour, setPeakHour] = useState<number>(prefs.peakStartHour);
  const [lowHour, setLowHour] = useState<number>(prefs.lowStartHour);
  const [prefBranch, setPrefBranch] = useState<BranchId | 'ALL'>(prefs.preferredBranchId ?? 'ALL');
  const [newCdLabel, setNewCdLabel] = useState<string>('');
  const [newCdDate, setNewCdDate] = useState<string>('');

  const todayLife = telemetry.dailyLifeLogs?.[plan.dateKey];
  const [sleepInput, setSleepInput] = useState<string>(
    todayLife?.sleepHours !== undefined ? String(todayLife.sleepHours) : ''
  );
  const [runInput, setRunInput] = useState<string>(
    todayLife?.runningKm !== undefined ? String(todayLife.runningKm) : ''
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!focusRunning) return;
    const t = setInterval(() => {
      setFocusSeconds((prev) => {
        if (prev <= 1) {
          setFocusRunning(false);
          toast.success('25 分钟温柔专注完成，起来喝口水望望窗外吧');
          return 25 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [focusRunning]);

  useEffect(() => {
    return () => {
      deskAmbientEngine.stop();
    };
  }, []);

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

  const selectedSlotTasks = allTasks.filter((t) => t.slot === selectedBand);
  const focalTask: ScheduledTaskItem | undefined =
    selectedSlotTasks.find((t) => Boolean(t.unitId) && !plan.completedTaskIds.includes(t.id)) ??
    allTasks.find((t) => Boolean(t.unitId) && !plan.completedTaskIds.includes(t.id)) ??
    allTasks.find((t) => Boolean(t.unitId)) ??
    selectedSlotTasks.find((t) => !plan.completedTaskIds.includes(t.id)) ??
    selectedSlotTasks[0] ??
    allTasks[0];

  const focalBranch = focalTask
    ? getBranchMeta(content.catalog.branches, focalTask.branchId)
    : undefined;
  const focalUnit = focalTask?.unitId
    ? content.units.find((u) => u.id === focalTask.unitId)
    : undefined;
  const focalDisplayTitle = focalUnit
    ? focalUnit.title.replace(/^【示例占位】/, '')
    : focalTask?.title ?? '';
  const focalDisplayHint = focalUnit
    ? focalUnit.scenarioHook.sceneTitle
    : focalTask?.humanHint ?? '';

  const focalDone = focalTask ? plan.completedTaskIds.includes(focalTask.id) : false;
  const focalHref = focalTask
    ? focalTask.unitId
      ? `#/unit/${encodeURIComponent(focalTask.unitId)}`
      : focalTask.kind === 'retest_review'
        ? '#/review?tab=retest'
        : '#/review?tab=cards'
    : '#/branches';

  const currentClarity: GlassClarityMode = telemetry.wallPersonal?.glassClarity ?? 'clear';

  // 最近的一个倒数日（优先用户自己的，其次默认）
  const activeCountdowns: WallCountdownItem[] =
    telemetry.wallPersonal?.countdowns && telemetry.wallPersonal.countdowns.length > 0
      ? telemetry.wallPersonal.countdowns
      : content.wallConfig.countdowns;
  const nearestCountdown = activeCountdowns
    .map((cd) => ({ ...cd, daysLeft: diffDaysSimple(plan.dateKey, cd.targetDate) }))
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];

  const weatherLine =
    telemetry.wallPersonal?.weatherNote?.trim() || content.wallConfig.todayPlaceholder.weather;
  const dailyQuote =
    telemetry.wallPersonal?.quote?.trim() || content.wallConfig.reservedBlocksSample.content.quote;
  const todayMood = todayLife?.mood;
  const waterCups = todayLife?.waterCups ?? 0;
  const waterGoal = todayLife?.waterGoal ?? 8;

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  const handleToggleSound = (mode: Exclude<AmbientSoundKind, 'off'>) => {
    const next: AmbientSoundKind = soundMode === mode ? 'off' : mode;
    deskAmbientEngine.play(next);
    setSoundMode(next);
    const labelMap = { waves: '潮汐海浪声', rain: '细雨敲窗声', breeze: '夜空微风声', off: '已静音' };
    toast(next === 'off' ? '已关闭书桌氛围声' : `正在轻放：${labelMap[next]}`);
  };

  const handleSwapFocalTask = async () => {
    if (!focalTask || !focalTask.unitId) return;
    const alt = pickAlternativeUnitTask(content, telemetry, focalTask, plan.dateKey, prefBranch);
    if (!alt) {
      toast('当前偏好主题暂无更多可替换内容');
      return;
    }
    const next = await swapDailyPlanTask(focalTask.id, alt);
    onTelemetryChange(next);
    toast.success(`换了一篇：${alt.title.slice(0, 18)}`);
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
    toast.success('已保存你的日常作息与内容偏好');
  };

  const handleQuickWater = async (delta: number) => {
    const next = await logDailyLifeHabit({ waterDelta: delta }, plan.dateKey);
    onTelemetryChange(next);
    const cups = next.dailyLifeLogs?.[plan.dateKey]?.waterCups ?? 0;
    toast.success(
      cups >= waterGoal ? `太棒了，今天喝够 ${cups} 杯水啦` : `喝水 +1 · 今日已喝 ${cups} / ${waterGoal} 杯`
    );
  };

  const handleSelectMood = async (mood: DailyMood) => {
    const next = await logDailyLifeHabit({ mood }, plan.dateKey);
    onTelemetryChange(next);
    const meta = MOOD_OPTIONS.find((m) => m.value === mood);
    if (meta) toast(meta.reply);
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
    toast.success('已记下今天的睡眠与运动，状态墙同步更新啦');
  };

  const handleQuickAddCountdown = async () => {
    if (!newCdLabel.trim() || !newCdDate) return;
    const base = telemetry.wallPersonal?.countdowns ? [...telemetry.wallPersonal.countdowns] : [];
    const nextList: WallCountdownItem[] = [
      ...base,
      { id: `cd_${Date.now()}`, label: newCdLabel.trim(), targetDate: newCdDate, isSample: false },
    ];
    const next = await saveWallPersonalConfig({ countdowns: nextList });
    onTelemetryChange(next);
    setNewCdLabel('');
    setNewCdDate('');
    toast.success('已记下这个重要日子，首页与状态墙同步展示');
  };

  const handleSetClarity = async (mode: GlassClarityMode) => {
    const next = await saveWallPersonalConfig({ glassClarity: mode });
    onTelemetryChange(next);
    toast(`玻璃通透度已切至：${CLARITY_OPTIONS.find((c) => c.value === mode)?.label}`);
  };

  return (
    <div className="flex flex-col justify-between gap-7 py-2 sm:py-4 lg:min-h-[calc(100vh-124px)] lg:gap-8">
      {/* 右侧 Drawer 1：每日生活一招详情 */}
      <Drawer
        open={tipDrawerOpen}
        onOpenChange={setTipDrawerOpen}
        title={dailyTip.title}
        description={`${tipBranch.name} · 约 ${dailyTip.readSeconds} 秒阅读`}
        footer={
          <Button
            size="sm"
            variant={plan.tipAcknowledged ? 'outline' : 'primary'}
            onClick={() => {
              onToggleTipAck(!plan.tipAcknowledged);
              if (!plan.tipAcknowledged) setTipDrawerOpen(false);
            }}
          >
            {plan.tipAcknowledged ? '取消记下' : '记下这一招'}
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

      {/* 右侧 Drawer 2：生活偏好、14 日足迹、睡眠运动、倒数日与玻璃通透度 */}
      <Drawer
        open={rhythmDrawerOpen}
        onOpenChange={setRhythmDrawerOpen}
        title="日常节律与生活小记"
        description="按自己的节奏来，所有记录仅存本机浏览器并联动书桌状态墙"
        footer={
          <Button size="sm" variant="primary" onClick={handleSaveRhythmPrefs}>
            保存作息与偏好
          </Button>
        }
      >
        <div className="space-y-5">
          {/* 近 14 天温柔足迹 */}
          <section className="glass-plate space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                近 14 天生活足迹（累计 {continuity.totalActiveDays} 天）
              </span>
              <Badge tone="neutral">连着 {consecutiveDays} 天</Badge>
            </div>
            <div className="grid grid-cols-7 gap-1.5" aria-label="近 14 天活跃足迹">
              {continuity.recent14Days.map((day) => (
                <Tooltip
                  key={day.dateKey}
                  content={`${day.dateKey}${day.isActive ? ' · 有记录' : ' · 好好休息'}`}
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
            <div className="text-[12px] text-[var(--ink-3)]">轻松累积，哪天忙没打开也不清零、不扣分</div>
          </section>

          {/* 今日饮水、睡眠、跑步 */}
          <section className="glass-plate space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ink-1)]">
                <Droplets size={14} strokeWidth={1.7} className="text-[var(--growth)]" />
                <span>今天身体照顾得怎么样</span>
              </div>
              <span className="font-mono-num text-[12px] text-[var(--ink-3)]">{plan.dateKey}</span>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2">
              <span className="text-[13px] text-[var(--ink-2)]">
                喝水：
                <strong className="font-mono-num text-[var(--ink-1)]">
                  {waterCups} / {waterGoal} 杯
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
                <span>昨晚睡了（小时）</span>
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
                <span>今天跑步（km）</span>
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
                记下睡眠与跑步
              </Button>
            </div>
          </section>

          {/* 添一个重要日子倒数 */}
          <section className="glass-plate space-y-2.5 p-4">
            <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ink-1)]">
              <CalendarClock size={14} strokeWidth={1.7} className="text-[var(--dawn)]" />
              <span>添一个值得期待的日子</span>
            </div>
            <input
              type="text"
              className="v3-input text-[13.5px]"
              placeholder="如：短途旅行 / 体检复查 / 朋友婚礼"
              value={newCdLabel}
              onChange={(e) => setNewCdLabel(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="v3-input font-mono-num flex-1 text-[13px]"
                value={newCdDate}
                onChange={(e) => setNewCdDate(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!newCdLabel.trim() || !newCdDate}
                onClick={handleQuickAddCountdown}
              >
                <Plus size={13} strokeWidth={1.7} />
                <span>添加</span>
              </Button>
            </div>
          </section>

          {/* 每日作息与内容偏好 */}
          <section className="glass-plate space-y-3 p-4">
            <div className="text-[13px] font-semibold text-[var(--ink-1)]">每日作息与内容偏好</div>
            <div className="grid grid-cols-3 gap-2.5">
              <label className="space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>上午起</span>
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
                <span>傍晚起</span>
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
              <span>首页优先推荐主题</span>
              <select
                className="v3-select text-[13.5px]"
                value={prefBranch}
                onChange={(e) => setPrefBranch(e.target.value as BranchId | 'ALL')}
              >
                <option value="ALL">日常实用优先（理财 / 心理 / 健康 / 防坑）</option>
                {content.catalog.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    专注：{b.name}
                  </option>
                ))}
              </select>
            </label>
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

      {/* 1. 电影画报感无框主视觉头（超大纤细时钟 + 衬线生活一句 + 右上无框倒计时焦点，中央海天大片呼吸） */}
      <header
        className="flex flex-wrap items-start justify-between gap-6 pt-1 sm:pt-3"
        aria-label="今日电影感生活桌面"
      >
        <div className="max-w-[580px] space-y-3">
          <div className="sky-heading flex flex-wrap items-center gap-2.5 text-[12.5px] tracking-[0.08em] text-[var(--ink-2)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--growth)] shadow-[0_0_8px_var(--growth)]" />
            <span className="font-mono-num">{formatReadableDate(plan.dateKey)}</span>
            <span className="opacity-40">/</span>
            <span>{weatherLine}</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <div
              className="cinema-clock-digits sky-heading inline-flex items-baseline text-[54px] text-[var(--ink-1)] sm:text-[68px]"
              aria-label={`当前时间 ${hh}:${mm}:${ss}`}
            >
              <span>{hh}</span>
              <span className="cinema-colon-pulse mx-0.5 -translate-y-1 text-[var(--dawn)]">:</span>
              <span>{mm}</span>
              <span className="font-mono-num ml-2 text-[17px] font-light text-[var(--dawn)] sm:text-[20px]">
                {ss}
              </span>
            </div>

            <h1 className="sky-heading m-0 text-[20px] font-medium tracking-[0.01em] text-[var(--ink-1)] sm:text-[23px]">
              {getGreetingByHour()}
            </h1>
          </div>

          <div className="cinema-hairline-rule" aria-hidden="true" />

          <p className="cinema-serif-quote sky-heading m-0 text-[16px] leading-[1.68] text-[var(--ink-1)] opacity-90 sm:text-[18px]">
            「{dailyQuote}」
          </p>
        </div>

        {/* 右上无框轻浮区：最近倒数日 + 极简小记进度控制 */}
        <div className="flex flex-col items-end gap-3 self-stretch justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[116px] space-y-1.5" aria-label={`今日小事完成 ${progressPct}%`}>
              <div className="sky-heading flex items-center justify-between text-[12px]">
                <span className="text-[var(--ink-2)]">今日小事</span>
                <strong className="font-mono-num text-[var(--ink-1)]">
                  {completedCount}/{totalCount}
                </strong>
              </div>
              <ProgressBar percent={progressPct} color="var(--growth)" />
            </div>

            <Tooltip content="调整作息、补录睡眠跑步、添加倒数日与玻璃通透度">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                data-testid="today-rhythm-drawer-trigger"
                onClick={() => setRhythmDrawerOpen(true)}
              >
                <SlidersHorizontal size={13} strokeWidth={1.7} />
                <span>小记与偏好</span>
              </Button>
            </Tooltip>
          </div>

          {nearestCountdown && (
            <button
              type="button"
              onClick={() => setRhythmDrawerOpen(true)}
              className="sky-heading group flex cursor-pointer items-baseline gap-3 border-0 bg-transparent p-0 text-right transition-opacity hover:opacity-100"
            >
              <div>
                <div className="text-[11px] tracking-[0.14em] text-[var(--dawn)] uppercase">
                  重要日子
                </div>
                <div className="text-[14px] font-medium text-[var(--ink-1)]">
                  {nearestCountdown.label}
                </div>
              </div>
              <div className="cinema-clock-digits inline-flex items-baseline gap-0.5 text-[38px] text-[var(--dawn)]">
                <span>{nearestCountdown.daysLeft}</span>
                <span className="font-sans text-[12.5px] font-normal text-[var(--ink-2)]">天</span>
              </div>
            </button>
          )}
        </div>
      </header>

      {/* 全部完成温柔收工态 */}
      {isAllDone && (
        <section
          className="glass-alert flex items-center gap-3 self-start rounded-full border border-[var(--growth-border)] bg-[var(--growth-soft)] px-5 py-3"
          aria-live="polite"
        >
          <CheckCircle2 size={18} strokeWidth={1.8} className="shrink-0 text-[var(--growth)]" />
          <span className="text-[14px] text-[var(--ink-1)]">
            <strong>今天的小事都顺手办完啦</strong> · 好好放松，明天再聊
          </span>
        </section>
      )}

      {/* 2. 主舞台：左极透电影聚焦手册卡 + 中央大面积留白给星海与剪影 + 右书桌生活与氛围声陪伴台 */}
      <section
        className="grid grid-cols-1 items-end gap-8 lg:grid-cols-[minmax(0,450px)_1fr_minmax(0,336px)]"
        aria-label="今日顺手看看与生活陪伴台"
      >
        {/* 左：单焦清透光学玻璃卡（真 SDF 边缘折射 + 色散） */}
        {focalTask && focalBranch && (
          <div
            ref={focalGlassRef}
            className="v3-card flex flex-col justify-between gap-6 p-6 sm:p-7"
            aria-label="今日顺手一读"
          >
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-2 text-[12.5px] text-[var(--ink-2)]">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: focalBranch.accentToken }}
                  />
                  <span>{focalBranch.name} · 深度实战手册</span>
                </span>
                <span className="font-mono-num text-[var(--ink-3)]">
                  {focalDone ? '已看过' : `约 ${focalTask.estimatedMinutes} 分钟`}
                </span>
              </div>

              <h2
                data-testid="today-focal-title"
                className="m-0 text-[20px] font-semibold leading-[1.38] tracking-[-0.02em] text-[var(--ink-1)] sm:text-[23px]"
              >
                {focalDisplayTitle}
              </h2>

              <p className="m-0 text-[14.2px] leading-[1.76] text-[var(--ink-2)]">
                <RichText text={focalDisplayHint} concepts={content.knowledgeGraph.nodes} />
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href={focalHref}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[var(--btn-solid-bg)] px-6 py-2.5 text-[14.5px] font-semibold text-[var(--btn-solid-fg)] no-underline shadow-[0_8px_22px_rgba(245,184,154,0.28)] transition-colors hover:bg-[var(--btn-solid-hover)]"
                >
                  <span>
                    {focalTask.unitId
                      ? '阅读手册'
                      : focalTask.kind === 'retest_review'
                        ? '去温习一下'
                        : '顺手翻几张卡'}
                  </span>
                  <ArrowRight size={15} strokeWidth={1.8} />
                </a>

                {focalTask.unitId && (
                  <Tooltip content="在右侧抽屉快速扫一眼核心结论，不用跳转页面">
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
                  <Tooltip content="从全站 46 篇手册里换一篇今天想看的">
                    <button
                      type="button"
                      data-testid="today-swap-task-btn"
                      onClick={handleSwapFocalTask}
                      className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
                    >
                      <Shuffle size={13} strokeWidth={1.7} />
                      <span>换一篇</span>
                    </button>
                  </Tooltip>
                )}

                <button
                  type="button"
                  onClick={() => onToggleTask(focalTask)}
                  className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] text-[var(--ink-2)] transition-colors hover:text-[var(--growth)]"
                >
                  <Check size={13} strokeWidth={2} />
                  <span>{focalDone ? '取消标记' : '顺手标为看过'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 中轴视觉呼吸走廊：桌面端完整让位给 Wave 银河、少女剪影与落日地平线 */}
        <div className="hidden lg:block" aria-hidden="true" />

        {/* 右：书桌生活陪伴台（8 格喝水 + 心情 + 25 分钟书桌专注钟 & 原生白噪音 + 轻量时段清单） */}
        <div
          ref={lifeCardGlassRef}
          className="v3-card flex flex-col gap-3.5 p-4 sm:p-5"
          aria-label="书桌生活陪伴与氛围声"
        >
          {/* 1. 可视化 8 格喝水 + 今日状态贴纸 */}
          <div className="space-y-2.5 border-b border-[var(--line)] pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-2)]">
                <Droplets size={14} strokeWidth={1.8} className="text-[var(--growth)]" />
                <span>
                  喝水{' '}
                  <strong
                    data-testid="today-water-count"
                    className="font-mono-num text-[var(--ink-1)]"
                  >
                    {waterCups}/{waterGoal}
                  </strong>{' '}
                  杯
                </span>
              </div>
              <button
                type="button"
                data-sdf-pill=""
                data-testid="today-water-plus-btn"
                onClick={() => handleQuickWater(1)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--growth-border)] bg-[var(--growth-soft)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--growth)] transition-transform active:scale-95"
              >
                +1 杯
              </button>
            </div>

            {/* 8 格水滴进度条 */}
            <div className="grid grid-cols-8 gap-1" aria-hidden="true">
              {Array.from({ length: waterGoal }).map((_, idx) => (
                <span
                  key={idx}
                  className={cn(
                    'h-1.5 rounded-full transition-colors',
                    idx < waterCups
                      ? 'bg-[var(--growth)] shadow-[0_0_8px_rgba(94,234,212,0.45)]'
                      : 'bg-[var(--surface-raised)]'
                  )}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="今日状态贴纸">
              {MOOD_OPTIONS.map((m) => {
                const active = todayMood === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    data-sdf-pill=""
                    data-testid={`today-mood-${m.value}`}
                    aria-pressed={active}
                    onClick={() => handleSelectMood(m.value)}
                    className={cn(
                      'min-h-[29px] cursor-pointer rounded-full border text-[12px] font-medium transition-colors',
                      active
                        ? 'border-[var(--dawn-border)] bg-[var(--dawn-soft)] text-[var(--ink-1)]'
                        : 'border-[var(--line)] bg-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 新生活化小件：书桌 25 分钟温柔专注钟 + 原生氛围白噪音 */}
          <div
            className="space-y-2 border-b border-[var(--line)] pb-3"
            data-testid="desk-ambient-bar"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ink-2)]">
                <Timer size={13} strokeWidth={1.7} className="text-[var(--dawn)]" />
                <span>书桌专注</span>
                <strong className="font-mono-num text-[14px] font-medium text-[var(--ink-1)]">
                  {formatTimerClock(focusSeconds)}
                </strong>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="focus-timer-toggle"
                  onClick={() => setFocusRunning((v) => !v)}
                  className={cn(
                    'inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-medium transition-colors',
                    focusRunning
                      ? 'border-[var(--dawn-border)] bg-[var(--dawn-soft)] text-[var(--ink-1)]'
                      : 'border-[var(--line)] bg-transparent text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                  )}
                >
                  {focusRunning ? <Pause size={11} /> : <Play size={11} />}
                  <span>{focusRunning ? '暂停' : '开始'}</span>
                </button>
                {focusSeconds !== 25 * 60 && (
                  <button
                    type="button"
                    aria-label="重置专注计时"
                    onClick={() => {
                      setFocusRunning(false);
                      setFocusSeconds(25 * 60);
                    }}
                    className="inline-flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-full border border-[var(--line)] bg-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ink-3)]">
                {soundMode === 'off' ? <VolumeX size={12} /> : <Volume2 size={12} className="text-[var(--accent)]" />}
                <span>氛围声</span>
              </span>
              <div className="flex items-center gap-1">
                {SOUND_OPTIONS.map((item) => {
                  const Icon = item.icon;
                  const active = soundMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`ambient-sound-${item.id}`}
                      aria-pressed={active}
                      onClick={() => handleToggleSound(item.id)}
                      className={cn(
                        'inline-flex h-[25px] cursor-pointer items-center gap-1 rounded-full border px-2 text-[11.5px] transition-colors',
                        active
                          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                          : 'border-[var(--line)] bg-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                      )}
                    >
                      <Icon size={11} strokeWidth={1.7} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. 轻量三时段小清单 */}
          <div className="space-y-2">
            <div
              className="grid grid-cols-3 gap-1 rounded-full border border-[var(--line)] bg-transparent p-0.5"
              role="tablist"
              aria-label="时段切换"
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
                    data-sdf-pill=""
                    aria-selected={isSelected}
                    onClick={() => setSelectedBand(slot.band)}
                    className={cn(
                      'flex min-h-[28px] cursor-pointer items-center justify-center gap-1 rounded-full px-1.5 text-[12px] font-medium transition-colors',
                      isSelected
                        ? 'bg-[var(--accent-soft)] text-[var(--ink-1)]'
                        : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                    )}
                  >
                    <span>{BAND_SHORT[slot.band]}</span>
                    <span className="font-mono-num text-[10.5px] opacity-75">
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
                      'flex items-center gap-2.5 py-2 first:pt-0.5 last:pb-0',
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
                        'flex h-[17px] w-[17px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors',
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
                        'min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--ink-1)] no-underline hover:text-[var(--accent)]',
                        isChecked && 'line-through'
                      )}
                    >
                      {task.title}
                    </a>

                    <span className="font-mono-num shrink-0 text-[11px] text-[var(--ink-3)]">
                      {task.estimatedMinutes}m
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 3. 底部单行极透电影丝带 */}
      <footer
        className="v3-card flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-full px-5 py-3"
        aria-label="今日轻量辅助条"
      >
        <Tooltip content="点击在右侧抽屉细看今日实用一招" side="top">
          <button
            type="button"
            onClick={() => setTipDrawerOpen(true)}
            className="flex min-w-0 max-w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-[13.5px] text-[var(--ink-1)] transition-colors hover:text-[var(--dawn)]"
          >
            <Lightbulb size={15} strokeWidth={1.7} className="shrink-0 text-[var(--dawn)]" />
            <span className="shrink-0 text-[12px] text-[var(--ink-3)]">生活一招</span>
            <span className="truncate font-medium">{dailyTip.title}</span>
          </button>
        </Tooltip>

        <div className="flex flex-wrap items-center gap-4 text-[13px]">
          <a
            href="#/events"
            className="inline-flex items-center gap-1.5 text-[var(--ink-2)] no-underline transition-colors hover:text-[var(--dawn)]"
          >
            <MessageCircle size={14} strokeWidth={1.6} className="text-[var(--dawn)]" />
            <span>省钱与速查</span>
          </a>

          <span className="h-3.5 w-px bg-[var(--line)]" aria-hidden="true" />

          <a
            href="#/review?tab=retest"
            className="inline-flex items-center gap-1.5 text-[var(--ink-2)] no-underline transition-colors hover:text-[var(--ink-1)]"
          >
            <Layers size={14} strokeWidth={1.6} className="text-[var(--accent)]" />
            <span>
              温习{' '}
              <strong className="font-mono-num text-[var(--ink-1)]">
                {retestQueue.dueItems.length}
              </strong>{' '}
              待看
            </span>
          </a>

          <span className="h-3.5 w-px bg-[var(--line)]" aria-hidden="true" />

          <Tooltip content="点击打开 14 日足迹与生活小记抽屉" side="top">
            <button
              type="button"
              onClick={() => setRhythmDrawerOpen(true)}
              className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[13px] text-[var(--ink-2)] hover:text-[var(--ink-1)]"
            >
              <span>
                足迹{' '}
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
