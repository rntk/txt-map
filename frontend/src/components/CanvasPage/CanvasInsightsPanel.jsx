import React from "react";

/**
 * @param {{
 *   show: boolean,
 *   insights: Array<{
 *     name?: string,
 *     topics?: string[],
 *     source_sentences?: string[],
 *     source_sentence_indices?: number[],
 *   }>,
 *   sentences: string[],
 * }} props
 */
export default function CanvasInsightsPanel({ show, insights, sentences }) {
  if (!show) return null;

  /** @type {Array<{name?: string, topics?: string[], source_sentences?: string[], source_sentence_indices?: number[]}>} */
  const items = Array.isArray(insights) ? insights : [];

  return (
    <div className="canvas-insights-panel">
      <div className="canvas-insights-panel__header">Insights</div>
      <div className="canvas-insights-panel__list">
        {items.length === 0 ? (
          <p className="canvas-insights-panel__empty">
            No insights available. Processing may still be in progress…
          </p>
        ) : (
          items.map((insight, index) => {
            const topicNames = Array.isArray(insight.topics)
              ? insight.topics
              : [];
            const sourceSentences = Array.isArray(insight.source_sentences)
              ? insight.source_sentences
              : [];
            const sentenceIndices = Array.isArray(
              insight.source_sentence_indices,
            )
              ? insight.source_sentence_indices
              : [];

            const displaySentences =
              sourceSentences.length > 0
                ? sourceSentences
                : sentenceIndices
                    .map((idx) => sentences[idx - 1])
                    .filter(Boolean);

            return (
              <div
                key={`${insight.name ?? ""}-${index}`}
                className="canvas-insights-card"
              >
                <div className="canvas-insights-card__name">
                  {insight.name || `Insight ${index + 1}`}
                </div>
                {topicNames.length > 0 && (
                  <div className="canvas-insights-card__topics">
                    {topicNames.map((name) => (
                      <span key={name} className="canvas-insights-card__topic">
                        {name.split(">").pop().trim()}
                      </span>
                    ))}
                  </div>
                )}
                {displaySentences.length > 0 && (
                  <div className="canvas-insights-card__sentences">
                    {displaySentences.map((text, i) => (
                      <p key={i} className="canvas-insights-card__sentence">
                        {text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
