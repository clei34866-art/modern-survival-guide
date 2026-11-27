import {
  ArrowLeft,
  BookMarked,
  BookmarkPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  HelpCircle,
  Layers,
  ListChecks,
  MessageCircle,
  Moon,
  PenLine,
  RotateCw,
  Search,
  Sparkles,
  Sun,
  Type,
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
import { MarkdownArticle, RichText } from '@/components/RichText';
import { Drawer, Popconfirm, Tooltip } from '@/components/ui/overlays';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import {
  addLifeNote,
  recordActionSubmission,
  recordCardReview,
  recordQuizAttempt,
  recordStudyDuration,
} from '@/core/db';
import { getScenarioByUnitId } from '@/data/lifeScenarios';
import { cn } from '@/lib/utils';
import type {
  CardRating,
  ConceptNode,
  LearningUnit,
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

type OptionalTab = 'none' | 'scenario' | 'quiz' | 'cards' | 'note';

/**
 * 深度实战手册阅读器（取代僵硬的 7 步闯关流程）：
 * - 一整页把一件事讲透：核心结论 → 深度分节正文（含正反对照表、可复制话术/代码模板、边界 FAQ）→ 互动图解与小算盘 → 随手核对清单
 * - 左侧固定目录（桌面端）随时跳转，无强制翻页、无强制做题、无强制填作业门禁
 * - 顶栏一键「标为已读」与「记入生活笔记」；情景演练、自测题、3D 闪卡退至页尾可选区，想练再点开
 */
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
  const isRead = Boolean(existingSub?.isCleared);

  // 左侧目录高亮与联动动图步进
  const [activeSecId, setActiveSecId] = useState<string>('sec-tldr');
  const [diagramStep, setDiagramStep] = useState<number | undefined>(undefined);
  const [readProgress, setReadProgress] = useState<number>(0);

  // 阅读字号舒适度切换（标准 / 舒展大字，自动记住）
  const [fontScale, setFontScale] = useState<'normal' | 'large'>(() => {
    try {
      return localStorage.getItem('msg-handbook-font') === 'large' ? 'large' : 'normal';
    } catch {
      return 'normal';
    }
  });

  // 右侧「资料与出处」Drawer
  const [studyDrawerOpen, setStudyDrawerOpen] = useState<boolean>(false);
  const [studyDrawerTab, setStudyDrawerTab] = useState<'notes' | 'sources'>('notes');

  // 随手核对的实操步骤勾选（纯本地轻交互，不强制提交）
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});

  // 页尾 100% 可选练习区（默认折叠或按需展开）
  const linkedScenario = getScenarioByUnitId(unit.id);
  const [optionalTab, setOptionalTab] = useState<OptionalTab>('none');

  // 可选：直觉思考 + 自测题态
  const [predChoice, setPredChoice] = useState<number | null>(null);
  const [predSubmitted, setPredSubmitted] = useState<boolean>(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [quizScoreRatio, setQuizScoreRatio] = useState<number>(
    existingSub?.quizPassScoreRatio ?? 0
  );

  // 可选：3D 闪卡态
  const [cardIdx, setCardIdx] = useState<number>(0);
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const [ratedCards, setRatedCards] = useState<Record<string, CardRating>>({});

  // 可选：写一条生活笔记
  const [memoText, setMemoText] = useState<string>(existingSub?.feynmanOneLiner ?? '');
  const [noteTitle, setNoteTitle] = useState<string>(unit.title.split('：')[0] ?? unit.title);

  const openedAtRef = useRef<number>(Date.now());
  const parentBranch = content.catalog.branches.find((b) => b.id === unit.branchId);

  const concepts: ConceptNode[] = unit.conceptNodeIds
    .map((cid) => content.knowledgeGraph.nodes.find((n) => n.id === cid))
    .filter((n): n is ConceptNode => Boolean(n));
  const takeaways = unit.guide.blocks.filter((b) => Boolean(b.keyTakeaway));
  const currentConcept = concepts[Math.min(cardIdx, Math.max(0, concepts.length - 1))];
  const isCurrentFlipped = currentConcept ? Boolean(flippedCards[currentConcept.id]) : false;

  // 监听滚动进度与实时 IntersectionObserver 目录自动高亮
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
      setReadProgress(Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100))));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const sectionIds = [
      'sec-tldr',
      'sec-visual',
      ...unit.guide.blocks.map((_, idx) => `sec-block-${idx}`),
      'sec-checklist',
      'sec-optional',
    ];
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]?.target?.id) {
            setActiveSecId(visible[0].target.id);
          }
        },
        { rootMargin: '-16% 0px -66% 0px', threshold: 0.05 }
      );
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      }
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, [unit.id, unit.guide.blocks.length]);

  const handleToggleFontScale = () => {
    setFontScale((prev) => {
      const next = prev === 'normal' ? 'large' : 'normal';
      try {
        localStorage.setItem('msg-handbook-font', next);
      } catch {
        // ignore
      }
      toast(next === 'large' ? '已切至「舒展大字」护眼模式' : '已切回「标准」排版字号');
      return next;
    });
  };

  const handleExcerptSection = async (heading: string, takeaway: string | undefined, md: string) => {
    const shortTitle = `${unit.title.split('：')[0]} · ${heading.split(/[：?？]/)[0].replace(/`/g, '').slice(0, 16)}`;
    const cleanExcerpt =
      takeaway?.trim() ||
      md
        .replace(/```[\s\S]*?```/g, '')
        .replace(/[#>*`|]/g, '')
        .trim()
        .slice(0, 160);
    const next = await addLifeNote({
      title: shortTitle,
      body: `${cleanExcerpt}\n\n（摘自手册：${unit.title}）`,
      branchId: unit.branchId,
    });
    onTelemetryChange(next);
    toast.success('已摘录进「生活手账 → 生活笔记」');
  };

  const handleExportMarkdown = () => {
    const lines = [
      `# ${unit.title}`,
      '',
      `> 领域：${parentBranch?.name ?? unit.branchId} ｜ 预计阅读：约 ${unit.estimatedMinutes} 分钟`,
      '',
      `## 场景背景`,
      unit.scenarioHook.story,
      '',
      `## 一分钟核心结论`,
      ...takeaways.map((b, i) => `${i + 1}. ${b.keyTakeaway}`),
      '',
      ...unit.guide.blocks.flatMap((b, i) => [
        `## 0${i + 1} ${b.heading}`,
        '',
        b.markdown,
        '',
        b.keyTakeaway ? `> **本节一句话**：${b.keyTakeaway}` : '',
        '',
      ]),
      `## 拿走就能用：${unit.actionTask.title}`,
      ...unit.actionTask.steps.map((s) => `- [ ] ${s}`),
      '',
      `## 权威参考出处`,
      ...unit.sources.map((s) => `- ${s.sourceOrg}：${s.sourceUrl}（核验：${s.fetchedAt}）`),
      '',
    ];
    const mdText = lines.join('\n');
    try {
      const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${unit.id}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('已导出本篇完整 Markdown 手册与核对清单');
    } catch {
      void navigator.clipboard?.writeText(mdText);
      toast.success('已将本篇完整 Markdown 复制到剪贴板');
    }
  };

  // 离开页面时自动温和记录阅读时长（不打断）
  useEffect(() => {
    openedAtRef.current = Date.now();
    return () => {
      const elapsed = Date.now() - openedAtRef.current;
      if (elapsed >= 4000) {
        void recordStudyDuration({
          branchId: unit.branchId,
          trackId: unit.trackId,
          unitId: unit.id,
          activity: 'guide',
          durationMs: Math.min(elapsed, 45 * 60 * 1000),
        });
      }
    };
  }, [unit.id, unit.branchId, unit.trackId]);

  const scrollToSection = (id: string) => {
    setActiveSecId(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 一键标为已读（彻底取消做题/填作业门禁）
  const handleToggleMarkRead = async () => {
    const elapsed = Math.min(Math.max(Date.now() - openedAtRef.current, 3000), 30 * 60 * 1000);
    openedAtRef.current = Date.now();
    await recordStudyDuration({
      branchId: unit.branchId,
      trackId: unit.trackId,
      unitId: unit.id,
      activity: 'guide',
      durationMs: elapsed,
    });
    const next = await recordActionSubmission({
      unitId: unit.id,
      branchId: unit.branchId,
      trackId: unit.trackId,
      deliverableSummary: existingSub?.deliverableSummary || `已读实战手册：${unit.title}`,
      feynmanOneLiner: memoText.trim() || existingSub?.feynmanOneLiner,
      quizPassScoreRatio: existingSub?.quizPassScoreRatio ?? 1,
      isCleared: !isRead,
    });
    onTelemetryChange(next);
    toast.success(isRead ? '已取消已读标记' : '已记为读过，随时可以回来翻阅');
  };

  const handleSaveLifeMemo = async () => {
    if (!memoText.trim()) return;
    let next = await addLifeNote({
      title: noteTitle.trim() || unit.title.split('：')[0],
      body: memoText.trim(),
      branchId: unit.branchId,
    });
    next = await recordActionSubmission({
      unitId: unit.id,
      branchId: unit.branchId,
      trackId: unit.trackId,
      deliverableSummary: existingSub?.deliverableSummary || `笔记摘录：${memoText.trim().slice(0, 48)}`,
      feynmanOneLiner: memoText.trim(),
      quizPassScoreRatio: existingSub?.quizPassScoreRatio ?? 1,
      isCleared: true,
    });
    onTelemetryChange(next);
    toast.success('已收进「生活手账 → 生活笔记」');
  };

  const handlePredictionSubmit = async (idx: number) => {
    setPredChoice(idx);
    setPredSubmitted(true);
    const next = await recordQuizAttempt({
      unitId: unit.id,
      branchId: unit.branchId,
      trackId: unit.trackId,
      questionId: `${unit.id}-prediction`,
      conceptId: unit.conceptNodeIds[0] ?? 'b1.prompt_context_boundary',
      kind: 'prediction',
      selectedIndex: idx,
      isCorrect: idx === unit.prediction.answerIndex,
      durationMs: 3500,
    });
    onTelemetryChange(next);
  };

  const handleQuizSubmit = async () => {
    const total = unit.quiz.questions.length;
    if (total === 0) return;
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
        durationMs: 5000,
      });
    }
    const ratio = correctCount / total;
    setQuizScoreRatio(ratio);
    setQuizSubmitted(true);
    onTelemetryChange(latestSnap);
    toast(
      ratio >= 0.8
        ? `答对 ${correctCount}/${total} 题，核心判断很稳`
        : `答对 ${correctCount}/${total} 题，看看下面解析就好（不影响自由阅读）`
    );
  };

  const handleRateCard = async (conceptId: string, rating: CardRating) => {
    setRatedCards((prev) => ({ ...prev, [conceptId]: rating }));
    const next = await recordCardReview(conceptId, rating, {
      branchId: unit.branchId,
      trackId: unit.trackId,
      durationMs: 4000,
    });
    onTelemetryChange(next);
    toast(
      rating === 'easy'
        ? '已记下：熟悉了'
        : rating === 'fuzzy'
          ? '已收进温习本（3 天后提醒）'
          : '已收进温习本（明天提醒）'
    );
    if (cardIdx < concepts.length - 1) {
      setTimeout(() => setCardIdx((i) => Math.min(concepts.length - 1, i + 1)), 220);
    }
  };

  const openStudyDrawer = (tab: 'notes' | 'sources') => {
    setStudyDrawerTab(tab);
    setStudyDrawerOpen(true);
  };

  const allQuestionsAnswered = Object.keys(quizAnswers).length >= unit.quiz.questions.length;

  const tocItems = [
    { id: 'sec-tldr', label: '一分钟核心结论' },
    { id: 'sec-visual', label: '图解与随手工具' },
    ...unit.guide.blocks.map((b, idx) => {
      const cleanHead = b.heading.split(/[：?？]/)[0].replace(/`/g, '').trim();
      const shortHead = cleanHead.length > 13 ? `${cleanHead.slice(0, 13)}…` : cleanHead;
      return {
        id: `sec-block-${idx}`,
        label: `0${idx + 1} ${shortHead}`,
      };
    }),
    { id: 'sec-checklist', label: '拿走就能做的清单' },
    { id: 'sec-optional', label: '可选演练与笔记' },
  ];

  // 同分支下一篇手册推荐
  const siblingUnits = content.units.filter((u) => u.branchId === unit.branchId);
  const currentSiblingIdx = siblingUnits.findIndex((u) => u.id === unit.id);
  const nextSibling =
    currentSiblingIdx >= 0 && currentSiblingIdx + 1 < siblingUnits.length
      ? siblingUnits[currentSiblingIdx + 1]
      : undefined;

  return (
    <div className="min-h-screen pb-16" data-testid="handbook-reader">
      {/* 右侧参考资料与溯源抽屉 */}
      <Drawer
        open={studyDrawerOpen}
        onOpenChange={setStudyDrawerOpen}
        title="本篇要点与参考出处"
        description={`${parentBranch?.name ?? unit.branchId} · 原手册保留在左侧随时对照`}
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

          {studyDrawerTab === 'notes' && (
            <div className="space-y-4">
              {takeaways.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[12.5px] font-semibold text-[var(--dawn)]">本篇核心要点</div>
                  {takeaways.map((b, idx) => (
                    <div
                      key={idx}
                      className="glass-plate p-3.5 text-[13.5px] leading-[1.65] text-[var(--ink-1)]"
                    >
                      <div className="mb-1 text-[12px] text-[var(--ink-3)]">
                        <RichText text={b.heading} />
                      </div>
                      <RichText text={b.keyTakeaway ?? ''} concepts={concepts} />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">
                  相关概念（点击看大白话解释）
                </div>
                {concepts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => glossary?.openConcept(c)}
                    className="glass-plate flex w-full cursor-pointer flex-col gap-1 p-3.5 text-left transition-colors hover:border-[var(--accent-border)]"
                  >
                    <span className="text-[13.5px] font-semibold text-[var(--ink-1)]">
                      {c.label}
                    </span>
                    <span className="text-[13px] leading-[1.55] text-[var(--ink-2)]">
                      {c.plainDefinition}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {studyDrawerTab === 'sources' && (
            <div className="space-y-4">
              <OriginCardsList cards={unit.guide.originCards} />
              <SourceTimelinessFooter sources={unit.sources} />
            </div>
          )}
        </div>
      </Drawer>

      {/* 顶部清爽手册阅读栏 + 细进度条 */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface-glass)] backdrop-blur-md">
        <div
          className="h-[2px] bg-[var(--dawn)] transition-[width] duration-150"
          style={{ width: `${readProgress}%` }}
          aria-hidden="true"
        />
        <div className="mx-auto flex h-[54px] max-w-[1140px] items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onBackToBranches(unit.branchId)}
              aria-label="返回生活技能目录"
            >
              <ArrowLeft size={15} strokeWidth={1.6} />
              <span>返回{parentBranch?.name ?? '目录'}</span>
            </Button>
            <span className="hidden text-[var(--line-strong)] sm:inline">/</span>
            <span className="hidden truncate text-[13.5px] font-medium text-[var(--ink-2)] sm:inline">
              {unit.title}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip content="一键记为读过，不需要做题或交作业">
              <Button
                variant={isRead ? 'growth' : 'primary'}
                size="sm"
                data-testid="unit-mark-read-btn"
                onClick={handleToggleMarkRead}
                className="rounded-full"
              >
                <Check size={14} strokeWidth={2.2} />
                <span>{isRead ? '已读' : '标为已读'}</span>
              </Button>
            </Tooltip>

            <Tooltip content={fontScale === 'large' ? '切回标准排版字号' : '切至舒展大字护眼阅读'}>
              <button
                type="button"
                aria-label="切换阅读字号"
                data-testid="unit-font-toggle"
                onClick={handleToggleFontScale}
                className={cn(
                  'inline-flex h-[34px] cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
                  fontScale === 'large'
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                    : 'border-[var(--line-strong)] bg-[var(--surface-plate)] text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                )}
              >
                <Type size={13} strokeWidth={1.7} />
                <span className="hidden md:inline">{fontScale === 'large' ? '舒展' : '标准'}</span>
              </button>
            </Tooltip>

            <Tooltip content="导出本篇完整 Markdown 手册与核对清单">
              <button
                type="button"
                aria-label="导出本篇 Markdown"
                data-testid="unit-export-md-btn"
                onClick={handleExportMarkdown}
                className="inline-flex h-[34px] cursor-pointer items-center gap-1 rounded-full border border-[var(--line-strong)] bg-[var(--surface-plate)] px-2.5 text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--ink-1)]"
              >
                <Download size={13} strokeWidth={1.7} />
                <span className="hidden md:inline">导出 MD</span>
              </button>
            </Tooltip>

            <Tooltip content="本篇划重点、术语表与权威出处">
              <Button
                variant="subtle"
                size="sm"
                data-testid="study-drawer-trigger"
                onClick={() => openStudyDrawer('notes')}
              >
                <BookMarked size={14} strokeWidth={1.6} />
                <span className="hidden sm:inline">参考资料</span>
              </Button>
            </Tooltip>

            <Tooltip content="全局快速搜索（⌘K）">
              <button
                type="button"
                aria-label="快速搜索"
                onClick={onOpenCommandPalette}
                className="inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-plate)] text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
              >
                <Search size={14} strokeWidth={1.6} />
              </button>
            </Tooltip>

            <Tooltip content={theme === 'dark' ? '切换浅色阅读模式' : '切换暗色阅读模式'}>
              <button
                type="button"
                aria-label="切换明暗主题"
                onClick={onToggleTheme}
                className="inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-plate)] text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
              >
                {theme === 'dark' ? (
                  <Sun size={14} strokeWidth={1.6} />
                ) : (
                  <Moon size={14} strokeWidth={1.6} />
                )}
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* 主阅读区：左吸顶目录导航 + 右整页深度实战手册 */}
      <main
        id="main-content"
        className="mx-auto grid max-w-[1140px] grid-cols-1 items-start gap-7 px-4 pt-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:pt-8"
      >
        {/* 左：桌面吸顶目录 + 术语速查（随时跳着读） */}
        <aside className="hidden space-y-4 lg:sticky lg:top-[76px] lg:block" aria-label="本篇目录">
          <div className="v3-card space-y-3 p-4">
            <div className="flex items-center justify-between text-[12px] text-[var(--ink-3)]">
              <span className="font-semibold text-[var(--ink-1)]">本篇目录</span>
              <span className="font-mono-num">{readProgress}%</span>
            </div>
            <nav className="flex flex-col gap-1">
              {tocItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={cn(
                    'cursor-pointer truncate rounded-[8px] border-0 px-2.5 py-1.5 text-left text-[13px] transition-colors',
                    activeSecId === item.id
                      ? 'bg-[var(--accent-soft)] font-medium text-[var(--ink-1)]'
                      : 'bg-transparent text-[var(--ink-3)] hover:bg-[var(--surface-plate)] hover:text-[var(--ink-1)]'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {concepts.length > 0 && (
              <div className="space-y-2 border-t border-[var(--line)] pt-3">
                <div className="text-[11.5px] font-medium text-[var(--ink-3)]">
                  文中关键概念（点看解释）
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {concepts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => glossary?.openConcept(c)}
                      className="glossary-trigger glossary-term-btn text-left text-[12px]"
                    >
                      {c.label.replace(/（.*?）|\(.*?\)/g, '')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* 右：整页长文实战手册画布 */}
        <article
          className="handbook-article-shell min-w-0 max-w-[820px] space-y-6"
          data-font-scale={fontScale}
        >
          <PlaceholderBanner visible={unit.isPlaceholder} />

          {/* 1. 封面标题 + 一分钟核心结论 */}
          <Card id="sec-tldr" className="scroll-mt-20 space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <Badge tone="accent">{parentBranch?.name ?? unit.branchId}</Badge>
              <Badge tone="neutral" className="font-mono-num">
                深度手册 · 约 {unit.estimatedMinutes} 分钟
              </Badge>
              {isRead && <Badge tone="growth">已读留痕</Badge>}
            </div>

            <div className="space-y-2.5">
              <h1 className="m-0 text-[24px] font-semibold leading-[1.34] tracking-[-0.02em] text-[var(--ink-1)] sm:text-[28px]">
                {unit.title}
              </h1>
              <p className="m-0 text-[15px] leading-[1.78] text-[var(--ink-2)]">
                <RichText text={unit.scenarioHook.story} concepts={concepts} />
              </p>
            </div>

            {/* 一分钟抓重点 TL;DR */}
            {takeaways.length > 0 && (
              <div className="glass-plate space-y-2.5 p-4 sm:p-5">
                <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--dawn)]">
                  <Sparkles size={14} strokeWidth={1.8} />
                  <span>没空细看？先带走这 {takeaways.length} 句核心结论</span>
                </div>
                <ul className="m-0 list-disc space-y-1.5 pl-5 text-[14.2px] leading-[1.7] text-[var(--ink-1)]">
                  {takeaways.map((blk, idx) => (
                    <li key={idx}>
                      <RichText text={blk.keyTakeaway ?? ''} concepts={concepts} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 移动端快捷目录芯片 */}
            <div className="flex flex-wrap gap-1.5 lg:hidden">
              {tocItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="max-w-full cursor-pointer truncate rounded-full border border-[var(--line)] bg-[var(--surface-plate)] px-3 py-1 text-[12px] text-[var(--ink-2)]"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </Card>

          <PsychBoundaryNotice sources={unit.sources} />

          {/* 2. 互动图解 + 配套生活小算盘 */}
          <section id="sec-visual" className="scroll-mt-20 space-y-4">
            <UnitVisualFrame
              visuals={unit.guide.visuals}
              activeStep={diagramStep}
              onStepChange={setDiagramStep}
            />
            {UNIT_LIVE_SANDBOX_MAP[unit.id] && (
              <Card className="p-4 sm:p-5">
                <LifeToolsSandbox mode={UNIT_LIVE_SANDBOX_MAP[unit.id]} compact />
              </Card>
            )}
          </section>

          {/* 3. 全篇深度分节正文（含对照表、真实样本、避坑 FAQ 与一键复制模板） */}
          <div className="space-y-5">
            {unit.guide.blocks.map((blk, idx) => (
              <Card
                key={idx}
                id={`sec-block-${idx}`}
                className="scroll-mt-20 space-y-4 p-6 sm:p-7"
                onMouseEnter={() => setActiveSecId(`sec-block-${idx}`)}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] pb-3">
                  <h2 className="m-0 flex min-w-0 flex-1 items-baseline gap-2.5 text-[18.5px] font-semibold leading-[1.4] text-[var(--ink-1)] sm:text-[20px]">
                    <span className="font-mono-num shrink-0 text-[13.5px] font-semibold text-[var(--dawn)]">
                      0{idx + 1}
                    </span>
                    <span>
                      <RichText text={blk.heading} concepts={concepts} />
                    </span>
                  </h2>
                  <Tooltip content="一键把本节核心要点存进「生活手账 → 生活笔记」">
                    <button
                      type="button"
                      data-testid="excerpt-section-btn"
                      onClick={() => handleExcerptSection(blk.heading, blk.keyTakeaway, blk.markdown)}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-[var(--line)] bg-transparent px-2.5 py-1 text-[11.5px] font-medium text-[var(--ink-3)] transition-colors hover:border-[var(--dawn-border)] hover:text-[var(--dawn)]"
                    >
                      <BookmarkPlus size={12} strokeWidth={1.7} />
                      <span>摘录</span>
                    </button>
                  </Tooltip>
                </div>

                <MarkdownArticle text={blk.markdown} concepts={concepts} />

                {blk.keyTakeaway && (
                  <div className="rounded-[10px] border border-[var(--growth-border)] bg-[var(--growth-soft)] px-4 py-2.5 text-[13.5px] leading-[1.65] text-[var(--ink-1)]">
                    <strong className="font-semibold text-[var(--growth)]">本节一句话：</strong>
                    <RichText text={blk.keyTakeaway} concepts={concepts} />
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* 4. 拿走就能照做的实操清单（纯自愿打勾，零提交门槛） */}
          <Card id="sec-checklist" className="scroll-mt-20 space-y-4 p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2">
                <ListChecks size={17} strokeWidth={1.8} className="text-[var(--growth)]" />
                <h2 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
                  拿走就能用：{unit.actionTask.title}
                </h2>
              </div>
              <Badge tone="neutral">随用随勾 · 不交作业</Badge>
            </div>
            <p className="m-0 text-[14px] text-[var(--ink-2)]">{unit.actionTask.lifeContext}</p>

            <div className="glass-plate space-y-2.5 p-4">
              {unit.actionTask.steps.map((s, idx) => {
                const checked = Boolean(checkedSteps[idx]);
                return (
                  <label
                    key={s}
                    className="flex cursor-pointer items-start gap-3 text-[14.5px] leading-[1.65]"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() =>
                        setCheckedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }))
                      }
                      className={cn(
                        'mt-1 flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors',
                        checked
                          ? 'border-[var(--growth)] bg-[var(--growth)] text-[#081510]'
                          : 'border-[var(--line-strong)] bg-[var(--surface-raised)]'
                      )}
                    >
                      {checked && <Check size={12} strokeWidth={2.4} />}
                    </button>
                    <span
                      className={cn(
                        'text-[var(--ink-1)]',
                        checked && 'text-[var(--ink-3)] line-through'
                      )}
                    >
                      <RichText text={s} concepts={concepts} />
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>

          {/* 5. 页尾 100% 可选扩展区（情景演练 / 顺手自测 / 概念闪卡 / 记入生活笔记） */}
          <Card id="sec-optional" className="scroll-mt-20 space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="m-0 text-[16.5px] font-semibold text-[var(--ink-1)]">
                  想顺手练一下或留句笔记？（完全可选）
                </h2>
                <p className="mt-0.5 mb-0 text-[13px] text-[var(--ink-3)]">
                  读完上面就已经完整学完啦；有兴致再点下面小工具试手，不做也不影响进度
                </p>
              </div>
              {optionalTab !== 'none' && (
                <Button size="sm" variant="ghost" onClick={() => setOptionalTab('none')}>
                  <ChevronDown size={14} className="rotate-180" />
                  <span>收起</span>
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="可选扩展练习">
              {linkedScenario && (
                <Button
                  size="sm"
                  variant={optionalTab === 'scenario' ? 'primary' : 'outline'}
                  data-testid="opt-tab-scenario"
                  onClick={() =>
                    setOptionalTab((prev) => (prev === 'scenario' ? 'none' : 'scenario'))
                  }
                >
                  <MessageCircle size={13} strokeWidth={1.7} />
                  <span>情景演练一局</span>
                </Button>
              )}
              <Button
                size="sm"
                variant={optionalTab === 'quiz' ? 'primary' : 'outline'}
                data-testid="opt-tab-quiz"
                onClick={() => setOptionalTab((prev) => (prev === 'quiz' ? 'none' : 'quiz'))}
              >
                <HelpCircle size={13} strokeWidth={1.7} />
                <span>顺手自测 ({unit.quiz.questions.length} 题)</span>
              </Button>
              {concepts.length > 0 && (
                <Button
                  size="sm"
                  variant={optionalTab === 'cards' ? 'primary' : 'outline'}
                  data-testid="opt-tab-cards"
                  onClick={() => setOptionalTab((prev) => (prev === 'cards' ? 'none' : 'cards'))}
                >
                  <Layers size={13} strokeWidth={1.7} />
                  <span>概念闪卡 ({concepts.length})</span>
                </Button>
              )}
              <Button
                size="sm"
                variant={optionalTab === 'note' ? 'primary' : 'outline'}
                data-testid="opt-tab-note"
                onClick={() => setOptionalTab((prev) => (prev === 'note' ? 'none' : 'note'))}
              >
                <PenLine size={13} strokeWidth={1.7} />
                <span>写一条生活笔记</span>
              </Button>
            </div>

            {/* 可选 A：情景演练 */}
            {optionalTab === 'scenario' && linkedScenario && (
              <div className="pt-2">
                <LifeScenarioSim scenario={linkedScenario} />
              </div>
            )}

            {/* 可选 B：顺手自测（无门槛） */}
            {optionalTab === 'quiz' && (
              <div className="space-y-5 border-t border-[var(--line)] pt-4">
                {/* 反直觉小思考 */}
                <div className="glass-plate space-y-3 p-4">
                  <div className="text-[12px] font-semibold text-[var(--dawn)]">直觉小思考</div>
                  <div className="text-[14.5px] font-medium text-[var(--ink-1)]">
                    <RichText text={unit.prediction.question} />
                  </div>
                  <div className="space-y-1.5">
                    {unit.prediction.options.map((opt, idx) => {
                      const picked = predChoice === idx;
                      const isRight = predSubmitted && idx === unit.prediction.answerIndex;
                      const isWrong = predSubmitted && picked && idx !== unit.prediction.answerIndex;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handlePredictionSubmit(idx)}
                          className={cn(
                            'quiz-option-btn flex w-full cursor-pointer items-start gap-2.5 rounded-[10px] border p-3 text-left text-[13.5px] transition-colors',
                            isRight
                              ? 'border-[var(--growth)] bg-[var(--growth-soft)] text-[var(--ink-1)]'
                              : isWrong
                                ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--ink-1)]'
                                : 'border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-2)] hover:border-[var(--accent-border)] hover:text-[var(--ink-1)]'
                          )}
                        >
                          <span className="font-mono-num text-[12px] font-semibold">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                  {predSubmitted && (
                    <p className="m-0 rounded-[8px] border border-[var(--growth-border)] bg-[var(--growth-soft)] p-3 text-[13px] leading-[1.65] text-[var(--ink-1)]">
                      <strong>解析：</strong>
                      <RichText text={unit.prediction.whyCounterIntuitive} />
                    </p>
                  )}
                </div>

                {/* 正式自测题 */}
                {unit.quiz.questions.map((q, qIdx) => {
                  const picked = quizAnswers[q.id];
                  return (
                    <div className="quiz-question-block space-y-2.5" key={q.id}>
                      <div className="text-[15px] font-semibold text-[var(--ink-1)]">
                        <span className="font-mono-num mr-2 text-[13px] text-[var(--accent)]">
                          Q{qIdx + 1}
                        </span>
                        <RichText text={q.stem} />
                      </div>
                      <div className="space-y-1.5">
                        {q.options.map((opt, oIdx) => {
                          const isSelected = picked === oIdx;
                          const isCorrectOpt = quizSubmitted && oIdx === q.correctIndex;
                          const isWrongPick = quizSubmitted && isSelected && oIdx !== q.correctIndex;
                          return (
                            <button
                              key={oIdx}
                              type="button"
                              disabled={quizSubmitted}
                              onClick={() =>
                                setQuizAnswers((prev) => ({ ...prev, [q.id]: oIdx }))
                              }
                              className={cn(
                                'quiz-option-btn flex w-full cursor-pointer items-start gap-2.5 rounded-[10px] border p-3 text-left text-[14px] transition-colors disabled:cursor-default',
                                isCorrectOpt
                                  ? 'border-[var(--growth)] bg-[var(--growth-soft)] text-[var(--ink-1)]'
                                  : isWrongPick
                                    ? 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--ink-1)]'
                                    : isSelected
                                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                                      : 'border-[var(--line-strong)] bg-[var(--surface-plate)] text-[var(--ink-2)] hover:border-[var(--accent-border)]'
                              )}
                            >
                              <span className="font-mono-num text-[12px] font-semibold">
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              <span>
                                <RichText text={opt} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {quizSubmitted && (
                        <div className="rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-plate)] p-3 text-[13.5px] leading-[1.65] text-[var(--ink-2)]">
                          <strong className="text-[var(--ink-1)]">
                            {picked === q.correctIndex ? '判断准确：' : '解析参考：'}
                          </strong>
                          <RichText text={q.explanation} />
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {quizSubmitted ? (
                    <>
                      <span className="text-[13.5px] text-[var(--ink-2)]">
                        本次答对率{' '}
                        <strong className="font-mono-num text-[var(--ink-1)]">
                          {Math.round(quizScoreRatio * 100)}%
                        </strong>
                      </span>
                      <Popconfirm
                        title="清空刚才的选择重做一次？"
                        confirmLabel="重做"
                        tone="warning"
                        onConfirm={() => {
                          setQuizSubmitted(false);
                          setQuizAnswers({});
                        }}
                      >
                        <Button size="sm" variant="outline">
                          重做一次
                        </Button>
                      </Popconfirm>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!allQuestionsAnswered}
                      onClick={handleQuizSubmit}
                    >
                      核对答案与解析
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* 可选 C：3D 概念闪卡 */}
            {optionalTab === 'cards' && currentConcept && (
              <div className="space-y-4 border-t border-[var(--line)] pt-4">
                <div className="flip-perspective mx-auto max-w-[640px]">
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
                    <div
                      className={cn(
                        'flip-backface-hidden glass-plate col-start-1 row-start-1 flex min-h-[220px] flex-col justify-between rounded-[14px] p-5',
                        isCurrentFlipped && 'pointer-events-none'
                      )}
                    >
                      <div className="text-[12.5px] font-semibold text-[var(--ink-3)]">
                        {currentConcept.label}（{cardIdx + 1}/{concepts.length}）
                      </div>
                      <div className="my-4 text-center text-[17px] font-medium leading-[1.6] text-[var(--ink-1)]">
                        {currentConcept.cardPrompt}
                      </div>
                      <div className="flex justify-center">
                        <Button variant="outline" size="sm">
                          <RotateCw size={13} strokeWidth={1.6} />
                          <span>翻看大白话解析</span>
                        </Button>
                      </div>
                    </div>

                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'flip-backface-hidden glass-plate col-start-1 row-start-1 flex min-h-[220px] flex-col justify-between gap-3 rounded-[14px] border-[var(--accent-border)] p-5 [transform:rotateY(180deg)]',
                        !isCurrentFlipped && 'pointer-events-none'
                      )}
                    >
                      <div className="text-[14.5px] leading-[1.7] text-[var(--ink-1)]">
                        <RichText text={currentConcept.cardAnswer} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                        <Button
                          size="sm"
                          variant={ratedCards[currentConcept.id] === 'easy' ? 'growth' : 'outline'}
                          onClick={() => handleRateCard(currentConcept.id, 'easy')}
                        >
                          熟悉了
                        </Button>
                        <Button
                          size="sm"
                          variant={ratedCards[currentConcept.id] === 'fuzzy' ? 'warning' : 'outline'}
                          onClick={() => handleRateCard(currentConcept.id, 'fuzzy')}
                        >
                          有点模糊（3天后温习）
                        </Button>
                        <Button
                          size="sm"
                          variant={ratedCards[currentConcept.id] === 'again' ? 'danger' : 'outline'}
                          onClick={() => handleRateCard(currentConcept.id, 'again')}
                        >
                          收进明日温习
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            )}

            {/* 可选 D：记一条随身生活笔记 */}
            {optionalTab === 'note' && (
              <div className="space-y-3 border-t border-[var(--line)] pt-4">
                <input
                  type="text"
                  className="v3-input text-[14px]"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="笔记标题"
                />
                <textarea
                  rows={3}
                  className="v3-textarea text-[14px]"
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  placeholder="写下这篇最打动你的一条备忘、数字或下次遇到要照做的话…"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!memoText.trim()}
                    onClick={handleSaveLifeMemo}
                  >
                    <BookmarkPlus size={14} strokeWidth={1.7} />
                    <span>存进生活笔记</span>
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* 6. 经典溯源与权威出处 + 底部导航 */}
          <OriginCardsList cards={unit.guide.originCards} />
          <SourceTimelinessFooter sources={unit.sources} />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <Button variant={isRead ? 'growth' : 'primary'} onClick={handleToggleMarkRead}>
                <CheckCircle2 size={15} strokeWidth={1.8} />
                <span>{isRead ? '已读（点击取消）' : '读完了，标为已读'}</span>
              </Button>
              <a
                href="#/"
                className="inline-flex min-h-[38px] items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-plate)] px-4 text-[13.5px] font-medium text-[var(--ink-1)] no-underline hover:border-[var(--accent-border)]"
              >
                回到今天
              </a>
            </div>

            {nextSibling && (
              <Button variant="outline" onClick={() => onOpenUnit(nextSibling.id)}>
                <span>下一篇：{nextSibling.title.split('：')[0]}</span>
              </Button>
            )}
          </div>
        </article>
      </main>
    </div>
  );
}
