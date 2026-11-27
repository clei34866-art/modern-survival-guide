import esbuild from 'esbuild';
import fs from 'node:fs';

async function main() {
  if (!fs.existsSync('dist/index.html') || !fs.existsSync('dist/data/catalog.json')) {
    throw new Error('dist/ 静态构建产物缺失，请先运行 npm run build');
  }

  const unitFileNames = [
    'b1-ai-l1.json',
    'b1-ai-advanced.json',
    'b1-sw-blender.json',
    'b1-sw-packs.json',
    'b2-finance.json',
    'b3-psych.json',
    'b4-health.json',
    'b5-career.json',
    'b6-learning.json',
    'b7-safety.json',
  ];
  const byFile = Object.fromEntries(
    unitFileNames.map((fn) => [
      fn,
      JSON.parse(fs.readFileSync(`public/data/units/${fn}`, 'utf8')).units,
    ])
  );
  const b1L1Units = byFile['b1-ai-l1.json'];
  const b1BlenderUnits = byFile['b1-sw-blender.json'];
  const b2Units = byFile['b2-finance.json'];
  const b3Units = byFile['b3-psych.json'];

  const allLoadedUnits = Object.values(byFile).flat();
  if (
    b1L1Units.length < 4 ||
    b1BlenderUnits.length < 3 ||
    b2Units.length < 3 ||
    b3Units.length < 2 ||
    allLoadedUnits.length < 46 ||
    allLoadedUnits.some((u) => u.isPlaceholder)
  ) {
    throw new Error('全七分支 46 节正式学习单元未全部就绪或存在占位单元');
  }

  const bundle = {
    catalog: JSON.parse(fs.readFileSync('public/data/catalog.json', 'utf8')),
    knowledgeGraph: JSON.parse(fs.readFileSync('public/data/knowledge-graph.json', 'utf8')),
    units: allLoadedUnits,
    dailyTips: JSON.parse(fs.readFileSync('public/data/daily-tips.json', 'utf8')).tips,
    wallConfig: JSON.parse(fs.readFileSync('public/data/wall-config.json', 'utf8')),
    eventPacks: JSON.parse(fs.readFileSync('public/data/event-packs.json', 'utf8')).packs,
    toolboxes: JSON.parse(fs.readFileSync('public/data/toolbox-packs.json', 'utf8')).toolboxes,
    stagePrepPacks: JSON.parse(fs.readFileSync('public/data/toolbox-packs.json', 'utf8')).stagePrepPacks,
  };

  const out = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/core/db.ts';
        export * from './src/core/scheduler.ts';
        export * from './src/core/gatekeeper.ts';
        export * from './src/core/srs.ts';
        export * from './src/core/wallAdapter.ts';
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    write: false,
  });

  const modUrl =
    'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64');
  const m = await import(modUrl);

  // 1. 初始清空并生成当日三时段清单
  const s0 = await m.clearTelemetry();
  if (m.hasLiveTelemetry(s0) !== false) {
    throw new Error('清空后应处于 DEMO 无留痕状态');
  }

  const todayKey = m.getLocalDateKey();
  const tomorrowKey = m.addDaysToDateKey(todayKey, 1);

  const r1 = m.ensureTodayPlanSnapshot(bundle, s0, todayKey);
  if (!r1.isNewlyGenerated || r1.plan.tasks.length !== 4) {
    throw new Error('「今天」应默认生成覆盖早/晚高能/实验后低能三时段的 4 项任务');
  }
  const slotsPresent = new Set(r1.plan.tasks.map((t) => t.slot));
  if (!slotsPresent.has('fragment') || !slotsPresent.has('peak') || !slotsPresent.has('low')) {
    throw new Error('三时段精力分区缺失');
  }

  // 2. 切换「状态差保底版」即时收敛为轻量清单
  let snap = await m.saveDailyPlanSnapshot(r1.plan);
  snap = await m.setDailyLowBatteryMode(true);
  const lowProg = m.getEffectiveDailyProgress(snap.currentDailyPlan);
  if (lowProg.totalActiveCount !== 2 || lowProg.exemptedTasks.length !== 2) {
    throw new Error('切换保底版后未正确收敛为 2 项轻量任务');
  }

  // 3. 勾选完成当日任务 → 进入温暖收工态 & 持久化不丢
  for (const task of lowProg.activeTasks) {
    snap = await m.toggleDailyTaskCompletion(task);
  }
  const doneProg = m.getEffectiveDailyProgress(snap.currentDailyPlan);
  if (!doneProg.isAllDone) {
    throw new Error('完成保底任务后应进入 isAllDone 收工状态');
  }

  const reloaded = await m.loadTelemetry();
  if (
    reloaded.currentDailyPlan?.completedTaskIds.length !== 2 ||
    !reloaded.activeDates.includes(todayKey) ||
    !m.hasLiveTelemetry(reloaded)
  ) {
    throw new Error('刷新重读后今日完成态或活跃天数持久化失败');
  }

  // 4. 隔日自动翻篇且不补昨日未完欠账
  const rNext = m.ensureTodayPlanSnapshot(bundle, reloaded, tomorrowKey);
  if (
    !rNext.isNewlyGenerated ||
    rNext.plan.completedTaskIds.length !== 0 ||
    rNext.plan.tasks.length !== 4
  ) {
    throw new Error('隔日任务单未干净翻篇或错误累加了昨日任务');
  }

  // 5. M3 门禁与 7 步单元过关 + B1 逐层解锁持久化验证
  const b1Tracks = bundle.catalog.branches.find((b) => b.id === 'B1').tracks;
  const l1Track = b1Tracks.find((t) => t.id === 'b1-ai-l1');
  const l2Track = b1Tracks.find((t) => t.id === 'b1-ai-l2');
  const blenderTrack = b1Tracks.find((t) => t.id === 'b1-sw-blender');

  if (!m.isTrackUnlocked(l1Track, b1Tracks, reloaded)) {
    throw new Error('AI L1 初始应为解锁状态');
  }
  if (m.isTrackUnlocked(l2Track, b1Tracks, reloaded)) {
    throw new Error('AI L2 在 L1 未过关前必须处于锁定状态');
  }
  if (!m.isTrackUnlocked(blenderTrack, b1Tracks, reloaded)) {
    throw new Error('软件技能分包（Blender）应独立开放无需前置锁定');
  }

  // 验证时效「待复核」自动判断逻辑
  if (
    m.isSourceExpired('2027-06-01', '2026-11-24') !== false ||
    m.isSourceExpired('2026-05-01', '2026-11-24') !== true
  ) {
    throw new Error('时效到期「待复核」判定异常');
  }

  // 模拟走通 B1 AI L1 全部 4 节正式单元 + L1 产出验收 -> 自动解锁 AI L2
  for (const u of b1L1Units) {
    await m.recordStudyDuration({
      branchId: 'B1',
      trackId: 'b1-ai-l1',
      unitId: u.id,
      activity: 'guide',
      durationMs: 300000,
    });
    await m.recordQuizAttempt({
      unitId: u.id,
      branchId: 'B1',
      trackId: 'b1-ai-l1',
      questionId: u.quiz.questions[0].id,
      conceptId: u.quiz.questions[0].relatedConceptId,
      kind: 'quiz',
      selectedIndex: u.quiz.questions[0].correctIndex,
      isCorrect: true,
      durationMs: 8500,
    });
    await m.recordActionSubmission({
      unitId: u.id,
      branchId: 'B1',
      trackId: 'b1-ai-l1',
      deliverableSummary: `已完成 ${u.id} 实战模板沉淀`,
      feynmanOneLiner: '给原文锚点并留未知退路，阻断概率硬凑。',
      quizPassScoreRatio: 1.0,
      isCleared: true,
    });
  }

  const gateFail = m.evaluateUnitPassGate({
    quizScoreRatio: 0.5,
    passRatio: 0.8,
    deliverableSummary: '模板已更新',
    requiresFeynman: true,
    feynmanOneLiner: '锚定材料防瞎编',
  });
  if (gateFail.canClearUnit) {
    throw new Error('自测未达标时不应放行单元过关');
  }

  const gatePass = m.evaluateUnitPassGate({
    quizScoreRatio: 1.0,
    passRatio: 0.8,
    deliverableSummary: '已沉淀个人文献核查 Prompt 模板',
    requiresFeynman: true,
    feynmanOneLiner: '给原文锚点并允许答未知，阻断模型概率硬凑。',
  });
  if (!gatePass.canClearUnit) {
    throw new Error('自测达标且行动、费曼均填写时应允许过关');
  }

  await m.recordMilestoneSubmission({
    trackId: 'b1-ai-l1',
    branchId: 'B1',
    completionPercent: 100,
    artifactSummary: '个人 Agent/Prompt 标准核查工作流 v1',
    isApproved: true,
  });

  const afterM3 = await m.loadTelemetry();
  if (!m.isUnitCleared('unit-b1-l1-prompt', afterM3)) {
    throw new Error('单元过关状态未持久化');
  }
  if (!m.isTrackUnlocked(l2Track, b1Tracks, afterM3)) {
    throw new Error('L1 单元与产出全部达标后，AI L2 应自动解锁');
  }

  // 6. M4 错题建档、薄弱 TOP5 与 1->3->7->graduated 重测推进验证
  let snapM4 = await m.recordQuizAttempt({
    unitId: 'unit-b2-investing',
    branchId: 'B2',
    trackId: 'b2-main',
    questionId: 'q-b2-inv-1',
    conceptId: 'b2.risk_drawdown_tolerance',
    kind: 'quiz',
    selectedIndex: 0,
    isCorrect: false,
    durationMs: 8000,
  });

  const top5Before = m.getWeaknessTop5(bundle.knowledgeGraph, snapM4);
  if (!top5Before.some((w) => w.concept.id === 'b2.risk_drawdown_tolerance')) {
    throw new Error('答错题后对应概念未进入薄弱概念 TOP5');
  }

  // 模拟第 1 天到期重测答对 -> 应推进到 3 天
  const q1 = m.getRetestQueue(bundle.knowledgeGraph, bundle.units, snapM4, '2099-01-01');
  if (!q1.dueItems.some((i) => i.concept.id === 'b2.risk_drawdown_tolerance')) {
    throw new Error('到期重测队列未找到错题概念');
  }

  snapM4 = await m.recordQuizAttempt({
    unitId: 'unit-b2-investing',
    branchId: 'B2',
    trackId: 'b2-main',
    questionId: 'q-b2-inv-1',
    conceptId: 'b2.risk_drawdown_tolerance',
    kind: 'retest',
    selectedIndex: 1,
    isCorrect: true,
    durationMs: 6000,
  });
  if (snapM4.cardStats['b2.risk_drawdown_tolerance'].retestStage !== 3) {
    throw new Error('1 天重测答对后未推进至 3 天阶段');
  }

  // 第 3 天重测答对 -> 推进到 7 天
  snapM4 = await m.recordQuizAttempt({
    unitId: 'unit-b2-investing',
    branchId: 'B2',
    trackId: 'b2-main',
    questionId: 'q-b2-inv-1',
    conceptId: 'b2.risk_drawdown_tolerance',
    kind: 'retest',
    selectedIndex: 1,
    isCorrect: true,
    durationMs: 5500,
  });
  if (snapM4.cardStats['b2.risk_drawdown_tolerance'].retestStage !== 7) {
    throw new Error('3 天重测答对后未推进至 7 天阶段');
  }

  // 第 7 天重测答对 -> graduated 已掌握出列
  snapM4 = await m.recordQuizAttempt({
    unitId: 'unit-b2-investing',
    branchId: 'B2',
    trackId: 'b2-main',
    questionId: 'q-b2-inv-1',
    conceptId: 'b2.risk_drawdown_tolerance',
    kind: 'retest',
    selectedIndex: 1,
    isCorrect: true,
    durationMs: 5000,
  });
  if (snapM4.cardStats['b2.risk_drawdown_tolerance'].retestStage !== 'graduated') {
    throw new Error('7 天重测答对后未标记为 graduated 已掌握');
  }

  // 7. M5 1080P 状态墙与二级看板 DEMO -> LIVE 自动转实验证
  const emptyForWall = m.createEmptyTelemetry();
  const demoVm = m.computeWallViewModel(bundle, emptyForWall, null, '2026-11-24');
  if (demoVm.dataMode !== 'DEMO' || demoVm.countdowns.length < 3) {
    throw new Error('无留痕时状态墙应处于 DEMO 示例演示模式且包含倒计时块');
  }

  await m.recordStudyDuration({
    branchId: 'B1',
    trackId: 'b1-sw-blender',
    activity: 'action_task',
    durationMs: 20 * 60 * 1000,
  });
  const liveSnap = await m.loadTelemetry();
  const liveVm = m.computeWallViewModel(bundle, liveSnap, null, '2026-11-24');
  if (
    liveVm.dataMode !== 'LIVE' ||
    liveVm.b1Kanban.aiLineMinutes <= 0 ||
    liveVm.b1Kanban.softwareLineMinutes < 20
  ) {
    throw new Error('产生真实留痕后状态墙未自动转实或双线时长统计不准确');
  }

  // 8. M6 真实任务池联动单元行动过关 + 状态墙同步验证
  let snapM6 = await m.addRealLifeTask({
    title: '梳理 12 月生活费三桶预算表',
    category: 'finance_sheet',
    branchId: 'B2',
  });
  const addedTask = snapM6.realTasks[0];
  if (!addedTask || addedTask.status !== 'open') {
    throw new Error('真实任务池新增待办失败');
  }

  snapM6 = await m.recordActionSubmission({
    unitId: 'unit-b2-budget',
    branchId: 'B2',
    trackId: 'b2-main',
    deliverableSummary: `【真实待办交付】${addedTask.title}`,
    linkedRealTaskId: addedTask.id,
    quizPassScoreRatio: 1.0,
    isCleared: true,
  });

  const syncedRealTask = snapM6.realTasks.find((t) => t.id === addedTask.id);
  if (
    syncedRealTask?.status !== 'completed' ||
    syncedRealTask.linkedUnitId !== 'unit-b2-budget' ||
    !m.isUnitCleared('unit-b2-budget', snapM6)
  ) {
    throw new Error('真实任务关联提交后未同步完成真实待办与单元过关');
  }

  const wallAfterM6 = m.computeWallViewModel(bundle, snapM6, null, todayKey);
  const b2WallProg = wallAfterM6.learning.branchProgress.find((b) => b.id === 'B2');
  if (!b2WallProg || b2WallProg.clearedUnits < 1 || b2WallProg.percent <= 0) {
    throw new Error('单元联动过关后状态墙 B2 分支与技能树进度未同步增加');
  }

  // 9. M7 生活事件包激活推入「今天」 + 生活实验室多日对比数据 + 简版周报汇总验证
  let snapM7 = await m.setActiveEventPackWithPlan('event-presentation', (updated) =>
    m.buildDailyPlanSnapshot(todayKey, bundle, updated)
  );
  if (
    snapM7.activeEventPackId !== 'event-presentation' ||
    !snapM7.currentDailyPlan.tasks.some((t) => t.kind === 'event_pack_step')
  ) {
    throw new Error('激活生活事件包后未将跨分支任务推入「今天」调度流');
  }

  snapM7 = await m.createLifeLabExperiment({
    monthLabel: todayKey.slice(0, 7),
    title: '23:30 前熄灯睡眠实验',
    hypothesis: '早睡提升次日精力',
    independentVar: '23:30 关灯',
    metricName: '晨起精力',
    metricUnit: '分',
    baselineValue: 5.5,
  });
  const expId = snapM7.lifeLabExperiments[0].id;
  await m.addLifeLabEntry(expId, { dateKey: m.addDaysToDateKey(todayKey, -1), value: 7.0 });
  snapM7 = await m.addLifeLabEntry(expId, { dateKey: todayKey, value: 8.0 });
  if (snapM7.lifeLabExperiments[0].entries.length !== 2) {
    throw new Error('生活实验室多日数据记录失败');
  }

  const weekly = m.computeWeeklyReviewSummary(bundle, snapM7, todayKey);
  if (
    weekly.clearedUnitTitles.length < 2 ||
    weekly.completedActions.length < 2 ||
    !weekly.activeExperimentBrief
  ) {
    throw new Error('简版周报未能准确汇总当周真实学习、行动任务与生活实验室留痕');
  }

  // 10. M8 Scrapling 白名单抓源产物与缺口清单闭环验证
  if (!fs.existsSync('public/data/scraped-sources.json')) {
    throw new Error('缺少 M8 抓取输出 public/data/scraped-sources.json');
  }
  const scraped = JSON.parse(fs.readFileSync('public/data/scraped-sources.json', 'utf8'));
  const gaps = JSON.parse(fs.readFileSync('public/data/content-gaps.json', 'utf8'));
  if (scraped.fetchedCount + gaps.gapCount !== scraped.totalTargets) {
    throw new Error('白名单总目标数与「已抓源 + 缺口清单」之和不一致');
  }

  console.log(
    `[smoke] 一版总验收通过 (M1–M10)：共 ${allLoadedUnits.length} 节正式单元全部零占位合规，抓源成功=${scraped.fetchedCount}，缺口归档=${gaps.gapCount}。`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
