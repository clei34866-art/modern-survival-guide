import { useEffect, useRef, useState } from 'preact/hooks';
import {
  OriginCardsList,
  PlaceholderBanner,
  PsychBoundaryNotice,
  SourceTimelinessFooter,
  UnitVisualFrame,
} from '../components/ComplianceBadges';
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

const STEP_TITLES = [
  '1 场景开场',
  '2 先预测',
  '3 图文导学',
  '4 概念卡',
  '5 自测',
  '6 行动任务',
  '7 完成过关',
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

  // 第 2 步：先预测状态
  const [predChoice, setPredChoice] = useState<number | null>(null);
  const [predSubmitted, setPredSubmitted] = useState<boolean>(false);

  // 第 4 步：概念卡翻转与自评记录
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [ratedCards, setRatedCards] = useState<Record<string, CardRating>>({});

  // 第 5 步：自测作答状态
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [quizScoreRatio, setQuizScoreRatio] = useState<number>(
    existingSub?.quizPassScoreRatio ?? 0
  );

  // 第 6 步：行动任务 + 费曼一句话 + 层级实战产出勾选
  const [deliverableText, setDeliverableText] = useState<string>(
    existingSub?.deliverableSummary ?? ''
  );
  const [feynmanText, setFeynmanText] = useState<string>(
    existingSub?.feynmanOneLiner ?? ''
  );
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

  // 步骤停留计时器（用于精确写入学习时长留痕）
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
  };

  const concepts: ConceptNode[] = unit.conceptNodeIds
    .map((cid) => content.knowledgeGraph.nodes.find((n) => n.id === cid))
    .filter((n): n is ConceptNode => Boolean(n));

  // 第 2 步提交先预测
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

  // 第 4 步概念卡评级
  const handleRateCard = async (conceptId: string, rating: CardRating) => {
    setRatedCards((prev) => ({ ...prev, [conceptId]: rating }));
    const next = await recordCardReview(conceptId, rating, {
      branchId: unit.branchId,
      trackId: unit.trackId,
      durationMs: Math.max(2000, Date.now() - stepEnteredAtRef.current),
    });
    stepEnteredAtRef.current = Date.now();
    onTelemetryChange(next);
  };

  // 第 5 步提交自测
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

  // 第 6 步提交行动任务并判定过关
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

  // 检查是否因此解锁了下一个层级（如 B1 L1 -> L2）
  const newlyUnlockedTrack = parentBranch?.tracks.find(
    (t) =>
      t.unlockAfterTrackId === unit.trackId &&
      isTrackUnlocked(t, parentBranch.tracks, telemetry)
  );

  return (
    <div class="unit-player-wrap">
      {/* 顶部返回栏与分支定位 */}
      <div class="unit-topbar">
        <button
          type="button"
          class="btn-sm"
          onClick={() => onBackToBranches(unit.branchId)}
        >
          ← 返回 {unit.branchId} {parentBranch?.name ?? ''}路径图
        </button>
        <div class="unit-topbar-meta">
          <span
            class="branch-tag"
            style={{ backgroundColor: parentBranch?.accentToken ?? '#3D7A8A', marginBottom: 0 }}
          >
            {unit.branchId} · {parentTrack?.title ?? unit.trackId}
          </span>
          <span class="badge-pill">预计 {unit.estimatedMinutes} 分钟</span>
          {telemetry.unitSubmissions[unit.id]?.isCleared && (
            <span class="badge-pill badge-live">✓ 已过关</span>
          )}
        </div>
      </div>

      <h1 class="unit-main-title">{unit.title.replace(/^【示例占位】/, '')}</h1>
      <PlaceholderBanner visible={unit.isPlaceholder} />

      {/* 7 节点步骤条 */}
      <nav class="unit-stepper" aria-label="7 步学习流水线进度">
        {STEP_TITLES.map((label, idx) => {
          const stepNum = idx + 1;
          const isCurrent = step === stepNum;
          const canJump = stepNum <= maxVisitedStep;
          return (
            <button
              key={label}
              type="button"
              disabled={!canJump}
              class={`stepper-node ${isCurrent ? 'is-current' : ''} ${
                stepNum < step ? 'is-visited' : ''
              }`}
              onClick={() => goToStep(stepNum)}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* 第 1 步：生活场景开场 */}
      {step === 1 && (
        <section class="section-card unit-reading-card">
          <div class="step-eyebrow">第 1 步 · 生活场景开场（先看真实问题）</div>
          <h2 class="scenario-title">{unit.scenarioHook.sceneTitle}</h2>
          <blockquote class="scenario-story-box">{unit.scenarioHook.story}</blockquote>
          <div class="scenario-question-box">
            <strong>先想一想：</strong>
            {unit.scenarioHook.guidingQuestion}
          </div>
          <PsychBoundaryNotice sources={unit.sources} />
          <div class="step-footer-nav">
            <button
              type="button"
              class="btn-primary"
              onClick={() => goToStep(2)}
            >
              带着问题进入「先预测」 →
            </button>
          </div>
        </section>
      )}

      {/* 第 2 步：先预测（反直觉判断） */}
      {step === 2 && (
        <section class="section-card unit-reading-card">
          <div class="step-eyebrow">第 2 步 · 先预测（激活直觉，不怕猜错）</div>
          <h2 class="scenario-title">{unit.prediction.question}</h2>
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
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>

          {!predSubmitted ? (
            <div class="step-footer-nav">
              <button
                type="button"
                class="btn-primary"
                disabled={predChoice === null}
                onClick={handlePredictionSubmit}
              >
                锁定我的直觉判断
              </button>
            </div>
          ) : (
            <div class="prediction-reveal-box">
              <div class="prediction-reveal-title">
                {predChoice === unit.prediction.answerIndex
                  ? '✓ 眼光很毒！你避开了直觉陷阱'
                  : predChoice === unit.prediction.commonTrapIndex
                    ? '正好踩中了多数人的第一直觉陷阱（这恰恰说明今天学这一节很值）'
                    : '和实际规律不太一样——看看背后的反直觉原因：'}
              </div>
              <p style={{ margin: '6px 0 0' }}>{unit.prediction.whyCounterIntuitive}</p>
              <div class="step-footer-nav">
                <button
                  type="button"
                  class="btn-primary"
                  onClick={() => goToStep(3)}
                >
                  进入「图文导学」看清原理 →
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 第 3 步：图文导学 */}
      {step === 3 && (
        <section class="section-card unit-reading-card">
          <div class="step-eyebrow">第 3 步 · 图文导学</div>
          <PsychBoundaryNotice sources={unit.sources} />

          {unit.guide.blocks.map((blk, idx) => (
            <div class="guide-block" key={idx}>
              <h2 class="guide-block-heading">{blk.heading}</h2>
              <p class="guide-block-body">{blk.markdown}</p>
              {blk.keyTakeaway && (
                <div class="guide-takeaway-box">
                  <strong>人话划重点：</strong>
                  {blk.keyTakeaway}
                </div>
              )}
            </div>
          ))}

          <UnitVisualFrame visuals={unit.guide.visuals} />
          <OriginCardsList cards={unit.guide.originCards} />
          <SourceTimelinessFooter sources={unit.sources} />

          <div class="step-footer-nav">
            <button
              type="button"
              class="btn-primary"
              onClick={async () => {
                await flushStepDuration('guide');
                goToStep(4);
              }}
            >
              读完了，翻一下本节「概念卡」 →
            </button>
          </div>
        </section>
      )}

      {/* 第 4 步：概念卡（挂载知识图谱） */}
      {step === 4 && (
        <section class="section-card unit-reading-card">
          <div class="step-eyebrow">第 4 步 · 概念卡（挂载跨分支知识图谱）</div>
          <p class="hero-subtitle" style={{ marginBottom: '16px' }}>
            先在脑海里回想背面答案再点翻转；选「重来 / 模糊」会自动排入 1/3/7 天间隔温习。
          </p>

          <div class="concept-cards-stack">
            {concepts.map((node) => {
              const isFlipped = Boolean(flippedCards[node.id]);
              const rated = ratedCards[node.id];

              return (
                <article class="concept-flashcard" key={node.id}>
                  <div class="concept-card-top">
                    <span class="badge-pill">{node.id}</span>
                    <strong>{node.label}</strong>
                  </div>
                  <div class="concept-card-prompt">问：{node.cardPrompt}</div>

                  {!isFlipped ? (
                    <button
                      type="button"
                      class="btn-sm"
                      onClick={() =>
                        setFlippedCards((prev) => ({ ...prev, [node.id]: true }))
                      }
                    >
                      想好了，翻看解析
                    </button>
                  ) : (
                    <div class="concept-card-back">
                      <div class="concept-answer-text">答：{node.cardAnswer}</div>
                      <div class="concept-plain-def">人话定义：{node.plainDefinition}</div>

                      {node.crossLinks.length > 0 && (
                        <div class="concept-crosslinks">
                          {node.crossLinks.map((link) => {
                            const targetNode = content.knowledgeGraph.nodes.find(
                              (n) => n.id === link.targetId
                            );
                            const linkedUnit = content.units.find((u) =>
                              u.conceptNodeIds.includes(link.targetId)
                            );
                            return (
                              <div class="crosslink-item" key={link.targetId}>
                                <span>
                                  跨分支互链 → <strong>{targetNode?.label ?? link.targetId}</strong>：
                                  {link.bridgeNote}
                                </span>
                                {linkedUnit && linkedUnit.id !== unit.id && (
                                  <button
                                    type="button"
                                    class="btn-sm"
                                    onClick={() => onOpenUnit(linkedUnit.id)}
                                  >
                                    跳去关联单元 ↗
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div class="card-rating-row">
                        <span>提取流畅度自评：</span>
                        <button
                          type="button"
                          class={`btn-sm ${rated === 'easy' ? 'btn-primary' : ''}`}
                          onClick={() => handleRateCard(node.id, 'easy')}
                        >
                          熟练掌握
                        </button>
                        <button
                          type="button"
                          class={`btn-sm ${rated === 'fuzzy' ? 'btn-primary' : ''}`}
                          onClick={() => handleRateCard(node.id, 'fuzzy')}
                        >
                          有点模糊（3天后温习）
                        </button>
                        <button
                          type="button"
                          class={`btn-sm ${rated === 'again' ? 'btn-primary' : ''}`}
                          onClick={() => handleRateCard(node.id, 'again')}
                        >
                          没想起来（明晚重测）
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div class="step-footer-nav">
            <button
              type="button"
              class="btn-primary"
              onClick={() => goToStep(5)}
            >
              进入第 5 步「自测」检验提取 →
            </button>
          </div>
        </section>
      )}

      {/* 第 5 步：自测（编号选项点选，提交后出解析） */}
      {step === 5 && (
        <section class="section-card unit-reading-card">
          <div class="step-eyebrow">
            第 5 步 · 自测（达标线 {Math.round(unit.quiz.passRatio * 100)}%，错题自动归档至 1/3/7 天重测）
          </div>

          {unit.quiz.questions.map((q, qIdx) => {
            const picked = quizAnswers[q.id];
            return (
              <div class="quiz-question-block" key={q.id}>
                <div class="quiz-stem">
                  {qIdx + 1}. {q.stem}
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
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {quizSubmitted && (
                  <div class="quiz-explanation-box">
                    <strong>
                      {picked === q.correctIndex ? '✓ 回答正确：' : '✗ 解析与纠偏（已排入明日重测）：'}
                    </strong>
                    {q.explanation}
                  </div>
                )}
              </div>
            );
          })}

          {!quizSubmitted ? (
            <div class="step-footer-nav">
              <button
                type="button"
                class="btn-primary"
                disabled={
                  Object.keys(quizAnswers).length < unit.quiz.questions.length
                }
                onClick={handleQuizSubmit}
              >
                提交自测并查看解析
              </button>
            </div>
          ) : (
            <div class="quiz-result-bar">
              <div>
                本次自测得分：<strong>{Math.round(quizScoreRatio * 100)}%</strong>（
                {quizScoreRatio >= unit.quiz.passRatio ? '已达标 ✓' : '尚未达标，请看清解析后重测'}
                ）
              </div>
              <div class="btn-row">
                {quizScoreRatio < unit.quiz.passRatio && (
                  <button
                    type="button"
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
                  <button
                    type="button"
                    class="btn-primary"
                    onClick={() => goToStep(6)}
                  >
                    达标！进入「行动任务」落地 →
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 第 6 步：行动任务提交（含 B1 费曼一句话与层级项目验收位） */}
      {step === 6 && (
        <section class="section-card unit-reading-card">
          <div class="step-eyebrow">第 6 步 · 行动任务（生存类学习：把事真正做出来才算过关）</div>
          <h2 class="scenario-title">{unit.actionTask.title}</h2>
          <p class="hero-subtitle">真实切入场景：{unit.actionTask.lifeContext}</p>

          <ol class="action-steps-list">
            {unit.actionTask.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>

          {/* M6：关联真实任务池待办一键抵扣 */}
          {(() => {
            const matchingPoolTasks = (telemetry.realTasks ?? []).filter(
              (rt) =>
                rt.status === 'open' &&
                (rt.category === unit.actionTask.matchPoolCategory ||
                  rt.branchId === unit.branchId)
            );
            if (matchingPoolTasks.length === 0) return null;
            return (
              <div class="milestone-inline-check" style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  真实任务池匹配项（点选后提交本节，同步将该真实待办标为已交付）：
                </div>
                <div class="btn-row">
                  {matchingPoolTasks.map((rt) => {
                    const isPicked = linkedRealTaskId === rt.id;
                    return (
                      <button
                        key={rt.id}
                        type="button"
                        class={`btn-sm ${isPicked ? 'btn-primary' : ''}`}
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
                        {isPicked ? '✓ 已绑定：' : '+ 绑定：'}
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
              onInput={(e) =>
                setDeliverableText((e.target as HTMLTextAreaElement).value)
              }
              placeholder="写下你的执行结果、模板内容或本地文件路径…"
            />
          </div>

          {unit.actionTask.feynmanCheckPrompt && (
            <div class="form-field-block">
              <label class="form-label">
                费曼一句话检查：{unit.actionTask.feynmanCheckPrompt}
              </label>
              <input
                type="text"
                value={feynmanText}
                onInput={(e) =>
                  setFeynmanText((e.target as HTMLInputElement).value)
                }
                placeholder="不拽术语，用一句大白话说清核心原理…"
              />
            </div>
          )}

          {parentTrack?.milestoneDeliverable && (
            <div class="milestone-inline-check">
              <label class="task-check-wrap" style={{ alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  checked={signOffMilestone}
                  onChange={(e) =>
                    setSignOffMilestone((e.target as HTMLInputElement).checked)
                  }
                />
                <span class="custom-checkbox" aria-hidden="true">
                  {signOffMilestone ? '✓' : ''}
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
              过关条件未满足：{actionError}
              {quizScoreRatio < unit.quiz.passRatio && (
                <button
                  type="button"
                  class="btn-sm"
                  style={{ marginLeft: '10px' }}
                  onClick={() => goToStep(5)}
                >
                  去第 5 步完成自测
                </button>
              )}
            </div>
          )}

          <div class="step-footer-nav">
            <button
              type="button"
              class="btn-primary"
              onClick={handleCompleteUnit}
            >
              提交行动记录并完成过关判定 →
            </button>
          </div>
        </section>
      )}

      {/* 第 7 步：完成过关总结 */}
      {step === 7 && (
        <section class="section-card unit-reading-card wrap-up-card" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div class="step-eyebrow" style={{ color: '#2D5942' }}>
            第 7 步 · 单元过关已留痕
          </div>
          <h2 class="wrap-up-title">
            ✓ 恭喜过关：{unit.title.replace(/^【示例占位】/, '')}
          </h2>
          <p class="wrap-up-desc">
            自测得分 {Math.round(quizScoreRatio * 100)}% · 行动交付已归档至本地 IndexedDB（刷新不丢失，已通过 BroadcastChannel 广播）。
          </p>

          {newlyUnlockedTrack && (
            <div class="unlock-celebration-banner">
              🌱 层级解锁生效：<strong>{newlyUnlockedTrack.title}</strong> 已正式开放！
            </div>
          )}

          <div class="btn-row" style={{ marginTop: '12px' }}>
            <button
              type="button"
              class="btn-primary"
              onClick={() => onBackToBranches(unit.branchId)}
            >
              返回 {unit.branchId} 路径图查看进度
            </button>
            <a href="#/" class="site-nav-link is-active">
              回到「今天」首页
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
