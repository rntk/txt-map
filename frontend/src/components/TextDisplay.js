import React from 'react';

function TextDisplay({ sentences, selectedTopics, hoveredTopic, readTopics, articleIndex }) {
  const fadedIndices = new Set();
  readTopics.forEach(topic => {
    topic.sentences.forEach(num => fadedIndices.add(num - 1));
  });

  const highlightedIndices = new Set();
  selectedTopics.forEach(topic => {
    topic.sentences.forEach(num => highlightedIndices.add(num - 1));
  });
  if (hoveredTopic) {
    hoveredTopic.sentences.forEach(num => highlightedIndices.add(num - 1));
  }

  return (
    <div className="text-display">
      <div className="text-content">
        <p className="article-text">
          {sentences.map((sentence, index) => (
            <span
              key={index}
              className={highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}
            >
              {sentence}{' '}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

export default TextDisplay;
