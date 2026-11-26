import { ArrowRight, BookOpen, Check, ListChecks, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Drawer, Popconfirm, Tooltip } from '@/components/ui/overlays';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import { setActiveEventPackWithPlan, toggleToolboxItemCheck } from '@/core/db';
import { buildDailyPlanSnapshot } from '@/core/scheduler';
import { cn } from '@/lib/utils';
import type { TelemetrySnapshot } from '@/types/schema';

type EventPackItem = PlatformContentBundle['eventPacks'][number];

interface EventPacksViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  onTelemetryChange: (next: TelemetrySnapshot) => void;
  onOpenUnit: (unitId: string) => void;
  onPreviewUnit: (unitId: string) => void;
}

export function EventPacksView({
  content,
  telemetry,
  onTelemetryChange,
  onOpenUnit,
  onPreviewUnit,
}: EventPacksViewProps) {
  const [checklistPack, setChecklistPack] = useState<EventPackItem | null>(null);
  const branchMap = new Map(content.catalog.branches.map((b) => [b.id, b]));
  const activePackId = telemetry.activeEventPackId;

  const handleSetPack = async (packId: string | undefined, title: string) => {
    const todayKey = telemetry.currentDailyPlan?.dateKey;
    const next = await setActiveEventPackWithPlan(packId, (updatedSnap) =>
      buildDailyPlanSnapshot(
        todayKey ?? new Date().toISOString().slice(0, 10),
        content,
        updatedSnap
      )
    );
    onTelemetryChange(next);
    toast(packId ? `已激活事件包：${title}` : `已取消激活：${title}`);
  };

  return (
    <div className="space-y-8">
      {/* 事件包三步验收单详情 Drawer（页面更简明，点开即可对照核验） */}
      <Drawer
        open={Boolean(checklistPack)}
        onOpenChange={(open) => {
          if (!open) setChecklistPack(null);
        }}
        title={checklistPack?.title ?? '事件落地验收单'}
        description={checklistPack ? `触发场景：${checklistPack.triggerScenario}` : undefined}
      >
        {checklistPack && (
          <div className="space-y-4">
            <div className="glass-plate space-y-2.5 p-4">
              <div className="text-[12.5px] font-semibold text-[var(--dawn)]">
                事件落地三步验收单
              </div>
              <ol className="m-0 list-decimal space-y-2 pl-5 text-[14px] leading-[1.65] text-[var(--ink-1)]">
                {checklistPack.combinedActionChecklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </div>

            <div className="space-y-2">
              <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">
                跨分支组课清单（{checklistPack.modules.length} 项）
              </div>
              {checklistPack.modules.map((mod, idx) => {
                const bMeta = branchMap.get(mod.branchId);
                const hasValidUnit =
                  Boolean(mod.unitId) && content.units.some((u) => u.id === mod.unitId);
                return (
                  <div key={idx} className="glass-plate space-y-1.5 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                        {mod.branchId} {bMeta?.name} · {mod.roleTitle}
                      </span>
                      {hasValidUnit && mod.unitId && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            const targetId = mod.unitId!;
                            setChecklistPack(null);
                            onOpenUnit(targetId);
                          }}
                        >
                          学习
                        </Button>
                      )}
                    </div>
                    <div className="text-[13px] text-[var(--ink-2)]">{mod.actionGuide}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Drawer>

      <header className="space-y-1">
        <h1 className="sky-heading m-0 text-[24px] font-semibold tracking-[-0.02em] text-[var(--ink-1)] sm:text-[28px]">
          生活事件包与可复用工具箱
        </h1>
        <p className="sky-heading m-0 text-[14px] text-[var(--ink-2)]">
          按真实生活场景跨分支一键组课，自动排入今日高精力时段
        </p>
      </header>

      {/* 1. 跨分支生活事件包 */}
      <section className="space-y-4" aria-label="生活事件包（跨分支组课）">
        {content.eventPacks.map((pack) => {
          const isActive = activePackId === pack.id;
          return (
            <Card
              key={pack.id}
              className={cn('space-y-4', isActive && 'border-[var(--growth-border)]')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isActive && <Badge tone="growth">已激活 · 接入今日调度流</Badge>}
                    <Badge tone="neutral" className="font-mono-num">
                      跨 {pack.modules.length} 个分支
                    </Badge>
                  </div>
                  <h2 className="m-0 text-[18.5px] font-semibold text-[var(--ink-1)]">
                    {pack.title}
                  </h2>
                  <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
                    触发场景：{pack.triggerScenario}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Tooltip content="在右侧抽屉查看本事件三步落地验收单">
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => setChecklistPack(pack)}
                    >
                      <ListChecks size={14} strokeWidth={1.6} />
                      <span>验收单</span>
                    </Button>
                  </Tooltip>

                  {isActive ? (
                    <Popconfirm
                      title="取消激活该事件包？"
                      description="移出后今日高精力时段将恢复常规排期。"
                      confirmLabel="取消激活"
                      tone="warning"
                      onConfirm={() => handleSetPack(undefined, pack.title)}
                    >
                      <Button variant="outline">取消激活</Button>
                    </Popconfirm>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => handleSetPack(pack.id, pack.title)}
                    >
                      激活并排入今日
                    </Button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                {pack.modules.map((mod, idx) => {
                  const bMeta = branchMap.get(mod.branchId);
                  const hasValidUnit =
                    Boolean(mod.unitId) && content.units.some((u) => u.id === mod.unitId);

                  return (
                    <div
                      className="flex flex-col justify-between gap-2.5 py-3 sm:flex-row sm:items-center"
                      key={idx}
                    >
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2 text-[13px]">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: bMeta?.accentToken ?? 'var(--accent)' }}
                          />
                          <span className="text-[var(--ink-3)]">
                            {mod.branchId} {bMeta?.name ?? mod.branchId}
                          </span>
                          <span className="text-[var(--ink-3)]">/</span>
                          <strong className="font-medium text-[var(--ink-1)]">
                            {mod.roleTitle}
                          </strong>
                        </div>
                        <div className="text-[13.5px] text-[var(--ink-2)]">{mod.actionGuide}</div>
                      </div>

                      {hasValidUnit && mod.unitId && (
                        <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-center">
                          <Tooltip content="在右侧抽屉快速预览本节内容">
                            <Button
                              size="sm"
                              variant="subtle"
                              onClick={() => onPreviewUnit(mod.unitId!)}
                            >
                              <BookOpen size={13} strokeWidth={1.6} />
                              <span>速览</span>
                            </Button>
                          </Tooltip>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenUnit(mod.unitId!)}
                          >
                            <span>学习</span>
                            <ArrowRight size={13} strokeWidth={1.5} />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </section>

      {/* 2. 生活工具箱（重置挂载 Popconfirm 气泡轻确认） */}
      <section className="space-y-4" aria-label="生活工具箱">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="sky-heading m-0 text-[20px] font-semibold text-[var(--ink-1)]">
              生活工具箱 · 可复用核对清单
            </h2>
            <p className="sky-heading mt-1 mb-0 text-[13.5px] text-[var(--ink-2)]">
              随用随打勾，用完气泡确认一键重置
            </p>
          </div>
          <Badge tone="neutral" className="font-mono-num">
            共 {content.toolboxes.length} 份清单
          </Badge>
        </div>

        <div className="toolbox-grid grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {content.toolboxes.map((box) => {
            const checkedItems = telemetry.toolboxChecked?.[box.id] ?? [];
            const bMeta = branchMap.get(box.branchId);
            return (
              <Card className="space-y-3.5 p-5" key={box.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-3)]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: bMeta?.accentToken ?? 'var(--accent)' }}
                      />
                      <span>{box.branchId} 工具清单</span>
                    </div>
                    <h3 className="mt-1 mb-0.5 text-[16.5px] font-semibold text-[var(--ink-1)]">
                      {box.title}
                    </h3>
                    <div className="text-[12.5px] text-[var(--ink-3)]">{box.scene}</div>
                  </div>
                  {checkedItems.length > 0 && (
                    <Popconfirm
                      title={`重置「${box.title}」？`}
                      description="将清空这份清单的所有已勾选标记。"
                      confirmLabel="重置"
                      tone="warning"
                      onConfirm={async () => {
                        const next = await toggleToolboxItemCheck(box.id, '', true);
                        onTelemetryChange(next);
                        toast(`已重置清单：${box.title}`);
                      }}
                    >
                      <Button size="sm" variant="ghost">
                        <RotateCcw size={13} strokeWidth={1.6} />
                        <span>重置</span>
                      </Button>
                    </Popconfirm>
                  )}
                </div>

                <div className="glass-plate space-y-2 p-3.5">
                  {box.items.map((item) => {
                    const isChecked = checkedItems.includes(item);
                    return (
                      <label
                        key={item}
                        className="flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-[1.55]"
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isChecked}
                          onClick={async () => {
                            const next = await toggleToolboxItemCheck(box.id, item);
                            onTelemetryChange(next);
                          }}
                          className={cn(
                            'mt-0.5 flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors',
                            isChecked
                              ? 'border-[var(--growth)] bg-[var(--growth)] text-[#081510]'
                              : 'border-[var(--line-strong)] bg-[var(--surface-raised)]'
                          )}
                        >
                          {isChecked && <Check size={12} strokeWidth={2.4} />}
                        </button>
                        <span
                          className={cn(
                            'text-[var(--ink-1)]',
                            isChecked && 'text-[var(--ink-3)] line-through'
                          )}
                        >
                          {item}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* 3. 人生节点预备包 */}
      <section className="space-y-4" aria-label="人生节点预备包">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sky-heading m-0 text-[20px] font-semibold text-[var(--ink-1)]">
            人生节点预备包
          </h2>
          <Badge tone="neutral">按阶段持续扩充</Badge>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
          {content.stagePrepPacks.map((sp) => (
            <Card className="space-y-2.5 p-5" key={sp.id}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="accent">{sp.stageHint}</Badge>
                <Badge tone="neutral">{sp.includedBranches.join(' / ')}</Badge>
              </div>
              <h3 className="m-0 text-[16px] font-semibold text-[var(--ink-1)]">{sp.title}</h3>
              <p className="m-0 text-[13.5px] leading-[1.6] text-[var(--ink-2)]">{sp.summary}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
