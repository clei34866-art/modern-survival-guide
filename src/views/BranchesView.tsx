import { ArrowRight, Check, ChevronDown, ExternalLink, Lock, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RichText } from '@/components/RichText';
import { SkillAtlasSvg } from '@/components/SkillTreeSvg';
import { Badge, Button, Card, ProgressBar } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import {
  getTrackClearanceStatus,
  isTrackUnlocked,
  isUnitCleared,
} from '@/core/gatekeeper';
import { cn } from '@/lib/utils';
import type {
  BranchId,
  LearningUnit,
  TelemetrySnapshot,
  TrackGroup,
} from '@/types/schema';

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
  const [showRedlines, setShowRedlines] = useState<boolean>(false);
  const [expandedLockedTracks, setExpandedLockedTracks] = useState<Record<string, boolean>>({});
  const [editingMilestoneTrackId, setEditingMilestoneTrackId] = useState<string | null>(null);
  const [milestoneDraft, setMilestoneDraft] = useState<string>('');

  useEffect(() => {
    setSelectedBranchId(initialBranchId);
  }, [initialBranchId]);

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

    // 锁定阶段默认折叠为单行紧凑路线图
    if (!unlocked) {
      const isOpen = Boolean(expandedLockedTracks[track.id]);
      return (
        <article key={track.id} className="v3-card overflow-hidden">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-raised)]"
            aria-expanded={isOpen}
            onClick={() => toggleLockedTrack(track.id)}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-3)]">
                <Lock size={14} strokeWidth={1.6} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-medium text-[var(--ink-1)]">
                  {track.title}
                </div>
                <div className="truncate text-[12.5px] text-[var(--ink-3)]">{track.summary}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone="neutral">
                完成「{prereqTrack?.title.split('·')[0].trim() ?? '前置阶段'}」解锁
              </Badge>
              <ChevronDown
                size={16}
                strokeWidth={1.5}
                className={cn(
                  'text-[var(--ink-3)] transition-transform duration-150',
                  isOpen && 'rotate-180'
                )}
              />
            </div>
          </button>

          {isOpen && (
            <div className="space-y-3 border-t border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3.5 text-[13.5px]">
              {track.milestoneDeliverable && (
                <div className="text-[var(--ink-2)]">
                  <strong className="font-medium text-[var(--ink-1)]">本阶目标产出：</strong>
                  {track.milestoneDeliverable.title}
                </div>
              )}
              {track.curatedResources.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[12px] font-medium text-[var(--ink-3)]">
                    精选公开先导参考
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {track.curatedResources.map((res) => (
                      <li key={res.url + res.title} className="flex flex-wrap items-center gap-1.5">
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                        >
                          <span>{res.title}</span>
                          <ExternalLink size={12} strokeWidth={1.5} />
                        </a>
                        <span className="text-[12px] text-[var(--ink-3)]">（{res.org}）</span>
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
          milestoneDraft.trim() ||
          `已完成「${track.milestoneDeliverable?.title ?? track.title}」验收`,
        isApproved: true,
      });
      setEditingMilestoneTrackId(null);
    };

    return (
      <Card
        key={track.id}
        className={cn(
          'space-y-5',
          status.isTrackCleared && 'border-[var(--growth-border)]',
          isFeaturedSoftware && 'border-[var(--accent-border)]'
        )}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {status.isTrackCleared ? (
              <Badge tone="growth">
                <Check size={12} strokeWidth={2} />
                <span>本阶已过关</span>
              </Badge>
            ) : track.unitIds.length > 0 ? (
              <Badge tone="accent">当前开放</Badge>
            ) : (
              <Badge tone="neutral">参考清单</Badge>
            )}
            {track.unitIds.length > 0 && (
              <Badge tone="neutral" className="font-mono-num">
                已完成 {status.clearedUnits} / {status.totalUnits} 节
              </Badge>
            )}
          </div>
          <h3 className="m-0 text-[18px] font-semibold tracking-[-0.015em] text-[var(--ink-1)]">
            {track.title}
          </h3>
          <p className="m-0 text-[14px] text-[var(--ink-2)]">{track.summary}</p>
        </div>

        {/* 单元清单：以发丝分割线串联 */}
        {track.unitIds.length > 0 ? (
          <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {track.unitIds.map((uid, idx) => {
              const unit = unitMap.get(uid);
              if (!unit) return null;
              const cleared = isUnitCleared(uid, telemetry);
              return (
                <div
                  key={uid}
                  className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border font-mono-num text-[12px] font-semibold',
                        cleared
                          ? 'border-[var(--growth-border)] bg-[var(--growth-soft)] text-[var(--growth)]'
                          : 'border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink-2)]'
                      )}
                    >
                      {cleared ? <Check size={14} strokeWidth={2.2} /> : `0${idx + 1}`}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <div className="text-[15px] font-medium text-[var(--ink-1)]">
                        {unit.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--ink-3)]">
                        <span className="font-mono-num">约 {unit.estimatedMinutes} 分钟</span>
                        <span>·</span>
                        <span>{ENERGY_LABELS[unit.recommendedEnergy]}</span>
                        <span>·</span>
                        <span className="text-[var(--ink-2)]">
                          行动：<RichText text={unit.actionTask.title} />
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant={cleared ? 'subtle' : 'primary'}
                    size="sm"
                    className="shrink-0 self-start sm:self-center"
                    onClick={() => onOpenUnit(unit.id)}
                  >
                    <span>{cleared ? '回看单元' : '开始学习'}</span>
                    <ArrowRight size={14} strokeWidth={1.6} />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="v3-card-raised px-3.5 py-3 text-[13.5px] text-[var(--ink-2)]">
            本专题互动单元正在打磨中，可先通过下方精选公开官方文档提前上手
          </div>
        )}

        {/* 本阶实战产出验收区 */}
        {track.milestoneDeliverable && (
          <div className="v3-card-raised space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11.5px] font-medium text-[var(--ink-3)]">
                  阶段实战产出验收
                </div>
                <div className="mt-0.5 text-[14.5px] font-semibold text-[var(--ink-1)]">
                  {track.milestoneDeliverable.title}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={status.milestoneApproved ? 'growth' : 'neutral'} className="font-mono-num">
                  {status.milestoneApproved ? '已验收' : `进度 ${status.milestonePercent}%`}
                </Badge>
                <Button size="sm" variant="outline" onClick={openMilestoneDrawer}>
                  {status.milestoneApproved ? '更新记录' : '登记产出'}
                </Button>
              </div>
            </div>

            <ul className="m-0 list-disc space-y-1 pl-5 text-[13px] text-[var(--ink-2)]">
              {track.milestoneDeliverable.criteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>

            {msRecord?.artifactSummary && (
              <div className="rounded-[8px] border border-[var(--growth-border)] bg-[var(--growth-soft)] px-3 py-2 text-[13px] text-[var(--ink-1)]">
                已归档记录：{msRecord.artifactSummary}
              </div>
            )}

            {editingMilestoneTrackId === track.id && (
              <div className="space-y-2.5 border-t border-[var(--line)] pt-3">
                <textarea
                  rows={2}
                  className="v3-textarea"
                  placeholder="填写你的实战产出文件路径、仓库链接或交付要点…"
                  value={milestoneDraft}
                  onChange={(e) => setMilestoneDraft(e.target.value)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={track.unitIds.length > 0 && !status.allUnitsCleared}
                  onClick={handleApproveMilestone}
                >
                  {track.unitIds.length > 0 && !status.allUnitsCleared
                    ? '请先完成本阶全部单元过关'
                    : '确认本阶实战产出达标'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 公开权威参考资源 */}
        {track.curatedResources.length > 0 && (
          <div className="space-y-2">
            <div className="text-[12px] font-medium text-[var(--ink-3)]">精选公开权威参考</div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13.5px]">
              {track.curatedResources.map((res) => (
                <li key={res.url + res.title} className="flex flex-wrap items-center gap-1.5">
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                  >
                    <span>{res.title}</span>
                    <ExternalLink size={12} strokeWidth={1.5} />
                  </a>
                  <span className="text-[12.5px] text-[var(--ink-3)]">（{res.org}）</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    );
  };

  const b1AiTracks = branch.tracks.filter((t) => t.kind === 'layered_stage');
  const b1SwTracks = branch.tracks.filter((t) => t.kind === 'software_pack');
  const swFeaturedPack = b1SwTracks.slice(0, 1);
  const swSecondaryPacks = b1SwTracks.slice(1);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="m-0 text-[24px] sm:text-[28px] font-semibold tracking-[-0.02em] text-[var(--ink-1)]">
          七大生存分支与技能星图
        </h1>
        <p className="m-0 text-[14.5px] text-[var(--ink-2)]">
          从真实问题出发按需点亮对应分支节点，不要求线性刷完所有学科
        </p>
      </header>

      {/* 顶部双栏总览：55% 径向技能星图 + 45% 七分支列表切换器 */}
      <section
        className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-stretch"
        aria-label="技能星图与七分支切换"
      >
        <Card className="flex flex-col justify-between p-5">
          <SkillAtlasSvg
            content={content}
            telemetry={telemetry}
            variant="living"
            selectedBranchId={branch.id}
            onSelectBranch={setSelectedBranchId}
          />
        </Card>

        <Card className="flex flex-col justify-between p-5" role="tablist" aria-label="七大生存分支列表">
          <div className="mb-3 text-[13px] font-medium text-[var(--ink-3)]">选择探索分支</div>
          <div className="flex flex-1 flex-col justify-between gap-1.5">
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
                  onClick={() => setSelectedBranchId(b.id)}
                  className={cn(
                    'grid min-h-[44px] w-full cursor-pointer grid-cols-[auto_32px_minmax(0,1fr)_80px_48px] items-center gap-2.5 rounded-[9px] border px-3 text-left transition-colors',
                    isSelected
                      ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                      : 'border-transparent bg-transparent text-[var(--ink-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink-1)]'
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: b.accentToken }}
                  />
                  <span className="font-mono-num text-[12.5px] font-semibold">{b.id}</span>
                  <span className="truncate text-[14px] font-medium">{b.name}</span>
                  <ProgressBar percent={pct} color={b.accentToken} />
                  <span className="text-right font-mono-num text-[12px] text-[var(--ink-3)]">
                    {branchUnits.length > 0 ? `${clearedCount}/${branchUnits.length}` : '规划中'}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </section>

      {/* 选中分支页头与折叠式合规准则 */}
      <section className="space-y-3 border-t border-[var(--line)] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[13px] text-[var(--ink-2)]">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: branch.accentToken }}
              />
              <span className="font-mono-num font-semibold">{branch.id}</span>
              <span className="font-medium text-[var(--ink-1)]">{branch.name}</span>
            </div>
            <h2 className="m-0 text-[20px] font-semibold text-[var(--ink-1)]">
              {branch.subtitle}
            </h2>
          </div>

          <Button
            size="sm"
            variant="outline"
            aria-expanded={showRedlines}
            onClick={() => setShowRedlines((v) => !v)}
          >
            <ShieldCheck size={14} strokeWidth={1.5} />
            <span>选材与合规准则</span>
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              className={cn('transition-transform duration-150', showRedlines && 'rotate-180')}
            />
          </Button>
        </div>

        {showRedlines && (
          <div className="v3-card-raised p-4 text-[13.5px] text-[var(--ink-2)]">
            <ul className="m-0 list-disc space-y-1.5 pl-5">
              {branch.redLineRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* B1 双轨切换 vs B2–B7 单线路径 */}
      {branch.id === 'B1' ? (
        <div className="space-y-5">
          <div
            className="inline-flex flex-wrap gap-1 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-1"
            role="tablist"
            aria-label="B1 主线切换"
          >
            <button
              type="button"
              role="tab"
              aria-selected={b1LineTab === 'ai'}
              onClick={() => setB1LineTab('ai')}
              className={cn(
                'min-h-[38px] cursor-pointer rounded-[7px] px-3.5 text-[13.5px] font-medium transition-colors',
                b1LineTab === 'ai'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              )}
            >
              AI 能力线（L1–L5 逐层解锁）
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={b1LineTab === 'software'}
              onClick={() => setB1LineTab('software')}
              className={cn(
                'min-h-[38px] cursor-pointer rounded-[7px] px-3.5 text-[13.5px] font-medium transition-colors',
                b1LineTab === 'software'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              )}
            >
              软件技能分包（Blender bpy 即学即用）
            </button>
          </div>

          {b1LineTab === 'ai' ? (
            <section aria-label="AI 能力线五层递进路径" className="space-y-4">
              {b1AiTracks.map((t) => renderTrackCard(t, b1AiTracks))}
            </section>
          ) : (
            <section aria-label="软件技能线按包学习" className="space-y-6">
              <div className="space-y-4">
                {swFeaturedPack.map((t) => renderTrackCard(t, b1SwTracks, true))}
              </div>
              {swSecondaryPacks.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[13px] font-medium text-[var(--ink-3)]">
                    高频效率软件技能分包（独立开放 · 即学即用）
                  </div>
                  <div className="planned-packs-grid grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                    {swSecondaryPacks.map((t) => renderTrackCard(t, b1SwTracks, false))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <section aria-label={`${branch.name}学习路径图`} className="space-y-4">
          {branch.tracks.map((t) => renderTrackCard(t, branch.tracks))}
        </section>
      )}
    </div>
  );
}
