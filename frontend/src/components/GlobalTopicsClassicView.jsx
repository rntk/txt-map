import React from 'react';

function GlobalTopicsClassicView({ groups, groupRefs }) {
  return (
    <>
      {groups.map((group) => {
        const refKey = group.topic_name;
        return (
          <div
            key={group.submission_id}
            className="global-topic-group"
            ref={(el) => {
              if (el) groupRefs.current[refKey] = el;
            }}
          >
            <div className="global-topic-group-header">
              <span className="global-topic-name-badge">{group.topic_name}</span>
              <span className="global-topic-group-source">
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
              </span>
            </div>
            <div className="global-topic-group-sentences">
              {group.sentences.map((sentence, j) => (
                <div key={j} className="global-topic-sentence">{sentence}</div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default GlobalTopicsClassicView;
