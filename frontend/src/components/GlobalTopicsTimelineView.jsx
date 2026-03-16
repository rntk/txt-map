import React, { useMemo } from 'react';
import { splitTopicPath, getTopicColorTokens } from '../utils/summaryTimeline';

function GlobalTopicsTimelineView({ groups, groupRefs }) {
  const aggregated = useMemo(() => {
    const sorted = [...groups].sort((a, b) => a.topic_name.localeCompare(b.topic_name));
    const aggResult = [];
    sorted.forEach((group) => {
      const last = aggResult[aggResult.length - 1];
      if (last && last.topic_name === group.topic_name) {
        last.items.push(group);
      } else {
        aggResult.push({ topic_name: group.topic_name, items: [group] });
      }
    });

    return aggResult.map((agg, i, arr) => {
      const segments = splitTopicPath(agg.topic_name);
      const topLevelLabel = segments[0] || agg.topic_name;
      const subtopicLabel = segments[segments.length - 1] || agg.topic_name;
      const prevSegments = i > 0 ? splitTopicPath(arr[i - 1].topic_name) : [];
      const prevTopLevelLabel = prevSegments[0] || (i > 0 ? arr[i - 1].topic_name : null);
      const showSection = i === 0 || topLevelLabel !== prevTopLevelLabel;

      return {
        ...agg,
        topLevelLabel,
        subtopicLabel,
        showSection,
        colors: getTopicColorTokens(topLevelLabel),
      };
    });
  }, [groups]);

  return (
    <div className="summary-timeline">
      {aggregated.map((agg) => {
        const refKey = agg.topic_name;

        return (
          <React.Fragment key={agg.topic_name}>
            {agg.showSection && (
              <div className="timeline-section-marker">
                <span
                  className="timeline-section-pill"
                  style={{
                    background: agg.colors.sectionSurface,
                    borderColor: agg.colors.sectionBorder,
                    color: agg.colors.sectionText,
                  }}
                >
                  {agg.topLevelLabel}
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
                style={{ color: agg.colors.subtopicText }}
              >
                {agg.subtopicLabel !== agg.topLevelLabel ? agg.subtopicLabel : ''}
              </div>
              <div
                className="timeline-dot"
                style={{ background: agg.colors.dot }}
              />
              <div
                className="timeline-cards-group"
                style={{ borderColor: agg.colors.border, background: agg.colors.surface }}
              >
                {agg.items.map((group) => (
                  <div
                    key={group.submission_id}
                    className="timeline-card"
                    style={{ borderColor: agg.colors.border, background: agg.colors.surface }}
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
