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
      {/* 1. 跨分支生活事件包 */}
      <section class="section-card" aria-label="生活事件包（跨分支组课）">
        <h1 class="section-heading">
          <span>生活事件包（遇到什么事，就跨分支组什么课）</span>
          <span class="badge-pill">激活后自动推入「今天」高精力时段</span>
        </h1>
        <p class="hero-subtitle" style={{ marginTop: 0, marginBottom: '18px' }}>
          过日子不会按学科出题——要做一次汇报、去一趟旅行，往往同时涉及表达、预算、工具与心态。点「激活并排入今天」即可一键联动。
        </p>

        <div class="tracks-stack">
          {content.eventPacks.map((pack) => {
            const isActive = activePackId === pack.id;
            return (
              <article
                key={pack.id}
                class={`path-track-card ${isActive ? 'is-cleared' : ''}`}
              >
                <div class="milestone-header-row" style={{ marginBottom: '10px' }}>
                  <div>
                    <div class="path-track-badges">
                      {isActive && (
                        <span class="badge-pill badge-live">
                          ● 已激活 · 已接入「今天」调度流
                        </span>
                      )}
                      <span class="badge-pill">
                        跨 {pack.modules.length} 个分支组包
                      </span>
                    </div>
                    <h2 class="path-track-title">{pack.title}</h2>
                    <p class="path-track-summary" style={{ marginBottom: 0 }}>
                      触发场景：{pack.triggerScenario}
                    </p>
                  </div>

                  <button
                    type="button"
                    class={isActive ? '' : 'btn-primary'}
                    onClick={() => handleTogglePack(pack.id)}
                  >
                    {isActive ? '取消激活' : '激活并排入「今天」'}
                  </button>
                </div>

                <div class="slot-tasks-list" style={{ padding: '8px 0' }}>
                  {pack.modules.map((mod, idx) => {
                    const bMeta = branchMap.get(mod.branchId);
                    const hasValidUnit =
                      Boolean(mod.unitId) &&
                      content.units.some((u) => u.id === mod.unitId);

                    return (
                      <div class="task-row" key={idx}>
                        <div class="task-body">
                          <div class="task-meta-line">
                            <span
                              class="branch-tag"
                              style={{
                                backgroundColor: bMeta?.accentToken ?? '#3D7A8A',
                                marginBottom: 0,
                              }}
                            >
                              {mod.branchId} · {bMeta?.name ?? mod.branchId}
                            </span>
                            <strong>{mod.roleTitle}</strong>
                          </div>
                          <div class="task-hint">{mod.actionGuide}</div>
                        </div>
                        {hasValidUnit && mod.unitId && (
                          <button
                            type="button"
                            class="btn-sm"
                            onClick={() => onOpenUnit(mod.unitId!)}
                          >
                            打开关联单元 →
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
        </div>
      </section>

      {/* 2. 生活工具箱（可复用核对清单库） */}
      <section class="section-card" aria-label="生活工具箱">
        <h2 class="section-heading">
          <span>生活工具箱（学完留工具不只留知识 · 随时打勾复用）</span>
          <span class="badge-pill">共 {content.toolboxes.length} 份实用清单</span>
        </h2>
        <div class="software-packs-grid">
          {content.toolboxes.map((box) => {
            const checkedItems = telemetry.toolboxChecked?.[box.id] ?? [];
            const bMeta = branchMap.get(box.branchId);
            return (
              <article class="path-track-card" key={box.id}>
                <div class="milestone-header-row" style={{ marginBottom: '8px' }}>
                  <div>
                    <span
                      class="branch-tag"
                      style={{ backgroundColor: bMeta?.accentToken ?? '#3D7A8A' }}
                    >
                      {box.branchId} · 工具清单
                    </span>
                    <h3 class="path-track-title" style={{ fontSize: '17px' }}>
                      {box.title}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>
                      {box.scene}
                    </div>
                  </div>
                  {checkedItems.length > 0 && (
                    <button
                      type="button"
                      class="btn-sm"
                      onClick={async () => {
                        const next = await toggleToolboxItemCheck(box.id, '', true);
                        onTelemetryChange(next);
                      }}
                    >
                      重置下次复用
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  {box.items.map((item) => {
                    const isChecked = checkedItems.includes(item);
                    return (
                      <label
                        key={item}
                        class="task-check-wrap"
                        style={{ alignItems: 'flex-start', gap: '10px', fontSize: '14px' }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={async () => {
                            const next = await toggleToolboxItemCheck(box.id, item);
                            onTelemetryChange(next);
                          }}
                        />
                        <span class="custom-checkbox" aria-hidden="true">
                          {isChecked ? '✓' : ''}
                        </span>
                        <span
                          style={
                            isChecked
                              ? { textDecoration: 'line-through', color: 'var(--ink-secondary)' }
                              : undefined
                          }
                        >
                          {item}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. 人生节点预备包（随内容滚动加槽位） */}
      <section class="section-card" aria-label="人生节点预备包槽位">
        <h2 class="section-heading">
          <span>人生节点预备包（按人生阶段打包 · 随内容滚动扩充）</span>
          <span class="badge-pill">结构槽位已就绪</span>
        </h2>
        <div class="branches-grid">
          {content.stagePrepPacks.map((sp) => (
            <article class="branch-card" key={sp.id}>
              <div class="path-track-badges">
                <span class="badge-pill">{sp.stageHint}</span>
                <span class="badge-pill">涵盖 {sp.includedBranches.join(' · ')}</span>
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
