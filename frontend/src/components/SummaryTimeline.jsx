import React from "react";
import FullScreenGraph from "./FullScreenGraph";
import TopicSentencesModal from "./shared/TopicSentencesModal";

function SummaryTimeline({
  mode = "summary",
  title,
  summaryTimelineItems,
  insights,
  sentences,
  highlightedSummaryParas,
  summaryModalTopic,
  closeSummaryModal,
  handleSummaryClick,
  articles,
  onClose,
  onShowInArticle,
  readTopics,
  onToggleRead,
  markup,
}) {
  const resolvedTitle =
    title || (mode === "insights" ? "Insights" : "Topic Summaries");
  const insightItems = Array.isArray(insights) ? insights : [];
  const summaryItems = Array.isArray(summaryTimelineItems)
    ? summaryTimelineItems
    : [];

  return (
    <FullScreenGraph title={resolvedTitle} onClose={onClose}>
      <div className="summary-content summary-content--fullscreen">
        <div className="summary-timeline">
          {mode === "insights" ? (
            insightItems.length > 0 ? (
              insightItems.map((insight, index) => {
                const insightTopics = Array.isArray(insight.topics)
                  ? insight.topics
                  : [];
                const sourceSentenceIndices = Array.isArray(
                  insight.source_sentence_indices,
                )
                  ? insight.source_sentence_indices
                  : [];

                return (
                  <div
                    key={`${insight.name}-${index}`}
                    className="timeline-item timeline-item--insight"
                  >
                    <div
                      className={`timeline-subtopic${insight.name ? "" : " timeline-subtopic--empty"}`}
                    >
                      {insight.name || `Insight ${index + 1}`}
                    </div>
                    <div className="timeline-dot" />
                    <div className="timeline-cards-group timeline-cards-group--insight">
                      {insightTopics.length > 0 ? (
                        <div className="timeline-card timeline-card--insight-meta">
                          <div className="timeline-topic-links">
                            {insightTopics.map((topicName) => (
                              <button
                                key={topicName}
                                className="timeline-topic-link"
                                onClick={() =>
                                  onShowInArticle({
                                    fullPath: topicName,
                                    displayName: topicName,
                                  })
                                }
                                title="Show topic in article"
                              >
                                {topicName.split(">").pop().trim()}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {sourceSentenceIndices.length > 0 ? (
                        (() => {
                          const groups = [];
                          let currentGroup = [];
                          sourceSentenceIndices.forEach((idx, i) => {
                            if (
                              i === 0 ||
                              idx === sourceSentenceIndices[i - 1] + 1
                            ) {
                              currentGroup.push({ idx, offset: i });
                            } else {
                              groups.push(currentGroup);
                              currentGroup = [{ idx, offset: i }];
                            }
                          });
                          if (currentGroup.length > 0)
                            groups.push(currentGroup);
                          return groups.map((group, gi) => (
                            <div
                              key={`${insight.name}-group-${gi}`}
                              className="timeline-card"
                            >
                              {group.map(({ idx, offset }) => (
                                <p key={idx} className="summary-paragraph-text">
                                  {insight.source_sentences?.[offset] ||
                                    sentences[idx - 1] ||
                                    ""}
                                </p>
                              ))}
                            </div>
                          ));
                        })()
                      ) : insight.source_sentences?.length > 0 ? (
                        <div className="timeline-card">
                          {insight.source_sentences.map((sentenceText, i) => (
                            <p key={i} className="summary-paragraph-text">
                              {sentenceText}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <div className="timeline-card">
                          <p className="timeline-empty-text">
                            No source sentences available.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p>
                No insights available. Processing may still be in progress...
              </p>
            )
          ) : summaryItems.length > 0 ? (
            summaryItems.map((item) => (
              <React.Fragment key={item.index}>
                {item.showSectionLabel && item.topLevelLabel && (
                  <div className="timeline-section-marker">
                    <span className="timeline-section-pill">
                      {item.topLevelLabel}
                    </span>
                  </div>
                )}
                <div
                  id={`summary-para-${item.index}`}
                  data-summary-index={item.index}
                  className={`timeline-item${highlightedSummaryParas.has(item.index) ? " summary-paragraph-highlighted" : ""}`}
                >
                  <div
                    className={`timeline-subtopic${item.subtopicLabel ? "" : " timeline-subtopic--empty"}`}
                    aria-hidden={item.subtopicLabel ? undefined : "true"}
                  >
                    {item.subtopicLabel && item.topicName ? (
                      <button
                        className="timeline-subtopic-link"
                        onClick={() =>
                          onShowInArticle({
                            fullPath: item.topicName,
                            displayName: item.topicName,
                          })
                        }
                        title="Show in article"
                      >
                        {item.subtopicLabel}
                      </button>
                    ) : (
                      item.subtopicLabel
                    )}
                  </div>
                  <div className="timeline-dot" />
                  <div className="timeline-card">
                    <span className="timeline-label">§{item.index + 1}</span>
                    <p className="summary-paragraph-text">
                      {item.summaryText}
                      {item.mapping && (
                        <>
                          {" "}
                          <button
                            className="summary-source-link"
                            onClick={() =>
                              handleSummaryClick(
                                item.mapping,
                                articles[0],
                                item.topicName,
                              )
                            }
                            title="View source sentences"
                          >
                            [source]
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </React.Fragment>
            ))
          ) : (
            <p>No summary available. Processing may still be in progress...</p>
          )}
        </div>
        {summaryModalTopic && (
          <TopicSentencesModal
            topic={summaryModalTopic}
            sentences={summaryModalTopic._sentences}
            onClose={closeSummaryModal}
            onShowInArticle={onShowInArticle}
            readTopics={readTopics}
            onToggleRead={onToggleRead}
            markup={markup}
            headerExtra={
              <div>
                <strong>Summary:</strong> {summaryModalTopic._summarySentence}
              </div>
            }
          />
        )}
      </div>
    </FullScreenGraph>
  );
}

export default React.memo(SummaryTimeline);
