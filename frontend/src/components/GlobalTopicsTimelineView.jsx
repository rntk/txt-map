import React, { useMemo } from "react";
import { splitTopicPath, getTopicColorTokens } from "../utils/summaryTimeline";
import "../styles/GlobalTopics.css";

/**
 * @typedef {Object} GlobalTopicsSentenceGroup
 * @property {string} submission_id
 * @property {string=} source_url
 * @property {string} topic_name
 * @property {string[]} sentences
 */

/**
 * @param {{ groups: GlobalTopicsSentenceGroup[], groupRefs: React.MutableRefObject<Record<string, HTMLElement | null>> }} props
 */
function GlobalTopicsTimelineView({ groups, groupRefs }) {
  const aggregated = useMemo(() => {
    const safeGroups = Array.isArray(groups) ? groups : [];
    const sorted = [...safeGroups].sort((a, b) =>
      a.topic_name.localeCompare(b.topic_name),
    );
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
      const prevTopLevelLabel =
        prevSegments[0] || (i > 0 ? arr[i - 1].topic_name : null);
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

  const buildTopicStyle = (colors) => ({
    "--global-topics-accent": colors.accent,
    "--global-topics-match-surface": colors.surface,
    "--global-topics-section-bg": colors.sectionSurface,
    "--global-topics-section-border": colors.sectionBorder,
    "--global-topics-section-text": colors.sectionText,
    "--global-topics-subtopic-text": colors.subtopicText,
    "--timeline-section-bg": colors.sectionSurface,
    "--timeline-section-border": colors.sectionBorder,
    "--timeline-section-text": colors.sectionText,
    "--timeline-topic-accent": colors.accent,
    "--timeline-topic-dot": colors.dot,
    "--timeline-topic-surface": colors.surface,
    "--timeline-topic-border": colors.border,
    "--timeline-subtopic-color": colors.subtopicText,
  });

  return (
    <div className="summary-timeline global-topics-timeline">
      {aggregated.map((agg) => {
        const refKey = agg.topic_name;

        return (
          <React.Fragment key={agg.topic_name}>
            {agg.showSection && (
              <div
                className="timeline-section-marker global-topics-timeline__section-marker"
                style={buildTopicStyle(agg.colors)}
              >
                <span className="timeline-section-pill global-topics-timeline__section-pill">
                  {agg.topLevelLabel}
                </span>
              </div>
            )}
            <div
              className="timeline-item global-topics-timeline__item"
              ref={(el) => {
                if (el && groupRefs?.current) groupRefs.current[refKey] = el;
              }}
              style={buildTopicStyle(agg.colors)}
            >
              <div className="timeline-subtopic global-topics-timeline__subtopic">
                {agg.subtopicLabel !== agg.topLevelLabel
                  ? agg.subtopicLabel
                  : ""}
                {agg.items.length >= 2 && (
                  <a
                    href={`/page/diff?left=${agg.items[0].submission_id}&right=${agg.items[1].submission_id}`}
                    className="global-topics-timeline__compare-link"
                    title={`Compare first two sources sharing this topic`}
                  >
                    Compare
                  </a>
                )}
              </div>
              <div className="timeline-dot global-topics-timeline__dot" />
              <div className="timeline-cards-group global-topics-surface global-topics-source-card global-topics-source-card--timeline global-topics-timeline__cards-group">
                {agg.items.map((group) => (
                  <div
                    key={group.submission_id}
                    className="timeline-card global-topics-timeline__card"
                  >
                    <div className="global-topic-group-source global-topics-source-card__source global-topics-timeline__source">
                      {group.source_url ? (
                        <a
                          href={group.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {group.source_url}
                        </a>
                      ) : (
                        <span className="global-topics-source-card__muted">
                          No URL
                        </span>
                      )}{" "}
                      <a
                        href={`/page/text/${group.submission_id}`}
                        className="global-topic-text-link global-topics-source-card__link"
                      >
                        View text
                      </a>
                    </div>
                    {(Array.isArray(group.sentences)
                      ? group.sentences
                      : []
                    ).map((sentence, j) => (
                      <div
                        key={j}
                        className="global-topic-sentence global-topics-source-card__sentence global-topics-timeline__sentence"
                      >
                        {sentence}
                      </div>
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
