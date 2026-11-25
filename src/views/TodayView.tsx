import { useState } from 'preact/hooks';
import { IconArrowRight, IconCheck, IconChevron, IconSprout } from '../components/Icons';
import { RichText } from '../components/RichText';
import type { PlatformContentBundle } from '../core/contentLoader';
import {
  computeContinuityFootprint,
  detectCurrentEnergyBand,
  ENERGY_SLOTS,
  getEffectiveDailyProgress,
  getGreetingByHour,
} from '../core/scheduler';
import type {
  BranchCatalog,
  DailyPlanSnapshot,
  EnergyBand,
  ScheduledTaskItem,
  TelemetrySnapshot,
} from '../types/schema';

interface TodayViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  plan: DailyPlanSnapshot;
  onToggleLowBattery: (enabled: boolean) => void;
  onToggleTipAck: (ack: boolean) => void;
  onToggleTask: (task: ScheduledTaskItem) => void;
}

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
      accentToken: '#266D7E',
    }
  );
}

export function TodayView({
  content,
  telemetry,
  plan,
  onToggleLowBattery,
  onToggleTipAck,
  onToggleTask,
}: TodayViewProps) {
  const currentBand = detectCurrentEnergyBand();
  const [expandedSlots, setExpandedSlots] = useState<Record<EnergyBand, boolean>>({
    fragment: currentBand === 'fragment',
    peak: currentBand === 'peak',
    low: currentBand === 'low',
  });
  const [showCollapsedTip, setShowCollapsedTip] = useState(false);

  const progress = getEffectiveDailyProgress(plan);
  const continuity = computeContinuityFootprint(telemetry.activeDates, plan.dateKey);
  const dailyTip =
    content.dailyTips.find((t) => t.id === plan.dailyTipId) ?? content.dailyTips[0];
  const tipBranch = getBranchMeta(content.catalog.branches, dailyTip.branchId);

  const currentSlotMeta =
    ENERGY_SLOTS.find((s) => s.band === currentBand) ?? ENERGY_SLOTS[1];
  const otherSlots = ENERGY_SLOTS.filter((s) => s.band !== currentBand);

  const toggleSlotExpand = (band: EnergyBand) => {
    setExpandedSlots((prev) => ({ ...prev, [band]: !prev[band] }));
  };

  const progressPct =
    progress.totalActiveCount > 0
      ? Math.round((progress.completedActiveCount / progress.totalActiveCount) * 100)
      : 0;

  const renderTaskItem = (task: ScheduledTaskItem, isPrimaryFocal: boolean) => {
    const isExempted = plan.lowBatteryMode && !task.keepInLowBattery;
    const isChecked = plan.completedTaskIds.includes(task.id);
    const branch = getBranchMeta(content.catalog.branches, task.branchId);
    const targetHref = task.unitId
      ? `#/unit/${task.unitId}`
      : task.kind === 'retest_review'
        ? '#/review?tab=retest'
        : '#/review?tab=cards';
    const actionText = task.unitId
      ? isPrimaryFocal
        ? '进入沉浸学习'
        : '打开单元'
      : task.kind === 'retest_review'
        ? '开始重测'
        : '去刷闪卡';

    return (
      <div
        key={task.id}
        class={`task-row ${isChecked ? 'is-done' : ''} ${isExempted ? 'is-exempted' : ''} ${
          isPrimaryFocal ? 'is-focal-row' : ''
        }`}
      >
        <label class="task-check-wrap" aria-label={`标记完成：${task.title}`}>
          <input
            type="checkbox"
            disabled={isExempted}
            checked={isChecked}
            onChange={() => onToggleTask(task)}
          />
          <span class="custom-checkbox" aria-hidden="true">
            {isChecked && <IconCheck size={13} />}
          </span>
        </label>

        <div class="task-body">
          <div class="task-meta-line">
            <span class="branch-dot-label">
              <span class="branch-dot" style={{ backgroundColor: branch.accentToken }} />
              <span>
                {task.branchId} {branch.name}
              </span>
            </span>
            <span class="meta-sep">/</span>
            <span class="task-minutes tabular-num">约 {task.estimatedMinutes} 分钟</span>
            {isExempted && <span class="status-chip chip-muted">今日保底已豁免</span>}
          </div>
          <div class="task-title">{task.title}</div>
          <div class="task-hint">
            <RichText text={task.humanHint} />
          </div>
        </div>

        {!isExempted && (
          <a
            href={targetHref}
            class={`btn ${isPrimaryFocal && !isChecked ? 'btn-primary' : 'btn-subtle'} task-action-link`}
          >
            <span>{actionText}</span>
            <IconArrowRight size={14} />
          </a>
        )}
      </div>
    );
  };

  const currentSlotTasks = plan.tasks.filter((t) => t.slot === currentSlotMeta.band);
  const currentActiveTasks = plan.lowBatteryMode
    ? currentSlotTasks.filter((t) => t.keepInLowBattery)
    : currentSlotTasks;
  const currentDoneCount = currentActiveTasks.filter((t) =>
    plan.completedTaskIds.includes(t.id)
  ).length;

  return (
    <div class="today-workspace">
      {/* 顶部无框简报条 */}
      <header class="today-status-bar" aria-label="今日节律简报">
        <div class="today-header-left">
          <div class="today-date-meta">
            <span class="tabular-num">{formatReadableDate(plan.dateKey)}</span>
            <span class="meta-sep">/</span>
            <span class="tabular-num">
              预计 {progress.totalEstimatedMinutes} 分钟 · 已完成 {progress.completedActiveCount}/
              {progress.totalActiveCount}
            </span>
          </div>
          <h1 class="today-greeting">{getGreetingByHour()}</h1>
          <p class="today-rhythm-note">
            {plan.lowBatteryMode
              ? '已切换保底节律：保留最小轻量项，做完即收工，绝不留心理负担。'
              : '今日清单固定上限，做完即停、不追加新题；昨日未完成项已自动翻篇。'}
          </p>
        </div>

        <div class="today-header-right">
          <label class={`toggle-pill low-battery-toggle ${plan.lowBatteryMode ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              checked={plan.lowBatteryMode}
              onChange={(e) => onToggleLowBattery((e.target as HTMLInputElement).checked)}
            />
            <span class="toggle-track" aria-hidden="true">
              <span class="toggle-thumb" />
            </span>
            <span class="toggle-label">今天有点累 · 切保底版</span>
          </label>
          <div class="today-progress-inline" aria-label={`今日完成度 ${progressPct}%`}>
            <div class="slim-bar-track">
              <div class="slim-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span class="tabular-num">{progressPct}%</span>
          </div>
        </div>
      </header>

      {/* 全部完成收工态 */}
      {progress.isAllDone && (
        <section class="wrap-up-card" aria-live="polite">
          <div class="wrap-up-icon-wrap">
            <IconSprout size={26} />
          </div>
          <div>
            <h2 class="wrap-up-title">今日已收工 · 去过生活吧</h2>
            <p class="wrap-up-desc">
              {plan.lowBatteryMode
                ? '保底清单已稳稳落地，低电量日守住节律就是胜利。平台今天不再追加任何任务。'
                : '今天排定的任务已全部清空，平台绝不临时加题。合上页面去运动、吃饭或休息吧。'}
            </p>
          </div>
        </section>
      )}

      {/* 8 : 4 非对称主内容双栏 */}
      <div class="today-asymmetric-grid">
        {/* 左主栏（66%）：此刻优先聚焦卡 + 其余两时段轻量时间轴 */}
        <div class="today-primary-col">
          <section class="now-focus-card" aria-label={`当前优先时段：${currentSlotMeta.title}`}>
            <div class="now-focus-head">
              <div>
                <div class="now-focus-badge-row">
                  <span class="focal-signal-pill">此刻优先</span>
                  <span class="slot-time-hint">{currentSlotMeta.timeHint}</span>
                </div>
                <h2 class="now-focus-title">{currentSlotMeta.title}</h2>
                <p class="slot-desc">{currentSlotMeta.rhythmDesc}</p>
              </div>
              <span class="status-chip tabular-num">
                {currentActiveTasks.length === 0
                  ? '保底已豁免'
                  : `${currentDoneCount} / ${currentActiveTasks.length} 完成`}
              </span>
            </div>

            <div class="focal-tasks-list">
              {currentSlotTasks.map((task) => renderTaskItem(task, true))}
            </div>
          </section>

          {/* 其余两个时段：无嵌套卡片的轻时间轴列表 */}
          <section class="other-slots-timeline" aria-label="今日其他精力时段">
            <div class="timeline-section-label">今日其余时段安排</div>
            {otherSlots.map((slotMeta) => {
              const slotTasks = plan.tasks.filter((t) => t.slot === slotMeta.band);
              const isExpanded = expandedSlots[slotMeta.band];
              const slotActiveTasks = plan.lowBatteryMode
                ? slotTasks.filter((t) => t.keepInLowBattery)
                : slotTasks;
              const slotDoneCount = slotActiveTasks.filter((t) =>
                plan.completedTaskIds.includes(t.id)
              ).length;

              return (
                <div key={slotMeta.band} class="timeline-slot-block">
                  <button
                    type="button"
                    class="timeline-slot-trigger"
                    aria-expanded={isExpanded}
                    onClick={() => toggleSlotExpand(slotMeta.band)}
                  >
                    <div class="timeline-slot-left">
                      <span class="timeline-node-dot" />
                      <div>
                        <div class="timeline-slot-title-line">
                          <span class="timeline-slot-title">{slotMeta.title}</span>
                          <span class="slot-time-hint">{slotMeta.timeHint}</span>
                        </div>
                        <div class="timeline-slot-sub">{slotMeta.rhythmDesc}</div>
                      </div>
                    </div>
                    <div class="timeline-slot-right">
                      <span class="status-chip tabular-num">
                        {slotActiveTasks.length === 0
                          ? '已豁免'
                          : `${slotDoneCount}/${slotActiveTasks.length}`}
                      </span>
                      <IconChevron
                        size={16}
                        class={`chevron-rotate ${isExpanded ? 'is-open' : ''}`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div class="timeline-slot-body">
                      {slotTasks.map((task) => renderTaskItem(task, false))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>

        {/* 右辅栏（34%）：每日生活一招便签 + 7×2 累计点亮成长卡 */}
        <aside class="today-aside-col">
          {!plan.tipAcknowledged ? (
            <section class="daily-tip-card" aria-label="每日生活一招">
              <div class="daily-tip-top">
                <span class="branch-dot-label">
                  <span class="branch-dot" style={{ backgroundColor: tipBranch.accentToken }} />
                  <span>每日一招 · {dailyTip.readSeconds} 秒</span>
                </span>
                <button
                  type="button"
                  class="btn btn-sm tip-ack-btn"
                  onClick={() => onToggleTipAck(true)}
                >
                  记下了
                </button>
              </div>
              <h2 class="daily-tip-title">{dailyTip.title}</h2>
              <p class="daily-tip-body">
                <RichText text={dailyTip.tipBody} />
              </p>
              {dailyTip.actionHint && (
                <div class="daily-tip-hint">
                  <strong>顺手一试：</strong>
                  {dailyTip.actionHint}
                </div>
              )}
              <div class="daily-tip-source">
                {dailyTip.sourceOrg} · {dailyTip.fetchedAt}
              </div>
            </section>
          ) : (
            <section class="daily-tip-collapsed" aria-label="已收起的每日生活一招">
              <div class="daily-tip-collapsed-head">
                <span class="tip-done-label">
                  <IconCheck size={14} /> 今日一招已记下
                </span>
                <div class="tip-collapsed-actions">
                  <button
                    type="button"
                    class="text-link-btn"
                    onClick={() => setShowCollapsedTip((v) => !v)}
                  >
                    {showCollapsedTip ? '收起' : '再看一眼'}
                  </button>
                  <button
                    type="button"
                    class="text-link-btn"
                    onClick={() => onToggleTipAck(false)}
                  >
                    展开
                  </button>
                </div>
              </div>
              <div class="daily-tip-collapsed-title">{dailyTip.title}</div>
              {showCollapsedTip && (
                <p class="daily-tip-body" style={{ marginTop: '8px', marginBottom: 0 }}>
                  {dailyTip.tipBody}
                </p>
              )}
            </section>
          )}

          <section class="continuity-aside-card" aria-label="累计点亮成长足迹">
            <div class="continuity-head">
              <div>
                <div class="continuity-label">累计点亮</div>
                <div class="continuity-big-num tabular-num">
                  {continuity.totalActiveDays} <span>天</span>
                </div>
              </div>
              <span class="continuity-icon-badge">
                <IconSprout size={20} />
              </span>
            </div>
            <div class="footprint-grid-14" aria-label="近 14 天活跃足迹">
              {continuity.recent14Days.map((day) => (
                <span
                  key={day.dateKey}
                  class={`footprint-cell ${day.isActive ? 'is-active' : ''} ${
                    day.isToday ? 'is-today' : ''
                  }`}
                  title={`${day.dateKey}${day.isActive ? ' · 已留痕' : ' · 休息'}`}
                />
              ))}
            </div>
            <p class="continuity-note">正向累积，断更不清零、不掉级，按自己的节律往前走。</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
