export type BranchId = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7';
export type EnergyBand = 'fragment' | 'peak' | 'low';
export type TrackKind = 'layered_stage' | 'software_pack' | 'branch_path';

/** 用于大屏与周报精确区分 AI 能力线、软件技能线与其余生活分支投入时长 */
export type StudyLineKind = 'b1_ai' | 'b1_software' | 'other_branch';

export interface ResourceRef {
  title: string;
  org: string;
  url: string;
}

export interface TrackGroup {
  id: string;
  kind: TrackKind;
  title: string;
  summary: string;
  unlockAfterTrackId?: string;
  milestoneDeliverable?: {
    title: string;
    criteria: string[];
  };
  unitIds: string[];
  curatedResources: ResourceRef[];
}

export interface BranchCatalog {
  id: BranchId;
  name: string;
  subtitle: string;
  accentToken: string;
  redLineRules: string[];
  tracks: TrackGroup[];
}

export interface CatalogManifest {
  version: string;
  updatedAt: string;
  branches: BranchCatalog[];
}

export interface ConceptNode {
  id: string;
  branchId: BranchId;
  label: string;
  plainDefinition: string;
  cardPrompt: string;
  cardAnswer: string;
  prerequisites: string[];
  crossLinks: Array<{
    targetId: string;
    bridgeNote: string;
  }>;
}

export interface KnowledgeGraphManifest {
  version: string;
  nodes: ConceptNode[];
}

export interface SourceCompliance {
  sourceOrg: string;
  sourceUrl: string;
  fetchedAt: string;
  publishedYear?: number;
  reviewAfter?: string;
  disclaimerKind?: 'finance_no_advice' | 'psych_boundary' | 'health_authority' | 'legal_timeliness';
  helpBoundaryText?: string;
}

export interface UnitVisual {
  kind: 'sourced_image' | 'exact_svg' | 'no_image_declared';
  imagePath?: string;
  imageSourceUrl?: string;
  caption?: string;
  svgSpec?: {
    template: 'curve_compare' | 'flow_pipeline' | 'two_axis_matrix' | 'tree_breakdown' | 'coordinate_3d';
    data: Record<string, unknown>;
  };
  noImageReason?: string;
}

export interface OriginCard {
  conceptOrExperiment: string;
  citation: string;
  originalSampleAndData: string;
  replicationControversy: string;
}

export interface QuizQuestion {
  id: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  relatedConceptId: string;
}

export interface LearningUnit {
  id: string;
  branchId: BranchId;
  trackId: string;
  title: string;
  estimatedMinutes: number;
  recommendedEnergy: EnergyBand;
  isPlaceholder: boolean;
  scenarioHook: {
    sceneTitle: string;
    story: string;
    guidingQuestion: string;
  };
  prediction: {
    question: string;
    options: string[];
    commonTrapIndex: number;
    answerIndex: number;
    whyCounterIntuitive: string;
  };
  guide: {
    blocks: Array<{
      heading: string;
      markdown: string;
      keyTakeaway?: string;
    }>;
    visuals: UnitVisual[];
    originCards?: OriginCard[];
  };
  conceptNodeIds: string[];
  quiz: {
    mode: 'standard_mcq' | 'scenario_branch_v2_reserved';
    passRatio: number;
    questions: QuizQuestion[];
  };
  actionTask: {
    id: string;
    title: string;
    lifeContext: string;
    steps: string[];
    deliverablePrompt: string;
    feynmanCheckPrompt?: string;
    matchPoolCategory?:
      | 'tweet_writing'
      | 'research_data'
      | 'course_slides'
      | 'running_health'
      | 'finance_sheet'
      | 'general';
  };
  sources: SourceCompliance[];
}

export interface UnitsBundle {
  version: string;
  units: LearningUnit[];
}

// ============================================================================
// 全量学习行为留痕与持久化数据结构（从 M1 第一版起全量记录）
// ============================================================================

export type CardRating = 'easy' | 'fuzzy' | 'again';
export type RetestStage = 0 | 1 | 3 | 7 | 'graduated';

export interface StudyDurationLog {
  id: string;
  branchId: BranchId;
  trackId: string;
  unitId?: string;
  lineKind: StudyLineKind;
  activity: 'guide' | 'card_review' | 'quiz' | 'action_task';
  durationMs: number;
  recordedAt: string;
}

export interface QuizAttemptLog {
  id: string;
  unitId: string;
  branchId: BranchId;
  trackId: string;
  questionId: string;
  conceptId: string;
  kind: 'prediction' | 'quiz' | 'retest';
  selectedIndex: number;
  isCorrect: boolean;
  durationMs: number;
  recordedAt: string;
}

export interface ConceptCardStat {
  conceptId: string;
  practiceCount: number;
  correctStreak: number;
  errorCount: number;
  lastRating?: CardRating;
  retestStage: RetestStage;
  dueDate?: string; // YYYY-MM-DD，用于 1/3/7 天错题与薄弱概念重测调度
  lastPracticedAt: string;
}

export interface UnitActionSubmission {
  unitId: string;
  branchId: BranchId;
  trackId: string;
  deliverableSummary: string;
  feynmanOneLiner?: string;
  linkedRealTaskId?: string;
  quizPassScoreRatio: number;
  isCleared: boolean; // 自测达标 + 行动完成 = 单元过关
  updatedAt: string;
}

export interface MilestoneDeliverableRecord {
  trackId: string;
  branchId: BranchId;
  completionPercent: number; // 0 - 100，供大屏看板展示当前层级与产出完成度
  artifactSummary: string;
  isApproved: boolean;
  updatedAt: string;
}

export interface TelemetrySnapshot {
  schemaVersion: 1;
  updatedAt: string;
  activeDates: string[]; // YYYY-MM-DD 去重升序数组，展示连续/累计学习天数且断更不惩罚不清零
  sessionDurations: StudyDurationLog[];
  attemptLogs: QuizAttemptLog[];
  cardStats: Record<string, ConceptCardStat>;
  unitSubmissions: Record<string, UnitActionSubmission>;
  milestoneSubmissions: Record<string, MilestoneDeliverableRecord>;
}

export interface WallExternalSyncPayload {
  updatedAt?: string;
  weather?: string;
  todos?: string[];
  life?: {
    running?: string;
    sleep?: string;
    water?: string;
  };
  content?: {
    quote?: string;
    quoteSource?: string;
    movie?: string;
  };
  serviceStatus?: {
    serverExpiry?: string;
    cloudSync?: string;
  };
}
