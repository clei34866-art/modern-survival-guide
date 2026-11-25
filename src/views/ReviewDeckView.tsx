import { useRef, useState } from 'preact/hooks';
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
  if (stage === 'graduated') return '✓ 已完成三轮重测掌握';
  return '未入列';
}

export function ReviewDeckView({
  content,
  telemetry,
  initialTab = 'retest',
  onTelemetryChange,
  onOpenUnit,
}: ReviewDeckViewProps) {
  const [tab, setTab] = useState<'retest' | 'cards'>(initialTab);
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

  const visibleRetestItems = includeUpcoming
    ? [...dueItems, ...upcomingItems]
    : dueItems;

  const branchMetaMap = new Map(content.catalog.branches.map((b) => [b.id, b]));

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
        ? `✓ 「${item.concept.label}」重测答对！阶段已推进至：${formatStageLabel(newStage)}`
        : `✗ 「${item.concept.label}」仍需巩固，已重置回「1 天后重测」，请看下方解析。`
    );
    onTelemetryChange(next);
  };

  const handleCardRating = async (
    conceptId: string,
    branchId: BranchId,
    rating: CardRating
  ) => {
    const trackId =
      branchMetaMap.get(branchId)?.tracks[0]?.id ?? 'b1-ai-l1';
    const elapsed = Math.max(1500, Date.now() - startedAtRef.current);
    startedAtRef.current = Date.now();

    const next = await recordCardReview(conceptId, rating, {
      branchId,
      trackId,
      durationMs: elapsed,
    });
    const st = next.cardStats[conceptId];
    setFeedbackMsg(
      `已记录「${conceptId}」刷卡结果：${
        rating === 'easy'
          ? '熟练'
          : rating === 'fuzzy'
            ? '模糊（排入 3 天后温习）'
            : '没想起来（排入 1 天后重测）'
      } · 当前状态：${formatStageLabel(st?.retestStage ?? 0)}`
    );
    onTelemetryChange(next);
  };

  const handleJumpCrossLink = (targetConceptId: string) => {
    setBranchFilter('ALL');
    setTab('cards');
    setFocusedConceptId(targetConceptId);
    setFlippedMap((prev) => ({ ...prev, [targetConceptId]: true }));
  };

  return (
    <div class="review-deck-wrap">
      <div class="unit-topbar">
        <a href="#/" class="site-nav-link is-active">
          ← 返回「今天」
        </a>
        <div class="btn-row">
          <button
            type="button"
            class={tab === 'retest' ? 'btn-primary' : ''}
            onClick={() => setTab('retest')}
          >
            1/3/7 天错题重测（今日到期 {dueItems.length} · 待到期 {upcomingItems.length}）
          </button>
          <button
            type="button"
            class={tab === 'cards' ? 'btn-primary' : ''}
            onClick={() => setTab('cards')}
          >
            跨分支知识图谱闪卡（{content.knowledgeGraph.nodes.length} 节点）
          </button>
        </div>
      </div>

      {/* 薄弱概念 TOP5 横向速览卡 */}
      <section class="section-card" aria-label="薄弱概念 TOP5">
        <h2 class="section-heading">
          <span>薄弱概念 TOP 5（按错题次数与重测阶段自动归档，同步喂给状态墙）</span>
          <span class="badge-pill">共追踪 {Object.keys(telemetry.cardStats).length} 个已练概念</span>
        </h2>
        {weaknessTop5.length === 0 ? (
          <p class="hero-subtitle" style={{ margin: 0 }}>
            当前暂无薄弱或错题积压。在单元自测中答错或刷卡选「模糊/重来」的概念会自动归档到这里。
          </p>
        ) : (
          <div class="weakness-top5-list">
            {weaknessTop5.map((w, idx) => {
              const bMeta = branchMetaMap.get(w.concept.branchId);
              return (
                <div class="weakness-pill-card" key={w.concept.id}>
                  <span class="weakness-rank-num">#{idx + 1}</span>
                  <span
                    class="branch-tag"
                    style={{
                      backgroundColor: bMeta?.accentToken ?? '#3D7A8A',
                      marginBottom: 0,
                    }}
                  >
                    {w.concept.branchId}
                  </span>
                  <strong>{w.concept.label}</strong>
                  <span class="badge-pill badge-demo">
                    错 {w.stat.errorCount} 次 · {formatStageLabel(w.stat.retestStage)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {feedbackMsg && (
        <div class="section-card" style={{ padding: '12px 18px', borderColor: 'rgba(78,130,104,0.45)', background: '#f4f8f5' }}>
          {feedbackMsg}
        </div>
      )}

      {/* 子视图 1：1/3/7 天错题重测 */}
      {tab === 'retest' && (
        <section class="section-card" aria-label="1/3/7 天重测队列">
          <div class="section-heading">
            <span>1 / 3 / 7 天间隔重测中心</span>
            <label class="low-battery-toggle">
              <input
                type="checkbox"
                checked={includeUpcoming}
                onChange={(e) =>
                  setIncludeUpcoming((e.target as HTMLInputElement).checked)
                }
              />
              <span class="toggle-track" aria-hidden="true">
                <span class="toggle-thumb" />
              </span>
              <span>同时显示未来 1/3/7 天待到期项（便于提前巩固）</span>
            </label>
          </div>

          {visibleRetestItems.length === 0 ? (
            <div class="empty-track-notice" style={{ marginBottom: 0 }}>
              今天没有待重测的错题，可以切到「跨分支知识图谱闪卡」随意翻两张，或者安心去休息。
            </div>
          ) : (
            <div class="tracks-stack">
              {visibleRetestItems.map((item) => {
                const cid = item.concept.id;
                const bMeta = branchMetaMap.get(item.concept.branchId);
                const chosen = selectedChoiceMap[cid];

                return (
                  <article class="path-track-card" key={cid}>
                    <div class="path-track-badges">
                      <span
                        class="branch-tag"
                        style={{
                          backgroundColor: bMeta?.accentToken ?? '#3D7A8A',
                          marginBottom: 0,
                        }}
                      >
                        {item.concept.branchId} · {item.concept.label}
                      </span>
                      <span class="badge-pill badge-demo">
                        {formatStageLabel(item.stat.retestStage)}
                      </span>
                      {item.stat.dueDate && (
                        <span class="badge-pill">
                          计划重测日：{item.stat.dueDate}
                          {item.isDueToday ? '（今日到期）' : '（未到期·可提前测）'}
                        </span>
                      )}
                    </div>

                    {item.question ? (
                      <div>
                        <div class="quiz-stem" style={{ marginTop: '8px' }}>
                          重测题：{item.question.stem}
                        </div>
                        <div class="quiz-options-list">
                          {item.question.options.map((opt, oIdx) => {
                            const letter = String.fromCharCode(65 + oIdx);
                            return (
                              <button
                                key={oIdx}
                                type="button"
                                class={`quiz-option-btn ${
                                  chosen === oIdx ? 'is-selected' : ''
                                }`}
                                onClick={() =>
                                  setSelectedChoiceMap((prev) => ({
                                    ...prev,
                                    [cid]: oIdx,
                                  }))
                                }
                              >
                                <span class="option-letter">{letter}</span>
                                <span>{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div class="btn-row" style={{ marginTop: '12px' }}>
                          <button
                            type="button"
                            class="btn-primary btn-sm"
                            disabled={chosen === undefined}
                            onClick={() => handleSubmitRetest(item)}
                          >
                            提交重测并推进阶段
                          </button>
                          {item.unit && (
                            <button
                              type="button"
                              class="btn-sm"
                              onClick={() => onOpenUnit(item.unit!.id)}
                            >
                              回看原单元导学 ↗
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div class="concept-card-prompt">问：{item.concept.cardPrompt}</div>
                        <div class="concept-plain-def">答：{item.concept.cardAnswer}</div>
                        <div class="card-rating-row">
                          <button
                            type="button"
                            class="btn-primary btn-sm"
                            onClick={() =>
                              handleCardRating(cid, item.concept.branchId, 'easy')
                            }
                          >
                            这次稳稳答出（推进下一阶）
                          </button>
                          <button
                            type="button"
                            class="btn-sm"
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

      {/* 子视图 2：跨分支知识图谱闪卡盒 */}
      {tab === 'cards' && (
        <section class="section-card" aria-label="跨分支知识图谱闪卡盒">
          <div class="section-heading" style={{ flexWrap: 'wrap' }}>
            <span>知识图谱概念闪卡（支持先修节点与跨分支互链跳转）</span>
            <div class="btn-row">
              <button
                type="button"
                class={`btn-sm ${branchFilter === 'ALL' ? 'btn-primary' : ''}`}
                onClick={() => setBranchFilter('ALL')}
              >
                全部
              </button>
              {content.catalog.branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  class={`btn-sm ${branchFilter === b.id ? 'btn-primary' : ''}`}
                  onClick={() => setBranchFilter(b.id)}
                >
                  {b.id} {b.name}
                </button>
              ))}
            </div>
          </div>

          <div class="concept-cards-stack">
            {deck.map(({ concept, stat }) => {
              const bMeta = branchMetaMap.get(concept.branchId);
              const isFlipped = Boolean(flippedMap[concept.id]);
              const isFocused = focusedConceptId === concept.id;

              return (
                <article
                  key={concept.id}
                  class="concept-flashcard"
                  style={
                    isFocused
                      ? { borderColor: 'var(--accent-primary)', boxShadow: '0 0 0 2px rgba(196,106,74,0.18)' }
                      : undefined
                  }
                >
                  <div class="concept-card-top" style={{ flexWrap: 'wrap' }}>
                    <span
                      class="branch-tag"
                      style={{
                        backgroundColor: bMeta?.accentToken ?? '#3D7A8A',
                        marginBottom: 0,
                      }}
                    >
                      {concept.branchId}
                    </span>
                    <strong>{concept.label}</strong>
                    <span class="badge-pill" style={{ fontFamily: 'var(--font-mono)' }}>
                      {concept.id}
                    </span>
                    {stat && (
                      <span class="badge-pill">
                        已练 {stat.practiceCount} 次 · {formatStageLabel(stat.retestStage)}
                      </span>
                    )}
                  </div>

                  {concept.prerequisites.length > 0 && (
                    <div class="prereq-links-row">
                      <span>先修共用概念：</span>
                      {concept.prerequisites.map((preId) => (
                        <button
                          key={preId}
                          type="button"
                          class="btn-sm"
                          onClick={() => handleJumpCrossLink(preId)}
                        >
                          {preId} ↗
                        </button>
                      ))}
                    </div>
                  )}

                  <div class="concept-card-prompt">问：{concept.cardPrompt}</div>

                  {!isFlipped ? (
                    <button
                      type="button"
                      class="btn-sm"
                      onClick={() =>
                        setFlippedMap((prev) => ({ ...prev, [concept.id]: true }))
                      }
                    >
                      翻开答案与跨分支关联
                    </button>
                  ) : (
                    <div class="concept-card-back">
                      <div class="concept-answer-text">答：{concept.cardAnswer}</div>
                      <div class="concept-plain-def">人话定义：{concept.plainDefinition}</div>

                      {concept.crossLinks.length > 0 && (
                        <div class="concept-crosslinks">
                          {concept.crossLinks.map((link) => {
                            const target = content.knowledgeGraph.nodes.find(
                              (n) => n.id === link.targetId
                            );
                            return (
                              <div class="crosslink-item" key={link.targetId}>
                                <span>
                                  跨分支互链 →{' '}
                                  <strong>
                                    [{target?.branchId ?? ''}] {target?.label ?? link.targetId}
                                  </strong>
                                  ：{link.bridgeNote}
                                </span>
                                <button
                                  type="button"
                                  class="btn-sm"
                                  onClick={() => handleJumpCrossLink(link.targetId)}
                                >
                                  跳至该概念卡 →
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div class="card-rating-row">
                        <span>刷卡反馈：</span>
                        <button
                          type="button"
                          class="btn-primary btn-sm"
                          onClick={() =>
                            handleCardRating(concept.id, concept.branchId, 'easy')
                          }
                        >
                          熟练
                        </button>
                        <button
                          type="button"
                          class="btn-sm"
                          onClick={() =>
                            handleCardRating(concept.id, concept.branchId, 'fuzzy')
                          }
                        >
                          模糊（3天后）
                        </button>
                        <button
                          type="button"
                          class="btn-sm"
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
        </section>
      )}
    </div>
  );
}
