import { Check, Copy } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { useGlossaryDrawer } from '@/components/GlossaryDrawer';
import { Tooltip } from '@/components/ui/overlays';
import type { ConceptNode } from '@/types/schema';

interface RichTextProps {
  text: string;
  concepts?: ConceptNode[];
}

interface GlossaryTermProps {
  term: string;
  concept: ConceptNode;
}

/**
 * 术语交互严格遵循六分法：
 * - 悬停：Tooltip 一句话悬停提示（只放一句话，移开即消失，不打断）
 * - 点击：打开右侧 GlossaryDrawer 术语详解抽屉（原页面留在后面，边看边查）
 */
function GlossaryTerm({ term, concept }: GlossaryTermProps) {
  const glossary = useGlossaryDrawer();
  const brief =
    concept.plainDefinition.length > 36
      ? `${concept.plainDefinition.slice(0, 36)}…（点开右侧详解）`
      : `${concept.plainDefinition}（点开右侧详解）`;

  return (
    <Tooltip content={brief} side="top">
      <button
        type="button"
        className="glossary-trigger glossary-term-btn"
        onClick={(e) => {
          e.stopPropagation();
          glossary?.openConcept(concept);
        }}
      >
        {term}
      </button>
    </Tooltip>
  );
}

function extractMatchKeywords(concept: ConceptNode): string[] {
  const candidates = new Set<string>();
  const cleanLabel = concept.label.replace(/（.*?）|\(.*?\)/g, '').trim();
  for (const part of cleanLabel.split(/[与和、·/]/)) {
    const trimmed = part.trim();
    if (trimmed.length >= 3 && trimmed.length <= 12) {
      candidates.add(trimmed);
    }
  }
  const parenMatch = concept.label.match(/[（(]([A-Za-z][A-Za-z0-9 .()-]{2,28})[）)]/);
  if (parenMatch) candidates.add(parenMatch[1].trim());
  return Array.from(candidates).sort((a, b) => b.length - a.length);
}

function renderInlineWithUsed(
  text: string,
  concepts: ConceptNode[] | undefined,
  usedConcepts: Set<string>,
  prefix: string
): ReactNode {
  const conceptMatchers = (concepts ?? []).flatMap((c) =>
    extractMatchKeywords(c).map((kw) => ({ kw, concept: c }))
  );

  const annotatePlainSegment = (segment: string, keyPrefix: string): ReactNode => {
    if (!conceptMatchers.length || !segment) return segment;
    for (const { kw, concept } of conceptMatchers) {
      if (usedConcepts.has(concept.id)) continue;
      const idx = segment.indexOf(kw);
      if (idx !== -1) {
        usedConcepts.add(concept.id);
        const before = segment.slice(0, idx);
        const after = segment.slice(idx + kw.length);
        return (
          <>
            {before}
            <GlossaryTerm key={`${keyPrefix}-${concept.id}`} term={kw} concept={concept} />
            {annotatePlainSegment(after, `${keyPrefix}-r`)}
          </>
        );
      }
    }
    return segment;
  };

  const tokenRegex = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  const parts = text.split(tokenRegex);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          return (
            <code className="inline-code" key={`${prefix}-c-${idx}`}>
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          const inner = part.slice(2, -2);
          const innerParts = inner.split(/(`[^`\n]+`)/g);
          return (
            <strong className="font-semibold text-[var(--ink-1)]" key={`${prefix}-b-${idx}`}>
              {innerParts.map((sub, subIdx) => {
                if (!sub) return null;
                if (sub.startsWith('`') && sub.endsWith('`') && sub.length >= 2) {
                  return (
                    <code className="inline-code" key={`${prefix}-bc-${idx}-${subIdx}`}>
                      {sub.slice(1, -1)}
                    </code>
                  );
                }
                return (
                  <span key={`${prefix}-bt-${idx}-${subIdx}`}>
                    {annotatePlainSegment(sub, `${prefix}-b-${idx}-${subIdx}`)}
                  </span>
                );
              })}
            </strong>
          );
        }
        return <span key={`${prefix}-t-${idx}`}>{annotatePlainSegment(part, `${prefix}-t-${idx}`)}</span>;
      })}
    </>
  );
}

/**
 * 安全的轻量内联排版解析器：
 * - 将 `...` 解析为等宽代码芯片 <code className="inline-code">
 * - 将 **...** 解析为语义加粗 <strong>
 * - 当传入 concepts 时，为首次出现的关键术语挂载 Tooltip 悬停简介 + Drawer 详解抽屉
 */
export function RichText({ text, concepts }: RichTextProps) {
  const usedConcepts = new Set<string>();
  return <>{renderInlineWithUsed(text, concepts, usedConcepts, 'rt')}</>;
}

function CopyableCodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('已复制模板内容，改改细节就能直接用');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('请手动选中上方内容复制');
    }
  };

  const label =
    lang === 'text' || !lang
      ? '可直接复制的话术 / 模板'
      : lang === 'python'
        ? 'Python 可运行代码'
        : lang === 'bash' || lang === 'sh'
          ? '终端命令速查'
          : lang.toUpperCase();

  return (
    <div className="handbook-code-wrap my-3.5 overflow-hidden rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface-plate)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3.5 py-2 text-[12px] text-[var(--ink-3)]">
        <span className="font-medium">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          data-testid="copy-template-btn"
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--line)] bg-transparent px-2.5 py-0.5 text-[11.5px] font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--ink-1)]"
        >
          {copied ? <Check size={12} strokeWidth={2.2} className="text-[var(--growth)]" /> : <Copy size={12} strokeWidth={1.7} />}
          <span>{copied ? '已复制' : '一键复制'}</span>
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-4 py-3.5 font-mono-num text-[13px] leading-[1.7] text-[var(--ink-1)] whitespace-pre-wrap break-words">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  return /^\|?[\s:|-]+\|?$/.test(trimmed);
}

/**
 * 深度实战手册 Markdown 渲染引擎：
 * 支持：多段落、### 子标题、有序/无序列表、标准对比表格、> 提醒引用块、带一键复制的模板/代码块、加粗与术语抽屉
 */
export function MarkdownArticle({ text, concepts }: RichTextProps) {
  const usedConcepts = new Set<string>();
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];

  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // 1. Fenced 代码 / 话术模板块
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // 跳过结束 ```
      blocks.push(
        <CopyableCodeBlock key={`cb-${blockKey++}`} lang={lang} code={codeLines.join('\n').trimEnd()} />
      );
      continue;
    }

    // 2. Markdown 对比表格
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableCells(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim().length > 0) {
        rows.push(parseTableCells(lines[i]));
        i += 1;
      }
      const tk = blockKey++;
      blocks.push(
        <div
          key={`tbl-${tk}`}
          className="my-3.5 overflow-x-auto rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface-plate)]"
        >
          <table className="handbook-table w-full border-collapse text-left text-[13.5px] leading-[1.65]">
            <thead>
              <tr className="border-b border-[var(--line-strong)] bg-[var(--surface-raised)]">
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    className="px-3.5 py-2.5 font-semibold text-[var(--ink-1)] whitespace-nowrap"
                  >
                    {renderInlineWithUsed(h, concepts, usedConcepts, `th-${tk}-${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="align-top">
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2.5 text-[var(--ink-2)]">
                      {renderInlineWithUsed(row[cIdx] ?? '', concepts, usedConcepts, `td-${tk}-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 3. 子标题 ### / ####
    const headingMatch = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (headingMatch) {
      const hk = blockKey++;
      blocks.push(
        <h3
          key={`h-${hk}`}
          className="mt-4 mb-1.5 text-[15.5px] font-semibold leading-[1.45] text-[var(--ink-1)]"
        >
          {renderInlineWithUsed(headingMatch[2], concepts, usedConcepts, `h-${hk}`)}
        </h3>
      );
      i += 1;
      continue;
    }

    // 4. 引用提醒块 >
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const qk = blockKey++;
      blocks.push(
        <blockquote
          key={`bq-${qk}`}
          className="my-3 rounded-r-[10px] border-l-[3px] border-[var(--dawn)] bg-[var(--dawn-soft)] px-4 py-3 text-[14px] leading-[1.72] text-[var(--ink-1)]"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx} className={qIdx === 0 ? 'm-0' : 'mt-1.5 mb-0'}>
              {renderInlineWithUsed(ql, concepts, usedConcepts, `bq-${qk}-${qIdx}`)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // 5. 无序列表 - / * / •（支持缩进续行与二级要点）
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: { main: string; extras: string[] }[] = [];
      while (i < lines.length) {
        const curRaw = lines[i];
        const curTrim = curRaw.trim();
        if (!curTrim) break;
        const isIndented = /^\s{2,}/.test(curRaw);
        if (!isIndented && /^[-*•]\s+/.test(curTrim)) {
          items.push({ main: curTrim.replace(/^[-*•]\s+/, ''), extras: [] });
          i += 1;
        } else if (isIndented && items.length > 0) {
          items[items.length - 1].extras.push(curTrim);
          i += 1;
        } else {
          break;
        }
      }
      const uk = blockKey++;
      blocks.push(
        <ul key={`ul-${uk}`} className="my-2.5 list-disc space-y-2 pl-5 text-[15px] leading-[1.8] text-[var(--ink-2)]">
          {items.map((it, idx) => (
            <li key={idx}>
              <div>{renderInlineWithUsed(it.main, concepts, usedConcepts, `ul-${uk}-${idx}`)}</div>
              {it.extras.map((ex, exIdx) => (
                <div
                  key={exIdx}
                  className={
                    /^[-*•]\s+/.test(ex)
                      ? 'mt-1 pl-3 text-[14.2px] leading-[1.72] text-[var(--ink-2)] before:mr-1.5 before:text-[var(--ink-3)] before:content-["◦"]'
                      : 'mt-1 text-[14.2px] leading-[1.72] text-[var(--ink-2)]'
                  }
                >
                  {renderInlineWithUsed(ex.replace(/^[-*•]\s+/, ''), concepts, usedConcepts, `ul-${uk}-${idx}-${exIdx}`)}
                </div>
              ))}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 6. 有序列表 1. / 2.（支持缩进续行与二级要点，不打断序号）
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: { main: string; extras: string[] }[] = [];
      while (i < lines.length) {
        const curRaw = lines[i];
        const curTrim = curRaw.trim();
        if (!curTrim) break;
        const isIndented = /^\s{2,}/.test(curRaw);
        if (!isIndented && /^\d+\.\s+/.test(curTrim)) {
          items.push({ main: curTrim.replace(/^\d+\.\s+/, ''), extras: [] });
          i += 1;
        } else if (isIndented && items.length > 0) {
          items[items.length - 1].extras.push(curTrim);
          i += 1;
        } else {
          break;
        }
      }
      const ok = blockKey++;
      blocks.push(
        <ol key={`ol-${ok}`} className="my-2.5 list-decimal space-y-2 pl-5 text-[15px] leading-[1.8] text-[var(--ink-2)]">
          {items.map((it, idx) => (
            <li key={idx}>
              <div>{renderInlineWithUsed(it.main, concepts, usedConcepts, `ol-${ok}-${idx}`)}</div>
              {it.extras.map((ex, exIdx) => (
                <div
                  key={exIdx}
                  className={
                    /^[-*•]\s+/.test(ex)
                      ? 'mt-1 pl-3 text-[14.2px] leading-[1.72] text-[var(--ink-2)] before:mr-1.5 before:text-[var(--ink-3)] before:content-["◦"]'
                      : 'mt-1 text-[14.2px] leading-[1.72] text-[var(--ink-2)]'
                  }
                >
                  {renderInlineWithUsed(ex.replace(/^[-*•]\s+/, ''), concepts, usedConcepts, `ol-${ok}-${idx}-${exIdx}`)}
                </div>
              ))}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 7. 普通段落（合并连续非特殊行）
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    const pk = blockKey++;
    blocks.push(
      <p key={`p-${pk}`} className="my-2.5 text-[15.2px] leading-[1.85] text-[var(--ink-2)] first:mt-0 last:mb-0">
        {renderInlineWithUsed(paraLines.join(' '), concepts, usedConcepts, `p-${pk}`)}
      </p>
    );
  }

  return <div className="handbook-prose space-y-1">{blocks}</div>;
}
