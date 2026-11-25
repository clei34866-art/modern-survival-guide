import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { ConceptNode } from '../types/schema';

interface RichTextProps {
  text: string;
  concepts?: ConceptNode[];
}

interface GlossaryChipProps {
  term: string;
  concept: ConceptNode;
}

function GlossaryTerm({ term, concept }: GlossaryChipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      class="glossary-term-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        class={`glossary-term-btn ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {term}
      </button>
      {open && (
        <span class="glossary-popover" role="tooltip">
          <span class="glossary-popover-title">{concept.label}</span>
          <span class="glossary-popover-body">{concept.plainDefinition}</span>
        </span>
      )}
    </span>
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
 * - 将 `...` 解析为等宽代码芯片 <code class="inline-code">
 * - 将 **...** 解析为语义加粗 <strong>
 * - 当传入 concepts 时，为首次出现的关键术语自动挂载可点/可悬停的术语解释浮层
 */
export function RichText({ text, concepts }: RichTextProps) {
  const usedConcepts = new Set<string>();
  const conceptMatchers = (concepts ?? []).flatMap((c) =>
    extractMatchKeywords(c).map((kw) => ({ kw, concept: c }))
  );

  const annotatePlainSegment = (segment: string, keyPrefix: string): ComponentChildren => {
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

  // 同时匹配行内代码 `...` 与加粗 **...**
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(tokenRegex);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          return (
            <code class="inline-code" key={idx}>
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          const inner = part.slice(2, -2);
          return <strong key={idx}>{annotatePlainSegment(inner, `b-${idx}`)}</strong>;
        }
        return <span key={idx}>{annotatePlainSegment(part, `t-${idx}`)}</span>;
      })}
    </>
  );
}
