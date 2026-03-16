import React from 'react';
import { splitTopicPath, getTopicColorTokens } from '../utils/summaryTimeline';

function GlobalTopicsTimelineView({ groups, groupRefs }) {
  const sorted = [...groups].sort((a, b) => a.topic_name.localeCompare(b.topic_name));
  const aggregated = [];
  sorted.forEach((group) => {
    const last = aggregated[aggregated.length - 1];
    if (last && last.topic_name === group.topic_name) {
      last.items.push(group);
    } else {
      aggregated.push({ topic_name: group.topic_name, items: [group] });
    }
  });

  let previousTopLevelLabel = null;

  return (
    <div className="summary-timeline">
      {aggregated.map((agg, i) => {
        const refKey = agg.topic_name;
        const segments = splitTopicPath(agg.topic_name);
        const topLevelLabel = segments[0] || agg.topic_name;
        const subtopicLabel = segments[segments.length - 1] || agg.topic_name;
        const showSection = topLevelLabel !== previousTopLevelLabel;
        if (showSection) previousTopLevelLabel = topLevelLabel;
        const colors = getTopicColorTokens(topLevelLabel);

        return (
          <React.Fragment key={i}>
            {showSection && (
              <div className="timeline-section-marker">
                <span
                  className="timeline-section-pill"
                  style={{
                    background: colors.sectionSurface,
                    borderColor: colors.sectionBorder,
                    color: colors.sectionText,
                  }}
                >
                  {topLevelLabel}
                </span>
              </div>
            )}
            <div
              className="timeline-item"
              ref={(el) => {
                if (el) groupRefs.current[refKey] = el;
              }}
            >
              <div
                className="timeline-subtopic"
                style={{ color: colors.subtopicText }}
              >
                {subtopicLabel !== topLevelLabel ? subtopicLabel : ''}
              </div>
              <div
                className="timeline-dot"
                style={{ background: colors.dot }}
              />
              <div
                className="timeline-cards-group"
                style={{ borderColor: colors.border, background: colors.surface }}
              >
                {agg.items.map((group, k) => (
                  <div
                    key={k}
                    className="timeline-card"
                    style={{ borderColor: colors.border, background: colors.surface }}
                  >
                    <div className="global-topic-group-source" style={{ marginBottom: '6px' }}>
                      {group.source_url ? (
                        <a href={group.source_url} target="_blank" rel="noopener noreferrer">
                          {group.source_url}
                        </a>
                      ) : (
                        <span style={{ color: '#aaa' }}>No URL</span>
                      )}
                      {' '}
                      <a href={`/page/text/${group.submission_id}`} className="global-topic-text-link">
                        View text
                      </a>
                    </div>
                    {group.sentences.map((sentence, j) => (
                      <div key={j} className="global-topic-sentence">{sentence}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default GlobalTopicsTimelineView;
