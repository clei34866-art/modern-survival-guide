import type { PlatformContentBundle } from './contentLoader';
import { addDaysToDateKey, getLocalDateKey, hasLiveTelemetry } from './db';
import { getTrackClearanceStatus, isTrackUnlocked, isUnitCleared } from './gatekeeper';
import { ensureTodayPlanSnapshot, getEffectiveDailyProgress, pickDailyTip } from './scheduler';
import { getWeaknessTop5 } from './srs';
import type {
  BranchId,
  TelemetrySnapshot,
  WallExternalSyncPayload,
} from '../types/schema';

export interface WallBranchProgressItem {
  id: BranchId;
  name: string;
  accentToken: string;
  clearedUnits: number;
  totalUnits: number;
  percent: number;
}

export interface WallB1LayerItem {
  trackId: string;
  shortLabel: string;
  title: string;
  unlocked: boolean;
  isCleared: boolean;
  masteryPercent: number;
  deliverablePercent: number;
}

export interface WallViewModel {
  dataMode: 'LIVE' | 'DEMO';
  dateKey: string;
  weather: string;
  todos: string[];
  countdowns: Array<{
    id: string;
    label: string;
    targetDate: string;
    daysLeft: number;
    isUrgent: boolean;
    isSample: boolean;
  }>;
  learning: {
    activeDaysTotal: number;
    consecutiveDays: number;
    todayDone: number;
    todayTotal: number;
    todayPercent: number;
    lowBatteryMode: boolean;
    branchProgress: WallBranchProgressItem[];
    weaknessTop5: Array<{ branchId: BranchId; label: string; detail: string }>;
    dailyTipTitle: string;
    dailyTipBody: string;
  };
  b1Kanban: {
    fiveLayerOverallPercent: number;
    currentLayerTitle: string;
    currentDeliverableTitle: string;
    currentDeliverablePercent: number;
    aiLineMinutes: number;
    softwareLineMinutes: number;
    otherBranchesMinutes: number;
    layers: WallB1LayerItem[];
  };
  lifeBlock: {
    running: string;
    sleep: string;
    water: string;
    experimentLine: string;
    isExternalSynced: boolean;
  };
  contentBlock: {
    quote: string;
    quoteSource: string;
    movie: string;
    isExternalSynced: boolean;
  };
  statusBlock: {
    serverExpiry: string;
    cloudSync: string;
    isExternalSynced: boolean;
  };
}

function diffDays(fromDateKey: string, toDateKey: string): number {
  const [y1, m1, d1] = fromDateKey.split('-').map(Number);
  const [y2, m2, d2] = toDateKey.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((t2 - t1) / 86400000));
}

export function computeConsecutiveDays(activeDates: string[], todayKey: string): number {
  if (activeDates.length === 0) return 0;
  const set = new Set(activeDates);
  let cursor = set.has(todayKey) ? todayKey : addDaysToDateKey(todayKey, -1);
  if (!set.has(cursor)) return 0;

  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDaysToDateKey(cursor, -1);
  }
  return streak;
}

/**
 * 构建 1080P 大屏状态墙与二级 B1 数字看板视图模型：
 * - 无真实留痕时输出完整 DEMO 示例演示数据跑通视觉与栅格；
 * - 一旦检测到本地真实学习留痕（作答/计时/打卡/产出），自动平滑切换为 LIVE 真实统计数据。
 */
export function computeWallViewModel(
  content: PlatformContentBundle,
  telemetry: TelemetrySnapshot,
  externalSync: WallExternalSyncPayload | null = null,
  todayKey = getLocalDateKey(),
  forceMode?: 'LIVE' | 'DEMO'
): WallViewModel {
  const liveDetected = hasLiveTelemetry(telemetry);
  const dataMode: 'LIVE' | 'DEMO' = forceMode ?? (liveDetected ? 'LIVE' : 'DEMO');

  const cfg = content.wallConfig;
  const countdowns = cfg.countdowns.map((c) => {
    const daysLeft = diffDays(todayKey, c.targetDate);
    return {
      id: c.id,
      label: c.label,
      targetDate: c.targetDate,
      daysLeft,
      isUrgent: daysLeft <= 7,
      isSample: Boolean(c.isSample),
    };
  });

  const tip = pickDailyTip(content.dailyTips, todayKey);
  const { plan } = ensureTodayPlanSnapshot(content, telemetry, todayKey);
  const todayProg = getEffectiveDailyProgress(plan);

  const weather = externalSync?.weather ?? cfg.todayPlaceholder.weather;
  const todos =
    externalSync?.todos && externalSync.todos.length > 0
      ? externalSync.todos.slice(0, 4)
      : plan.tasks.slice(0, 4).map((t) => `${t.branchId} · ${t.title}`);

  const activeExp = (telemetry.lifeLabExperiments ?? [])[0];
  let experimentLine = '本月生活实验：待开启（可在站内实验室立项）';
  if (activeExp) {
    if (activeExp.entries.length > 0) {
      const avg =
        Math.round(
          (activeExp.entries.reduce((s, e) => s + e.value, 0) / activeExp.entries.length) * 10
        ) / 10;
      experimentLine = `${activeExp.title}：均 ${avg}${activeExp.metricUnit}（基线 ${activeExp.baselineValue}${activeExp.metricUnit} · ${activeExp.entries.length}天）`;
    } else {
      experimentLine = `${activeExp.title}：已立项（基线 ${activeExp.baselineValue}${activeExp.metricUnit}）`;
    }
  }

  const lifeBlock = {
    running: externalSync?.life?.running ?? cfg.reservedBlocksSample.life.running,
    sleep: externalSync?.life?.sleep ?? cfg.reservedBlocksSample.life.sleep,
    water: externalSync?.life?.water ?? cfg.reservedBlocksSample.life.water,
    experimentLine,
    isExternalSynced: Boolean(externalSync?.life) || Boolean(activeExp),
  };

  const contentBlock = {
    quote: externalSync?.content?.quote ?? cfg.reservedBlocksSample.content.quote,
    quoteSource:
      externalSync?.content?.quoteSource ?? cfg.reservedBlocksSample.content.quoteSource,
    movie: externalSync?.content?.movie ?? cfg.reservedBlocksSample.content.movie,
    isExternalSynced: Boolean(externalSync?.content),
  };

  const statusBlock = {
    serverExpiry:
      externalSync?.serviceStatus?.serverExpiry ??
      cfg.reservedBlocksSample.serviceStatus.serverExpiry,
    cloudSync: externalSync
      ? `content/sync 已连接 · 同步正常`
      : cfg.reservedBlocksSample.serviceStatus.cloudSync,
    isExternalSynced: Boolean(externalSync?.serviceStatus),
  };

  if (dataMode === 'DEMO') {
    const demoRatios: Record<BranchId, number> = {
      B1: 42,
      B2: 35,
      B3: 28,
      B4: 20,
      B5: 15,
      B6: 50,
      B7: 12,
    };

    const branchProgress: WallBranchProgressItem[] = content.catalog.branches.map((b) => {
      const bUnits = content.units.filter((u) => u.branchId === b.id);
      return {
        id: b.id,
        name: b.name,
        accentToken: b.accentToken,
        clearedUnits: bUnits.length > 0 ? 1 : 0,
        totalUnits: Math.max(3, bUnits.length),
        percent: demoRatios[b.id],
      };
    });

    const b1 = content.catalog.branches.find((b) => b.id === 'B1')!;
    const aiTracks = b1.tracks.filter((t) => t.kind === 'layered_stage');
    const demoMastery = [68, 25, 0, 0, 0];
    const demoDeliv = [60, 10, 0, 0, 0];

    return {
      dataMode: 'DEMO',
      dateKey: todayKey,
      weather,
      todos,
      countdowns,
      learning: {
        activeDaysTotal: 6,
        consecutiveDays: 4,
        todayDone: 2,
        todayTotal: 4,
        todayPercent: 50,
        lowBatteryMode: false,
        branchProgress,
        weaknessTop5: content.knowledgeGraph.nodes.slice(0, 5).map((n, i) => ({
          branchId: n.branchId,
          label: n.label,
          detail: i === 0 ? '1天后重测（示例）' : '3天后温习（示例）',
        })),
        dailyTipTitle: tip.title,
        dailyTipBody: tip.tipBody,
      },
      b1Kanban: {
        fiveLayerOverallPercent: 24,
        currentLayerTitle: aiTracks[0]?.title ?? 'AI L1 · 工具与实战素养',
        currentDeliverableTitle:
          aiTracks[0]?.milestoneDeliverable?.title ?? '个人 Agent 工作流文档',
        currentDeliverablePercent: 60,
        aiLineMinutes: 135,
        softwareLineMinutes: 90,
        otherBranchesMinutes: 65,
        layers: aiTracks.map((t, idx) => ({
          trackId: t.id,
          shortLabel: `L${idx + 1}`,
          title: t.title,
          unlocked: idx <= 1,
          isCleared: false,
          masteryPercent: demoMastery[idx] ?? 0,
          deliverablePercent: demoDeliv[idx] ?? 0,
        })),
      },
      lifeBlock,
      contentBlock,
      statusBlock,
    };
  }

  // ============================================================================
  // LIVE 真实留痕驱动计算
  // ============================================================================
  const branchProgress: WallBranchProgressItem[] = content.catalog.branches.map((b) => {
    const bUnits = content.units.filter((u) => u.branchId === b.id);
    const cleared = bUnits.filter((u) => isUnitCleared(u.id, telemetry)).length;
    const total = bUnits.length;
    const percent = total > 0 ? Math.round((cleared / total) * 100) : 0;
    return {
      id: b.id,
      name: b.name,
      accentToken: b.accentToken,
      clearedUnits: cleared,
      totalUnits: total,
      percent,
    };
  });

  const realWeakness = getWeaknessTop5(content.knowledgeGraph, telemetry).map((w) => ({
    branchId: w.concept.branchId,
    label: w.concept.label,
    detail:
      typeof w.stat.retestStage === 'number' && w.stat.retestStage > 0
        ? `${w.stat.retestStage}天后重测 · 错${w.stat.errorCount}次`
        : `待巩固 · 练${w.stat.practiceCount}次`,
  }));

  const aiLineMinutes = Math.round(
    telemetry.sessionDurations
      .filter((d) => d.lineKind === 'b1_ai')
      .reduce((acc, d) => acc + d.durationMs, 0) / 60000
  );
  const softwareLineMinutes = Math.round(
    telemetry.sessionDurations
      .filter((d) => d.lineKind === 'b1_software')
      .reduce((acc, d) => acc + d.durationMs, 0) / 60000
  );
  const otherBranchesMinutes = Math.round(
    telemetry.sessionDurations
      .filter((d) => d.lineKind === 'other_branch')
      .reduce((acc, d) => acc + d.durationMs, 0) / 60000
  );

  const b1 = content.catalog.branches.find((b) => b.id === 'B1')!;
  const aiTracks = b1.tracks.filter((t) => t.kind === 'layered_stage');

  const layers: WallB1LayerItem[] = aiTracks.map((t, idx) => {
    const unlocked = isTrackUnlocked(t, aiTracks, telemetry);
    const st = getTrackClearanceStatus(t, telemetry);

    // 结合本层作答正确率与单元过关率计算掌握度
    const trackAttempts = telemetry.attemptLogs.filter((a) => a.trackId === t.id);
    const attemptAccuracy =
      trackAttempts.length > 0
        ? trackAttempts.filter((a) => a.isCorrect).length / trackAttempts.length
        : 0;
    const unitClearRatio =
      st.totalUnits > 0 ? st.clearedUnits / st.totalUnits : st.isTrackCleared ? 1 : 0;
    const masteryPercent =
      trackAttempts.length > 0 && st.totalUnits > 0
        ? Math.round((attemptAccuracy * 0.5 + unitClearRatio * 0.5) * 100)
        : Math.round(Math.max(attemptAccuracy, unitClearRatio) * 100);

    return {
      trackId: t.id,
      shortLabel: `L${idx + 1}`,
      title: t.title,
      unlocked,
      isCleared: st.isTrackCleared,
      masteryPercent,
      deliverablePercent: st.milestonePercent,
    };
  });

  const fiveLayerOverallPercent = Math.round(
    layers.reduce(
      (sum, l) => sum + (l.isCleared ? 100 : l.masteryPercent * 0.6 + l.deliverablePercent * 0.4),
      0
    ) / Math.max(1, layers.length)
  );

  const activeLayer =
    layers.find((l) => l.unlocked && !l.isCleared) ?? layers[layers.length - 1] ?? layers[0];
  const activeTrackObj =
    aiTracks.find((t) => t.id === activeLayer?.trackId) ?? aiTracks[0];

  const todayPercent =
    todayProg.totalActiveCount > 0
      ? Math.round((todayProg.completedActiveCount / todayProg.totalActiveCount) * 100)
      : 0;

  return {
    dataMode: 'LIVE',
    dateKey: todayKey,
    weather,
    todos,
    countdowns,
    learning: {
      activeDaysTotal: telemetry.activeDates.length,
      consecutiveDays: computeConsecutiveDays(telemetry.activeDates, todayKey),
      todayDone: todayProg.completedActiveCount,
      todayTotal: todayProg.totalActiveCount,
      todayPercent,
      lowBatteryMode: plan.lowBatteryMode,
      branchProgress,
      weaknessTop5: realWeakness,
      dailyTipTitle: tip.title,
      dailyTipBody: tip.tipBody,
    },
    b1Kanban: {
      fiveLayerOverallPercent,
      currentLayerTitle: activeLayer?.title ?? 'AI L1',
      currentDeliverableTitle:
        activeTrackObj?.milestoneDeliverable?.title ?? '本层实战项目产出',
      currentDeliverablePercent: activeLayer?.deliverablePercent ?? 0,
      aiLineMinutes,
      softwareLineMinutes,
      otherBranchesMinutes,
      layers,
    },
    lifeBlock,
    contentBlock,
    statusBlock,
  };
}
