import type {
  BranchId,
  CardRating,
  ConceptCardStat,
  DailyLifeLog,
  DailyPlanSnapshot,
  EnergyBand,
  LifeLabEntry,
  LifeLabExperiment,
  MilestoneDeliverableRecord,
  QuizAttemptLog,
  RealLifeTask,
  RealTaskCategory,
  RetestStage,
  ScheduledTaskItem,
  StudyDurationLog,
  StudyLineKind,
  TelemetrySnapshot,
  UnitActionSubmission,
  UserSchedulePreferences,
  WallExternalSyncPayload,
  WallPersonalConfig,
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
    (snapshot.currentDailyPlan?.completedTaskIds.length ?? 0) > 0 ||
    (snapshot.realTasks?.some((t) => t.status === 'completed') ?? false) ||
    (snapshot.lifeLabExperiments?.some((e) => e.entries.length > 0) ?? false) ||
    Object.values(snapshot.dailyLifeLogs ?? {}).some(
      (log) => log.waterCups > 0 || (log.runningKm ?? 0) > 0 || (log.sleepHours ?? 0) > 0
    )
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

/** 记录单元行动任务与过关状态（若关联了真实任务池待办，同步将该真实任务标记为已完成抵扣） */
export async function recordActionSubmission(
  submission: Omit<UnitActionSubmission, 'updatedAt'>
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const nowIso = new Date().toISOString();

  const updatedRealTasks = (snap.realTasks ?? []).map((rt) =>
    submission.linkedRealTaskId && rt.id === submission.linkedRealTaskId
      ? {
          ...rt,
          status: 'completed' as const,
          linkedUnitId: submission.unitId,
          completedAt: nowIso,
        }
      : rt
  );

  return saveTelemetry({
    ...snap,
    activeDates: touchActiveDate(snap.activeDates),
    realTasks: updatedRealTasks,
    unitSubmissions: {
      ...snap.unitSubmissions,
      [submission.unitId]: {
        ...submission,
        updatedAt: nowIso,
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
    realTasks: parsed.realTasks ?? [],
    activeEventPackId: parsed.activeEventPackId,
    toolboxChecked: parsed.toolboxChecked ?? {},
    lifeLabExperiments: parsed.lifeLabExperiments ?? [],
    schedulePrefs: parsed.schedulePrefs,
    dailyLifeLogs: parsed.dailyLifeLogs ?? {},
    wallPersonal: parsed.wallPersonal,
  };
  return saveTelemetry(normalized);
}

export const DEFAULT_SCHEDULE_PREFS: UserSchedulePreferences = {
  fragmentStartHour: 5,
  peakStartHour: 17,
  lowStartHour: 21,
  preferredBranchId: 'ALL',
};

/** Gen-2 R1：保存用户自定义三时段作息与偏好分支 */
export async function updateSchedulePrefs(
  patch: Partial<UserSchedulePreferences>
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const prev = snap.schedulePrefs ?? DEFAULT_SCHEDULE_PREFS;
  const fragmentStartHour = Math.max(4, Math.min(14, Math.round(patch.fragmentStartHour ?? prev.fragmentStartHour)));
  const peakStartHour = Math.max(
    fragmentStartHour + 2,
    Math.min(21, Math.round(patch.peakStartHour ?? prev.peakStartHour))
  );
  const lowStartHour = Math.max(
    peakStartHour + 1,
    Math.min(23, Math.round(patch.lowStartHour ?? prev.lowStartHour))
  );
  return saveTelemetry({
    ...snap,
    schedulePrefs: {
      fragmentStartHour,
      peakStartHour,
      lowStartHour,
      preferredBranchId: patch.preferredBranchId ?? prev.preferredBranchId ?? 'ALL',
    },
  });
}

/** Gen-2 R1：替换「今天」指定精力时段的任务（支持首页「换一题」，保留其余完成状态） */
export async function swapDailyPlanTask(
  oldTaskId: string,
  replacement: ScheduledTaskItem
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const plan = snap.currentDailyPlan;
  if (!plan) return snap;

  const nextTasks = plan.tasks.map((t) => (t.id === oldTaskId ? replacement : t));
  const nextCompleted = plan.completedTaskIds.filter((id) => id !== oldTaskId);
  return saveTelemetry({
    ...snap,
    currentDailyPlan: {
      ...plan,
      tasks: nextTasks,
      completedTaskIds: nextCompleted,
    },
  });
}

/** Gen-2 R1：记录或微调当日生活轻打卡（喝水 / 睡眠 / 跑步），跨标签实时同步状态墙与周报 */
export async function logDailyLifeHabit(
  patch: {
    waterDelta?: number;
    waterCups?: number;
    waterGoal?: number;
    sleepHours?: number | null;
    runningKm?: number | null;
  },
  dateKey = getLocalDateKey()
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const prevMap = snap.dailyLifeLogs ?? {};
  const existing: DailyLifeLog = prevMap[dateKey] ?? {
    dateKey,
    waterCups: 0,
    waterGoal: 8,
    updatedAt: new Date().toISOString(),
  };

  const nextWater =
    patch.waterCups !== undefined
      ? Math.max(0, Math.min(30, Math.round(patch.waterCups)))
      : Math.max(0, Math.min(30, existing.waterCups + (patch.waterDelta ?? 0)));
  const nextGoal = Math.max(1, Math.min(20, Math.round(patch.waterGoal ?? existing.waterGoal ?? 8)));
  const nextSleep =
    patch.sleepHours === null
      ? undefined
      : patch.sleepHours !== undefined
        ? Math.max(0, Math.min(18, Math.round(patch.sleepHours * 10) / 10))
        : existing.sleepHours;
  const nextRun =
    patch.runningKm === null
      ? undefined
      : patch.runningKm !== undefined
        ? Math.max(0, Math.min(100, Math.round(patch.runningKm * 10) / 10))
        : existing.runningKm;

  const updated: DailyLifeLog = {
    dateKey,
    waterCups: nextWater,
    waterGoal: nextGoal,
    sleepHours: nextSleep,
    runningKm: nextRun,
    updatedAt: new Date().toISOString(),
  };

  const hasProgress =
    updated.waterCups > 0 || (updated.runningKm ?? 0) > 0 || (updated.sleepHours ?? 0) > 0;

  return saveTelemetry({
    ...snap,
    activeDates: hasProgress ? touchActiveDate(snap.activeDates, dateKey) : snap.activeDates,
    dailyLifeLogs: {
      ...prevMap,
      [dateKey]: updated,
    },
  });
}

/** Gen-2 R1：保存个人状态墙配置（真实倒计时、吉光摘录、轮播周期、玻璃通透度） */
export async function saveWallPersonalConfig(
  patch: Partial<WallPersonalConfig>
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const prev = snap.wallPersonal ?? {};
  return saveTelemetry({
    ...snap,
    wallPersonal: {
      ...prev,
      ...patch,
    },
  });
}

/** 根据时段直接查找今日快照中该时段任务 */
export function getTasksBySlot(plan: DailyPlanSnapshot | undefined, slot: EnergyBand): ScheduledTaskItem[] {
  return (plan?.tasks ?? []).filter((t) => t.slot === slot);
}

/** M6 真实任务池：新增一条真实生活/科研/学习待办 */
export async function addRealLifeTask(input: {
  title: string;
  category: RealTaskCategory;
  branchId: BranchId;
  notes?: string;
}): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const item: RealLifeTask = {
    id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim(),
    category: input.category,
    branchId: input.branchId,
    notes: input.notes?.trim() || undefined,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  return saveTelemetry({
    ...snap,
    realTasks: [item, ...(snap.realTasks ?? [])],
  });
}

/** M6 真实任务池：切换真实待办完成状态 */
export async function toggleRealLifeTask(taskId: string): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const nowIso = new Date().toISOString();
  const nextTasks = (snap.realTasks ?? []).map((t) => {
    if (t.id !== taskId) return t;
    const nextStatus = t.status === 'completed' ? ('open' as const) : ('completed' as const);
    return {
      ...t,
      status: nextStatus,
      completedAt: nextStatus === 'completed' ? nowIso : undefined,
    };
  });
  const anyJustCompleted = nextTasks.some(
    (t) => t.id === taskId && t.status === 'completed'
  );
  return saveTelemetry({
    ...snap,
    activeDates: anyJustCompleted ? touchActiveDate(snap.activeDates) : snap.activeDates,
    realTasks: nextTasks,
  });
}

export async function removeRealLifeTask(taskId: string): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  return saveTelemetry({
    ...snap,
    realTasks: (snap.realTasks ?? []).filter((t) => t.id !== taskId),
  });
}

/** M7 生活事件包：激活或取消激活事件包，并同步刷新「今天」跨分支调度清单 */
export async function setActiveEventPackWithPlan(
  packId: string | undefined,
  buildPlan: (updatedSnap: TelemetrySnapshot) => DailyPlanSnapshot
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const prevCompleted = snap.currentDailyPlan?.completedTaskIds ?? [];
  const nextSnapBase: TelemetrySnapshot = {
    ...snap,
    activeEventPackId: packId,
  };
  const rebuilt = buildPlan(nextSnapBase);
  // 保留当天已经打勾完成的相同任务 ID
  const validIds = new Set(rebuilt.tasks.map((t) => t.id));
  rebuilt.completedTaskIds = prevCompleted.filter((id) => validIds.has(id));
  rebuilt.lowBatteryMode = snap.currentDailyPlan?.lowBatteryMode ?? false;
  rebuilt.tipAcknowledged = snap.currentDailyPlan?.tipAcknowledged ?? false;

  return saveTelemetry({
    ...nextSnapBase,
    currentDailyPlan: rebuilt,
  });
}

/** M7 生活工具箱：勾选或重置可复用清单项 */
export async function toggleToolboxItemCheck(
  toolboxId: string,
  itemText: string,
  resetAll = false
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const prevMap = snap.toolboxChecked ?? {};
  if (resetAll) {
    return saveTelemetry({
      ...snap,
      toolboxChecked: { ...prevMap, [toolboxId]: [] },
    });
  }
  const currentList = prevMap[toolboxId] ?? [];
  const nextList = currentList.includes(itemText)
    ? currentList.filter((x) => x !== itemText)
    : [...currentList, itemText];

  return saveTelemetry({
    ...snap,
    toolboxChecked: {
      ...prevMap,
      [toolboxId]: nextList,
    },
  });
}

/** M7 生活实验室：创建一项月度个人生活实验 */
export async function createLifeLabExperiment(input: {
  monthLabel: string;
  title: string;
  hypothesis: string;
  independentVar: string;
  metricName: string;
  metricUnit: string;
  baselineValue: number;
}): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const exp: LifeLabExperiment = {
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...input,
    entries: [],
    createdAt: new Date().toISOString(),
  };
  return saveTelemetry({
    ...snap,
    lifeLabExperiments: [exp, ...(snap.lifeLabExperiments ?? [])],
  });
}

/** M7 生活实验室：录入或更新某天的实验观测数据点 */
export async function addLifeLabEntry(
  experimentId: string,
  entry: LifeLabEntry
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const nextExps = (snap.lifeLabExperiments ?? []).map((exp) => {
    if (exp.id !== experimentId) return exp;
    const filtered = exp.entries.filter((e) => e.dateKey !== entry.dateKey);
    const entries = [...filtered, entry].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    return { ...exp, entries };
  });

  return saveTelemetry({
    ...snap,
    activeDates: touchActiveDate(snap.activeDates, entry.dateKey),
    lifeLabExperiments: nextExps,
  });
}

export async function updateLifeLabConclusion(
  experimentId: string,
  conclusion: string
): Promise<TelemetrySnapshot> {
  const snap = await loadTelemetry();
  const nextExps = (snap.lifeLabExperiments ?? []).map((exp) =>
    exp.id === experimentId ? { ...exp, conclusion: conclusion.trim() } : exp
  );
  return saveTelemetry({
    ...snap,
    lifeLabExperiments: nextExps,
  });
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
      event_pack_step: 'action_task',
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
