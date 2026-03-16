import React, { useState, useEffect, useRef } from 'react';
import TopicList from './TopicList';
import { splitTopicPath, getTopicColorTokens } from '../utils/summaryTimeline';

function GlobalTopicsPage() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sentencesLoading, setSentencesLoading] = useState(false);
  const [activeView, setActiveView] = useState('classic');
  const groupRefs = useRef({});

  useEffect(() => {
    fetch('/api/global-topics')
      .then((r) => r.json())
      .then((data) => {
        const transformed = (data.topics || []).map((t) => ({
          name: t.name,
          totalSentences: t.total_sentences,
          source_count: t.source_count,
          sources: t.sources,
        }));
        setTopics(transformed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedTopics.length === 0) {
      setGroups([]);
      return;
    }
    setSentencesLoading(true);
    const params = selectedTopics.map((t) => `topic_name=${encodeURIComponent(t.name)}`).join('&');
    fetch(`/api/global-topics/sentences?${params}`)
      .then((r) => r.json())
      .then((data) => setGroups(data.groups || []))
      .catch(() => setGroups([]))
      .finally(() => setSentencesLoading(false));
  }, [selectedTopics]);

  const handleToggleTopic = (topic) => {
    setSelectedTopics((prev) => {
      const exists = prev.some((t) => t.name === topic.name);
      return exists ? prev.filter((t) => t.name !== topic.name) : [...prev, topic];
    });
  };

  const handleNavigateTopic = (topic) => {
    const key = `${topic.name}`;
    const el = groupRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="container" style={{ padding: '0 5px 5px' }}>
      <div className="left-column">
        {loading ? (
          <div style={{ color: '#888', fontSize: '13px' }}>Loading topics...</div>
        ) : (
          <TopicList
            topics={topics}
            selectedTopics={selectedTopics}
            onToggleTopic={handleToggleTopic}
            onNavigateTopic={handleNavigateTopic}
            readTopics={new Set()}
            onToggleRead={() => {}}
            onToggleReadAll={() => {}}
          />
        )}
      </div>
      <div className="right-column">
        <div className="article-header-sticky">
          <div className="global-menu-links">
            <button
              className={`global-menu-link${activeView === 'classic' ? ' active' : ''}`}
              onClick={() => setActiveView('classic')}
            >
              Classic
            </button>
            <button
              className={`global-menu-link${activeView === 'timeline' ? ' active' : ''}`}
              onClick={() => setActiveView('timeline')}
            >
              Timeline
            </button>
          </div>
        </div>
        {selectedTopics.length === 0 && (
          <div style={{ color: '#888', fontSize: '13px', padding: '12px' }}>
            Select one or more topics to see sentences from all sources.
          </div>
        )}
        {sentencesLoading && (
          <div style={{ color: '#888', fontSize: '13px', padding: '12px' }}>Loading sentences...</div>
        )}
        {!sentencesLoading && groups.length === 0 && selectedTopics.length > 0 && (
          <div style={{ color: '#888', fontSize: '13px', padding: '12px' }}>No sentences found.</div>
        )}
        {!sentencesLoading && activeView === 'classic' && groups.map((group, i) => {
          const refKey = group.topic_name;
          return (
            <div
              key={i}
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
        {!sentencesLoading && activeView === 'timeline' && (() => {
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
        })()}
      </div>
    </div>
  );
}

export default GlobalTopicsPage;
