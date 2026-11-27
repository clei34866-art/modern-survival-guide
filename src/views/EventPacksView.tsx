import {
  ArrowRight,
  BookOpen,
  Check,
  ListChecks,
  MessageCircle,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { LifeScenarioSim } from '@/components/LifeScenarioSim';
import { LifeToolsSandbox } from '@/components/LifeToolsSandbox';
import { Drawer, Popconfirm, Tooltip } from '@/components/ui/overlays';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import { setActiveEventPackWithPlan, toggleToolboxItemCheck } from '@/core/db';
import { buildDailyPlanSnapshot } from '@/core/scheduler';
import { LIFE_SCENARIOS, type LifeScenario } from '@/data/lifeScenarios';
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
  const [activeScenario, setActiveScenario] = useState<LifeScenario | null>(null);
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
    toast(packId ? `已放进今天安排：${title}` : `已移出今天安排：${title}`);
  };

  return (
    <div className="space-y-9">
      {/* 抽屉 1：遇事演练小剧场（生活情景对话模拟） */}
      <Drawer
        open={Boolean(activeScenario)}
        onOpenChange={(open) => {
          if (!open) setActiveScenario(null);
        }}
        title={activeScenario?.title ?? '遇事演练小剧场'}
        description={activeScenario?.subtitle}
        widthClassName="w-[min(540px,94vw)]"
      >
        {activeScenario && (
          <LifeScenarioSim
            key={activeScenario.id}
            scenario={activeScenario}
            compact
            onOpenLinkedUnit={(uid) => {
              setActiveScenario(null);
              onOpenUnit(uid);
            }}
          />
        )}
      </Drawer>

      {/* 抽屉 2：事件包三步验收单 */}
      <Drawer
        open={Boolean(checklistPack)}
        onOpenChange={(open) => {
          if (!open) setChecklistPack(null);
        }}
        title={checklistPack?.title ?? '三步落地清单'}
        description={checklistPack ? `适用情况：${checklistPack.triggerScenario}` : undefined}
      >
        {checklistPack && (
          <div className="space-y-4">
            <div className="glass-plate space-y-2.5 p-4">
              <div className="text-[12.5px] font-semibold text-[var(--dawn)]">
                先做到这三步就稳了
              </div>
              <ol className="m-0 list-decimal space-y-2 pl-5 text-[14px] leading-[1.65] text-[var(--ink-1)]">
                {checklistPack.combinedActionChecklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </div>

            <div className="space-y-2">
              <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">
                顺手补齐这 {checklistPack.modules.length} 块常识
              </div>
              {checklistPack.modules.map((mod, idx) => {
                const bMeta = branchMap.get(mod.branchId);
                const hasValidUnit =
                  Boolean(mod.unitId) && content.units.some((u) => u.id === mod.unitId);
                return (
                  <div key={idx} className="glass-plate space-y-1.5 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                        {bMeta?.name} · {mod.roleTitle}
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
                          去看看
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
          遇事速查 · 演练、算账与随身清单
        </h1>
        <p className="sky-heading m-0 text-[14px] text-[var(--ink-2)]">
          租房防坑、防诈骗、熬夜补觉、出门打包——不用先背理论，遇到什么直接点开用
        </p>
      </header>

      {/* 1. 遇事演练小剧场（生活情景对话模拟） */}
      <section className="space-y-4" aria-label="生活情景对话模拟">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="sky-heading m-0 text-[20px] font-semibold text-[var(--ink-1)]">
              遇事演练小剧场 · 先在模拟里踩一次坑
            </h2>
            <p className="sky-heading mt-1 mb-0 text-[13.5px] text-[var(--ink-2)]">
              选一个高频生活难题，点不同回应立刻看到真实后果与稳妥招数
            </p>
          </div>
          <Badge tone="neutral" className="font-mono-num">
            {LIFE_SCENARIOS.length} 个日常情景
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {LIFE_SCENARIOS.map((sc) => {
            const bMeta = branchMap.get(sc.branchId);
            return (
              <Card
                key={sc.id}
                className="flex flex-col justify-between gap-4 p-5"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-3)]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: bMeta?.accentToken ?? 'var(--accent)' }}
                      />
                      <span>{sc.tag}</span>
                    </span>
                    <span className="font-mono-num text-[11.5px] text-[var(--ink-3)]">
                      {sc.rounds.length} 幕互动
                    </span>
                  </div>
                  <h3 className="m-0 text-[15.5px] font-semibold leading-[1.45] text-[var(--ink-1)]">
                    {sc.title}
                  </h3>
                  <p className="m-0 text-[13px] leading-[1.6] text-[var(--ink-2)]">
                    {sc.subtitle}
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`open-scenario-${sc.id}`}
                    onClick={() => setActiveScenario(sc)}
                  >
                    <MessageCircle size={13} strokeWidth={1.7} />
                    <span>演练一局</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* 2. 实用生活小算盘 / 互动沙盒 */}
      <section aria-label="实用生活小算盘">
        <LifeToolsSandbox mode="all" />
      </section>

      {/* 3. 生活工具箱（6 份随手核对清单） */}
      <section className="space-y-4" aria-label="随身生活清单">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="sky-heading m-0 text-[20px] font-semibold text-[var(--ink-1)]">
              随身核对清单 · 用完一键重置
            </h2>
            <p className="sky-heading mt-1 mb-0 text-[13.5px] text-[var(--ink-2)]">
              看房、打包、看病体检、买保险前顺手打勾，少漏一件关键小事
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
                      <span>{bMeta?.name ?? box.branchId}</span>
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

      {/* 4. 跨主题生活锦囊包 */}
      <section className="space-y-4" aria-label="生活场景组合包">
        <div>
          <h2 className="sky-heading m-0 text-[20px] font-semibold text-[var(--ink-1)]">
            大事锦囊包 · 放进今天顺手准备
          </h2>
          <p className="sky-heading mt-1 mb-0 text-[13.5px] text-[var(--ink-2)]">
            近期要汇报、出远门或首次租房？激活对应锦囊，今天页面会自动帮你排好要看的内容
          </p>
        </div>

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
                    {isActive && <Badge tone="growth">已放进今天安排</Badge>}
                    <Badge tone="neutral" className="font-mono-num">
                      涵盖 {pack.modules.length} 块常识
                    </Badge>
                  </div>
                  <h3 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
                    {pack.title}
                  </h3>
                  <p className="m-0 text-[13.5px] text-[var(--ink-2)]">{pack.triggerScenario}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Tooltip content="在右侧抽屉查看三步落地核对单">
                    <Button size="sm" variant="subtle" onClick={() => setChecklistPack(pack)}>
                      <ListChecks size={14} strokeWidth={1.6} />
                      <span>三步清单</span>
                    </Button>
                  </Tooltip>

                  {isActive ? (
                    <Popconfirm
                      title="移出今天安排？"
                      description="移出后今天页面将恢复常规生活推荐。"
                      confirmLabel="移出"
                      tone="warning"
                      onConfirm={() => handleSetPack(undefined, pack.title)}
                    >
                      <Button variant="outline">已放进今天</Button>
                    </Popconfirm>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => handleSetPack(pack.id, pack.title)}
                    >
                      放进今天准备
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
                          <span className="text-[var(--ink-3)]">{bMeta?.name ?? mod.branchId}</span>
                          <span className="text-[var(--ink-3)]">/</span>
                          <strong className="font-medium text-[var(--ink-1)]">
                            {mod.roleTitle}
                          </strong>
                        </div>
                        <div className="text-[13.5px] text-[var(--ink-2)]">{mod.actionGuide}</div>
                      </div>

                      {hasValidUnit && mod.unitId && (
                        <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-center">
                          <Tooltip content="在右侧抽屉快速扫一眼要点">
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
                            <span>去看看</span>
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

      {/* 5. 人生节点预备包 */}
      <section className="space-y-4" aria-label="人生节点预备包">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="sky-heading m-0 text-[20px] font-semibold text-[var(--ink-1)]">
            人生重要阶段小锦囊
          </h2>
          <Badge tone="neutral">随人生阶段翻阅</Badge>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-4">
          {content.stagePrepPacks.map((sp) => (
            <Card className="space-y-2.5 p-5" key={sp.id}>
              <Badge tone="accent">{sp.stageHint}</Badge>
              <h3 className="m-0 text-[16px] font-semibold text-[var(--ink-1)]">{sp.title}</h3>
              <p className="m-0 text-[13.5px] leading-[1.6] text-[var(--ink-2)]">{sp.summary}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
