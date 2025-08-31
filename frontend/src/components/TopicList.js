import React from 'react';

function TopicList({ topics, onTopicSelect }) {
  return (
    <div className="topic-list">
      <h2>Topics</h2>
      <ul>
        {topics.map((topic, index) => (
          <li
            key={index}
            onMouseEnter={() => onTopicSelect(topic)}
            onMouseLeave={() => onTopicSelect(null)}
            className="topic-item"
          >
            {topic.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TopicList;
