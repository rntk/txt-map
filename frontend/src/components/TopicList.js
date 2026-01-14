import React, { useState, useMemo } from 'react';

function TopicList({ topics, selectedTopics, onToggleTopic, onHoverTopic, readTopics, onToggleRead, showPanel, panelTopic, onToggleShowPanel, onNavigateTopic }) {
  const [expandedRoots, setExpandedRoots] = useState(new Set());

  // Group topics by their root (first word before space or underscore)
  const hierarchicalTopics = useMemo(() => {
    const grouped = new Map();

    topics.forEach(topic => {
      // Split by space or underscore and get the first word
      const root = topic.name.split(/[\s_]/)[0];

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
    const allSelected = subTopics.every(topic => selectedTopics.includes(topic));

    if (allSelected) {
      // Deselect all
      subTopics.forEach(topic => {
        if (selectedTopics.includes(topic)) {
          onToggleTopic(topic);
        }
      });
    } else {
      // Select all
      subTopics.forEach(topic => {
        if (!selectedTopics.includes(topic)) {
          onToggleTopic(topic);
        }
      });
    }
  };

  const toggleReadForRoot = (subTopics) => {
    const allRead = subTopics.every(topic => readTopics.has(topic));

    subTopics.forEach(topic => {
      const isRead = readTopics.has(topic);
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
    return subTopics.some(topic => selectedTopics.includes(topic));
  };

  const isRootRead = (subTopics) => {
    return subTopics.every(topic => readTopics.has(topic));
  };

  return (
    <div className="topic-list">
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
                    className={`topic-item ${readTopics.has(topic) ? 'topic-item-read' : ''}`}
                    onMouseEnter={() => onHoverTopic(topic)}
                    onMouseLeave={() => onHoverTopic(null)}
                  >
                    <div className="topic-item-content">
                      <label className="topic-name-label">
                        <input
                          type="checkbox"
                          checked={selectedTopics.includes(topic)}
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
                          className={`read-toggle ${readTopics.has(topic) ? 'readed' : ''}`}
                        >
                          {readTopics.has(topic) ? 'Readed' : 'Unreaded'}
                        </button>
                        <button
                          onClick={() => onToggleShowPanel(topic)}
                          className="show-toggle"
                        >
                          {showPanel && panelTopic === topic ? 'Hide' : 'Show'}
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
    </div>
  );
}

export default TopicList;
