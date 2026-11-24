import { getLocalDateKey } from './db';
import type {
  TelemetrySnapshot,
  TrackGroup,
} from '../types/schema';

/** 判断政策、健康或法律来源是否已超过复核期（超期则自动挂「待复核」标签） */
export function isSourceExpired(reviewAfter?: string, refDateKey = getLocalDateKey()): boolean {
  if (!reviewAfter) return false;
  return refDateKey > reviewAfter;
}

/** 判断单个学习单元是否已过关（自测达标 + 行动任务完成） */
export function isUnitCleared(unitId: string, telemetry: TelemetrySnapshot): boolean {
  return telemetry.unitSubmissions[unitId]?.isCleared === true;
}

export interface TrackClearanceStatus {
  totalUnits: number;
  clearedUnits: number;
  allUnitsCleared: boolean;
  requiresMilestone: boolean;
  milestoneApproved: boolean;
  milestonePercent: number;
  isTrackCleared: boolean;
}

/** 计算一条路径或层级的完成与过关状态 */
export function getTrackClearanceStatus(
  track: TrackGroup,
  telemetry: TelemetrySnapshot
): TrackClearanceStatus {
  const totalUnits = track.unitIds.length;
  const clearedUnits = track.unitIds.filter((uid) => isUnitCleared(uid, telemetry)).length;
  const allUnitsCleared = totalUnits > 0 && clearedUnits === totalUnits;

  const requiresMilestone = Boolean(track.milestoneDeliverable);
  const msRecord = telemetry.milestoneSubmissions[track.id];
  const milestoneApproved = requiresMilestone ? msRecord?.isApproved === true : true;
  const milestonePercent = msRecord?.completionPercent ?? (allUnitsCleared && milestoneApproved ? 100 : 0);

  return {
    totalUnits,
    clearedUnits,
    allUnitsCleared,
    requiresMilestone,
    milestoneApproved,
    milestonePercent,
    isTrackCleared: allUnitsCleared && milestoneApproved,
  };
}

/**
 * 判断层级或分包是否已解锁：
 * - 无 unlockAfterTrackId 的路径（如 B1 L1、软件技能五包、B2–B7）默认解锁；
 * - 有 unlockAfterTrackId 的层级（如 B1 L2–L5）需前置层级全部单元过关且层级实战产出达标后解锁。
 */
export function isTrackUnlocked(
  track: TrackGroup,
  allTracks: TrackGroup[],
  telemetry: TelemetrySnapshot
): boolean {
  if (!track.unlockAfterTrackId) return true;
  const prereq = allTracks.find((t) => t.id === track.unlockAfterTrackId);
  if (!prereq) return true;
  return getTrackClearanceStatus(prereq, telemetry).isTrackCleared;
}

export interface PassGateEvaluation {
  quizPassed: boolean;
  actionFilled: boolean;
  feynmanFilled: boolean;
  canClearUnit: boolean;
  blockingReasons: string[];
}

/** 校验单元过关门禁（自测达标 + 行动交付填写 + 可选费曼一句话复述） */
export function evaluateUnitPassGate(params: {
  quizScoreRatio: number;
  passRatio: number;
  deliverableSummary: string;
  requiresFeynman: boolean;
  feynmanOneLiner: string;
}): PassGateEvaluation {
  const quizPassed = params.quizScoreRatio >= params.passRatio;
  const actionFilled = params.deliverableSummary.trim().length >= 4;
  const feynmanFilled = !params.requiresFeynman || params.feynmanOneLiner.trim().length >= 4;

  const blockingReasons: string[] = [];
  if (!quizPassed) {
    blockingReasons.push(
      `自测尚未达标（当前 ${Math.round(params.quizScoreRatio * 100)}%，需达到 ${Math.round(
        params.passRatio * 100
      )}%）`
    );
  }
  if (!actionFilled) {
    blockingReasons.push('请填写行动任务的真实执行记录或交付摘要（至少 4 个字）');
  }
  if (!feynmanFilled) {
    blockingReasons.push('请填写费曼一句话原理复述（至少 4 个字）');
  }

  return {
    quizPassed,
    actionFilled,
    feynmanFilled,
    canClearUnit: quizPassed && actionFilled && feynmanFilled,
    blockingReasons,
  };
}
