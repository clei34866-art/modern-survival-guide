import { useState } from 'preact/hooks';
import { ExactDiagram } from '../components/ExactDiagram';
import type { PlatformContentBundle } from '../core/contentLoader';
import {
  addLifeLabEntry,
  createLifeLabExperiment,
  getLocalDateKey,
  updateLifeLabConclusion,
} from '../core/db';
import { computeWeeklyReviewSummary } from '../core/scheduler';
import type { TelemetrySnapshot } from '../types/schema';

interface LifeLabWeeklyViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  mode: 'lab' | 'weekly';
  onTelemetryChange: (next: TelemetrySnapshot) => void;
}

const EXPERIMENT_PRESETS = [
  {
    monthLabel: '2026-11',
    title: '连续 14 天 23:30 前熄灯睡眠实验',
    hypothesis: '把睡前刷手机改为纸质书或闭目呼吸，次日午后困倦度将明显下降、晨起精力提升。',
    independentVar: '23:15 手机放远充电 + 23:30 准时关灯',
    metricName: '次日晨起精力自评',
    metricUnit: '分(1-10)',
    baselineValue: 5.5,
  },
  {
    monthLabel: '2026-11',
    title: '21 天非刚需消费 48h 冷静期实验',
    hypothesis: '所有非刚需网购加购物车满 48 小时再决定付款，每周冲动支出将下降 30% 以上。',
    independentVar: '单价>30元非刚需物品强制延迟 48 小时结算',
    metricName: '当日弹性零花支出',
    metricUnit: '元',
    baselineValue: 65,
  },
  {
    monthLabel: '2026-11',
    title: '午后断游离糖与专注时长实验',
    hypothesis: '午餐后不喝含糖奶茶/饮料改喝温水或淡茶，下午 14:30–16:30 血糖波动困倦减轻。',
    independentVar: '12:00 后零含糖饮料摄入',
    metricName: '下午整块专注时长',
    metricUnit: '分钟',
    baselineValue: 45,
  },
];

export function LifeLabWeeklyView({
  content,
  telemetry,
  mode,
  onTelemetryChange,
}: LifeLabWeeklyViewProps) {
  const [entryDate, setEntryDate] = useState<string>(() => getLocalDateKey());
  const [entryValue, setEntryValue] = useState<string>('7.5');
  const [entryNote, setEntryNote] = useState<string>('');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customMetric, setCustomMetric] = useState<string>('精力自评');
  const [customBaseline, setCustomBaseline] = useState<string>('6.0');

  if (mode === 'weekly') {
    const weekly = computeWeeklyReviewSummary(content, telemetry);
    return (
      <section class="section-card" aria-label="简版每周生活复盘（周报）">
        <div class="section-heading">
          <span>简版每周生活复盘（{weekly.windowStart} 至 {weekly.windowEnd}）</span>
          <span class="badge-pill">学习 + 行动双项自动聚合 · 联动状态墙</span>
        </div>

        <div class="metrics-grid">
          <div class="metric-box">
            <div class="metric-label">近 7 日点亮天数</div>
            <div class="metric-value">{weekly.activeDaysInWeek} 天</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">本周累计专注学习</div>
            <div class="metric-value">{weekly.studyMinutesInWeek} min</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">新过关单元 / 已温习概念</div>
            <div class="metric-value">
              {weekly.clearedUnitTitles.length} 节 / {weekly.practicedConceptCount} 个
            </div>
          </div>
          <div class="metric-box">
            <div class="metric-label">落地行动任务</div>
            <div class="metric-value">{weekly.completedActions.length} 项</div>
          </div>
        </div>

        <div class="branches-grid" style={{ marginBottom: '16px' }}>
          <div class="branch-card">
            <h3 class="path-track-title" style={{ fontSize: '16px' }}>
              本周学到了什么（过关单元）
            </h3>
            {weekly.clearedUnitTitles.length === 0 ? (
              <p class="hero-subtitle" style={{ margin: 0 }}>
                本周尚无新过关单元，哪怕只翻过几张概念卡也是有效推进。
              </p>
            ) : (
              <ul class="track-list">
                {weekly.clearedUnitTitles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </div>

          <div class="branch-card">
            <h3 class="path-track-title" style={{ fontSize: '16px' }}>
              本周做成了哪些真实行动
            </h3>
            {weekly.completedActions.length === 0 ? (
              <p class="hero-subtitle" style={{ margin: 0 }}>
                暂无已归档行动记录，可从「真实任务池」挑一件小事顺手落地。
              </p>
            ) : (
              <ul class="track-list">
                {weekly.completedActions.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {weekly.activeExperimentBrief && (
          <div class="scenario-question-box" style={{ maxWidth: '100%' }}>
            <strong>本月生活实验室动态：</strong>
            {weekly.activeExperimentBrief}
          </div>
        )}

        <div class="wrap-up-card">
          <div>
            <div class="step-eyebrow" style={{ color: '#2D5942', marginBottom: '4px' }}>
              下周一条可执行建议
            </div>
            <p class="wrap-up-desc" style={{ fontSize: '15px' }}>
              {weekly.nextWeekSuggestion}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // 生活实验室视图
  const experiments = telemetry.lifeLabExperiments ?? [];
  const activeExp = experiments[0];

  const handleStartPreset = async (preset: (typeof EXPERIMENT_PRESETS)[number]) => {
    const next = await createLifeLabExperiment(preset);
    onTelemetryChange(next);
  };

  const handleCreateCustom = async () => {
    if (!customTitle.trim()) return;
    const next = await createLifeLabExperiment({
      monthLabel: getLocalDateKey().slice(0, 7),
      title: customTitle.trim(),
      hypothesis: '通过控制单一生活变量，观察连续两周以上的体感或效率变化。',
      independentVar: customTitle.trim(),
      metricName: customMetric.trim() || '观测指标',
      metricUnit: '分',
      baselineValue: Number(customBaseline) || 5,
    });
    setCustomTitle('');
    onTelemetryChange(next);
  };

  const handleAddEntry = async () => {
    if (!activeExp) return;
    const val = Number(entryValue);
    if (Number.isNaN(val)) return;
    const next = await addLifeLabEntry(activeExp.id, {
      dateKey: entryDate,
      value: val,
      note: entryNote.trim() || undefined,
    });
    setEntryNote('');
    onTelemetryChange(next);
  };

  // 将实验数值归一化映射到 0..100 供 ExactDiagram curve_compare 精确绘图
  const renderExperimentChart = () => {
    if (!activeExp || activeExp.entries.length === 0) return null;
    const allVals = [activeExp.baselineValue, ...activeExp.entries.map((e) => e.value)];
    const maxV = Math.max(...allVals, 1) * 1.15;
    const norm = (v: number) => Math.round((Math.max(0, v) / maxV) * 92);

    const observedPts = activeExp.entries.map((e) => norm(e.value));
    const pointsForLine = observedPts.length === 1 ? [norm(activeExp.baselineValue), observedPts[0]] : observedPts;
    const baselinePts = pointsForLine.map(() => norm(activeExp.baselineValue));

    return (
      <div style={{ margin: '14px 0' }}>
        <ExactDiagram
          spec={{
            template: 'curve_compare',
            data: {
              series: [
                {
                  label: `实验期实测 ${activeExp.metricName} (${activeExp.metricUnit})`,
                  points: pointsForLine,
                },
                {
                  label: `实验前基线 (${activeExp.baselineValue} ${activeExp.metricUnit})`,
                  points: baselinePts,
                },
              ],
            },
          }}
        />
      </div>
    );
  };

  return (
    <div class="life-lab-wrap">
      <section class="section-card">
        <h2 class="section-heading">
          <span>生活实验室（按科研路子过日子：定变量 · 记数据 · 看前后变化）</span>
          <span class="badge-pill">数据实时同步至状态墙「生活块」与周报</span>
        </h2>

        <div class="btn-row" style={{ marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--ink-secondary)', alignSelf: 'center' }}>
            一键开启本月实验模板：
          </span>
          {EXPERIMENT_PRESETS.map((p) => (
            <button
              key={p.title}
              type="button"
              class="btn-sm"
              onClick={() => handleStartPreset(p)}
            >
              + {p.title}
            </button>
          ))}
        </div>

        <div class="task-pool-form">
          <input
            type="text"
            placeholder="或自定义实验主题，如：连续 14 天晨起喝一杯温水"
            value={customTitle}
            onInput={(e) => setCustomTitle((e.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            placeholder="因变量名称"
            value={customMetric}
            onInput={(e) => setCustomMetric((e.target as HTMLInputElement).value)}
          />
          <input
            type="number"
            step="0.5"
            placeholder="实验前基线值"
            value={customBaseline}
            onInput={(e) => setCustomBaseline((e.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="btn-primary"
            disabled={!customTitle.trim()}
            onClick={handleCreateCustom}
          >
            立项实验
          </button>
        </div>
      </section>

      {activeExp ? (
        <section class="section-card">
          <div class="path-track-badges">
            <span class="badge-pill badge-live">当前主实验 · {activeExp.monthLabel}</span>
            <span class="badge-pill">
              基线：{activeExp.baselineValue} {activeExp.metricUnit}
            </span>
            <span class="badge-pill">已记录 {activeExp.entries.length} 天</span>
          </div>
          <h3 class="path-track-title">{activeExp.title}</h3>
          <p class="path-track-summary">
            <strong>实验假设：</strong>
            {activeExp.hypothesis}（自变量：{activeExp.independentVar}）
          </p>

          <div class="task-pool-form" style={{ marginBottom: '14px' }}>
            <input
              type="date"
              value={entryDate}
              onInput={(e) => setEntryDate((e.target as HTMLInputElement).value)}
            />
            <input
              type="number"
              step="0.1"
              value={entryValue}
              onInput={(e) => setEntryValue((e.target as HTMLInputElement).value)}
              placeholder={`今日 ${activeExp.metricName} (${activeExp.metricUnit})`}
            />
            <input
              type="text"
              value={entryNote}
              onInput={(e) => setEntryNote((e.target as HTMLInputElement).value)}
              placeholder="10 秒简注（如：昨晚按时关灯，今天下午没犯困）"
            />
            <button type="button" class="btn-primary" onClick={handleAddEntry}>
              记录今日数据
            </button>
          </div>

          {renderExperimentChart()}

          {activeExp.entries.length > 0 && (
            <div class="weakness-top5-list" style={{ marginBottom: '14px' }}>
              {activeExp.entries.map((e) => (
                <span class="badge-pill" key={e.dateKey}>
                  {e.dateKey}：<strong>{e.value}</strong> {activeExp.metricUnit}
                  {e.note ? `（${e.note}）` : ''}
                </span>
              ))}
            </div>
          )}

          <div class="form-field-block" style={{ marginBottom: 0 }}>
            <label class="form-label">阶段实验小结（前后对比结论）：</label>
            <textarea
              rows={2}
              value={activeExp.conclusion ?? ''}
              placeholder="记录几组数据后，写下这个习惯值不值得长期保留…"
              onInput={async (e) => {
                const next = await updateLifeLabConclusion(
                  activeExp.id,
                  (e.target as HTMLTextAreaElement).value
                );
                onTelemetryChange(next);
              }}
            />
          </div>
        </section>
      ) : (
        <section class="section-card">
          <div class="empty-track-notice" style={{ marginBottom: 0 }}>
            当前尚未立项月度实验，点击上方任一预设模板即可开始第一轮生活实验。
          </div>
        </section>
      )}
    </div>
  );
}
