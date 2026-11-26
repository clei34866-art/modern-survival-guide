import type { PlatformContentBundle } from '@/core/contentLoader';
import { isUnitCleared } from '@/core/gatekeeper';
import type { BranchId, TelemetrySnapshot } from '@/types/schema';

interface SkillTreeSvgProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  variant?: 'living' | 'wall';
  demoFallback?: boolean;
  selectedBranchId?: BranchId;
  onSelectBranch?: (branchId: BranchId) => void;
}

const BRANCH_ORDER: BranchId[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

interface OrbitNode {
  branchId: BranchId;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'middle' | 'end';
}

const CX = 320;
const CY = 198;
const ORBIT_R = 114;

/** 7 节点均匀径向星图排布（B1 居正北 12 点钟方向，外置标签零碰撞零贴边） */
const ORBIT_NODES: OrbitNode[] = BRANCH_ORDER.map((branchId, idx) => {
  const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / BRANCH_ORDER.length;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = CX + cos * ORBIT_R;
  const y = CY + sin * ORBIT_R;

  let labelX = CX + cos * (ORBIT_R + 36);
  let labelY = CY + sin * (ORBIT_R + 34);
  let anchor: 'start' | 'middle' | 'end' = 'middle';

  if (idx === 0) {
    labelX = CX;
    labelY = y - 48;
    anchor = 'middle';
  } else if (cos > 0.25) {
    labelX = x + 34;
    labelY = y + 2;
    anchor = 'start';
  } else if (cos < -0.25) {
    labelX = x - 34;
    labelY = y + 2;
    anchor = 'end';
  } else {
    labelY = y + (sin > 0 ? 40 : -40);
    anchor = 'middle';
  }

  return { branchId, x, y, labelX, labelY, anchor };
});

/**
 * 径向星图技能图谱 v3.0（Radial Constellation Skill Atlas）
 * - 零霓虹光晕、静默轨道发丝线、高辨识径向进度环
 * - 兼容站内双主题（variant="living"）与 1080P 状态墙深空模式（variant="wall"）
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

  const totalUnits = content.units.length;
  const clearedCount = content.units.filter((u) => isUnitCleared(u.id, telemetry)).length;
  const approvedMilestones = Object.values(telemetry.milestoneSubmissions).filter(
    (m) => m.isApproved
  ).length;

  const lineColor = isWall ? 'rgba(200,228,255,0.20)' : 'var(--line)';
  const surfaceColor = isWall ? 'rgba(10, 24, 52, 0.72)' : 'var(--surface-plate)';
  const raisedColor = isWall ? 'rgba(18, 40, 78, 0.56)' : 'var(--surface-raised)';
  const textPrimary = isWall ? '#f4f8ff' : 'var(--ink-1)';
  const textMuted = isWall ? '#b6c8e4' : 'var(--ink-3)';
  const growthColor = isWall ? '#5eead4' : 'var(--growth)';
  const accentColor = isWall ? '#5ea8ff' : 'var(--accent)';

  return (
    <div className={isWall ? 'skill-tree-wall-box' : 'skill-tree-living-box w-full'}>
      <svg
        viewBox={isWall ? '164 54 312 288' : '0 0 640 378'}
        className="block h-auto w-full"
        role="img"
        aria-label="七大生存分支径向星图"
      >
        {/* 同心参考轨道线 */}
        <circle
          cx={CX}
          cy={CY}
          r={ORBIT_R}
          fill="none"
          stroke={lineColor}
          strokeWidth="1"
          strokeDasharray="4 5"
        />
        <circle cx={CX} cy={CY} r={66} fill="none" stroke={lineColor} strokeWidth="1" />

        {/* 7 条径向连线与轨道节点 */}
        {ORBIT_NODES.map((node, idx) => {
          const branch = branchMap.get(node.branchId);
          if (!branch) return null;

          const bUnits = content.units.filter((u) => u.branchId === node.branchId);
          const clearedInBranch = bUnits.filter((u) => isUnitCleared(u.id, telemetry)).length;
          const displayCleared = demoFallback
            ? Math.min(bUnits.length, idx === 0 ? 2 : idx % 2 === 0 ? 1 : 0)
            : clearedInBranch;
          const ratio = bUnits.length > 0 ? displayCleared / bUnits.length : 0;

          const hasMilestoneFruit =
            branch.tracks.some((t) => telemetry.milestoneSubmissions[t.id]?.isApproved) ||
            (demoFallback && node.branchId === 'B1');

          const isSelected = selectedBranchId === node.branchId;
          const nodeR = isWall ? 20 : 22;
          const ringC = 2 * Math.PI * (nodeR + 3);
          const ringOffset = ringC * (1 - ratio);

          return (
            <g
              key={node.branchId}
              style={{ cursor: onSelectBranch ? 'pointer' : 'default' }}
              onClick={() => onSelectBranch?.(node.branchId)}
            >
              {/* 中心到节点的连线 */}
              <line
                x1={CX}
                y1={CY}
                x2={node.x}
                y2={node.y}
                stroke={
                  isSelected
                    ? accentColor
                    : ratio > 0
                      ? growthColor
                      : lineColor
                }
                strokeWidth={isSelected ? 2 : 1.25}
                opacity={selectedBranchId && !isSelected && !isWall ? 0.45 : 1}
              />

              {/* 外圈完成度环 */}
              <circle
                cx={node.x}
                cy={node.y}
                r={nodeR + 3}
                fill="none"
                stroke={raisedColor}
                strokeWidth="2.5"
              />
              {ratio > 0 && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeR + 3}
                  fill="none"
                  stroke={isSelected ? accentColor : growthColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={ringC}
                  strokeDashoffset={ringOffset}
                  transform={`rotate(-90 ${node.x} ${node.y})`}
                />
              )}

              {/* 节点主体圆 */}
              <circle
                cx={node.x}
                cy={node.y}
                r={nodeR}
                fill={isSelected ? accentColor : surfaceColor}
                stroke={isSelected ? accentColor : ratio > 0 ? growthColor : lineColor}
                strokeWidth={isSelected ? 2 : 1.3}
              >
                <title>
                  {branch.id} {branch.name}（{displayCleared}/{bUnits.length} 节已过关）
                </title>
              </circle>

              {/* 节点编号 */}
              <text
                x={node.x}
                y={node.y + 4.5}
                textAnchor="middle"
                fontSize={isWall ? '11.5' : '12'}
                fontFamily="var(--font-mono)"
                fontWeight="600"
                fill={isSelected ? '#ffffff' : textPrimary}
              >
                {branch.id}
              </text>

              {/* 实战验收果实小标 */}
              {hasMilestoneFruit && (
                <circle
                  cx={node.x + nodeR - 2}
                  cy={node.y - nodeR + 4}
                  r="4.5"
                  fill="#f0b35a"
                  stroke={surfaceColor}
                  strokeWidth="1.5"
                >
                  <title>{branch.name} · 已验收阶段实战产出</title>
                </circle>
              )}

              {/* 站内模式外置名称与进度标签 */}
              {!isWall && (
                <g>
                  <text
                    x={node.labelX}
                    y={node.labelY}
                    textAnchor={node.anchor}
                    fontSize="12.5"
                    fontWeight={isSelected ? '600' : '500'}
                    fill={isSelected ? accentColor : textPrimary}
                  >
                    {branch.name}
                  </text>
                  <text
                    x={node.labelX}
                    y={node.labelY + 15}
                    textAnchor={node.anchor}
                    fontSize="11"
                    fontFamily="var(--font-mono)"
                    fill={textMuted}
                  >
                    {bUnits.length > 0 ? `${displayCleared}/${bUnits.length} 节` : '规划中'}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* 中心总枢 */}
        <circle
          cx={CX}
          cy={CY}
          r={isWall ? 34 : 38}
          fill={surfaceColor}
          stroke={accentColor}
          strokeWidth="1.5"
        />
        <text
          x={CX}
          y={CY - 1}
          textAnchor="middle"
          fontSize={isWall ? '15' : '16'}
          fontFamily="var(--font-mono)"
          fontWeight="600"
          fill={textPrimary}
        >
          {demoFallback ? Math.max(clearedCount, 4) : clearedCount}/{totalUnits}
        </text>
        <text
          x={CX}
          y={CY + 16}
          textAnchor="middle"
          fontSize="10.5"
          fill={textMuted}
        >
          已点亮单元
        </text>
      </svg>

      {!isWall && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-[12.5px] text-[var(--ink-2)]">
          <span>
            已过关单元{' '}
            <strong className="font-mono-num text-[var(--ink-1)]">
              {clearedCount} / {totalUnits}
            </strong>{' '}
            · 阶段实战产出{' '}
            <strong className="font-mono-num text-[var(--ink-1)]">{approvedMilestones}</strong> 项
          </span>
          <span className="text-[var(--ink-3)]">正向点亮，断更不衰减；点击节点切换分支</span>
        </div>
      )}
    </div>
  );
}

export const SkillAtlasSvg = SkillTreeSvg;
