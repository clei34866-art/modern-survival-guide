import esbuild from 'esbuild';
import fs from 'node:fs';

async function main() {
  if (!fs.existsSync('dist/index.html') || !fs.existsSync('dist/data/catalog.json')) {
    throw new Error('dist/ 静态构建产物缺失，请先运行 npm run build');
  }

  const bundle = {
    catalog: JSON.parse(fs.readFileSync('public/data/catalog.json', 'utf8')),
    knowledgeGraph: JSON.parse(fs.readFileSync('public/data/knowledge-graph.json', 'utf8')),
    units: JSON.parse(fs.readFileSync('public/data/units/placeholders.json', 'utf8')).units,
    dailyTips: JSON.parse(fs.readFileSync('public/data/daily-tips.json', 'utf8')).tips,
  };

  const out = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/core/db.ts';
        export * from './src/core/scheduler.ts';
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

  const r1 = m.ensureTodayPlanSnapshot(bundle, s0, '2026-11-24');
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
    !reloaded.activeDates.includes('2026-11-24') ||
    !m.hasLiveTelemetry(reloaded)
  ) {
    throw new Error('刷新重读后今日完成态或活跃天数持久化失败');
  }

  // 4. 隔日自动翻篇且不补昨日未完欠账
  const rNext = m.ensureTodayPlanSnapshot(bundle, reloaded, '2026-11-25');
  if (
    !rNext.isNewlyGenerated ||
    rNext.plan.completedTaskIds.length !== 0 ||
    rNext.plan.tasks.length !== 4
  ) {
    throw new Error('隔日任务单未干净翻篇或错误累加了昨日任务');
  }

  console.log(
    '[smoke] 通过：三时段混排生成、保底版收敛(4→2)、做完即停收工态、刷新持久化与隔日不补账全部验证通过。'
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
