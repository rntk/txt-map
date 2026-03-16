import React, { useState, useEffect, useRef } from 'react';
import TopicList from './TopicList';
import GlobalTopicsClassicView from './GlobalTopicsClassicView';
import GlobalTopicsTimelineView from './GlobalTopicsTimelineView';

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
        {!sentencesLoading && activeView === 'classic' && (
          <GlobalTopicsClassicView groups={groups} groupRefs={groupRefs} />
        )}
        {!sentencesLoading && activeView === 'timeline' && (
          <GlobalTopicsTimelineView groups={groups} groupRefs={groupRefs} />
        )}
      </div>
    </div>
  );
}

export default GlobalTopicsPage;
