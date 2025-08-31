import React from 'react';

function TopicList({ topics, selectedTopics, onToggleTopic, onHoverTopic }) {
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
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TopicList;
