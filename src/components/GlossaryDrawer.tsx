import { ArrowRight, BookOpen, Link2 } from 'lucide-react';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { Drawer } from '@/components/ui/overlays';
import { Badge, Button } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import type { ConceptNode } from '@/types/schema';

interface GlossaryContextValue {
  openConcept: (concept: ConceptNode) => void;
}

const GlossaryContext = createContext<GlossaryContextValue | null>(null);

export function useGlossaryDrawer() {
  return useContext(GlossaryContext);
}

interface GlossaryDrawerProviderProps {
  content: PlatformContentBundle;
  onOpenUnit: (unitId: string) => void;
  onOpenCards?: () => void;
  children: ReactNode;
}

/**
 * 术语详解抽屉（Drawer）：
 * - 悬停术语仅显示一句话 Tooltip（不打断）
 * - 点击术语从右侧滑出本 Drawer，原学习正文保留在后方，可边看边对照关联概念
 */
export function GlossaryDrawerProvider({
  content,
  onOpenUnit,
  onOpenCards,
  children,
}: GlossaryDrawerProviderProps) {
  const [activeConcept, setActiveConcept] = useState<ConceptNode | null>(null);

  const conceptMap = new Map(content.knowledgeGraph.nodes.map((n) => [n.id, n]));
  const branchMeta = activeConcept
    ? content.catalog.branches.find((b) => b.id === activeConcept.branchId)
    : undefined;
  const linkedUnits = activeConcept
    ? content.units.filter((u) => u.conceptNodeIds.includes(activeConcept.id))
    : [];

  return (
    <GlossaryContext.Provider value={{ openConcept: (c) => setActiveConcept(c) }}>
      {children}

      <Drawer
        open={Boolean(activeConcept)}
        onOpenChange={(open) => {
          if (!open) setActiveConcept(null);
        }}
        title={activeConcept?.label ?? '术语详解'}
        description={
          branchMeta
            ? `${branchMeta.id} · ${branchMeta.name} — 原学习页面留在后方，可对照阅读`
            : undefined
        }
        headerExtra={
          activeConcept && (
            <Badge tone="accent" className="font-mono-num">
              {activeConcept.branchId}
            </Badge>
          )
        }
        footer={
          activeConcept && (
            <>
              {onOpenCards && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActiveConcept(null);
                    onOpenCards();
                  }}
                >
                  去 3D 闪卡台刷卡
                </Button>
              )}
              {linkedUnits[0] && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    const targetId = linkedUnits[0].id;
                    setActiveConcept(null);
                    onOpenUnit(targetId);
                  }}
                >
                  <span>打开所属单元</span>
                  <ArrowRight size={14} strokeWidth={1.6} />
                </Button>
              )}
            </>
          )
        }
      >
        {activeConcept && (
          <div className="space-y-4">
            <div className="glass-plate space-y-1.5 p-4">
              <div className="text-[12px] font-medium text-[var(--ink-3)]">人话定义</div>
              <p className="m-0 text-[15px] leading-[1.7] text-[var(--ink-1)]">
                {activeConcept.plainDefinition}
              </p>
            </div>

            <div className="glass-plate space-y-2 p-4">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]">
                <BookOpen size={13} strokeWidth={1.7} />
                <span>核心提问与解析</span>
              </div>
              <div className="text-[14px] font-medium text-[var(--ink-1)]">
                {activeConcept.cardPrompt}
              </div>
              <p className="m-0 text-[13.5px] leading-[1.7] text-[var(--ink-2)]">
                {activeConcept.cardAnswer}
              </p>
            </div>

            {activeConcept.prerequisites.length > 0 && (
              <div className="space-y-2">
                <div className="text-[12px] font-medium text-[var(--ink-3)]">先修前置概念</div>
                <div className="flex flex-wrap gap-2">
                  {activeConcept.prerequisites.map((preId) => {
                    const node = conceptMap.get(preId);
                    if (!node) return null;
                    return (
                      <Button
                        key={preId}
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveConcept(node)}
                      >
                        {node.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeConcept.crossLinks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-3)]">
                  <Link2 size={13} strokeWidth={1.6} />
                  <span>跨分支互链概念</span>
                </div>
                <div className="space-y-2">
                  {activeConcept.crossLinks.map((link) => {
                    const target = conceptMap.get(link.targetId);
                    if (!target) return null;
                    return (
                      <button
                        key={link.targetId}
                        type="button"
                        onClick={() => setActiveConcept(target)}
                        className="glass-plate flex w-full cursor-pointer items-center justify-between gap-2.5 p-3 text-left transition-colors hover:border-[var(--accent-border)]"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-[13.5px] font-medium text-[var(--ink-1)]">
                            {target.branchId} · {target.label}
                          </div>
                          <div className="text-[12.5px] text-[var(--ink-2)]">{link.bridgeNote}</div>
                        </div>
                        <ArrowRight size={14} strokeWidth={1.6} className="shrink-0 text-[var(--ink-3)]" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {linkedUnits.length > 0 && (
              <div className="space-y-2 border-t border-[var(--line)] pt-3">
                <div className="text-[12px] font-medium text-[var(--ink-3)]">关联学习单元</div>
                <div className="space-y-1.5">
                  {linkedUnits.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setActiveConcept(null);
                        onOpenUnit(u.id);
                      }}
                      className="glass-plate flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[13.5px] text-[var(--ink-1)] transition-colors hover:border-[var(--accent-border)]"
                    >
                      <span className="truncate font-medium">{u.title}</span>
                      <span className="font-mono-num shrink-0 text-[12px] text-[var(--ink-3)]">
                        {u.estimatedMinutes}m →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </GlossaryContext.Provider>
  );
}
