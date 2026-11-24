import { useEffect, useState } from 'preact/hooks';
import { loadPlatformContent, type PlatformContentBundle } from './core/contentLoader';
import {
  clearTelemetry,
  exportTelemetryJson,
  hasLiveTelemetry,
  importTelemetryJson,
  loadTelemetry,
  recordActionSubmission,
  recordMilestoneSubmission,
  recordQuizAttempt,
  recordStudyDuration,
  subscribeTelemetrySync,
} from './core/db';
import type { TelemetrySnapshot } from './types/schema';

function formatMinutes(ms: number): string {
  const mins = ms / 60000;
  return mins < 1 && mins > 0 ? '<1 min' : `${Math.round(mins)} min`;
}

export function App() {
  const [content, setContent] = useState<PlatformContentBundle | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [backupPreview, setBackupPreview] = useState<string>('');

  useEffect(() => {
    Promise.all([loadPlatformContent(), loadTelemetry()])
      .then(([bundle, snap]) => {
        setContent(bundle);
        setTelemetry(snap);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });

    return subscribeTelemetrySync(() => {
      loadTelemetry().then(setTelemetry);
    });
  }, []);

  if (error) {
    return (
      <main class="page-shell">
        <div class="section-card">加载失败：{error}</div>
      </main>
    );
  }

  if (!content || !telemetry) {
    return (
      <main class="page-shell">
        <div class="section-card">正在读取结构化内容与本地留痕库…</div>
      </main>
    );
  }

  const aiDurationMs = telemetry.sessionDurations
    .filter((d) => d.lineKind === 'b1_ai')
    .reduce((acc, d) => acc + d.durationMs, 0);
  const swDurationMs = telemetry.sessionDurations
    .filter((d) => d.lineKind === 'b1_software')
    .reduce((acc, d) => acc + d.durationMs, 0);
  const otherDurationMs = telemetry.sessionDurations
    .filter((d) => d.lineKind === 'other_branch')
    .reduce((acc, d) => acc + d.durationMs, 0);
  const retestPendingCount = Object.values(telemetry.cardStats).filter(
    (c) => typeof c.retestStage === 'number' && c.retestStage > 0
  ).length;
  const isLive = hasLiveTelemetry(telemetry);

  const handleSmokeWriteAi = async () => {
    await recordStudyDuration({
      branchId: 'B1',
      trackId: 'b1-ai-l1',
      unitId: 'unit-b1-l1-sample',
      activity: 'guide',
      durationMs: 15 * 60 * 1000,
    });
    const next = await recordQuizAttempt({
      unitId: 'unit-b1-l1-sample',
      branchId: 'B1',
      trackId: 'b1-ai-l1',
      questionId: 'q-b1-sample-1',
      conceptId: 'b1.prompt_context_boundary',
      kind: 'quiz',
      selectedIndex: 0,
      isCorrect: false,
      durationMs: 18500,
    });
    setTelemetry(next);
    setStatusMsg('已写入 AI L1 用时（15 min）与 1 条错题留痕（已自动挂入 1/3/7 天重测队列），可刷新浏览器验证持久化。');
  };

  const handleSmokeWriteBlender = async () => {
    await recordStudyDuration({
      branchId: 'B1',
      trackId: 'b1-sw-blender',
      activity: 'action_task',
      durationMs: 25 * 60 * 1000,
    });
    await recordActionSubmission({
      unitId: 'unit-b1-l1-sample',
      branchId: 'B1',
      trackId: 'b1-ai-l1',
      deliverableSummary: '完成可复用文献核查 Prompt 模板',
      feynmanOneLiner: '给模型划清原文锚点并允许答未知，才能阻断概率续写幻觉。',
      quizPassScoreRatio: 1,
      isCleared: true,
    });
    const next = await recordMilestoneSubmission({
      trackId: 'b1-sw-blender',
      branchId: 'B1',
      completionPercent: 40,
      artifactSummary: 'bpy 批量生成晶体球阵列初版脚本',
      isApproved: false,
    });
    setTelemetry(next);
    setStatusMsg('已写入 Blender 软件线用时（25 min）、单元行动过关与里程碑产出完成度（40%）。');
  };

  const handleExport = async () => {
    const json = await exportTelemetryJson();
    setBackupPreview(json);
    setStatusMsg('已导出当前 IndexedDB 全量留痕 JSON 快照。');
  };

  const handleImport = async () => {
    if (!backupPreview.trim()) {
      setStatusMsg('请先点击「导出 JSON 备份」或在文本框粘贴合法的备份 JSON。');
      return;
    }
    try {
      const next = await importTelemetryJson(backupPreview);
      setTelemetry(next);
      setStatusMsg('备份 JSON 导入校验成功，BroadcastChannel 已广播同步。');
    } catch (err) {
      setStatusMsg(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleClear = async () => {
    const next = await clearTelemetry();
    setTelemetry(next);
    setBackupPreview('');
    setStatusMsg('已清空测试留痕，数据源标识已回退为 DEMO 示例兜底态。');
  };

  return (
    <main class="page-shell">
      <header class="hero-header">
        <div>
          <h1 class="hero-title">现代必备生存指南</h1>
          <p class="hero-subtitle">
            过日子的生产力与生活掌控感平台 · M1 工程底座与全量留痕存储层就绪
          </p>
        </div>
        <span class={`badge-pill ${isLive ? 'badge-live' : 'badge-demo'}`}>
          {isLive ? '● LIVE · 真实留痕已激活' : '○ DEMO · 尚无留痕（示例兜底态）'}
        </span>
      </header>

      <section class="section-card" aria-label="IndexedDB 全量留痕冒烟自查台">
        <h2 class="section-heading">
          <span>M1 · IndexedDB 全量行为留痕与备份自查台</span>
          <span class="badge-pill">活跃天数 {telemetry.activeDates.length} 天</span>
        </h2>
        <div class="metrics-grid">
          <div class="metric-box">
            <div class="metric-label">B1 · AI 能力线投入</div>
            <div class="metric-value">{formatMinutes(aiDurationMs)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">B1 · 软件技能线投入</div>
            <div class="metric-value">{formatMinutes(swDurationMs)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">其余生活分支投入</div>
            <div class="metric-value">{formatMinutes(otherDurationMs)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">作答留痕 / 待重测概念</div>
            <div class="metric-value">
              {telemetry.attemptLogs.length} / {retestPendingCount}
            </div>
          </div>
          <div class="metric-box">
            <div class="metric-label">行动过关 / 里程碑记录</div>
            <div class="metric-value">
              {Object.keys(telemetry.unitSubmissions).length} /{' '}
              {Object.keys(telemetry.milestoneSubmissions).length}
            </div>
          </div>
        </div>

        <div class="btn-row">
          <button type="button" class="btn-primary" onClick={handleSmokeWriteAi}>
            模拟记录 AI 线用时 + 错题重测留痕
          </button>
          <button type="button" onClick={handleSmokeWriteBlender}>
            模拟记录软件线（Blender）用时 + 产出提交
          </button>
          <button type="button" onClick={handleExport}>
            导出 JSON 备份
          </button>
          <button type="button" onClick={handleImport}>
            回导校验 JSON
          </button>
          <button type="button" onClick={handleClear}>
            清空测试留痕
          </button>
        </div>

        {statusMsg && <div class="status-note">{statusMsg}</div>}
        {backupPreview && (
          <textarea
            aria-label="JSON 备份预览"
            value={backupPreview}
            onInput={(e) => setBackupPreview((e.target as HTMLTextAreaElement).value)}
            rows={6}
            style={{
              width: '100%',
              marginTop: '12px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              padding: '10px',
              borderRadius: '10px',
              border: '1px solid var(--border-warm)',
              background: 'var(--bg-subtle)',
            }}
          />
        )}
      </section>

      <section aria-label="七大生存分支结构概览">
        <h2 class="section-heading">
          <span>七大生存分支结构（纯 JSON 驱动 · 共 {content.knowledgeGraph.nodes.length} 个图谱节点）</span>
          <span class="badge-pill">样板占位单元 {content.units.length} 节</span>
        </h2>
        <div class="branches-grid">
          {content.catalog.branches.map((branch) => (
            <article class="branch-card" key={branch.id}>
              <span class="branch-tag" style={{ backgroundColor: branch.accentToken }}>
                {branch.id} · {branch.name}
              </span>
              <div style={{ fontWeight: 600, fontSize: '15px' }}>{branch.subtitle}</div>
              <ul class="track-list">
                {branch.tracks.map((track) => (
                  <li key={track.id}>
                    <strong>{track.title}</strong>
                    {track.unlockAfterTrackId ? `（需先过 ${track.unlockAfterTrackId}）` : ''}
                  </li>
                ))}
              </ul>
              {content.units
                .filter((u) => u.branchId === branch.id)
                .map((u) => (
                  <div class="placeholder-box" key={u.id}>
                    <span class="badge-pill badge-demo" style={{ marginRight: '6px' }}>
                      示例占位
                    </span>
                    {u.title.replace(/^【示例占位】/, '')}
                  </div>
                ))}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
