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

const CHALLENGE_PRESETS = [
  {
    monthLabel: '2026-11',
    title: '早睡 14 天小挑战（23:30 前放下手机）',
    hypothesis: '睡前少刷半小时亮屏，第二天早上起来不那么昏沉，下午也不容易犯困。',
    independentVar: '23:15 把手机放到桌角充电、23:30 准时关灯',
    metricName: '第二天精神状态',
    metricUnit: '分(1-10)',
    baselineValue: 5.5,
  },
  {
    monthLabel: '2026-11',
    title: '21 天网购冷静 48 小时小挑战',
    hypothesis: '非必需品先放购物车过两天再决定买不买，月底明显能多留下一笔开心钱。',
    independentVar: '超过 30 元的非刚需物品先搁购物车 48 小时',
    metricName: '当天冲动零花',
    metricUnit: '元',
    baselineValue: 65,
  },
  {
    monthLabel: '2026-11',
    title: '下午戒含糖奶茶、改喝温水或清茶',
    hypothesis: '午饭后少碰高糖饮料，下午两三点不再突然眼皮打架。',
    independentVar: '中午 12 点以后不点含糖饮料',
    metricName: '下午清醒舒服时长',
    metricUnit: '分钟',
    baselineValue: 45,
  },
  {
    monthLabel: '2026-11',
    title: '每周慢跑或快走 3 次找回状态',
    hypothesis: '不追求配速，晚风舒服时出去动一动，压力和紧绷感会顺着汗一起散掉。',
    independentVar: '每周出门慢跑或快走 20–30 分钟',
    metricName: '运动后放松感',
    metricUnit: '分(1-10)',
    baselineValue: 6.0,
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
  const [customMetric, setCustomMetric] = useState<string>('当天体感');
  const [customBaseline, setCustomBaseline] = useState<string>('6.0');

  if (mode === 'weekly') {
    const weekly = computeWeeklyReviewSummary(content, telemetry);
    return (
      <Card className="space-y-5" aria-label="每周生活小结">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
              这周过得怎么样 · 每周生活小结
            </h2>
            <p className="mt-1 mb-0 font-mono-num text-[13px] text-[var(--ink-3)]">
              回顾周期：{weekly.windowStart} 至 {weekly.windowEnd}
            </p>
          </div>
          <Badge tone="growth">温柔回顾，不打分</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="v3-card-raised p-3.5">
            <div className="text-[12px] text-[var(--ink-3)]">这周留下足迹</div>
            <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
              {weekly.activeDaysInWeek} 天
            </strong>
          </div>
          <div className="v3-card-raised p-3.5">
            <div className="text-[12px] text-[var(--ink-3)]">静心翻阅时长</div>
            <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
              {weekly.studyMinutesInWeek} 分钟
            </strong>
          </div>
          <div className="v3-card-raised p-3.5">
            <div className="text-[12px] text-[var(--ink-3)]">读完内容 / 温习卡片</div>
            <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
              {weekly.clearedUnitTitles.length} 篇 / {weekly.practicedConceptCount} 张
            </strong>
          </div>
          <div className="v3-card-raised p-3.5">
            <div className="text-[12px] text-[var(--ink-3)]">办妥的小事</div>
            <strong className="mt-1 block font-mono-num text-[22px] font-semibold text-[var(--ink-1)]">
              {weekly.completedActions.length} 件
            </strong>
          </div>
        </div>

        {weekly.lifeHabitsSummary && (
          <div className="glass-plate grid grid-cols-3 gap-3 p-4">
            <div>
              <div className="text-[12px] text-[var(--ink-3)]">近 7 天运动累计</div>
              <strong className="font-mono-num mt-0.5 block text-[17px] font-semibold text-[var(--ink-1)]">
                {weekly.lifeHabitsSummary.totalRunKm} km
              </strong>
            </div>
            <div>
              <div className="text-[12px] text-[var(--ink-3)]">近 7 天平均睡眠</div>
              <strong className="font-mono-num mt-0.5 block text-[17px] font-semibold text-[var(--ink-1)]">
                {weekly.lifeHabitsSummary.avgSleepHours !== null
                  ? `${weekly.lifeHabitsSummary.avgSleepHours} h`
                  : '还没记'}
              </strong>
            </div>
            <div>
              <div className="text-[12px] text-[var(--ink-3)]">喝水喝够的天数</div>
              <strong className="font-mono-num mt-0.5 block text-[17px] font-semibold text-[var(--ink-1)]">
                {weekly.lifeHabitsSummary.waterGoalDays} / {weekly.lifeHabitsSummary.loggedDays} 天
              </strong>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="v3-card-raised space-y-2 p-4">
            <h3 className="m-0 text-[13.5px] font-semibold text-[var(--ink-1)]">
              这周掌握的生活招数
            </h3>
            {weekly.clearedUnitTitles.length === 0 ? (
              <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
                这周慢慢来也没关系，顺手翻过几张卡片、记了几杯水也是好好照顾自己
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
              这周顺手办妥的事
            </h3>
            {weekly.completedActions.length === 0 ? (
              <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
                还没记完结的小事，去「生活待办」挑一件 5 分钟能做完的划掉会很爽
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

        {weekly.activeExperimentBrief && (
          <div className="rounded-[10px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
            <div className="mb-1 text-[12px] font-semibold text-[var(--accent)]">
              正在进行的日常小挑战
            </div>
            <p className="m-0 text-[14px] text-[var(--ink-1)]">{weekly.activeExperimentBrief}</p>
          </div>
        )}

        <div className="rounded-[10px] border border-[var(--growth-border)] bg-[var(--growth-soft)] p-4">
          <Badge tone="growth">给下周的一句温和提醒</Badge>
          <p className="mt-2 mb-0 text-[14.5px] leading-[1.65] text-[var(--ink-1)]">
            {weekly.nextWeekSuggestion}
          </p>
        </div>
      </Card>
    );
  }

  const experiments = telemetry.lifeLabExperiments ?? [];
  const activeExp = experiments[0];

  const handleStartPreset = async (preset: (typeof CHALLENGE_PRESETS)[number]) => {
    const next = await createLifeLabExperiment(preset);
    onTelemetryChange(next);
    toast.success(`开启小挑战：${preset.title}`);
  };

  const handleCreateCustom = async () => {
    if (!customTitle.trim()) return;
    const next = await createLifeLabExperiment({
      monthLabel: getLocalDateKey().slice(0, 7),
      title: customTitle.trim(),
      hypothesis: '试着温和坚持两周，看看身体和心情有没有悄悄变舒服。',
      independentVar: customTitle.trim(),
      metricName: customMetric.trim() || '当天体感',
      metricUnit: '分',
      baselineValue: Number(customBaseline) || 5,
    });
    setCustomTitle('');
    onTelemetryChange(next);
    toast.success('已开启你的日常小挑战');
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
    toast.success('记好今天这一笔啦');
  };

  const renderChallengeChart = () => {
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
          caption="小挑战每天体感变化 vs 平时状态参考线"
          spec={{
            template: 'curve_compare',
            data: {
              series: [
                {
                  label: `挑战期间 ${activeExp.metricName} (${activeExp.metricUnit})`,
                  points: pointsForLine,
                },
                {
                  label: `平时大概水平 (${activeExp.baselineValue} ${activeExp.metricUnit})`,
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
            日常小挑战 · 试一个好习惯，看看体感变不变舒服
          </h2>
          <p className="mt-1 mb-0 text-[13.5px] text-[var(--ink-2)]">
            不用立大 flag，一次只挑一件温柔小事试一两周，每天随手打个分，结果会自动同步到书桌状态墙
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-[var(--ink-3)]">直接选一个开始：</span>
          {CHALLENGE_PRESETS.map((p) => (
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
            placeholder="或写一个你想试的小习惯，如：每天早起喝一杯温水"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
          />
          <input
            type="text"
            className="v3-input"
            placeholder="每天记录什么感受"
            value={customMetric}
            onChange={(e) => setCustomMetric(e.target.value)}
          />
          <input
            type="number"
            step="0.5"
            className="v3-input font-mono-num"
            placeholder="平时大概分"
            value={customBaseline}
            onChange={(e) => setCustomBaseline(e.target.value)}
          />
          <Button variant="primary" disabled={!customTitle.trim()} onClick={handleCreateCustom}>
            开启挑战
          </Button>
        </div>
      </Card>

      {activeExp ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="growth">正在进行 · {activeExp.monthLabel}</Badge>
            <Badge tone="neutral" className="font-mono-num">
              平时参考 {activeExp.baselineValue} {activeExp.metricUnit}
            </Badge>
            <Badge tone="neutral" className="font-mono-num">
              已打卡 {activeExp.entries.length} 天
            </Badge>
          </div>

          <div className="space-y-1">
            <h3 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
              {activeExp.title}
            </h3>
            <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
              <strong className="font-medium text-[var(--ink-1)]">每天只做这一件：</strong>
              {activeExp.independentVar} —— {activeExp.hypothesis}
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
              placeholder={`今天 ${activeExp.metricName}`}
            />
            <input
              type="text"
              className="v3-input"
              value={entryNote}
              onChange={(e) => setEntryNote(e.target.value)}
              placeholder="随手记一句感受（如：昨晚按时关灯，今天下午居然没犯困）"
            />
            <Button variant="primary" onClick={handleAddEntry}>
              今天打卡
            </Button>
          </div>

          {renderChallengeChart()}

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
              试完几天的真实感受（值不值得留成长期习惯？）
            </label>
            <textarea
              rows={2}
              className="v3-textarea"
              value={activeExp.conclusion ?? ''}
              placeholder="记录几天后，写一句自己的真实体感结论…"
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
            还没有开启小挑战呢，点上方任意一个轻松模板就能开始你的第一轮习惯小实验
          </div>
        </Card>
      )}
    </div>
  );
}
