import { useEffect, useRef, useState } from 'preact/hooks';
import {
  OriginCardsList,
  PlaceholderBanner,
  PsychBoundaryNotice,
  SourceTimelinessFooter,
  UnitVisualFrame,
} from '../components/ComplianceBadges';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconFlip,
  IconSprout,
} from '../components/Icons';
import { RichText } from '../components/RichText';
import type { PlatformContentBundle } from '../core/contentLoader';
import {
  recordActionSubmission,
  recordCardReview,
  recordMilestoneSubmission,
  recordQuizAttempt,
  recordStudyDuration,
} from '../core/db';
import { evaluateUnitPassGate, isTrackUnlocked } from '../core/gatekeeper';
import type {
  CardRating,
  ConceptNode,
  LearningUnit,
  StudyDurationLog,
  TelemetrySnapshot,
} from '../types/schema';

interface UnitPlayerViewProps {
  unit: LearningUnit;
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  onTelemetryChange: (next: TelemetrySnapshot) => void;
  onBackToBranches: (branchId: LearningUnit['branchId']) => void;
  onOpenUnit: (unitId: string) => void;
}

const STEP_META = [
  { num: 1, short: '场景', full: '场景开场' },
  { num: 2, short: '预测', full: '先预测' },
  { num: 3, short: '动图导学', full: '动图导学' },
  { num: 4, short: '概念卡', full: '概念闪卡' },
  { num: 5, short: '自测', full: '提取自测' },
  { num: 6, short: '行动', full: '行动任务' },
  { num: 7, short: '过关', full: '完成过关' },
] as const;

export function UnitPlayerView({
  unit,
  content,
  telemetry,
  onTelemetryChange,
  onBackToBranches,
  onOpenUnit,
}: UnitPlayerViewProps) {
  const existingSub = telemetry.unitSubmissions[unit.id];
  const [step, setStep] = useState<number>(1);
  const [maxVisitedStep, setMaxVisitedStep] = useState<number>(existingSub?.isCleared ? 7 : 1);

  // 第 2 步：先预测
  const [predChoice, setPredChoice] = useState<number | null>(null);
  const [predSubmitted, setPredSubmitted] = useState<boolean>(false);

  // 第 3 步：动图与正文联动高亮步数
  const [diagramStep, setDiagramStep] = useState<number | undefined>(undefined);

  // 第 4 步：单卡聚焦翻转闪卡台
  const [cardIdx, setCardIdx] = useState<number>(0);
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [ratedCards, setRatedCards] = useState<Record<string, CardRating>>({});

  // 第 5 步：自测
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [quizScoreRatio, setQuizScoreRatio] = useState<number>(
    existingSub?.quizPassScoreRatio ?? 0
  );

  // 第 6 步：行动任务 + 费曼一句话 + 层级实战产出勾选
  const [deliverableText, setDeliverableText] = useState<string>(
    existingSub?.deliverableSummary ?? ''
  );
  const [feynmanText, setFeynmanText] = useState<string>(existingSub?.feynmanOneLiner ?? '');
  const [linkedRealTaskId, setLinkedRealTaskId] = useState<string | undefined>(
    existingSub?.linkedRealTaskId
  );
  const parentBranch = content.catalog.branches.find((b) => b.id === unit.branchId);
  const parentTrack = parentBranch?.tracks.find((t) => t.id === unit.trackId);
  const existingMilestone = parentTrack
    ? telemetry.milestoneSubmissions[parentTrack.id]
    : undefined;
  const [signOffMilestone, setSignOffMilestone] = useState<boolean>(
    existingMilestone?.isApproved ?? false
  );
  const [actionError, setActionError] = useState<string>('');

  const stepEnteredAtRef = useRef<number>(Date.now());
  useEffect(() => {
    stepEnteredAtRef.current = Date.now();
  }, [step, unit.id]);

  const flushStepDuration = async (activity: StudyDurationLog['activity']) => {
    const rawElapsed = Date.now() - stepEnteredAtRef.current;
    const boundedMs = Math.min(Math.max(rawElapsed, 1500), 30 * 60 * 1000);
    stepEnteredAtRef.current = Date.now();
    const next = await recordStudyDuration({
      branchId: unit.branchId,
      trackId: unit.trackId,
      unitId: unit.id,
      activity,
      durationMs: boundedMs,
    });
    onTelemetryChange(next);
    return next;
  };

  const goToStep = (targetStep: number) => {
    setStep(targetStep);
    setMaxVisitedStep((prev) => Math.max(prev, targetStep));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const concepts: ConceptNode[] = unit.conceptNodeIds
    .map((cid) => content.knowledgeGraph.nodes.find((n) => n.id === cid))
    .filter((n): n is ConceptNode => Boolean(n));

  const currentConcept = concepts[Math.min(cardIdx, Math.max(0, concepts.length - 1))];

  // 第 4 步支持键盘空格翻卡
  useEffect(() => {
    if (step !== 4 || !currentConcept) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlippedCards((prev) => ({
          ...prev,
          [currentConcept.id]: !prev[currentConcept.id],
        }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, currentConcept]);

  const handlePredictionSubmit = async () => {
    if (predChoice === null) return;
    const elapsed = Math.max(1200, Date.now() - stepEnteredAtRef.current);
    setPredSubmitted(true);
    const next = await recordQuizAttempt({
      unitId: unit.id,
      branchId: unit.branchId,
      trackId: unit.trackId,
      questionId: `${unit.id}-prediction`,
      conceptId: unit.conceptNodeIds[0] ?? 'b1.prompt_context_boundary',
      kind: 'prediction',
      selectedIndex: predChoice,
      isCorrect: predChoice === unit.prediction.answerIndex,
      durationMs: elapsed,
    });
    onTelemetryChange(next);
  };

  const handleRateCard = async (conceptId: string, rating: CardRating) => {
    setRatedCards((prev) => ({ ...prev, [conceptId]: rating }));
    const next = await recordCardReview(conceptId, rating, {
      branchId: unit.branchId,
      trackId: unit.trackId,
      durationMs: Math.max(2000, Date.now() - stepEnteredAtRef.current),
    });
    stepEnteredAtRef.current = Date.now();
    onTelemetryChange(next);
    if (cardIdx < concepts.length - 1) {
      setTimeout(() => setCardIdx((i) => Math.min(concepts.length - 1, i + 1)), 220);
    }
  };

  const handleQuizSubmit = async () => {
    const total = unit.quiz.questions.length;
    if (total === 0) return;

    const elapsedTotal = Math.max(2000, Date.now() - stepEnteredAtRef.current);
    const perQuestionMs = Math.round(elapsedTotal / total);

    let correctCount = 0;
    let latestSnap = telemetry;
    for (const q of unit.quiz.questions) {
      const chosen = quizAnswers[q.id] ?? -1;
      const isCorrect = chosen === q.correctIndex;
      if (isCorrect) correctCount += 1;
      latestSnap = await recordQuizAttempt({
        unitId: unit.id,
        branchId: unit.branchId,
        trackId: unit.trackId,
        questionId: q.id,
        conceptId: q.relatedConceptId,
        kind: 'quiz',
        selectedIndex: chosen,
        isCorrect,
        durationMs: perQuestionMs,
      });
    }

    latestSnap = await recordStudyDuration({
      branchId: unit.branchId,
      trackId: unit.trackId,
      unitId: unit.id,
      activity: 'quiz',
      durationMs: elapsedTotal,
    });

    const ratio = correctCount / total;
    setQuizScoreRatio(ratio);
    setQuizSubmitted(true);
    stepEnteredAtRef.current = Date.now();
    onTelemetryChange(latestSnap);
  };

  const handleCompleteUnit = async () => {
    const gate = evaluateUnitPassGate({
      quizScoreRatio,
      passRatio: unit.quiz.passRatio,
      deliverableSummary: deliverableText,
      requiresFeynman: Boolean(unit.actionTask.feynmanCheckPrompt),
      feynmanOneLiner: feynmanText,
    });

    if (!gate.canClearUnit) {
      setActionError(gate.blockingReasons.join('；'));
      return;
    }

    setActionError('');
    await flushStepDuration('action_task');

    let latest = await recordActionSubmission({
      unitId: unit.id,
      branchId: unit.branchId,
      trackId: unit.trackId,
      deliverableSummary: deliverableText.trim(),
      feynmanOneLiner: feynmanText.trim() || undefined,
      linkedRealTaskId,
      quizPassScoreRatio: quizScoreRatio,
      isCleared: true,
    });

    if (parentTrack?.milestoneDeliverable && signOffMilestone) {
      latest = await recordMilestoneSubmission({
        trackId: parentTrack.id,
        branchId: unit.branchId,
        completionPercent: 100,
        artifactSummary: deliverableText.trim(),
        isApproved: true,
      });
    }

    onTelemetryChange(latest);
    goToStep(7);
  };

  const newlyUnlockedTrack = parentBranch?.tracks.find(
    (t) =>
      t.unlockAfterTrackId === unit.trackId &&
      isTrackUnlocked(t, parentBranch.tracks, telemetry)
  );

  const allQuestionsAnswered =
    Object.keys(quizAnswers).length >= unit.quiz.questions.length;

  return (
    <div class="unit-focus-layout">
      {/* 56px 吸顶沉浸专注顶栏：返回面包屑 + 连线 7 步进度轴 + 用时 */}
      <header class="focus-topbar">
        <div class="focus-topbar-inner">
          <button
            type="button"
            class="btn btn-sm focus-back-btn"
            onClick={() => onBackToBranches(unit.branchId)}
          >
            <IconArrowLeft size={15} />
            <span>返回 {unit.branchId}</span>
          </button>

          <nav class="unit-stepper-rail" aria-label="7 步学习进度">
            {STEP_META.map((item, idx) => {
              const isCurrent = step === item.num;
              const isPassed = item.num < step;
              const canJump = item.num <= maxVisitedStep;
              return (
                <div class="stepper-rail-item" key={item.num}>
                  <button
                    type="button"
                    disabled={!canJump}
                    class={`stepper-node ${isCurrent ? 'is-current' : ''} ${
                      isPassed ? 'is-visited' : ''
                    }`}
                    onClick={() => goToStep(item.num)}
                    title={`第 ${item.num} 步 · ${item.full}`}
                  >
                    <span class="stepper-num tabular-num">
                      {isPassed ? <IconCheck size={12} /> : item.num}
                    </span>
                    <span class="stepper-label">{item.short}</span>
                  </button>
                  {idx < STEP_META.length - 1 && (
                    <span class={`stepper-connector ${item.num < step ? 'is-lit' : ''}`} />
                  )}
                </div>
              );
            })}
          </nav>

          <div class="focus-topbar-right">
            <span class="status-chip tabular-num">{unit.estimatedMinutes} 分钟</span>
            {telemetry.unitSubmissions[unit.id]?.isCleared && (
              <span class="status-chip chip-growth">已过关</span>
            )}
          </div>
        </div>
      </header>

      <main class={`unit-player-wrap ${step === 3 ? 'is-wide-guide' : ''}`}>
        {/* 单元大标题头 */}
        <div class="unit-hero-head">
          <div class="branch-dot-label">
            <span
              class="branch-dot"
              style={{ backgroundColor: parentBranch?.accentToken ?? '#266D7E' }}
            />
            <span>
              {unit.branchId} · {parentTrack?.title ?? unit.trackId}
            </span>
          </div>
          <h1 class="unit-main-title">{unit.title}</h1>
          <PlaceholderBanner visible={unit.isPlaceholder} />
        </div>

        {/* 第 1 步：生活场景开场 */}
        {step === 1 && (
          <section class="surface-card unit-stage-card">
            <div class="step-badge-row">
              <span class="status-chip chip-accent">第 1 步 · 场景开场</span>
            </div>
            <h2 class="scenario-title">{unit.scenarioHook.sceneTitle}</h2>
            <div class="scenario-story-panel">
              <p>
                <RichText text={unit.scenarioHook.story} />
              </p>
            </div>
            <div class="scenario-question-panel">
              <span class="guiding-label">带着这个问题继续</span>
              <p>
                <RichText text={unit.scenarioHook.guidingQuestion} />
              </p>
            </div>
            <PsychBoundaryNotice sources={unit.sources} />
            <div class="step-footer-nav">
              <button type="button" class="btn btn-primary" onClick={() => goToStep(2)}>
                <span>先做一道直觉预测</span>
                <IconArrowRight size={15} />
              </button>
            </div>
          </section>
        )}

        {/* 第 2 步：先预测（反直觉判断） */}
        {step === 2 && (
          <section class="surface-card unit-stage-card">
            <div class="step-badge-row">
              <span class="status-chip chip-accent">第 2 步 · 先预测</span>
              <span class="muted-inline">激活已有直觉，猜错反而印象最深</span>
            </div>
            <h2 class="scenario-title">
              <RichText text={unit.prediction.question} />
            </h2>
            <div class="quiz-options-list">
              {unit.prediction.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isSelected = predChoice === idx;
                const isAnswer = predSubmitted && idx === unit.prediction.answerIndex;
                const isWrongPick =
                  predSubmitted && isSelected && idx !== unit.prediction.answerIndex;

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={predSubmitted}
                    class={`quiz-option-btn ${isSelected ? 'is-selected' : ''} ${
                      isAnswer ? 'is-correct' : ''
                    } ${isWrongPick ? 'is-wrong' : ''}`}
                    onClick={() => setPredChoice(idx)}
                  >
                    <span class="option-letter">{letter}</span>
                    <span class="option-text">
                      <RichText text={opt} />
                    </span>
                  </button>
                );
              })}
            </div>

            {!predSubmitted ? (
              <div class="step-footer-nav">
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={predChoice === null}
                  onClick={handlePredictionSubmit}
                >
                  锁定我的直觉判断
                </button>
              </div>
            ) : (
              <div class="prediction-compare-grid">
                <div class="compare-col is-trap">
                  <div class="compare-col-label">多数人的直觉判断</div>
                  <p>
                    {predChoice === unit.prediction.answerIndex
                      ? '你成功避开了最常见的第一直觉陷阱。'
                      : `常见误区是选项 ${String.fromCharCode(65 + unit.prediction.commonTrapIndex)} —— 踩中陷阱恰恰说明这一节很值。`}
                  </p>
                </div>
                <div class="compare-col is-truth">
                  <div class="compare-col-label">真实底层规律</div>
                  <p>
                    <RichText text={unit.prediction.whyCounterIntuitive} />
                  </p>
                </div>
                <div class="step-footer-nav compare-footer">
                  <button type="button" class="btn btn-primary" onClick={() => goToStep(3)}>
                    <span>进入动图导学看清机制</span>
                    <IconArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 第 3 步：动图导学（顶部宽幅动图舞台 + 下方 2:1 均衡双栏阅读） */}
        {step === 3 && (
          <div class="guide-editorial-wrap">
            {/* 顶部主角：瑞士风逻辑分步动图舞台 */}
            <UnitVisualFrame
              visuals={unit.guide.visuals}
              activeStep={diagramStep}
              onStepChange={setDiagramStep}
            />

            {/* 下方 2:1 均衡阅读栏：左 65ch 精排正文 + 右粘性划重点/溯源/合规栏 */}
            <div class="guide-two-col">
              <article class="surface-card guide-prose-col">
                <div class="step-badge-row">
                  <span class="status-chip chip-accent">第 3 步 · 原理拆解</span>
                  <span class="muted-inline">带虚线下划线的术语可点击查看人话卡片</span>
                </div>

                {unit.guide.blocks.map((blk, idx) => (
                  <section
                    class="guide-block"
                    key={idx}
                    onClick={() => setDiagramStep(idx)}
                  >
                    <h2 class="guide-block-heading">
                      <span class="guide-block-num tabular-num">0{idx + 1}</span>
                      <span>
                        <RichText text={blk.heading} />
                      </span>
                    </h2>
                    <p class="guide-block-body">
                      <RichText text={blk.markdown} concepts={concepts} />
                    </p>
                  </section>
                ))}

                <div class="step-footer-nav">
                  <button
                    type="button"
                    class="btn btn-primary"
                    onClick={async () => {
                      await flushStepDuration('guide');
                      goToStep(4);
                    }}
                  >
                    <span>读完了，翻看概念闪卡</span>
                    <IconArrowRight size={15} />
                  </button>
                </div>
              </article>

              <aside class="guide-side-rail">
                <section class="rail-card">
                  <h3 class="rail-section-title">本节人话划重点</h3>
                  <ul class="takeaway-rail-list">
                    {unit.guide.blocks
                      .filter((b) => Boolean(b.keyTakeaway))
                      .map((b, i) => (
                        <li key={i}>
                          <RichText text={b.keyTakeaway!} />
                        </li>
                      ))}
                  </ul>
                </section>

                <PsychBoundaryNotice sources={unit.sources} />
                <OriginCardsList cards={unit.guide.originCards} />
                <SourceTimelinessFooter sources={unit.sources} />
              </aside>
            </div>
          </div>
        )}

        {/* 第 4 步：单卡聚焦 3D 翻转概念卡台 */}
        {step === 4 && currentConcept && (
          <section class="surface-card unit-stage-card">
            <div class="flashcard-stage-top">
              <div>
                <span class="status-chip chip-accent">第 4 步 · 概念闪卡</span>
                <p class="muted-desc" style={{ marginTop: '6px' }}>
                  先在脑中复述再点击翻面（桌面可按空格键）；选「模糊 / 重来」会自动排入 1/3/7 天重测。
                </p>
              </div>
              <span class="status-chip tabular-num">
                第 {cardIdx + 1} / {concepts.length} 张
              </span>
            </div>

            <div class="flip-deck-stage">
              <div
                class={`flip-card-box ${flippedCards[currentConcept.id] ? 'is-flipped' : ''}`}
                onClick={() =>
                  setFlippedCards((prev) => ({
                    ...prev,
                    [currentConcept.id]: !prev[currentConcept.id],
                  }))
                }
              >
                <div class="flip-card-face">
                  <div class="flip-card-eyebrow">{currentConcept.label}</div>
                  {!flippedCards[currentConcept.id] ? (
                    <div class="flip-front-content">
                      <div class="flip-question-text">{currentConcept.cardPrompt}</div>
                      <button type="button" class="btn btn-subtle">
                        <IconFlip size={15} />
                        <span>翻看解析</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      class="flip-back-content"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div class="flip-answer-main">
                        <RichText text={currentConcept.cardAnswer} />
                      </div>
                      <div class="flip-plain-def">
                        <strong>人话定义：</strong>
                        {currentConcept.plainDefinition}
                      </div>

                      {currentConcept.crossLinks.length > 0 && (
                        <div class="concept-crosslinks">
                          {currentConcept.crossLinks.map((link) => {
                            const targetNode = content.knowledgeGraph.nodes.find(
                              (n) => n.id === link.targetId
                            );
                            const linkedUnit = content.units.find((u) =>
                              u.conceptNodeIds.includes(link.targetId)
                            );
                            return (
                              <div class="crosslink-item" key={link.targetId}>
                                <span>
                                  跨分支互链 ·{' '}
                                  <strong>{targetNode?.label ?? link.targetId}</strong>：
                                  {link.bridgeNote}
                                </span>
                                {linkedUnit && linkedUnit.id !== unit.id && (
                                  <button
                                    type="button"
                                    class="btn btn-sm"
                                    onClick={() => onOpenUnit(linkedUnit.id)}
                                  >
                                    前往关联单元
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div class="card-rating-row">
                        <button
                          type="button"
                          class={`btn ${
                            ratedCards[currentConcept.id] === 'easy' ? 'btn-growth' : ''
                          }`}
                          onClick={() => handleRateCard(currentConcept.id, 'easy')}
                        >
                          熟练掌握
                        </button>
                        <button
                          type="button"
                          class={`btn ${
                            ratedCards[currentConcept.id] === 'fuzzy' ? 'btn-warning' : ''
                          }`}
                          onClick={() => handleRateCard(currentConcept.id, 'fuzzy')}
                        >
                          有点模糊（3天后）
                        </button>
                        <button
                          type="button"
                          class={`btn ${
                            ratedCards[currentConcept.id] === 'again' ? 'btn-danger-outline' : ''
                          }`}
                          onClick={() => handleRateCard(currentConcept.id, 'again')}
                        >
                          没想起来（明日重测）
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {concepts.length > 1 && (
                <div class="deck-pager-row">
                  <button
                    type="button"
                    class="btn btn-sm"
                    disabled={cardIdx === 0}
                    onClick={() => setCardIdx((i) => Math.max(0, i - 1))}
                  >
                    <IconArrowLeft size={14} /> 上一张
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm"
                    disabled={cardIdx >= concepts.length - 1}
                    onClick={() => setCardIdx((i) => Math.min(concepts.length - 1, i + 1))}
                  >
                    下一张 <IconArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>

            <div class="step-footer-nav">
              <button type="button" class="btn btn-primary" onClick={() => goToStep(5)}>
                <span>进入第 5 步提取自测</span>
                <IconArrowRight size={15} />
              </button>
            </div>
          </section>
        )}

        {/* 第 5 步：自测 */}
        {step === 5 && (
          <section class="surface-card unit-stage-card">
            <div class="step-badge-row">
              <span class="status-chip chip-accent">第 5 步 · 提取自测</span>
              <span class="muted-inline">
                达标线 {Math.round(unit.quiz.passRatio * 100)}%，错题自动排入 1/3/7 天重测
              </span>
            </div>

            {unit.quiz.questions.map((q, qIdx) => {
              const picked = quizAnswers[q.id];
              return (
                <div class="quiz-question-block" key={q.id}>
                  <div class="quiz-stem">
                    <span class="quiz-q-num tabular-num">Q{qIdx + 1}</span>
                    <span>
                      <RichText text={q.stem} />
                    </span>
                  </div>
                  <div class="quiz-options-list">
                    {q.options.map((opt, oIdx) => {
                      const letter = String.fromCharCode(65 + oIdx);
                      const isSelected = picked === oIdx;
                      const isCorrectOpt = quizSubmitted && oIdx === q.correctIndex;
                      const isWrongPick =
                        quizSubmitted && isSelected && oIdx !== q.correctIndex;

                      return (
                        <button
                          key={oIdx}
                          type="button"
                          disabled={quizSubmitted}
                          class={`quiz-option-btn ${isSelected ? 'is-selected' : ''} ${
                            isCorrectOpt ? 'is-correct' : ''
                          } ${isWrongPick ? 'is-wrong' : ''}`}
                          onClick={() =>
                            setQuizAnswers((prev) => ({ ...prev, [q.id]: oIdx }))
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
                  {quizSubmitted && (
                    <div
                      class={`quiz-explanation-box ${
                        picked === q.correctIndex ? 'is-right' : 'is-wrong'
                      }`}
                    >
                      <strong>
                        {picked === q.correctIndex ? '回答正确：' : '纠偏解析（已排入明日重测）：'}
                      </strong>
                      <RichText text={q.explanation} />
                    </div>
                  )}
                </div>
              );
            })}

            {!quizSubmitted ? (
              <div class="step-footer-nav">
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={!allQuestionsAnswered}
                  onClick={handleQuizSubmit}
                >
                  提交自测并查看解析
                </button>
              </div>
            ) : (
              <div class="quiz-result-bar">
                <div class="quiz-score-readout">
                  本次得分：<strong class="tabular-num">{Math.round(quizScoreRatio * 100)}%</strong>
                  <span
                    class={`status-chip ${
                      quizScoreRatio >= unit.quiz.passRatio ? 'chip-growth' : 'chip-warning'
                    }`}
                  >
                    {quizScoreRatio >= unit.quiz.passRatio ? '已达标' : '未达标，请重测'}
                  </span>
                </div>
                <div class="btn-row">
                  {quizScoreRatio < unit.quiz.passRatio && (
                    <button
                      type="button"
                      class="btn"
                      onClick={() => {
                        setQuizSubmitted(false);
                        setQuizAnswers({});
                        stepEnteredAtRef.current = Date.now();
                      }}
                    >
                      重测本节题目
                    </button>
                  )}
                  {quizScoreRatio >= unit.quiz.passRatio && (
                    <button type="button" class="btn btn-primary" onClick={() => goToStep(6)}>
                      <span>进入行动任务落地</span>
                      <IconArrowRight size={15} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 第 6 步：行动任务 */}
        {step === 6 && (
          <section class="surface-card unit-stage-card">
            <div class="step-badge-row">
              <span class="status-chip chip-accent">第 6 步 · 实战行动任务</span>
            </div>
            <h2 class="scenario-title">
              <RichText text={unit.actionTask.title} />
            </h2>
            <p class="muted-desc">切入场景：{unit.actionTask.lifeContext}</p>

            <ol class="action-steps-list">
              {unit.actionTask.steps.map((s) => (
                <li key={s}>
                  <RichText text={s} />
                </li>
              ))}
            </ol>

            {(() => {
              const matchingPoolTasks = (telemetry.realTasks ?? []).filter(
                (rt) =>
                  rt.status === 'open' &&
                  (rt.category === unit.actionTask.matchPoolCategory ||
                    rt.branchId === unit.branchId)
              );
              if (matchingPoolTasks.length === 0) return null;
              return (
                <div class="milestone-inline-check" style={{ marginBottom: '16px' }}>
                  <div class="inline-check-title">
                    绑定真实任务池待办（提交本节时同步标为已交付）：
                  </div>
                  <div class="btn-row">
                    {matchingPoolTasks.map((rt) => {
                      const isPicked = linkedRealTaskId === rt.id;
                      return (
                        <button
                          key={rt.id}
                          type="button"
                          class={`btn btn-sm ${isPicked ? 'btn-primary' : ''}`}
                          onClick={() => {
                            if (isPicked) {
                              setLinkedRealTaskId(undefined);
                            } else {
                              setLinkedRealTaskId(rt.id);
                              if (!deliverableText.trim()) {
                                setDeliverableText(`【真实待办交付】${rt.title}`);
                              }
                            }
                          }}
                        >
                          {isPicked ? '已绑定：' : '+ 绑定：'}
                          {rt.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div class="form-field-block">
              <label class="form-label">{unit.actionTask.deliverablePrompt}</label>
              <textarea
                rows={3}
                value={deliverableText}
                onInput={(e) => setDeliverableText((e.target as HTMLTextAreaElement).value)}
                placeholder="写下你的执行结果、模板内容或本地文件路径…"
              />
            </div>

            {unit.actionTask.feynmanCheckPrompt && (
              <div class="form-field-block">
                <label class="form-label">
                  费曼一句话复述：{unit.actionTask.feynmanCheckPrompt}
                </label>
                <input
                  type="text"
                  value={feynmanText}
                  onInput={(e) => setFeynmanText((e.target as HTMLInputElement).value)}
                  placeholder="不拽术语，用一句大白话说清核心原理…"
                />
              </div>
            )}

            {parentTrack?.milestoneDeliverable && (
              <div class="milestone-inline-check">
                <label class="task-check-wrap inline-checkbox-label">
                  <input
                    type="checkbox"
                    checked={signOffMilestone}
                    onChange={(e) =>
                      setSignOffMilestone((e.target as HTMLInputElement).checked)
                    }
                  />
                  <span class="custom-checkbox" aria-hidden="true">
                    {signOffMilestone && <IconCheck size={13} />}
                  </span>
                  <span>
                    同步确认本阶总产出已达标：
                    <strong>{parentTrack.milestoneDeliverable.title}</strong>
                  </span>
                </label>
              </div>
            )}

            {actionError && (
              <div class="action-gate-error" role="alert">
                <span>过关条件未满足：{actionError}</span>
                {quizScoreRatio < unit.quiz.passRatio && (
                  <button type="button" class="btn btn-sm" onClick={() => goToStep(5)}>
                    返回第 5 步自测
                  </button>
                )}
              </div>
            )}

            <div class="step-footer-nav">
              <button type="button" class="btn btn-primary" onClick={handleCompleteUnit}>
                <span>提交行动记录并完成过关</span>
                <IconArrowRight size={15} />
              </button>
            </div>
          </section>
        )}

        {/* 第 7 步：过关完成 */}
        {step === 7 && (
          <section class="wrap-up-card unit-clear-celebration">
            <div class="wrap-up-icon-wrap">
              <IconSprout size={28} />
            </div>
            <div class="unit-clear-body">
              <span class="status-chip chip-growth">单元过关已留痕</span>
              <h2 class="wrap-up-title" style={{ marginTop: '8px' }}>
                已完成：{unit.title}
              </h2>
              <p class="wrap-up-desc">
                自测得分 {Math.round(quizScoreRatio * 100)}% · 行动记录已写入本地 IndexedDB 并同步更新技能树与状态墙。
              </p>

              {newlyUnlockedTrack && (
                <div class="unlock-celebration-banner">
                  新阶段已解锁：<strong>{newlyUnlockedTrack.title}</strong>
                </div>
              )}

              <div class="btn-row" style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  class="btn btn-primary"
                  onClick={() => onBackToBranches(unit.branchId)}
                >
                  返回 {unit.branchId} 路径图
                </button>
                <a href="#/" class="btn">
                  回到「今天」首页
                </a>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
