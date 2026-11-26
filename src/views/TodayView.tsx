import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { RichText } from '@/components/RichText';
import { Tooltip } from '@/components/ui/overlays';
import { Badge, Button, Card, ProgressBar } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import {
  computeContinuityFootprint,
  detectCurrentEnergyBand,
  ENERGY_SLOTS,
} from '@/core/scheduler';
import { getRetestQueue } from '@/core/srs';
import { cn } from '@/lib/utils';
import type {
  BranchCatalog,
  DailyPlanSnapshot,
  EnergyBand,
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
}

const BAND_SHORT: Record<EnergyBand, string> = {
  fragment: '早间碎片',
  peak: '高精力时段',
  low: '睡前复盘',
};

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
}: TodayViewProps) {
  const currentBand = detectCurrentEnergyBand();
  const [selectedBand, setSelectedBand] = useState<EnergyBand>(currentBand);
  const [showCollapsedTip, setShowCollapsedTip] = useState(false);

  const allTasks = plan.tasks;
  const completedCount = allTasks.filter((t) => plan.completedTaskIds.includes(t.id)).length;
  const totalCount = allTasks.length;
  const totalMinutes = allTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
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
    ENERGY_SLOTS.find((s) => s.band === selectedBand) ?? ENERGY_SLOTS[1];
  const selectedSlotTasks = allTasks.filter((t) => t.slot === selectedBand);

  const focalTask: ScheduledTaskItem | undefined =
    selectedSlotTasks.find((t) => !plan.completedTaskIds.includes(t.id)) ??
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

  return (
    <div className="space-y-6">
      {/* 极简页头：仅保留日期、主标题与当日进度条 */}
      <header
        className="flex flex-wrap items-end justify-between gap-4 pb-2"
        aria-label="今日节律简报"
      >
        <div className="space-y-1">
          <div className="sky-heading flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-2)]">
            <span className="font-mono-num">{formatReadableDate(plan.dateKey)}</span>
            <span>·</span>
            <span className="font-mono-num">
              今日 {totalCount} 项 · 约 {totalMinutes} 分钟
            </span>
          </div>
          <h1 className="sky-heading m-0 text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] text-[var(--ink-1)] sm:text-[30px]">
            今日学习主线
          </h1>
        </div>

        <div className="w-full space-y-1.5 sm:w-[220px]" aria-label={`今日完成度 ${progressPct}%`}>
          <div className="sky-heading flex items-center justify-between text-[13px]">
            <span className="text-[var(--ink-2)]">当日推进</span>
            <strong className="font-mono-num font-semibold text-[var(--ink-1)]">
              {completedCount}/{totalCount} · {progressPct}%
            </strong>
          </div>
          <ProgressBar percent={progressPct} color="var(--growth)" />
        </div>
      </header>

      {/* 全部完成收工态 */}
      {isAllDone && (
        <section
          className="glass-alert flex flex-wrap items-center gap-3.5 rounded-[16px] border border-[var(--growth-border)] bg-[var(--growth-soft)] px-5 py-3.5"
          aria-live="polite"
        >
          <CheckCircle2 size={20} strokeWidth={1.7} className="shrink-0 text-[var(--growth)]" />
          <div className="text-[14px] text-[var(--ink-1)]">
            <strong>今日定额已全部完成</strong> · 平台今天不再追加新任务，合上页面去休息吧
          </div>
        </section>
      )}

      {/* 极简清透 60/40 主舞台：左焦点任务卡 + 右三时段精简队列 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-stretch">
        {/* 左：焦点任务卡（简明克制：标题 + .glass-plate 导语 + 实色主按钮 + 速览抽屉） */}
        {focalTask && focalBranch && (
          <Card
            className="flex flex-col justify-between gap-6 p-6 sm:p-7"
            aria-label="此刻焦点任务"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="dawn">
                    <Sparkles size={12} strokeWidth={1.6} />
                    <span>{BAND_SHORT[focalTask.slot]}</span>
                  </Badge>
                  <Badge tone="neutral">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: focalBranch.accentToken }}
                    />
                    <span>
                      {focalTask.branchId} {focalBranch.name}
                    </span>
                  </Badge>
                  <span className="font-mono-num inline-flex items-center gap-1 text-[12.5px] text-[var(--ink-3)]">
                    <Clock size={13} strokeWidth={1.5} />
                    {focalTask.estimatedMinutes}m
                  </span>
                </div>
                {focalDone && <Badge tone="growth">已完成</Badge>}
              </div>

              <h2 className="m-0 text-[22px] font-semibold leading-[1.32] tracking-[-0.02em] text-[var(--ink-1)] sm:text-[26px]">
                {focalTask.title}
              </h2>

              <div className="glass-plate p-4 text-[15px] leading-[1.72] text-[var(--ink-2)]">
                <RichText text={focalTask.humanHint} concepts={content.knowledgeGraph.nodes} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--line)] pt-5">
              <a
                href={focalHref}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[var(--btn-solid-bg)] px-5 py-2.5 text-[14.5px] font-semibold text-[var(--btn-solid-fg)] no-underline shadow-[0_6px_18px_rgba(245,184,154,0.28)] transition-colors hover:bg-[var(--btn-solid-hover)]"
              >
                <span>
                  {focalTask.unitId
                    ? '进入互动学习'
                    : focalTask.kind === 'retest_review'
                      ? '开始间隔重测'
                      : '打开 3D 闪卡台'}
                </span>
                <ArrowRight size={15} strokeWidth={1.8} />
              </a>

              {focalTask.unitId && (
                <Tooltip content="在右侧抽屉快速预览本节要点，不离开首页">
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-full"
                    data-testid="today-unit-preview-btn"
                    onClick={() => onPreviewUnit(focalTask.unitId!)}
                  >
                    <BookOpen size={15} strokeWidth={1.6} />
                    <span>抽屉速览</span>
                  </Button>
                </Tooltip>
              )}

              <Button
                variant={focalDone ? 'subtle' : 'ghost'}
                size="lg"
                className="rounded-full"
                onClick={() => onToggleTask(focalTask)}
              >
                <Check size={15} strokeWidth={1.8} />
                <span>{focalDone ? '已勾选' : '标为完成'}</span>
              </Button>
            </div>
          </Card>
        )}

        {/* 右：三时段精简队列 */}
        <Card className="flex flex-col justify-between gap-4 p-5" aria-label="今日三时段任务排期">
          <div className="space-y-3.5">
            <div
              className="glass-plate grid grid-cols-3 gap-1 p-1"
              role="tablist"
              aria-label="精力时段切换"
            >
              {ENERGY_SLOTS.map((slot) => {
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
                      'flex min-h-[40px] cursor-pointer flex-col items-center justify-center rounded-[8px] px-2 py-1.5 text-center transition-colors',
                      isSelected
                        ? 'border border-[var(--line-strong)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                        : 'border border-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                    )}
                  >
                    <span className="text-[12.5px] font-medium leading-tight">
                      {BAND_SHORT[slot.band]}
                    </span>
                    <span className="font-mono-num mt-0.5 text-[11px] opacity-85">
                      {doneItems.length}/{slotItems.length}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 text-[12.5px] text-[var(--ink-3)]">
              <span>{selectedSlotMeta.rhythmDesc}</span>
              <span className="font-mono-num shrink-0">{selectedSlotMeta.timeHint}</span>
            </div>

            <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {selectedSlotTasks.map((task) => {
                const isChecked = plan.completedTaskIds.includes(task.id);
                const bMeta = getBranchMeta(content.catalog.branches, task.branchId);
                const href = task.unitId
                  ? `#/unit/${encodeURIComponent(task.unitId)}`
                  : task.kind === 'retest_review'
                    ? '#/review?tab=retest'
                    : '#/review?tab=cards';
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'flex items-center gap-3 py-3 first:pt-2.5 last:pb-1',
                      isChecked && 'opacity-60'
                    )}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      aria-label={`标记完成：${task.title}`}
                      onClick={() => onToggleTask(task)}
                      className={cn(
                        'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors',
                        isChecked
                          ? 'border-[var(--growth)] bg-[var(--growth)] text-[#081510]'
                          : 'border-[var(--line-strong)] bg-[var(--surface-plate)] hover:border-[var(--accent)]'
                      )}
                    >
                      {isChecked && <Check size={13} strokeWidth={2.4} />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: bMeta.accentToken }}
                        />
                        <span>{task.branchId}</span>
                        <span>·</span>
                        <span className="font-mono-num">{task.estimatedMinutes}m</span>
                      </div>
                      <div
                        className={cn(
                          'truncate text-[14.5px] font-medium text-[var(--ink-1)]',
                          isChecked && 'line-through'
                        )}
                      >
                        {task.title}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {task.unitId && (
                        <Tooltip content="在右侧抽屉速览本节">
                          <button
                            type="button"
                            aria-label={`速览：${task.title}`}
                            onClick={() => onPreviewUnit(task.unitId!)}
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-plate)] text-[var(--ink-2)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--ink-1)]"
                          >
                            <BookOpen size={13} strokeWidth={1.6} />
                          </button>
                        </Tooltip>
                      )}
                      <Tooltip content="直接进入学习">
                        <a
                          href={href}
                          aria-label={`前往：${task.title}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-plate)] text-[var(--ink-2)] no-underline transition-colors hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                        >
                          <ArrowRight size={14} strokeWidth={1.6} />
                        </a>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-[12.5px]">
            <span className="font-mono-num text-[var(--ink-3)]">
              {content.catalog.branches.length} 分支 · {content.units.length} 节互动课
            </span>
            <a
              href="#/branches"
              className="inline-flex items-center gap-1 font-medium text-[var(--accent)] no-underline hover:underline"
            >
              <span>星图全览</span>
              <ArrowRight size={13} strokeWidth={1.6} />
            </a>
          </div>
        </Card>
      </div>

      {/* 底部三列清透轻卡片 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
        {/* 列 1：每日一招 */}
        <Card className="space-y-3 p-5" aria-label="每日生活一招">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-1)]">
              <Lightbulb size={15} strokeWidth={1.6} className="text-[var(--dawn)]" />
              <span>每日一招 · {dailyTip.readSeconds}s</span>
            </div>
            {!plan.tipAcknowledged ? (
              <Button size="sm" variant="subtle" onClick={() => onToggleTipAck(true)}>
                记下了
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-[12.5px]">
                <button
                  type="button"
                  onClick={() => setShowCollapsedTip((v) => !v)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[var(--accent)] hover:underline"
                >
                  {showCollapsedTip ? '收起' : '再看一眼'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTipAck(false)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                >
                  展开
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-3)]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: tipBranch.accentToken }}
            />
            <span>
              {dailyTip.branchId} {tipBranch.name}
            </span>
          </div>

          <h3 className="m-0 text-[15.5px] font-semibold leading-[1.4] text-[var(--ink-1)]">
            {dailyTip.title}
          </h3>

          {(!plan.tipAcknowledged || showCollapsedTip) && (
            <div className="glass-plate space-y-2 p-3 text-[13.5px] leading-[1.6] text-[var(--ink-2)]">
              <p className="m-0">
                <RichText text={dailyTip.tipBody} />
              </p>
              {dailyTip.actionHint && (
                <div className="border-t border-[var(--line)] pt-2 text-[12.5px]">
                  <strong className="font-medium text-[var(--ink-1)]">顺手一试：</strong>
                  {dailyTip.actionHint}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* 列 2：间隔重测与 3D 闪卡 */}
        <Card className="flex flex-col justify-between gap-3.5 p-5" aria-label="间隔重测与闪卡状态">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-1)]">
              <Layers size={15} strokeWidth={1.6} className="text-[var(--accent)]" />
              <span>1 / 3 / 7 天重测</span>
            </div>
            <Badge tone={retestQueue.dueItems.length > 0 ? 'warning' : 'growth'}>
              到期 {retestQueue.dueItems.length}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="glass-plate p-3">
              <div className="text-[11.5px] text-[var(--ink-3)]">待重测项</div>
              <strong className="font-mono-num mt-0.5 block text-[22px] font-semibold text-[var(--ink-1)]">
                {retestQueue.dueItems.length + retestQueue.upcomingItems.length}
              </strong>
            </div>
            <div className="glass-plate p-3">
              <div className="text-[11.5px] text-[var(--ink-3)]">概念闪卡</div>
              <strong className="font-mono-num mt-0.5 block text-[22px] font-semibold text-[var(--ink-1)]">
                {content.knowledgeGraph.nodes.length}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="#/review?tab=retest"
              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-plate)] px-3 text-[13px] font-medium text-[var(--ink-1)] no-underline hover:border-[var(--accent-border)]"
            >
              <span>重测队列</span>
              <ArrowRight size={13} strokeWidth={1.6} />
            </a>
            <a
              href="#/review?tab=cards"
              className="inline-flex min-h-[36px] flex-1 items-center justify-center rounded-[10px] border border-[var(--line)] px-3 text-[13px] font-medium text-[var(--ink-2)] no-underline hover:text-[var(--ink-1)]"
            >
              3D 刷卡台
            </a>
          </div>
        </Card>

        {/* 列 3：14 日星海点亮阵（每格使用 Tooltip 悬停提示） */}
        <Card className="flex flex-col justify-between gap-3.5 p-5" aria-label="累计点亮成长足迹">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[12.5px] text-[var(--ink-3)]">累计点亮</div>
              <div className="font-mono-num text-[26px] font-semibold leading-tight text-[var(--ink-1)]">
                {continuity.totalActiveDays}{' '}
                <span className="text-[13px] font-normal text-[var(--ink-3)]">天</span>
              </div>
            </div>
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
                  aria-label={`${day.dateKey}${day.isActive ? ' 已留痕' : ' 休息'}`}
                  className={cn(
                    'block h-6 w-full rounded-[6px] border transition-colors',
                    day.isActive
                      ? 'border-[var(--growth-border)] bg-[var(--growth)]'
                      : 'border-[var(--line)] bg-[var(--surface-plate)]',
                    day.isToday && 'ring-2 ring-[var(--dawn)]'
                  )}
                />
              </Tooltip>
            ))}
          </div>

          <p className="m-0 text-[12px] text-[var(--ink-3)]">正向累积，断更不清零、不掉级</p>
        </Card>
      </div>
    </div>
  );
}
