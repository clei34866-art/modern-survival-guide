import type {
  CatalogManifest,
  DailyLifeTip,
  DailyTipsBundle,
  KnowledgeGraphManifest,
  LearningUnit,
  LifeEventPack,
  StagePrepPack,
  ToolboxChecklist,
  UnitsBundle,
  WallConfigManifest,
} from '../types/schema';

export interface PlatformContentBundle {
  catalog: CatalogManifest;
  knowledgeGraph: KnowledgeGraphManifest;
  units: LearningUnit[];
  dailyTips: DailyLifeTip[];
  wallConfig: WallConfigManifest;
  eventPacks: LifeEventPack[];
  toolboxes: ToolboxChecklist[];
  stagePrepPacks: StagePrepPack[];
}

const UNIT_FILES = [
  'units/b1-ai-l1.json',
  'units/b1-ai-advanced.json',
  'units/b1-sw-blender.json',
  'units/b1-sw-packs.json',
  'units/b2-finance.json',
  'units/b3-psych.json',
  'units/b4-health.json',
  'units/b5-career.json',
  'units/b6-learning.json',
  'units/b7-safety.json',
] as const;

export async function loadPlatformContent(): Promise<PlatformContentBundle> {
  const rawBase =
    (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';
  const dataPrefix = rawBase.endsWith('/') ? `${rawBase}data` : `${rawBase}/data`;

  const corePaths = [
    'catalog.json',
    'knowledge-graph.json',
    'daily-tips.json',
    'wall-config.json',
    'event-packs.json',
    'toolbox-packs.json',
  ] as const;

  const [coreResponses, unitResponses] = await Promise.all([
    Promise.all(corePaths.map((p) => fetch(`${dataPrefix}/${p}`))),
    Promise.all(UNIT_FILES.map((p) => fetch(`${dataPrefix}/${p}`))),
  ]);

  if (coreResponses.some((r) => !r.ok) || unitResponses.some((r) => !r.ok)) {
    throw new Error('无法加载结构化内容 JSON，请检查 public/data/ 目录完整性');
  }

  const [corePayloads, unitPayloads] = await Promise.all([
    Promise.all(coreResponses.map((r) => r.json())),
    Promise.all(unitResponses.map((r) => r.json() as Promise<UnitsBundle>)),
  ]);

  const [catalog, knowledgeGraph, tipsBundle, wallConfig, eventsData, toolsData] = corePayloads as [
    CatalogManifest,
    KnowledgeGraphManifest,
    DailyTipsBundle,
    WallConfigManifest,
    { packs: LifeEventPack[] },
    { toolboxes: ToolboxChecklist[]; stagePrepPacks: StagePrepPack[] },
  ];

  const allUnits = unitPayloads.flatMap((bundle) => bundle.units);

  return {
    catalog,
    knowledgeGraph,
    units: allUnits,
    dailyTips: tipsBundle.tips,
    wallConfig,
    eventPacks: eventsData.packs,
    toolboxes: toolsData.toolboxes,
    stagePrepPacks: toolsData.stagePrepPacks,
  };
}
