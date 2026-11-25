import { useEffect, useState } from 'preact/hooks';
import {
  IconArrowRight,
  IconCheck,
  IconChevron,
  IconExternal,
  IconLock,
} from '../components/Icons';
import { RichText } from '../components/RichText';
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
  fragment: '碎片轻读',
  peak: '高精力时段',
  low: '低精力回顾',
} as const;

export function BranchesView({
  content,
  telemetry,
  initialBranchId = 'B1',
  onOpenUnit,
  onSaveMilestone,
}: BranchesViewProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<BranchId>(initialBranchId);
  const [b1LineTab, setB1LineTab] = useState<'ai' | 'software'>('ai');

  useEffect(() => {
    setSelectedBranchId(initialBranchId);
  }, [initialBranchId]);
  const [showRedlines, setShowRedlines] = useState<boolean>(false);
  const [expandedLockedTracks, setExpandedLockedTracks] = useState<Record<string, boolean>>({});
  const [editingMilestoneTrackId, setEditingMilestoneTrackId] = useState<string | null>(null);
  const [milestoneDraft, setMilestoneDraft] = useState<string>('');

  const branch =
    content.catalog.branches.find((b) => b.id === selectedBranchId) ??
    content.catalog.branches[0];

  const unitMap = new Map<string, LearningUnit>(content.units.map((u) => [u.id, u]));

  const toggleLockedTrack = (trackId: string) => {
    setExpandedLockedTracks((prev) => ({ ...prev, [trackId]: !prev[trackId] }));
  };

  const renderTrackCard = (
    track: TrackGroup,
    allBranchTracks: TrackGroup[],
    isFeaturedSoftware = false
  ) => {
    const unlocked = isTrackUnlocked(track, allBranchTracks, telemetry);
    const status = getTrackClearanceStatus(track, telemetry);
    const prereqTrack = track.unlockAfterTrackId
      ? allBranchTracks.find((t) => t.id === track.unlockAfterTrackId)
      : undefined;
    const msRecord = telemetry.milestoneSubmissions[track.id];

    // 锁定阶段默认折叠为单行紧凑路线图，消除数屏重复灰框
    if (!unlocked) {
      const isOpen = Boolean(expandedLockedTracks[track.id]);
      return (
        <article key={track.id} class="locked-roadmap-item">
          <button
            type="button"
            class="locked-roadmap-trigger"
            aria-expanded={isOpen}
            onClick={() => toggleLockedTrack(track.id)}
          >
            <div class="locked-roadmap-left">
              <span class="locked-icon-pill">
                <IconLock size={14} />
              </span>
              <div class="locked-roadmap-copy">
                <div class="locked-roadmap-title">{track.title}</div>
                <div class="locked-roadmap-sub">{track.summary}</div>
              </div>
            </div>
            <div class="locked-roadmap-right">
              <span class="status-chip chip-muted">
                完成「{prereqTrack?.title.split('·')[0].trim() ?? '前置阶段'}」解锁
              </span>
              <IconChevron size={16} class={`chevron-rotate ${isOpen ? 'is-open' : ''}`} />
            </div>
          </button>

          {isOpen && (
            <div class="locked-roadmap-body">
              {track.milestoneDeliverable && (
                <div class="locked-milestone-preview">
                  <strong>本阶目标产出：</strong>
                  {track.milestoneDeliverable.title}
                </div>
              )}
              {track.curatedResources.length > 0 && (
                <div class="curated-resources-box">
                  <div class="curated-resources-title">精选公开先导参考</div>
                  <ul class="curated-resources-list">
                    {track.curatedResources.map((res) => (
                      <li key={res.url + res.title}>
                        <a href={res.url} target="_blank" rel="noreferrer" class="inline-ext-link">
                          {res.title} <IconExternal size={12} />
                        </a>
                        <span class="resource-org">（{res.org}）</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </article>
      );
    }

    const openMilestoneDrawer = () => {
      setEditingMilestoneTrackId(editingMilestoneTrackId === track.id ? null : track.id);
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
        class={`path-track-card ${status.isTrackCleared ? 'is-cleared' : ''} ${
          isFeaturedSoftware ? 'is-featured-pack' : ''
        }`}
      >
        <div class="path-track-header">
          <div>
            <div class="path-track-badges">
              {status.isTrackCleared ? (
                <span class="status-chip chip-growth">
                  <IconCheck size={13} /> 本阶已过关
                </span>
              ) : track.unitIds.length > 0 ? (
                <span class="status-chip chip-accent">当前开放</span>
              ) : (
                <span class="status-chip">参考清单</span>
              )}
              {track.unitIds.length > 0 && (
                <span class="status-chip tabular-num">
                  已完成 {status.clearedUnits} / {status.totalUnits} 节
                </span>
              )}
            </div>
            <h3 class="path-track-title">{track.title}</h3>
            <p class="path-track-summary">{track.summary}</p>
          </div>
        </div>

        {/* 单元清单：以发丝分割线串联，不再使用卡片套卡片 */}
        {track.unitIds.length > 0 ? (
          <div class="track-units-list">
            {track.unitIds.map((uid, idx) => {
              const unit = unitMap.get(uid);
              if (!unit) return null;
              const cleared = isUnitCleared(uid, telemetry);
              return (
                <div
                  key={uid}
                  class={`track-unit-item ${cleared ? 'is-unit-cleared' : ''}`}
                >
                  <div class="unit-step-badge tabular-num">
                    {cleared ? <IconCheck size={14} /> : `0${idx + 1}`}
                  </div>
                  <div class="track-unit-info">
                    <div class="track-unit-title">{unit.title}</div>
                    <div class="track-unit-meta">
                      <span class="tabular-num">约 {unit.estimatedMinutes} 分钟</span>
                      <span class="meta-sep">/</span>
                      <span>{ENERGY_LABELS[unit.recommendedEnergy]}</span>
                      <span class="meta-sep">/</span>
                      <span class="track-unit-action-inline">
                        行动：<RichText text={unit.actionTask.title} />
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class={`btn ${cleared ? 'btn-subtle' : 'btn-primary'} track-unit-cta`}
                    onClick={() => onOpenUnit(unit.id)}
                  >
                    <span>{cleared ? '回看单元' : '开始学习'}</span>
                    <IconArrowRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div class="empty-track-notice">
            本专题互动单元正在打磨中，可先通过下方精选公开官方文档提前上手。
          </div>
        )}

        {/* 本阶实战产出验收区 */}
        {track.milestoneDeliverable && (
          <div class="milestone-deliverable-box">
            <div class="milestone-header-row">
              <div>
                <div class="milestone-eyebrow">阶段实战产出验收</div>
                <div class="milestone-title">{track.milestoneDeliverable.title}</div>
              </div>
              <div class="btn-row">
                <span
                  class={`status-chip tabular-num ${status.milestoneApproved ? 'chip-growth' : ''}`}
                >
                  {status.milestoneApproved ? '已验收' : `进度 ${status.milestonePercent}%`}
                </span>
                <button type="button" class="btn btn-sm" onClick={openMilestoneDrawer}>
                  {status.milestoneApproved ? '更新记录' : '登记产出'}
                </button>
              </div>
            </div>
            <ul class="milestone-criteria-list">
              {track.milestoneDeliverable.criteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {msRecord?.artifactSummary && (
              <div class="milestone-saved-note">已归档记录：{msRecord.artifactSummary}</div>
            )}
            {editingMilestoneTrackId === track.id && (
              <div class="milestone-editor">
                <textarea
                  rows={2}
                  placeholder="填写你的实战产出文件路径、仓库链接或交付要点…"
                  value={milestoneDraft}
                  onInput={(e) => setMilestoneDraft((e.target as HTMLTextAreaElement).value)}
                />
                <div class="btn-row" style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    disabled={track.unitIds.length > 0 && !status.allUnitsCleared}
                    onClick={handleApproveMilestone}
                  >
                    {track.unitIds.length > 0 && !status.allUnitsCleared
                      ? '请先完成本阶全部单元过关'
                      : '确认本阶实战产出达标'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 公开权威参考资源 */}
        {track.curatedResources.length > 0 && (
          <div class="curated-resources-box">
            <div class="curated-resources-title">精选公开权威参考</div>
            <ul class="curated-resources-list">
              {track.curatedResources.map((res) => (
                <li key={res.url + res.title}>
                  <a href={res.url} target="_blank" rel="noreferrer" class="inline-ext-link">
                    {res.title} <IconExternal size={12} />
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
  const swLivePacks = b1SwTracks.filter((t) => t.unitIds.length > 0);
  const swPlannedPacks = b1SwTracks.filter((t) => t.unitIds.length === 0);

  return (
    <div class="branches-view">
      <header class="page-header-strip">
        <div>
          <h1 class="page-h1">七大生存分支与技能树</h1>
          <p class="page-subtitle">
            从生活与科研的真实问题出发，点亮对应分支叶片，不要求线性刷完所有学科。
          </p>
        </div>
      </header>

      {/* 顶部双栏总览：55% 精绘矢量技能树 + 45% 七分支垂直列表切换器 */}
      <section class="branches-overview-split" aria-label="技能树与七分支切换">
        <div class="surface-card tree-stage-card">
          <SkillTreeSvg
            content={content}
            telemetry={telemetry}
            variant="living"
            selectedBranchId={branch.id}
            onSelectBranch={setSelectedBranchId}
          />
        </div>

        <div class="surface-card branch-selector-panel" role="tablist" aria-label="七大生存分支列表">
          <div class="selector-panel-head">选择探索分支</div>
          <div class="branch-vertical-list">
            {content.catalog.branches.map((b) => {
              const branchUnits = content.units.filter((u) => u.branchId === b.id);
              const clearedCount = branchUnits.filter((u) => isUnitCleared(u.id, telemetry)).length;
              const pct =
                branchUnits.length > 0 ? Math.round((clearedCount / branchUnits.length) * 100) : 0;
              const isSelected = b.id === branch.id;

              return (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  class={`branch-list-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedBranchId(b.id)}
                >
                  <span class="branch-dot" style={{ backgroundColor: b.accentToken }} />
                  <span class="branch-list-id tabular-num">{b.id}</span>
                  <span class="branch-list-name">{b.name}</span>
                  <div class="branch-list-meter">
                    <div class="slim-bar-track">
                      <div
                        class="slim-bar-fill"
                        style={{ width: `${pct}%`, backgroundColor: b.accentToken }}
                      />
                    </div>
                  </div>
                  <span class="branch-list-stat tabular-num">
                    {branchUnits.length > 0 ? `${clearedCount}/${branchUnits.length}` : '规划中'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 选中分支页头与折叠式合规准则 */}
      <section class="branch-active-header">
        <div class="branch-active-title-row">
          <div>
            <div class="branch-dot-label">
              <span class="branch-dot" style={{ backgroundColor: branch.accentToken }} />
              <span class="tabular-num">{branch.id}</span>
              <span>{branch.name}</span>
            </div>
            <h2 class="branch-active-h2">{branch.subtitle}</h2>
          </div>

          <button
            type="button"
            class="btn btn-sm"
            aria-expanded={showRedlines}
            onClick={() => setShowRedlines((v) => !v)}
          >
            <span>选材与合规准则</span>
            <IconChevron size={14} class={`chevron-rotate ${showRedlines ? 'is-open' : ''}`} />
          </button>
        </div>

        {showRedlines && (
          <div class="branch-redlines-drawer">
            <ul>
              {branch.redLineRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* B1 双轨分段切换 vs B2–B7 单线路径 */}
      {branch.id === 'B1' ? (
        <div class="b1-dual-tracks">
          <div class="segmented-bar" role="tablist" aria-label="B1 主线切换">
            <button
              type="button"
              role="tab"
              aria-selected={b1LineTab === 'ai'}
              class={`segmented-btn ${b1LineTab === 'ai' ? 'is-active' : ''}`}
              onClick={() => setB1LineTab('ai')}
            >
              AI 能力线（L1–L5 逐层解锁）
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={b1LineTab === 'software'}
              class={`segmented-btn ${b1LineTab === 'software' ? 'is-active' : ''}`}
              onClick={() => setB1LineTab('software')}
            >
              软件技能分包（Blender bpy 即学即用）
            </button>
          </div>

          {b1LineTab === 'ai' ? (
            <section aria-label="AI 能力线五层递进路径" class="tracks-stack">
              {b1AiTracks.map((t) => renderTrackCard(t, b1AiTracks))}
            </section>
          ) : (
            <section aria-label="软件技能线按包学习" class="software-layout-stack">
              <div class="tracks-stack">
                {swLivePacks.map((t) => renderTrackCard(t, b1SwTracks, true))}
              </div>
              {swPlannedPacks.length > 0 && (
                <div>
                  <div class="timeline-section-label">后续规划工具包（已附精选公开文档）</div>
                  <div class="planned-packs-grid">
                    {swPlannedPacks.map((t) => renderTrackCard(t, b1SwTracks, false))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <section aria-label={`${branch.name}学习路径图`} class="tracks-stack">
          {branch.tracks.map((t) => renderTrackCard(t, branch.tracks))}
        </section>
      )}
    </div>
  );
}
