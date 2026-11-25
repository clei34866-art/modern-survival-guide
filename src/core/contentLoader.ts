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

export async function loadPlatformContent(): Promise<PlatformContentBundle> {
  const rawBase =
    (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';
  const dataPrefix = rawBase.endsWith('/') ? `${rawBase}data` : `${rawBase}/data`;

  const [
    catalogRes,
    kgRes,
    b1L1Res,
    b1BlenderRes,
    b2FinanceRes,
    b3PsychRes,
    tipsRes,
    wallRes,
    eventsRes,
    toolsRes,
  ] = await Promise.all([
    fetch(`${dataPrefix}/catalog.json`),
    fetch(`${dataPrefix}/knowledge-graph.json`),
    fetch(`${dataPrefix}/units/b1-ai-l1.json`),
    fetch(`${dataPrefix}/units/b1-sw-blender.json`),
    fetch(`${dataPrefix}/units/b2-finance.json`),
    fetch(`${dataPrefix}/units/b3-psych.json`),
    fetch(`${dataPrefix}/daily-tips.json`),
    fetch(`${dataPrefix}/wall-config.json`),
    fetch(`${dataPrefix}/event-packs.json`),
    fetch(`${dataPrefix}/toolbox-packs.json`),
  ]);

  if (
    !catalogRes.ok ||
    !kgRes.ok ||
    !b1L1Res.ok ||
    !b1BlenderRes.ok ||
    !b2FinanceRes.ok ||
    !b3PsychRes.ok ||
    !tipsRes.ok ||
    !wallRes.ok ||
    !eventsRes.ok ||
    !toolsRes.ok
  ) {
    throw new Error('无法加载结构化内容 JSON，请检查 public/data/ 目录完整性');
  }

  const [
    catalog,
    knowledgeGraph,
    b1L1Bundle,
    b1BlenderBundle,
    b2FinanceBundle,
    b3PsychBundle,
    tipsBundle,
    wallConfig,
    eventsData,
    toolsData,
  ] = (await Promise.all([
    catalogRes.json(),
    kgRes.json(),
    b1L1Res.json(),
    b1BlenderRes.json(),
    b2FinanceRes.json(),
    b3PsychRes.json(),
    tipsRes.json(),
    wallRes.json(),
    eventsRes.json(),
    toolsRes.json(),
  ])) as [
    CatalogManifest,
    KnowledgeGraphManifest,
    UnitsBundle,
    UnitsBundle,
    UnitsBundle,
    UnitsBundle,
    DailyTipsBundle,
    WallConfigManifest,
    { packs: LifeEventPack[] },
    { toolboxes: ToolboxChecklist[]; stagePrepPacks: StagePrepPack[] },
  ];

  return {
    catalog,
    knowledgeGraph,
    units: [
      ...b1L1Bundle.units,
      ...b1BlenderBundle.units,
      ...b2FinanceBundle.units,
      ...b3PsychBundle.units,
    ],
    dailyTips: tipsBundle.tips,
    wallConfig,
    eventPacks: eventsData.packs,
    toolboxes: toolsData.toolboxes,
    stagePrepPacks: toolsData.stagePrepPacks,
  };
}
