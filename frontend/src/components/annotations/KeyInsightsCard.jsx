import React from 'react';

/**
 * KeyInsightsCard — displays key insights extracted from the article.
 * Each insight shows its descriptive name and links to the relevant topic cards.
 */
export default function KeyInsightsCard({ keyInsights, onTopicClick }) {
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
          const topics = insight.topics || [];

          return (
            <div key={i} className="rg-insight-item">
              <div className="rg-insight-item__name">{insight.name}</div>
              {topics.length > 0 ? (
                <div className="rg-insight-item__topics">
                  {topics.map((topicName, j) => (
                    <button
                      key={j}
                      className="rg-insight-item__topic-link"
                      onClick={() => onTopicClick && onTopicClick(topicName)}
                      title={topicName.includes('>') ? topicName : undefined}
                    >
                      {topicName.split('>').pop()}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rg-insight-item__no-topics">No specific topics identified</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
