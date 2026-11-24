import { isSourceExpired } from '../core/gatekeeper';
import type { OriginCard, SourceCompliance, UnitVisual } from '../types/schema';
import { ExactDiagram } from './ExactDiagram';

export function PlaceholderBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div class="compliance-placeholder-banner" role="note">
      <span class="badge-pill badge-demo">[示例占位 · 待抓源替换]</span>
      <span>
        当前单元为骨架阶段示例占位数据，用于验证 7 步学习流水线与留痕闭环；正式内容将在 M9–M10 由 Scrapling 权威源管线替换。
      </span>
    </div>
  );
}

export function PsychBoundaryNotice({ sources }: { sources: SourceCompliance[] }) {
  const boundarySource = sources.find((s) => Boolean(s.helpBoundaryText));
  if (!boundarySource?.helpBoundaryText) return null;

  return (
    <aside class="compliance-psych-boundary" aria-label="心理健康专业求助边界提示">
      <div class="compliance-psych-title">温和提示 · 心理科普与专业求助边界</div>
      <p class="compliance-psych-text">{boundarySource.helpBoundaryText}</p>
    </aside>
  );
}

export function OriginCardsList({ cards }: { cards?: OriginCard[] }) {
  if (!cards || cards.length === 0) return null;

  return (
    <section class="origin-cards-wrap" aria-label="经典实验与概念溯源卡">
      <h3 class="origin-section-heading">经典实验与概念溯源卡</h3>
      {cards.map((card) => (
        <article class="origin-card" key={card.conceptOrExperiment}>
          <div class="origin-card-title">{card.conceptOrExperiment}</div>
          <div class="origin-card-meta">原始出处：{card.citation}</div>
          <div class="origin-card-row">
            <strong>原始样本与发现：</strong>
            {card.originalSampleAndData}
          </div>
          <div class="origin-card-row">
            <strong>复现与适用边界争议：</strong>
            {card.replicationControversy}
          </div>
        </article>
      ))}
    </section>
  );
}

export function UnitVisualFrame({ visuals }: { visuals: UnitVisual[] }) {
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
                  <a href={vis.imageSourceUrl} target="_blank" rel="noreferrer">
                    查看原图出处 ↗
                  </a>
                )}
              </figcaption>
            </figure>
          );
        }

        if (vis.kind === 'exact_svg' && vis.svgSpec) {
          return (
            <figure class="visual-frame" key={idx}>
              <ExactDiagram spec={vis.svgSpec} />
              <figcaption class="visual-caption-bar">
                <span>{vis.caption ?? '参数化代码精确示意图'}</span>
                <span class="visual-kind-tag">代码精确图 · SVG</span>
              </figcaption>
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
          财经红线说明：本平台仅提供预算核算与金融基础常识科普，不构成任何具体投资建议，不推荐任何股票、基金代码或理财产品。
        </div>
      )}
      <div class="sources-list-title">内容来源与抓取时效记录</div>
      <ul class="sources-list">
        {sources.map((src, idx) => {
          const expired = isSourceExpired(src.reviewAfter);
          return (
            <li key={idx} class="source-item">
              <div class="source-main-line">
                <strong>{src.sourceOrg}</strong>
                <span>· 抓取日期 {src.fetchedAt}</span>
                <a href={src.sourceUrl} target="_blank" rel="noreferrer">
                  来源链接 ↗
                </a>
              </div>
              {src.reviewAfter && (
                <span
                  class={`timeliness-pill ${expired ? 'is-expired' : 'is-valid'}`}
                >
                  {expired
                    ? `已超复核期（${src.reviewAfter}）· 待复核`
                    : `${src.publishedYear ? `${src.publishedYear} 年发布 · ` : ''}有效（复核期至 ${src.reviewAfter}）`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </footer>
  );
}
