import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ExactDiagram } from '@/components/ExactDiagram';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import {
  addLifeLabEntry,
  createLifeLabExperiment,
  getLocalDateKey,
  updateLifeLabConclusion,
} from '@/core/db';
import { computeWeeklyReviewSummary } from '@/core/scheduler';
import type { TelemetrySnapshot } from '@/types/schema';

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
      <Card className="space-y-5" aria-label="每周生活复盘">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
              每周生活与学习复盘
            </h2>
            <p className="mt-1 mb-0 font-mono-num text-[13px] text-[var(--ink-3)]">
              统计周期：{weekly.windowStart} 至 {weekly.windowEnd}
            </p>
          </div>
          <Badge tone="growth">自动聚合本周真实留痕</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="v3-card-raised p-3.5">
            <div className="text-[12px] text-[var(--ink-3)]">近 7 日点亮</div>
            <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
              {weekly.activeDaysInWeek} 天
            </strong>
          </div>
          <div className="v3-card-raised p-3.5">
            <div className="text-[12px] text-[var(--ink-3)]">专注学习时长</div>
            <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
              {weekly.studyMinutesInWeek} min
            </strong>
          </div>
          <div className="v3-card-raised p-3.5">
            <div className="text-[12px] text-[var(--ink-3)]">过关单元 / 概念</div>
            <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
              {weekly.clearedUnitTitles.length} 节 / {weekly.practicedConceptCount} 个
            </strong>
          </div>
          <div className="v3-card-raised p-3.5">
            <div className="text-[12px] text-[var(--ink-3)]">落地真实行动</div>
            <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
              {weekly.completedActions.length} 项
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="v3-card-raised space-y-2 p-4">
            <h3 className="m-0 text-[13.5px] font-semibold text-[var(--ink-1)]">
              本周掌握与过关单元
            </h3>
            {weekly.clearedUnitTitles.length === 0 ? (
              <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
                本周尚无新过关单元，翻过几张概念卡也是有效推进
              </p>
            ) : (
              <ul className="m-0 list-disc space-y-1 pl-5 text-[13.5px] text-[var(--ink-2)]">
                {weekly.clearedUnitTitles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="v3-card-raised space-y-2 p-4">
            <h3 className="m-0 text-[13.5px] font-semibold text-[var(--ink-1)]">
              本周落地的真实行动
            </h3>
            {weekly.completedActions.length === 0 ? (
              <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
                暂无已归档行动记录，可从「真实任务池」挑一件小事顺手落地
              </p>
            ) : (
              <ul className="m-0 list-disc space-y-1 pl-5 text-[13.5px] text-[var(--ink-2)]">
                {weekly.completedActions.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {weekly.lifeHabitsSummary && (
          <div className="glass-plate grid grid-cols-3 gap-3 p-4">
            <div>
              <div className="text-[12px] text-[var(--ink-3)]">近 7 日跑步累计</div>
              <strong className="font-mono-num mt-0.5 block text-[17px] font-semibold text-[var(--ink-1)]">
                {weekly.lifeHabitsSummary.totalRunKm} km
              </strong>
            </div>
            <div>
              <div className="text-[12px] text-[var(--ink-3)]">近 7 日平均睡眠</div>
              <strong className="font-mono-num mt-0.5 block text-[17px] font-semibold text-[var(--ink-1)]">
                {weekly.lifeHabitsSummary.avgSleepHours !== null
                  ? `${weekly.lifeHabitsSummary.avgSleepHours} h`
                  : '未记录'}
              </strong>
            </div>
            <div>
              <div className="text-[12px] text-[var(--ink-3)]">饮水达标天数</div>
              <strong className="font-mono-num mt-0.5 block text-[17px] font-semibold text-[var(--ink-1)]">
                {weekly.lifeHabitsSummary.waterGoalDays} / {weekly.lifeHabitsSummary.loggedDays} 天
              </strong>
            </div>
          </div>
        )}

        {weekly.activeExperimentBrief && (
          <div className="rounded-[10px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
            <div className="mb-1 text-[12px] font-semibold text-[var(--accent)]">
              本月生活实验室动态
            </div>
            <p className="m-0 text-[14px] text-[var(--ink-1)]">{weekly.activeExperimentBrief}</p>
          </div>
        )}

        <div className="rounded-[10px] border border-[var(--growth-border)] bg-[var(--growth-soft)] p-4">
          <Badge tone="growth">下周可执行建议</Badge>
          <p className="mt-2 mb-0 text-[14.5px] leading-[1.65] text-[var(--ink-1)]">
            {weekly.nextWeekSuggestion}
          </p>
        </div>
      </Card>
    );
  }

  const experiments = telemetry.lifeLabExperiments ?? [];
  const activeExp = experiments[0];

  const handleStartPreset = async (preset: (typeof EXPERIMENT_PRESETS)[number]) => {
    const next = await createLifeLabExperiment(preset);
    onTelemetryChange(next);
    toast.success(`已立项实验：${preset.title}`);
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
    toast.success('已立项自定义生活实验');
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
    toast.success('已记录今日实验数据');
  };

  const renderExperimentChart = () => {
    if (!activeExp || activeExp.entries.length === 0) return null;
    const allVals = [activeExp.baselineValue, ...activeExp.entries.map((e) => e.value)];
    const maxV = Math.max(...allVals, 1) * 1.15;
    const norm = (v: number) => Math.round((Math.max(0, v) / maxV) * 92);

    const observedPts = activeExp.entries.map((e) => norm(e.value));
    const pointsForLine =
      observedPts.length === 1 ? [norm(activeExp.baselineValue), observedPts[0]] : observedPts;
    const baselinePts = pointsForLine.map(() => norm(activeExp.baselineValue));

    return (
      <div className="my-4">
        <ExactDiagram
          compact
          caption="实验期实测指标 vs 实验前基线动态对比"
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
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
            月度生活实验室 · 定变量、记数据、看前后变化
          </h2>
          <p className="mt-1 mb-0 text-[13.5px] text-[var(--ink-2)]">
            按科研对照实验的方式验证生活习惯，实测结果自动同步至周报与状态墙
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-[var(--ink-3)]">预设实验模板：</span>
          {EXPERIMENT_PRESETS.map((p) => (
            <Button key={p.title} size="sm" variant="subtle" onClick={() => handleStartPreset(p)}>
              <Plus size={13} strokeWidth={1.6} />
              <span>{p.title}</span>
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_120px_auto]">
          <input
            type="text"
            className="v3-input"
            placeholder="或自定义实验主题，如：连续 14 天晨起喝一杯温水"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
          />
          <input
            type="text"
            className="v3-input"
            placeholder="因变量名称"
            value={customMetric}
            onChange={(e) => setCustomMetric(e.target.value)}
          />
          <input
            type="number"
            step="0.5"
            className="v3-input font-mono-num"
            placeholder="实验前基线值"
            value={customBaseline}
            onChange={(e) => setCustomBaseline(e.target.value)}
          />
          <Button variant="primary" disabled={!customTitle.trim()} onClick={handleCreateCustom}>
            立项实验
          </Button>
        </div>
      </Card>

      {activeExp ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="growth">当前主实验 · {activeExp.monthLabel}</Badge>
            <Badge tone="neutral" className="font-mono-num">
              基线 {activeExp.baselineValue} {activeExp.metricUnit}
            </Badge>
            <Badge tone="neutral" className="font-mono-num">
              已记录 {activeExp.entries.length} 天
            </Badge>
          </div>

          <div className="space-y-1">
            <h3 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
              {activeExp.title}
            </h3>
            <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
              <strong className="font-medium text-[var(--ink-1)]">实验假设：</strong>
              {activeExp.hypothesis}（自变量：{activeExp.independentVar}）
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[150px_130px_minmax(0,1fr)_auto]">
            <input
              type="date"
              className="v3-input font-mono-num"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
            <input
              type="number"
              step="0.1"
              className="v3-input font-mono-num"
              value={entryValue}
              onChange={(e) => setEntryValue(e.target.value)}
              placeholder={`今日 ${activeExp.metricName}`}
            />
            <input
              type="text"
              className="v3-input"
              value={entryNote}
              onChange={(e) => setEntryNote(e.target.value)}
              placeholder="10 秒简注（如：昨晚按时关灯，今天下午没犯困）"
            />
            <Button variant="primary" onClick={handleAddEntry}>
              记录今日数据
            </Button>
          </div>

          {renderExperimentChart()}

          {activeExp.entries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeExp.entries.map((e) => (
                <Badge tone="neutral" className="font-mono-num" key={e.dateKey}>
                  {e.dateKey}：<strong>{e.value}</strong> {activeExp.metricUnit}
                  {e.note ? `（${e.note}）` : ''}
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-[var(--ink-1)]">
              阶段实验小结（前后对比结论）
            </label>
            <textarea
              rows={2}
              className="v3-textarea"
              value={activeExp.conclusion ?? ''}
              placeholder="记录几组数据后，写下这个习惯值不值得长期保留…"
              onChange={async (e) => {
                const next = await updateLifeLabConclusion(activeExp.id, e.target.value);
                onTelemetryChange(next);
              }}
            />
          </div>
        </Card>
      ) : (
        <Card>
          <div className="v3-card-raised p-4 text-[14px] text-[var(--ink-2)]">
            当前尚未立项月度实验，点击上方任一预设模板即可开启第一轮生活实验
          </div>
        </Card>
      )}
    </div>
  );
}
