import React from 'react';

function TextDisplay({ sentences, selectedTopic }) {
  const highlightedIndices = selectedTopic ? new Set(selectedTopic.sentences.map(num => num - 1)) : new Set();

  return (
    <div className="text-display">
      <h2>Text</h2>
      <div className="text-content">
        {sentences.map((sentence, index) => (
          <span
            key={index}
            className={highlightedIndices.has(index) ? 'highlighted' : ''}
          >
            {sentence}{' '}
          </span>
        ))}
      </div>
    </div>
  );
}

export default TextDisplay;
