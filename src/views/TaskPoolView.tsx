import { useState } from 'preact/hooks';
import { IconArrowRight, IconCheck } from '../components/Icons';
import type { PlatformContentBundle } from '../core/contentLoader';
import { addRealLifeTask, removeRealLifeTask, toggleRealLifeTask } from '../core/db';
import type {
  BranchId,
  LearningUnit,
  RealLifeTask,
  RealTaskCategory,
  TelemetrySnapshot,
} from '../types/schema';

interface TaskPoolViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  onTelemetryChange: (next: TelemetrySnapshot) => void;
  onOpenUnit: (unitId: string) => void;
}

const CATEGORY_META: Array<{
  value: RealTaskCategory;
  label: string;
  defaultBranch: BranchId;
  samplePlaceholder: string;
}> = [
  {
    value: 'research_data',
    label: '科研 / 大创数据处理',
    defaultBranch: 'B1',
    samplePlaceholder: '如：清洗本周实验 CSV 并核查 AI 总结文献引用',
  },
  {
    value: 'tweet_writing',
    label: '推文 / 写作表达',
    defaultBranch: 'B5',
    samplePlaceholder: '如：撰写实验室本周科普推文初稿',
  },
  {
    value: 'course_slides',
    label: '课程展示 / 组会汇报',
    defaultBranch: 'B5',
    samplePlaceholder: '如：周五组会 10 分钟文献汇报 PPT',
  },
  {
    value: 'running_health',
    label: '跑步打卡 / 睡眠节律',
    defaultBranch: 'B4',
    samplePlaceholder: '如：晚间操场慢跑 5km 并记录配速心率',
  },
  {
    value: 'finance_sheet',
    label: '记账预算 / 保单核对',
    defaultBranch: 'B2',
    samplePlaceholder: '如：梳理下月生活费三桶预算与自动续费清理',
  },
  {
    value: 'general',
    label: '日常决策与整理',
    defaultBranch: 'B3',
    samplePlaceholder: '如：给手头卡壳半个月的支线做一次零基止损评估',
  },
];

const QUICK_TEMPLATES: Array<{
  title: string;
  category: RealTaskCategory;
  branchId: BranchId;
}> = [
  {
    title: '清洗本周大创实验数据并交叉核查文献引用',
    category: 'research_data',
    branchId: 'B1',
  },
  {
    title: '整理下月生活费三桶分流表并关停无用续费',
    category: 'finance_sheet',
    branchId: 'B2',
  },
  {
    title: '完成本周公众号推文撰写与排版校对',
    category: 'tweet_writing',
    branchId: 'B5',
  },
  {
    title: '今晚操场慢跑 5km 打卡',
    category: 'running_health',
    branchId: 'B4',
  },
];

function findMatchingUnits(units: LearningUnit[], task: RealLifeTask): LearningUnit[] {
  return units.filter(
    (u) => u.actionTask.matchPoolCategory === task.category || u.branchId === task.branchId
  );
}

export function TaskPoolView({
  content,
  telemetry,
  onTelemetryChange,
  onOpenUnit,
}: TaskPoolViewProps) {
  const [title, setTitle] = useState<string>('');
  const [category, setCategory] = useState<RealTaskCategory>('research_data');
  const [branchId, setBranchId] = useState<BranchId>('B1');

  const tasks = telemetry.realTasks ?? [];
  const branchMap = new Map(content.catalog.branches.map((b) => [b.id, b]));
  const currentCatMeta =
    CATEGORY_META.find((c) => c.value === category) ?? CATEGORY_META[0];

  const handleCategoryChange = (nextCat: RealTaskCategory) => {
    setCategory(nextCat);
    const meta = CATEGORY_META.find((c) => c.value === nextCat);
    if (meta) setBranchId(meta.defaultBranch);
  };

  const handleAdd = async () => {
    if (!title.trim()) return;
    const next = await addRealLifeTask({ title, category, branchId });
    setTitle('');
    onTelemetryChange(next);
  };

  const handleQuickAdd = async (tpl: (typeof QUICK_TEMPLATES)[number]) => {
    const next = await addRealLifeTask(tpl);
    onTelemetryChange(next);
  };

  return (
    <div class="task-pool-wrap">
      <section class="surface-card">
        <div class="section-head-row" style={{ marginBottom: '12px' }}>
          <div>
            <h2 class="section-h2">真实任务池 · 把真实待办变成学习过关产出</h2>
            <p class="muted-desc">
              录入你手头真正要做的事，进入对应学习单元第 6 步即可一键挂载抵扣。
            </p>
          </div>
          <span class="status-chip tabular-num">
            进行中 {tasks.filter((t) => t.status === 'open').length} · 已交付{' '}
            {tasks.filter((t) => t.status === 'completed').length}
          </span>
        </div>

        <div class="quick-templates-row">
          <span class="muted-inline">常用场景速添：</span>
          {QUICK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.title}
              type="button"
              class="btn btn-sm"
              onClick={() => handleQuickAdd(tpl)}
            >
              + {tpl.title.slice(0, 12)}…
            </button>
          ))}
        </div>

        <div class="task-pool-form">
          <input
            type="text"
            value={title}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            placeholder={currentCatMeta.samplePlaceholder}
          />
          <select
            value={category}
            onChange={(e) =>
              handleCategoryChange((e.target as HTMLSelectElement).value as RealTaskCategory)
            }
          >
            {CATEGORY_META.map((c) => (
              <option value={c.value} key={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={branchId}
            onChange={(e) => setBranchId((e.target as HTMLSelectElement).value as BranchId)}
          >
            {content.catalog.branches.map((b) => (
              <option value={b.id} key={b.id}>
                {b.id} {b.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            class="btn btn-primary"
            disabled={!title.trim()}
            onClick={handleAdd}
          >
            加入任务池
          </button>
        </div>
      </section>

      <section class="surface-card" style={{ marginTop: '16px' }}>
        <h3 class="section-h2" style={{ marginBottom: '12px' }}>
          待交付与已归档任务
        </h3>
        {tasks.length === 0 ? (
          <div class="empty-track-notice" style={{ marginBottom: 0 }}>
            任务池还是空的，点上方「常用场景速添」或输入一件近期真实待办开始。
          </div>
        ) : (
          <div class="event-modules-list">
            {tasks.map((task) => {
              const branch = branchMap.get(task.branchId);
              const matchedUnits = findMatchingUnits(content.units, task);
              const isDone = task.status === 'completed';

              return (
                <div key={task.id} class={`task-row ${isDone ? 'is-done' : ''}`}>
                  <label class="task-check-wrap" aria-label={`标记完成：${task.title}`}>
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={async () => {
                        const next = await toggleRealLifeTask(task.id);
                        onTelemetryChange(next);
                      }}
                    />
                    <span class="custom-checkbox" aria-hidden="true">
                      {isDone && <IconCheck size={13} />}
                    </span>
                  </label>

                  <div class="task-body">
                    <div class="task-meta-line">
                      <span class="branch-dot-label">
                        <span
                          class="branch-dot"
                          style={{ backgroundColor: branch?.accentToken ?? '#266D7E' }}
                        />
                        <span>
                          {task.branchId} {branch?.name ?? task.branchId}
                        </span>
                      </span>
                      <span class="status-chip">
                        {CATEGORY_META.find((c) => c.value === task.category)?.label ??
                          task.category}
                      </span>
                      {task.linkedUnitId && (
                        <span class="status-chip chip-growth">已联动单元过关</span>
                      )}
                    </div>
                    <div class="task-title">{task.title}</div>
                    {!isDone && matchedUnits.length > 0 && (
                      <div class="btn-row" style={{ marginTop: '8px' }}>
                        {matchedUnits.slice(0, 2).map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            class="btn btn-sm"
                            onClick={() => onOpenUnit(u.id)}
                          >
                            <span>合并交付：{u.title.slice(0, 14)}…</span>
                            <IconArrowRight size={13} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    class="btn btn-sm btn-danger-ghost"
                    onClick={async () => {
                      const next = await removeRealLifeTask(task.id);
                      onTelemetryChange(next);
                    }}
                  >
                    移除
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
