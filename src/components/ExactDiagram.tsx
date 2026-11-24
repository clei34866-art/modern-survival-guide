import type { UnitVisual } from '../types/schema';

interface ExactDiagramProps {
  spec: NonNullable<UnitVisual['svgSpec']>;
}

interface BucketItem {
  name: string;
  ratio: number;
}

interface CurveSeries {
  label: string;
  points: number[]; // 0..100 归一化纵坐标
}

export function ExactDiagram({ spec }: ExactDiagramProps) {
  const { template, data } = spec;

  if (template === 'flow_pipeline') {
    const rawSteps = Array.isArray(data.steps)
      ? (data.steps as string[])
      : ['输入材料', '结构处理', '核查输出'];
    const steps = rawSteps.slice(0, 5);
    const boxW = 132;
    const gap = 24;
    const totalW = steps.length * boxW + (steps.length - 1) * gap + 40;

    return (
      <svg
        viewBox={`0 0 ${totalW} 118`}
        class="exact-svg"
        role="img"
        aria-label="流程结构精确示意图"
      >
        <rect x="0" y="0" width={totalW} height="118" rx="10" fill="#FBF8F3" />
        {steps.map((step, idx) => {
          const x = 20 + idx * (boxW + gap);
          return (
            <g key={idx}>
              <rect
                x={x}
                y="26"
                width={boxW}
                height="66"
                rx="8"
                fill="#FFFFFF"
                stroke="#3D7A8A"
                stroke-width="1.5"
              />
              <text
                x={x + boxW / 2}
                y="49"
                text-anchor="middle"
                font-size="11"
                fill="#6B655C"
                font-family="monospace"
              >
                STEP {idx + 1}
              </text>
              <text
                x={x + boxW / 2}
                y="71"
                text-anchor="middle"
                font-size="12"
                font-weight="600"
                fill="#2B2925"
              >
                {step.length > 9 ? `${step.slice(0, 9)}…` : step}
              </text>
              {idx < steps.length - 1 && (
                <g>
                  <line
                    x1={x + boxW + 4}
                    y1="59"
                    x2={x + boxW + gap - 6}
                    y2="59"
                    stroke="#C46A4A"
                    stroke-width="2"
                  />
                  <polygon
                    points={`${x + boxW + gap - 6},54 ${x + boxW + gap},59 ${
                      x + boxW + gap - 6
                    },64`}
                    fill="#C46A4A"
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    );
  }

  if (template === 'tree_breakdown') {
    const buckets: BucketItem[] = Array.isArray(data.buckets)
      ? (data.buckets as BucketItem[])
      : [
          { name: '分项 A', ratio: 50 },
          { name: '分项 B', ratio: 30 },
          { name: '分项 C', ratio: 20 },
        ];
    const palette = ['#3D7A8A', '#B87D2B', '#4E8268', '#A86472'];

    return (
      <svg
        viewBox="0 0 600 170"
        class="exact-svg"
        role="img"
        aria-label="比例分流结构精确示意图"
      >
        <rect x="0" y="0" width="600" height="170" rx="10" fill="#FBF8F3" />
        {buckets.map((b, idx) => {
          const y = 24 + idx * 44;
          const barMax = 340;
          const barW = Math.max(24, Math.round((Math.min(100, b.ratio) / 100) * barMax));
          const color = palette[idx % palette.length];
          return (
            <g key={b.name}>
              <text x="24" y={y + 18} font-size="13" font-weight="600" fill="#2B2925">
                {b.name}
              </text>
              <rect x="148" y={y + 3} width={barMax} height="22" rx="6" fill="#EAE2D3" />
              <rect x="148" y={y + 3} width={barW} height="22" rx="6" fill={color} />
              <text
                x="504"
                y={y + 19}
                font-size="13"
                font-family="monospace"
                font-weight="600"
                fill="#2B2925"
              >
                {b.ratio}%
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  if (template === 'curve_compare') {
    const seriesList: CurveSeries[] = Array.isArray(data.series)
      ? (data.series as CurveSeries[])
      : [
          { label: '间隔重测留存', points: [100, 82, 88, 84, 90] },
          { label: '单次顺读遗忘', points: [100, 45, 28, 20, 15] },
        ];
    const colors = ['#4E8268', '#C46A4A', '#3D7A8A'];

    const toPolyline = (pts: number[]) =>
      pts
        .map((val, idx) => {
          const x = 60 + (idx / Math.max(1, pts.length - 1)) * 460;
          const y = 148 - (Math.max(0, Math.min(100, val)) / 100) * 110;
          return `${x},${y}`;
        })
        .join(' ');

    return (
      <svg viewBox="0 0 600 180" class="exact-svg" role="img" aria-label="趋势对比曲线精确图">
        <rect x="0" y="0" width="600" height="180" rx="10" fill="#FBF8F3" />
        <line x1="60" y1="30" x2="60" y2="148" stroke="#BFB6A4" stroke-width="1.5" />
        <line x1="60" y1="148" x2="530" y2="148" stroke="#BFB6A4" stroke-width="1.5" />
        {seriesList.map((s, idx) => {
          const stroke = colors[idx % colors.length];
          return (
            <g key={s.label}>
              <polyline
                fill="none"
                stroke={stroke}
                stroke-width="2.5"
                points={toPolyline(s.points)}
              />
              <rect x={64 + idx * 165} y="10" width="12" height="12" rx="3" fill={stroke} />
              <text x={82 + idx * 165} y="20" font-size="12" fill="#2B2925">
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  if (template === 'two_axis_matrix') {
    const xLabel = typeof data.xAxis === 'string' ? data.xAxis : '紧迫度 / 短期波动 →';
    const yLabel = typeof data.yAxis === 'string' ? data.yAxis : '↑ 长期价值 / 重要性';
    const quadrants = Array.isArray(data.quadrants)
      ? (data.quadrants as string[])
      : ['高价值·低波动（核心底仓）', '高价值·高精力（黄金时段攻坚）', '低价值·低耗时（碎片批处理）', '低价值·高消耗（果断止损）'];

    return (
      <svg viewBox="0 0 600 200" class="exact-svg" role="img" aria-label="二维象限矩阵精确图">
        <rect x="0" y="0" width="600" height="200" rx="10" fill="#FBF8F3" />
        <rect x="70" y="24" width="220" height="68" rx="8" fill="#FFFFFF" stroke="#E6DEC8" />
        <rect x="302" y="24" width="220" height="68" rx="8" fill="#EFF6F1" stroke="#4E8268" />
        <rect x="70" y="102" width="220" height="68" rx="8" fill="#FFFFFF" stroke="#E6DEC8" />
        <rect x="302" y="102" width="220" height="68" rx="8" fill="#FDF4F3" stroke="#C46A4A" />
        <text x="180" y="63" text-anchor="middle" font-size="12" fill="#2B2925">
          {quadrants[0] ?? ''}
        </text>
        <text x="412" y="63" text-anchor="middle" font-size="12" font-weight="600" fill="#2D5942">
          {quadrants[1] ?? ''}
        </text>
        <text x="180" y="141" text-anchor="middle" font-size="12" fill="#6B655C">
          {quadrants[2] ?? ''}
        </text>
        <text x="412" y="141" text-anchor="middle" font-size="12" fill="#9E423D">
          {quadrants[3] ?? ''}
        </text>
        <text x="296" y="190" text-anchor="middle" font-size="12" fill="#6B655C">
          {xLabel}
        </text>
        <text x="18" y="18" font-size="12" fill="#6B655C">
          {yLabel}
        </text>
      </svg>
    );
  }

  // coordinate_3d（用于 Blender bpy 空间变换与矩阵直觉）
  return (
    <svg viewBox="0 0 600 185" class="exact-svg" role="img" aria-label="三维坐标系与数据块示意">
      <rect x="0" y="0" width="600" height="185" rx="10" fill="#FBF8F3" />
      <g transform="translate(180, 125)">
        {/* Z 轴 */}
        <line x1="0" y1="0" x2="0" y2="-90" stroke="#3D7A8A" stroke-width="2.5" />
        <text x="8" y="-82" font-size="12" font-family="monospace" fill="#3D7A8A">
          +Z (Up)
        </text>
        {/* X 轴 */}
        <line x1="0" y1="0" x2="105" y2="28" stroke="#C46A4A" stroke-width="2.5" />
        <text x="112" y="34" font-size="12" font-family="monospace" fill="#C46A4A">
          +X
        </text>
        {/* Y 轴 */}
        <line x1="0" y1="0" x2="85" y2="-44" stroke="#4E8268" stroke-width="2.5" />
        <text x="92" y="-44" font-size="12" font-family="monospace" fill="#4E8268">
          +Y
        </text>
        <circle cx="48" cy="-36" r="14" fill="#3D7A8A" fill-opacity="0.22" stroke="#3D7A8A" stroke-width="1.8" />
        <text x="72" y="-32" font-size="12" font-family="monospace" fill="#2B2925">
          obj.matrix_world (4×4)
        </text>
      </g>
    </svg>
  );
}
