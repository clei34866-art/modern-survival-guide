import type { ReactNode } from 'react';
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

/**
 * 安全的轻量内联排版解析器：
 * - 将 `...` 解析为等宽代码芯片 <code className="inline-code">
 * - 将 **...** 解析为语义加粗 <strong>
 * - 当传入 concepts 时，为首次出现的关键术语挂载 Tooltip 悬停简介 + Drawer 详解抽屉
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
