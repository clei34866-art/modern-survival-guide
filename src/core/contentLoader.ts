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
    fetch('./data/catalog.json'),
    fetch('./data/knowledge-graph.json'),
    fetch('./data/units/b1-ai-l1.json'),
    fetch('./data/units/b1-sw-blender.json'),
    fetch('./data/units/b2-finance.json'),
    fetch('./data/units/b3-psych.json'),
    fetch('./data/daily-tips.json'),
    fetch('./data/wall-config.json'),
    fetch('./data/event-packs.json'),
    fetch('./data/toolbox-packs.json'),
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
