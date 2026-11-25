import { useEffect, useMemo, useState } from 'preact/hooks';
import type { UnitVisual } from '../types/schema';
import { IconArrowLeft, IconArrowRight, IconPause, IconPlay, IconReplay } from './Icons';

interface ExactDiagramProps {
  spec: NonNullable<UnitVisual['svgSpec']>;
  caption?: string;
  activeStep?: number;
  onStepChange?: (stepIndex: number) => void;
  compact?: boolean;
}

interface BucketItem {
  name: string;
  ratio: number;
}

interface CurveSeries {
  label: string;
  points: number[];
}

interface StepNarration {
  tag: string;
  text: string;
}

/** 将中英文混排标签按视觉宽度拆成 1–3 行，彻底杜绝任何省略号截断 */
function wrapSvgLines(label: string, maxUnitsPerLine = 11, maxLines = 3): string[] {
  const clean = label.trim();
  if (!clean) return [''];
  // 优先按英文尖括号/冒号/括号边界拆行，语义更自然
  const tagSplit = clean.match(/^(<[a-zA-Z0-9_-]+>)(.+)$/);
  if (tagSplit) {
    return [tagSplit[1], ...wrapSvgLines(tagSplit[2], maxUnitsPerLine, maxLines - 1)].slice(
      0,
      maxLines
    );
  }
  const colonIdx = clean.indexOf('：');
  if (colonIdx > 0 && colonIdx <= 8 && clean.length > maxUnitsPerLine) {
    return [
      clean.slice(0, colonIdx + 1),
      ...wrapSvgLines(clean.slice(colonIdx + 1), maxUnitsPerLine, maxLines - 1),
    ].slice(0, maxLines);
  }

  const lines: string[] = [];
  let cur = '';
  let units = 0;
  for (const ch of clean) {
    const w = /[\x00-\xff]/.test(ch) ? 0.58 : 1;
    if (units + w > maxUnitsPerLine && cur.length > 0 && lines.length < maxLines - 1) {
      lines.push(cur);
      cur = ch;
      units = w;
    } else {
      cur += ch;
      units += w;
    }
  }
  if (cur) lines.push(cur);
  // 防止标点孤字（如单独一个右括号 "）"）独占一行
  if (lines.length >= 2 && /^[）)】，。、；：]$/.test(lines[lines.length - 1])) {
    lines[lines.length - 2] += lines.pop();
  }
  return lines;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Swiss Motion Explainer Engine（瑞士纸墨分步逻辑动图引擎）
 * 完全复用现有 svgSpec 数据结构，为全部 5 类知识模型生成：
 * - 无文字截断的自适应矢量画布
 * - 分步高亮 / 路径描线 / 信号粒子流动 / 差值标注动效
 * - 可控播放 HUD（播放/暂停/单步/时间轴/重播）与同步单句逻辑解说
 */
export function ExactDiagram({
  spec,
  caption,
  activeStep,
  onStepChange,
  compact = false,
}: ExactDiagramProps) {
  const { template, data } = spec;

  const { totalSteps, narrations } = useMemo((): {
    totalSteps: number;
    narrations: StepNarration[];
  } => {
    if (template === 'flow_pipeline') {
      const steps = Array.isArray(data.steps)
        ? (data.steps as string[]).slice(0, 5)
        : ['输入材料', '结构处理', '核查输出'];
      return {
        totalSteps: steps.length,
        narrations: steps.map((s, idx) => ({
          tag: `STEP 0${idx + 1}`,
          text:
            idx === 0
              ? `起点入流：先完成「${s}」，为后续推理与处理锁死稳定边界。`
              : idx === steps.length - 1
                ? `闭环落地：收口至「${s}」，确保最终产出可复现、可核验。`
                : `逻辑推进：承接上一步信号进入「${s}」，把中间状态显性化隔离。`,
        })),
      };
    }

    if (template === 'tree_breakdown') {
      const buckets: BucketItem[] = Array.isArray(data.buckets)
        ? (data.buckets as BucketItem[])
        : [
            { name: '分项 A', ratio: 50 },
            { name: '分项 B', ratio: 30 },
            { name: '分项 C', ratio: 20 },
          ];
      return {
        totalSteps: buckets.length + 1,
        narrations: [
          {
            tag: '全景分流',
            text: `先看总体拆解结构：把全盘拆成 ${buckets.length} 块独立职责区，各归其位互不混用。`,
          },
          ...buckets.map((b, idx) => ({
            tag: `分流 0${idx + 1}`,
            text: `「${b.name}」对应占比/权重 ${b.ratio}% —— 到账或建模时按既定规则直接隔离到位。`,
          })),
        ],
      };
    }

    if (template === 'curve_compare') {
      const seriesList: CurveSeries[] = Array.isArray(data.series)
        ? (data.series as CurveSeries[])
        : [
            { label: '科学策略曲线', points: [55, 78, 90, 96, 99] },
            { label: '直觉盲目曲线', points: [45, 42, 48, 52, 50] },
          ];
      const s0 = seriesList[0];
      const s1 = seriesList[1];
      const lastDiff =
        s0 && s1
          ? Math.abs(
              (s0.points[s0.points.length - 1] ?? 0) -
                (s1.points[s1.points.length - 1] ?? 0)
            )
          : 0;
      return {
        totalSteps: 4,
        narrations: [
          {
            tag: '基准起点',
            text: '第 1 步建立坐标参照轴：两条路径从相近起点出发，初期差异尚未完全显露。',
          },
          {
            tag: '策略展开',
            text: `第 2 步追踪主曲线「${s0?.label ?? '策略 A'}」：建立机制与纪律后，走势稳定可控。`,
          },
          {
            tag: '对照反差',
            text: `第 3 步叠加「${s1?.label ?? '对照 B'}」：缺乏边界约束时，波动失控或衰减明显加剧。`,
          },
          {
            tag: '终局差距',
            text: `第 4 步定格终态差值（Δ ${Math.round(lastDiff)} 个刻度）：长期复利与机制护城河在此彻底拉开。`,
          },
        ],
      };
    }

    if (template === 'two_axis_matrix') {
      const quads = Array.isArray(data.quadrants)
        ? (data.quadrants as string[])
        : ['象限一', '象限二', '象限三', '象限四'];
      return {
        totalSteps: 5,
        narrations: [
          {
            tag: '二维标尺',
            text: `先立起横纵双轴标尺：同时衡量「${String(data.xAxis ?? '横轴维度').replace(/→/g, '').trim()}」与「${String(data.yAxis ?? '纵轴维度').replace(/↑/g, '').trim()}」，不做单维拍脑袋判断。`,
          },
          { tag: '左上象限', text: `定位左上区：${quads[0] ?? ''}。` },
          { tag: '右上高危/关键', text: `盯紧右上关键区：${quads[1] ?? ''}。` },
          { tag: '左下基础区', text: `处理左下低阻区：${quads[2] ?? ''}。` },
          { tag: '右下止损/守底', text: `明确右下边界区：${quads[3] ?? ''}——四区各配其策，彻底清晰。` },
        ],
      };
    }

    // coordinate_3d
    return {
      totalSteps: 4,
      narrations: [
        {
          tag: '三维基底',
          text: 'Blender 采用右手三维坐标系（+Z 垂直向上、+X 水平向右、+Y 纵深向内），所有物体位置都锚定在此空间内。',
        },
        {
          tag: '局部顶点',
          text: '网格内部保存的是局部坐标 v.co，尚未包含物体在场景中的平移、旋转与缩放变换。',
        },
        {
          tag: '矩阵映射',
          text: '用 4×4 齐次矩阵左乘局部顶点：world_pos = obj.matrix_world @ v.co，一步算清全局世界坐标。',
        },
        {
          tag: '.copy() 隔离',
          text: '派生新坐标前先调 obj.location.copy() 断开底层活引用：原始基准球稳停原地，派生新球独立平移。',
        },
      ],
    };
  }, [template, data]);

  const [internalStep, setInternalStep] = useState<number>(() =>
    prefersReducedMotion() ? totalSteps - 1 : 0
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(() => !prefersReducedMotion());

  const currentStep =
    activeStep !== undefined
      ? Math.max(0, Math.min(totalSteps - 1, activeStep))
      : internalStep;

  const setStepSafe = (next: number) => {
    const clamped = ((next % totalSteps) + totalSteps) % totalSteps;
    setInternalStep(clamped);
    onStepChange?.(clamped);
  };

  useEffect(() => {
    if (activeStep !== undefined) {
      setInternalStep(Math.max(0, Math.min(totalSteps - 1, activeStep)));
    }
  }, [activeStep, totalSteps]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      setInternalStep((prev) => {
        if (prev >= totalSteps - 1) {
          // 遵循 cathrynlavery/diagram-design 的 reveal-to-complete 契约：演进至完整终态自动收口定格，避免无限闪烁干扰阅读正文；点击「播放/重播」可再次从头演进
          setIsPlaying(false);
          return totalSteps - 1;
        }
        return prev + 1;
      });
    }, 2200);
    return () => window.clearInterval(id);
  }, [isPlaying, totalSteps]);

  const renderSvgStage = () => {
    // 1. FLOW PIPELINE (路径描线 + 信号粒子 + 多行零截断节点)
    if (template === 'flow_pipeline') {
      const steps = Array.isArray(data.steps)
        ? (data.steps as string[]).slice(0, 5)
        : ['输入材料', '结构处理', '核查输出'];
      const count = steps.length;
      const boxW = count <= 4 ? 148 : 124;
      const gap = count <= 4 ? 30 : 22;
      const padX = 24;
      const totalW = count * boxW + (count - 1) * gap + padX * 2;
      const centerXs = steps.map((_, idx) => padX + idx * (boxW + gap) + boxW / 2);
      const tokenX = centerXs[Math.min(currentStep, centerXs.length - 1)] ?? centerXs[0];

      return (
        <svg
          viewBox={`0 0 ${totalW} 182`}
          class="exact-svg motion-stage-svg"
          role="img"
          aria-label="流程分步逻辑动图"
        >
          {/* 顶部轨道导轨与滑动信号粒子 */}
          <line
            x1={centerXs[0]}
            y1="26"
            x2={centerXs[centerXs.length - 1]}
            y2="26"
            stroke="rgba(24,24,22,0.12)"
            stroke-width="2"
            stroke-dasharray="4 4"
          />
          <line
            x1={centerXs[0]}
            y1="26"
            x2={tokenX}
            y2="26"
            stroke="#D94F30"
            stroke-width="2.5"
            class="motion-rail-fill"
          />
          <g class="motion-token-dot" style={{ transform: `translateX(${tokenX - centerXs[0]}px)` }}>
            <circle cx={centerXs[0]} cy="26" r="10" fill="rgba(217,79,48,0.18)" />
            <circle cx={centerXs[0]} cy="26" r="5" fill="#D94F30" />
          </g>

          {steps.map((stepLabel, idx) => {
            const x = padX + idx * (boxW + gap);
            const isActive = idx === currentStep;
            const isPassed = idx < currentStep;
            const lines = wrapSvgLines(stepLabel, count <= 4 ? 10 : 8, 3);
            const startY = lines.length === 1 ? 116 : lines.length === 2 ? 105 : 96;

            return (
              <g
                key={idx}
                class="motion-node-group"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setIsPlaying(false);
                  setStepSafe(idx);
                }}
              >
                <rect
                  x={x}
                  y="52"
                  width={boxW}
                  height="104"
                  rx="10"
                  fill={isActive ? '#FFF9F7' : '#FFFFFF'}
                  stroke={
                    isActive
                      ? '#D94F30'
                      : isPassed
                        ? '#1F7A5A'
                        : 'rgba(24,24,22,0.16)'
                  }
                  stroke-width={isActive ? 2.2 : 1.4}
                  opacity={isActive || isPassed ? 1 : 0.58}
                  class="motion-node-rect"
                />
                {/* 序号角标 */}
                <rect
                  x={x + 12}
                  y="64"
                  width="54"
                  height="18"
                  rx="4"
                  fill={isActive ? '#D94F30' : isPassed ? '#1F7A5A' : '#EFEFEA'}
                />
                <text
                  x={x + 39}
                  y="76"
                  text-anchor="middle"
                  font-size="10"
                  font-weight="700"
                  font-family="JetBrains Mono, monospace"
                  fill={isActive || isPassed ? '#FFFFFF' : '#52524C'}
                >
                  STEP 0{idx + 1}
                </text>

                {/* 多行完整标签（绝不截断） */}
                <text
                  x={x + boxW / 2}
                  y={startY}
                  text-anchor="middle"
                  font-size="13"
                  font-weight="600"
                  fill={isActive ? '#181816' : '#2B2B28'}
                >
                  {lines.map((ln, lIdx) => (
                    <tspan key={lIdx} x={x + boxW / 2} dy={lIdx === 0 ? 0 : 18}>
                      {ln}
                    </tspan>
                  ))}
                </text>

                {/* 节点间连线 + 描线动画 */}
                {idx < count - 1 && (
                  <g>
                    <path
                      d={`M ${x + boxW + 2} 104 H ${x + boxW + gap - 7}`}
                      fill="none"
                      stroke="rgba(24,24,22,0.14)"
                      stroke-width="2"
                    />
                    <path
                      d={`M ${x + boxW + 2} 104 H ${x + boxW + gap - 7}`}
                      fill="none"
                      stroke={currentStep === idx + 1 ? '#D94F30' : '#1F7A5A'}
                      stroke-width="2.2"
                      pathLength={1}
                      stroke-dasharray="1"
                      stroke-dashoffset={currentStep > idx ? 0 : 1}
                      class="motion-edge-draw"
                    />
                    <polygon
                      points={`${x + boxW + gap - 9},99 ${x + boxW + gap - 1},104 ${
                        x + boxW + gap - 9
                      },109`}
                      fill={
                        currentStep > idx
                          ? currentStep === idx + 1
                            ? '#D94F30'
                            : '#1F7A5A'
                          : 'rgba(24,24,22,0.22)'
                      }
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      );
    }

    // 2. TREE BREAKDOWN (顶层源头分流 + 柱条生长 + 焦点桶高亮)
    if (template === 'tree_breakdown') {
      const buckets: BucketItem[] = Array.isArray(data.buckets)
        ? (data.buckets as BucketItem[])
        : [
            { name: '分项 A', ratio: 50 },
            { name: '分项 B', ratio: 30 },
            { name: '分项 C', ratio: 20 },
          ];
      const palette = ['#266D7E', '#A46B1E', '#1F7A5A', '#445C84'];
      const rowH = 44;
      const svgH = 44 + buckets.length * rowH + 16;

      return (
        <svg
          viewBox={`0 0 640 ${svgH}`}
          class="exact-svg motion-stage-svg"
          role="img"
          aria-label="比例分流分步动图"
        >
          {/* 顶部总汇入刻度栏 */}
          <text x="20" y="24" font-size="11" font-family="JetBrains Mono, monospace" font-weight="600" fill="#73736B">
            ALLOCATION / STRUCTURE BREAKDOWN
          </text>
          <line x1="20" y1="34" x2="620" y2="34" stroke="rgba(24,24,22,0.10)" stroke-width="1" />

          {buckets.map((b, idx) => {
            const y = 48 + idx * rowH;
            const isOverview = currentStep === 0;
            const isFocus = currentStep === idx + 1;
            const isRevealed = isOverview || currentStep >= idx + 1;
            const barMax = 330;
            const targetW = Math.max(20, Math.round((Math.min(100, b.ratio) / 100) * barMax));
            const color = isFocus ? '#D94F30' : palette[idx % palette.length];

            return (
              <g
                key={b.name}
                style={{ cursor: 'pointer' }}
                opacity={isOverview || isFocus ? 1 : isRevealed ? 0.85 : 0.35}
                onClick={() => {
                  setIsPlaying(false);
                  setStepSafe(idx + 1);
                }}
              >
                {isFocus && (
                  <rect
                    x="12"
                    y={y - 6}
                    width="616"
                    height="36"
                    rx="8"
                    fill="rgba(217,79,48,0.07)"
                    stroke="rgba(217,79,48,0.28)"
                    stroke-width="1"
                  />
                )}
                <circle cx="28" cy={y + 12} r="4.5" fill={color} />
                <text x="42" y={y + 16} font-size="13" font-weight={isFocus ? '700' : '600'} fill="#181816">
                  {b.name}
                </text>
                <rect x="218" y={y + 2} width={barMax} height="20" rx="5" fill="#EFEFEA" />
                <rect
                  x="218"
                  y={y + 2}
                  width={isRevealed ? targetW : 6}
                  height="20"
                  rx="5"
                  fill={color}
                  class="motion-bar-grow"
                />
                <text
                  x="564"
                  y={y + 17}
                  font-size="14"
                  font-family="JetBrains Mono, monospace"
                  font-weight="700"
                  fill={isFocus ? '#D94F30' : '#181816'}
                >
                  {b.ratio}%
                </text>
              </g>
            );
          })}
        </svg>
      );
    }

    // 3. CURVE COMPARE (双线依次描线绘制 + 终态差值 Dimension Callout)
    if (template === 'curve_compare') {
      const seriesList: CurveSeries[] = Array.isArray(data.series)
        ? (data.series as CurveSeries[])
        : [
            { label: '策略曲线', points: [55, 78, 90, 96, 99] },
            { label: '对照曲线', points: [45, 42, 48, 52, 50] },
          ];
      const colors = ['#1F7A5A', '#D94F30', '#266D7E'];

      const toCoords = (pts: number[]) =>
        pts.map((val, idx) => ({
          x: 56 + (idx / Math.max(1, pts.length - 1)) * 476,
          y: 168 - (Math.max(0, Math.min(100, val)) / 100) * 116,
          val,
        }));

      const toPathD = (coords: Array<{ x: number; y: number }>) =>
        coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

      const c0 = seriesList[0] ? toCoords(seriesList[0].points) : [];
      const c1 = seriesList[1] ? toCoords(seriesList[1].points) : [];
      const end0 = c0[c0.length - 1];
      const end1 = c1[c1.length - 1];

      return (
        <svg viewBox="0 0 640 206" class="exact-svg motion-stage-svg" role="img" aria-label="双线趋势对比动图">
          {/* 轻量横向发丝参考线 */}
          {[52, 90, 128, 168].map((gy, i) => (
            <g key={gy}>
              <line
                x1="56"
                y1={gy}
                x2="544"
                y2={gy}
                stroke={i === 3 ? 'rgba(24,24,22,0.28)' : 'rgba(24,24,22,0.08)'}
                stroke-width={i === 3 ? 1.4 : 1}
              />
              <text x="46" y={gy + 4} text-anchor="end" font-size="10" font-family="JetBrains Mono, monospace" fill="#73736B">
                {[100, 67, 33, 0][i]}
              </text>
            </g>
          ))}
          <line x1="56" y1="44" x2="56" y2="168" stroke="rgba(24,24,22,0.28)" stroke-width="1.4" />

          {/* 图例（顶排独立放置，永不重叠） */}
          {seriesList.map((s, idx) => (
            <g key={s.label} transform={`translate(${56 + idx * 270}, 16)`}>
              <rect x="0" y="0" width="14" height="4" rx="2" fill={colors[idx % colors.length]} />
              <text x="20" y="6" font-size="12" font-weight="600" fill="#181816">
                {s.label}
              </text>
            </g>
          ))}

          {/* 曲线描线 */}
          {seriesList.map((s, idx) => {
            const coords = toCoords(s.points);
            const stroke = colors[idx % colors.length];
            const visible =
              idx === 0 ? currentStep >= 1 : currentStep >= 2;
            return (
              <g key={s.label}>
                <path
                  d={toPathD(coords)}
                  fill="none"
                  stroke={stroke}
                  stroke-width={idx === 0 ? 3 : 2.4}
                  stroke-dasharray={idx === 1 ? '6 4' : undefined}
                  pathLength={1}
                  style={{
                    strokeDasharray: idx === 1 && visible ? '6 4' : '1',
                    strokeDashoffset: visible ? 0 : 1,
                    transition: 'stroke-dashoffset 650ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
                {visible &&
                  coords.map((pt, pIdx) => (
                    <circle
                      key={pIdx}
                      cx={pt.x}
                      cy={pt.y}
                      r={pIdx === coords.length - 1 ? 4.5 : 3}
                      fill="#FFFFFF"
                      stroke={stroke}
                      stroke-width="2"
                    />
                  ))}
              </g>
            );
          })}

          {/* 终态差值 Dimension Callout */}
          {currentStep >= 3 && end0 && end1 && (
            <g>
              <line
                x1="556"
                y1={end0.y}
                x2="556"
                y2={end1.y}
                stroke="#D94F30"
                stroke-width="2"
              />
              <line x1="550" y1={end0.y} x2="562" y2={end0.y} stroke="#D94F30" stroke-width="1.8" />
              <line x1="550" y1={end1.y} x2="562" y2={end1.y} stroke="#D94F30" stroke-width="1.8" />
              <rect
                x="568"
                y={(end0.y + end1.y) / 2 - 12}
                width="62"
                height="24"
                rx="6"
                fill="#D94F30"
              />
              <text
                x="599"
                y={(end0.y + end1.y) / 2 + 4}
                text-anchor="middle"
                font-size="11"
                font-family="JetBrains Mono, monospace"
                font-weight="700"
                fill="#FFFFFF"
              >
                Δ {Math.round(Math.abs(end0.val - end1.val))}
              </text>
            </g>
          )}
        </svg>
      );
    }

    // 4. TWO AXIS MATRIX (双轴展开 + 四象限分步高亮 + 多行零截断)
    if (template === 'two_axis_matrix') {
      const xLabel = typeof data.xAxis === 'string' ? data.xAxis : '横轴维度 →';
      const yLabel = typeof data.yAxis === 'string' ? data.yAxis : '↑ 纵轴维度';
      const quads = Array.isArray(data.quadrants)
        ? (data.quadrants as string[])
        : ['象限一', '象限二', '象限三', '象限四'];

      const boxes = [
        { x: 64, y: 34, tone: '#266D7E', bg: '#F4F9FA' },
        { x: 334, y: 34, tone: '#D94F30', bg: '#FFF7F5' },
        { x: 64, y: 124, tone: '#1F7A5A', bg: '#F2F9F5' },
        { x: 334, y: 124, tone: '#A46B1E', bg: '#FDF9F0' },
      ];

      return (
        <svg viewBox="0 0 640 240" class="exact-svg motion-stage-svg" role="img" aria-label="二维象限分步决策矩阵">
          {/* 轴线 */}
          <line x1="48" y1="26" x2="48" y2="212" stroke="#181816" stroke-width="1.5" />
          <line x1="48" y1="212" x2="606" y2="212" stroke="#181816" stroke-width="1.5" />
          <text x="58" y="20" font-size="12" font-weight="600" fill="#52524C">
            {yLabel}
          </text>
          <text x="606" y="232" text-anchor="end" font-size="12" font-weight="600" fill="#52524C">
            {xLabel}
          </text>

          {boxes.map((box, idx) => {
            const isOverview = currentStep === 0;
            const isFocus = currentStep === idx + 1;
            const lines = wrapSvgLines(quads[idx] ?? '', 16, 3);
            const textStartY = box.y + (lines.length === 1 ? 45 : lines.length === 2 ? 36 : 28);

            return (
              <g
                key={idx}
                style={{ cursor: 'pointer' }}
                opacity={isOverview ? 0.92 : isFocus ? 1 : 0.42}
                onClick={() => {
                  setIsPlaying(false);
                  setStepSafe(idx + 1);
                }}
              >
                <rect
                  x={box.x}
                  y={box.y}
                  width="256"
                  height="80"
                  rx="10"
                  fill={isFocus ? box.bg : '#FFFFFF'}
                  stroke={isFocus ? box.tone : 'rgba(24,24,22,0.16)'}
                  stroke-width={isFocus ? 2.2 : 1.2}
                  class="motion-node-rect"
                />
                <circle cx={box.x + 16} cy={box.y + 18} r="4" fill={box.tone} />
                <text
                  x={box.x + 132}
                  y={textStartY}
                  text-anchor="middle"
                  font-size="12.5"
                  font-weight={isFocus ? '700' : '500'}
                  fill="#181816"
                >
                  {lines.map((ln, lIdx) => (
                    <tspan key={lIdx} x={box.x + 132} dy={lIdx === 0 ? 0 : 18}>
                      {ln}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      );
    }

    // 5. COORDINATE 3D (Blender bpy 三维空间矩阵变换 + .copy() 隔离演示)
    const showLocal = currentStep >= 1;
    const showTransformed = currentStep >= 2;
    const showCopySafe = currentStep >= 3;

    return (
      <svg viewBox="0 0 640 218" class="exact-svg motion-stage-svg" role="img" aria-label="三维坐标系与矩阵变换分步动图">
        <g transform="translate(150, 150)">
          {/* Z 轴 */}
          <line x1="0" y1="0" x2="0" y2="-112" stroke="#266D7E" stroke-width="2.2" />
          <polygon points="-4,-110 0,-120 4,-110" fill="#266D7E" />
          <text x="10" y="-108" font-size="12" font-family="JetBrains Mono, monospace" font-weight="700" fill="#266D7E">
            +Z (Up)
          </text>
          {/* X 轴 */}
          <line x1="0" y1="0" x2="148" y2="34" stroke="#D94F30" stroke-width="2.2" />
          <polygon points="145,29 156,36 144,38" fill="#D94F30" />
          <text x="162" y="42" font-size="12" font-family="JetBrains Mono, monospace" font-weight="700" fill="#D94F30">
            +X
          </text>
          {/* Y 轴 */}
          <line x1="0" y1="0" x2="110" y2="-56" stroke="#1F7A5A" stroke-width="2.2" />
          <polygon points="105,-59 117,-60 110,-51" fill="#1F7A5A" />
          <text x="122" y="-56" font-size="12" font-family="JetBrains Mono, monospace" font-weight="700" fill="#1F7A5A">
            +Y
          </text>

          {/* 局部顶点 v.co */}
          {showLocal && (
            <g>
              <circle cx="48" cy="-24" r="11" fill="rgba(31,122,90,0.18)" stroke="#1F7A5A" stroke-width="2" />
              <text x="10" y="-56" font-size="11.5" font-family="JetBrains Mono, monospace" font-weight="600" fill="#1F7A5A">
                ref_obj (v.co)
              </text>
            </g>
          )}

          {/* matrix_world @ v.co 轨迹弧线 */}
          {showTransformed && (
            <g>
              <path
                d="M 59 -28 Q 130 -95 215 -64"
                fill="none"
                stroke="#D94F30"
                stroke-width="2"
                stroke-dasharray="5 4"
              />
              <circle cx="222" cy="-60" r="13" fill="rgba(217,79,48,0.18)" stroke="#D94F30" stroke-width="2.2" />
              <text x="244" y="-64" font-size="12" font-family="JetBrains Mono, monospace" font-weight="700" fill="#181816">
                world_pos
              </text>
              <text x="244" y="-46" font-size="11" font-family="JetBrains Mono, monospace" fill="#52524C">
                matrix_world @ v.co
              </text>
            </g>
          )}

          {/* .copy() 安全隔离对比框 */}
          {showCopySafe && (
            <g transform="translate(245, -18)">
              <rect x="0" y="0" width="218" height="62" rx="8" fill="#F2F9F5" stroke="#1F7A5A" stroke-width="1.5" />
              <text x="12" y="22" font-size="11.5" font-family="JetBrains Mono, monospace" font-weight="700" fill="#1F7A5A">
                pos = obj.location.copy()
              </text>
              <text x="12" y="42" font-size="11.5" fill="#181816">
                ✓ 原基准球稳停原地，派生独立偏移
              </text>
            </g>
          )}
        </g>
      </svg>
    );
  };

  const activeNarration = narrations[Math.min(currentStep, narrations.length - 1)] ?? narrations[0];

  return (
    <div class={`motion-explainer ${compact ? 'is-compact' : ''}`} data-template={template} data-step={currentStep + 1}>
      <div class="motion-stage-header">
        <span class="motion-stage-eyebrow">
          <span class="motion-live-dot" />
          逻辑分步动图演示
        </span>
        {caption && <span class="motion-stage-caption">{caption}</span>}
      </div>

      <div class="motion-canvas">{renderSvgStage()}</div>

      <div class="motion-logic-bar" aria-live="polite">
        <span class="motion-step-chip">
          {currentStep + 1} / {totalSteps} · {activeNarration.tag}
        </span>
        <span class="motion-logic-text">{activeNarration.text}</span>
      </div>

      <div class="motion-hud">
        <div class="motion-hud-left">
          <button
            type="button"
            class="btn-sm motion-play-btn"
            onClick={() => {
              if (!isPlaying && currentStep >= totalSteps - 1) {
                setStepSafe(0);
                setIsPlaying(true);
              } else {
                setIsPlaying((p) => !p);
              }
            }}
            aria-label={isPlaying ? '暂停动图推演' : '播放动图推演'}
          >
            {isPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
            <span>{isPlaying ? '暂停' : '播放'}</span>
          </button>
          <button
            type="button"
            class="btn-sm"
            onClick={() => {
              setIsPlaying(false);
              setStepSafe(currentStep - 1);
            }}
            aria-label="上一步"
          >
            <IconArrowLeft size={14} />
            <span>上一步</span>
          </button>
          <button
            type="button"
            class="btn-sm"
            onClick={() => {
              setIsPlaying(false);
              setStepSafe(currentStep + 1);
            }}
            aria-label="下一步"
          >
            <span>下一步</span>
            <IconArrowRight size={14} />
          </button>
          <button
            type="button"
            class="btn-sm"
            onClick={() => {
              setStepSafe(0);
              setIsPlaying(true);
            }}
            aria-label="重播动图"
          >
            <IconReplay size={14} />
            <span>重播</span>
          </button>
        </div>

        <div class="motion-step-dots" role="tablist" aria-label="动图步骤切换">
          {narrations.map((n, idx) => (
            <button
              key={n.tag + idx}
              type="button"
              role="tab"
              aria-selected={idx === currentStep}
              class={`motion-step-dot ${
                idx === currentStep ? 'is-active' : idx < currentStep ? 'is-done' : ''
              }`}
              onClick={() => {
                setIsPlaying(false);
                setStepSafe(idx);
              }}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
