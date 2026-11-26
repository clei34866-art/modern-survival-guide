import * as Popover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import type { ConceptNode } from '@/types/schema';

interface RichTextProps {
  text: string;
  concepts?: ConceptNode[];
}

interface GlossaryTermProps {
  term: string;
  concept: ConceptNode;
}

function GlossaryTerm({ term, concept }: GlossaryTermProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="glossary-trigger glossary-term-btn"
          onClick={(e) => e.stopPropagation()}
        >
          {term}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          onClick={(e) => e.stopPropagation()}
          className="glossary-popover z-50 w-[min(300px,86vw)] rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] p-3.5 text-left shadow-[var(--shadow-float)] outline-none"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[var(--ink-1)]">{concept.label}</span>
            <span className="font-mono-num rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[11px] text-[var(--ink-3)]">
              {concept.branchId}
            </span>
          </div>
          <p className="m-0 text-[13px] leading-[1.6] text-[var(--ink-2)]">
            {concept.plainDefinition}
          </p>
          <Popover.Arrow className="fill-[var(--surface)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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

/**
 * 安全的轻量内联排版解析器：
 * - 将 `...` 解析为等宽代码芯片 <code className="inline-code">
 * - 将 **...** 解析为语义加粗 <strong>
 * - 当传入 concepts 时，为首次出现的关键术语挂载 Radix Popover 术语解释卡片
 */
export function RichText({ text, concepts }: RichTextProps) {
  const usedConcepts = new Set<string>();
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

  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(tokenRegex);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          return (
            <code className="inline-code" key={idx}>
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          const inner = part.slice(2, -2);
          return (
            <strong className="font-semibold text-[var(--ink-1)]" key={idx}>
              {annotatePlainSegment(inner, `b-${idx}`)}
            </strong>
          );
        }
        return <span key={idx}>{annotatePlainSegment(part, `t-${idx}`)}</span>;
      })}
    </>
  );
}
