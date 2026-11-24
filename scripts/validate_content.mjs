import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'public', 'data');

const REQUIRED_BRANCHES = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];
const VALID_SVG_TEMPLATES = new Set([
  'curve_compare',
  'flow_pipeline',
  'two_axis_matrix',
  'tree_breakdown',
  'coordinate_3d',
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[check:content] 校验失败: ${message}`);
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`[check:content] JSON 解析失败 (${filePath}): ${err.message}`);
  }
}

async function main() {
  const catalogPath = path.join(dataDir, 'catalog.json');
  const kgPath = path.join(dataDir, 'knowledge-graph.json');
  const tipsPath = path.join(dataDir, 'daily-tips.json');
  const eventPacksPath = path.join(dataDir, 'event-packs.json');
  const toolboxPath = path.join(dataDir, 'toolbox-packs.json');
  const gapsPath = path.join(dataDir, 'content-gaps.json');
  const whitelistPath = path.join(rootDir, 'config', 'whitelist.json');
  const unitsDir = path.join(dataDir, 'units');

  const catalog = await readJson(catalogPath);
  assert(Array.isArray(catalog.branches), 'catalog.branches 必须是数组');

  const branchIds = catalog.branches.map((b) => b.id);
  for (const reqId of REQUIRED_BRANCHES) {
    assert(branchIds.includes(reqId), `缺少分支定义: ${reqId}`);
  }

  const trackMap = new Map();
  for (const branch of catalog.branches) {
    assert(typeof branch.name === 'string' && branch.name.length > 0, `${branch.id} 缺少名称`);
    assert(Array.isArray(branch.tracks) && branch.tracks.length > 0, `${branch.id} 至少包含一条路径或分包`);
    for (const track of branch.tracks) {
      assert(!trackMap.has(track.id), `重复的 track.id: ${track.id}`);
      trackMap.set(track.id, { branchId: branch.id, track });
    }
  }

  // 校验 B1 必须包含 AI 五层 + 软件技能分包（含 Blender）
  const b1 = catalog.branches.find((b) => b.id === 'B1');
  const b1AiLayers = b1.tracks.filter((t) => t.kind === 'layered_stage');
  const b1SwPacks = b1.tracks.filter((t) => t.kind === 'software_pack');
  assert(b1AiLayers.length === 5, `B1 AI 能力线必须为 5 层，当前为 ${b1AiLayers.length}`);
  assert(b1SwPacks.some((t) => t.id === 'b1-sw-blender'), 'B1 软件技能线必须包含 b1-sw-blender 包');

  // 校验知识图谱
  const kg = await readJson(kgPath);
  assert(Array.isArray(kg.nodes) && kg.nodes.length > 0, 'knowledge-graph.nodes 不能为空');
  const conceptIds = new Set();
  for (const node of kg.nodes) {
    assert(typeof node.id === 'string' && node.id.length > 0, '概念节点缺少 id');
    assert(!conceptIds.has(node.id), `重复的概念节点 id: ${node.id}`);
    conceptIds.add(node.id);
  }
  for (const node of kg.nodes) {
    for (const preId of node.prerequisites ?? []) {
      assert(conceptIds.has(preId), `概念 ${node.id} 的先修节点不存在: ${preId}`);
    }
    for (const link of node.crossLinks ?? []) {
      assert(conceptIds.has(link.targetId), `概念 ${node.id} 的跨分支关联节点不存在: ${link.targetId}`);
    }
  }

  // 校验所有单元文件及红线约束
  const unitFiles = (await fs.readdir(unitsDir)).filter((f) => f.endsWith('.json'));
  assert(unitFiles.length > 0, 'public/data/units/ 下至少需要一个单元 JSON 文件');

  let totalUnits = 0;
  for (const fileName of unitFiles) {
    const fileData = await readJson(path.join(unitsDir, fileName));
    const units = Array.isArray(fileData.units) ? fileData.units : [];
    for (const unit of units) {
      totalUnits += 1;
      const ctx = `${fileName} -> ${unit.id}`;
      assert(REQUIRED_BRANCHES.includes(unit.branchId), `${ctx}: 非法 branchId`);
      assert(trackMap.has(unit.trackId), `${ctx}: trackId (${unit.trackId}) 未在 catalog.json 注册`);
      assert(typeof unit.isPlaceholder === 'boolean', `${ctx}: 必须显式声明 boolean 类型的 isPlaceholder`);

      // 7 步流水线核心字段检查
      assert(unit.scenarioHook?.story, `${ctx}: 缺少第1步 生活场景开场 story`);
      assert(unit.prediction?.question && Array.isArray(unit.prediction.options), `${ctx}: 缺少第2步 先预测题`);
      assert(Array.isArray(unit.guide?.blocks) && unit.guide.blocks.length > 0, `${ctx}: 缺少第3步 导学正文`);

      // 红线 1：图文结合硬标准
      const visuals = unit.guide?.visuals;
      assert(Array.isArray(visuals) && visuals.length > 0, `${ctx}: 违反图文红线，必须至少包含 1 项 visuals 记录`);
      for (const vis of visuals) {
        if (vis.kind === 'sourced_image') {
          assert(vis.imagePath && vis.imageSourceUrl, `${ctx}: 原图必须提供 imagePath 与 imageSourceUrl`);
        } else if (vis.kind === 'exact_svg') {
          assert(vis.svgSpec && VALID_SVG_TEMPLATES.has(vis.svgSpec.template), `${ctx}: 代码精确图缺少有效 svgSpec.template`);
        } else if (vis.kind === 'no_image_declared') {
          assert(typeof vis.noImageReason === 'string' && vis.noImageReason.trim().length >= 6, `${ctx}: 无图声明必须填写具体原因`);
        } else {
          assert(false, `${ctx}: 未知的 visual.kind (${vis.kind})`);
        }
      }

      // 第 4–6 步字段检查
      assert(Array.isArray(unit.conceptNodeIds) && unit.conceptNodeIds.length > 0, `${ctx}: 缺少关联概念卡节点`);
      for (const cid of unit.conceptNodeIds) {
        assert(conceptIds.has(cid), `${ctx}: 引用了不存在的概念节点 ${cid}`);
      }
      assert(Array.isArray(unit.quiz?.questions) && unit.quiz.questions.length > 0, `${ctx}: 缺少自测题`);
      assert(unit.actionTask?.title && unit.actionTask?.deliverablePrompt, `${ctx}: 缺少行动任务定义`);

      // 红线 2：来源、时效与心理边界检查
      assert(Array.isArray(unit.sources) && unit.sources.length > 0, `${ctx}: 必须标注内容来源 sources`);
      for (const src of unit.sources) {
        assert(src.sourceOrg && src.sourceUrl && src.fetchedAt, `${ctx}: 来源必须包含 sourceOrg / sourceUrl / fetchedAt`);
        if (!unit.isPlaceholder) {
          assert(src.sourceUrl.startsWith('https://'), `${ctx}: 正式内容必须使用真实 https:// 来源链接`);
        }
      }
      if (['B2', 'B4', 'B7'].includes(unit.branchId)) {
        assert(
          unit.sources.some((s) => typeof s.reviewAfter === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.reviewAfter)),
          `${ctx}: 财经/健康/法律分支必须标注 reviewAfter 复核到期日`
        );
      }
      if (unit.branchId === 'B3') {
        assert(
          unit.sources.some((s) => typeof s.helpBoundaryText === 'string' && s.helpBoundaryText.length >= 10),
          `${ctx}: 心理分支必须明确标注求助边界说明 helpBoundaryText`
        );
      }
    }
  }

  // 校验每日生活一招
  const tipsBundle = await readJson(tipsPath);
  assert(Array.isArray(tipsBundle.tips) && tipsBundle.tips.length > 0, 'daily-tips.tips 不能为空');
  for (const tip of tipsBundle.tips) {
    assert(tip.id && REQUIRED_BRANCHES.includes(tip.branchId), `daily-tip ${tip.id} 缺少有效 branchId`);
    assert(tip.title && tip.tipBody, `daily-tip ${tip.id} 缺少标题或正文`);
    assert(typeof tip.isPlaceholder === 'boolean', `daily-tip ${tip.id} 必须声明 isPlaceholder`);
    assert(tip.sourceOrg && tip.sourceUrl && tip.fetchedAt, `daily-tip ${tip.id} 缺少来源元数据`);
  }

  const eventPacks = await readJson(eventPacksPath);
  assert(
    Array.isArray(eventPacks.packs) && eventPacks.packs.length >= 2,
    'event-packs.json 至少需要包含 2 个跨分支生活事件包示例'
  );
  for (const ep of eventPacks.packs) {
    assert(ep.id && ep.title && Array.isArray(ep.modules) && ep.modules.length >= 2, `事件包 ${ep.id} 结构不完整`);
  }

  const toolboxData = await readJson(toolboxPath);
  assert(Array.isArray(toolboxData.toolboxes) && toolboxData.toolboxes.length > 0, 'toolbox-packs 缺少 toolboxes');
  assert(Array.isArray(toolboxData.stagePrepPacks) && toolboxData.stagePrepPacks.length > 0, 'toolbox-packs 缺少 stagePrepPacks');

  // M8：校验白名单配置、缺口清单与已抓取素材元数据
  const whitelist = await readJson(whitelistPath);
  assert(
    Array.isArray(whitelist.allowedDomains) && whitelist.allowedDomains.length > 0,
    'whitelist.allowedDomains 不能为空'
  );
  assert(
    Array.isArray(whitelist.targets) && whitelist.targets.length > 0,
    'whitelist.targets 不能为空'
  );
  const gapsData = await readJson(gapsPath);
  assert(Array.isArray(gapsData.gaps), 'content-gaps.gaps 必须为数组');

  const scrapedPath = path.join(dataDir, 'scraped-sources.json');
  try {
    const scraped = await readJson(scrapedPath);
    assert(Array.isArray(scraped.items), 'scraped-sources.items 必须为数组');
    for (const item of scraped.items) {
      assert(item.sourceUrl && item.sourceOrg && item.fetchedAt, `scraped 条目 ${item.id} 缺少出处或抓取日期`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  console.log(
    `[check:content] 校验通过：${catalog.branches.length} 个分支、${trackMap.size} 条路径/软件分包、${conceptIds.size} 个知识图谱节点、${totalUnits} 个学习单元、${tipsBundle.tips.length} 条每日一招、${eventPacks.packs.length} 个生活事件包全部符合 Schema 与红线规则。`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
