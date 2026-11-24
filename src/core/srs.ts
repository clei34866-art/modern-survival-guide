import { getLocalDateKey } from './db';
import type {
  BranchId,
  ConceptCardStat,
  ConceptNode,
  KnowledgeGraphManifest,
  LearningUnit,
  QuizQuestion,
  TelemetrySnapshot,
} from '../types/schema';

export interface RetestQueueItem {
  concept: ConceptNode;
  stat: ConceptCardStat;
  isDueToday: boolean;
  question?: QuizQuestion;
  unit?: LearningUnit;
}

export interface WeaknessRankItem {
  concept: ConceptNode;
  stat: ConceptCardStat;
  weaknessScore: number;
}

/** 提取 1/3/7 天错题与薄弱概念重测队列（区分今日已到期 vs 未来待到期） */
export function getRetestQueue(
  knowledgeGraph: KnowledgeGraphManifest,
  units: LearningUnit[],
  telemetry: TelemetrySnapshot,
  todayKey = getLocalDateKey()
): {
  dueItems: RetestQueueItem[];
  upcomingItems: RetestQueueItem[];
} {
  const nodeMap = new Map(knowledgeGraph.nodes.map((n) => [n.id, n]));
  const dueItems: RetestQueueItem[] = [];
  const upcomingItems: RetestQueueItem[] = [];

  for (const stat of Object.values(telemetry.cardStats)) {
    if (typeof stat.retestStage !== 'number' || stat.retestStage === 0) {
      continue;
    }
    const concept = nodeMap.get(stat.conceptId);
    if (!concept) continue;

    // 匹配关联的自测原题用于结构化重测
    let matchedQuestion: QuizQuestion | undefined;
    let matchedUnit: LearningUnit | undefined;
    for (const u of units) {
      const q = u.quiz.questions.find((item) => item.relatedConceptId === concept.id);
      if (q) {
        matchedQuestion = q;
        matchedUnit = u;
        break;
      }
    }

    const isDueToday = !stat.dueDate || stat.dueDate <= todayKey;
    const entry: RetestQueueItem = {
      concept,
      stat,
      isDueToday,
      question: matchedQuestion,
      unit: matchedUnit,
    };

    if (isDueToday) {
      dueItems.push(entry);
    } else {
      upcomingItems.push(entry);
    }
  }

  const sortByUrgency = (a: RetestQueueItem, b: RetestQueueItem) => {
    const stageA = typeof a.stat.retestStage === 'number' ? a.stat.retestStage : 99;
    const stageB = typeof b.stat.retestStage === 'number' ? b.stat.retestStage : 99;
    if (stageA !== stageB) return stageA - stageB;
    return b.stat.errorCount - a.stat.errorCount;
  };

  dueItems.sort(sortByUrgency);
  upcomingItems.sort(sortByUrgency);

  return { dueItems, upcomingItems };
}

/** 计算薄弱概念 TOP5（实时供给重测中心、周报与 1080P 状态墙学习块） */
export function getWeaknessTop5(
  knowledgeGraph: KnowledgeGraphManifest,
  telemetry: TelemetrySnapshot
): WeaknessRankItem[] {
  const nodeMap = new Map(knowledgeGraph.nodes.map((n) => [n.id, n]));
  const ranked: WeaknessRankItem[] = [];

  for (const stat of Object.values(telemetry.cardStats)) {
    const concept = nodeMap.get(stat.conceptId);
    if (!concept) continue;

    const stageWeight =
      stat.retestStage === 1
        ? 6
        : stat.retestStage === 3
          ? 4
          : stat.retestStage === 7
            ? 2
            : 0;
    const ratingPenalty =
      stat.lastRating === 'again' ? 3 : stat.lastRating === 'fuzzy' ? 2 : 0;
    const weaknessScore =
      stat.errorCount * 4 + stageWeight + ratingPenalty - Math.min(stat.correctStreak, 3);

    if (weaknessScore > 0) {
      ranked.push({ concept, stat, weaknessScore });
    }
  }

  ranked.sort((a, b) => b.weaknessScore - a.weaknessScore);
  return ranked.slice(0, 5);
}

/** 构建知识图谱闪卡序列（优先浮出待温习与未刷过的概念节点） */
export function getFlashcardDeck(
  knowledgeGraph: KnowledgeGraphManifest,
  telemetry: TelemetrySnapshot,
  branchFilter: BranchId | 'ALL' = 'ALL'
): Array<{ concept: ConceptNode; stat?: ConceptCardStat }> {
  const filtered =
    branchFilter === 'ALL'
      ? knowledgeGraph.nodes
      : knowledgeGraph.nodes.filter((n) => n.branchId === branchFilter);

  const priorityOf = (cid: string): number => {
    const stat = telemetry.cardStats[cid];
    if (!stat) return 1; // 未练习过优先认识
    if (stat.retestStage === 1) return 0; // 错题最高优
    if (stat.retestStage === 3 || stat.retestStage === 7) return 2;
    return 3;
  };

  return [...filtered]
    .sort((a, b) => priorityOf(a.id) - priorityOf(b.id))
    .map((concept) => ({
      concept,
      stat: telemetry.cardStats[concept.id],
    }));
}
