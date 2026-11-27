import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  Check,
  CheckCircle2,
  Moon,
  RotateCw,
  Search,
  Sun,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  OriginCardsList,
  PlaceholderBanner,
  PsychBoundaryNotice,
  SourceTimelinessFooter,
  UnitVisualFrame,
} from '@/components/ComplianceBadges';
import { useGlossaryDrawer } from '@/components/GlossaryDrawer';
import { LifeScenarioSim } from '@/components/LifeScenarioSim';
import { LifeToolsSandbox, type LifeToolKey } from '@/components/LifeToolsSandbox';
import { RichText } from '@/components/RichText';
import { AlertBanner, Drawer, Popconfirm, Tooltip } from '@/components/ui/overlays';
import { Badge, Button, Card } from '@/components/ui/primitives';
import { getScenarioByUnitId } from '@/data/lifeScenarios';
import type { PlatformContentBundle } from '@/core/contentLoader';
import {
  recordActionSubmission,
  recordCardReview,
  recordMilestoneSubmission,
  recordQuizAttempt,
  recordStudyDuration,
} from '@/core/db';
import { evaluateUnitPassGate, isTrackUnlocked } from '@/core/gatekeeper';
import { cn } from '@/lib/utils';
import type {
  CardRating,
  ConceptNode,
  LearningUnit,
  StudyDurationLog,
  TelemetrySnapshot,
} from '@/types/schema';

interface UnitPlayerViewProps {
  unit: LearningUnit;
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onTelemetryChange: (next: TelemetrySnapshot) => void;
  onBackToBranches: (branchId: LearningUnit['branchId']) => void;
  onOpenUnit: (unitId: string) => void;
}

const UNIT_LIVE_SANDBOX_MAP: Partial<Record<string, LifeToolKey>> = {
  'unit-b4-sleep': 'sleep',
  'unit-b2-investing': 'compound',
  'unit-b3-decision': 'compound',
  'unit-b5-writing': 'message',
};

const STEP_META = [
  { num: 1, short: '场景', full: '场景开场' },
  { num: 2, short: '预测', full: '先预测' },
  { num: 3, short: '实验室', full: '互动实验室' },
  { num: 4, short: '闪卡', full: '3D 概念闪卡' },
  { num: 5, short: '自测', full: '提取自测' },
  { num: 6, short: '行动', full: '实战行动' },
  { num: 7, short: '过关', full: '完成过关' },
] as const;

export function UnitPlayerView({
  unit,
  content,
  telemetry,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onTelemetryChange,
  onBackToBranches,
  onOpenUnit,
}: UnitPlayerViewProps) {
  const glossary = useGlossaryDrawer();
  const existingSub = telemetry.unitSubmissions[unit.id];
  const [step, setStep] = useState<number>(1);
  const [maxVisitedStep, setMaxVisitedStep] = useState<number>(existingSub?.isCleared ? 7 : 1);

  // 学习辅助抽屉（随手查划重点、术语、实验溯源与权威出处，彻底简化主学习画布）
  const [studyDrawerOpen, setStudyDrawerOpen] = useState<boolean>(false);
  const [studyDrawerTab, setStudyDrawerTab] = useState<'notes' | 'sources'>('notes');

  const [predChoice, setPredChoice] = useState<number | null>(null);
  const [predSubmitted, setPredSubmitted] = useState<boolean>(false);
  const [diagramStep, setDiagramStep] = useState<number | undefined>(undefined);

  const [cardIdx, setCardIdx] = useState<number>(0);
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [ratedCards, setRatedCards] = useState<Record<string, CardRating>>({});

  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [quizScoreRatio, setQuizScoreRatio] = useState<number>(
    existingSub?.quizPassScoreRatio ?? 0
  );

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

  const takeaways = unit.guide.blocks.filter((b) => Boolean(b.keyTakeaway));
  const currentConcept = concepts[Math.min(cardIdx, Math.max(0, concepts.length - 1))];

  const handleRateCard = async (conceptId: string, rating: CardRating) => {
    setRatedCards((prev) => ({ ...prev, [conceptId]: rating }));
    const next = await recordCardReview(conceptId, rating, {
      branchId: unit.branchId,
      trackId: unit.trackId,
      durationMs: Math.max(2000, Date.now() - stepEnteredAtRef.current),
    });
    stepEnteredAtRef.current = Date.now();
    onTelemetryChange(next);
    toast(
      rating === 'easy'
        ? '已标记：熟练掌握'
        : rating === 'fuzzy'
          ? '已标记：有点模糊（排入 3 天后重测）'
          : '已标记：没想起来（排入明日重测）'
    );
    if (cardIdx < concepts.length - 1) {
      setTimeout(() => setCardIdx((i) => Math.min(concepts.length - 1, i + 1)), 220);
    }
  };

  // 第 4 步键盘快捷键：Space 翻卡，1/2/3 直接评分
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
      } else if (flippedCards[currentConcept.id]) {
        if (e.key === '1') handleRateCard(currentConcept.id, 'easy');
        else if (e.key === '2') handleRateCard(currentConcept.id, 'fuzzy');
        else if (e.key === '3') handleRateCard(currentConcept.id, 'again');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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
    toast(
      ratio >= unit.quiz.passRatio
        ? `自测通过（${Math.round(ratio * 100)}%）`
        : `本次得分 ${Math.round(ratio * 100)}%，查看解析后可重测`
    );
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
    toast.success(`单元已过关：${unit.title}`);
    goToStep(7);
  };

  const newlyUnlockedTrack = parentBranch?.tracks.find(
    (t) =>
      t.unlockAfterTrackId === unit.trackId &&
      isTrackUnlocked(t, parentBranch.tracks, telemetry)
  );

  const allQuestionsAnswered = Object.keys(quizAnswers).length >= unit.quiz.questions.length;
  const isCurrentFlipped = currentConcept ? Boolean(flippedCards[currentConcept.id]) : false;

  const openStudyDrawer = (tab: 'notes' | 'sources') => {
    setStudyDrawerTab(tab);
    setStudyDrawerOpen(true);
  };

  return (
    <div className="min-h-screen pb-14">
      {/* 右侧学习资料与溯源抽屉（边学边查划重点、术语表、实验溯源与权威出处） */}
      <Drawer
        open={studyDrawerOpen}
        onOpenChange={setStudyDrawerOpen}
        title="本节学习资料与溯源"
        description={`${unit.branchId} · ${unit.title} — 原学习步保留在左侧，随时对照`}
        widthClassName="w-[min(500px,94vw)]"
      >
        <div className="space-y-4">
          <div className="glass-plate grid grid-cols-2 gap-1 p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={studyDrawerTab === 'notes'}
              onClick={() => setStudyDrawerTab('notes')}
              className={cn(
                'min-h-[34px] cursor-pointer rounded-[8px] text-[13px] font-medium transition-colors',
                studyDrawerTab === 'notes'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              )}
            >
              划重点与术语（{concepts.length}）
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studyDrawerTab === 'sources'}
              onClick={() => setStudyDrawerTab('sources')}
              className={cn(
                'min-h-[34px] cursor-pointer rounded-[8px] text-[13px] font-medium transition-colors',
                studyDrawerTab === 'sources'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              )}
            >
              溯源与出处（{unit.sources.length}）
            </button>
          </div>

          {studyDrawerTab === 'notes' ? (
            <div className="space-y-4">
              {takeaways.length > 0 && (
                <section className="glass-plate space-y-2 p-4">
                  <div className="text-[12.5px] font-semibold text-[var(--dawn)]">本节人话划重点</div>
                  <ul className="m-0 list-disc space-y-2 pl-5 text-[13.5px] leading-[1.65] text-[var(--ink-1)]">
                    {takeaways.map((b, i) => (
                      <li key={i}>
                        <RichText text={b.keyTakeaway!} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {concepts.length > 0 && (
                <section className="space-y-2">
                  <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">
                    核心术语词典（点击展开关联概念）
                  </div>
                  <div className="space-y-2">
                    {concepts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setStudyDrawerOpen(false);
                          glossary?.openConcept(c);
                        }}
                        className="glass-plate block w-full cursor-pointer p-3.5 text-left transition-colors hover:border-[var(--accent-border)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[14px] font-semibold text-[var(--ink-1)]">
                            {c.label}
                          </span>
                          <span className="font-mono-num text-[11.5px] text-[var(--accent)]">
                            详解 →
                          </span>
                        </div>
                        <p className="mt-1 mb-0 text-[13px] leading-[1.6] text-[var(--ink-2)]">
                          {c.plainDefinition}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <PsychBoundaryNotice sources={unit.sources} />
              <OriginCardsList cards={unit.guide.originCards} />
              <SourceTimelinessFooter sources={unit.sources} />
            </div>
          )}
        </div>
      </Drawer>

      {/* 56px 吸顶清透专注顶栏：返回 + 7步进度轨 + 资料抽屉与工具 */}
      <header className="sticky top-0 z-40 h-[56px] border-b border-[var(--line)] bg-[var(--surface-glass)] backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6">
          <Button size="sm" variant="outline" onClick={() => onBackToBranches(unit.branchId)}>
            <ArrowLeft size={14} strokeWidth={1.6} />
            <span>返回 {unit.branchId}</span>
          </Button>

          <nav className="hidden items-center gap-1 md:flex" aria-label="7 步学习进度">
            {STEP_META.map((item, idx) => {
              const isCurrent = step === item.num;
              const isPassed = item.num < step;
              const canJump = item.num <= maxVisitedStep;
              return (
                <div className="flex items-center" key={item.num}>
                  <Tooltip content={`第 ${item.num} 步 · ${item.full}`}>
                    <button
                      type="button"
                      disabled={!canJump}
                      onClick={() => goToStep(item.num)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                        canJump ? 'cursor-pointer' : 'cursor-not-allowed opacity-45',
                        isCurrent
                          ? 'bg-[var(--accent)] text-white'
                          : isPassed
                            ? 'bg-[var(--growth-soft)] text-[var(--growth)]'
                            : 'text-[var(--ink-3)]'
                      )}
                    >
                      <span className="font-mono-num flex h-4 w-4 items-center justify-center rounded-full text-[11px]">
                        {isPassed ? <Check size={11} strokeWidth={2.4} /> : item.num}
                      </span>
                      <span className="hidden xl:inline">{item.short}</span>
                    </button>
                  </Tooltip>
                  {idx < STEP_META.length - 1 && (
                    <span
                      className={cn(
                        'mx-1 h-[1.5px] w-3',
                        item.num < step ? 'bg-[var(--growth)]' : 'bg-[var(--line-strong)]'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <Tooltip content="滑出右侧抽屉查看本节划重点、术语与权威出处">
              <Button
                size="sm"
                variant="outline"
                data-testid="study-drawer-trigger"
                onClick={() => openStudyDrawer('notes')}
              >
                <BookMarked size={14} strokeWidth={1.6} />
                <span className="hidden sm:inline">本节资料</span>
              </Button>
            </Tooltip>

            <Badge tone="neutral" className="font-mono-num">
              {step}/7
            </Badge>

            <Tooltip content="全局快速搜索（⌘K）">
              <Button
                size="icon"
                variant="outline"
                aria-label="全局快速搜索"
                onClick={onOpenCommandPalette}
              >
                <Search size={14} strokeWidth={1.6} />
              </Button>
            </Tooltip>

            <Tooltip content={theme === 'dark' ? '切换浅色主题' : '切换暗色主题'}>
              <Button
                size="icon"
                variant="outline"
                aria-label="切换浅色或深色主题"
                onClick={onToggleTheme}
              >
                {theme === 'dark' ? (
                  <Sun size={14} strokeWidth={1.6} />
                ) : (
                  <Moon size={14} strokeWidth={1.6} />
                )}
              </Button>
            </Tooltip>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className={cn(
          'mx-auto px-4 py-6 sm:px-6 sm:py-8',
          step === 3 ? 'max-w-[1240px]' : 'max-w-[820px]'
        )}
      >
        {/* 简洁单元头 */}
        <div className="mb-5 space-y-1.5">
          <div className="sky-heading flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-2)]">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: parentBranch?.accentToken ?? 'var(--accent)' }}
            />
            <span className="font-mono-num font-semibold">{unit.branchId}</span>
            <span>·</span>
            <span>{parentTrack?.title ?? unit.trackId}</span>
            <span>·</span>
            <span className="font-mono-num">{unit.estimatedMinutes}m</span>
            {telemetry.unitSubmissions[unit.id]?.isCleared && <Badge tone="growth">已过关</Badge>}
          </div>
          <h1 className="sky-heading m-0 text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--ink-1)] sm:text-[30px]">
            {unit.title}
          </h1>
          <PlaceholderBanner visible={unit.isPlaceholder} />
        </div>

        {/* 第 1 步：生活场景开场 */}
        {step === 1 && (
          <Card className="space-y-5">
            <Badge tone="accent">第 1 步 · 场景开场</Badge>
            <h2 className="m-0 text-[20px] font-semibold text-[var(--ink-1)] sm:text-[22px]">
              {unit.scenarioHook.sceneTitle}
            </h2>
            <div className="glass-plate p-5 text-[15.5px] leading-[1.8] text-[var(--ink-1)]">
              <p className="m-0">
                <RichText text={unit.scenarioHook.story} concepts={concepts} />
              </p>
            </div>
            <div className="rounded-[12px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
              <div className="mb-1 text-[12px] font-semibold text-[var(--accent)]">
                带着这个问题继续
              </div>
              <p className="m-0 text-[15px] font-medium leading-[1.65] text-[var(--ink-1)]">
                <RichText text={unit.scenarioHook.guidingQuestion} />
              </p>
            </div>
            <PsychBoundaryNotice sources={unit.sources} />
            <div className="flex justify-end border-t border-[var(--line)] pt-4">
              <Button variant="primary" size="lg" onClick={() => goToStep(2)}>
                <span>先做一道直觉预测</span>
                <ArrowRight size={15} strokeWidth={1.6} />
              </Button>
            </div>
          </Card>
        )}

        {/* 第 2 步：先预测 */}
        {step === 2 && (
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone="accent">第 2 步 · 先预测</Badge>
              <span className="text-[13px] text-[var(--ink-3)]">
                激活直觉，猜错反而印象最深
              </span>
            </div>
            <h2 className="m-0 text-[19px] font-semibold leading-[1.45] text-[var(--ink-1)] sm:text-[21px]">
              <RichText text={unit.prediction.question} />
            </h2>

            <div className="space-y-2.5">
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
                    onClick={() => setPredChoice(idx)}
                    className={cn(
                      'quiz-option-btn flex min-h-[48px] w-full cursor-pointer items-start gap-3 rounded-[12px] border p-3.5 text-left text-[15px] leading-[1.55] transition-colors disabled:cursor-default',
                      isAnswer
                        ? 'border-[var(--growth)] bg-[var(--growth-soft)] text-[var(--ink-1)]'
                        : isWrongPick
                          ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--ink-1)]'
                          : isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                            : 'border-[var(--line-strong)] bg-[var(--surface-plate)] text-[var(--ink-2)] hover:border-[var(--accent-border)] hover:text-[var(--ink-1)]'
                    )}
                  >
                    <span className="font-mono-num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[12px] font-semibold text-[var(--ink-1)]">
                      {letter}
                    </span>
                    <span className="flex-1">
                      <RichText text={opt} />
                    </span>
                  </button>
                );
              })}
            </div>

            {!predSubmitted ? (
              <div className="flex justify-end border-t border-[var(--line)] pt-4">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={predChoice === null}
                  onClick={handlePredictionSubmit}
                >
                  锁定我的直觉判断
                </Button>
              </div>
            ) : (
              <div className="space-y-4 border-t border-[var(--line)] pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[12px] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4">
                    <div className="mb-1 text-[12px] font-semibold text-[var(--warning)]">
                      多数人的直觉判断
                    </div>
                    <p className="m-0 text-[14px] leading-[1.65] text-[var(--ink-1)]">
                      {predChoice === unit.prediction.answerIndex
                        ? '你成功避开了最常见的第一直觉陷阱'
                        : `常见误区是选项 ${String.fromCharCode(65 + unit.prediction.commonTrapIndex)} —— 踩中陷阱恰恰说明这一节很值`}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-[var(--growth-border)] bg-[var(--growth-soft)] p-4">
                    <div className="mb-1 text-[12px] font-semibold text-[var(--growth)]">
                      真实底层规律
                    </div>
                    <p className="m-0 text-[14px] leading-[1.65] text-[var(--ink-1)]">
                      <RichText text={unit.prediction.whyCounterIntuitive} />
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="primary" size="lg" onClick={() => goToStep(3)}>
                    <span>进入互动实验室看清机制</span>
                    <ArrowRight size={15} strokeWidth={1.6} />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* 第 3 步：简明双栏（左吸顶动图沙盒 + 配套生活小算盘 + 右精排原理拆解） */}
        {step === 3 && (
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.22fr)_minmax(0,1fr)]">
            <div className="space-y-4 lg:sticky lg:top-[76px]">
              <UnitVisualFrame
                visuals={unit.guide.visuals}
                activeStep={diagramStep}
                onStepChange={setDiagramStep}
              />
              {UNIT_LIVE_SANDBOX_MAP[unit.id] && (
                <Card className="p-4">
                  <LifeToolsSandbox mode={UNIT_LIVE_SANDBOX_MAP[unit.id]} compact />
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone="accent">第 3 步 · 原理拆解</Badge>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="subtle" onClick={() => openStudyDrawer('notes')}>
                      划重点 ({takeaways.length})
                    </Button>
                    <Button size="sm" variant="subtle" onClick={() => openStudyDrawer('sources')}>
                      溯源与出处 ({unit.sources.length})
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--ink-3)]">
                  <span>点击段落联动左侧动图</span>
                  {concepts.length > 0 && (
                    <>
                      <span>·</span>
                      <span>本节术语：</span>
                      {concepts.map((c) => (
                        <Tooltip
                          key={c.id}
                          content={`${c.plainDefinition.slice(0, 36)}…（点击展开详解）`}
                          side="top"
                        >
                          <button
                            type="button"
                            className="glossary-trigger glossary-term-btn text-[12.5px]"
                            onClick={() => glossary?.openConcept(c)}
                          >
                            {c.label}
                          </button>
                        </Tooltip>
                      ))}
                    </>
                  )}
                </div>

                <div className="divide-y divide-[var(--line)]">
                  {unit.guide.blocks.map((blk, idx) => (
                    <section
                      key={idx}
                      onClick={() => setDiagramStep(idx)}
                      className={cn(
                        'cursor-pointer py-4 transition-colors first:pt-1 last:pb-1',
                        diagramStep === idx &&
                          '-mx-3 rounded-[12px] bg-[var(--accent-soft)] px-3'
                      )}
                    >
                      <h2 className="m-0 mb-2 flex items-baseline gap-2.5 text-[17px] font-semibold leading-[1.4] text-[var(--ink-1)]">
                        <span className="font-mono-num text-[13px] text-[var(--accent)]">
                          0{idx + 1}
                        </span>
                        <span>
                          <RichText text={blk.heading} concepts={concepts} />
                        </span>
                      </h2>
                      <p className="glass-plate m-0 p-3.5 text-[15px] leading-[1.8] text-[var(--ink-2)]">
                        <RichText text={blk.markdown} concepts={concepts} />
                      </p>
                    </section>
                  ))}
                </div>

                <div className="flex justify-end border-t border-[var(--line)] pt-4">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={async () => {
                      await flushStepDuration('guide');
                      goToStep(4);
                    }}
                  >
                    <span>读完了，翻看 3D 概念闪卡</span>
                    <ArrowRight size={15} strokeWidth={1.6} />
                  </Button>
                </div>
              </Card>

              <PsychBoundaryNotice sources={unit.sources} />
            </div>
          </div>
        )}

        {/* 第 4 步：真 3D 弹性翻卡概念台 */}
        {step === 4 && currentConcept && (
          <Card className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge tone="accent">第 4 步 · 3D 概念闪卡</Badge>
                <p className="mt-2 mb-0 text-[13.5px] text-[var(--ink-2)]">
                  先在脑中复述再翻面（快捷键：Space 翻面，1/2/3 评分）
                </p>
              </div>
              <Badge tone="neutral" className="font-mono-num">
                {cardIdx + 1} / {concepts.length}
              </Badge>
            </div>

            <div className="flip-perspective mx-auto max-w-[660px]">
              <motion.div
                className={cn(
                  'flip-card-box flip-preserve-3d relative grid cursor-pointer',
                  isCurrentFlipped && 'is-flipped'
                )}
                animate={{ rotateY: isCurrentFlipped ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                onClick={() =>
                  setFlippedCards((prev) => ({
                    ...prev,
                    [currentConcept.id]: !prev[currentConcept.id],
                  }))
                }
              >
                {/* 正面 */}
                <div
                  className={cn(
                    'flip-backface-hidden glass-plate col-start-1 row-start-1 flex min-h-[280px] flex-col justify-between rounded-[16px] p-6',
                    isCurrentFlipped && 'pointer-events-none'
                  )}
                >
                  <div className="flex items-center justify-between text-[12.5px] text-[var(--ink-3)]">
                    <span className="font-semibold text-[var(--ink-1)]">
                      {currentConcept.label}
                    </span>
                    <span className="font-mono-num">{currentConcept.branchId} · 正面提问</span>
                  </div>

                  <div className="my-6 text-center text-[19px] font-medium leading-[1.55] text-[var(--ink-1)] sm:text-[21px]">
                    {currentConcept.cardPrompt}
                  </div>

                  <div className="flex justify-center">
                    <Button variant="outline" size="sm">
                      <RotateCw size={14} strokeWidth={1.5} />
                      <span>翻看解析</span>
                    </Button>
                  </div>
                </div>

                {/* 背面 */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'flip-backface-hidden glass-plate col-start-1 row-start-1 flex min-h-[280px] flex-col justify-between gap-4 rounded-[16px] border-[var(--accent-border)] p-6 [transform:rotateY(180deg)]',
                    !isCurrentFlipped && 'pointer-events-none'
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="font-semibold text-[var(--accent)]">
                        {currentConcept.label}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFlippedCards((prev) => ({ ...prev, [currentConcept.id]: false }))
                        }
                        className="cursor-pointer border-0 bg-transparent text-[12px] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                      >
                        翻回正面
                      </button>
                    </div>

                    <div className="text-[15px] leading-[1.75] text-[var(--ink-1)]">
                      <RichText text={currentConcept.cardAnswer} />
                    </div>

                    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[13.5px] leading-[1.6] text-[var(--ink-2)]">
                      <strong className="font-medium text-[var(--ink-1)]">人话定义：</strong>
                      {currentConcept.plainDefinition}
                    </div>

                    {currentConcept.crossLinks.length > 0 && (
                      <div className="space-y-2">
                        {currentConcept.crossLinks.map((link) => {
                          const targetNode = content.knowledgeGraph.nodes.find(
                            (n) => n.id === link.targetId
                          );
                          const linkedUnit = content.units.find((u) =>
                            u.conceptNodeIds.includes(link.targetId)
                          );
                          return (
                            <div
                              key={link.targetId}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--line)] px-3 py-2 text-[12.5px] text-[var(--ink-2)]"
                            >
                              <span>
                                跨分支互链 ·{' '}
                                <strong className="text-[var(--ink-1)]">
                                  {targetNode?.label ?? link.targetId}
                                </strong>
                                ：{link.bridgeNote}
                              </span>
                              {linkedUnit && linkedUnit.id !== unit.id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onOpenUnit(linkedUnit.id)}
                                >
                                  前往关联单元
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                    <Button
                      size="sm"
                      variant={ratedCards[currentConcept.id] === 'easy' ? 'growth' : 'outline'}
                      onClick={() => handleRateCard(currentConcept.id, 'easy')}
                    >
                      1 熟练掌握
                    </Button>
                    <Button
                      size="sm"
                      variant={ratedCards[currentConcept.id] === 'fuzzy' ? 'warning' : 'outline'}
                      onClick={() => handleRateCard(currentConcept.id, 'fuzzy')}
                    >
                      2 有点模糊（3天后）
                    </Button>
                    <Button
                      size="sm"
                      variant={ratedCards[currentConcept.id] === 'again' ? 'danger' : 'outline'}
                      onClick={() => handleRateCard(currentConcept.id, 'again')}
                    >
                      3 没想起来（明日重测）
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>

            {concepts.length > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cardIdx === 0}
                  onClick={() => setCardIdx((i) => Math.max(0, i - 1))}
                >
                  <ArrowLeft size={14} strokeWidth={1.5} />
                  <span>上一张</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cardIdx >= concepts.length - 1}
                  onClick={() => setCardIdx((i) => Math.min(concepts.length - 1, i + 1))}
                >
                  <span>下一张</span>
                  <ArrowRight size={14} strokeWidth={1.5} />
                </Button>
              </div>
            )}

            <div className="flex justify-end border-t border-[var(--line)] pt-4">
              <Button variant="primary" size="lg" onClick={() => goToStep(5)}>
                <span>进入第 5 步提取自测</span>
                <ArrowRight size={15} strokeWidth={1.6} />
              </Button>
            </div>
          </Card>
        )}

        {/* 第 5 步：真实情景演练 + 提取自测 */}
        {step === 5 && (
          <Card className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge tone="accent">第 5 步 · 提取自测</Badge>
                <span className="text-[13px] text-[var(--ink-3)]">
                  达标线 {Math.round(unit.quiz.passRatio * 100)}%，拿不准的题会自动收进温习本
                </span>
              </div>
              <Button size="sm" variant="subtle" onClick={() => openStudyDrawer('notes')}>
                边对照划重点
              </Button>
            </div>

            {(() => {
              const linkedScenario = getScenarioByUnitId(unit.id);
              if (!linkedScenario) return null;
              return (
                <div className="space-y-2">
                  <div className="text-[13px] font-semibold text-[var(--dawn)]">
                    先在真实生活情景里演练一局
                  </div>
                  <LifeScenarioSim scenario={linkedScenario} />
                </div>
              );
            })()}

            <div className="space-y-6">
              {unit.quiz.questions.map((q, qIdx) => {
                const picked = quizAnswers[q.id];
                return (
                  <div className="quiz-question-block space-y-3" key={q.id}>
                    <div className="flex items-baseline gap-2.5 text-[16px] font-semibold leading-[1.5] text-[var(--ink-1)]">
                      <span className="font-mono-num text-[13px] text-[var(--accent)]">
                        Q{qIdx + 1}
                      </span>
                      <span>
                        <RichText text={q.stem} />
                      </span>
                    </div>

                    <div className="space-y-2">
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
                            onClick={() =>
                              setQuizAnswers((prev) => ({ ...prev, [q.id]: oIdx }))
                            }
                            className={cn(
                              'quiz-option-btn flex min-h-[46px] w-full cursor-pointer items-start gap-3 rounded-[12px] border p-3.5 text-left text-[14.5px] leading-[1.55] transition-colors disabled:cursor-default',
                              isCorrectOpt
                                ? 'border-[var(--growth)] bg-[var(--growth-soft)] text-[var(--ink-1)]'
                                : isWrongPick
                                  ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--ink-1)]'
                                  : isSelected
                                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                                    : 'border-[var(--line-strong)] bg-[var(--surface-plate)] text-[var(--ink-2)] hover:border-[var(--accent-border)] hover:text-[var(--ink-1)]'
                            )}
                          >
                            <span className="font-mono-num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[12px] font-semibold text-[var(--ink-1)]">
                              {letter}
                            </span>
                            <span className="flex-1">
                              <RichText text={opt} />
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {quizSubmitted && (
                      <div
                        className={cn(
                          'rounded-[10px] border p-3.5 text-[13.5px] leading-[1.65]',
                          picked === q.correctIndex
                            ? 'border-[var(--growth-border)] bg-[var(--growth-soft)] text-[var(--ink-1)]'
                            : 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--ink-1)]'
                        )}
                      >
                        <strong className="font-semibold">
                          {picked === q.correctIndex
                            ? '回答正确：'
                            : '纠偏解析（已排入明日重测）：'}
                        </strong>
                        <RichText text={q.explanation} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!quizSubmitted ? (
              <div className="flex justify-end border-t border-[var(--line)] pt-4">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!allQuestionsAnswered}
                  onClick={handleQuizSubmit}
                >
                  提交自测并查看解析
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                <div className="flex items-center gap-2.5 text-[15px]">
                  <span className="text-[var(--ink-2)]">本次得分</span>
                  <strong className="font-mono-num text-[20px] font-semibold text-[var(--ink-1)]">
                    {Math.round(quizScoreRatio * 100)}%
                  </strong>
                  <Badge tone={quizScoreRatio >= unit.quiz.passRatio ? 'growth' : 'warning'}>
                    {quizScoreRatio >= unit.quiz.passRatio ? '已达标' : '未达标，请重测'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  {quizScoreRatio < unit.quiz.passRatio && (
                    <Popconfirm
                      title="清空本次作答并重测？"
                      confirmLabel="重新测试"
                      tone="warning"
                      onConfirm={() => {
                        setQuizSubmitted(false);
                        setQuizAnswers({});
                        stepEnteredAtRef.current = Date.now();
                      }}
                    >
                      <Button variant="outline">重测本节题目</Button>
                    </Popconfirm>
                  )}
                  {quizScoreRatio >= unit.quiz.passRatio && (
                    <Button variant="primary" size="lg" onClick={() => goToStep(6)}>
                      <span>进入行动任务落地</span>
                      <ArrowRight size={15} strokeWidth={1.6} />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* 第 6 步：实战行动任务 */}
        {step === 6 && (
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="accent">第 6 步 · 实战行动任务</Badge>
              <Button size="sm" variant="subtle" onClick={() => openStudyDrawer('notes')}>
                打开本节要点对照写
              </Button>
            </div>

            <div className="space-y-1.5">
              <h2 className="m-0 text-[20px] font-semibold text-[var(--ink-1)] sm:text-[22px]">
                <RichText text={unit.actionTask.title} />
              </h2>
              <p className="m-0 text-[14px] text-[var(--ink-2)]">
                切入场景：{unit.actionTask.lifeContext}
              </p>
            </div>

            <ol className="glass-plate m-0 list-decimal space-y-2 py-4 pr-4 pl-9 text-[14.5px] leading-[1.7] text-[var(--ink-1)]">
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
                <div className="glass-plate space-y-2.5 p-4">
                  <div className="text-[13px] font-medium text-[var(--ink-1)]">
                    绑定真实任务池待办（提交本节时同步标为已交付）
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {matchingPoolTasks.map((rt) => {
                      const isPicked = linkedRealTaskId === rt.id;
                      return (
                        <Button
                          key={rt.id}
                          size="sm"
                          variant={isPicked ? 'primary' : 'outline'}
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
                        </Button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1.5">
              <label className="block text-[13.5px] font-medium text-[var(--ink-1)]">
                {unit.actionTask.deliverablePrompt}
              </label>
              <textarea
                rows={3}
                className="v3-textarea"
                value={deliverableText}
                onChange={(e) => {
                  setDeliverableText(e.target.value);
                  if (actionError) setActionError('');
                }}
                placeholder="写下你的执行结果、模板内容或本地文件路径…"
              />
            </div>

            {unit.actionTask.feynmanCheckPrompt && (
              <div className="space-y-1.5">
                <label className="block text-[13.5px] font-medium text-[var(--ink-1)]">
                  费曼一句话复述：{unit.actionTask.feynmanCheckPrompt}
                </label>
                <input
                  type="text"
                  className="v3-input"
                  value={feynmanText}
                  onChange={(e) => {
                    setFeynmanText(e.target.value);
                    if (actionError) setActionError('');
                  }}
                  placeholder="不拽术语，用一句大白话说清核心原理…"
                />
              </div>
            )}

            {parentTrack?.milestoneDeliverable && (
              <label className="glass-plate flex cursor-pointer items-center gap-2.5 p-3.5 text-[13.5px] text-[var(--ink-1)]">
                <input
                  type="checkbox"
                  checked={signOffMilestone}
                  onChange={(e) => setSignOffMilestone(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  同步确认本阶总产出已达标：
                  <strong>{parentTrack.milestoneDeliverable.title}</strong>
                </span>
              </label>
            )}

            {actionError && (
              <AlertBanner
                tone="danger"
                title="过关条件未满足"
                message={actionError}
                onDismiss={() => setActionError('')}
                action={
                  quizScoreRatio < unit.quiz.passRatio ? (
                    <Button size="sm" variant="outline" onClick={() => goToStep(5)}>
                      返回第 5 步自测
                    </Button>
                  ) : undefined
                }
              />
            )}

            <div className="flex justify-end border-t border-[var(--line)] pt-4">
              <Button variant="primary" size="lg" onClick={handleCompleteUnit}>
                <span>提交行动记录并完成过关</span>
                <ArrowRight size={15} strokeWidth={1.6} />
              </Button>
            </div>
          </Card>
        )}

        {/* 第 7 步：过关完成 */}
        {step === 7 && (
          <Card className="space-y-5 border-[var(--growth-border)]">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[var(--growth-soft)] text-[var(--growth)]">
                <CheckCircle2 size={24} strokeWidth={1.7} />
              </div>
              <div className="space-y-1.5">
                <Badge tone="growth">单元过关已留痕</Badge>
                <h2 className="m-0 text-[22px] font-semibold text-[var(--ink-1)]">
                  已完成：{unit.title}
                </h2>
                <p className="m-0 text-[14.5px] text-[var(--ink-2)]">
                  自测得分 {Math.round(quizScoreRatio * 100)}% · 行动记录已写入本地 IndexedDB
                  并同步更新技能星图与 1080P 状态墙
                </p>
              </div>
            </div>

            {newlyUnlockedTrack && (
              <div className="rounded-[12px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-[14px] text-[var(--ink-1)]">
                新阶段已解锁：<strong>{newlyUnlockedTrack.title}</strong>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4">
              <Button variant="primary" onClick={() => onBackToBranches(unit.branchId)}>
                返回 {unit.branchId} 路径图
              </Button>
              <a
                href="#/"
                className="inline-flex min-h-[40px] items-center justify-center rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-plate)] px-4 text-[14px] font-medium text-[var(--ink-1)] no-underline hover:border-[var(--accent-border)]"
              >
                回到今日主线
              </a>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
