import { Calculator, Coffee, Copy, MessageSquareHeart, MoonStar, PiggyBank } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export type LifeToolKey = 'budget' | 'sleep' | 'compound' | 'message';

interface LifeToolsSandboxProps {
  mode?: 'all' | LifeToolKey;
  compact?: boolean;
}

const BUDGET_PRESETS = [
  { id: 'student', label: '学生生活费', needs: 55, wants: 25, save: 20, income: 2500 },
  { id: 'renting', label: '刚工作租房', needs: 50, wants: 30, save: 20, income: 7500 },
  { id: 'saver', label: '稳健多攒一点', needs: 45, wants: 20, save: 35, income: 9000 },
] as const;

const MESSAGE_REWRITES = [
  {
    id: 'mentor',
    scene: '找导师 / 上司请教问题',
    awkward: '老师在吗？我实验这边有点问题想问一下您。',
    smooth:
      '老师好，我在整理第 3 组实验数据时遇到一个异常点（已排除仪器归零误差，附图），想请教是按 A 方案重测还是按 B 方案标注，您方便时回复「A/B」即可，谢谢老师！',
    highlights: ['删掉空洞的“在吗”', '先说已尝试的排查', '给对方一个 10 秒能选的明确选项'],
  },
  {
    id: 'landlord',
    scene: '找房东催修家电 / 退押金',
    awkward: '房东，洗衣机又坏了，怎么老出毛病啊，能快点修吗？',
    smooth:
      '房东您好，客厅洗衣机今天脱水报 E3 故障（刚拍了 5 秒小视频发您）。按合同家电自然损耗由房东维修，我查了品牌售后周六上午有档期，您看是由您联系师傅，还是我约好后把维修发票发您抵扣下月房租？',
    highlights: ['附清晰故障证据减少扯皮', '温和点出合同约定', '直接给出两种省心解法'],
  },
  {
    id: 'decline',
    scene: '委婉拒绝不想去的聚餐 / 局',
    awkward: '哎呀我最近好忙啊，可能去不了了，真不好意思下次一定吧。',
    smooth:
      '谢谢叫我呀！这周连续赶完事实在电量见底，周六想在家彻底充一天电，这次就不凑热闹啦～祝你们吃得开心，下个月轻松了约你喝咖啡！',
    highlights: ['大方表达感谢不找拙劣借口', '真诚说明状态减少心理负担', '留出舒服的下次邀约感'],
  },
  {
    id: 'help',
    scene: '小组 / 工作卡壳需要求助',
    awkward: '这部分我完全看不懂，感觉做不完，怎么办呀？',
    smooth:
      '我把前半段资料已经整理好了（文档第 1–3 页），目前卡在「图 2 配色对齐」这一步，试过两种导出还是模糊。方便抽 5 分钟帮我瞄一眼参数吗？',
    highlights: ['先亮出已完成进度让人放心', '精准框定卡点位置', '说明只需要很短时间降低对方心理门槛'],
  },
] as const;

function formatHourDecimal(h: number): string {
  const wrapped = ((h % 24) + 24) % 24;
  const hh = Math.floor(wrapped);
  const mm = Math.round((wrapped - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
}

export function LifeToolsSandbox({ mode = 'all', compact = false }: LifeToolsSandboxProps) {
  const [activeTool, setActiveTool] = useState<LifeToolKey>(mode === 'all' ? 'sleep' : mode);
  const currentTool: LifeToolKey = mode === 'all' ? activeTool : mode;

  // 1. 预算三桶分账器
  const [monthlyIncome, setMonthlyIncome] = useState<number>(6000);
  const [presetId, setPresetId] = useState<(typeof BUDGET_PRESETS)[number]['id']>('renting');
  const budgetPreset =
    BUDGET_PRESETS.find((p) => p.id === presetId) ?? BUDGET_PRESETS[1];

  // 2. 熬夜与午休精力测算器
  const [bedHour, setBedHour] = useState<number>(25.0); // 25.0 表示凌晨 01:00
  const [wakeHour, setWakeHour] = useState<number>(8.0);
  const [napMins, setNapMins] = useState<number>(20);

  // 3. 省钱冷静与复利感知器
  const [impulseCost, setImpulseCost] = useState<number>(32);
  const [weeklyTimes, setWeeklyTimes] = useState<number>(4);
  const [years, setYears] = useState<number>(5);

  // 4. 高情商发消息改写对照器
  const [msgIdx, setMsgIdx] = useState<number>(0);
  const [showSmooth, setShowSmooth] = useState<boolean>(true);

  const sleepCalc = useMemo(() => {
    const rawDuration = wakeHour + 24 - bedHour;
    const sleepHours = Math.max(2, Math.min(13, Math.round(rawDuration * 10) / 10));
    const debt = Math.max(0, Math.round((7.5 - sleepHours) * 10) / 10);
    const napPenalty = napMins > 35 ? (napMins - 30) * 0.015 : 0;
    const napBoost = napMins >= 10 && napMins <= 30 ? 11 : napMins > 30 ? 6 : 0;
    const coffeeCutoff = Math.min(16, Math.max(12.5, Math.round((wakeHour + 6) * 2) / 2));
    const tonightBed = Math.max(22.5, Math.min(24.0, 23.5 - Math.min(0.75, debt * 0.25)));

    // 08:00 到 23:00 的 6 个时间点精力估算 (0-100)
    const hours = [8, 11, 14, 17, 20, 23];
    const baseEnergy = Math.max(42, Math.min(92, 55 + (sleepHours - 5) * 12));
    const curve = hours.map((hr) => {
      let val = baseEnergy;
      if (hr === 11) val += 6;
      if (hr === 14) val -= 18 + debt * 3.2 - napBoost;
      if (hr === 17) val += 4 - debt * 2;
      if (hr === 20) val -= 8 + debt * 2.5 - napPenalty * 40;
      if (hr === 23) val -= 26 - napPenalty * 65;
      return Math.max(18, Math.min(98, Math.round(val)));
    });

    let advice = '昨晚睡得挺扎实，今天按平时节奏来就好，下午犯困时起身倒杯温水。';
    if (napMins > 40) {
      advice = `午休 ${napMins} 分钟偏长，容易进入深睡反而醒来头晕、影响今晚入睡；建议缩到 20 分钟以内。`;
    } else if (debt >= 1.5) {
      advice = `昨晚少睡约 ${debt} 小时：午休控制在 20 分钟，${formatHourDecimal(coffeeCutoff)} 后不再碰咖啡，今晚提前到 ${formatHourDecimal(tonightBed)} 放手机即可温和补回。`;
    }
    return { sleepHours, debt, coffeeCutoff, tonightBed, hours, curve, advice };
  }, [bedHour, wakeHour, napMins]);

  const compoundCalc = useMemo(() => {
    const monthlySaved = Math.round((impulseCost * weeklyTimes * 52) / 12);
    const annualRate = 0.04; // 温和稳健假设 4% 仅作科普复利示意
    const pointsPlain: number[] = [];
    const pointsCompound: number[] = [];
    for (let y = 1; y <= years; y += 1) {
      pointsPlain.push(monthlySaved * 12 * y);
      const r = annualRate / 12;
      const n = y * 12;
      const fv = Math.round(monthlySaved * ((Math.pow(1 + r, n) - 1) / r));
      pointsCompound.push(fv);
    }
    const finalPlain = pointsPlain[pointsPlain.length - 1] ?? 0;
    const finalCompound = pointsCompound[pointsCompound.length - 1] ?? 0;
    const shortTrips = Math.max(1, Math.floor(finalPlain / 1500));
    return { monthlySaved, finalPlain, finalCompound, shortTrips, pointsPlain, pointsCompound };
  }, [impulseCost, weeklyTimes, years]);

  const currentMsg = MESSAGE_REWRITES[msgIdx] ?? MESSAGE_REWRITES[0];

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(currentMsg.smooth);
      toast.success('已复制这条高情商模板，改改细节就能发');
    } catch {
      toast('可以长按或手动选中上方文字复制');
    }
  };

  return (
    <div
      className={cn('space-y-4', !compact && 'v3-card p-5 sm:p-6')}
      data-testid="life-tools-sandbox"
    >
      {mode === 'all' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--dawn)]">
              <Calculator size={13} strokeWidth={1.8} />
              <span>随手算一笔 · 实用生活小算盘</span>
            </div>
            <h2 className="mt-1 mb-0 text-[18px] font-semibold text-[var(--ink-1)]">
              拖一拖滑块，把抽象常识变成自己的真实数字
            </h2>
          </div>

          <div
            className="glass-plate flex flex-wrap items-center gap-1 p-1"
            role="tablist"
            aria-label="生活小算盘切换"
          >
            {(
              [
                { id: 'sleep', label: '熬夜补觉', icon: MoonStar },
                { id: 'budget', label: '工资分账', icon: PiggyBank },
                { id: 'compound', label: '少冲动攒钱', icon: Coffee },
                { id: 'message', label: '高情商发消息', icon: MessageSquareHeart },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isSelected = currentTool === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`life-tool-tab-${item.id}`}
                  onClick={() => setActiveTool(item.id)}
                  className={cn(
                    'inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium transition-colors',
                    isSelected
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                  )}
                >
                  <Icon size={13} strokeWidth={1.7} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. 熬夜与午休精力测算器 */}
      {currentTool === 'sleep' && (
        <div className="glass-plate space-y-4 p-4 sm:p-5" data-testid="sandbox-sleep">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14.5px] font-semibold text-[var(--ink-1)]">
              熬夜与午休精力测算器
            </span>
            <Badge tone={sleepCalc.debt >= 1.5 ? 'warning' : 'growth'} className="font-mono-num">
              实睡 {sleepCalc.sleepHours} 小时 · 欠觉 {sleepCalc.debt}h
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-[12.5px] text-[var(--ink-2)]">
              <div className="flex justify-between">
                <span>昨晚入睡</span>
                <strong className="font-mono-num text-[var(--ink-1)]">
                  {formatHourDecimal(bedHour)}
                </strong>
              </div>
              <input
                type="range"
                min={22}
                max={27.5}
                step={0.5}
                value={bedHour}
                onChange={(e) => setBedHour(Number(e.target.value))}
                className="v3-range"
              />
            </label>

            <label className="space-y-1.5 text-[12.5px] text-[var(--ink-2)]">
              <div className="flex justify-between">
                <span>今早起床</span>
                <strong className="font-mono-num text-[var(--ink-1)]">
                  {formatHourDecimal(wakeHour)}
                </strong>
              </div>
              <input
                type="range"
                min={6}
                max={12}
                step={0.5}
                value={wakeHour}
                onChange={(e) => setWakeHour(Number(e.target.value))}
                className="v3-range"
              />
            </label>

            <label className="space-y-1.5 text-[12.5px] text-[var(--ink-2)]">
              <div className="flex justify-between">
                <span>午休小憩</span>
                <strong className="font-mono-num text-[var(--ink-1)]">{napMins} 分钟</strong>
              </div>
              <input
                type="range"
                min={0}
                max={90}
                step={5}
                value={napMins}
                onChange={(e) => setNapMins(Number(e.target.value))}
                className="v3-range"
              />
            </label>
          </div>

          {/* 今日精力走势小折线 */}
          <svg
            viewBox="0 0 560 128"
            className="block h-auto w-full"
            role="img"
            aria-label="今日各时段精力波动示意曲线"
          >
            {[28, 62, 96].map((y) => (
              <line
                key={y}
                x1="28"
                y1={y}
                x2="532"
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
              />
            ))}
            <path
              d={sleepCalc.curve
                .map((v, idx) => {
                  const x = 44 + idx * 94;
                  const y = 102 - (v / 100) * 80;
                  return `${idx === 0 ? 'M' : 'L'} ${x} ${y.toFixed(1)}`;
                })
                .join(' ')}
              fill="none"
              stroke="var(--growth)"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            {sleepCalc.curve.map((v, idx) => {
              const x = 44 + idx * 94;
              const y = 102 - (v / 100) * 80;
              return (
                <g key={sleepCalc.hours[idx]}>
                  <circle
                    cx={x}
                    cy={y}
                    r="4.5"
                    fill="var(--surface-solid)"
                    stroke="var(--growth)"
                    strokeWidth="2"
                  />
                  <text
                    x={x}
                    y={Math.max(14, y - 9)}
                    textAnchor="middle"
                    fontSize="11"
                    fontFamily="var(--font-mono)"
                    fill="var(--ink-1)"
                  >
                    {v}
                  </text>
                  <text
                    x={x}
                    y="120"
                    textAnchor="middle"
                    fontSize="11"
                    fontFamily="var(--font-mono)"
                    fill="var(--ink-3)"
                  >
                    {sleepCalc.hours[idx]}:00
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[13px] text-[var(--ink-2)]">
              最晚咖啡 / 浓茶截止：
              <strong className="font-mono-num text-[var(--dawn)]">
                {formatHourDecimal(sleepCalc.coffeeCutoff)}
              </strong>
            </div>
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[13px] text-[var(--ink-2)]">
              今晚建议放手机上床：
              <strong className="font-mono-num text-[var(--growth)]">
                {formatHourDecimal(sleepCalc.tonightBed)}
              </strong>
            </div>
          </div>

          <p className="m-0 text-[13.5px] leading-[1.65] text-[var(--ink-1)]">
            {sleepCalc.advice}
          </p>
        </div>
      )}

      {/* 2. 生活费 / 工资三桶分账器 */}
      {currentTool === 'budget' && (
        <div className="glass-plate space-y-4 p-4 sm:p-5" data-testid="sandbox-budget">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14.5px] font-semibold text-[var(--ink-1)]">
              生活费 / 工资三桶分账器
            </span>
            <div className="flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPresetId(p.id);
                    setMonthlyIncome(p.income);
                  }}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                    presetId === p.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                      : 'border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5 text-[13px] text-[var(--ink-2)]">
            <div className="flex justify-between">
              <span>每月到手生活费 / 工资</span>
              <strong className="font-mono-num text-[15px] text-[var(--ink-1)]">
                ¥{monthlyIncome.toLocaleString('zh-CN')}
              </strong>
            </div>
            <input
              type="range"
              min={1500}
              max={25000}
              step={500}
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(Number(e.target.value))}
              className="v3-range"
            />
          </label>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {[
              {
                label: `房租吃饭等刚需 (${budgetPreset.needs}%)`,
                val: Math.round((monthlyIncome * budgetPreset.needs) / 100),
                tone: 'text-[var(--accent)]',
              },
              {
                label: `开心零花与社交 (${budgetPreset.wants}%)`,
                val: Math.round((monthlyIncome * budgetPreset.wants) / 100),
                tone: 'text-[var(--dawn)]',
              },
              {
                label: `底气储蓄桶 (${budgetPreset.save}%)`,
                val: Math.round((monthlyIncome * budgetPreset.save) / 100),
                tone: 'text-[var(--growth)]',
              },
            ].map((b) => (
              <div
                key={b.label}
                className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-3.5"
              >
                <div className="text-[12px] text-[var(--ink-3)]">{b.label}</div>
                <strong className={cn('font-mono-num mt-1 block text-[20px] font-semibold', b.tone)}>
                  ¥{b.val.toLocaleString('zh-CN')}
                </strong>
              </div>
            ))}
          </div>

          <p className="m-0 text-[13px] text-[var(--ink-2)]">
            按这个节奏，连续存{' '}
            <strong className="font-mono-num text-[var(--ink-1)]">
              {Math.ceil((budgetPreset.needs * 3) / Math.max(1, budgetPreset.save))} 个月
            </strong>{' '}
            就能攒够 3 个月刚需应急安全垫，遇事不慌。
          </p>
        </div>
      )}

      {/* 3. 少冲动一笔 · 消费冷静与复利感知器 */}
      {currentTool === 'compound' && (
        <div className="glass-plate space-y-4 p-4 sm:p-5" data-testid="sandbox-compound">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14.5px] font-semibold text-[var(--ink-1)]">
              少冲动一笔 · 省钱复利感知器
            </span>
            <Badge tone="growth" className="font-mono-num">
              每月多留 ¥{compoundCalc.monthlySaved.toLocaleString('zh-CN')}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-[12.5px] text-[var(--ink-2)]">
              <div className="flex justify-between">
                <span>每次省下的小冲动</span>
                <strong className="font-mono-num text-[var(--ink-1)]">¥{impulseCost}</strong>
              </div>
              <input
                type="range"
                min={15}
                max={150}
                step={5}
                value={impulseCost}
                onChange={(e) => setImpulseCost(Number(e.target.value))}
                className="v3-range"
              />
            </label>

            <label className="space-y-1.5 text-[12.5px] text-[var(--ink-2)]">
              <div className="flex justify-between">
                <span>每周少冲动次数</span>
                <strong className="font-mono-num text-[var(--ink-1)]">{weeklyTimes} 次</strong>
              </div>
              <input
                type="range"
                min={1}
                max={7}
                step={1}
                value={weeklyTimes}
                onChange={(e) => setWeeklyTimes(Number(e.target.value))}
                className="v3-range"
              />
            </label>

            <label className="space-y-1.5 text-[12.5px] text-[var(--ink-2)]">
              <div className="flex justify-between">
                <span>不知不觉坚持</span>
                <strong className="font-mono-num text-[var(--ink-1)]">{years} 年</strong>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                className="v3-range"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-3.5">
              <div className="text-[12px] text-[var(--ink-3)]">{years} 年单单本金攒下</div>
              <strong className="font-mono-num mt-1 block text-[20px] font-semibold text-[var(--ink-1)]">
                ¥{compoundCalc.finalPlain.toLocaleString('zh-CN')}
              </strong>
            </div>
            <div className="rounded-[12px] border border-[var(--growth-border)] bg-[var(--growth-soft)] p-3.5">
              <div className="text-[12px] text-[var(--ink-2)]">稳健 4% 复利示意（科普）</div>
              <strong className="font-mono-num mt-1 block text-[20px] font-semibold text-[var(--growth)]">
                ¥{compoundCalc.finalCompound.toLocaleString('zh-CN')}
              </strong>
            </div>
            <div className="rounded-[12px] border border-[var(--dawn-border)] bg-[var(--dawn-soft)] p-3.5">
              <div className="text-[12px] text-[var(--ink-2)]">换算成真实生活体验</div>
              <strong className="mt-1 block text-[17px] font-semibold text-[var(--dawn)]">
                ≈ {compoundCalc.shortTrips} 次短途旅行
              </strong>
            </div>
          </div>

          <p className="m-0 text-[12px] text-[var(--ink-3)]">
            提示：4% 仅为理解复利概念的数学测算示意，不代表任何具体理财收益承诺或投资建议。
          </p>
        </div>
      )}

      {/* 4. 高情商发消息改写对照器 */}
      {currentTool === 'message' && (
        <div className="glass-plate space-y-4 p-4 sm:p-5" data-testid="sandbox-message">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14.5px] font-semibold text-[var(--ink-1)]">
              高情商发消息改写对照器
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={!showSmooth ? 'warning' : 'outline'}
                onClick={() => setShowSmooth(false)}
              >
                容易冷场版
              </Button>
              <Button
                size="sm"
                variant={showSmooth ? 'growth' : 'outline'}
                onClick={() => setShowSmooth(true)}
              >
                省心舒服版
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MESSAGE_REWRITES.map((m, idx) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMsgIdx(idx)}
                className={cn(
                  'cursor-pointer rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                  msgIdx === idx
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                    : 'border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                )}
              >
                {m.scene}
              </button>
            ))}
          </div>

          <div
            className={cn(
              'rounded-[14px] border p-4 text-[14.5px] leading-[1.75] transition-colors',
              showSmooth
                ? 'border-[var(--growth-border)] bg-[var(--growth-soft)] text-[var(--ink-1)]'
                : 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--ink-1)]'
            )}
          >
            <div className="mb-1.5 text-[12px] font-semibold opacity-85">
              {showSmooth ? '这样发，对方一眼懂且乐意回：' : '这样发，往往要来回问三轮才进入正题：'}
            </div>
            <p className="m-0">{showSmooth ? currentMsg.smooth : currentMsg.awkward}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {currentMsg.highlights.map((h) => (
                <Badge key={h} tone="neutral">
                  {h}
                </Badge>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={handleCopyMessage}>
              <Copy size={13} strokeWidth={1.6} />
              <span>复制舒服版句式</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
