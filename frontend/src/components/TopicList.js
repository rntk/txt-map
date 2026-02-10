import React, { useState, useMemo } from 'react';

function TopicList({
  topics = [],
  selectedTopics = [],
  onToggleTopic = () => { },
  onHoverTopic = () => { },
  readTopics = new Set(),
  onToggleRead = () => { },
  showPanel = false,
  panelTopic = null,
  onToggleShowPanel = () => { },
  onNavigateTopic
}) {
  const [expandedRoots, setExpandedRoots] = useState(new Set());
  const safeSelectedTopics = Array.isArray(selectedTopics) ? selectedTopics : [];
  const safeReadTopics = readTopics instanceof Set ? readTopics : new Set(readTopics || []);

  // Group topics by their root (first part before '>')
  const hierarchicalTopics = useMemo(() => {
    const safe = Array.isArray(topics) ? topics : [];
    const grouped = new Map();

    safe.forEach(topic => {
      // Group topics by their root (first part before '>')
      const root = topic.name.split('>')[0].trim();

      if (!grouped.has(root)) {
        grouped.set(root, []);
      }
      grouped.get(root).push(topic);
    });

    // Convert to array and sort by root name
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([root, subTopics]) => ({
        root,
        subTopics: subTopics.sort((a, b) => a.name.localeCompare(b.name)),
        totalSentences: subTopics.reduce((sum, topic) => sum + topic.totalSentences, 0)
      }));
  }, [topics]);

  const toggleRoot = (root) => {
    setExpandedRoots(prev => {
      const newSet = new Set(prev);
      if (newSet.has(root)) {
        newSet.delete(root);
      } else {
        newSet.add(root);
      }
      return newSet;
    });
  };

  const toggleAllTopicsInRoot = (subTopics) => {
    const allSelected = subTopics.every(topic => safeSelectedTopics.some(t => t.name === topic.name));

    if (allSelected) {
      // Deselect all
      subTopics.forEach(topic => {
        if (safeSelectedTopics.some(t => t.name === topic.name)) {
          onToggleTopic(topic);
        }
      });
    } else {
      // Select all
      subTopics.forEach(topic => {
        if (!safeSelectedTopics.some(t => t.name === topic.name)) {
          onToggleTopic(topic);
        }
      });
    }
  };

  const toggleReadForRoot = (subTopics) => {
    const allRead = subTopics.every(topic => safeReadTopics.has(topic.name));

    subTopics.forEach(topic => {
      const isRead = safeReadTopics.has(topic.name);
      if (allRead && isRead) {
        // Mark all as unread
        onToggleRead(topic);
      } else if (!allRead && !isRead) {
        // Mark all as read
        onToggleRead(topic);
      }
    });
  };

  const toggleShowPanelForRoot = (subTopics) => {
    // Show panel for all topics in the root
    if (subTopics.length > 0) {
      onToggleShowPanel(subTopics);
    }
  };

  const isRootSelected = (subTopics) => {
    return subTopics.some(topic => safeSelectedTopics.some(t => t.name === topic.name));
  };

  const isRootRead = (subTopics) => {
    return subTopics.every(topic => safeReadTopics.has(topic.name));
  };

  const getTopicSelectionKey = (topicOrTopics) => {
    if (!topicOrTopics) return '';
    if (Array.isArray(topicOrTopics)) {
      return topicOrTopics
        .map(topic => topic?.name)
        .filter(Boolean)
        .sort()
        .join('|');
    }
    return topicOrTopics.name || '';
  };

  const isPanelSelection = (topicOrTopics) => {
    return showPanel && getTopicSelectionKey(panelTopic) === getTopicSelectionKey(topicOrTopics);
  };

  return (
    <div className="topic-list">
      {hierarchicalTopics.length === 0 ? (
        <div className="topic-list-empty">No topics yet.</div>
      ) : (
        <ul className="root-list">
          {hierarchicalTopics.map(({ root, subTopics, totalSentences }, index) => (
            <li key={index} className="root-item">
              <div className={`root-header ${isRootRead(subTopics) ? 'root-header-read' : ''}`}>
                <div className="root-header-top">
                  <span className="expand-icon" onClick={() => toggleRoot(root)}>
                    {expandedRoots.has(root) ? '▼' : '▶'}
                  </span>
                  <label className="root-label" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isRootSelected(subTopics)}
                      onChange={() => toggleAllTopicsInRoot(subTopics)}
                    />
                    <span onClick={() => toggleRoot(root)}>
                      {root}
                    </span>
                  </label>
                </div>
                <div className="root-metadata">
                  <span className="root-stats">({subTopics.length} topics, {totalSentences} sentences)</span>
                </div>
                <div className="root-buttons" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => toggleReadForRoot(subTopics)}
                    className={`read-toggle ${isRootRead(subTopics) ? 'readed' : ''}`}
                  >
                    {isRootRead(subTopics) ? 'Readed' : 'Unreaded'}
                  </button>
                  <button
                    onClick={() => toggleShowPanelForRoot(subTopics)}
                    className="show-toggle"
                  >
                    Show
                  </button>
                </div>
              </div>
              {expandedRoots.has(root) && (
                <ul className="subtopic-list">
                  {subTopics.map((topic, subIndex) => (
                    <li
                      key={subIndex}
                      className={`topic-item ${safeReadTopics.has(topic.name) ? 'topic-item-read' : ''}`}
                      onMouseEnter={() => onHoverTopic(topic)}
                      onMouseLeave={() => onHoverTopic(null)}
                    >
                      <div className="topic-item-content">
                        <label className="topic-name-label">
                          <input
                            type="checkbox"
                            checked={safeSelectedTopics.some(t => t.name === topic.name)}
                            onChange={() => onToggleTopic(topic)}
                          />
                          {topic.name}
                        </label>
                        {topic.summary && (
                          <div className="topic-summary-note" title={topic.summary}>
                            {topic.summary}
                          </div>
                        )}
                        <div className="topic-metadata">
                          <span className="topic-sentence-count">({topic.totalSentences} sentences)</span>
                        </div>
                        <div className="topic-buttons">
                          <button
                            onClick={() => onToggleRead(topic)}
                            className={`read-toggle ${safeReadTopics.has(topic.name) ? 'readed' : ''}`}
                          >
                            {safeReadTopics.has(topic.name) ? 'Readed' : 'Unreaded'}
                          </button>
                          <button
                            onClick={() => onToggleShowPanel(topic)}
                            className="show-toggle"
                          >
                            {isPanelSelection(topic) ? 'Hide' : 'Show'}
                          </button>
                          <button
                            onClick={() => onNavigateTopic && onNavigateTopic(topic, 'prev')}
                            className="nav-toggle prev-toggle"
                            title="Scroll to previous sentence for this topic"
                          >
                            Prev
                          </button>
                          <button
                            onClick={() => onNavigateTopic && onNavigateTopic(topic, 'next')}
                            className="nav-toggle next-toggle"
                            title="Scroll to next sentence for this topic"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TopicList;
