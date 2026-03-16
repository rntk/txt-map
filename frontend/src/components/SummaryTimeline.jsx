import React from 'react';
import FullScreenGraph from './FullScreenGraph';
import TopicSentencesModal from './shared/TopicSentencesModal';

function SummaryTimeline({
  summaryTimelineItems,
  highlightedSummaryParas,
  summaryModalTopic,
  closeSummaryModal,
  handleSummaryClick,
  articles,
  onClose,
}) {
  return (
    <FullScreenGraph title="Topic Summaries" onClose={onClose}>
      <div className="summary-content" style={{ padding: '20px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div className="summary-timeline">
          {Array.isArray(summaryTimelineItems) && summaryTimelineItems.length > 0 ? (
            summaryTimelineItems.map((item) => (
              <React.Fragment key={item.index}>
                {item.showSectionLabel && item.topLevelLabel && (
                  <div
                    className="timeline-section-marker"
                    style={{
                      '--timeline-section-bg': item.topicColor?.sectionSurface,
                      '--timeline-section-border': item.topicColor?.sectionBorder,
                      '--timeline-section-text': item.topicColor?.sectionText,
                      '--timeline-section-dot': item.topicColor?.dot
                    }}
                  >
                    <span className="timeline-section-pill">{item.topLevelLabel}</span>
                  </div>
                )}
                <div
                  id={`summary-para-${item.index}`}
                  data-summary-index={item.index}
                  className={`timeline-item${highlightedSummaryParas.has(item.index) ? ' summary-paragraph-highlighted' : ''}`}
                  style={{
                    '--timeline-topic-accent': item.topicColor?.accent,
                    '--timeline-topic-dot': item.topicColor?.dot,
                    '--timeline-topic-surface': item.topicColor?.surface,
                    '--timeline-topic-border': item.topicColor?.border,
                    '--timeline-subtopic-color': item.topicColor?.subtopicText
                  }}
                >
                  <div
                    className={`timeline-subtopic${item.subtopicLabel ? '' : ' timeline-subtopic--empty'}`}
                    aria-hidden={item.subtopicLabel ? undefined : 'true'}
                  >
                    {item.subtopicLabel}
                  </div>
                  <div className="timeline-dot" />
                  <div className="timeline-card">
                    <span className="timeline-label">§{item.index + 1}</span>
                    <p className="summary-paragraph-text">
                      {item.summaryText}
                      {item.mapping && (
                        <>
                          {' '}
                          <button
                            className="summary-source-link"
                            onClick={() => handleSummaryClick(item.mapping, articles[0])}
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
