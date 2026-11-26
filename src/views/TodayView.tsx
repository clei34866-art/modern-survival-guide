import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { RichText } from '@/components/RichText';
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
      accentToken: '#3b82f6',
    }
  );
}

export function TodayView({
  content,
  telemetry,
  plan,
  onToggleTipAck,
  onToggleTask,
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

  // 左侧主线焦点任务：优先取当前所选时段第一个未完成项，其次全天第一个未完成项，否则展示当前时段首项
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
      {/* 顶部节律简报条（克制精工，零问候套话、零保底开关） */}
      <header
        className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5"
        aria-label="今日节律简报"
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-3)]">
            <span className="font-mono-num">{formatReadableDate(plan.dateKey)}</span>
            <span>·</span>
            <span className="font-mono-num">
              今日定额 {totalCount} 项 · 约 {totalMinutes} 分钟
            </span>
          </div>
          <h1 className="m-0 text-[26px] sm:text-[30px] font-semibold leading-[1.2] tracking-[-0.025em] text-[var(--ink-1)]">
            今日学习主线
          </h1>
          <p className="m-0 text-[14px] text-[var(--ink-2)]">
            固定上限、做完即停、跨日自动翻篇不叠加旧账
          </p>
        </div>

        <div className="w-full sm:w-[240px] space-y-2" aria-label={`今日完成度 ${progressPct}%`}>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[var(--ink-2)]">当日推进</span>
            <strong className="font-mono-num font-semibold text-[var(--ink-1)]">
              {completedCount} / {totalCount} · {progressPct}%
            </strong>
          </div>
          <ProgressBar percent={progressPct} color="var(--growth)" />
        </div>
      </header>

      {/* 全部完成收工态 */}
      {isAllDone && (
        <section
          className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[var(--growth-border)] bg-[var(--growth-soft)] px-5 py-4"
          aria-live="polite"
        >
          <CheckCircle2 size={22} strokeWidth={1.6} className="shrink-0 text-[var(--growth)]" />
          <div className="space-y-0.5">
            <h2 className="m-0 text-[16px] font-semibold text-[var(--ink-1)]">
              今日定额已全部完成
            </h2>
            <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
              平台今天不再追加新任务，合上页面去运动、吃饭或休息
            </p>
          </div>
        </section>
      )}

      {/* 60 / 40 非对称主线 Hero：左当前焦点互动任务 + 右三时段节律队列 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.42fr)_minmax(0,1fr)] lg:items-stretch">
        {/* 左 60%：主线焦点任务卡 */}
        {focalTask && focalBranch && (
          <Card
            className="flex flex-col justify-between gap-6 p-6 sm:p-7"
            aria-label="此刻焦点任务"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">
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
                  <span className="inline-flex items-center gap-1 font-mono-num text-[12.5px] text-[var(--ink-3)]">
                    <Clock size={13} strokeWidth={1.5} />约 {focalTask.estimatedMinutes} 分钟
                  </span>
                </div>
                {focalDone && <Badge tone="growth">已完成</Badge>}
              </div>

              <div className="space-y-2.5">
                <h2 className="m-0 text-[22px] sm:text-[26px] font-semibold leading-[1.3] tracking-[-0.02em] text-[var(--ink-1)]">
                  {focalTask.title}
                </h2>
                <p className="m-0 text-[15px] leading-[1.7] text-[var(--ink-2)]">
                  <RichText text={focalTask.humanHint} />
                </p>
              </div>

              {focalTask.unitId && (
                <div className="v3-card-raised p-3.5">
                  <div className="mb-2 text-[12px] font-medium text-[var(--ink-3)]">
                    七步互动学习闭环
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {['1 场景', '2 预测', '3 实验室', '4 闪卡', '5 自测', '6 行动'].map(
                      (stepText) => (
                        <div
                          key={stepText}
                          className="rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-center font-mono-num text-[11.5px] text-[var(--ink-2)]"
                        >
                          {stepText}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
              <a
                href={focalHref}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] bg-[var(--accent)] px-5 py-2.5 text-[14.5px] font-medium text-white no-underline transition-colors hover:bg-[var(--accent-hover)]"
              >
                <span>
                  {focalTask.unitId
                    ? '进入互动实验室'
                    : focalTask.kind === 'retest_review'
                      ? '开始间隔重测'
                      : '打开 3D 闪卡台'}
                </span>
                <ArrowRight size={15} strokeWidth={1.6} />
              </a>

              <Button
                variant={focalDone ? 'subtle' : 'outline'}
                size="lg"
                onClick={() => onToggleTask(focalTask)}
              >
                <Check size={15} strokeWidth={1.7} />
                <span>{focalDone ? '已勾选完成' : '标记这项完成'}</span>
              </Button>
            </div>
          </Card>
        )}

        {/* 右 40%：三时段交互节律切换台 */}
        <Card className="flex flex-col justify-between gap-4 p-5" aria-label="今日三时段任务排期">
          <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-1" role="tablist" aria-label="精力时段切换">
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
                    'flex min-h-[40px] cursor-pointer flex-col items-center justify-center rounded-[7px] px-2 py-1.5 text-center transition-colors',
                    isSelected
                      ? 'bg-[var(--surface)] text-[var(--ink-1)] border border-[var(--line-strong)]'
                      : 'border border-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  )}
                >
                  <span className="text-[12.5px] font-medium leading-tight">
                    {BAND_SHORT[slot.band]}
                  </span>
                  <span className="mt-0.5 font-mono-num text-[11px] opacity-80">
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
                    'flex items-start gap-3 py-3.5 first:pt-3 last:pb-1',
                    isChecked && 'opacity-65'
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    aria-label={`标记完成：${task.title}`}
                    onClick={() => onToggleTask(task)}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors',
                      isChecked
                        ? 'border-[var(--growth)] bg-[var(--growth)] text-[#081510]'
                        : 'border-[var(--line-strong)] bg-[var(--surface-raised)] hover:border-[var(--accent)]'
                    )}
                  >
                    {isChecked && <Check size={13} strokeWidth={2.4} />}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-3)]">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: bMeta.accentToken }}
                      />
                      <span>
                        {task.branchId} {bMeta.name}
                      </span>
                      <span>·</span>
                      <span className="font-mono-num">{task.estimatedMinutes}m</span>
                    </div>
                    <div
                      className={cn(
                        'text-[14.5px] font-medium leading-[1.45] text-[var(--ink-1)]',
                        isChecked && 'line-through'
                      )}
                    >
                      {task.title}
                    </div>
                  </div>

                  <a
                    href={href}
                    aria-label={`前往：${task.title}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-2)] no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <ArrowRight size={14} strokeWidth={1.6} />
                  </a>
                </div>
              );
            })}
          </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3.5 text-[12.5px]">
            <span className="font-mono-num text-[var(--ink-3)]">
              全站 {content.catalog.branches.length} 分支 · {content.units.length} 节互动课已开放
            </span>
            <a
              href="#/branches"
              className="inline-flex items-center gap-1 font-medium text-[var(--accent)] no-underline hover:underline"
            >
              <span>浏览星图</span>
              <ArrowRight size={13} strokeWidth={1.6} />
            </a>
          </div>
        </Card>
      </div>

      {/* 底部三列均衡信息带：每日 20 秒一招 + 1/3/7 天重测队列 + 14 日点亮矩阵 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
        {/* 列 1：每日生活一招 */}
        <Card className="space-y-3 p-5" aria-label="每日生活一招">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--ink-1)]">
              <Lightbulb size={15} strokeWidth={1.5} className="text-[var(--warning)]" />
              <span>每日一招 · {dailyTip.readSeconds} 秒</span>
            </div>
            {!plan.tipAcknowledged ? (
              <Button size="sm" variant="subtle" onClick={() => onToggleTipAck(true)}>
                记下了
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCollapsedTip((v) => !v)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-[var(--accent)] hover:underline"
                >
                  {showCollapsedTip ? '收起' : '再看一眼'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTipAck(false)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
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

          <h3 className="m-0 text-[16px] font-semibold leading-[1.4] text-[var(--ink-1)]">
            {dailyTip.title}
          </h3>

          {(!plan.tipAcknowledged || showCollapsedTip) && (
            <>
              <p className="m-0 text-[13.5px] leading-[1.65] text-[var(--ink-2)]">
                <RichText text={dailyTip.tipBody} />
              </p>
              {dailyTip.actionHint && (
                <div className="v3-card-raised px-3 py-2 text-[12.5px] leading-[1.6] text-[var(--ink-2)]">
                  <strong className="font-medium text-[var(--ink-1)]">顺手一试：</strong>
                  {dailyTip.actionHint}
                </div>
              )}
              <div className="font-mono-num text-[11.5px] text-[var(--ink-3)]">
                {dailyTip.sourceOrg} · {dailyTip.fetchedAt}
              </div>
            </>
          )}
        </Card>

        {/* 列 2：1/3/7 天重测与闪卡队列 */}
        <Card className="space-y-3.5 p-5" aria-label="间隔重测与闪卡状态">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--ink-1)]">
              <Layers size={15} strokeWidth={1.5} className="text-[var(--accent)]" />
              <span>1 / 3 / 7 天间隔重测</span>
            </div>
            <Badge tone={retestQueue.dueItems.length > 0 ? 'warning' : 'growth'}>
              到期 {retestQueue.dueItems.length}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="v3-card-raised p-3">
              <div className="text-[11.5px] text-[var(--ink-3)]">待重测项</div>
              <strong className="mt-0.5 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
                {retestQueue.dueItems.length + retestQueue.upcomingItems.length}
              </strong>
            </div>
            <div className="v3-card-raised p-3">
              <div className="text-[11.5px] text-[var(--ink-3)]">图谱概念卡</div>
              <strong className="mt-0.5 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
                {content.knowledgeGraph.nodes.length}
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href="#/review?tab=retest"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-[13px] font-medium text-[var(--ink-1)] no-underline hover:border-[var(--accent)]"
            >
              <span>重测队列</span>
              <ArrowRight size={13} strokeWidth={1.5} />
            </a>
            <a
              href="#/review?tab=cards"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-[var(--line)] bg-transparent px-3 text-[13px] font-medium text-[var(--ink-2)] no-underline hover:text-[var(--ink-1)]"
            >
              <span>3D 刷卡台</span>
            </a>
          </div>
        </Card>

        {/* 列 3：14 日点亮矩阵 */}
        <Card className="space-y-3.5 p-5" aria-label="累计点亮成长足迹">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[12.5px] text-[var(--ink-3)]">累计点亮</div>
              <div className="font-mono-num text-[28px] font-semibold leading-tight text-[var(--ink-1)]">
                {continuity.totalActiveDays}{' '}
                <span className="text-[13px] font-normal text-[var(--ink-3)]">天</span>
              </div>
            </div>
            <Badge tone="neutral">连学 {consecutiveDays} 天</Badge>
          </div>

          <div
            className="grid grid-cols-7 gap-1.5"
            aria-label="近 14 天活跃足迹"
          >
            {continuity.recent14Days.map((day) => (
              <span
                key={day.dateKey}
                title={`${day.dateKey}${day.isActive ? ' · 已留痕' : ' · 休息'}`}
                className={cn(
                  'h-6 rounded-[5px] border transition-colors',
                  day.isActive
                    ? 'border-[var(--growth-border)] bg-[var(--growth)]'
                    : 'border-[var(--line)] bg-[var(--surface-raised)]',
                  day.isToday && 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)]'
                )}
              />
            ))}
          </div>

          <p className="m-0 text-[12.5px] text-[var(--ink-3)]">
            正向累积，断更不清零、不掉级
          </p>
        </Card>
      </div>
    </div>
  );
}
