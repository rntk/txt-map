import React from 'react';

function TextDisplay({ sentences, selectedTopics, hoveredTopic }) {
  const fadedIndices = new Set();
  selectedTopics.forEach(topic => {
    topic.sentences.forEach(num => fadedIndices.add(num - 1));
  });

  const highlightedIndices = new Set();
  if (hoveredTopic) {
    hoveredTopic.sentences.forEach(num => highlightedIndices.add(num - 1));
  }

  return (
    <div className="text-display">
      <h2>Text</h2>
      <div className="text-content">
        {sentences.map((sentence, index) => (
          <span
            key={index}
            className={fadedIndices.has(index) ? 'faded' : highlightedIndices.has(index) ? 'highlighted' : ''}
          >
            {sentence}{' '}
          </span>
        ))}
      </div>
    </div>
  );
}

export default TextDisplay;
