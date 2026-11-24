# IMPLEMENTATION_PLAN.md · 现代必备生存指南实现计划（已确认定稿）

## 一、已批准技术选型（4 项均采用方案 A）

1. **前端技术栈与构建形态**：`Vite + TypeScript + Preact + 原生 CSS Variables`，构建产物为纯静态 `dist/`，零重型 UI 库，编译期强校验七分支结构与合规红线。
2. **全量留痕存储与状态墙同步**：`IndexedDB` 为主存储 + 一键 JSON 导入/导出备份 + `BroadcastChannel` 同机跨标签毫秒级同步 + 可选只读拉取服务器 `content/sync` 现成数据的轻量适配器。
3. **代码精确图与技能树渲染**：参数化语义 SVG 组件库（曲线对比、流程图、二维象限、三维坐标示意模板 + `eudaimonia` 七分支有机技能树 SVG）。
4. **Scrapling 资源整合管线**：离线构建期脚本按白名单抓取公开权威资源，固化 `sourceUrl`、`fetchedAt`、`reviewAfter`，输出 `public/data/*.json` 与 `public/data/content-gaps.json` 缺口清单。

---

## 二、核心目录结构

```text
.
├── DESIGN.md                        # 双场域视觉规范（温暖日常风 + 1080P 深底状态墙）
├── ROADMAP.md                       # M1–M10 单轮模块计划与验收标准
├── IMPLEMENTATION_PLAN.md           # 本实现计划定稿
├── package.json                     # Vite + Preact + TypeScript 与内容校验脚本
├── scripts/
│   ├── validate_content.mjs         # JSON Schema、图文必填、出处与时效红线校验器
│   └── fetch_resources.py           # (M8 实装) Scrapling 白名单抓取与缺口清单生成脚本
├── public/
│   └── data/
│       ├── catalog.json             # 七分支总目录（含 B1 AI 五层 + 软件五包结构）
│       ├── knowledge-graph.json     # 跨分支概念节点与关联边
│       ├── wall-config.json         # 状态墙六宫格配置与外部 content/sync 端点配置
│       ├── content-gaps.json        # 公开资源未抓到/受限缺口清单
│       └── units/                   # 各分支结构化学习单元 JSON
└── src/
    ├── types/schema.ts              # 内容、知识图谱、行为留痕与状态墙完整类型
    ├── core/db.ts                   # IndexedDB 留痕引擎、JSON 备份、BroadcastChannel、sync 适配器
    ├── styles/                      # 站内温暖生活风与 1080P 深底状态墙双套样式 Token
    ├── components/                  # 精确 SVG 图、合规徽章、技能树组件（M3–M6 逐步挂载）
    └── views/                       # 今天首页、分支路径、7步单元、任务池、实验室、状态墙（M2–M7 逐步挂载）
```

---

## 三、数据模型与核心机制要点

1. **内容与程序彻底分离**：页面组件不包含任何硬编码课程正文或题目；全部学习单元通过 `public/data/catalog.json`、`knowledge-graph.json` 与 `units/*.json` 驱动。
2. **7 步单元流水线与合规红线**：
   - 统一走 `生活场景开场 → 先预测 → 图文导学 → 概念卡 → 自测 → 行动任务 → 完成过关（自测达标 + 行动完成）`。
   - 每个单元强制携带 `visuals`（原图标图源 / 参数化精确 SVG 图 / 明确说明无图原因）；财经、健康、法律类携带 `reviewAfter` 到期自动标「待复核」；心理类携带实验溯源卡与求助边界提示。
3. **三时段精力调度与温和习惯保持**：
   - 「今天」首页按 **早间/碎片**（每日一招 + 闪卡 + 导读）、**晚饭后·实验前高精力**（核心新知/难点 + 行动推进）、**实验后低精力**（1/3/7 天错题重测 + 轻温习）跨分支混排；当日快照做完即停、隔日不补账，支持一键切换「状态差保底版」，断更不清零。
4. **1080P 状态墙主次设计（M5 重点约束）**：
   - `#/wall` **默认主视图固定为全站六宫格个人状态墙**（今日块 + 倒计时块 + 学习块实装，生活/内容/状态块留位），学习仅占其中一块；
   - **B1 专项数字看板**（五层路径总进度、当前层级与产出完成度、各层掌握度、AI 能力线 vs 软件技能线投入时长对照、连续学习天数、今日流程完成度）**作为二级切换视图提供**，绝不喧宾夺主；
   - 留痕从 `M1` 起即落盘 IndexedDB，初始无真数据时展示 `DEMO` 示例跑通数据，攒起真实留痕后自动平滑转实（`LIVE`）。
