import { ArrowRight, BookOpen, Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Popconfirm, Tooltip } from '@/components/ui/overlays';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import { addRealLifeTask, removeRealLifeTask, toggleRealLifeTask } from '@/core/db';
import { cn } from '@/lib/utils';
import type {
  BranchId,
  LearningUnit,
  RealLifeTask,
  RealTaskCategory,
  TelemetrySnapshot,
} from '@/types/schema';

interface TaskPoolViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  onTelemetryChange: (next: TelemetrySnapshot) => void;
  onOpenUnit: (unitId: string) => void;
  onPreviewUnit: (unitId: string) => void;
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
  onPreviewUnit,
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
    toast.success('已加入真实任务池');
  };

  const handleQuickAdd = async (tpl: (typeof QUICK_TEMPLATES)[number]) => {
    const next = await addRealLifeTask(tpl);
    onTelemetryChange(next);
    toast.success(`已添加：${tpl.title}`);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
              生活待办 · 把手头要办的小事顺手划掉
            </h2>
            <p className="mt-1 mb-0 text-[13.5px] text-[var(--ink-2)]">
              记下你近期真正要做的事（整理账单、看房、慢跑、写汇报），顺手就能联动对应的实用小招
            </p>
          </div>
          <Badge tone="neutral" className="font-mono-num">
            待办 {tasks.filter((t) => t.status === 'open').length} · 已完成{' '}
            {tasks.filter((t) => t.status === 'completed').length}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-[var(--ink-3)]">常见小事一键加：</span>
          {QUICK_TEMPLATES.map((tpl) => (
            <Button key={tpl.title} size="sm" variant="subtle" onClick={() => handleQuickAdd(tpl)}>
              <Plus size={13} strokeWidth={1.6} />
              <span>{tpl.title.slice(0, 12)}…</span>
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
          <input
            type="text"
            className="v3-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={currentCatMeta.samplePlaceholder}
          />
          <select
            className="v3-select"
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as RealTaskCategory)}
          >
            {CATEGORY_META.map((c) => (
              <option value={c.value} key={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className="v3-select"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value as BranchId)}
          >
            {content.catalog.branches.map((b) => (
              <option value={b.id} key={b.id}>
                {b.id} {b.name}
              </option>
            ))}
          </select>
          <Button variant="primary" disabled={!title.trim()} onClick={handleAdd}>
            加入任务池
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h3 className="m-0 text-[16px] font-semibold text-[var(--ink-1)]">待交付与已归档任务</h3>
        {tasks.length === 0 ? (
          <div className="glass-plate p-4 text-[14px] text-[var(--ink-2)]">
            任务池还是空的，点击上方「常用场景速添」或输入一件近期真实待办开始
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {tasks.map((task) => {
              const branch = branchMap.get(task.branchId);
              const matchedUnits = findMatchingUnits(content.units, task);
              const isDone = task.status === 'completed';

              return (
                <div
                  key={task.id}
                  className={cn(
                    'flex items-start gap-3 py-3.5 first:pt-2 last:pb-1',
                    isDone && 'opacity-65'
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={`标记完成：${task.title}`}
                    onClick={async () => {
                      const next = await toggleRealLifeTask(task.id);
                      onTelemetryChange(next);
                      toast(isDone ? '已恢复为进行中' : '已标记为已交付');
                    }}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors',
                      isDone
                        ? 'border-[var(--growth)] bg-[var(--growth)] text-[#081510]'
                        : 'border-[var(--line-strong)] bg-[var(--surface-plate)]'
                    )}
                  >
                    {isDone && <Check size={13} strokeWidth={2.4} />}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="inline-flex items-center gap-1.5 text-[var(--ink-3)]">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: branch?.accentToken ?? 'var(--accent)' }}
                        />
                        <span>
                          {task.branchId} {branch?.name ?? task.branchId}
                        </span>
                      </span>
                      <Badge tone="neutral">
                        {CATEGORY_META.find((c) => c.value === task.category)?.label ??
                          task.category}
                      </Badge>
                      {task.linkedUnitId && <Badge tone="growth">已联动单元过关</Badge>}
                    </div>
                    <div
                      className={cn(
                        'text-[14.5px] font-medium text-[var(--ink-1)]',
                        isDone && 'line-through'
                      )}
                    >
                      {task.title}
                    </div>
                    {!isDone && matchedUnits.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {matchedUnits.slice(0, 2).map((u) => (
                          <div key={u.id} className="inline-flex items-center gap-1">
                            <Tooltip content="在右侧抽屉速览该单元">
                              <Button
                                size="sm"
                                variant="subtle"
                                aria-label={`速览：${u.title}`}
                                onClick={() => onPreviewUnit(u.id)}
                              >
                                <BookOpen size={12} strokeWidth={1.6} />
                              </Button>
                            </Tooltip>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onOpenUnit(u.id)}
                            >
                              <span>合并交付：{u.title.slice(0, 14)}…</span>
                              <ArrowRight size={13} strokeWidth={1.5} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 高频轻量删除：采用 Popconfirm 气泡确认，不弹 Modal 强打断 */}
                  <Popconfirm
                    title="移除这条待办？"
                    description="移出后不会影响已过关的学习单元记录。"
                    confirmLabel="确认移除"
                    tone="danger"
                    onConfirm={async () => {
                      const next = await removeRealLifeTask(task.id);
                      onTelemetryChange(next);
                      toast('已移除任务');
                    }}
                  >
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label={`移除任务：${task.title}`}
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                      <span className="hidden sm:inline">移除</span>
                    </Button>
                  </Popconfirm>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
