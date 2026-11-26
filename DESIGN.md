---
name: modern-survival-guide-v3
version: "3.0.0"
stack: "React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS v4 + shadcn/ui (Radix UI) + Motion + cmdk + Sonner + Lucide"
aesthetic: "Midnight Obsidian × Electric Cobalt (Dark Default) + Crisp Porcelain Blueprint (Light Toggle) + heydamir/unslop Craft Discipline"
colors:
  dark:
    bg: "#0b0d12"
    bg-deep: "#080a0e"
    surface: "#121620"
    surface-raised: "#191f2d"
    ink-1: "#eef0f5"
    ink-2: "#a3a9b8"
    ink-3: "#7d8597"
    accent: "#3b82f6"
    growth: "#34d399"
    warning: "#f0b35a"
    danger: "#f07167"
  light:
    bg: "#f5f7fa"
    surface: "#ffffff"
    surface-raised: "#f0f3f8"
    ink-1: "#111827"
    ink-2: "#4b5565"
    ink-3: "#647084"
    accent: "#2563eb"
    growth: "#15803d"
    warning: "#b45309"
    danger: "#dc2626"
---

# DESIGN.md · 现代必备生存指南 v3.0 架构、美学与全量内容规范

## 1. v3.0 底层技术基底与设计方向

- **现代前端组件基底**：由旧版 `Preact 10 + 4000 行手写 CSS` 彻底迁移为 **`React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS v4 (@tailwindcss/vite) + shadcn/ui（Radix Dialog / Popover）+ Lucide React + Motion + cmdk (⌘K) + Sonner`**，100% 保留纯 TypeScript 核心逻辑层（`src/core/**`）与离线优先 IndexedDB 留痕引擎。
- **核心视觉风格（v3.0 双主题精密学习舱）**：
  - **默认暗色（Midnight Obsidian × Electric Cobalt）**：深炭黑画布 `#0b0d12`、清晰分层面板 `#121620` / `#191f2d`、`8.5%` 静默发丝线描边、信号钴蓝 `#3b82f6` 主交互色与翡翠绿 `#34d399` 过关色。
  - **一键浅色（Crisp Porcelain Blueprint）**：冰蓝宣白 `#f5f7fa` + 纯白表面 `#ffffff` + `#2563eb` 蓝图主色，持久化至 `localStorage`（`msg-theme-v3`）并在 `index.html` 首帧零闪烁注入。
- **`heydamir/unslop` 去模板化精工纪律（9 项硬约束）**：
  1. 零霓虹/彩色发光盒阴影、零渐变字、零渐变品牌块；
  2. 零装饰性光斑与非实时数据的脉冲圆点；
  3. 严格 `4px` 空间节奏与 `8.5%` 静默发丝描边；
  4. 克制字重（`400 / 500 / 600`），禁用吼叫式 `800–900` 粗黑大字；
  5. 去除问候寒暄套话、感叹号堆砌与短标签末尾句号；
  6. 动态数字、进度百分比与步骤序号全局启用 `tabular-nums` + `JetBrains Mono`；
  7. 全站统一 `lucide-react` `1.5px` 线性图标，禁用 Emoji UI 图标；
  8. 单一平滑缓动曲线 `cubic-bezier(0.22, 1, 0.36, 1)`，全局尊重 `prefers-reduced-motion`；
  9. 完整四态 UI（`Skeleton` 骨架屏加载态 / 清晰空态 / 错误重试态 / 正常数据态）+ 无障碍键盘支持（Skip-link、`⌘K`、`Esc`、动图 `←/→`、闪卡 `Space` + `1/2/3`）。

## 2. 核心页面与信息架构升级

1. **移除「保底版 / 保底模式」UI**：首页聚焦固定上限、做完即停的三时段节律，不再出现「保底模式」切换开关或豁免标签。
2. **悬浮顶部精密导航 Dock（`56px`）**：桌面居中 5 项一级导航带 `motion.span layoutId="dock-active-pill"` 滑轨 + 右侧 `⌘K` 全局快速搜索 + 一键明暗主题切换 + `1080P 状态墙` 直达；移动端底部 5 项固定 Dock（热区 `≥44px`），进入学习单元自动隐藏。
3. **首页（`#/`）**：`60 / 40` 非对称主线 Hero（左当前焦点任务与七步路径预览 + 右三时段交互节律切换台）+ 底部三列均衡信息带（每日 20 秒一招 + 1/3/7 天间隔重测入口 + 14 日活跃点亮矩阵）。
4. **七分支技能星图（`#/branches`）**：全新径向星图矢量组件 `SkillAtlasSvg`（7 节点等距轨道 + 中心点亮总枢 + 外圈完成度环，零碰撞零发光）+ 七分支列表联动；B1 双轨分段切换，L2–L5 锁定阶段默认折叠为单行路线图，软件技能分包 S2–S5 强制 `items-start` 杜绝空白拉伸。
5. **互动学习单元（`#/unit/:id`）**：第 3 步升级为 **桌面 55% 左吸顶互动沙盒实验室 + 45% 右精排原理导学双栏**（为 `50/30/20` 预算模型内置真实可拖拽月收入滑块实时算额与 6 个月防火墙目标；为 Blender 3D 变换内置 X 轴偏移交互滑块；Radix `Popover` 术语释义卡片）；第 4 步升级为真实 **3D `rotateY(180deg)` 弹性翻卡舞台**。
6. **1080P 个人状态墙（`#/wall` & `#/wall?sub=b1`）**：严格保留默认六宫格主视图 + B1 专项二级切换与 `>960px` 一屏零滚动铁律（`100vw × 100vh; overflow: hidden`），WCAG AAA 高对比度。

## 3. 全七分支权威内容填充（28 节零占位正式单元）

全站已实现 **7 大分支、16 条路径/软件分包 100% 正式内容覆盖（0 空槽、0 占位）**：
- **B1 AI 与软件（15 节）**：AI L1（4 节）+ AI L2 NumPy/Pandas（1 节）+ AI L3 过拟合与防泄漏（1 节）+ AI L4 Transformer/RAG（1 节）+ AI L5 论文精读与迁移（1 节）；软件分包 S1 Blender bpy（3 节）+ S2 Office 样式与透视表（1 节）+ S3 Git 分支与 reflog（1 节）+ S4 Obsidian 双链原子笔记（1 节）+ S5 剪辑与 FFmpeg 流水线（1 节）。
- **B2 财经（3 节）**：三桶预算、保险常识、基金阶梯与期限匹配（全部标注 `reviewAfter` 与非投顾免责声明）。
- **B3 心理（2 节）**：情绪认知重评、认知偏误与决策（附经典实验溯源卡与 12356 专业求助边界）。
- **B4 健康（2 节）**：科学睡眠双过程节律、WHO 150 分钟跑步防伤与久坐自救（标注权威来源与 `reviewAfter`）。
- **B5 表达与职业（2 节）**：结论先行结构化写作与汇报、STAR 量化简历与作品集。
- **B6 学习与精力（2 节）**：主动提取与 1/3/7 间隔重测（附 Roediger-Karpicke & Dunlosky 溯源卡）、费曼零术语输出与三时段精力匹配。
- **B7 生活常识与自保（2 节）**：民法典租房与实习合同四步避坑、数字账号 2FA 防诈与黄金 4 分钟 CPR/AED（标注 `reviewAfter`）。
- **配套全站图谱资产**：**30 个跨分支互链知识图谱概念卡**、**10 条覆盖全部七分支的每日生活一招**、**3 个跨分支生活事件包**、**4 份可复用工具箱清单**与 **4 份人生节点预备包**。

## 4. 五层自动化门禁与 Skill 纪律

- 一键总验收命令：`npm run check:all`（串联 `check:content` → `tsc --noEmit` → `vite build` → `smoke` → `verify:ui`）。
- **Skill 按需使用纪律**：全程未向全局或项目仓库安装任何新 Skill，仅按需消化公开设计规范（`heydamir/unslop`、`anthropics/skills`、`emilkowalski/skills`、`shadcn/ui`、`vercel-labs/agent-skills`、`cathrynlavery/diagram-design`），既有 39 个全局 `mattpocock/skills` 按用户确认的方案 A 保持原状不动。
