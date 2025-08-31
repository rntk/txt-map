import React from 'react';

function TopicList({ topics, selectedTopics, onToggleTopic, onHoverTopic, readTopics, onToggleRead }) {
  return (
    <div className="topic-list">
      <h2>Topics</h2>
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
            <button onClick={() => onToggleRead(topic)} className="read-toggle">
              {readTopics.has(topic) ? 'Readed' : 'Unreaded'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TopicList;
