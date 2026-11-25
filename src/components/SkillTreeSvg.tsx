import type { PlatformContentBundle } from '../core/contentLoader';
import { isUnitCleared } from '../core/gatekeeper';
import type { BranchId, TelemetrySnapshot } from '../types/schema';

interface SkillTreeSvgProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  variant?: 'living' | 'wall';
  demoFallback?: boolean;
  selectedBranchId?: BranchId;
  onSelectBranch?: (branchId: BranchId) => void;
}

interface BoughGeometry {
  branchId: BranchId;
  pathD: string;
  tipX: number;
  tipY: number;
  labelX: number;
  labelY: number;
  labelAnchor: 'start' | 'middle' | 'end';
}

/** 精心排布坐标，保证七分支枝端叶片簇与文字签之间保留 ≥24px 安全间距，零碰撞 */
const BOUGH_LAYOUT: BoughGeometry[] = [
  {
    branchId: 'B1',
    pathD: 'M 320 264 C 320 198, 318 134, 320 78',
    tipX: 320,
    tipY: 74,
    labelX: 320,
    labelY: 26,
    labelAnchor: 'middle',
  },
  {
    branchId: 'B2',
    pathD: 'M 318 192 C 266 172, 220 140, 178 106',
    tipX: 174,
    tipY: 103,
    labelX: 132,
    labelY: 82,
    labelAnchor: 'end',
  },
  {
    branchId: 'B3',
    pathD: 'M 322 186 C 374 166, 420 136, 464 104',
    tipX: 468,
    tipY: 101,
    labelX: 510,
    labelY: 82,
    labelAnchor: 'start',
  },
  {
    branchId: 'B4',
    pathD: 'M 317 218 C 258 210, 200 194, 148 174',
    tipX: 144,
    tipY: 172,
    labelX: 102,
    labelY: 178,
    labelAnchor: 'end',
  },
  {
    branchId: 'B5',
    pathD: 'M 323 214 C 382 206, 440 190, 492 170',
    tipX: 496,
    tipY: 168,
    labelX: 538,
    labelY: 174,
    labelAnchor: 'start',
  },
  {
    branchId: 'B7',
    pathD: 'M 322 242 C 378 242, 430 236, 476 226',
    tipX: 480,
    tipY: 225,
    labelX: 524,
    labelY: 234,
    labelAnchor: 'start',
  },
  {
    branchId: 'B6',
    pathD: 'M 320 268 C 282 284, 240 290, 198 286',
    tipX: 194,
    tipY: 285,
    labelX: 150,
    labelY: 292,
    labelAnchor: 'end',
  },
];

/**
 * eudaimonia 七分支生存技能树 v2.0（水滴叶片路径 + 零文字碰撞 + 温和正向点亮）
 */
export function SkillTreeSvg({
  content,
  telemetry,
  variant = 'living',
  demoFallback = false,
  selectedBranchId,
  onSelectBranch,
}: SkillTreeSvgProps) {
  const isWall = variant === 'wall';
  const branchMap = new Map(content.catalog.branches.map((b) => [b.id, b]));

  const trunkColor = isWall ? '#6E6154' : '#574C42';
  const soilFill = isWall ? '#1B222A' : '#EFEFEA';
  const soilStroke = isWall ? '#2C3642' : 'rgba(24,24,22,0.08)';
  const unlitFill = isWall ? '#212832' : '#F7F7F5';
  const unlitStroke = isWall ? '#424E5E' : '#C8C6BC';
  const litFill = isWall ? '#4CC38A' : '#1F7A5A';
  const fruitFill = isWall ? '#F0B35A' : '#D94F30';
  const labelColor = isWall ? '#D5DCE4' : '#2D2D2A';

  const totalUnits = content.units.length;
  const clearedCount = content.units.filter((u) => isUnitCleared(u.id, telemetry)).length;
  const approvedMilestones = Object.values(telemetry.milestoneSubmissions).filter(
    (m) => m.isApproved
  ).length;

  return (
    <div class={isWall ? 'skill-tree-wall-box' : 'skill-tree-living-box'}>
      <svg
        viewBox={isWall ? '92 38 456 266' : '0 0 640 318'}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="eudaimonia 七分支生存技能树"
      >
        {/* 柔和树冠背景光晕 */}
        <circle
          cx="320"
          cy="148"
          r="118"
          fill={isWall ? 'rgba(76, 195, 138, 0.04)' : 'rgba(31, 122, 90, 0.04)'}
        />
        {/* 土壤基座 */}
        <ellipse cx="320" cy="272" rx="188" ry="20" fill={soilFill} stroke={soilStroke} stroke-width="1" />

        {/* 有机树干 */}
        <path
          d="M 311 272 C 315 232, 316 196, 317 166 L 323 166 C 324 196, 325 232, 329 272 Z"
          fill={trunkColor}
        />

        {BOUGH_LAYOUT.map((geo, bIdx) => {
          const branch = branchMap.get(geo.branchId);
          if (!branch) return null;

          const bUnits = content.units.filter((u) => u.branchId === geo.branchId);
          const clearedInBranch = bUnits.filter((u) => isUnitCleared(u.id, telemetry)).length;
          const hasMilestoneFruit = branch.tracks.some(
            (t) => telemetry.milestoneSubmissions[t.id]?.isApproved
          );
          const isSelected = selectedBranchId === geo.branchId;

          const slotCount = Math.max(2, Math.min(5, bUnits.length || 2));
          const leaves = Array.from({ length: slotCount }, (_, i) => {
            const spread = ((i - (slotCount - 1) / 2) * 0.68) - Math.PI / 2;
            const radius = isWall ? 18 : 21;
            const lx = geo.tipX + Math.cos(spread) * radius;
            const ly = geo.tipY + Math.sin(spread) * radius;
            const angleDeg = (spread * 180) / Math.PI + 90;
            const lit = demoFallback
              ? i === 0 || (bIdx === 0 && i === 1)
              : i < clearedInBranch;
            const unitTitle = bUnits[i]?.title ?? `${branch.name}后续规划节点`;
            return { lx, ly, angleDeg, lit, unitTitle };
          });

          return (
            <g
              key={geo.branchId}
              class="skill-bough-group"
              style={{ cursor: onSelectBranch ? 'pointer' : 'default' }}
              onClick={() => onSelectBranch?.(geo.branchId)}
            >
              {/* 枝干路径 */}
              <path
                d={geo.pathD}
                fill="none"
                stroke={isSelected ? branch.accentToken : trunkColor}
                stroke-width={geo.branchId === 'B1' ? 4.4 : isSelected ? 3.6 : 2.6}
                stroke-linecap="round"
                opacity={selectedBranchId && !isSelected && !isWall ? 0.55 : 1}
              />

              {/* 精致水滴叶片簇 */}
              {leaves.map((lf, idx) => (
                <g
                  key={idx}
                  transform={`translate(${lf.lx.toFixed(1)}, ${lf.ly.toFixed(1)}) rotate(${lf.angleDeg.toFixed(1)})`}
                >
                  <path
                    d="M 0 -9 C 6 -4, 6 4, 0 8 C -6 4, -6 -4, 0 -9 Z"
                    fill={lf.lit ? litFill : unlitFill}
                    stroke={lf.lit ? branch.accentToken : isSelected ? branch.accentToken : unlitStroke}
                    stroke-width="1.4"
                  >
                    <title>
                      {branch.id} {branch.name} · {lf.unitTitle}（{lf.lit ? '已点亮' : '待点亮'}）
                    </title>
                  </path>
                  {lf.lit && (
                    <line x1="0" y1="-5" x2="0" y2="5" stroke="rgba(255,255,255,0.45)" stroke-width="1" />
                  )}
                </g>
              ))}

              {/* 阶段实战果实 */}
              {(hasMilestoneFruit || (demoFallback && geo.branchId === 'B1')) && (
                <circle
                  cx={geo.tipX + 13}
                  cy={geo.tipY + 12}
                  r="5"
                  fill={fruitFill}
                  stroke={isWall ? '#0B0E11' : '#FFFFFF'}
                  stroke-width="1.5"
                >
                  <title>{branch.name} · 已结出实战产出果实</title>
                </circle>
              )}

              {/* 站内模式清晰外置分支文字签（与叶片簇严格隔离零重叠） */}
              {!isWall && (
                <text
                  x={geo.labelX}
                  y={geo.labelY}
                  text-anchor={geo.labelAnchor}
                  font-size="13"
                  font-weight={isSelected ? '700' : '600'}
                  fill={isSelected ? branch.accentToken : labelColor}
                >
                  {branch.id} {branch.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {!isWall && (
        <div class="skill-tree-caption-bar">
          <span>
            已点亮叶片 <strong class="tabular-num">{clearedCount} / {totalUnits}</strong> · 实战果实{' '}
            <strong class="tabular-num">{approvedMilestones}</strong> 枚
          </span>
          <span class="skill-tree-rule-hint">正向生长，断更不枯萎；点击树枝或右侧列表切换</span>
        </div>
      )}
    </div>
  );
}
