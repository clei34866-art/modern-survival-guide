import type { PlatformContentBundle } from './contentLoader';
import { addDaysToDateKey, getLocalDateKey } from './db';
import type {
  DailyLifeTip,
  DailyPlanSnapshot,
  EnergyBand,
  LearningUnit,
  ScheduledTaskItem,
  TelemetrySnapshot,
} from '../types/schema';

export interface EnergySlotMeta {
  band: EnergyBand;
  title: string;
  timeHint: string;
  rhythmDesc: string;
}

export const ENERGY_SLOTS: EnergySlotMeta[] = [
  {
    band: 'fragment',
    title: '早间 / 碎片时段',
    timeHint: '起床后 · 通勤 · 课间排队',
    rhythmDesc: '顺手翻几张概念卡、读一段真实场景导读，热身不费脑。',
  },
  {
    band: 'peak',
    title: '晚饭后、实验前（高精力）',
    timeHint: '头脑最清醒的整块时间',
    rhythmDesc: '集中攻克一节新内容或推进一项实战行动任务，啃完就收。',
  },
  {
    band: 'low',
    title: '实验后（低精力）',
    timeHint: '从实验室回来 · 睡前放松',
    rhythmDesc: '绝不排新难点，只做 1/3/7 天错题温习或轻翻熟卡。',
  },
];

/** 按本地小时推断当前所处生活精力时段 */
export function detectCurrentEnergyBand(date = new Date()): EnergyBand {
  const hour = date.getHours();
  if (hour >= 5 && hour < 17) return 'fragment';
  if (hour >= 17 && hour < 21) return 'peak';
  return 'low';
}

export function getGreetingByHour(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return '早安，新的一天慢慢来';
  if (hour >= 11 && hour < 14) return '午间好，吃完饭歇口气';
  if (hour >= 14 && hour < 17) return '下午好，碎片间隙顺手翻两页';
  if (hour >= 17 && hour < 21) return '晚饭后黄金时段，挑最重要的一件做完就好';
  return '实验辛苦了，今晚只做轻温习，早点休息';
}

function hashDateKey(dateKey: string): number {
  let h = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function pickDailyTip(tips: DailyLifeTip[], dateKey: string): DailyLifeTip {
  const idx = hashDateKey(dateKey) % tips.length;
  return tips[idx];
}

function pickCrossBranchUnits(
  units: LearningUnit[],
  telemetry: TelemetrySnapshot,
  dateKey: string
): { previewUnit: LearningUnit; peakUnit: LearningUnit } {
  const uncleared = units.filter((u) => !telemetry.unitSubmissions[u.id]?.isCleared);
  const pool = uncleared.length > 0 ? uncleared : units;

  const fragmentCandidates = pool.filter((u) => u.recommendedEnergy === 'fragment');
  const peakCandidates = pool.filter((u) => u.recommendedEnergy === 'peak');

  const seed = hashDateKey(dateKey);
  const previewUnit =
    fragmentCandidates.length > 0
      ? fragmentCandidates[seed % fragmentCandidates.length]
      : pool[seed % pool.length];

  const remainingPeak = peakCandidates.filter((u) => u.id !== previewUnit.id);
  const fallbackPool = pool.filter((u) => u.id !== previewUnit.id);
  const peakUnit =
    remainingPeak.length > 0
      ? remainingPeak[seed % remainingPeak.length]
      : fallbackPool.length > 0
        ? fallbackPool[seed % fallbackPool.length]
        : previewUnit;

  return { previewUnit, peakUnit };
}

/**
 * 生成当日静态任务快照：
 * - 每日定额上限（早间 2 轻项 + 晚饭后 1 核心项 + 实验后 1 轻温习 = 最多 4 项）
 * - 生成后即冻结在 currentDailyPlan，当天不追加，隔日直接按新日期重新生成（不补昨日欠账）
 */
export function buildDailyPlanSnapshot(
  dateKey: string,
  content: PlatformContentBundle,
  telemetry: TelemetrySnapshot
): DailyPlanSnapshot {
  const seed = hashDateKey(dateKey);
  const tip = pickDailyTip(content.dailyTips, dateKey);
  const { previewUnit, peakUnit } = pickCrossBranchUnits(content.units, telemetry, dateKey);

  // 跨分支抽取 2～3 张概念卡用于早间碎片唤醒
  const nodes = content.knowledgeGraph.nodes;
  const startIdx = seed % nodes.length;
  const flashConcepts = [
    nodes[startIdx],
    nodes[(startIdx + 2) % nodes.length],
    nodes[(startIdx + 4) % nodes.length],
  ].filter((n, idx, arr) => arr.findIndex((x) => x.id === n.id) === idx);

  const primaryFlashBranch = flashConcepts[0]?.branchId ?? 'B1';
  const primaryBranchTrack =
    content.catalog.branches.find((b) => b.id === primaryFlashBranch)?.tracks[0]?.id ?? 'b1-ai-l1';

  const tasks: ScheduledTaskItem[] = [
    {
      id: `task-frag-cards-${dateKey}`,
      slot: 'fragment',
      kind: 'card_flash',
      branchId: primaryFlashBranch,
      trackId: primaryBranchTrack,
      conceptIds: flashConcepts.map((c) => c.id),
      title: `顺手翻 ${flashConcepts.length} 张跨分支概念闪卡`,
      humanHint: `涵盖「${flashConcepts.map((c) => c.label).join(' · ')}」，唤醒记忆通路。`,
      estimatedMinutes: 4,
      keepInLowBattery: true,
      isPlaceholder: false,
    },
    {
      id: `task-frag-preview-${dateKey}`,
      slot: 'fragment',
      kind: 'scenario_preview',
      branchId: previewUnit.branchId,
      trackId: previewUnit.trackId,
      unitId: previewUnit.id,
      title: `轻导读：${previewUnit.scenarioHook.sceneTitle}`,
      humanHint: `先看生活案例并猜一道反直觉预测题（来自 ${previewUnit.branchId} 分支）。`,
      estimatedMinutes: 6,
      keepInLowBattery: true,
      isPlaceholder: previewUnit.isPlaceholder,
    },
  ];

  // M7：若当前激活了跨分支生活事件包，高精力时段优先推入事件包跨分支任务
  const activePack = telemetry.activeEventPackId
    ? content.eventPacks?.find((p) => p.id === telemetry.activeEventPackId)
    : undefined;

  if (activePack) {
    const modWithUnit = activePack.modules.find(
      (m) => m.unitId && content.units.some((u) => u.id === m.unitId)
    );
    const leadMod = modWithUnit ?? activePack.modules[0];
    const linkedUnit = leadMod?.unitId
      ? content.units.find((u) => u.id === leadMod.unitId)
      : undefined;
    const branchSpan = activePack.modules.map((m) => m.branchId).join(' + ');

    tasks.push({
      id: `task-peak-event-${activePack.id}-${dateKey}`,
      slot: 'peak',
      kind: 'event_pack_step',
      branchId: leadMod.branchId,
      trackId:
        linkedUnit?.trackId ??
        content.catalog.branches.find((b) => b.id === leadMod.branchId)?.tracks[0]?.id ??
        'b1-ai-l1',
      unitId: linkedUnit?.id,
      title: `【事件包·${activePack.title}】${leadMod.roleTitle}`,
      humanHint: `跨分支联动（${branchSpan}）：${leadMod.actionGuide}`,
      estimatedMinutes: linkedUnit?.estimatedMinutes ?? 20,
      keepInLowBattery: false,
      isPlaceholder: linkedUnit?.isPlaceholder ?? false,
    });
  } else {
    tasks.push({
      id: `task-peak-core-${dateKey}`,
      slot: 'peak',
      kind: 'core_unit',
      branchId: peakUnit.branchId,
      trackId: peakUnit.trackId,
      unitId: peakUnit.id,
      title: `${peakUnit.title.replace(/^【示例占位】/, '')}`,
      humanHint: `完成图文导学 + 自测，顺手推进「${peakUnit.actionTask.title}」。`,
      estimatedMinutes: peakUnit.estimatedMinutes,
      keepInLowBattery: false,
      isPlaceholder: peakUnit.isPlaceholder,
    });
  }

  // 实验后（低精力）：优先排入到期或待重测的 1/3/7 天薄弱概念；若无则安排无压力轻回顾
  const dueRetestConcepts = Object.values(telemetry.cardStats).filter(
    (stat) =>
      typeof stat.retestStage === 'number' &&
      stat.retestStage > 0 &&
      (!stat.dueDate || stat.dueDate <= dateKey)
  );

  if (dueRetestConcepts.length > 0) {
    const dueIds = dueRetestConcepts.slice(0, 3).map((s) => s.conceptId);
    const dueLabels = dueIds
      .map((id) => nodes.find((n) => n.id === id)?.label ?? id)
      .join('、');
    const firstNode = nodes.find((n) => n.id === dueIds[0]);
    tasks.push({
      id: `task-low-retest-${dateKey}`,
      slot: 'low',
      kind: 'retest_review',
      branchId: firstNode?.branchId ?? 'B6',
      trackId:
        content.catalog.branches.find((b) => b.id === (firstNode?.branchId ?? 'B6'))?.tracks[0]
          ?.id ?? 'b6-main',
      conceptIds: dueIds,
      title: `1/3/7 天错题轻重测（${dueIds.length} 个薄弱点）`,
      humanHint: `温习「${dueLabels}」，不求快，看清上次卡在哪即可。`,
      estimatedMinutes: 8,
      keepInLowBattery: false,
      isPlaceholder: false,
    });
  } else {
    const recapNode = nodes[(seed + 1) % nodes.length];
    tasks.push({
      id: `task-low-recap-${dateKey}`,
      slot: 'low',
      kind: 'light_recap',
      branchId: recapNode.branchId,
      trackId:
        content.catalog.branches.find((b) => b.id === recapNode.branchId)?.tracks[0]?.id ??
        'b6-main',
      conceptIds: [recapNode.id],
      title: `睡前轻回顾：${recapNode.label}`,
      humanHint: `今天暂无到期错题，花 3 分钟瞄一眼「${recapNode.plainDefinition.slice(0, 26)}…」就收工。`,
      estimatedMinutes: 4,
      keepInLowBattery: false,
      isPlaceholder: false,
    });
  }

  return {
    dateKey,
    generatedAt: new Date().toISOString(),
    lowBatteryMode: false,
    dailyTipId: tip.id,
    tipAcknowledged: false,
    tasks,
    completedTaskIds: [],
  };
}

/** 确保获取今日快照（若跨天则自动翻篇生成新单，绝不累加昨日未完成项） */
export function ensureTodayPlanSnapshot(
  content: PlatformContentBundle,
  telemetry: TelemetrySnapshot,
  todayKey = getLocalDateKey()
): { plan: DailyPlanSnapshot; isNewlyGenerated: boolean } {
  const existing = telemetry.currentDailyPlan;
  if (existing && existing.dateKey === todayKey) {
    return { plan: existing, isNewlyGenerated: false };
  }
  return {
    plan: buildDailyPlanSnapshot(todayKey, content, telemetry),
    isNewlyGenerated: true,
  };
}

export interface EffectiveDailyProgress {
  activeTasks: ScheduledTaskItem[];
  exemptedTasks: ScheduledTaskItem[];
  completedActiveCount: number;
  totalActiveCount: number;
  totalEstimatedMinutes: number;
  isAllDone: boolean;
}

/** 计算当前模式（标准版 / 状态差保底版）下的有效任务与收工状态 */
export function getEffectiveDailyProgress(plan: DailyPlanSnapshot): EffectiveDailyProgress {
  const activeTasks = plan.lowBatteryMode
    ? plan.tasks.filter((t) => t.keepInLowBattery)
    : plan.tasks;
  const exemptedTasks = plan.lowBatteryMode
    ? plan.tasks.filter((t) => !t.keepInLowBattery)
    : [];

  const completedActiveCount = activeTasks.filter((t) =>
    plan.completedTaskIds.includes(t.id)
  ).length;
  const totalActiveCount = activeTasks.length;
  const totalEstimatedMinutes = activeTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);

  return {
    activeTasks,
    exemptedTasks,
    completedActiveCount,
    totalActiveCount,
    totalEstimatedMinutes,
    isAllDone: totalActiveCount > 0 && completedActiveCount === totalActiveCount,
  };
}

export interface ContinuityFootprint {
  totalActiveDays: number;
  recent14Days: Array<{
    dateKey: string;
    isActive: boolean;
    isToday: boolean;
  }>;
}

/** 无惩罚连续性展示：统计累计点亮天数与近 14 天温暖足迹，断更不归零、不扣分 */
export function computeContinuityFootprint(
  activeDates: string[],
  todayKey = getLocalDateKey()
): ContinuityFootprint {
  const activeSet = new Set(activeDates);
  const recent14Days: ContinuityFootprint['recent14Days'] = [];
  for (let offset = -13; offset <= 0; offset += 1) {
    const dk = addDaysToDateKey(todayKey, offset);
    recent14Days.push({
      dateKey: dk,
      isActive: activeSet.has(dk),
      isToday: offset === 0,
    });
  }
  return {
    totalActiveDays: activeSet.size,
    recent14Days,
  };
}

export interface WeeklyReviewSummary {
  windowStart: string;
  windowEnd: string;
  activeDaysInWeek: number;
  studyMinutesInWeek: number;
  clearedUnitTitles: string[];
  practicedConceptCount: number;
  completedActions: string[];
  activeExperimentBrief?: string;
  nextWeekSuggestion: string;
}

/** M7 简版每周生活复盘（周报）：自动聚合近 7 天学习与行动任务留痕并给出下周一条温和建议 */
export function computeWeeklyReviewSummary(
  content: PlatformContentBundle,
  telemetry: TelemetrySnapshot,
  todayKey = getLocalDateKey()
): WeeklyReviewSummary {
  const windowStart = addDaysToDateKey(todayKey, -6);
  const inWindow = (isoOrDate: string) => {
    const dk = isoOrDate.slice(0, 10);
    return dk >= windowStart && dk <= todayKey;
  };

  const activeDaysInWeek = telemetry.activeDates.filter((d) => d >= windowStart && d <= todayKey).length;
  const studyMinutesInWeek = Math.round(
    telemetry.sessionDurations
      .filter((d) => inWindow(d.recordedAt))
      .reduce((sum, d) => sum + d.durationMs, 0) / 60000
  );

  const unitMap = new Map(content.units.map((u) => [u.id, u]));
  const clearedSubs = Object.values(telemetry.unitSubmissions).filter(
    (s) => s.isCleared && inWindow(s.updatedAt)
  );
  const clearedUnitTitles = clearedSubs.map(
    (s) => unitMap.get(s.unitId)?.title.replace(/^【示例占位】/, '') ?? s.unitId
  );

  const practicedConceptCount = Object.values(telemetry.cardStats).filter((c) =>
    inWindow(c.lastPracticedAt)
  ).length;

  const completedRealTasks = (telemetry.realTasks ?? [])
    .filter((t) => t.status === 'completed' && t.completedAt && inWindow(t.completedAt))
    .map((t) => `真实待办：${t.title}`);
  const unitActionSummaries = clearedSubs.map((s) => `单元行动：${s.deliverableSummary}`);
  const completedActions = [...completedRealTasks, ...unitActionSummaries];

  const activeExp = (telemetry.lifeLabExperiments ?? [])[0];
  let activeExperimentBrief: string | undefined;
  if (activeExp) {
    if (activeExp.entries.length > 0) {
      const avg =
        Math.round(
          (activeExp.entries.reduce((s, e) => s + e.value, 0) / activeExp.entries.length) * 10
        ) / 10;
      activeExperimentBrief = `「${activeExp.title}」已记录 ${activeExp.entries.length} 天，当前均值 ${avg} ${activeExp.metricUnit}（实验前基线 ${activeExp.baselineValue} ${activeExp.metricUnit}）`;
    } else {
      activeExperimentBrief = `「${activeExp.title}」已立项，待录入首日观测值`;
    }
  }

  // 生成下周一条温和可执行建议
  const pendingRetests = Object.values(telemetry.cardStats).filter(
    (c) => typeof c.retestStage === 'number' && c.retestStage > 0
  );
  const openRealTasks = (telemetry.realTasks ?? []).filter((t) => t.status === 'open');

  let nextWeekSuggestion =
    '下周保持晚饭后高精力时段推进 1～2 节高杠杆内容即可，做完即停，稳住节奏比猛冲更重要。';
  if (pendingRetests.length > 0) {
    const firstNode = content.knowledgeGraph.nodes.find(
      (n) => n.id === pendingRetests[0].conceptId
    );
    nextWeekSuggestion = `下周实验后低精力时段优先顺手清掉「${
      firstNode?.label ?? pendingRetests[0].conceptId
    }」等 ${pendingRetests.length} 个 1/3/7 天待重测概念，把薄弱点转化为稳固直觉。`;
  } else if (openRealTasks.length > 0) {
    nextWeekSuggestion = `你任务池里还有「${openRealTasks[0].title}」待推进，下周直接挂靠对应分支单元一并交付即可。`;
  } else if (telemetry.activeEventPackId) {
    const pack = content.eventPacks.find((p) => p.id === telemetry.activeEventPackId);
    if (pack) {
      nextWeekSuggestion = `当前已开启「${pack.title}」事件包，下周按配套核查表逐项打勾落地即可从容应对。`;
    }
  }

  return {
    windowStart,
    windowEnd: todayKey,
    activeDaysInWeek,
    studyMinutesInWeek,
    clearedUnitTitles,
    practicedConceptCount,
    completedActions,
    activeExperimentBrief,
    nextWeekSuggestion,
  };
}
