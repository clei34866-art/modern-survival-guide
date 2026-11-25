import { isSourceExpired } from '../core/gatekeeper';
import type { OriginCard, SourceCompliance, UnitVisual } from '../types/schema';
import { ExactDiagram } from './ExactDiagram';
import { IconExternal, IconShield } from './Icons';

export function PlaceholderBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div class="compliance-placeholder-banner" role="note">
      <span class="status-chip chip-warning">示例占位</span>
      <span>当前单元为示例数据，正式内容由权威白名单信源构建。</span>
    </div>
  );
}

export function PsychBoundaryNotice({ sources }: { sources: SourceCompliance[] }) {
  const boundarySource = sources.find((s) => Boolean(s.helpBoundaryText));
  if (!boundarySource?.helpBoundaryText) return null;

  return (
    <aside class="compliance-psych-boundary" aria-label="心理健康专业求助边界提示">
      <div class="compliance-psych-title">
        <IconShield size={15} />
        <span>心理科普与专业求助边界</span>
      </div>
      <p class="compliance-psych-text">{boundarySource.helpBoundaryText}</p>
    </aside>
  );
}

export function OriginCardsList({ cards }: { cards?: OriginCard[] }) {
  if (!cards || cards.length === 0) return null;

  return (
    <section class="origin-cards-wrap" aria-label="经典实验与概念溯源卡">
      <h3 class="rail-section-title">经典实验与概念溯源</h3>
      <div class="origin-cards-stack">
        {cards.map((card) => (
          <article class="origin-card" key={card.conceptOrExperiment}>
            <div class="origin-card-title">{card.conceptOrExperiment}</div>
            <div class="origin-card-meta">{card.citation}</div>
            <div class="origin-card-row">
              <strong>原始发现：</strong>
              {card.originalSampleAndData}
            </div>
            <div class="origin-card-row">
              <strong>复现与边界：</strong>
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
    <div class="unit-visuals-stack">
      {visuals.map((vis, idx) => {
        if (vis.kind === 'sourced_image') {
          return (
            <figure class="visual-frame" key={idx}>
              <img src={vis.imagePath} alt={vis.caption ?? '导学配图'} class="visual-img" />
              <figcaption class="visual-caption-bar">
                <span>{vis.caption ?? '公开授权原图'}</span>
                {vis.imageSourceUrl && (
                  <a href={vis.imageSourceUrl} target="_blank" rel="noreferrer" class="inline-ext-link">
                    查看原图出处 <IconExternal size={13} />
                  </a>
                )}
              </figcaption>
            </figure>
          );
        }

        if (vis.kind === 'exact_svg' && vis.svgSpec) {
          return (
            <figure class="visual-frame visual-frame-motion" key={idx}>
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
          <div class="visual-no-image-note" key={idx}>
            <strong>无配图说明：</strong>
            {vis.noImageReason}
          </div>
        );
      })}
    </div>
  );
}

export function SourceTimelinessFooter({ sources }: { sources: SourceCompliance[] }) {
  const hasFinanceDisclaimer = sources.some((s) => s.disclaimerKind === 'finance_no_advice');

  return (
    <footer class="compliance-sources-footer" aria-label="内容出处与时效信息">
      {hasFinanceDisclaimer && (
        <div class="finance-redline-note">
          财经科普边界：本节仅讲解预算核算与金融基础常识，不构成投资建议，不推荐具体股票、基金代码或理财产品。
        </div>
      )}
      <div class="sources-list-title">权威出处与时效记录</div>
      <ul class="sources-list">
        {sources.map((src, idx) => {
          const expired = isSourceExpired(src.reviewAfter);
          return (
            <li key={idx} class="source-item">
              <div class="source-main-line">
                <strong>{src.sourceOrg}</strong>
                <a href={src.sourceUrl} target="_blank" rel="noreferrer" class="inline-ext-link">
                  原始来源 <IconExternal size={12} />
                </a>
              </div>
              <div class="source-meta-sub">
                <span class="tabular-num">核验于 {src.fetchedAt}</span>
                {src.reviewAfter && (
                  <span class={`timeliness-pill ${expired ? 'is-expired' : 'is-valid'}`}>
                    {expired
                      ? `已超复核期 (${src.reviewAfter}) · 待复核`
                      : `有效至 ${src.reviewAfter}`}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </footer>
  );
}
