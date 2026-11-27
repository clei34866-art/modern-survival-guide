import { type PointerEvent as ReactPointerEvent, useId, useMemo, useRef, useState } from 'react';
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

// 7 大领域的 3D 球体高光 / 主色 / 边缘漫反射配色
const BRANCH_PALETTE: Record<
  BranchId,
  { hi: string; mid: string; deep: string; rim: string }
> = {
  B1: { hi: '#b8dcff', mid: '#3b82f6', deep: '#0e2554', rim: '#7cc4ff' },
  B2: { hi: '#fde6bd', mid: '#e89b48', deep: '#452408', rim: '#f8c37c' },
  B3: { hi: '#ffc7d8', mid: '#e0638c', deep: '#461228', rim: '#fb9ebc' },
  B4: { hi: '#b9f6e8', mid: '#2ec4a6', deep: '#09342d', rim: '#5eead4' },
  B5: { hi: '#ffd4b8', mid: '#ea7a45', deep: '#491d0a', rim: '#f5a97f' },
  B6: { hi: '#d9c6ff', mid: '#8b68f0', deep: '#241452', rim: '#b49cff' },
  B7: { hi: '#c2eff7', mid: '#38aec4', deep: '#0c2f3b', rim: '#7be0f0' },
};

// 背景远景微星（确定性坐标，无随机闪烁）
const STAR_FIELD = [
  { x: 58, y: 46, r: 1.2, o: 0.45 },
  { x: 118, y: 88, r: 0.9, o: 0.32 },
  { x: 186, y: 34, r: 1.4, o: 0.52 },
  { x: 262, y: 58, r: 0.8, o: 0.28 },
  { x: 416, y: 42, r: 1.3, o: 0.48 },
  { x: 494, y: 66, r: 1.0, o: 0.36 },
  { x: 568, y: 48, r: 1.5, o: 0.56 },
  { x: 598, y: 124, r: 0.9, o: 0.3 },
  { x: 44, y: 174, r: 1.1, o: 0.34 },
  { x: 86, y: 292, r: 1.3, o: 0.44 },
  { x: 162, y: 344, r: 0.9, o: 0.28 },
  { x: 472, y: 332, r: 1.4, o: 0.46 },
  { x: 566, y: 274, r: 1.0, o: 0.36 },
  { x: 534, y: 164, r: 0.85, o: 0.25 },
  { x: 108, y: 222, r: 0.8, o: 0.24 },
  { x: 356, y: 364, r: 1.1, o: 0.35 },
];

// 各星球微幅 3D 高度起伏，增强真实空间星盘层次感
const NODE_ELEVATIONS = [-14, 12, -8, 16, -6, 14, -10];

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface ProjectedPoint {
  sx: number;
  sy: number;
  z: number;
  scale: number;
}

const CX = 320;
const CY = 196;
const FOCAL = 640;

/** 真 3D 俯视欧拉旋转 + 针孔透视投影（SVG +Y 向下：前方 z>0 位于下方且更大，后方 z<0 位于上方且更小） */
function project3D(p: Vec3, yaw: number, pitch: number, roll = -0.05): ProjectedPoint {
  // 1. 绕 Y 轴水平旋转（yaw）
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  const y1 = p.y;

  // 2. 俯视倾角（pitch > 0）：前景 z>0 向下投影、远景 z<0 向上投影
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = y1 * cp + z1 * sp;
  const z2 = -y1 * sp + z1 * cp;
  const x2 = x1;

  // 3. 轻度滚转（roll）
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const x3 = x2 * cr - y2 * sr;
  const y3 = x2 * sr + y2 * cr;

  const scale = FOCAL / (FOCAL - z2);
  return {
    sx: CX + x3 * scale,
    sy: CY + y3 * scale,
    z: z2,
    scale,
  };
}

/** 采样 3D 空间椭圆轨道路径，并拆成「核心后半段」与「核心前半段」以实现真实遮挡 */
function buildSplitOrbitPaths(
  radius: number,
  yOffset: number,
  yaw: number,
  pitch: number,
  roll: number,
  steps = 72
): { backPath: string; frontPath: string } {
  const pts: ProjectedPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(
      project3D(
        { x: Math.cos(a) * radius, y: yOffset, z: Math.sin(a) * radius },
        yaw,
        pitch,
        roll
      )
    );
  }

  let backPath = '';
  let frontPath = '';
  let inBack = false;
  let inFront = false;

  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const cmd = `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`;
    if (p.z <= 0) {
      backPath += inBack ? ` L ${cmd}` : ` M ${cmd}`;
      inBack = true;
      inFront = false;
    } else {
      frontPath += inFront ? ` L ${cmd}` : ` M ${cmd}`;
      inFront = true;
      inBack = false;
    }
  }
  return { backPath, frontPath };
}

/**
 * 立体 3D 轨道星盘图谱 v4.0（3D Perspective Orbital Constellation Atlas）
 * - 真 3D 透视投影 + 深度排序（后轨 → 背面星球 → 立体发光晶核 → 前轨 → 前排星球）
 * - 立体球体光照着彩 + 底座投影垂线 + 陀螺仪双倾角环
 * - 站内支持鼠标横向拖动 360° 旋转星盘与微视差倾斜，且始终保持标签零碰撞
 */
export function SkillTreeSvg({
  content,
  telemetry,
  variant = 'living',
  demoFallback = false,
  selectedBranchId,
  onSelectBranch,
}: SkillTreeSvgProps) {
  const uid = useId().replace(/:/g, '');
  const isWall = variant === 'wall';

  // 站内立体交互状态：默认 yaw=0（B1 位于正上方），pitch=0.62（约 35° 俯视立体角）
  const [yaw, setYaw] = useState<number>(0);
  const [hoverTilt, setHoverTilt] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [dragging, setDragging] = useState<boolean>(false);
  const dragRef = useRef<{ startX: number; startYaw: number; moved: boolean } | null>(null);

  const effectiveYaw = isWall ? 0.14 : yaw + hoverTilt.dx * 0.14;
  const effectivePitch = isWall ? 0.68 : 0.62 + hoverTilt.dy * 0.12;
  const effectiveRoll = isWall ? -0.09 : -0.05;

  const branchMap = useMemo(
    () => new Map(content.catalog.branches.map((b) => [b.id, b])),
    [content.catalog.branches]
  );

  const totalUnits = content.units.length;
  const clearedCount = content.units.filter((u) => isUnitCleared(u.id, telemetry)).length;
  const approvedMilestones = Object.values(telemetry.milestoneSubmissions).filter(
    (m) => m.isApproved
  ).length;

  const orbitR = isWall ? 122 : 156;
  const innerRingR = isWall ? 68 : 82;
  const basePlaneY = isWall ? 22 : 28;

  // 采样 3D 轨道与中心双陀螺仪光环（拆前后段实现真实 3D 穿插遮挡）
  const outerOrbit = useMemo(
    () => buildSplitOrbitPaths(orbitR, 0, effectiveYaw, effectivePitch, effectiveRoll),
    [orbitR, effectiveYaw, effectivePitch, effectiveRoll]
  );
  const floorOrbit = useMemo(
    () => buildSplitOrbitPaths(orbitR, basePlaneY, effectiveYaw, effectivePitch, effectiveRoll),
    [orbitR, basePlaneY, effectiveYaw, effectivePitch, effectiveRoll]
  );
  const innerGyroA = useMemo(
    () => buildSplitOrbitPaths(innerRingR, 0, effectiveYaw + 0.5, effectivePitch + 0.35, 0.28, 56),
    [innerRingR, effectiveYaw, effectivePitch]
  );
  const innerGyroB = useMemo(
    () => buildSplitOrbitPaths(innerRingR * 0.86, 0, effectiveYaw - 0.7, effectivePitch - 0.22, -0.34, 56),
    [innerRingR, effectiveYaw, effectivePitch]
  );

  // 计算全部 7 颗星球的 3D 投影、地面投影影点与无碰撞外置标签坐标
  const projectedNodes = useMemo(() => {
    const items = BRANCH_ORDER.map((branchId, idx) => {
      const branch = branchMap.get(branchId);
      const baseAngle = -Math.PI / 2 + (idx * 2 * Math.PI) / BRANCH_ORDER.length;
      const isSelected = selectedBranchId === branchId;
      const elev = (NODE_ELEVATIONS[idx] ?? 0) + (isSelected ? -10 : 0);

      const pos3d: Vec3 = {
        x: Math.cos(baseAngle) * orbitR,
        y: elev,
        z: Math.sin(baseAngle) * orbitR,
      };
      const floor3d: Vec3 = {
        x: pos3d.x,
        y: basePlaneY,
        z: pos3d.z,
      };

      const proj = project3D(pos3d, effectiveYaw, effectivePitch, effectiveRoll);
      const floorProj = project3D(floor3d, effectiveYaw, effectivePitch, effectiveRoll);

      const bUnits = content.units.filter((u) => u.branchId === branchId);
      const clearedInBranch = bUnits.filter((u) => isUnitCleared(u.id, telemetry)).length;
      const displayCleared = demoFallback
        ? Math.min(bUnits.length, idx === 0 ? 2 : idx % 2 === 0 ? 1 : 0)
        : clearedInBranch;
      const ratio = bUnits.length > 0 ? displayCleared / bUnits.length : 0;

      const hasMilestoneFruit =
        Boolean(branch?.tracks.some((t) => telemetry.milestoneSubmissions[t.id]?.isApproved)) ||
        (demoFallback && branchId === 'B1');

      const baseR = isWall ? 18.5 : 21.5;
      const nodeR = baseR * proj.scale * (isSelected ? 1.12 : 1);

      // 外置标签沿径向推出，确保左/右/上/下永不与球体或彼此碰撞
      const dx = proj.sx - CX;
      const dy = proj.sy - CY;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      let labelX = proj.sx + nx * (nodeR + 18);
      let labelY = proj.sy + ny * (nodeR + 18);
      let anchor: 'start' | 'middle' | 'end' = 'middle';

      if (Math.abs(nx) < 0.24) {
        anchor = 'middle';
        labelX = proj.sx;
        labelY = ny < 0 ? proj.sy - nodeR - 26 : proj.sy + nodeR + 24;
      } else if (nx > 0) {
        anchor = 'start';
        labelX = proj.sx + nodeR + 18;
        labelY = proj.sy + (ny > 0.35 ? 10 : ny < -0.35 ? -6 : 2);
      } else {
        anchor = 'end';
        labelX = proj.sx - nodeR - 18;
        labelY = proj.sy + (ny > 0.35 ? 10 : ny < -0.35 ? -6 : 2);
      }

      return {
        branchId,
        branch,
        idx,
        proj,
        floorProj,
        nodeR,
        ratio,
        displayCleared,
        totalInBranch: bUnits.length,
        hasMilestoneFruit,
        isSelected,
        labelX,
        labelY,
        anchor,
      };
    });

    // 按深度 z 从远到近排序（画家算法）
    return items.sort((a, b) => a.proj.z - b.proj.z);
  }, [
    branchMap,
    content.units,
    demoFallback,
    effectivePitch,
    effectiveRoll,
    effectiveYaw,
    isWall,
    orbitR,
    basePlaneY,
    selectedBranchId,
    telemetry,
  ]);

  const backNodes = projectedNodes.filter((n) => n.proj.z <= 0);
  const frontNodes = projectedNodes.filter((n) => n.proj.z > 0);
  const centerFloor = project3D({ x: 0, y: basePlaneY, z: 0 }, effectiveYaw, effectivePitch, effectiveRoll);

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (isWall) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startYaw: yaw, moved: false };
    setDragging(true);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (isWall) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    const ry = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    setHoverTilt({ dx: rx, dy: ry });

    if (dragRef.current) {
      const deltaX = e.clientX - dragRef.current.startX;
      if (Math.abs(deltaX) > 4) dragRef.current.moved = true;
      setYaw(dragRef.current.startYaw + deltaX * 0.0085);
    }
  };

  const handlePointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  const handlePointerLeave = () => {
    setHoverTilt({ dx: 0, dy: 0 });
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  const textPrimary = isWall ? '#f4f8ff' : 'var(--ink-1)';
  const textMuted = isWall ? '#b6c8e4' : 'var(--ink-3)';
  const accentColor = isWall ? '#6cb4ff' : 'var(--accent)';
  const growthColor = isWall ? '#5eead4' : 'var(--growth)';
  const orbitStroke = isWall ? 'rgba(186, 222, 255, 0.24)' : 'rgba(148, 198, 255, 0.28)';
  const floorStroke = isWall ? 'rgba(148, 198, 255, 0.12)' : 'rgba(148, 198, 255, 0.14)';

  const renderPlanetNode = (node: (typeof projectedNodes)[number]) => {
    if (!node.branch) return null;
    const pal = BRANCH_PALETTE[node.branchId];
    const depthAlpha = Math.max(0.68, Math.min(1, 0.84 + (node.proj.z / orbitR) * 0.18));
    const ringR = node.nodeR + 4.5 * node.proj.scale;
    const ringC = 2 * Math.PI * ringR;
    const ringOffset = ringC * (1 - node.ratio);

    // 立体能量连线控制点（微弧跃起）
    const midX = (CX + node.proj.sx) / 2;
    const midY = (CY + node.proj.sy) / 2 - 14 * node.proj.scale;

    return (
      <g
        key={node.branchId}
        opacity={selectedBranchId && !node.isSelected && !isWall ? depthAlpha * 0.72 : depthAlpha}
        style={{ cursor: onSelectBranch ? 'pointer' : 'default' }}
        onClick={(e) => {
          if (dragRef.current?.moved) return;
          e.stopPropagation();
          onSelectBranch?.(node.branchId);
        }}
      >
        {/* 投射到赤道基准面的椭圆软阴影 + 垂直定位细线（立体高度线索） */}
        <ellipse
          cx={node.floorProj.sx}
          cy={node.floorProj.sy}
          rx={node.nodeR * 0.78}
          ry={node.nodeR * 0.26}
          fill="rgba(3, 10, 28, 0.44)"
        />
        <line
          x1={node.proj.sx}
          y1={node.proj.sy + node.nodeR * 0.85}
          x2={node.floorProj.sx}
          y2={node.floorProj.sy}
          stroke={node.isSelected ? pal.rim : 'rgba(186, 222, 255, 0.20)'}
          strokeWidth="1"
          strokeDasharray="2 3"
        />

        {/* 核心到星球的 3D 弧形引力射线 */}
        <path
          d={`M ${CX} ${CY} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${node.proj.sx.toFixed(1)} ${node.proj.sy.toFixed(1)}`}
          fill="none"
          stroke={node.isSelected ? pal.rim : node.ratio > 0 ? growthColor : orbitStroke}
          strokeWidth={node.isSelected ? 1.8 : 1.05}
          opacity={node.isSelected ? 0.92 : 0.65}
        />

        {/* 选中时的立体倾斜行星光环（后半弧） */}
        {node.isSelected && (
          <ellipse
            cx={node.proj.sx}
            cy={node.proj.sy}
            rx={node.nodeR * 1.62}
            ry={node.nodeR * 0.52}
            transform={`rotate(-16 ${node.proj.sx} ${node.proj.sy})`}
            fill="none"
            stroke={pal.rim}
            strokeWidth="1.4"
            opacity="0.72"
          />
        )}

        {/* 球体柔光晕 */}
        {(node.isSelected || node.ratio > 0) && (
          <circle
            cx={node.proj.sx}
            cy={node.proj.sy}
            r={node.nodeR * 1.45}
            fill={`url(#${uid}-glow-${node.branchId})`}
            opacity={node.isSelected ? 0.85 : 0.45}
          />
        )}

        {/* 3D 体积球主体（左上方主高光 + 球面景深 + 右下暖/冷边缘反光） */}
        <circle
          cx={node.proj.sx}
          cy={node.proj.sy}
          r={node.nodeR}
          fill={`url(#${uid}-orb-${node.branchId})`}
          stroke={node.isSelected ? '#ffffff' : node.ratio > 0 ? pal.rim : 'rgba(210, 232, 255, 0.34)'}
          strokeWidth={node.isSelected ? 1.6 : 1.05}
        >
          <title>
            {node.branch.id} {node.branch.name}（{node.displayCleared}/{node.totalInBranch} 篇已读）
          </title>
        </circle>

        {/* 球体表面玻璃高光点 */}
        <ellipse
          cx={node.proj.sx - node.nodeR * 0.32}
          cy={node.proj.sy - node.nodeR * 0.34}
          rx={node.nodeR * 0.32}
          ry={node.nodeR * 0.17}
          transform={`rotate(-32 ${(node.proj.sx - node.nodeR * 0.32).toFixed(1)} ${(node.proj.sy - node.nodeR * 0.34).toFixed(1)})`}
          fill="rgba(255, 255, 255, 0.46)"
          pointerEvents="none"
        />

        {/* 进度光弧 */}
        {node.ratio > 0 && (
          <circle
            cx={node.proj.sx}
            cy={node.proj.sy}
            r={ringR}
            fill="none"
            stroke={node.isSelected ? '#ffffff' : pal.rim}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray={ringC}
            strokeDashoffset={ringOffset}
            transform={`rotate(-90 ${node.proj.sx} ${node.proj.sy})`}
          />
        )}

        {/* 星球编号 */}
        <text
          x={node.proj.sx}
          y={node.proj.sy + 4.2 * node.proj.scale}
          textAnchor="middle"
          fontSize={(isWall ? 10.5 : 11.5) * Math.max(0.88, node.proj.scale)}
          fontFamily="var(--font-mono)"
          fontWeight="600"
          fill="#ffffff"
          style={{ textShadow: '0 1px 6px rgba(4, 10, 26, 0.72)' }}
          pointerEvents="none"
        >
          {node.branch.id}
        </text>

        {/* 阶段实践产出金星标 */}
        {node.hasMilestoneFruit && (
          <circle
            cx={node.proj.sx + node.nodeR * 0.78}
            cy={node.proj.sy - node.nodeR * 0.72}
            r={4.2 * node.proj.scale}
            fill="#f5c06a"
            stroke="rgba(10, 22, 48, 0.88)"
            strokeWidth="1.4"
          >
            <title>{node.branch.name} · 已记录阶段成果</title>
          </circle>
        )}
      </g>
    );
  };

  const coreR = isWall ? 33 : 38;

  return (
    <div className={isWall ? 'skill-tree-wall-box' : 'skill-tree-living-box w-full'}>
      <svg
        viewBox={isWall ? '148 48 344 304' : '0 0 640 392'}
        className="block h-auto w-full select-none"
        role="img"
        aria-label="七大生活领域立体 3D 轨道星图"
        style={{
          cursor: isWall ? 'default' : dragging ? 'grabbing' : 'grab',
          touchAction: isWall ? 'auto' : 'pan-y',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <defs>
          {/* 中心立体晶核 3D 体积球着色 */}
          <radialGradient id={`${uid}-core-orb`} cx="34%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#e8f4ff" stopOpacity="0.96" />
            <stop offset="22%" stopColor="#6eb4ff" stopOpacity="0.90" />
            <stop offset="62%" stopColor="#1b438c" stopOpacity="0.94" />
            <stop offset="88%" stopColor="#0b1d45" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#5eead4" stopOpacity="0.65" />
          </radialGradient>

          <radialGradient id={`${uid}-core-aura`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5ea8ff" stopOpacity="0.34" />
            <stop offset="55%" stopColor="#5eead4" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#5ea8ff" stopOpacity="0" />
          </radialGradient>

          {/* 7 个分支的 3D 球体着色渐变 + 柔光晕 */}
          {BRANCH_ORDER.map((bid) => {
            const p = BRANCH_PALETTE[bid];
            return (
              <g key={bid}>
                <radialGradient id={`${uid}-orb-${bid}`} cx="32%" cy="28%" r="72%">
                  <stop offset="0%" stopColor={p.hi} />
                  <stop offset="32%" stopColor={p.mid} />
                  <stop offset="82%" stopColor={p.deep} />
                  <stop offset="100%" stopColor={p.rim} stopOpacity="0.85" />
                </radialGradient>
                <radialGradient id={`${uid}-glow-${bid}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={p.rim} stopOpacity="0.48" />
                  <stop offset="100%" stopColor={p.mid} stopOpacity="0" />
                </radialGradient>
              </g>
            );
          })}
        </defs>

        {/* 远景深空微星尘 */}
        {!isWall &&
          STAR_FIELD.map((st, idx) => (
            <circle
              key={idx}
              cx={st.x + hoverTilt.dx * -5}
              cy={st.y + hoverTilt.dy * -4}
              r={st.r}
              fill="#dcecff"
              opacity={st.o}
            />
          ))}

        {/* 赤道底座投影环（确立立体空间底面透视） */}
        <path
          d={floorOrbit.backPath}
          fill="none"
          stroke={floorStroke}
          strokeWidth="1"
          strokeDasharray="3 6"
        />
        <path
          d={floorOrbit.frontPath}
          fill="none"
          stroke={floorStroke}
          strokeWidth="1"
          strokeDasharray="3 6"
        />

        {/* 中心底座光影投影 */}
        <ellipse
          cx={centerFloor.sx}
          cy={centerFloor.sy}
          rx={coreR * 1.15}
          ry={coreR * 0.34}
          fill="rgba(4, 12, 32, 0.45)"
        />

        {/* 外层主轨道：后半弧（位于晶核后方） */}
        <path
          d={outerOrbit.backPath}
          fill="none"
          stroke={orbitStroke}
          strokeWidth="1.15"
          strokeDasharray="4 5"
          opacity="0.65"
        />

        {/* 内层双陀螺仪立体环：后半弧 */}
        <path
          d={innerGyroA.backPath}
          fill="none"
          stroke="rgba(130, 198, 255, 0.30)"
          strokeWidth="1.05"
        />
        <path
          d={innerGyroB.backPath}
          fill="none"
          stroke="rgba(245, 184, 154, 0.24)"
          strokeWidth="1"
        />

        {/* 后排星球（位于中心晶核后方，尺寸更小更远） */}
        {backNodes.map(renderPlanetNode)}

        {/* 中心 3D 发光晶核 */}
        <g>
          <circle cx={CX} cy={CY} r={coreR * 2.05} fill={`url(#${uid}-core-aura)`} />
          <circle
            cx={CX}
            cy={CY}
            r={coreR}
            fill={`url(#${uid}-core-orb)`}
            stroke="rgba(218, 238, 255, 0.56)"
            strokeWidth="1.35"
          />
          {/* 晶核顶部弧形高光 */}
          <ellipse
            cx={CX - coreR * 0.28}
            cy={CY - coreR * 0.36}
            rx={coreR * 0.38}
            ry={coreR * 0.16}
            transform={`rotate(-26 ${CX - coreR * 0.28} ${CY - coreR * 0.36})`}
            fill="rgba(255, 255, 255, 0.42)"
            pointerEvents="none"
          />
          <text
            x={CX}
            y={CY - 1}
            textAnchor="middle"
            fontSize={isWall ? '14.5' : '16'}
            fontFamily="var(--font-mono)"
            fontWeight="600"
            fill="#ffffff"
            style={{ textShadow: '0 2px 10px rgba(4, 12, 32, 0.72)' }}
          >
            {demoFallback ? Math.max(clearedCount, 4) : clearedCount}/{totalUnits}
          </text>
          <text
            x={CX}
            y={CY + 16}
            textAnchor="middle"
            fontSize="10"
            fill="rgba(232, 242, 255, 0.84)"
          >
            已读手册
          </text>
        </g>

        {/* 内层双陀螺仪立体环：前半弧（越过中心晶核前方，强立体穿插！） */}
        <path
          d={innerGyroA.frontPath}
          fill="none"
          stroke="rgba(164, 214, 255, 0.62)"
          strokeWidth="1.25"
        />
        <path
          d={innerGyroB.frontPath}
          fill="none"
          stroke="rgba(245, 194, 166, 0.48)"
          strokeWidth="1.15"
        />

        {/* 外层主轨道：前半弧（近处更明亮清晰） */}
        <path
          d={outerOrbit.frontPath}
          fill="none"
          stroke="rgba(196, 226, 255, 0.48)"
          strokeWidth="1.35"
        />

        {/* 前排星球（位于中心晶核前方，近大远小） */}
        {frontNodes.map(renderPlanetNode)}

        {/* 站内模式外置名称与进度标签（置于最顶层且保证零碰撞） */}
        {!isWall &&
          projectedNodes.map((node) => {
            if (!node.branch) return null;
            return (
              <g
                key={`lbl-${node.branchId}`}
                style={{ cursor: onSelectBranch ? 'pointer' : 'default' }}
                onClick={(e) => {
                  if (dragRef.current?.moved) return;
                  e.stopPropagation();
                  onSelectBranch?.(node.branchId);
                }}
              >
                <text
                  x={node.labelX}
                  y={node.labelY}
                  textAnchor={node.anchor}
                  fontSize="12.5"
                  fontWeight={node.isSelected ? '600' : '500'}
                  fill={node.isSelected ? accentColor : textPrimary}
                >
                  {node.branch.name}
                </text>
                <text
                  x={node.labelX}
                  y={node.labelY + 15}
                  textAnchor={node.anchor}
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                  fill={textMuted}
                >
                  {`${node.displayCleared}/${node.totalInBranch} 篇`}
                </text>
              </g>
            );
          })}
      </svg>

      {!isWall && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-[12.5px] text-[var(--ink-2)]">
          <span>
            已读手册{' '}
            <strong className="font-mono-num text-[var(--ink-1)]">
              {clearedCount} / {totalUnits}
            </strong>{' '}
            · 阶段沉淀{' '}
            <strong className="font-mono-num text-[var(--ink-1)]">{approvedMilestones}</strong> 项
          </span>
          <div className="flex items-center gap-2 text-[var(--ink-3)]">
            <span>左右拖动可旋转 3D 星图 · 点击星球切换领域</span>
            {Math.abs(yaw) > 0.08 && (
              <button
                type="button"
                onClick={() => setYaw(0)}
                className="cursor-pointer rounded-full border border-[var(--line-strong)] bg-transparent px-2 py-0.5 text-[11px] text-[var(--ink-2)] hover:text-[var(--ink-1)]"
              >
                复位视角
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const SkillAtlasSvg = SkillTreeSvg;
