import React from 'react';

const INSIGHT_TYPE_LABELS = {
  counterintuitive: 'Counterintuitive',
  actionable_threshold: 'Actionable Threshold',
  surprising_statistic: 'Surprising Statistic',
  important_caveat: 'Important Caveat',
  paradigm_shift: 'Paradigm Shift',
};

/**
 * KeyInsightsCard — displays key insights extracted from the article.
 * Each insight shows the verbatim source sentences + an insight type badge.
 * No LLM-generated text is displayed.
 */
export default function KeyInsightsCard({ keyInsights, sentences, onTopicClick }) {
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
          const typeLabel = INSIGHT_TYPE_LABELS[insight.insight_type] || insight.insight_type;
          const sourceSentences = (insight.sentence_indices || [])
            .filter((idx) => idx >= 1 && idx <= (sentences || []).length)
            .map((idx) => sentences[idx - 1])
            .filter(Boolean);

          return (
            <div key={i} className="rg-insight-item">
              <div className="rg-insight-item__meta">
                <span className={`rg-insight-item__type rg-insight-item__type--${insight.insight_type}`}>
                  {typeLabel}
                </span>
                {insight.topic && (
                  <button
                    className="rg-insight-item__topic-tag"
                    onClick={() => onTopicClick && onTopicClick(insight.topic)}
                    title={`Go to topic: ${insight.topic}`}
                  >
                    {insight.topic.split('>').pop().trim()}
                  </button>
                )}
              </div>
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
