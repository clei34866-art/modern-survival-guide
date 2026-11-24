import { useState } from 'preact/hooks';
import { SkillTreeSvg } from '../components/SkillTreeSvg';
import type { PlatformContentBundle } from '../core/contentLoader';
import {
  getTrackClearanceStatus,
  isTrackUnlocked,
  isUnitCleared,
} from '../core/gatekeeper';
import type {
  BranchId,
  LearningUnit,
  TelemetrySnapshot,
  TrackGroup,
} from '../types/schema';

interface BranchesViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  initialBranchId?: BranchId;
  onOpenUnit: (unitId: string) => void;
  onSaveMilestone: (input: {
    trackId: string;
    branchId: BranchId;
    completionPercent: number;
    artifactSummary: string;
    isApproved: boolean;
  }) => Promise<void>;
}

const ENERGY_LABELS = {
  fragment: '早间/碎片',
  peak: '高精力时段',
  low: '低精力轻学',
} as const;

export function BranchesView({
  content,
  telemetry,
  initialBranchId = 'B1',
  onOpenUnit,
  onSaveMilestone,
}: BranchesViewProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<BranchId>(initialBranchId);
  const [editingMilestoneTrackId, setEditingMilestoneTrackId] = useState<string | null>(null);
  const [milestoneDraft, setMilestoneDraft] = useState<string>('');

  const branch =
    content.catalog.branches.find((b) => b.id === selectedBranchId) ??
    content.catalog.branches[0];

  const unitMap = new Map<string, LearningUnit>(content.units.map((u) => [u.id, u]));

  const renderTrackCard = (track: TrackGroup, allBranchTracks: TrackGroup[]) => {
    const unlocked = isTrackUnlocked(track, allBranchTracks, telemetry);
    const status = getTrackClearanceStatus(track, telemetry);
    const prereqTrack = track.unlockAfterTrackId
      ? allBranchTracks.find((t) => t.id === track.unlockAfterTrackId)
      : undefined;
    const msRecord = telemetry.milestoneSubmissions[track.id];

    const openMilestoneDrawer = () => {
      setEditingMilestoneTrackId(
        editingMilestoneTrackId === track.id ? null : track.id
      );
      setMilestoneDraft(msRecord?.artifactSummary ?? '');
    };

    const handleApproveMilestone = async () => {
      await onSaveMilestone({
        trackId: track.id,
        branchId: branch.id,
        completionPercent: 100,
        artifactSummary:
          milestoneDraft.trim() || `已完成「${track.milestoneDeliverable?.title ?? track.title}」验收`,
        isApproved: true,
      });
      setEditingMilestoneTrackId(null);
    };

    return (
      <article
        key={track.id}
        class={`path-track-card ${!unlocked ? 'is-locked' : ''} ${
          status.isTrackCleared ? 'is-cleared' : ''
        }`}
      >
        <div class="path-track-header">
          <div>
            <div class="path-track-badges">
              {status.isTrackCleared ? (
                <span class="badge-pill badge-live">✓ 本阶已过关</span>
              ) : unlocked ? (
                <span class="badge-pill">当前可学</span>
              ) : (
                <span class="badge-pill badge-locked">
                  🔒 需先过关「{prereqTrack?.title ?? track.unlockAfterTrackId}」解锁
                </span>
              )}
              {track.unitIds.length > 0 && (
                <span class="badge-pill">
                  单元进度 {status.clearedUnits} / {status.totalUnits}
                </span>
              )}
            </div>
            <h3 class="path-track-title">{track.title}</h3>
            <p class="path-track-summary">{track.summary}</p>
          </div>
        </div>

        {/* 学习单元路径节点列表 */}
        {track.unitIds.length > 0 ? (
          <div class="track-units-list">
            {track.unitIds.map((uid, idx) => {
              const unit = unitMap.get(uid);
              if (!unit) return null;
              const cleared = isUnitCleared(uid, telemetry);
              return (
                <div
                  key={uid}
                  class={`track-unit-item ${cleared ? 'is-unit-cleared' : ''} ${
                    unit.isPlaceholder ? 'is-placeholder-dashed' : ''
                  }`}
                >
                  <div class="track-unit-info">
                    <div class="track-unit-meta">
                      <span class="unit-step-index">0{idx + 1}</span>
                      <span>约 {unit.estimatedMinutes} 分钟</span>
                      <span>· {ENERGY_LABELS[unit.recommendedEnergy]}</span>
                      {unit.isPlaceholder && (
                        <span class="badge-pill badge-demo">示例占位</span>
                      )}
                      {cleared && <span class="badge-pill badge-live">✓ 已过关</span>}
                    </div>
                    <div class="track-unit-title">
                      {unit.title.replace(/^【示例占位】/, '')}
                    </div>
                    <div class="track-unit-action-hint">
                      实战行动：{unit.actionTask.title}
                    </div>
                  </div>
                  <button
                    type="button"
                    class={cleared ? '' : 'btn-primary'}
                    disabled={!unlocked}
                    onClick={() => onOpenUnit(unit.id)}
                  >
                    {!unlocked ? '待解锁' : cleared ? '回看单元' : '开始学习 →'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div class="empty-track-notice">
            目录骨架已就绪（按总方案范围：本节正文将于对应内容批次灌装，下方已附公开权威资源入口）。
          </div>
        )}

        {/* 层级 / 软件分包实战产出物验收位 */}
        {track.milestoneDeliverable && (
          <div class="milestone-deliverable-box">
            <div class="milestone-header-row">
              <div>
                <span class="milestone-eyebrow">本阶实战产出验收位</span>
                <div class="milestone-title">{track.milestoneDeliverable.title}</div>
              </div>
              <div class="btn-row">
                <span
                  class={`badge-pill ${
                    status.milestoneApproved ? 'badge-live' : ''
                  }`}
                >
                  {status.milestoneApproved
                    ? '✓ 产出已验收'
                    : `完成度 ${status.milestonePercent}%`}
                </span>
                {unlocked && (
                  <button type="button" class="btn-sm" onClick={openMilestoneDrawer}>
                    {status.milestoneApproved ? '查看/更新产出' : '登记产出验收'}
                  </button>
                )}
              </div>
            </div>
            <ul class="milestone-criteria-list">
              {track.milestoneDeliverable.criteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {msRecord?.artifactSummary && (
              <div class="milestone-saved-note">
                已提交记录：{msRecord.artifactSummary}
              </div>
            )}
            {editingMilestoneTrackId === track.id && (
              <div class="milestone-editor">
                <textarea
                  rows={2}
                  placeholder="填写你的实战产出文件路径、仓库链接或交付要点摘要…"
                  value={milestoneDraft}
                  onInput={(e) =>
                    setMilestoneDraft((e.target as HTMLTextAreaElement).value)
                  }
                />
                <div class="btn-row" style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    class="btn-primary btn-sm"
                    disabled={track.unitIds.length > 0 && !status.allUnitsCleared}
                    onClick={handleApproveMilestone}
                  >
                    {track.unitIds.length > 0 && !status.allUnitsCleared
                      ? '需先完成本阶全部学习单元过关'
                      : '确认本阶实战产出达标'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 权威公开资源清单 */}
        {track.curatedResources.length > 0 && (
          <div class="curated-resources-box">
            <div class="curated-resources-title">公开权威参考资源清单</div>
            <ul class="curated-resources-list">
              {track.curatedResources.map((res) => (
                <li key={res.url + res.title}>
                  <a href={res.url} target="_blank" rel="noreferrer">
                    {res.title} ↗
                  </a>
                  <span class="resource-org">（{res.org}）</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    );
  };

  const b1AiTracks = branch.tracks.filter((t) => t.kind === 'layered_stage');
  const b1SwTracks = branch.tracks.filter((t) => t.kind === 'software_pack');

  return (
    <div class="branches-view">
      {/* M6：eudaimonia 七分支生存技能树可视化 */}
      <section class="section-card" aria-label="eudaimonia 生存技能树">
        <SkillTreeSvg
          content={content}
          telemetry={telemetry}
          variant="living"
          selectedBranchId={branch.id}
          onSelectBranch={setSelectedBranchId}
        />
      </section>

      {/* 顶部分支切换卡片带 */}
      <div class="branch-tabs-strip" role="tablist" aria-label="七大生存分支切换">
        {content.catalog.branches.map((b) => {
          const branchUnits = content.units.filter((u) => u.branchId === b.id);
          const clearedCount = branchUnits.filter((u) =>
            isUnitCleared(u.id, telemetry)
          ).length;
          const isSelected = b.id === branch.id;

          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              class={`branch-tab-btn ${isSelected ? 'is-selected' : ''}`}
              style={
                isSelected
                  ? { borderColor: b.accentToken, boxShadow: `0 2px 10px ${b.accentToken}22` }
                  : undefined
              }
              onClick={() => setSelectedBranchId(b.id)}
            >
              <span class="branch-tag" style={{ backgroundColor: b.accentToken }}>
                {b.id}
              </span>
              <span class="branch-tab-name">{b.name}</span>
              <span class="branch-tab-stat">
                {branchUnits.length > 0
                  ? `${clearedCount}/${branchUnits.length} 节`
                  : '骨架就绪'}
              </span>
            </button>
          );
        })}
      </div>

      {/* 当前选中分支头部与红线说明 */}
      <section class="section-card branch-hero-card">
        <div class="branch-hero-top">
          <div>
            <span
              class="branch-tag"
              style={{ backgroundColor: branch.accentToken }}
            >
              {branch.id} · {branch.name}
            </span>
            <h1 class="hero-title" style={{ marginTop: '4px' }}>
              {branch.name}：{branch.subtitle}
            </h1>
          </div>
        </div>
        <div class="branch-redlines-box">
          <strong>本分支选材与合规准则：</strong>
          <ul>
            {branch.redLineRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* B1 专属双轨视图 vs B2–B7 统一路径图视图 */}
      {branch.id === 'B1' ? (
        <div class="b1-dual-tracks">
          <section aria-label="AI 能力线五层递进路径">
            <h2 class="section-heading">
              <span>主线 A · AI 能力线（五层逐级过关解锁）</span>
              <span class="badge-pill">过关本层全部单元 + 实战产出 → 解锁下一层</span>
            </h2>
            <div class="tracks-stack">
              {b1AiTracks.map((t) => renderTrackCard(t, b1AiTracks))}
            </div>
          </section>

          <section aria-label="软件技能线按包学习" style={{ marginTop: '32px' }}>
            <h2 class="section-heading">
              <span>主线 B · 软件技能线（按软件独立分包，即学即用）</span>
              <span class="badge-pill">Blender (bpy) 先行 · 无需排队解锁</span>
            </h2>
            <div class="software-packs-grid">
              {b1SwTracks.map((t) => renderTrackCard(t, b1SwTracks))}
            </div>
          </section>
        </div>
      ) : (
        <section aria-label={`${branch.name}学习路径图`}>
          <h2 class="section-heading">
            <span>{branch.name} · 生存能力路径图</span>
            <span class="badge-pill">自测达标 + 行动完成 = 过关</span>
          </h2>
          <div class="tracks-stack">
            {branch.tracks.map((t) => renderTrackCard(t, branch.tracks))}
          </div>
        </section>
      )}
    </div>
  );
}
