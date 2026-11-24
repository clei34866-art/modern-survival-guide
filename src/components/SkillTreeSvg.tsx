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
}

const BOUGH_LAYOUT: BoughGeometry[] = [
  // B1 主干直上树冠中心
  {
    branchId: 'B1',
    pathD: 'M 300 245 C 300 185, 298 125, 300 68',
    tipX: 300,
    tipY: 64,
    labelX: 300,
    labelY: 32,
  },
  // B2 左侧上枝（财经）
  {
    branchId: 'B2',
    pathD: 'M 298 182 C 250 166, 200 132, 148 96',
    tipX: 146,
    tipY: 94,
    labelX: 108,
    labelY: 78,
  },
  // B3 右侧上枝（心理）
  {
    branchId: 'B3',
    pathD: 'M 302 176 C 352 158, 405 128, 454 94',
    tipX: 456,
    tipY: 92,
    labelX: 492,
    labelY: 76,
  },
  // B4 左侧中下枝（健康）
  {
    branchId: 'B4',
    pathD: 'M 297 205 C 236 196, 175 182, 114 162',
    tipX: 112,
    tipY: 160,
    labelX: 72,
    labelY: 156,
  },
  // B5 右侧中下枝（表达与职业）
  {
    branchId: 'B5',
    pathD: 'M 303 202 C 364 192, 425 178, 486 158',
    tipX: 488,
    tipY: 156,
    labelX: 528,
    labelY: 154,
  },
  // B7 右侧稳固低枝（生活常识与自保）
  {
    branchId: 'B7',
    pathD: 'M 302 224 C 355 222, 410 218, 462 206',
    tipX: 464,
    tipY: 205,
    labelX: 514,
    labelY: 208,
  },
  // B6 树根滋养系（学习与精力方法线）
  {
    branchId: 'B6',
    pathD: 'M 300 245 C 262 258, 218 268, 168 266',
    tipX: 166,
    tipY: 266,
    labelX: 112,
    labelY: 268,
  },
];

/**
 * eudaimonia 七分支生存技能树（正向生长点亮，断更不枯萎、不掉级）
 * 同时适配站内暖纸生活风（variant="living"）与 1080P 深底状态墙（variant="wall"）。
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

  const trunkStroke = isWall ? '#8E735B' : '#7D6249';
  const soilFill = isWall ? '#1F2823' : '#EFE7D6';
  const unlitBudFill = isWall ? '#27303A' : '#EFE9DC';
  const unlitBudStroke = isWall ? '#465260' : '#C8BEA8';
  const litLeafFill = isWall ? '#63C787' : '#4E8268';
  const fruitFill = isWall ? '#F0B35A' : '#C98A2C';
  const labelColor = isWall ? '#D5DCE4' : '#2B2925';

  const totalUnits = content.units.length;
  const clearedCount = content.units.filter((u) => isUnitCleared(u.id, telemetry)).length;
  const approvedMilestones = Object.values(telemetry.milestoneSubmissions).filter(
    (m) => m.isApproved
  ).length;

  return (
    <div class={isWall ? 'skill-tree-wall-box' : 'skill-tree-living-box'}>
      <svg
        viewBox={isWall ? '70 28 460 256' : '0 0 600 296'}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="eudaimonia 七分支生存技能树"
      >
        {/* 土壤基座 */}
        <ellipse cx="300" cy="256" rx="195" ry="22" fill={soilFill} />
        {/* 树干底座 */}
        <path
          d="M 292 254 Q 300 210 297 170 L 303 170 Q 300 210 308 254 Z"
          fill={trunkStroke}
        />

        {BOUGH_LAYOUT.map((geo, bIdx) => {
          const branch = branchMap.get(geo.branchId);
          if (!branch) return null;

          const bUnits = content.units.filter((u) => u.branchId === geo.branchId);
          const clearedInBranch = bUnits.filter((u) => isUnitCleared(u.id, telemetry)).length;
          const hasMilestoneFruit = branch.tracks.some(
            (t) => telemetry.milestoneSubmissions[t.id]?.isApproved
          );

          // 构造叶片坐标簇（无实际单元时渲染 2 颗待萌发芽点，有单元时逐节对应一颗叶片）
          const slotCount = Math.max(2, Math.min(6, bUnits.length || 2));
          const leaves = Array.from({ length: slotCount }, (_, i) => {
            const angle = ((i - (slotCount - 1) / 2) * 0.62) - Math.PI / 2;
            const radius = isWall ? 18 : 22;
            const lx = geo.tipX + Math.cos(angle) * radius;
            const ly = geo.tipY + Math.sin(angle) * radius;
            const lit = demoFallback
              ? i === 0 || (bIdx === 0 && i === 1)
              : i < clearedInBranch;
            const unitTitle = bUnits[i]?.title.replace(/^【示例占位】/, '') ?? `${branch.name}待解锁节点`;
            return { lx, ly, lit, unitTitle };
          });

          const isSelected = selectedBranchId === geo.branchId;

          return (
            <g
              key={geo.branchId}
              style={{ cursor: onSelectBranch ? 'pointer' : 'default' }}
              onClick={() => onSelectBranch?.(geo.branchId)}
            >
              {/* 枝干 */}
              <path
                d={geo.pathD}
                fill="none"
                stroke={isSelected ? branch.accentToken : trunkStroke}
                stroke-width={geo.branchId === 'B1' ? 5 : 3.2}
                stroke-linecap="round"
              />

              {/* 叶片簇 */}
              {leaves.map((lf, idx) => (
                <g key={idx}>
                  <circle
                    cx={lf.lx}
                    cy={lf.ly}
                    r={lf.lit ? 8.5 : 6.2}
                    fill={lf.lit ? litLeafFill : unlitBudFill}
                    stroke={lf.lit ? branch.accentToken : unlitBudStroke}
                    stroke-width="1.6"
                  >
                    <title>
                      {branch.id} {branch.name} · {lf.unitTitle}（{lf.lit ? '已点亮' : '待点亮'}）
                    </title>
                  </circle>
                </g>
              ))}

              {/* 阶段实战产出果实 */}
              {(hasMilestoneFruit || (demoFallback && geo.branchId === 'B1')) && (
                <circle
                  cx={geo.tipX + 12}
                  cy={geo.tipY + 10}
                  r="5.5"
                  fill={fruitFill}
                  stroke="#FFFFFF"
                  stroke-width="1"
                >
                  <title>{branch.name} · 已结出实战产出果实</title>
                </circle>
              )}

              {/* 站内模式展示清晰七分支文字签 */}
              {!isWall && (
                <text
                  x={geo.labelX}
                  y={geo.labelY}
                  text-anchor="middle"
                  font-size="12"
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
            🌱 <strong>eudaimonia 生存技能树</strong>：已点亮叶片{' '}
            <strong>
              {clearedCount} / {totalUnits}
            </strong>{' '}
            片 · 阶段实战果实 <strong>{approvedMilestones}</strong> 枚
          </span>
          <span class="skill-tree-rule-hint">正向点亮，断更不枯萎、不掉级；点击树枝可切换分支</span>
        </div>
      )}
    </div>
  );
}
