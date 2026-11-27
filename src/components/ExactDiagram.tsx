import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { UnitVisual } from '@/types/schema';

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

/** 兼容字符串与 { label/title, detail } 对象型节点描述，杜绝运行时 .trim() 崩溃 */
function normalizeDiagramLabel(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as { label?: string; title?: string; detail?: string };
    const head = (obj.label ?? obj.title ?? '').trim();
    const tail = (obj.detail ?? '').trim();
    if (head && tail) return `${head}：${tail}`;
    return head || tail;
  }
  return String(raw ?? '');
}

/** 将中英文混排标签按视觉宽度拆成 1–3 行，杜绝任何省略号截断与标点孤字 */
function wrapSvgLines(label: unknown, maxUnitsPerLine = 11, maxLines = 3): string[] {
  const clean = normalizeDiagramLabel(label).trim();
  if (!clean) return [''];
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
 * Interactive Motion & Sandbox Lab v3.0
 * - 完整适配暗夜精密舱 / 冰蓝宣白双主题
 * - 严格零省略号截断、支持点击节点 + 键盘左右方向键切步
 * - reveal-to-complete 自动演示收口机制（尊重 prefers-reduced-motion）
 * - 为 tree_breakdown（50/30/20 预算模型等）内置真实可拖拽交互沙盒滑块
 */
export function ExactDiagram({
  spec,
  caption,
  activeStep,
  onStepChange,
  compact = false,
}: ExactDiagramProps) {
  const { template, data } = spec;

  // 针对百分比分桶模型（如 50/30/20 预算）提供真实交互月入沙盒滑块
  const [sandboxMonthlyIncome, setSandboxMonthlyIncome] = useState<number>(3000);
  // 针对 3D 变换模型提供交互平移偏移滑块
  const [sandboxOffsetX, setSandboxOffsetX] = useState<number>(2.0);

  const bucketsData: BucketItem[] = useMemo(() => {
    if (template !== 'tree_breakdown') return [];
    return Array.isArray(data.buckets)
      ? (data.buckets as BucketItem[])
      : [
          { name: '必需开支', ratio: 50 },
          { name: '弹性愿望', ratio: 30 },
          { name: '储蓄防火墙', ratio: 20 },
        ];
  }, [template, data]);

  const isBudgetSandbox = useMemo(() => {
    if (template !== 'tree_breakdown' || bucketsData.length < 2) return false;
    const sum = bucketsData.reduce((acc, b) => acc + Number(b.ratio || 0), 0);
    const hasFinanceBucket = bucketsData.some((b) => /刚需|储蓄|预算|Needs|Wants/.test(b.name));
    return hasFinanceBucket && sum >= 95 && sum <= 105;
  }, [template, bucketsData]);

  const { totalSteps, narrations } = useMemo((): {
    totalSteps: number;
    narrations: StepNarration[];
  } => {
    if (template === 'flow_pipeline') {
      const steps = Array.isArray(data.steps)
        ? (data.steps as unknown[]).slice(0, 5).map(normalizeDiagramLabel)
        : ['输入材料', '结构处理', '核查输出'];
      return {
        totalSteps: steps.length,
        narrations: steps.map((s, idx) => ({
          tag: `STEP 0${idx + 1}`,
          text:
            idx === 0
              ? `起点入流：先完成「${s}」，为后续处理锁死边界`
              : idx === steps.length - 1
                ? `闭环落地：收口至「${s}」，确保输出可核验、可复用`
                : `逻辑推进：进入「${s}」，将中间状态显性化隔离`,
        })),
      };
    }

    if (template === 'tree_breakdown') {
      return {
        totalSteps: bucketsData.length + 1,
        narrations: [
          {
            tag: '全景分流',
            text: `先看总体拆解结构：把全盘拆成 ${bucketsData.length} 块独立职责区，各归其位互不混用`,
          },
          ...bucketsData.map((b, idx) => ({
            tag: `分流 0${idx + 1}`,
            text: `「${b.name}」对应权重 ${b.ratio}% —— 到账或拆解时按规则直接隔离到位`,
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
            text: '第 1 步建立坐标参照轴：两条路径从相近起点出发，初期差异尚未显露',
          },
          {
            tag: '策略展开',
            text: `第 2 步追踪主曲线「${s0?.label ?? '策略 A'}」：建立规则与纪律后走势稳定可控`,
          },
          {
            tag: '对照反差',
            text: `第 3 步叠加「${s1?.label ?? '对照 B'}」：缺乏边界约束时波动与衰减明显加剧`,
          },
          {
            tag: '终局差距',
            text: `第 4 步定格终态差值（Δ ${Math.round(lastDiff)} 刻度）：长期复利与护城河在此彻底拉开`,
          },
        ],
      };
    }

    if (template === 'two_axis_matrix') {
      const quads = Array.isArray(data.quadrants)
        ? (data.quadrants as unknown[]).map(normalizeDiagramLabel)
        : ['象限一', '象限二', '象限三', '象限四'];
      const xAxisRaw = data.xAxis ?? data.xAxisLabel ?? '横轴维度';
      const yAxisRaw = data.yAxis ?? data.yAxisLabel ?? '纵轴维度';
      return {
        totalSteps: 5,
        narrations: [
          {
            tag: '二维标尺',
            text: `同时衡量「${String(xAxisRaw).replace(/→/g, '').trim()}」与「${String(yAxisRaw).replace(/↑/g, '').trim()}」，避免单维拍脑袋`,
          },
          { tag: '左上象限', text: `左上区：${quads[0] ?? ''}` },
          { tag: '右上关键区', text: `右上关键区：${quads[1] ?? ''}` },
          { tag: '左下基础区', text: `左下基础区：${quads[2] ?? ''}` },
          { tag: '右下守底区', text: `右下守底区：${quads[3] ?? ''}` },
        ],
      };
    }

    return {
      totalSteps: 4,
      narrations: [
        {
          tag: '三维基底',
          text: 'Blender 采用右手三维坐标系（+Z 垂直向上、+X 水平向右、+Y 纵深向内）',
        },
        {
          tag: '局部顶点',
          text: '网格内部保存局部坐标 v.co，尚未叠加物体在场景中的平移、旋转与缩放矩阵',
        },
        {
          tag: '矩阵映射',
          text: '用 4×4 齐次矩阵左乘局部顶点：world_pos = obj.matrix_world @ v.co',
        },
        {
          tag: '.copy() 隔离',
          text: '派生新坐标前调用 obj.location.copy() 断开底层活引用，原基准球稳停原地',
        },
      ],
    };
  }, [template, data, bucketsData]);

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
          setIsPlaying(false);
          return totalSteps - 1;
        }
        return prev + 1;
      });
    }, 2200);
    return () => window.clearInterval(id);
  }, [isPlaying, totalSteps]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setIsPlaying(false);
      setStepSafe(currentStep - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setIsPlaying(false);
      setStepSafe(currentStep + 1);
    }
  };

  const renderSvgStage = () => {
    // 1. FLOW PIPELINE
    if (template === 'flow_pipeline') {
      const steps = Array.isArray(data.steps)
        ? (data.steps as unknown[]).slice(0, 5).map(normalizeDiagramLabel)
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
          viewBox={`0 0 ${totalW} 186`}
          className="exact-svg block h-auto w-full"
          role="img"
          aria-label="流程分步逻辑动图"
        >
          {/* 顶部轨道导轨与信号节点 */}
          <line
            x1={centerXs[0]}
            y1="26"
            x2={centerXs[centerXs.length - 1]}
            y2="26"
            stroke="var(--line-strong)"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <line
            x1={centerXs[0]}
            y1="26"
            x2={tokenX}
            y2="26"
            stroke="var(--accent)"
            strokeWidth="2.5"
            style={{ transition: 'all 320ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
          <g
            style={{
              transform: `translateX(${tokenX - centerXs[0]}px)`,
              transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <circle cx={centerXs[0]} cy="26" r="9" fill="var(--accent-soft)" />
            <circle cx={centerXs[0]} cy="26" r="4.5" fill="var(--accent)" />
          </g>

          {steps.map((stepLabel, idx) => {
            const x = padX + idx * (boxW + gap);
            const isActive = idx === currentStep;
            const isPassed = idx < currentStep;
            const lines = wrapSvgLines(stepLabel, count <= 4 ? 10 : 8, 3);
            const startY = lines.length === 1 ? 118 : lines.length === 2 ? 107 : 98;

            return (
              <g
                key={idx}
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
                  height="108"
                  rx="10"
                  fill={isActive ? 'var(--surface-raised)' : 'var(--surface)'}
                  stroke={
                    isActive
                      ? 'var(--accent)'
                      : isPassed
                        ? 'var(--growth)'
                        : 'var(--line-strong)'
                  }
                  strokeWidth={isActive ? 2 : 1.25}
                  opacity={isActive || isPassed ? 1 : 0.62}
                  style={{ transition: 'all 220ms cubic-bezier(0.22, 1, 0.36, 1)' }}
                />
                <rect
                  x={x + 12}
                  y="64"
                  width="54"
                  height="18"
                  rx="4"
                  fill={
                    isActive
                      ? 'var(--accent)'
                      : isPassed
                        ? 'var(--growth)'
                        : 'var(--surface-raised)'
                  }
                />
                <text
                  x={x + 39}
                  y="76"
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="var(--font-mono)"
                  fill={isActive ? '#ffffff' : isPassed ? '#081510' : 'var(--ink-3)'}
                >
                  STEP 0{idx + 1}
                </text>

                <text
                  x={x + boxW / 2}
                  y={startY}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight={isActive ? '600' : '500'}
                  fill="var(--ink-1)"
                >
                  {lines.map((ln, lIdx) => (
                    <tspan key={lIdx} x={x + boxW / 2} dy={lIdx === 0 ? 0 : 18}>
                      {ln}
                    </tspan>
                  ))}
                </text>

                {idx < count - 1 && (
                  <g>
                    <path
                      d={`M ${x + boxW + 2} 106 H ${x + boxW + gap - 7}`}
                      fill="none"
                      stroke="var(--line)"
                      strokeWidth="2"
                    />
                    <path
                      d={`M ${x + boxW + 2} 106 H ${x + boxW + gap - 7}`}
                      fill="none"
                      stroke={currentStep === idx + 1 ? 'var(--accent)' : 'var(--growth)'}
                      strokeWidth="2.2"
                      pathLength={1}
                      strokeDasharray="1"
                      strokeDashoffset={currentStep > idx ? 0 : 1}
                      style={{ transition: 'stroke-dashoffset 360ms cubic-bezier(0.22, 1, 0.36, 1)' }}
                    />
                    <polygon
                      points={`${x + boxW + gap - 9},101 ${x + boxW + gap - 1},106 ${
                        x + boxW + gap - 9
                      },111`}
                      fill={
                        currentStep > idx
                          ? currentStep === idx + 1
                            ? 'var(--accent)'
                            : 'var(--growth)'
                          : 'var(--line-strong)'
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

    // 2. TREE BREAKDOWN (+ 交互预算实时算额联动)
    if (template === 'tree_breakdown') {
      const palette = ['var(--accent)', 'var(--warning)', 'var(--growth)', '#60a5fa'];
      const rowH = 48;
      const svgH = 44 + bucketsData.length * rowH + 14;

      return (
        <svg
          viewBox={`0 0 640 ${svgH}`}
          className="exact-svg block h-auto w-full"
          role="img"
          aria-label="比例分流分步动图"
        >
          <text
            x="20"
            y="24"
            fontSize="11"
            fontFamily="var(--font-mono)"
            fontWeight="500"
            fill="var(--ink-3)"
          >
            ALLOCATION / STRUCTURE BREAKDOWN
          </text>
          <line x1="20" y1="34" x2="620" y2="34" stroke="var(--line)" strokeWidth="1" />

          {bucketsData.map((b, idx) => {
            const y = 50 + idx * rowH;
            const isOverview = currentStep === 0;
            const isFocus = currentStep === idx + 1;
            const isRevealed = isOverview || currentStep >= idx + 1;
            const barMax = isBudgetSandbox ? 260 : 326;
            const targetW = Math.max(20, Math.round((Math.min(100, b.ratio) / 100) * barMax));
            const color = isFocus ? 'var(--accent)' : palette[idx % palette.length];
            const yuanAmt = Math.round((sandboxMonthlyIncome * b.ratio) / 100);

            return (
              <g
                key={b.name}
                style={{ cursor: 'pointer' }}
                opacity={isOverview || isFocus ? 1 : isRevealed ? 0.85 : 0.38}
                onClick={() => {
                  setIsPlaying(false);
                  setStepSafe(idx + 1);
                }}
              >
                {isFocus && (
                  <rect
                    x="12"
                    y={y - 7}
                    width="616"
                    height="38"
                    rx="8"
                    fill="var(--accent-soft)"
                    stroke="var(--accent-border)"
                    strokeWidth="1"
                  />
                )}
                <circle cx="28" cy={y + 12} r="4.5" fill={color} />
                <text
                  x="42"
                  y={y + 16}
                  fontSize="13"
                  fontWeight={isFocus ? '600' : '500'}
                  fill="var(--ink-1)"
                >
                  {b.name}
                </text>
                <rect
                  x="216"
                  y={y + 2}
                  width={barMax}
                  height="20"
                  rx="5"
                  fill="var(--surface-raised)"
                  stroke="var(--line)"
                  strokeWidth="1"
                />
                <rect
                  x="216"
                  y={y + 2}
                  width={isRevealed ? targetW : 6}
                  height="20"
                  rx="5"
                  fill={color}
                  style={{ transition: 'width 360ms cubic-bezier(0.22, 1, 0.36, 1)' }}
                />
                <text
                  x={isBudgetSandbox ? 490 : 562}
                  y={y + 17}
                  fontSize="13.5"
                  fontFamily="var(--font-mono)"
                  fontWeight="600"
                  fill={isFocus ? 'var(--accent)' : 'var(--ink-1)'}
                >
                  {b.ratio}%
                </text>
                {isBudgetSandbox && (
                  <text
                    x="618"
                    y={y + 17}
                    textAnchor="end"
                    fontSize="13.5"
                    fontFamily="var(--font-mono)"
                    fontWeight="600"
                    fill="var(--growth)"
                  >
                    ¥{yuanAmt.toLocaleString('zh-CN')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      );
    }

    // 3. CURVE COMPARE
    if (template === 'curve_compare') {
      const seriesList: CurveSeries[] = Array.isArray(data.series)
        ? (data.series as CurveSeries[])
        : [
            { label: '策略曲线', points: [55, 78, 90, 96, 99] },
            { label: '对照曲线', points: [45, 42, 48, 52, 50] },
          ];
      const colors = ['var(--growth)', 'var(--warning)', 'var(--accent)'];

      const toCoords = (pts: number[]) =>
        pts.map((val, idx) => ({
          x: 56 + (idx / Math.max(1, pts.length - 1)) * 476,
          y: 168 - (Math.max(0, Math.min(100, val)) / 100) * 114,
          val,
        }));

      const toPathD = (coords: Array<{ x: number; y: number }>) =>
        coords
          .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
          .join(' ');

      const c0 = seriesList[0] ? toCoords(seriesList[0].points) : [];
      const c1 = seriesList[1] ? toCoords(seriesList[1].points) : [];
      const end0 = c0[c0.length - 1];
      const end1 = c1[c1.length - 1];

      return (
        <svg
          viewBox="0 0 640 206"
          className="exact-svg block h-auto w-full"
          role="img"
          aria-label="双线趋势对比动图"
        >
          {[54, 92, 130, 168].map((gy, i) => (
            <g key={gy}>
              <line
                x1="56"
                y1={gy}
                x2="544"
                y2={gy}
                stroke={i === 3 ? 'var(--line-strong)' : 'var(--line)'}
                strokeWidth={i === 3 ? 1.4 : 1}
              />
              <text
                x="46"
                y={gy + 4}
                textAnchor="end"
                fontSize="10"
                fontFamily="var(--font-mono)"
                fill="var(--ink-3)"
              >
                {[100, 67, 33, 0][i]}
              </text>
            </g>
          ))}
          <line x1="56" y1="46" x2="56" y2="168" stroke="var(--line-strong)" strokeWidth="1.4" />

          {seriesList.map((s, idx) => (
            <g key={s.label} transform={`translate(${56 + idx * 270}, 16)`}>
              <rect x="0" y="0" width="14" height="4" rx="2" fill={colors[idx % colors.length]} />
              <text x="20" y="6" fontSize="12" fontWeight="500" fill="var(--ink-1)">
                {s.label}
              </text>
            </g>
          ))}

          {seriesList.map((s, idx) => {
            const coords = toCoords(s.points);
            const stroke = colors[idx % colors.length];
            const visible = idx === 0 ? currentStep >= 1 : currentStep >= 2;
            return (
              <g key={s.label}>
                <path
                  d={toPathD(coords)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={idx === 0 ? 2.8 : 2.2}
                  pathLength={1}
                  style={{
                    strokeDasharray: idx === 1 && visible ? '6 4' : '1',
                    strokeDashoffset: visible ? 0 : 1,
                    transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
                {visible &&
                  coords.map((pt, pIdx) => (
                    <circle
                      key={pIdx}
                      cx={pt.x}
                      cy={pt.y}
                      r={pIdx === coords.length - 1 ? 4.5 : 3}
                      fill="var(--surface)"
                      stroke={stroke}
                      strokeWidth="2"
                    />
                  ))}
              </g>
            );
          })}

          {currentStep >= 3 && end0 && end1 && (
            <g>
              <line x1="556" y1={end0.y} x2="556" y2={end1.y} stroke="var(--accent)" strokeWidth="2" />
              <line x1="550" y1={end0.y} x2="562" y2={end0.y} stroke="var(--accent)" strokeWidth="1.8" />
              <line x1="550" y1={end1.y} x2="562" y2={end1.y} stroke="var(--accent)" strokeWidth="1.8" />
              <rect
                x="568"
                y={(end0.y + end1.y) / 2 - 12}
                width="60"
                height="24"
                rx="6"
                fill="var(--accent)"
              />
              <text
                x="598"
                y={(end0.y + end1.y) / 2 + 4}
                textAnchor="middle"
                fontSize="11"
                fontFamily="var(--font-mono)"
                fontWeight="600"
                fill="#ffffff"
              >
                Δ {Math.round(Math.abs(end0.val - end1.val))}
              </text>
            </g>
          )}
        </svg>
      );
    }

    // 4. TWO AXIS MATRIX
    if (template === 'two_axis_matrix') {
      const xLabel =
        typeof data.xAxis === 'string'
          ? data.xAxis
          : typeof data.xAxisLabel === 'string'
            ? data.xAxisLabel
            : '横轴维度 →';
      const yLabel =
        typeof data.yAxis === 'string'
          ? data.yAxis
          : typeof data.yAxisLabel === 'string'
            ? data.yAxisLabel
            : '↑ 纵轴维度';
      const quads = Array.isArray(data.quadrants)
        ? (data.quadrants as unknown[]).map(normalizeDiagramLabel)
        : ['象限一', '象限二', '象限三', '象限四'];

      const boxes = [
        { x: 64, y: 34, tone: 'var(--accent)', bg: 'var(--accent-soft)' },
        { x: 334, y: 34, tone: 'var(--danger)', bg: 'var(--danger-soft)' },
        { x: 64, y: 124, tone: 'var(--growth)', bg: 'var(--growth-soft)' },
        { x: 334, y: 124, tone: 'var(--warning)', bg: 'var(--warning-soft)' },
      ];

      return (
        <svg
          viewBox="0 0 640 242"
          className="exact-svg block h-auto w-full"
          role="img"
          aria-label="二维象限分步决策矩阵"
        >
          <line x1="48" y1="26" x2="48" y2="212" stroke="var(--line-strong)" strokeWidth="1.5" />
          <line x1="48" y1="212" x2="606" y2="212" stroke="var(--line-strong)" strokeWidth="1.5" />
          <text x="58" y="20" fontSize="12" fontWeight="500" fill="var(--ink-2)">
            {yLabel}
          </text>
          <text x="606" y="232" textAnchor="end" fontSize="12" fontWeight="500" fill="var(--ink-2)">
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
                opacity={isOverview ? 0.94 : isFocus ? 1 : 0.4}
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
                  fill={isFocus ? box.bg : 'var(--surface)'}
                  stroke={isFocus ? box.tone : 'var(--line-strong)'}
                  strokeWidth={isFocus ? 2 : 1.2}
                />
                <circle cx={box.x + 16} cy={box.y + 18} r="4" fill={box.tone} />
                <text
                  x={box.x + 132}
                  y={textStartY}
                  textAnchor="middle"
                  fontSize="12.5"
                  fontWeight={isFocus ? '600' : '500'}
                  fill="var(--ink-1)"
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

    // 5. COORDINATE 3D (+ 实时偏移沙盒)
    const showLocal = currentStep >= 1;
    const showTransformed = currentStep >= 2;
    const showCopySafe = currentStep >= 3;
    const worldX = 165 + sandboxOffsetX * 26;

    return (
      <svg
        viewBox="0 0 640 222"
        className="exact-svg block h-auto w-full"
        role="img"
        aria-label="三维坐标系与矩阵变换分步动图"
      >
        <g transform="translate(136, 154)">
          {/* +Z 轴 */}
          <line x1="0" y1="0" x2="0" y2="-112" stroke="var(--accent)" strokeWidth="2.2" />
          <polygon points="-4,-110 0,-120 4,-110" fill="var(--accent)" />
          <text
            x="10"
            y="-108"
            fontSize="12"
            fontFamily="var(--font-mono)"
            fontWeight="600"
            fill="var(--accent)"
          >
            +Z (Up)
          </text>
          {/* +X 轴 */}
          <line x1="0" y1="0" x2="152" y2="34" stroke="var(--danger)" strokeWidth="2.2" />
          <polygon points="149,29 160,36 148,38" fill="var(--danger)" />
          <text
            x="166"
            y="42"
            fontSize="12"
            fontFamily="var(--font-mono)"
            fontWeight="600"
            fill="var(--danger)"
          >
            +X
          </text>
          {/* +Y 轴 */}
          <line x1="0" y1="0" x2="112" y2="-56" stroke="var(--growth)" strokeWidth="2.2" />
          <polygon points="107,-59 119,-60 112,-51" fill="var(--growth)" />
          <text
            x="124"
            y="-56"
            fontSize="12"
            fontFamily="var(--font-mono)"
            fontWeight="600"
            fill="var(--growth)"
          >
            +Y
          </text>

          {/* 局部顶点 ref_obj (v.co) */}
          {showLocal && (
            <g>
              <circle
                cx="48"
                cy="-24"
                r="11"
                fill="var(--growth-soft)"
                stroke="var(--growth)"
                strokeWidth="2"
              />
              <text
                x="10"
                y="-58"
                fontSize="11.5"
                fontFamily="var(--font-mono)"
                fontWeight="600"
                fill="var(--growth)"
              >
                ref_obj (v.co)
              </text>
            </g>
          )}

          {/* matrix_world @ v.co 轨迹弧线 */}
          {showTransformed && (
            <g>
              <path
                d={`M 59 -28 Q ${(59 + worldX) / 2} -102 ${worldX - 8} -64`}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeDasharray="5 4"
              />
              <circle
                cx={worldX}
                cy="-60"
                r="12.5"
                fill="var(--accent-soft)"
                stroke="var(--accent)"
                strokeWidth="2.2"
              />
              <text
                x={worldX + 20}
                y="-64"
                fontSize="12"
                fontFamily="var(--font-mono)"
                fontWeight="600"
                fill="var(--ink-1)"
              >
                world_pos ({sandboxOffsetX.toFixed(1)}, 0, 1)
              </text>
              <text
                x={worldX + 20}
                y="-46"
                fontSize="11"
                fontFamily="var(--font-mono)"
                fill="var(--ink-2)"
              >
                matrix_world @ v.co
              </text>
            </g>
          )}

          {/* .copy() 安全隔离对比框 */}
          {showCopySafe && (
            <g transform="translate(248, -16)">
              <rect
                x="0"
                y="0"
                width="228"
                height="62"
                rx="8"
                fill="var(--growth-soft)"
                stroke="var(--growth-border)"
                strokeWidth="1.4"
              />
              <text
                x="12"
                y="23"
                fontSize="11.5"
                fontFamily="var(--font-mono)"
                fontWeight="600"
                fill="var(--growth)"
              >
                pos = obj.location.copy()
              </text>
              <text x="12" y="44" fontSize="11.5" fill="var(--ink-1)">
                原基准球稳停原点，派生偏移 +{sandboxOffsetX.toFixed(1)}m
              </text>
            </g>
          )}
        </g>
      </svg>
    );
  };

  const activeNarration = narrations[Math.min(currentStep, narrations.length - 1)] ?? narrations[0];

  // 计算 6 个月应急防火墙参考值（当处于预算沙盒模式时）
  const essentialRatio = bucketsData[0]?.ratio ?? 50;
  const essentialMonthly = Math.round((sandboxMonthlyIncome * essentialRatio) / 100);
  const firewall6m = essentialMonthly * 6;

  return (
    <div
      className={cn(
        'motion-explainer v3-card overflow-hidden',
        compact && 'border-[var(--line)]'
      )}
      data-template={template}
      data-step={currentStep + 1}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* 顶栏标题 + 步数标尺（零装饰光点） */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono-num rounded bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
            {currentStep + 1} / {totalSteps}
          </span>
          <span className="text-[13px] font-medium text-[var(--ink-1)]">
            {activeNarration.tag}
          </span>
        </div>
        {caption && (
          <span className="truncate text-[12.5px] text-[var(--ink-3)]">{caption}</span>
        )}
      </div>

      {/* 矢量点阵实验室画布 */}
      <div className="v3-dot-stage px-3 py-4 sm:px-4">{renderSvgStage()}</div>

      {/* 交互参数实验条（仅对可量化模型激活） */}
      {isBudgetSandbox && (
        <div
          className="border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3"
          data-sandbox="budget-slider"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink-1)]">
              <SlidersHorizontal size={14} strokeWidth={1.5} className="text-[var(--accent)]" />
              <span>拖拽试算月收入</span>
            </span>
            <div className="flex items-center gap-3 font-mono-num">
              <strong className="text-[14px] text-[var(--accent)]" data-budget-income>
                ¥{sandboxMonthlyIncome.toLocaleString('zh-CN')} / 月
              </strong>
              <span className="text-[12px] text-[var(--ink-3)]">
                6 个月防火墙目标 ¥{firewall6m.toLocaleString('zh-CN')}
              </span>
            </div>
          </div>
          <input
            type="range"
            min={1500}
            max={10000}
            step={500}
            value={sandboxMonthlyIncome}
            aria-label="月收入试算滑块"
            className="v3-range"
            onChange={(e) => setSandboxMonthlyIncome(Number(e.target.value))}
          />
        </div>
      )}

      {template === 'coordinate_3d' && (
        <div
          className="border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3"
          data-sandbox="coord-slider"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink-1)]">
              <SlidersHorizontal size={14} strokeWidth={1.5} className="text-[var(--accent)]" />
              <span>调整派生球 X 轴偏移</span>
            </span>
            <strong className="font-mono-num text-[13px] text-[var(--accent)]">
              pos.x += {sandboxOffsetX.toFixed(1)}m
            </strong>
          </div>
          <input
            type="range"
            min={0.5}
            max={3.5}
            step={0.5}
            value={sandboxOffsetX}
            aria-label="三维偏移试算滑块"
            className="v3-range"
            onChange={(e) => {
              setIsPlaying(false);
              setStepSafe(Math.max(2, currentStep));
              setSandboxOffsetX(Number(e.target.value));
            }}
          />
        </div>
      )}

      {/* 单句逻辑解说栏 */}
      <div
        className="motion-logic-text border-t border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-[13.5px] leading-[1.6] text-[var(--ink-2)]"
        aria-live="polite"
      >
        {activeNarration.text}
      </div>

      {/* 播放与步进 HUD */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="subtle"
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
            {isPlaying ? <Pause size={13} strokeWidth={1.5} /> : <Play size={13} strokeWidth={1.5} />}
            <span>{isPlaying ? '暂停' : '播放'}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsPlaying(false);
              setStepSafe(currentStep - 1);
            }}
            aria-label="上一步"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
            <span>上一步</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsPlaying(false);
              setStepSafe(currentStep + 1);
            }}
            aria-label="下一步"
          >
            <span>下一步</span>
            <ChevronRight size={14} strokeWidth={1.5} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setStepSafe(0);
              setIsPlaying(true);
            }}
            aria-label="重播动图"
          >
            <RotateCcw size={13} strokeWidth={1.5} />
            <span>重播</span>
          </Button>
        </div>

        <div className="flex items-center gap-1.5" role="tablist" aria-label="动图步骤切换">
          {narrations.map((n, idx) => {
            const isCur = idx === currentStep;
            const isDone = idx < currentStep;
            return (
              <button
                key={n.tag + idx}
                type="button"
                role="tab"
                aria-selected={isCur}
                onClick={() => {
                  setIsPlaying(false);
                  setStepSafe(idx);
                }}
                className={cn(
                  'font-mono-num flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border text-[12px] font-medium transition-colors',
                  isCur
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : isDone
                      ? 'border-[var(--growth-border)] bg-[var(--growth-soft)] text-[var(--growth)]'
                      : 'border-[var(--line)] bg-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                )}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
