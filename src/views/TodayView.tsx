import { useState } from 'preact/hooks';
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
      accentToken: '#3D7A8A',
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
    fragment: true,
    peak: true,
    low: true,
  });
  const [showCollapsedTip, setShowCollapsedTip] = useState(false);

  const progress = getEffectiveDailyProgress(plan);
  const continuity = computeContinuityFootprint(telemetry.activeDates, plan.dateKey);
  const dailyTip =
    content.dailyTips.find((t) => t.id === plan.dailyTipId) ?? content.dailyTips[0];
  const tipBranch = getBranchMeta(content.catalog.branches, dailyTip.branchId);

  const toggleSlotExpand = (band: EnergyBand) => {
    setExpandedSlots((prev) => ({ ...prev, [band]: !prev[band] }));
  };

  return (
    <div class="today-container">
      {/* 页头状态条：问候语 + 日期 + 累计点亮小树苗 + 保底版拨杆 */}
      <section class="today-status-bar" aria-label="今日节律与保底状态条">
        <div>
          <div class="today-date-row">
            <span class="today-date-text">{formatReadableDate(plan.dateKey)}</span>
            <span class="badge-pill">
              今日预计 {progress.totalEstimatedMinutes} 分钟 · 已完成 {progress.completedActiveCount}/
              {progress.totalActiveCount}
            </span>
          </div>
          <h1 class="today-greeting">{getGreetingByHour()}</h1>
          <p class="today-rhythm-note">
            {plan.lowBatteryMode
              ? '今天实验或事情累了就按保底版走，翻几张卡、看一段小故事就安心收工，不留心理负担。'
              : '当日清单固定上限，做完即停、不追加新题；昨天没做完的已自动翻篇，绝不补账。'}
          </p>
        </div>

        <div class="today-controls-col">
          <div class="sapling-continuity-card" title="累计活跃天数，断更不清零、不掉级">
            <div class="sapling-title">
              <span aria-hidden="true">🌱</span> 累计点亮 <strong>{continuity.totalActiveDays}</strong> 天
            </div>
            <div class="footprint-dots" aria-label="近 14 天活跃足迹">
              {continuity.recent14Days.map((day) => (
                <span
                  key={day.dateKey}
                  class={`footprint-dot ${day.isActive ? 'is-active' : ''} ${day.isToday ? 'is-today' : ''}`}
                  title={`${day.dateKey}${day.isActive ? ' · 已留痕' : ' · 休息'}`}
                />
              ))}
            </div>
          </div>

          <label class={`low-battery-toggle ${plan.lowBatteryMode ? 'is-on' : ''}`}>
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
        </div>
      </section>

      {/* 全部完成收工态：做完即停 */}
      {progress.isAllDone && (
        <section class="wrap-up-card" aria-live="polite">
          <svg
            width="52"
            height="52"
            viewBox="0 0 56 56"
            fill="none"
            aria-hidden="true"
            class="wrap-up-svg"
          >
            <circle cx="28" cy="28" r="26" fill="#EDF4F0" stroke="#4E8268" stroke-width="1.5" />
            <path d="M28 42V22" stroke="#4E8268" stroke-width="2.5" stroke-linecap="round" />
            <path
              d="M28 28C21 28 17 23 18 17C24 17 28 21 28 28Z"
              fill="#6BA386"
              stroke="#4E8268"
              stroke-width="1.5"
            />
            <path
              d="M28 24C35 24 39 19 38 13C32 13 28 17 28 24Z"
              fill="#86B99E"
              stroke="#4E8268"
              stroke-width="1.5"
            />
          </svg>
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

      {/* 每日生活一招：未读时置顶展示浅米黄信笺横卡，点「记下了」后收起置底 */}
      {!plan.tipAcknowledged && (
        <section class="daily-tip-card" aria-label="每日生活一招">
          <div class="daily-tip-top">
            <div class="daily-tip-tags">
              <span class="tip-eyebrow">每日生活一招 · {dailyTip.readSeconds} 秒读完</span>
              <span
                class="branch-tag"
                style={{ backgroundColor: tipBranch.accentToken, marginBottom: 0 }}
              >
                {dailyTip.branchId} · {tipBranch.name}
              </span>
              {dailyTip.isPlaceholder && (
                <span class="badge-pill badge-demo">示例占位</span>
              )}
            </div>
            <button
              type="button"
              class="btn-primary btn-sm"
              onClick={() => onToggleTipAck(true)}
            >
              记下了
            </button>
          </div>
          <h2 class="daily-tip-title">{dailyTip.title}</h2>
          <p class="daily-tip-body">{dailyTip.tipBody}</p>
          {dailyTip.actionHint && (
            <div class="daily-tip-hint">顺手一试：{dailyTip.actionHint}</div>
          )}
          <div class="daily-tip-source">
            来源：{dailyTip.sourceOrg} · 抓取于 {dailyTip.fetchedAt}
          </div>
        </section>
      )}

      {/* 三时段精力流卡片 */}
      <div class="slots-stack">
        {ENERGY_SLOTS.map((slotMeta) => {
          const slotTasks = plan.tasks.filter((t) => t.slot === slotMeta.band);
          const isCurrentBand = currentBand === slotMeta.band;
          const isExpanded = expandedSlots[slotMeta.band];
          const slotActiveTasks = plan.lowBatteryMode
            ? slotTasks.filter((t) => t.keepInLowBattery)
            : slotTasks;
          const slotDoneCount = slotActiveTasks.filter((t) =>
            plan.completedTaskIds.includes(t.id)
          ).length;

          return (
            <section
              key={slotMeta.band}
              class={`slot-card ${isCurrentBand ? 'is-current-band' : ''}`}
              aria-label={slotMeta.title}
            >
              <header
                class="slot-card-header"
                onClick={() => toggleSlotExpand(slotMeta.band)}
              >
                <div>
                  <div class="slot-title-row">
                    <h2 class="slot-title">{slotMeta.title}</h2>
                    {isCurrentBand && (
                      <span class="current-band-pill">当前时段</span>
                    )}
                    <span class="slot-time-hint">{slotMeta.timeHint}</span>
                  </div>
                  <p class="slot-desc">{slotMeta.rhythmDesc}</p>
                </div>
                <div class="slot-header-right">
                  <span class="badge-pill">
                    {slotActiveTasks.length === 0
                      ? '保底版已豁免'
                      : `${slotDoneCount} / ${slotActiveTasks.length} 完成`}
                  </span>
                  <button
                    type="button"
                    class="slot-collapse-btn"
                    aria-expanded={isExpanded}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSlotExpand(slotMeta.band);
                    }}
                  >
                    {isExpanded ? '收起' : '展开'}
                  </button>
                </div>
              </header>

              {isExpanded && (
                <div class="slot-tasks-list">
                  {slotTasks.map((task) => {
                    const isExempted = plan.lowBatteryMode && !task.keepInLowBattery;
                    const isChecked = plan.completedTaskIds.includes(task.id);
                    const branch = getBranchMeta(content.catalog.branches, task.branchId);

                    return (
                      <div
                        key={task.id}
                        class={`task-row ${isChecked ? 'is-done' : ''} ${
                          isExempted ? 'is-exempted' : ''
                        } ${task.isPlaceholder ? 'is-placeholder-dashed' : ''}`}
                      >
                        <label class="task-check-wrap">
                          <input
                            type="checkbox"
                            disabled={isExempted}
                            checked={isChecked}
                            onChange={() => onToggleTask(task)}
                          />
                          <span class="custom-checkbox" aria-hidden="true">
                            {isChecked ? '✓' : ''}
                          </span>
                        </label>

                        <div class="task-body">
                          <div class="task-meta-line">
                            <span
                              class="branch-tag"
                              style={{ backgroundColor: branch.accentToken, marginBottom: 0 }}
                            >
                              {task.branchId} · {branch.name}
                            </span>
                            <span class="task-minutes">约 {task.estimatedMinutes} 分钟</span>
                            {task.isPlaceholder && (
                              <span class="badge-pill badge-demo">示例占位</span>
                            )}
                            {isExempted && (
                              <span class="exempt-tag">今日保底已豁免 · 留待精力好时再做</span>
                            )}
                          </div>
                          <div class="task-title">{task.title}</div>
                          <div class="task-hint">{task.humanHint}</div>
                        </div>
                        {task.unitId && !isExempted && (
                          <a
                            href={`#/unit/${task.unitId}`}
                            class="site-nav-link is-active task-action-link"
                          >
                            打开单元 →
                          </a>
                        )}
                        {!task.unitId && !isExempted && (
                          <a
                            href={
                              task.kind === 'retest_review'
                                ? '#/review?tab=retest'
                                : '#/review?tab=cards'
                            }
                            class="site-nav-link is-active task-action-link"
                          >
                            {task.kind === 'retest_review' ? '去重测 →' : '去刷卡 →'}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* 已读后的每日生活一招温和折叠置底 */}
      {plan.tipAcknowledged && (
        <section class="daily-tip-collapsed" aria-label="已收起的每日生活一招">
          <div class="daily-tip-collapsed-bar">
            <span>
              ✓ 今日生活一招已记下：<strong>{dailyTip.title}</strong>
            </span>
            <div class="btn-row">
              <button
                type="button"
                class="btn-sm"
                onClick={() => setShowCollapsedTip((v) => !v)}
              >
                {showCollapsedTip ? '收起内容' : '再看一眼'}
              </button>
              <button
                type="button"
                class="btn-sm"
                onClick={() => onToggleTipAck(false)}
              >
                放回顶部
              </button>
            </div>
          </div>
          {showCollapsedTip && (
            <p class="daily-tip-body" style={{ marginTop: '10px', marginBottom: 0 }}>
              {dailyTip.tipBody}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
