import { BookMarked, Copy, Download, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Popconfirm } from '@/components/ui/overlays';
import { Badge, Button, Card } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import { addLifeNote, removeLifeNote } from '@/core/db';
import type { BranchId, TelemetrySnapshot } from '@/types/schema';

interface LifeNotebookViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  onTelemetryChange: (next: TelemetrySnapshot) => void;
  onOpenUnit: (unitId: string) => void;
}

export function LifeNotebookView({
  content,
  telemetry,
  onTelemetryChange,
  onOpenUnit,
}: LifeNotebookViewProps) {
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteBody, setNoteBody] = useState<string>('');
  const [noteBranch, setNoteBranch] = useState<BranchId>('B7');
  const [query, setQuery] = useState<string>('');

  const branchMap = useMemo(
    () => new Map(content.catalog.branches.map((b) => [b.id, b])),
    [content.catalog.branches]
  );
  const unitMap = useMemo(
    () => new Map(content.units.map((u) => [u.id, u])),
    [content.units]
  );

  const customNotes = telemetry.lifeNotes ?? [];
  const unitNotes = useMemo(
    () =>
      Object.values(telemetry.unitSubmissions)
        .filter((s) => Boolean(s.feynmanOneLiner?.trim() || s.deliverableSummary?.trim()))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [telemetry.unitSubmissions]
  );

  const q = query.trim().toLowerCase();
  const filteredCustom = customNotes.filter(
    (n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
  );
  const filteredUnitNotes = unitNotes.filter((s) => {
    if (!q) return true;
    const uTitle = unitMap.get(s.unitId)?.title.toLowerCase() ?? '';
    return (
      uTitle.includes(q) ||
      (s.feynmanOneLiner?.toLowerCase().includes(q) ?? false) ||
      s.deliverableSummary.toLowerCase().includes(q)
    );
  });

  const handleAddNote = async () => {
    if (!noteBody.trim()) return;
    const next = await addLifeNote({
      title: noteTitle.trim() || '生活随手记',
      body: noteBody.trim(),
      branchId: noteBranch,
    });
    setNoteTitle('');
    setNoteBody('');
    onTelemetryChange(next);
    toast.success('已收进随身生活笔记');
  };

  const buildMarkdown = () => {
    const lines: string[] = ['# 我的随身生活笔记', ''];
    if (customNotes.length > 0) {
      lines.push('## 日常随手记', '');
      for (const n of customNotes) {
        const bName = n.branchId ? branchMap.get(n.branchId)?.name ?? n.branchId : '日常';
        lines.push(`### ${n.title}（${bName} · ${n.createdAt.slice(0, 10)}）`);
        lines.push(n.body, '');
      }
    }
    if (unitNotes.length > 0) {
      lines.push('## 我用自己的话记下的核心招数', '');
      for (const u of unitNotes) {
        const title = unitMap.get(u.unitId)?.title ?? u.unitId;
        lines.push(`### ${title}`);
        if (u.feynmanOneLiner) lines.push(`- **一句话备忘**：${u.feynmanOneLiner}`);
        if (u.deliverableSummary) lines.push(`- **落地记录**：${u.deliverableSummary}`);
        lines.push('');
      }
    }
    return lines.join('\n');
  };

  const handleCopyMarkdown = async () => {
    const md = buildMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      toast.success('已复制全部 Markdown 生活笔记');
    } catch {
      toast('复制未获浏览器权限，请尝试直接下载 .md 文件');
    }
  };

  const handleDownloadMarkdown = () => {
    const md = buildMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `生活手账笔记-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('已导出 Markdown 生活笔记');
  };

  return (
    <div className="space-y-4" data-testid="life-notebook-view">
      {/* 随手记一笔 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[18px] font-semibold text-[var(--ink-1)]">
              随身生活笔记 · 备忘与用自己的话记下来
            </h2>
            <p className="mt-1 mb-0 text-[13.5px] text-[var(--ink-2)]">
              平时想到的生活经验、看房参数、常备药或学完顺手写下的一句话，都汇总在这里随时搜
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="subtle" onClick={handleCopyMarkdown}>
              <Copy size={13} strokeWidth={1.6} />
              <span>复制 MD</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadMarkdown}>
              <Download size={13} strokeWidth={1.6} />
              <span>导出手账</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <input
            type="text"
            className="v3-input"
            placeholder="标题（选填，如：租房民电标准 / 体检前提醒）"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
          />
          <select
            className="v3-select"
            value={noteBranch}
            onChange={(e) => setNoteBranch(e.target.value as BranchId)}
          >
            {content.catalog.branches.map((b) => (
              <option key={b.id} value={b.id}>
                归类：{b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <textarea
            rows={2}
            className="v3-textarea flex-1"
            placeholder="随手写一句以后会用得上的生活备忘…"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
          />
          <Button
            variant="primary"
            className="self-end sm:self-stretch"
            disabled={!noteBody.trim()}
            onClick={handleAddNote}
            data-testid="life-note-add-btn"
          >
            <Plus size={14} strokeWidth={1.8} />
            <span>记一笔</span>
          </Button>
        </div>
      </Card>

      {/* 搜索与聚合列表 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--ink-1)]">
            <BookMarked size={16} strokeWidth={1.7} className="text-[var(--dawn)]" />
            <span>
              我的备忘夹（{filteredCustom.length + filteredUnitNotes.length} 条）
            </span>
          </div>
          <div className="relative w-full sm:w-[260px]">
            <Search
              size={14}
              strokeWidth={1.6}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-3)]"
            />
            <input
              type="text"
              className="v3-input pl-8 text-[13.5px]"
              placeholder="搜关键词…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {filteredCustom.length === 0 && filteredUnitNotes.length === 0 ? (
          <div className="glass-plate p-4 text-[14px] text-[var(--ink-2)]">
            笔记夹还空着呢，在上面随手写一条生活备忘，或者看完任意技能卡片后留下一句话，就会自动收进这里。
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCustom.map((note) => {
              const bMeta = note.branchId ? branchMap.get(note.branchId) : undefined;
              return (
                <div key={note.id} className="glass-plate space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{bMeta?.name ?? '日常随手记'}</Badge>
                        <span className="font-mono-num text-[11.5px] text-[var(--ink-3)]">
                          {note.createdAt.slice(0, 10)}
                        </span>
                      </div>
                      <h3 className="m-0 text-[15px] font-semibold text-[var(--ink-1)]">
                        {note.title}
                      </h3>
                    </div>

                    <Popconfirm
                      title="删掉这条备忘？"
                      confirmLabel="删除"
                      tone="danger"
                      onConfirm={async () => {
                        const next = await removeLifeNote(note.id);
                        onTelemetryChange(next);
                        toast('已删掉这条笔记');
                      }}
                    >
                      <Button size="sm" variant="ghost" aria-label={`删除笔记：${note.title}`}>
                        <Trash2 size={13} strokeWidth={1.6} />
                      </Button>
                    </Popconfirm>
                  </div>
                  <p className="m-0 whitespace-pre-wrap text-[14px] leading-[1.68] text-[var(--ink-2)]">
                    {note.body}
                  </p>
                </div>
              );
            })}

            {filteredUnitNotes.map((sub) => {
              const u = unitMap.get(sub.unitId);
              const bMeta = branchMap.get(sub.branchId);
              return (
                <div key={sub.unitId} className="glass-plate space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="growth">学后一句话 · {bMeta?.name ?? sub.branchId}</Badge>
                      <span className="font-mono-num text-[11.5px] text-[var(--ink-3)]">
                        {sub.updatedAt.slice(0, 10)}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => onOpenUnit(sub.unitId)}>
                      重温这节
                    </Button>
                  </div>
                  <div className="text-[14.5px] font-semibold text-[var(--ink-1)]">
                    {u?.title ?? sub.unitId}
                  </div>
                  {sub.feynmanOneLiner && (
                    <p className="m-0 rounded-[8px] border border-[var(--dawn-border)] bg-[var(--dawn-soft)] px-3 py-2 text-[13.5px] text-[var(--ink-1)]">
                      「{sub.feynmanOneLiner}」
                    </p>
                  )}
                  {sub.deliverableSummary && (
                    <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
                      落地记录：{sub.deliverableSummary}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
