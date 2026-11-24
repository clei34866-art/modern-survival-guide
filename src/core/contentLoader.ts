import type {
  CatalogManifest,
  KnowledgeGraphManifest,
  LearningUnit,
  UnitsBundle,
} from '../types/schema';

export interface PlatformContentBundle {
  catalog: CatalogManifest;
  knowledgeGraph: KnowledgeGraphManifest;
  units: LearningUnit[];
}

export async function loadPlatformContent(): Promise<PlatformContentBundle> {
  const [catalogRes, kgRes, sampleUnitsRes] = await Promise.all([
    fetch('./data/catalog.json'),
    fetch('./data/knowledge-graph.json'),
    fetch('./data/units/placeholders.json'),
  ]);

  if (!catalogRes.ok || !kgRes.ok || !sampleUnitsRes.ok) {
    throw new Error('无法加载结构化内容 JSON，请检查 public/data/ 目录完整性');
  }

  const [catalog, knowledgeGraph, unitsBundle] = (await Promise.all([
    catalogRes.json(),
    kgRes.json(),
    sampleUnitsRes.json(),
  ])) as [CatalogManifest, KnowledgeGraphManifest, UnitsBundle];

  return {
    catalog,
    knowledgeGraph,
    units: unitsBundle.units,
  };
}
