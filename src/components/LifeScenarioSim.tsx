import { CheckCircle2, MessageCircle, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button } from '@/components/ui/primitives';
import type { LifeScenario, ScenarioChoice } from '@/data/lifeScenarios';
import { cn } from '@/lib/utils';

interface LifeScenarioSimProps {
  scenario: LifeScenario;
  compact?: boolean;
  onOpenLinkedUnit?: (unitId: string) => void;
}

const TONE_META: Record<
  ScenarioChoice['tone'],
  { label: string; badge: 'growth' | 'warning' | 'danger'; boxClass: string }
> = {
  safe: {
    label: '稳妥化解',
    badge: 'growth',
    boxClass: 'border-[var(--growth-border)] bg-[var(--growth-soft)]',
  },
  caution: {
    label: '有点风险',
    badge: 'warning',
    boxClass: 'border-[var(--warning-border)] bg-[var(--warning-soft)]',
  },
  trap: {
    label: '容易踩坑',
    badge: 'danger',
    boxClass: 'border-[var(--danger-border)] bg-[var(--danger-soft)]',
  },
};

export function LifeScenarioSim({
  scenario,
  compact = false,
  onOpenLinkedUnit,
}: LifeScenarioSimProps) {
  const [roundIdx, setRoundIdx] = useState<number>(0);
  const [pickedByRound, setPickedByRound] = useState<Record<number, ScenarioChoice>>({});

  const currentRound = scenario.rounds[roundIdx] ?? scenario.rounds[0];
  const picked = pickedByRound[roundIdx];
  const isLastRound = roundIdx >= scenario.rounds.length - 1;
  const allCompleted = Boolean(picked) && isLastRound;

  const handleReset = () => {
    setRoundIdx(0);
    setPickedByRound({});
  };

  return (
    <div
      className={cn('space-y-4', !compact && 'glass-plate p-4 sm:p-5')}
      data-testid="life-scenario-sim"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{scenario.tag}</Badge>
          <span className="font-mono-num text-[12px] text-[var(--ink-3)]">
            第 {roundIdx + 1} / {scenario.rounds.length} 幕
          </span>
        </div>
        {Object.keys(pickedByRound).length > 0 && (
          <Button size="sm" variant="ghost" onClick={handleReset}>
            <RotateCcw size={13} strokeWidth={1.6} />
            <span>换个选择重演</span>
          </Button>
        )}
      </div>

      {/* 对方 / 场景对话气泡 */}
      <div className="rounded-[14px] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-4">
        <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--dawn)]">
          <MessageCircle size={13} strokeWidth={1.8} />
          <span>{currentRound.speaker}</span>
        </div>
        <p className="m-0 text-[14.5px] leading-[1.7] text-[var(--ink-1)]">
          {currentRound.message}
        </p>
      </div>

      {/* 你的回应选项 */}
      <div className="space-y-2">
        <div className="text-[12.5px] text-[var(--ink-3)]">这时候你会怎么回？</div>
        {currentRound.choices.map((choice) => {
          const isPicked = picked?.id === choice.id;
          const meta = TONE_META[choice.tone];
          return (
            <button
              key={choice.id}
              type="button"
              data-testid={`sim-choice-${choice.id}`}
              onClick={() =>
                setPickedByRound((prev) => ({
                  ...prev,
                  [roundIdx]: choice,
                }))
              }
              className={cn(
                'flex w-full cursor-pointer items-start gap-2.5 rounded-[12px] border p-3.5 text-left text-[14px] leading-[1.6] transition-all',
                isPicked
                  ? meta.boxClass + ' text-[var(--ink-1)]'
                  : 'border-[var(--line)] bg-[var(--surface-plate)] text-[var(--ink-2)] hover:border-[var(--accent-border)] hover:text-[var(--ink-1)]'
              )}
            >
              <span
                className={cn(
                  'mt-1 h-2 w-2 shrink-0 rounded-full',
                  isPicked
                    ? choice.tone === 'safe'
                      ? 'bg-[var(--growth)]'
                      : choice.tone === 'caution'
                        ? 'bg-[var(--warning)]'
                        : 'bg-[var(--danger)]'
                    : 'bg-[var(--line-strong)]'
                )}
              />
              <span className="flex-1">{choice.label}</span>
            </button>
          );
        })}
      </div>

      {/* 即时推演后果与生活原理解析 */}
      {picked && (
        <div
          className={cn(
            'space-y-2.5 rounded-[14px] border p-4 text-[14px] leading-[1.65]',
            TONE_META[picked.tone].boxClass
          )}
          data-testid="sim-outcome-box"
        >
          <div className="flex items-center gap-2">
            {picked.tone === 'safe' ? (
              <CheckCircle2 size={16} strokeWidth={1.8} className="text-[var(--growth)]" />
            ) : (
              <ShieldAlert
                size={16}
                strokeWidth={1.8}
                className={picked.tone === 'caution' ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}
              />
            )}
            <Badge tone={TONE_META[picked.tone].badge}>{TONE_META[picked.tone].label}</Badge>
            <span className="text-[12.5px] font-medium text-[var(--ink-1)]">接下来会发生什么</span>
          </div>
          <p className="m-0 text-[var(--ink-1)]">{picked.consequence}</p>
          <p className="m-0 border-t border-[var(--line)] pt-2 text-[13px] text-[var(--ink-2)]">
            <strong className="font-medium text-[var(--ink-1)]">生活提醒：</strong>
            {picked.why}
          </p>

          {!isLastRound && (
            <div className="flex justify-end pt-1">
              <Button size="sm" variant="primary" onClick={() => setRoundIdx((r) => r + 1)}>
                继续下一幕
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 收尾口诀卡 */}
      {allCompleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--dawn-border)] bg-[var(--dawn-soft)] px-4 py-3">
          <div className="flex items-start gap-2 text-[13.5px] leading-[1.6] text-[var(--ink-1)]">
            <Sparkles size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-[var(--dawn)]" />
            <span>
              <strong>带走这一招：</strong>
              {scenario.lifeTakeaway}
            </span>
          </div>
          {onOpenLinkedUnit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenLinkedUnit(scenario.linkedUnitId)}
            >
              看看完整拆解
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
