import React from 'react';

/**
 * KeyInsightsCard — displays key insights extracted from the article.
 * Each insight shows its descriptive name and the verbatim source sentences.
 */
export default function KeyInsightsCard({ keyInsights }) {
  if (!keyInsights || keyInsights.length === 0) return null;

  return (
    <div className="rg-insights-card">
      <div className="rg-insights-card__header">
        <span className="rg-insights-card__icon">💡</span>
        <h3 className="rg-insights-card__title">Key Insights</h3>
        <span className="rg-insights-card__count">{keyInsights.length}</span>
      </div>
      <div className="rg-insights-card__list">
        {keyInsights.map((insight, i) => {
          const sourceSentences = insight.source_sentences || [];

          return (
            <div key={i} className="rg-insight-item">
              <div className="rg-insight-item__name">{insight.name}</div>
              {sourceSentences.map((text, j) => (
                <p key={j} className="rg-insight-item__sentence">{text}</p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
