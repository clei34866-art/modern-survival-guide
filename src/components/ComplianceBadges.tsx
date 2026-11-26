import { BookMarked, ExternalLink, Info, ShieldAlert } from 'lucide-react';
import { ExactDiagram } from '@/components/ExactDiagram';
import { Badge } from '@/components/ui/primitives';
import { isSourceExpired } from '@/core/gatekeeper';
import type { OriginCard, SourceCompliance, UnitVisual } from '@/types/schema';

export function PlaceholderBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3.5 py-2.5 text-[13.5px] text-[var(--ink-1)]"
      role="note"
    >
      <Badge tone="warning">示例占位</Badge>
      <span>当前单元为示例数据，正式内容由权威白名单信源构建</span>
    </div>
  );
}

export function PsychBoundaryNotice({ sources }: { sources: SourceCompliance[] }) {
  const boundarySource = sources.find((s) => Boolean(s.helpBoundaryText));
  if (!boundarySource?.helpBoundaryText) return null;

  return (
    <aside
      className="rounded-[12px] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4"
      aria-label="心理健康专业求助边界提示"
    >
      <div className="mb-1.5 flex items-center gap-2 text-[13.5px] font-semibold text-[var(--warning)]">
        <ShieldAlert size={15} strokeWidth={1.6} />
        <span>心理科普与专业求助边界</span>
      </div>
      <p className="m-0 text-[13.5px] leading-[1.65] text-[var(--ink-2)]">
        {boundarySource.helpBoundaryText}
      </p>
    </aside>
  );
}

export function OriginCardsList({ cards }: { cards?: OriginCard[] }) {
  if (!cards || cards.length === 0) return null;

  return (
    <section className="v3-card p-4" aria-label="经典实验与概念溯源卡">
      <div className="mb-3 flex items-center gap-2 text-[13.5px] font-semibold text-[var(--ink-1)]">
        <BookMarked size={15} strokeWidth={1.5} className="text-[var(--accent)]" />
        <span>经典实验与概念溯源</span>
      </div>
      <div className="flex flex-col gap-3">
        {cards.map((card) => (
          <article
            className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-3.5 text-[13px] leading-[1.6]"
            key={card.conceptOrExperiment}
          >
            <div className="font-semibold text-[var(--ink-1)]">{card.conceptOrExperiment}</div>
            <div className="mt-0.5 font-mono-num text-[11.5px] text-[var(--ink-3)]">
              {card.citation}
            </div>
            <div className="mt-2 text-[var(--ink-2)]">
              <strong className="font-medium text-[var(--ink-1)]">原始发现：</strong>
              {card.originalSampleAndData}
            </div>
            <div className="mt-1.5 text-[var(--ink-2)]">
              <strong className="font-medium text-[var(--ink-1)]">复现与边界：</strong>
              {card.replicationControversy}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

interface UnitVisualFrameProps {
  visuals: UnitVisual[];
  activeStep?: number;
  onStepChange?: (stepIndex: number) => void;
}

export function UnitVisualFrame({ visuals, activeStep, onStepChange }: UnitVisualFrameProps) {
  return (
    <div className="flex flex-col gap-4">
      {visuals.map((vis, idx) => {
        if (vis.kind === 'sourced_image') {
          return (
            <figure className="v3-card m-0 overflow-hidden" key={idx}>
              <img
                src={vis.imagePath}
                alt={vis.caption ?? '导学配图'}
                className="block h-auto w-full object-cover"
              />
              <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2.5 text-[13px] text-[var(--ink-2)]">
                <span>{vis.caption ?? '公开授权原图'}</span>
                {vis.imageSourceUrl && (
                  <a
                    href={vis.imageSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                  >
                    <span>查看原图出处</span>
                    <ExternalLink size={12} strokeWidth={1.5} />
                  </a>
                )}
              </figcaption>
            </figure>
          );
        }

        if (vis.kind === 'exact_svg' && vis.svgSpec) {
          return (
            <figure className="m-0" key={idx}>
              <ExactDiagram
                spec={vis.svgSpec}
                caption={vis.caption}
                activeStep={idx === 0 ? activeStep : undefined}
                onStepChange={idx === 0 ? onStepChange : undefined}
              />
            </figure>
          );
        }

        return (
          <div
            className="v3-card-raised flex items-start gap-2.5 p-3.5 text-[13.5px] text-[var(--ink-2)]"
            key={idx}
          >
            <Info size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[var(--ink-3)]" />
            <div>
              <strong className="font-medium text-[var(--ink-1)]">无配图说明：</strong>
              {vis.noImageReason}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SourceTimelinessFooter({ sources }: { sources: SourceCompliance[] }) {
  const hasFinanceDisclaimer = sources.some((s) => s.disclaimerKind === 'finance_no_advice');

  return (
    <footer className="v3-card p-4" aria-label="内容出处与时效信息">
      {hasFinanceDisclaimer && (
        <div className="mb-3 rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3 text-[12.5px] leading-[1.6] text-[var(--ink-2)]">
          财经科普边界：本节仅讲解预算核算与金融基础常识，不构成投资建议，不推荐具体股票、基金或理财产品
        </div>
      )}
      <div className="mb-2.5 text-[13px] font-semibold text-[var(--ink-1)]">
        权威出处与时效记录
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {sources.map((src, idx) => {
          const expired = isSourceExpired(src.reviewAfter);
          return (
            <li
              key={idx}
              className="border-t border-[var(--line)] pt-2.5 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <strong className="font-medium text-[var(--ink-1)]">{src.sourceOrg}</strong>
                <a
                  href={src.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12.5px] text-[var(--accent)] hover:underline"
                >
                  <span>原始来源</span>
                  <ExternalLink size={12} strokeWidth={1.5} />
                </a>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-3)]">
                <span className="font-mono-num">核验于 {src.fetchedAt}</span>
                {src.reviewAfter && (
                  <Badge tone={expired ? 'danger' : 'growth'}>
                    {expired
                      ? `已超复核期 (${src.reviewAfter}) · 待复核`
                      : `有效至 ${src.reviewAfter}`}
                  </Badge>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </footer>
  );
}
