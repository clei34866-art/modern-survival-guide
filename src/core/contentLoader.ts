import type {
  CatalogManifest,
  DailyLifeTip,
  DailyTipsBundle,
  KnowledgeGraphManifest,
  LearningUnit,
  UnitsBundle,
} from '../types/schema';

export interface PlatformContentBundle {
  catalog: CatalogManifest;
  knowledgeGraph: KnowledgeGraphManifest;
  units: LearningUnit[];
  dailyTips: DailyLifeTip[];
}

export async function loadPlatformContent(): Promise<PlatformContentBundle> {
  const [catalogRes, kgRes, sampleUnitsRes, tipsRes] = await Promise.all([
    fetch('./data/catalog.json'),
    fetch('./data/knowledge-graph.json'),
    fetch('./data/units/placeholders.json'),
    fetch('./data/daily-tips.json'),
  ]);

  if (!catalogRes.ok || !kgRes.ok || !sampleUnitsRes.ok || !tipsRes.ok) {
    throw new Error('无法加载结构化内容 JSON，请检查 public/data/ 目录完整性');
  }

  const [catalog, knowledgeGraph, unitsBundle, tipsBundle] = (await Promise.all([
    catalogRes.json(),
    kgRes.json(),
    sampleUnitsRes.json(),
    tipsRes.json(),
  ])) as [CatalogManifest, KnowledgeGraphManifest, UnitsBundle, DailyTipsBundle];

  return {
    catalog,
    knowledgeGraph,
    units: unitsBundle.units,
    dailyTips: tipsBundle.tips,
  };
}
