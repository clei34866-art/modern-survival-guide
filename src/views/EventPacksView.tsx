import { IconArrowRight, IconCheck } from '../components/Icons';
import type { PlatformContentBundle } from '../core/contentLoader';
import { setActiveEventPackWithPlan, toggleToolboxItemCheck } from '../core/db';
import { buildDailyPlanSnapshot } from '../core/scheduler';
import type { TelemetrySnapshot } from '../types/schema';

interface EventPacksViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  onTelemetryChange: (next: TelemetrySnapshot) => void;
  onOpenUnit: (unitId: string) => void;
}

export function EventPacksView({
  content,
  telemetry,
  onTelemetryChange,
  onOpenUnit,
}: EventPacksViewProps) {
  const branchMap = new Map(content.catalog.branches.map((b) => [b.id, b]));
  const activePackId = telemetry.activeEventPackId;

  const handleTogglePack = async (packId: string) => {
    const nextPackId = activePackId === packId ? undefined : packId;
    const todayKey = telemetry.currentDailyPlan?.dateKey;
    const next = await setActiveEventPackWithPlan(nextPackId, (updatedSnap) =>
      buildDailyPlanSnapshot(
        todayKey ?? new Date().toISOString().slice(0, 10),
        content,
        updatedSnap
      )
    );
    onTelemetryChange(next);
  };

  return (
    <div class="events-toolbox-wrap">
      <header class="page-header-strip">
        <div>
          <h1 class="page-h1">生活事件包与可复用工具箱</h1>
          <p class="page-subtitle">
            真实生活不按学科出题——激活事件包即可跨分支一键组课，自动推入「今天」高精力时段。
          </p>
        </div>
      </header>

      {/* 1. 跨分支生活事件包 */}
      <section class="tracks-stack" aria-label="生活事件包（跨分支组课）">
        {content.eventPacks.map((pack) => {
          const isActive = activePackId === pack.id;
          return (
            <article
              key={pack.id}
              class={`surface-card event-pack-card ${isActive ? 'is-active-pack' : ''}`}
            >
              <div class="milestone-header-row" style={{ marginBottom: '12px' }}>
                <div>
                  <div class="path-track-badges">
                    {isActive && (
                      <span class="status-chip chip-growth">已激活 · 接入今日调度流</span>
                    )}
                    <span class="status-chip tabular-num">跨 {pack.modules.length} 个分支</span>
                  </div>
                  <h2 class="path-track-title">{pack.title}</h2>
                  <p class="path-track-summary" style={{ marginBottom: 0 }}>
                    触发场景：{pack.triggerScenario}
                  </p>
                </div>

                <button
                  type="button"
                  class={`btn ${isActive ? '' : 'btn-primary'}`}
                  onClick={() => handleTogglePack(pack.id)}
                >
                  {isActive ? '取消激活' : '激活并排入「今天」'}
                </button>
              </div>

              <div class="event-modules-list">
                {pack.modules.map((mod, idx) => {
                  const bMeta = branchMap.get(mod.branchId);
                  const hasValidUnit =
                    Boolean(mod.unitId) && content.units.some((u) => u.id === mod.unitId);

                  return (
                    <div class="event-module-row" key={idx}>
                      <div class="task-body">
                        <div class="task-meta-line">
                          <span class="branch-dot-label">
                            <span
                              class="branch-dot"
                              style={{ backgroundColor: bMeta?.accentToken ?? '#266D7E' }}
                            />
                            <span>
                              {mod.branchId} {bMeta?.name ?? mod.branchId}
                            </span>
                          </span>
                          <span class="meta-sep">/</span>
                          <strong>{mod.roleTitle}</strong>
                        </div>
                        <div class="task-hint">{mod.actionGuide}</div>
                      </div>
                      {hasValidUnit && mod.unitId && (
                        <button
                          type="button"
                          class="btn btn-sm"
                          onClick={() => onOpenUnit(mod.unitId!)}
                        >
                          <span>打开单元</span>
                          <IconArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div class="milestone-deliverable-box">
                <div class="milestone-eyebrow">事件落地三步验收单</div>
                <ul class="milestone-criteria-list">
                  {pack.combinedActionChecklist.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </section>

      {/* 2. 生活工具箱（align-items: start 防空白拉伸） */}
      <section aria-label="生活工具箱" style={{ marginTop: '32px' }}>
        <div class="section-head-row" style={{ marginBottom: '14px' }}>
          <div>
            <h2 class="section-h2">生活工具箱 · 可复用核对清单</h2>
            <p class="muted-desc">学完留工具不只留知识，随用随打勾、用完一键重置。</p>
          </div>
          <span class="status-chip tabular-num">共 {content.toolboxes.length} 份清单</span>
        </div>

        <div class="toolbox-grid">
          {content.toolboxes.map((box) => {
            const checkedItems = telemetry.toolboxChecked?.[box.id] ?? [];
            const bMeta = branchMap.get(box.branchId);
            return (
              <article class="surface-card toolbox-card" key={box.id}>
                <div class="milestone-header-row" style={{ marginBottom: '10px' }}>
                  <div>
                    <div class="branch-dot-label">
                      <span
                        class="branch-dot"
                        style={{ backgroundColor: bMeta?.accentToken ?? '#266D7E' }}
                      />
                      <span>{box.branchId} 工具清单</span>
                    </div>
                    <h3 class="path-track-title" style={{ fontSize: '18px', marginTop: '4px' }}>
                      {box.title}
                    </h3>
                    <div class="muted-inline">{box.scene}</div>
                  </div>
                  {checkedItems.length > 0 && (
                    <button
                      type="button"
                      class="btn btn-sm"
                      onClick={async () => {
                        const next = await toggleToolboxItemCheck(box.id, '', true);
                        onTelemetryChange(next);
                      }}
                    >
                      重置
                    </button>
                  )}
                </div>

                <div class="toolbox-items-stack">
                  {box.items.map((item) => {
                    const isChecked = checkedItems.includes(item);
                    return (
                      <label key={item} class="task-check-wrap inline-checkbox-label">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={async () => {
                            const next = await toggleToolboxItemCheck(box.id, item);
                            onTelemetryChange(next);
                          }}
                        />
                        <span class={`custom-checkbox ${isChecked ? 'is-checked' : ''}`} aria-hidden="true">
                          {isChecked && <IconCheck size={13} />}
                        </span>
                        <span class={isChecked ? 'is-struck-text' : ''}>{item}</span>
                      </label>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. 人生节点预备包 */}
      <section aria-label="人生节点预备包" style={{ marginTop: '32px' }}>
        <div class="section-head-row" style={{ marginBottom: '14px' }}>
          <h2 class="section-h2">人生节点预备包</h2>
          <span class="status-chip">按阶段持续扩充</span>
        </div>
        <div class="stage-prep-grid">
          {content.stagePrepPacks.map((sp) => (
            <article class="surface-card stage-prep-card" key={sp.id}>
              <div class="path-track-badges">
                <span class="status-chip">{sp.stageHint}</span>
                <span class="status-chip">{sp.includedBranches.join(' / ')}</span>
              </div>
              <h3 class="path-track-title" style={{ fontSize: '17px' }}>
                {sp.title}
              </h3>
              <p class="path-track-summary" style={{ marginBottom: 0 }}>
                {sp.summary}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
