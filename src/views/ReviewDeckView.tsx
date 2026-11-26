import { ArrowLeft, ArrowRight, ExternalLink, RotateCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RichText } from '@/components/RichText';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import { recordCardReview, recordQuizAttempt } from '@/core/db';
import {
  getFlashcardDeck,
  getRetestQueue,
  getWeaknessTop5,
  type RetestQueueItem,
} from '@/core/srs';
import { cn } from '@/lib/utils';
import type { BranchId, CardRating, TelemetrySnapshot } from '@/types/schema';

interface ReviewDeckViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  initialTab?: 'retest' | 'cards';
  onTelemetryChange: (next: TelemetrySnapshot) => void;
  onOpenUnit: (unitId: string) => void;
}

function formatStageLabel(stage: RetestQueueItem['stat']['retestStage']): string {
  if (stage === 1) return '第 1 阶 · 1 天后重测';
  if (stage === 3) return '第 2 阶 · 3 天后重测';
  if (stage === 7) return '第 3 阶 · 7 天后重测';
  if (stage === 'graduated') return '三轮重测已掌握';
  return '待巩固';
}

export function ReviewDeckView({
  content,
  telemetry,
  initialTab = 'retest',
  onTelemetryChange,
  onOpenUnit,
}: ReviewDeckViewProps) {
  const [tab, setTab] = useState<'retest' | 'cards'>(initialTab);
  const [deckMode, setDeckMode] = useState<'focus' | 'list'>('focus');
  const [focusIdx, setFocusIdx] = useState<number>(0);
  const [includeUpcoming, setIncludeUpcoming] = useState<boolean>(true);
  const [branchFilter, setBranchFilter] = useState<BranchId | 'ALL'>('ALL');
  const [focusedConceptId, setFocusedConceptId] = useState<string | null>(null);
  const [flippedMap, setFlippedMap] = useState<Record<string, boolean>>({});
  const [selectedChoiceMap, setSelectedChoiceMap] = useState<Record<string, number>>({});
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const { dueItems, upcomingItems } = getRetestQueue(
    content.knowledgeGraph,
    content.units,
    telemetry
  );
  const weaknessTop5 = getWeaknessTop5(content.knowledgeGraph, telemetry);
  const deck = getFlashcardDeck(content.knowledgeGraph, telemetry, branchFilter);

  const visibleRetestItems = includeUpcoming ? [...dueItems, ...upcomingItems] : dueItems;
  const branchMetaMap = new Map(content.catalog.branches.map((b) => [b.id, b]));
  const conceptMap = new Map(content.knowledgeGraph.nodes.map((n) => [n.id, n]));

  const safeFocusIdx = Math.min(focusIdx, Math.max(0, deck.length - 1));
  const currentCardEntry = deck[safeFocusIdx];
  const isCurrentFlipped = currentCardEntry
    ? Boolean(flippedMap[currentCardEntry.concept.id])
    : false;

  const handleCardRating = async (
    conceptId: string,
    branchId: BranchId,
    rating: CardRating
  ) => {
    const trackId = branchMetaMap.get(branchId)?.tracks[0]?.id ?? 'b1-ai-l1';
    const elapsed = Math.max(1500, Date.now() - startedAtRef.current);
    startedAtRef.current = Date.now();

    const next = await recordCardReview(conceptId, rating, {
      branchId,
      trackId,
      durationMs: elapsed,
    });
    const label = conceptMap.get(conceptId)?.label ?? '概念卡';
    const st = next.cardStats[conceptId];
    const msg = `已记录「${label}」：${
      rating === 'easy'
        ? '熟练掌握'
        : rating === 'fuzzy'
          ? '有点模糊（3天后温习）'
          : '没想起来（明日重测）'
    } · ${formatStageLabel(st?.retestStage ?? 0)}`;
    setFeedbackMsg(msg);
    toast(msg);
    onTelemetryChange(next);
    if (deckMode === 'focus' && safeFocusIdx < deck.length - 1) {
      setTimeout(() => setFocusIdx((i) => Math.min(deck.length - 1, i + 1)), 220);
    }
  };

  // 专注刷卡模式键盘支持：Space 翻面，1/2/3 评分
  useEffect(() => {
    if (tab !== 'cards' || deckMode !== 'focus' || !currentCardEntry) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      const cid = currentCardEntry.concept.id;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlippedMap((prev) => ({ ...prev, [cid]: !prev[cid] }));
      } else if (flippedMap[cid]) {
        if (e.key === '1') handleCardRating(cid, currentCardEntry.concept.branchId, 'easy');
        else if (e.key === '2') handleCardRating(cid, currentCardEntry.concept.branchId, 'fuzzy');
        else if (e.key === '3') handleCardRating(cid, currentCardEntry.concept.branchId, 'again');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleSubmitRetest = async (item: RetestQueueItem) => {
    const cid = item.concept.id;
    if (!item.question || !item.unit) return;
    const chosen = selectedChoiceMap[cid];
    if (chosen === undefined) return;

    const isCorrect = chosen === item.question.correctIndex;
    const elapsed = Math.max(1500, Date.now() - startedAtRef.current);
    startedAtRef.current = Date.now();

    const next = await recordQuizAttempt({
      unitId: item.unit.id,
      branchId: item.unit.branchId,
      trackId: item.unit.trackId,
      questionId: item.question.id,
      conceptId: cid,
      kind: 'retest',
      selectedIndex: chosen,
      isCorrect,
      durationMs: elapsed,
    });

    const newStage = next.cardStats[cid]?.retestStage;
    const msg = isCorrect
      ? `「${item.concept.label}」重测答对，推进至 ${formatStageLabel(newStage)}`
      : `「${item.concept.label}」仍需巩固，重置回第 1 阶（1 天后重测）`;
    setFeedbackMsg(msg);
    toast(msg);
    onTelemetryChange(next);
  };

  const handleJumpCrossLink = (targetConceptId: string) => {
    setBranchFilter('ALL');
    setTab('cards');
    const fullDeck = getFlashcardDeck(content.knowledgeGraph, telemetry, 'ALL');
    const targetIndex = fullDeck.findIndex((d) => d.concept.id === targetConceptId);
    if (targetIndex >= 0) {
      setFocusIdx(targetIndex);
    }
    setFocusedConceptId(targetConceptId);
    setFlippedMap((prev) => ({ ...prev, [targetConceptId]: true }));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="m-0 text-[24px] sm:text-[28px] font-semibold tracking-[-0.02em] text-[var(--ink-1)]">
            重测与 3D 知识闪卡
          </h1>
          <p className="m-0 text-[14.5px] text-[var(--ink-2)]">
            错题与模糊概念按 1 / 3 / 7 天间隔自动回炉提取，跨分支概念支持互链联想
          </p>
        </div>

        <div
          className="inline-flex flex-wrap gap-1 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-1"
          role="tablist"
          aria-label="复习模式切换"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'retest'}
            onClick={() => setTab('retest')}
            className={cn(
              'min-h-[38px] cursor-pointer rounded-[7px] px-3.5 text-[13.5px] font-medium transition-colors',
              tab === 'retest'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
            )}
          >
            错题重测（到期 {dueItems.length} · 待测 {upcomingItems.length}）
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'cards'}
            onClick={() => setTab('cards')}
            className={cn(
              'min-h-[38px] cursor-pointer rounded-[7px] px-3.5 text-[13.5px] font-medium transition-colors',
              tab === 'cards'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
            )}
          >
            3D 知识闪卡台（{content.knowledgeGraph.nodes.length}）
          </button>
        </div>
      </header>

      {/* 当前优先巩固概念 TOP 5 */}
      <Card className="space-y-3 p-5" aria-label="当前优先巩固概念">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-[15px] font-semibold text-[var(--ink-1)]">
            当前优先巩固概念
          </h2>
          <Badge tone="neutral" className="font-mono-num">
            已追踪 {Object.keys(telemetry.cardStats).length} 个概念
          </Badge>
        </div>

        {weaknessTop5.length === 0 ? (
          <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
            当前暂无错题或薄弱积压；单元自测答错或刷卡选「模糊 / 重来」的概念会自动汇集到这里
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {weaknessTop5.map((w, idx) => {
              const bMeta = branchMetaMap.get(w.concept.branchId);
              return (
                <button
                  key={w.concept.id}
                  type="button"
                  onClick={() => handleJumpCrossLink(w.concept.id)}
                  className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-[13px] text-[var(--ink-1)] transition-colors hover:border-[var(--accent)]"
                >
                  <span className="font-mono-num text-[12px] text-[var(--ink-3)]">#{idx + 1}</span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: bMeta?.accentToken ?? 'var(--accent)' }}
                  />
                  <strong className="font-medium">{w.concept.label}</strong>
                  <Badge tone="warning" className="font-mono-num">
                    错 {w.stat.errorCount} 次
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {feedbackMsg && (
        <div
          className="rounded-[10px] border border-[var(--growth-border)] bg-[var(--growth-soft)] px-4 py-3 text-[13.5px] text-[var(--ink-1)]"
          role="status"
        >
          {feedbackMsg}
        </div>
      )}

      {/* 子视图 1：1/3/7 天错题重测队列 */}
      {tab === 'retest' && (
        <Card className="space-y-4" aria-label="1/3/7 天重测队列">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
              1 / 3 / 7 天间隔重测队列
            </h2>

            <button
              type="button"
              role="switch"
              aria-checked={includeUpcoming}
              onClick={() => setIncludeUpcoming((v) => !v)}
              className={cn(
                'toggle-pill inline-flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors',
                includeUpcoming
                  ? 'is-on border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                  : 'border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink-2)]'
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                  includeUpcoming ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'
                )}
              >
                <span
                  className={cn(
                    'h-3 w-3 rounded-full bg-white transition-transform',
                    includeUpcoming ? 'translate-x-3.5' : 'translate-x-0.5'
                  )}
                />
              </span>
              <span>包含未来待到期项（可提前巩固）</span>
            </button>
          </div>

          {visibleRetestItems.length === 0 ? (
            <div className="v3-card-raised p-4 text-[14px] text-[var(--ink-2)]">
              今天没有待重测错题，可切换至「3D 知识闪卡台」随手翻几张，或直接收工
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {visibleRetestItems.map((item) => {
                const cid = item.concept.id;
                const bMeta = branchMetaMap.get(item.concept.branchId);
                const chosen = selectedChoiceMap[cid];

                return (
                  <article className="space-y-3 py-5 first:pt-2 last:pb-1" key={cid}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--ink-1)]">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: bMeta?.accentToken ?? 'var(--accent)' }}
                        />
                        <span>
                          {item.concept.branchId} · {item.concept.label}
                        </span>
                      </span>
                      <Badge tone="warning">{formatStageLabel(item.stat.retestStage)}</Badge>
                      {item.stat.dueDate && (
                        <Badge tone="neutral" className="font-mono-num">
                          计划日 {item.stat.dueDate}
                          {item.isDueToday ? '（今日到期）' : '（可提前测）'}
                        </Badge>
                      )}
                    </div>

                    {item.question ? (
                      <div className="space-y-3">
                        <div className="text-[15.5px] font-medium leading-[1.6] text-[var(--ink-1)]">
                          <RichText text={item.question.stem} />
                        </div>
                        <div className="space-y-2">
                          {item.question.options.map((opt, oIdx) => {
                            const letter = String.fromCharCode(65 + oIdx);
                            const isSelected = chosen === oIdx;
                            return (
                              <button
                                key={oIdx}
                                type="button"
                                onClick={() =>
                                  setSelectedChoiceMap((prev) => ({ ...prev, [cid]: oIdx }))
                                }
                                className={cn(
                                  'quiz-option-btn flex min-h-[44px] w-full cursor-pointer items-start gap-3 rounded-[9px] border p-3 text-left text-[14.5px] transition-colors',
                                  isSelected
                                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                                    : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink-1)]'
                                )}
                              >
                                <span className="font-mono-num flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[12px] font-semibold text-[var(--ink-1)]">
                                  {letter}
                                </span>
                                <span className="flex-1">
                                  <RichText text={opt} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            variant="primary"
                            disabled={chosen === undefined}
                            onClick={() => handleSubmitRetest(item)}
                          >
                            提交重测并推进阶段
                          </Button>
                          {item.unit && (
                            <Button
                              variant="outline"
                              onClick={() => onOpenUnit(item.unit!.id)}
                            >
                              <span>回看原单元导学</span>
                              <ExternalLink size={13} strokeWidth={1.5} />
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-[15px] font-medium text-[var(--ink-1)]">
                          {item.concept.cardPrompt}
                        </div>
                        <div className="v3-card-raised p-3 text-[13.5px] text-[var(--ink-2)]">
                          {item.concept.cardAnswer}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() =>
                              handleCardRating(cid, item.concept.branchId, 'easy')
                            }
                          >
                            这次稳稳答出（推进下一阶）
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleCardRating(cid, item.concept.branchId, 'again')
                            }
                          >
                            还是卡壳（重置回 1 天）
                          </Button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* 子视图 2：真 3D 知识闪卡台 */}
      {tab === 'cards' && (
        <Card className="space-y-5" aria-label="跨分支知识图谱闪卡台">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setBranchFilter('ALL');
                  setFocusIdx(0);
                }}
                className={cn(
                  'min-h-[34px] cursor-pointer rounded-[8px] border px-3 text-[12.5px] font-medium transition-colors',
                  branchFilter === 'ALL'
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                )}
              >
                全部分支
              </button>
              {content.catalog.branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBranchFilter(b.id);
                    setFocusIdx(0);
                  }}
                  className={cn(
                    'inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-[8px] border px-2.5 text-[12.5px] font-medium transition-colors',
                    branchFilter === b.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                      : 'border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: b.accentToken }}
                  />
                  <span>
                    {b.id} {b.name}
                  </span>
                </button>
              ))}
            </div>

            <div className="inline-flex gap-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-0.5">
              <button
                type="button"
                onClick={() => setDeckMode('focus')}
                className={cn(
                  'min-h-[32px] cursor-pointer rounded-[6px] px-3 text-[12.5px] font-medium transition-colors',
                  deckMode === 'focus'
                    ? 'bg-[var(--surface)] text-[var(--ink-1)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                )}
              >
                3D 刷卡台
              </button>
              <button
                type="button"
                onClick={() => setDeckMode('list')}
                className={cn(
                  'min-h-[32px] cursor-pointer rounded-[6px] px-3 text-[12.5px] font-medium transition-colors',
                  deckMode === 'list'
                    ? 'bg-[var(--surface)] text-[var(--ink-1)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                )}
              >
                全量索引
              </button>
            </div>
          </div>

          {deck.length === 0 ? (
            <div className="v3-card-raised p-4 text-[14px] text-[var(--ink-2)]">
              该分支暂未收录概念节点，请切换其他分支查看
            </div>
          ) : deckMode === 'focus' && currentCardEntry ? (
            <div className="mx-auto max-w-[680px] space-y-4">
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="inline-flex items-center gap-2 font-medium text-[var(--ink-1)]">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        branchMetaMap.get(currentCardEntry.concept.branchId)?.accentToken ??
                        'var(--accent)',
                    }}
                  />
                  <span>
                    {currentCardEntry.concept.branchId} · {currentCardEntry.concept.label}
                  </span>
                </span>
                <Badge tone="neutral" className="font-mono-num">
                  {safeFocusIdx + 1} / {deck.length}
                </Badge>
              </div>

              <div className="flip-perspective">
                <motion.div
                  className="flip-card-box flip-preserve-3d relative grid cursor-pointer"
                  animate={{ rotateY: isCurrentFlipped ? 180 : 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                  onClick={() =>
                    setFlippedMap((prev) => ({
                      ...prev,
                      [currentCardEntry.concept.id]: !prev[currentCardEntry.concept.id],
                    }))
                  }
                >
                  {/* 正面 */}
                  <div
                    className={cn(
                      'flip-backface-hidden col-start-1 row-start-1 flex min-h-[300px] flex-col justify-between rounded-[14px] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-6',
                      isCurrentFlipped && 'pointer-events-none'
                    )}
                  >
                    {currentCardEntry.concept.prerequisites.length > 0 ? (
                      <div
                        className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-3)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>先修概念：</span>
                        {currentCardEntry.concept.prerequisites.map((preId) => (
                          <Button
                            key={preId}
                            size="sm"
                            variant="outline"
                            onClick={() => handleJumpCrossLink(preId)}
                          >
                            {conceptMap.get(preId)?.label ?? '关联概念'}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[12px] text-[var(--ink-3)]">
                        核心概念卡 · 点击或按 Space 翻面
                      </div>
                    )}

                    <div className="my-6 text-center text-[19px] sm:text-[21px] font-medium leading-[1.55] text-[var(--ink-1)]">
                      {currentCardEntry.concept.cardPrompt}
                    </div>

                    <div className="flex justify-center">
                      <Button variant="outline" size="sm">
                        <RotateCw size={14} strokeWidth={1.5} />
                        <span>点击或按空格翻看解析</span>
                      </Button>
                    </div>
                  </div>

                  {/* 背面 */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'flip-backface-hidden col-start-1 row-start-1 flex min-h-[300px] flex-col justify-between gap-4 rounded-[14px] border border-[var(--accent-border)] bg-[var(--surface)] p-6 [transform:rotateY(180deg)]',
                      !isCurrentFlipped && 'pointer-events-none'
                    )}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="font-semibold text-[var(--accent)]">
                          {currentCardEntry.concept.label}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setFlippedMap((prev) => ({
                              ...prev,
                              [currentCardEntry.concept.id]: false,
                            }))
                          }
                          className="cursor-pointer border-0 bg-transparent text-[12px] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                        >
                          翻回正面
                        </button>
                      </div>

                      <div className="text-[15px] leading-[1.75] text-[var(--ink-1)]">
                        <RichText text={currentCardEntry.concept.cardAnswer} />
                      </div>

                      <div className="v3-card-raised px-3.5 py-2.5 text-[13.5px] leading-[1.6] text-[var(--ink-2)]">
                        <strong className="font-medium text-[var(--ink-1)]">人话定义：</strong>
                        {currentCardEntry.concept.plainDefinition}
                      </div>

                      {currentCardEntry.concept.crossLinks.length > 0 && (
                        <div className="space-y-2">
                          {currentCardEntry.concept.crossLinks.map((link) => {
                            const target = conceptMap.get(link.targetId);
                            return (
                              <div
                                key={link.targetId}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[12.5px] text-[var(--ink-2)]"
                              >
                                <span>
                                  跨分支互链 ·{' '}
                                  <strong className="text-[var(--ink-1)]">
                                    {target?.label ?? '关联概念'}
                                  </strong>
                                  ：{link.bridgeNote}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleJumpCrossLink(link.targetId)}
                                >
                                  跳至该卡
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                      <Button
                        size="sm"
                        variant="growth"
                        onClick={() =>
                          handleCardRating(
                            currentCardEntry.concept.id,
                            currentCardEntry.concept.branchId,
                            'easy'
                          )
                        }
                      >
                        1 熟练
                      </Button>
                      <Button
                        size="sm"
                        variant="warning"
                        onClick={() =>
                          handleCardRating(
                            currentCardEntry.concept.id,
                            currentCardEntry.concept.branchId,
                            'fuzzy'
                          )
                        }
                      >
                        2 模糊（3天后）
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          handleCardRating(
                            currentCardEntry.concept.id,
                            currentCardEntry.concept.branchId,
                            'again'
                          )
                        }
                      >
                        3 重来（1天后）
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </div>

              <div className="flex items-center justify-center gap-2.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeFocusIdx === 0}
                  onClick={() => setFocusIdx((i) => Math.max(0, i - 1))}
                >
                  <ArrowLeft size={14} strokeWidth={1.5} />
                  <span>上一张</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeFocusIdx >= deck.length - 1}
                  onClick={() => setFocusIdx((i) => Math.min(deck.length - 1, i + 1))}
                >
                  <span>下一张</span>
                  <ArrowRight size={14} strokeWidth={1.5} />
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {deck.map(({ concept, stat }) => {
                const bMeta = branchMetaMap.get(concept.branchId);
                const isFlipped = Boolean(flippedMap[concept.id]);
                const isFocused = focusedConceptId === concept.id;

                return (
                  <article
                    key={concept.id}
                    className={cn(
                      'space-y-3 py-4 first:pt-1 last:pb-1',
                      isFocused && 'rounded-[10px] bg-[var(--accent-soft)] px-3'
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--ink-1)]">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: bMeta?.accentToken ?? 'var(--accent)' }}
                        />
                        <span>{concept.label}</span>
                      </span>
                      {stat && (
                        <Badge tone="neutral" className="font-mono-num">
                          已练 {stat.practiceCount} 次 · {formatStageLabel(stat.retestStage)}
                        </Badge>
                      )}
                    </div>

                    {concept.prerequisites.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-3)]">
                        <span>先修概念：</span>
                        {concept.prerequisites.map((preId) => (
                          <Button
                            key={preId}
                            size="sm"
                            variant="outline"
                            onClick={() => handleJumpCrossLink(preId)}
                          >
                            {conceptMap.get(preId)?.label ?? '关联概念'}
                          </Button>
                        ))}
                      </div>
                    )}

                    <div className="text-[14.5px] text-[var(--ink-1)]">{concept.cardPrompt}</div>

                    {!isFlipped ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setFlippedMap((prev) => ({ ...prev, [concept.id]: true }))
                        }
                      >
                        翻看解析与跨分支互链
                      </Button>
                    ) : (
                      <div className="v3-card-raised space-y-3 p-3.5">
                        <div className="text-[14px] leading-[1.7] text-[var(--ink-1)]">
                          <RichText text={concept.cardAnswer} />
                        </div>
                        <div className="text-[13px] text-[var(--ink-2)]">
                          <strong className="font-medium text-[var(--ink-1)]">人话定义：</strong>
                          {concept.plainDefinition}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="growth"
                            onClick={() => handleCardRating(concept.id, concept.branchId, 'easy')}
                          >
                            熟练
                          </Button>
                          <Button
                            size="sm"
                            variant="warning"
                            onClick={() =>
                              handleCardRating(concept.id, concept.branchId, 'fuzzy')
                            }
                          >
                            模糊（3天后）
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              handleCardRating(concept.id, concept.branchId, 'again')
                            }
                          >
                            重来（1天后）
                          </Button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
