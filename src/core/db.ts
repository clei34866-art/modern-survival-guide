import type {
  BranchId,
  CardRating,
  ConceptCardStat,
  DailyPlanSnapshot,
  MilestoneDeliverableRecord,
  QuizAttemptLog,
  RetestStage,
  ScheduledTaskItem,
  StudyDurationLog,
  StudyLineKind,
  TelemetrySnapshot,
  UnitActionSubmission,
  WallExternalSyncPayload,
} from '../types/schema';

const DB_NAME = 'modern_survival_guide_db';
const DB_VERSION = 1;
const STORE_NAME = 'kv_store';
const TELEMETRY_KEY = 'telemetry_v1';
const SYNC_CHANNEL_NAME = 'modern_survival_guide_sync_v1';

let memoryFallback: TelemetrySnapshot | null = null;
const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;
(channel as unknown as { unref?: () => void })?.unref?.();

export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToDateKey(baseDateKey: string, days: number): string {
  const [y, m, d] = baseDateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return getLocalDateKey(dt);
}

export function createEmptyTelemetry(): TelemetrySnapshot {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    activeDates: [],
    sessionDurations: [],
    attemptLogs: [],
    cardStats: {},
    unitSubmissions: {},
    milestoneSubmissions: {},
  };
}

/** 判定是否已有真实学习留痕（M5 状态墙与数字看板据此自动由 DEMO 示例态转为 LIVE 真实数据态） */
export function hasLiveTelemetry(snapshot: TelemetrySnapshot): boolean {
  return (
    snapshot.sessionDurations.length > 0 ||
    snapshot.attemptLogs.length > 0 ||
    Object.keys(snapshot.cardStats).length > 0 ||
    Object.keys(snapshot.unitSubmissions).length > 0 ||
    Object.keys(snapshot.milestoneSubmissions).length > 0 ||
    (snapshot.currentDailyPlan?.completedTaskIds.length ?? 0) > 0
  );
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function loadTelemetry(): Promise<TelemetrySnapshot> {
  try {
    const db = await openIdb();
    return await new Promise<TelemetrySnapshot>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(TELEMETRY_KEY);
      req.onsuccess = () => {
        db.close();
        if (req.result && req.result.schemaVersion === 1) {
          resolve(req.result as TelemetrySnapshot);
        } else {
          resolve(createEmptyTelemetry());
        }
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return memoryFallback ? structuredClone(memoryFallback) : createEmptyTelemetry();
  }
}

export async function saveTelemetry(
  next: TelemetrySnapshot,
  options: { broadcast?: boolean } = { broadcast: true }
): Promise<TelemetrySnapshot> {
  const stamped: TelemetrySnapshot = {
    ...next,
    updatedAt: new Date().toISOString(),
  };
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(stamped, TELEMETRY_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    memoryFallback = structuredClone(stamped);
  }

  if (options.broadcast !== false && channel) {
    channel.postMessage({ type: 'TELEMETRY_UPDATED', updatedAt: stamped.updatedAt });
  }
  return stamped;
}

export function subscribeTelemetrySync(onUpdate: () => void): () => void {
  if (!channel) return () => {};
  const handler = (ev: MessageEvent) => {
    if (ev.data?.type === 'TELEMETRY_UPDATED') {
      onUpdate();
    }
  };
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
}

function touchActiveDate(dates: string[], today = getLocalDateKey()): string[] {
  if (dates.includes(today)) return dates;
  return [...dates, today].sort();
}

export function inferStudyLineKind(branchId: BranchId, trackId: string): StudyLineKind {
  if (branchId !== 'B1') return 'other_branch';
  if (trackId.startsWith('b1-sw-')) return 'b1_software';
  return 'b1_ai';
}

/** 记录分轨道学习投入时长（毫秒） */
export async function recordStudyDuration(input: {
  branchId: BranchId;
  trackId: string;
  unitId?: string;
  activity: StudyDurationLog['activity'];
  durationMs: number;
}): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const entry: StudyDurationLog = {
    id: `dur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    branchId: input.branchId,
    trackId: input.trackId,
    unitId: input.unitId,
    lineKind: inferStudyLineKind(input.branchId, input.trackId),
    activity: input.activity,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    recordedAt: new Date().toISOString(),
  };
  return saveTelemetry({
    ...snap,
    activeDates: touchActiveDate(snap.activeDates),
    sessionDurations: [...snap.sessionDurations, entry],
  });
}

function nextRetestStageOnCorrect(current: RetestStage): RetestStage {
  if (current === 1) return 3;
  if (current === 3) return 7;
  return 'graduated';
}

/** 记录先预测、自测或重测作答，错题自动进入 1/3/7 天重测队列 */
export async function recordQuizAttempt(input: {
  unitId: string;
  branchId: BranchId;
  trackId: string;
  questionId: string;
  conceptId: string;
  kind: QuizAttemptLog['kind'];
  selectedIndex: number;
  isCorrect: boolean;
  durationMs: number;
}): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const nowIso = new Date().toISOString();
  const today = getLocalDateKey();

  const log: QuizAttemptLog = {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...input,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    recordedAt: nowIso,
  };

  const prevStat: ConceptCardStat = snap.cardStats[input.conceptId] ?? {
    conceptId: input.conceptId,
    practiceCount: 0,
    correctStreak: 0,
    errorCount: 0,
    retestStage: 0,
    lastPracticedAt: nowIso,
  };

  let nextStage: RetestStage = prevStat.retestStage;
  let dueDate = prevStat.dueDate;

  if (!input.isCorrect) {
    nextStage = 1;
    dueDate = addDaysToDateKey(today, 1);
  } else if (input.kind === 'retest' || prevStat.retestStage !== 0) {
    nextStage = nextRetestStageOnCorrect(prevStat.retestStage);
    dueDate =
      typeof nextStage === 'number' ? addDaysToDateKey(today, nextStage) : undefined;
  }

  const updatedStat: ConceptCardStat = {
    ...prevStat,
    practiceCount: prevStat.practiceCount + 1,
    correctStreak: input.isCorrect ? prevStat.correctStreak + 1 : 0,
    errorCount: input.isCorrect ? prevStat.errorCount : prevStat.errorCount + 1,
    retestStage: nextStage,
    dueDate,
    lastPracticedAt: nowIso,
  };

  return saveTelemetry({
    ...snap,
    activeDates: touchActiveDate(snap.activeDates, today),
    attemptLogs: [...snap.attemptLogs, log],
    cardStats: {
      ...snap.cardStats,
      [input.conceptId]: updatedStat,
    },
  });
}

/** 记录概念卡刷卡反馈（熟练 / 模糊 / 重来） */
export async function recordCardReview(
  conceptId: string,
  rating: CardRating,
  info: { branchId: BranchId; trackId: string; durationMs: number }
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const nowIso = new Date().toISOString();
  const today = getLocalDateKey();

  const prev: ConceptCardStat = snap.cardStats[conceptId] ?? {
    conceptId,
    practiceCount: 0,
    correctStreak: 0,
    errorCount: 0,
    retestStage: 0,
    lastPracticedAt: nowIso,
  };

  let retestStage: RetestStage = prev.retestStage;
  let dueDate: string | undefined;
  if (rating === 'again') {
    retestStage = 1;
    dueDate = addDaysToDateKey(today, 1);
  } else if (rating === 'fuzzy') {
    retestStage = 3;
    dueDate = addDaysToDateKey(today, 3);
  } else {
    retestStage = prev.retestStage === 1 ? 3 : prev.retestStage === 3 ? 7 : 'graduated';
    dueDate = typeof retestStage === 'number' ? addDaysToDateKey(today, retestStage) : undefined;
  }

  const durEntry: StudyDurationLog = {
    id: `dur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    branchId: info.branchId,
    trackId: info.trackId,
    lineKind: inferStudyLineKind(info.branchId, info.trackId),
    activity: 'card_review',
    durationMs: Math.max(0, Math.round(info.durationMs)),
    recordedAt: nowIso,
  };

  return saveTelemetry({
    ...snap,
    activeDates: touchActiveDate(snap.activeDates, today),
    sessionDurations: [...snap.sessionDurations, durEntry],
    cardStats: {
      ...snap.cardStats,
      [conceptId]: {
        ...prev,
        practiceCount: prev.practiceCount + 1,
        correctStreak: rating === 'easy' ? prev.correctStreak + 1 : 0,
        errorCount: rating === 'again' ? prev.errorCount + 1 : prev.errorCount,
        lastRating: rating,
        retestStage,
        dueDate,
        lastPracticedAt: nowIso,
      },
    },
  });
}

/** 记录单元行动任务与过关状态 */
export async function recordActionSubmission(
  submission: Omit<UnitActionSubmission, 'updatedAt'>
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  return saveTelemetry({
    ...snap,
    activeDates: touchActiveDate(snap.activeDates),
    unitSubmissions: {
      ...snap.unitSubmissions,
      [submission.unitId]: {
        ...submission,
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

/** 记录 B1 层级或软件分包里程碑产出物完成度 */
export async function recordMilestoneSubmission(
  record: Omit<MilestoneDeliverableRecord, 'updatedAt'>
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  return saveTelemetry({
    ...snap,
    activeDates: touchActiveDate(snap.activeDates),
    milestoneSubmissions: {
      ...snap.milestoneSubmissions,
      [record.trackId]: {
        ...record,
        completionPercent: Math.min(100, Math.max(0, Math.round(record.completionPercent))),
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

export async function exportTelemetryJson(): Promise<string> {
  const snap = await loadTelemetry();
  return JSON.stringify(snap, null, 2);
}

export async function importTelemetryJson(rawJson: string): Promise<TelemetrySnapshot> {
  const parsed = JSON.parse(rawJson) as Partial<TelemetrySnapshot>;
  if (
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.activeDates) ||
    !Array.isArray(parsed.sessionDurations) ||
    !Array.isArray(parsed.attemptLogs) ||
    typeof parsed.cardStats !== 'object' ||
    parsed.cardStats === null
  ) {
    throw new Error('备份文件格式不合法：缺少 schemaVersion=1 核心留痕字段');
  }

  const normalized: TelemetrySnapshot = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    activeDates: parsed.activeDates,
    sessionDurations: parsed.sessionDurations,
    attemptLogs: parsed.attemptLogs,
    cardStats: parsed.cardStats,
    unitSubmissions: parsed.unitSubmissions ?? {},
    milestoneSubmissions: parsed.milestoneSubmissions ?? {},
    currentDailyPlan: parsed.currentDailyPlan,
  };
  return saveTelemetry(normalized);
}

/** 保存或初始化「今天」静态计划快照（仅初始化时不记活跃天，避免空打开污染留痕） */
export async function saveDailyPlanSnapshot(plan: DailyPlanSnapshot): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  return saveTelemetry({
    ...snap,
    currentDailyPlan: plan,
  });
}

/** 切换「今天状态差 · 保底版」开关，保留已完成项 */
export async function setDailyLowBatteryMode(enabled: boolean): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  if (!snap.currentDailyPlan) return snap;
  return saveTelemetry({
    ...snap,
    currentDailyPlan: {
      ...snap.currentDailyPlan,
      lowBatteryMode: enabled,
    },
  });
}

/** 标记「每日生活一招」已读或展开 */
export async function setDailyTipAcknowledged(acknowledged: boolean): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  if (!snap.currentDailyPlan) return snap;
  return saveTelemetry({
    ...snap,
    activeDates: acknowledged ? touchActiveDate(snap.activeDates) : snap.activeDates,
    currentDailyPlan: {
      ...snap.currentDailyPlan,
      tipAcknowledged: acknowledged,
    },
  });
}

/** 勾选或取消勾选「今天」某项任务，首次勾选时同步记录活跃日期与轻量投入用时 */
export async function toggleDailyTaskCompletion(
  task: ScheduledTaskItem
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const plan = snap.currentDailyPlan;
  if (!plan) return snap;

  const exists = plan.completedTaskIds.includes(task.id);
  const completedTaskIds = exists
    ? plan.completedTaskIds.filter((id) => id !== task.id)
    : [...plan.completedTaskIds, task.id];

  const logId = `daily_${plan.dateKey}_${task.id}`;
  const hasLoggedDuration = snap.sessionDurations.some((d) => d.id === logId);

  let nextDurations = snap.sessionDurations;
  if (!exists && !hasLoggedDuration) {
    const activityMap: Record<ScheduledTaskItem['kind'], StudyDurationLog['activity']> = {
      card_flash: 'card_review',
      scenario_preview: 'guide',
      core_unit: 'guide',
      retest_review: 'quiz',
      light_recap: 'card_review',
    };
    nextDurations = [
      ...snap.sessionDurations,
      {
        id: logId,
        branchId: task.branchId,
        trackId: task.trackId,
        unitId: task.unitId,
        lineKind: inferStudyLineKind(task.branchId, task.trackId),
        activity: activityMap[task.kind],
        durationMs: task.estimatedMinutes * 60 * 1000,
        recordedAt: new Date().toISOString(),
      },
    ];
  } else if (exists && hasLoggedDuration) {
    nextDurations = snap.sessionDurations.filter((d) => d.id !== logId);
  }

  return saveTelemetry({
    ...snap,
    activeDates: !exists ? touchActiveDate(snap.activeDates, plan.dateKey) : snap.activeDates,
    sessionDurations: nextDurations,
    currentDailyPlan: {
      ...plan,
      completedTaskIds,
    },
  });
}

export async function clearTelemetry(): Promise<TelemetrySnapshot> {
  return saveTelemetry(createEmptyTelemetry());
}

/** 只读拉取现有服务器 content/sync 数据的轻量适配器（拉不到时返回 null 走本地或示例占位） */
export async function fetchServerSyncSnapshot(
  endpointUrl?: string,
  timeoutMs = 3500
): Promise<WallExternalSyncPayload | null> {
  if (!endpointUrl || !endpointUrl.trim()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpointUrl, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as WallExternalSyncPayload;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
