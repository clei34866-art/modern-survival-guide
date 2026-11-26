import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { RichText } from '@/components/RichText';
import { SkillAtlasSvg } from '@/components/SkillTreeSvg';
import { Drawer, Tooltip } from '@/components/ui/overlays';
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
  onPreviewUnit: (unitId: string) => void;
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
  onPreviewUnit,
  onSaveMilestone,
}: BranchesViewProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<BranchId>(initialBranchId);
  const [b1LineTab, setB1LineTab] = useState<'ai' | 'software'>('ai');
  const [redlinesDrawerOpen, setRedlinesDrawerOpen] = useState<boolean>(false);
  const [expandedLockedTracks, setExpandedLockedTracks] = useState<Record<string, boolean>>({});
  const [milestoneDrawerTrack, setMilestoneDrawerTrack] = useState<TrackGroup | null>(null);
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

  const openMilestoneDrawer = (track: TrackGroup) => {
    const msRecord = telemetry.milestoneSubmissions[track.id];
    setMilestoneDraft(msRecord?.artifactSummary ?? '');
    setMilestoneDrawerTrack(track);
  };

  const activeMilestoneStatus = milestoneDrawerTrack
    ? getTrackClearanceStatus(milestoneDrawerTrack, telemetry)
    : null;

  const handleApproveMilestone = async () => {
    if (!milestoneDrawerTrack) return;
    await onSaveMilestone({
      trackId: milestoneDrawerTrack.id,
      branchId: branch.id,
      completionPercent: 100,
      artifactSummary:
        milestoneDraft.trim() ||
        `已完成「${milestoneDrawerTrack.milestoneDeliverable?.title ?? milestoneDrawerTrack.title}」验收`,
      isApproved: true,
    });
    setMilestoneDrawerTrack(null);
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

    if (!unlocked) {
      const isOpen = Boolean(expandedLockedTracks[track.id]);
      return (
        <article key={track.id} className="v3-card overflow-hidden">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-plate)]"
            aria-expanded={isOpen}
            onClick={() => toggleLockedTrack(track.id)}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-plate)] text-[var(--ink-3)]">
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
            <div className="space-y-3 border-t border-[var(--line)] bg-[var(--surface-plate)] px-4 py-3.5 text-[13.5px]">
              {track.milestoneDeliverable && (
                <div className="text-[var(--ink-2)]">
                  <strong className="font-medium text-[var(--ink-1)]">本阶目标产出：</strong>
                  {track.milestoneDeliverable.title}
                </div>
              )}
              {track.curatedResources.length > 0 && (
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
              )}
            </div>
          )}
        </article>
      );
    }

    return (
      <Card
        key={track.id}
        className={cn(
          'space-y-4',
          status.isTrackCleared && 'border-[var(--growth-border)]',
          isFeaturedSoftware && 'border-[var(--accent-border)]'
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {status.isTrackCleared ? (
                <Badge tone="growth">
                  <Check size={12} strokeWidth={2} />
                  <span>本阶已过关</span>
                </Badge>
              ) : (
                <Badge tone="accent">当前开放</Badge>
              )}
              {track.unitIds.length > 0 && (
                <Badge tone="neutral" className="font-mono-num">
                  {status.clearedUnits}/{status.totalUnits} 节
                </Badge>
              )}
            </div>
            <h3 className="m-0 text-[18px] font-semibold tracking-[-0.015em] text-[var(--ink-1)]">
              {track.title}
            </h3>
            <p className="m-0 text-[13.5px] text-[var(--ink-2)]">{track.summary}</p>
          </div>

          {track.milestoneDeliverable && (
            <Tooltip content="在右侧抽屉查看验收标准并登记实战产出">
              <Button size="sm" variant="outline" onClick={() => openMilestoneDrawer(track)}>
                <span>{status.milestoneApproved ? '已验收 · 更新' : '阶段产出登记'}</span>
              </Button>
            </Tooltip>
          )}
        </div>

        {/* 单元清单：支持抽屉速览 + 直接学习 */}
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {track.unitIds.map((uid, idx) => {
            const unit = unitMap.get(uid);
            if (!unit) return null;
            const cleared = isUnitCleared(uid, telemetry);
            return (
              <div
                key={uid}
                className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'font-mono-num mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border text-[12px] font-semibold',
                      cleared
                        ? 'border-[var(--growth-border)] bg-[var(--growth-soft)] text-[var(--growth)]'
                        : 'border-[var(--line-strong)] bg-[var(--surface-plate)] text-[var(--ink-2)]'
                    )}
                  >
                    {cleared ? <Check size={14} strokeWidth={2.2} /> : `0${idx + 1}`}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-[15px] font-medium text-[var(--ink-1)]">{unit.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--ink-3)]">
                      <span className="font-mono-num">{unit.estimatedMinutes}m</span>
                      <span>·</span>
                      <span>{ENERGY_LABELS[unit.recommendedEnergy]}</span>
                      <span>·</span>
                      <span className="text-[var(--ink-2)]">
                        <RichText text={unit.actionTask.title} />
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-center">
                  <Tooltip content="在右侧抽屉快速预览本节内容与步骤">
                    <Button
                      variant="subtle"
                      size="sm"
                      aria-label={`速览单元：${unit.title}`}
                      onClick={() => onPreviewUnit(unit.id)}
                    >
                      <BookOpen size={13} strokeWidth={1.6} />
                      <span>速览</span>
                    </Button>
                  </Tooltip>
                  <Button
                    variant={cleared ? 'outline' : 'primary'}
                    size="sm"
                    onClick={() => onOpenUnit(unit.id)}
                  >
                    <span>{cleared ? '回看' : '学习'}</span>
                    <ArrowRight size={13} strokeWidth={1.6} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 简洁阶段产出摘要条（完整表单收进右侧 Drawer） */}
        {track.milestoneDeliverable && msRecord?.artifactSummary && (
          <div className="rounded-[10px] border border-[var(--growth-border)] bg-[var(--growth-soft)] px-3.5 py-2 text-[13px] text-[var(--ink-1)]">
            已归档产出：{msRecord.artifactSummary}
          </div>
        )}

        {/* 精选公开权威参考 */}
        {track.curatedResources.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--ink-3)]">
            <span>权威参考：</span>
            {track.curatedResources.map((res) => (
              <a
                key={res.url + res.title}
                href={res.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
              >
                <span>{res.title}</span>
                <ExternalLink size={11} strokeWidth={1.6} />
              </a>
            ))}
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
      {/* 阶段实战产出登记 Drawer（原页面保留在后方，边看星图边填表单） */}
      <Drawer
        open={Boolean(milestoneDrawerTrack)}
        onOpenChange={(open) => {
          if (!open) setMilestoneDrawerTrack(null);
        }}
        title="阶段实战产出验收"
        description={milestoneDrawerTrack?.title}
        headerExtra={
          activeMilestoneStatus && (
            <Badge tone={activeMilestoneStatus.milestoneApproved ? 'growth' : 'neutral'}>
              {activeMilestoneStatus.milestoneApproved
                ? '已验收'
                : `单元 ${activeMilestoneStatus.clearedUnits}/${activeMilestoneStatus.totalUnits}`}
            </Badge>
          )
        }
        footer={
          milestoneDrawerTrack && activeMilestoneStatus && (
            <>
              <Button size="sm" variant="outline" onClick={() => setMilestoneDrawerTrack(null)}>
                取消
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={
                  milestoneDrawerTrack.unitIds.length > 0 &&
                  !activeMilestoneStatus.allUnitsCleared
                }
                onClick={handleApproveMilestone}
              >
                {milestoneDrawerTrack.unitIds.length > 0 &&
                !activeMilestoneStatus.allUnitsCleared
                  ? '请先完成本阶全部单元过关'
                  : '确认产出达标并归档'}
              </Button>
            </>
          )
        }
      >
        {milestoneDrawerTrack?.milestoneDeliverable && (
          <div className="space-y-4">
            <div className="glass-plate space-y-2 p-4">
              <div className="text-[12px] font-medium text-[var(--ink-3)]">目标交付物</div>
              <div className="text-[15.5px] font-semibold text-[var(--ink-1)]">
                {milestoneDrawerTrack.milestoneDeliverable.title}
              </div>
              <ul className="m-0 list-disc space-y-1.5 pl-5 text-[13.5px] leading-[1.6] text-[var(--ink-2)]">
                {milestoneDrawerTrack.milestoneDeliverable.criteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[13.5px] font-medium text-[var(--ink-1)]">
                你的实战产出摘要 / 仓库或文件路径
              </label>
              <textarea
                rows={4}
                className="v3-textarea"
                placeholder="填写你的实战产出文件路径、仓库链接或核心交付要点…"
                value={milestoneDraft}
                onChange={(e) => setMilestoneDraft(e.target.value)}
              />
            </div>
          </div>
        )}
      </Drawer>

      {/* 分支选材与合规准则 Drawer */}
      <Drawer
        open={redlinesDrawerOpen}
        onOpenChange={setRedlinesDrawerOpen}
        title={`${branch.id} ${branch.name} · 选材与合规准则`}
        description="全部学习内容严格遵循权威白名单来源与边界红线"
      >
        <div className="glass-plate p-4">
          <ul className="m-0 list-disc space-y-2.5 pl-5 text-[14px] leading-[1.7] text-[var(--ink-1)]">
            {branch.redLineRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </Drawer>

      <header className="space-y-1">
        <h1 className="sky-heading m-0 text-[24px] font-semibold tracking-[-0.02em] text-[var(--ink-1)] sm:text-[28px]">
          七大生存分支与技能星图
        </h1>
        <p className="sky-heading m-0 text-[14px] text-[var(--ink-2)]">
          从真实问题按需点亮节点，点击任意单元可右侧抽屉速览或直接进入互动课
        </p>
      </header>

      {/* 顶部双栏总览：径向星图 + 七分支列表 */}
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

        <Card
          className="flex flex-col justify-between p-5"
          role="tablist"
          aria-label="七大生存分支列表"
        >
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
                    'grid min-h-[44px] w-full cursor-pointer grid-cols-[auto_32px_minmax(0,1fr)_80px_48px] items-center gap-2.5 rounded-[10px] border px-3 text-left transition-colors',
                    isSelected
                      ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                      : 'border-transparent bg-transparent text-[var(--ink-2)] hover:bg-[var(--surface-plate)] hover:text-[var(--ink-1)]'
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: b.accentToken }}
                  />
                  <span className="font-mono-num text-[12.5px] font-semibold">{b.id}</span>
                  <span className="truncate text-[14px] font-medium">{b.name}</span>
                  <ProgressBar percent={pct} color={b.accentToken} />
                  <span className="font-mono-num text-right text-[12px] text-[var(--ink-3)]">
                    {`${clearedCount}/${branchUnits.length}`}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </section>

      {/* 选中分支页头（选材合规准则以右侧 Drawer 滑出） */}
      <section className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
        <div className="space-y-1">
          <div className="sky-heading flex items-center gap-2 text-[13px] text-[var(--ink-2)]">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: branch.accentToken }}
            />
            <span className="font-mono-num font-semibold">{branch.id}</span>
            <span className="font-medium text-[var(--ink-1)]">{branch.name}</span>
          </div>
          <h2 className="sky-heading m-0 text-[20px] font-semibold text-[var(--ink-1)]">
            {branch.subtitle}
          </h2>
        </div>

        <Tooltip content="在右侧抽屉查看本分支权威选材与边界红线">
          <Button size="sm" variant="outline" onClick={() => setRedlinesDrawerOpen(true)}>
            <ShieldCheck size={14} strokeWidth={1.6} />
            <span>选材与合规准则</span>
          </Button>
        </Tooltip>
      </section>

      {/* B1 双轨切换 vs B2–B7 单线路径 */}
      {branch.id === 'B1' ? (
        <div className="space-y-5">
          <div
            className="glass-plate inline-flex flex-wrap gap-1 p-1"
            role="tablist"
            aria-label="B1 主线切换"
          >
            <button
              type="button"
              role="tab"
              aria-selected={b1LineTab === 'ai'}
              onClick={() => setB1LineTab('ai')}
              className={cn(
                'min-h-[38px] cursor-pointer rounded-[8px] px-3.5 text-[13.5px] font-medium transition-colors',
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
                'min-h-[38px] cursor-pointer rounded-[8px] px-3.5 text-[13.5px] font-medium transition-colors',
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
            <section aria-label="软件技能线按包学习" className="space-y-5">
              <div className="space-y-4">
                {swFeaturedPack.map((t) => renderTrackCard(t, b1SwTracks, true))}
              </div>
              {swSecondaryPacks.length > 0 && (
                <div className="space-y-3">
                  <div className="sky-heading text-[13px] font-medium text-[var(--ink-2)]">
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
