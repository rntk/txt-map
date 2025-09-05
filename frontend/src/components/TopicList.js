import React from 'react';

function TopicList({ topics, selectedTopics, onToggleTopic, onHoverTopic, readTopics, onToggleRead, showPanel, panelTopic, onToggleShowPanel }) {
  return (
    <div className="topic-list">
      <ul>
        {topics.map((topic, index) => (
          <li key={index} className="topic-item" onMouseEnter={() => onHoverTopic(topic)} onMouseLeave={() => onHoverTopic(null)}>
            <label>
              <input
                type="checkbox"
                checked={selectedTopics.includes(topic)}
                onChange={() => onToggleTopic(topic)}
              />
              {topic.name}
            </label>
            <div className="topic-buttons">
              <button onClick={() => onToggleRead(topic)} className="read-toggle">
                {readTopics.has(topic) ? 'Readed' : 'Unreaded'}
              </button>
              <button onClick={() => onToggleShowPanel(topic)} className="show-toggle">
                {showPanel && panelTopic === topic ? 'Hide' : 'Show'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TopicList;
