import { useEffect, useRef, useState } from 'preact/hooks';
import { IconArrowLeft, IconArrowRight, IconExternal, IconFlip } from '../components/Icons';
import { RichText } from '../components/RichText';
import type { PlatformContentBundle } from '../core/contentLoader';
import { recordCardReview, recordQuizAttempt } from '../core/db';
import {
  getFlashcardDeck,
  getRetestQueue,
  getWeaknessTop5,
  type RetestQueueItem,
} from '../core/srs';
import type { BranchId, CardRating, TelemetrySnapshot } from '../types/schema';

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

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [focusIdx, setFocusIdx] = useState<number>(0);
  const [includeUpcoming, setIncludeUpcoming] = useState<boolean>(true);
  const [branchFilter, setBranchFilter] = useState<BranchId | 'ALL'>('ALL');
  const [focusedConceptId, setFocusedConceptId] = useState<string | null>(null);
  const [flippedMap, setFlippedMap] = useState<Record<string, boolean>>({});
  const [selectedChoiceMap, setSelectedChoiceMap] = useState<Record<string, number>>({});
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');
  const startedAtRef = useRef<number>(Date.now());

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

  // 专注刷卡模式下支持空格键翻面
  useEffect(() => {
    if (tab !== 'cards' || deckMode !== 'focus' || !currentCardEntry) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (e.code === 'Space') {
        e.preventDefault();
        const cid = currentCardEntry.concept.id;
        setFlippedMap((prev) => ({ ...prev, [cid]: !prev[cid] }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tab, deckMode, currentCardEntry]);

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
    setFeedbackMsg(
      isCorrect
        ? `「${item.concept.label}」重测答对，已推进至：${formatStageLabel(newStage)}`
        : `「${item.concept.label}」仍需巩固，已重置回第 1 阶（1 天后重测）。`
    );
    onTelemetryChange(next);
  };

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
    const label = conceptMap.get(conceptId)?.label ?? conceptId;
    const st = next.cardStats[conceptId];
    setFeedbackMsg(
      `已记录「${label}」：${
        rating === 'easy'
          ? '熟练掌握'
          : rating === 'fuzzy'
            ? '有点模糊（排入 3 天后温习）'
            : '没想起来（排入明日重测）'
      } · 当前状态：${formatStageLabel(st?.retestStage ?? 0)}`
    );
    onTelemetryChange(next);
    if (deckMode === 'focus' && safeFocusIdx < deck.length - 1) {
      setTimeout(() => setFocusIdx((i) => Math.min(deck.length - 1, i + 1)), 220);
    }
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
    <div class="review-deck-wrap">
      <header class="page-header-strip">
        <div>
          <h1 class="page-h1">重测与知识闪卡</h1>
          <p class="page-subtitle">
            错题与模糊概念自动按 1 / 3 / 7 天间隔回炉提取，跨分支概念支持互链联想。
          </p>
        </div>

        <div class="segmented-bar" role="tablist" aria-label="复习模式切换">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'retest'}
            class={`segmented-btn ${tab === 'retest' ? 'is-active' : ''}`}
            onClick={() => setTab('retest')}
          >
            错题重测（到期 {dueItems.length} · 待测 {upcomingItems.length}）
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'cards'}
            class={`segmented-btn ${tab === 'cards' ? 'is-active' : ''}`}
            onClick={() => setTab('cards')}
          >
            知识闪卡台（{content.knowledgeGraph.nodes.length}）
          </button>
        </div>
      </header>

      {/* 薄弱概念 TOP 5 紧凑仪表带 */}
      <section class="surface-card weakness-strip-card" aria-label="当前优先巩固概念">
        <div class="section-head-row" style={{ marginBottom: '12px' }}>
          <h2 class="section-h2">当前优先巩固概念</h2>
          <span class="status-chip tabular-num">
            已追踪 {Object.keys(telemetry.cardStats).length} 个概念
          </span>
        </div>
        {weaknessTop5.length === 0 ? (
          <p class="muted-desc" style={{ margin: 0 }}>
            当前暂无错题或薄弱积压；单元自测答错或刷卡选「模糊 / 重来」的概念会自动汇集到这里。
          </p>
        ) : (
          <div class="weakness-top5-list">
            {weaknessTop5.map((w, idx) => {
              const bMeta = branchMetaMap.get(w.concept.branchId);
              return (
                <button
                  type="button"
                  class="weakness-pill-card"
                  key={w.concept.id}
                  onClick={() => handleJumpCrossLink(w.concept.id)}
                >
                  <span class="weakness-rank-num tabular-num">#{idx + 1}</span>
                  <span
                    class="branch-dot"
                    style={{ backgroundColor: bMeta?.accentToken ?? '#266D7E' }}
                  />
                  <strong>{w.concept.label}</strong>
                  <span class="status-chip chip-warning tabular-num">
                    错 {w.stat.errorCount} 次 · {formatStageLabel(w.stat.retestStage)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {feedbackMsg && (
        <div class="feedback-toast-bar" role="status">
          {feedbackMsg}
        </div>
      )}

      {/* 子视图 1：1/3/7 天错题重测队列 */}
      {tab === 'retest' && (
        <section class="surface-card" aria-label="1/3/7 天重测队列">
          <div class="section-head-row">
            <h2 class="section-h2">1 / 3 / 7 天间隔重测队列</h2>
            <label class={`toggle-pill low-battery-toggle ${includeUpcoming ? 'is-on' : ''}`}>
              <input
                type="checkbox"
                checked={includeUpcoming}
                onChange={(e) => setIncludeUpcoming((e.target as HTMLInputElement).checked)}
              />
              <span class="toggle-track" aria-hidden="true">
                <span class="toggle-thumb" />
              </span>
              <span class="toggle-label">包含未来待到期项（可提前巩固）</span>
            </label>
          </div>

          {visibleRetestItems.length === 0 ? (
            <div class="empty-track-notice" style={{ marginBottom: 0 }}>
              今天没有待重测错题，可以切到「知识闪卡台」随手翻几张，或直接收工休息。
            </div>
          ) : (
            <div class="retest-items-list">
              {visibleRetestItems.map((item) => {
                const cid = item.concept.id;
                const bMeta = branchMetaMap.get(item.concept.branchId);
                const chosen = selectedChoiceMap[cid];

                return (
                  <article class="retest-row-item" key={cid}>
                    <div class="retest-meta-bar">
                      <span class="branch-dot-label">
                        <span
                          class="branch-dot"
                          style={{ backgroundColor: bMeta?.accentToken ?? '#266D7E' }}
                        />
                        <strong>
                          {item.concept.branchId} · {item.concept.label}
                        </strong>
                      </span>
                      <span class="status-chip chip-warning">
                        {formatStageLabel(item.stat.retestStage)}
                      </span>
                      {item.stat.dueDate && (
                        <span class="status-chip tabular-num">
                          计划日 {item.stat.dueDate}
                          {item.isDueToday ? '（今日到期）' : '（可提前测）'}
                        </span>
                      )}
                    </div>

                    {item.question ? (
                      <div>
                        <div class="quiz-stem" style={{ marginTop: '10px' }}>
                          <RichText text={item.question.stem} />
                        </div>
                        <div class="quiz-options-list">
                          {item.question.options.map((opt, oIdx) => {
                            const letter = String.fromCharCode(65 + oIdx);
                            return (
                              <button
                                key={oIdx}
                                type="button"
                                class={`quiz-option-btn ${chosen === oIdx ? 'is-selected' : ''}`}
                                onClick={() =>
                                  setSelectedChoiceMap((prev) => ({
                                    ...prev,
                                    [cid]: oIdx,
                                  }))
                                }
                              >
                                <span class="option-letter">{letter}</span>
                                <span class="option-text">
                                  <RichText text={opt} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div class="btn-row" style={{ marginTop: '14px' }}>
                          <button
                            type="button"
                            class="btn btn-primary"
                            disabled={chosen === undefined}
                            onClick={() => handleSubmitRetest(item)}
                          >
                            提交重测并推进阶段
                          </button>
                          {item.unit && (
                            <button
                              type="button"
                              class="btn"
                              onClick={() => onOpenUnit(item.unit!.id)}
                            >
                              回看原单元导学 <IconExternal size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div class="concept-card-prompt">{item.concept.cardPrompt}</div>
                        <div class="concept-plain-def">{item.concept.cardAnswer}</div>
                        <div class="card-rating-row">
                          <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            onClick={() =>
                              handleCardRating(cid, item.concept.branchId, 'easy')
                            }
                          >
                            这次稳稳答出（推进下一阶）
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm"
                            onClick={() =>
                              handleCardRating(cid, item.concept.branchId, 'again')
                            }
                          >
                            还是卡壳（重置回 1 天）
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 子视图 2：知识闪卡台（专注单卡翻转模式 + 全量索引切换） */}
      {tab === 'cards' && (
        <section class="surface-card" aria-label="跨分支知识图谱闪卡台">
          <div class="section-head-row" style={{ marginBottom: '14px' }}>
            <div class="filter-chip-row">
              <button
                type="button"
                class={`filter-chip ${branchFilter === 'ALL' ? 'is-active' : ''}`}
                onClick={() => {
                  setBranchFilter('ALL');
                  setFocusIdx(0);
                }}
              >
                全部分支
              </button>
              {content.catalog.branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  class={`filter-chip ${branchFilter === b.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setBranchFilter(b.id);
                    setFocusIdx(0);
                  }}
                >
                  <span class="branch-dot" style={{ backgroundColor: b.accentToken }} />
                  <span>
                    {b.id} {b.name}
                  </span>
                </button>
              ))}
            </div>

            <div class="segmented-bar is-compact">
              <button
                type="button"
                class={`segmented-btn ${deckMode === 'focus' ? 'is-active' : ''}`}
                onClick={() => setDeckMode('focus')}
              >
                单卡刷卡台
              </button>
              <button
                type="button"
                class={`segmented-btn ${deckMode === 'list' ? 'is-active' : ''}`}
                onClick={() => setDeckMode('list')}
              >
                全量索引
              </button>
            </div>
          </div>

          {deck.length === 0 ? (
            <div class="empty-track-notice" style={{ marginBottom: 0 }}>
              该分支暂未收录概念节点，请切换其他分支查看。
            </div>
          ) : deckMode === 'focus' && currentCardEntry ? (
            <div class="flip-deck-stage">
              <div class="deck-focus-meta">
                <span class="branch-dot-label">
                  <span
                    class="branch-dot"
                    style={{
                      backgroundColor:
                        branchMetaMap.get(currentCardEntry.concept.branchId)?.accentToken ??
                        '#266D7E',
                    }}
                  />
                  <span>
                    {currentCardEntry.concept.branchId} · {currentCardEntry.concept.label}
                  </span>
                </span>
                <span class="status-chip tabular-num">
                  {safeFocusIdx + 1} / {deck.length}
                </span>
              </div>

              <div
                class={`flip-card-box ${
                  flippedMap[currentCardEntry.concept.id] ? 'is-flipped' : ''
                }`}
                onClick={() =>
                  setFlippedMap((prev) => ({
                    ...prev,
                    [currentCardEntry.concept.id]: !prev[currentCardEntry.concept.id],
                  }))
                }
              >
                <div class="flip-card-face">
                  {currentCardEntry.concept.prerequisites.length > 0 && (
                    <div
                      class="prereq-links-row"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span>先修概念：</span>
                      {currentCardEntry.concept.prerequisites.map((preId) => (
                        <button
                          key={preId}
                          type="button"
                          class="btn btn-sm"
                          onClick={() => handleJumpCrossLink(preId)}
                        >
                          {conceptMap.get(preId)?.label ?? preId}
                        </button>
                      ))}
                    </div>
                  )}

                  {!flippedMap[currentCardEntry.concept.id] ? (
                    <div class="flip-front-content">
                      <div class="flip-question-text">{currentCardEntry.concept.cardPrompt}</div>
                      <button type="button" class="btn btn-subtle">
                        <IconFlip size={15} />
                        <span>点击或按空格翻看解析</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      class="flip-back-content"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div class="flip-answer-main">
                        <RichText text={currentCardEntry.concept.cardAnswer} />
                      </div>
                      <div class="flip-plain-def">
                        <strong>人话定义：</strong>
                        {currentCardEntry.concept.plainDefinition}
                      </div>

                      {currentCardEntry.concept.crossLinks.length > 0 && (
                        <div class="concept-crosslinks">
                          {currentCardEntry.concept.crossLinks.map((link) => {
                            const target = conceptMap.get(link.targetId);
                            return (
                              <div class="crosslink-item" key={link.targetId}>
                                <span>
                                  跨分支互链 ·{' '}
                                  <strong>{target?.label ?? link.targetId}</strong>：
                                  {link.bridgeNote}
                                </span>
                                <button
                                  type="button"
                                  class="btn btn-sm"
                                  onClick={() => handleJumpCrossLink(link.targetId)}
                                >
                                  跳至该卡
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div class="card-rating-row">
                        <button
                          type="button"
                          class="btn btn-growth"
                          onClick={() =>
                            handleCardRating(
                              currentCardEntry.concept.id,
                              currentCardEntry.concept.branchId,
                              'easy'
                            )
                          }
                        >
                          熟练
                        </button>
                        <button
                          type="button"
                          class="btn btn-warning"
                          onClick={() =>
                            handleCardRating(
                              currentCardEntry.concept.id,
                              currentCardEntry.concept.branchId,
                              'fuzzy'
                            )
                          }
                        >
                          模糊（3天后）
                        </button>
                        <button
                          type="button"
                          class="btn btn-danger-outline"
                          onClick={() =>
                            handleCardRating(
                              currentCardEntry.concept.id,
                              currentCardEntry.concept.branchId,
                              'again'
                            )
                          }
                        >
                          重来（1天后）
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div class="deck-pager-row">
                <button
                  type="button"
                  class="btn btn-sm"
                  disabled={safeFocusIdx === 0}
                  onClick={() => setFocusIdx((i) => Math.max(0, i - 1))}
                >
                  <IconArrowLeft size={14} /> 上一张
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  disabled={safeFocusIdx >= deck.length - 1}
                  onClick={() => setFocusIdx((i) => Math.min(deck.length - 1, i + 1))}
                >
                  下一张 <IconArrowRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div class="concept-index-list">
              {deck.map(({ concept, stat }) => {
                const bMeta = branchMetaMap.get(concept.branchId);
                const isFlipped = Boolean(flippedMap[concept.id]);
                const isFocused = focusedConceptId === concept.id;

                return (
                  <article
                    key={concept.id}
                    class={`concept-index-row ${isFocused ? 'is-focused' : ''}`}
                  >
                    <div class="concept-index-top">
                      <span class="branch-dot-label">
                        <span
                          class="branch-dot"
                          style={{ backgroundColor: bMeta?.accentToken ?? '#266D7E' }}
                        />
                        <strong>{concept.label}</strong>
                      </span>
                      {stat && (
                        <span class="status-chip tabular-num">
                          已练 {stat.practiceCount} 次 · {formatStageLabel(stat.retestStage)}
                        </span>
                      )}
                    </div>

                    {concept.prerequisites.length > 0 && (
                      <div class="prereq-links-row">
                        <span>先修概念：</span>
                        {concept.prerequisites.map((preId) => (
                          <button
                            key={preId}
                            type="button"
                            class="btn btn-sm"
                            onClick={() => handleJumpCrossLink(preId)}
                          >
                            {conceptMap.get(preId)?.label ?? preId}
                          </button>
                        ))}
                      </div>
                    )}

                    <div class="concept-card-prompt">{concept.cardPrompt}</div>

                    {!isFlipped ? (
                      <button
                        type="button"
                        class="btn btn-sm"
                        onClick={() =>
                          setFlippedMap((prev) => ({ ...prev, [concept.id]: true }))
                        }
                      >
                        翻看解析与跨分支互链
                      </button>
                    ) : (
                      <div class="concept-card-back">
                        <div class="concept-answer-text">
                          <RichText text={concept.cardAnswer} />
                        </div>
                        <div class="concept-plain-def">
                          <strong>人话定义：</strong>
                          {concept.plainDefinition}
                        </div>
                        <div class="card-rating-row">
                          <button
                            type="button"
                            class="btn btn-growth btn-sm"
                            onClick={() =>
                              handleCardRating(concept.id, concept.branchId, 'easy')
                            }
                          >
                            熟练
                          </button>
                          <button
                            type="button"
                            class="btn btn-warning btn-sm"
                            onClick={() =>
                              handleCardRating(concept.id, concept.branchId, 'fuzzy')
                            }
                          >
                            模糊（3天后）
                          </button>
                          <button
                            type="button"
                            class="btn btn-danger-outline btn-sm"
                            onClick={() =>
                              handleCardRating(concept.id, concept.branchId, 'again')
                            }
                          >
                            重来（1天后）
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
