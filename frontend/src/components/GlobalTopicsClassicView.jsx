import React from 'react';
import '../styles/GlobalTopics.css';

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
function GlobalTopicsClassicView({ groups, groupRefs }) {
  const safeGroups = Array.isArray(groups) ? groups : [];

  return (
    <>
      {safeGroups.map((group) => {
        const safeSentences = Array.isArray(group.sentences) ? group.sentences : [];
        const refKey = group.topic_name;
        return (
          <div
            key={group.submission_id}
            className="global-topic-group global-topics-surface global-topics-source-card"
            ref={(el) => {
              if (el && groupRefs?.current) groupRefs.current[refKey] = el;
            }}
          >
            <div className="global-topic-group-header global-topics-source-card__header">
              <span className="global-topic-name-badge global-topics-source-card__topic">{group.topic_name}</span>
              <span className="global-topic-group-source global-topics-source-card__source">
                {group.source_url ? (
                  <a href={group.source_url} target="_blank" rel="noopener noreferrer">
                    {group.source_url}
                  </a>
                ) : (
                  <span className="global-topics-source-card__muted">No URL</span>
                )}
                {' '}
                <a href={`/page/text/${group.submission_id}`} className="global-topic-text-link global-topics-source-card__link">
                  View text
                </a>
              </span>
            </div>
            <div className="global-topic-group-sentences global-topics-source-card__sentences">
              {safeSentences.map((sentence, j) => (
                <div key={j} className="global-topic-sentence global-topics-source-card__sentence">{sentence}</div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default GlobalTopicsClassicView;
