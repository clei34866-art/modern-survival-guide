import { ArrowRight, Check, Clock, Sparkles } from 'lucide-react';
import { RichText } from '@/components/RichText';
import { Drawer } from '@/components/ui/overlays';
import { Badge, Button } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import { isUnitCleared } from '@/core/gatekeeper';
import type { LearningUnit, TelemetrySnapshot } from '@/types/schema';

interface UnitPreviewDrawerProps {
  unit: LearningUnit | null;
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  onClose: () => void;
  onOpenUnit: (unitId: string) => void;
}

/**
 * 学习内容速览抽屉（Drawer）：
 * 在今日主线、技能星图、事件包、任务池中按需右侧滑出，
 * 原页保留在后方，快速浏览场景、核心要点与行动步骤后再决定是否进入 7 步沉浸学习。
 */
export function UnitPreviewDrawer({
  unit,
  content,
  telemetry,
  onClose,
  onOpenUnit,
}: UnitPreviewDrawerProps) {
  const branch = unit
    ? content.catalog.branches.find((b) => b.id === unit.branchId)
    : undefined;
  const cleared = unit ? isUnitCleared(unit.id, telemetry) : false;
  const concepts = unit
    ? unit.conceptNodeIds
        .map((cid) => content.knowledgeGraph.nodes.find((n) => n.id === cid))
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
    : [];
  const takeaways = unit
    ? unit.guide.blocks.filter((b) => Boolean(b.keyTakeaway)).map((b) => b.keyTakeaway!)
    : [];

  return (
    <Drawer
      open={Boolean(unit)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={unit?.title ?? '单元速览'}
      description={
        unit && branch
          ? `${branch.id} ${branch.name} · 约 ${unit.estimatedMinutes} 分钟`
          : undefined
      }
      headerExtra={
        unit && (
          <Badge tone={cleared ? 'growth' : 'accent'}>
            {cleared ? (
              <>
                <Check size={12} strokeWidth={2} />
                <span>已读</span>
              </>
            ) : (
              <>
                <Clock size={12} strokeWidth={1.6} />
                <span>{unit.estimatedMinutes}m</span>
              </>
            )}
          </Badge>
        )
      }
      widthClassName="w-[min(520px,94vw)]"
      footer={
        unit && (
          <>
            <Button size="sm" variant="outline" onClick={onClose}>
              继续浏览列表
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const targetId = unit.id;
                onClose();
                onOpenUnit(targetId);
              }}
            >
              <span>{cleared ? '重温完整手册' : '打开深度实战手册'}</span>
              <ArrowRight size={14} strokeWidth={1.6} />
            </Button>
          </>
        )
      }
    >
      {unit && (
        <div className="space-y-4">
          {/* 1. 场景切入 */}
          <section className="glass-plate space-y-2 p-4">
            <div className="flex items-start gap-1.5 text-[12px] font-semibold text-[var(--dawn)]">
              <Sparkles size={13} strokeWidth={1.7} className="mt-0.5 shrink-0" />
              <span>
                真实生活场景 · <RichText text={unit.scenarioHook.sceneTitle} />
              </span>
            </div>
            <p className="m-0 text-[14px] leading-[1.7] text-[var(--ink-1)]">
              <RichText text={unit.scenarioHook.story} concepts={concepts} />
            </p>
            <p className="m-0 border-t border-[var(--line)] pt-2 text-[13px] font-medium text-[var(--accent)]">
              思考：<RichText text={unit.scenarioHook.guidingQuestion} />
            </p>
          </section>

          {/* 2. 核心要点速览 */}
          {takeaways.length > 0 && (
            <section className="space-y-2">
              <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">本节核心要点</div>
              <ul className="glass-plate m-0 list-disc space-y-2 py-3.5 pr-4 pl-8 text-[13.5px] leading-[1.65] text-[var(--ink-1)]">
                {takeaways.map((tk, idx) => (
                  <li key={idx}>
                    <RichText text={tk} concepts={concepts} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 3. 核心概念词条（点击可切入术语抽屉） */}
          {concepts.length > 0 && (
            <section className="space-y-2">
              <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">
                涵盖核心概念（{concepts.length} 张 3D 闪卡）
              </div>
              <div className="space-y-2">
                {concepts.map((c) => (
                  <div key={c.id} className="glass-plate px-3.5 py-2.5 text-[13px]">
                    <div className="font-semibold text-[var(--ink-1)]">{c.label}</div>
                    <div className="mt-0.5 leading-[1.55] text-[var(--ink-2)]">
                      {c.plainDefinition}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4. 实战行动预览 */}
          <section className="space-y-2">
            <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">
              学完即做 · <RichText text={unit.actionTask.title} />
            </div>
            <ol className="glass-plate m-0 list-decimal space-y-1.5 py-3.5 pr-4 pl-8 text-[13.5px] leading-[1.65] text-[var(--ink-1)]">
              {unit.actionTask.steps.map((s) => (
                <li key={s}>
                  <RichText text={s} />
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Drawer>
  );
}
