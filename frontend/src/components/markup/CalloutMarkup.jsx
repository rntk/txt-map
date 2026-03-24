import React from 'react';

const LEVEL_LABELS = {
  warning: '⚠ Warning',
  tip: '💡 Tip',
  note: 'ℹ Note',
  important: '! Important',
};

export default function CalloutMarkup({ segment, sentences }) {
  const level = segment.data?.level || 'note';
  const label = LEVEL_LABELS[level] || level;
  const indices = segment.sentence_indices || [];

  return (
    <div className={`markup-segment markup-callout markup-callout--${level}`}>
      <div className="markup-callout__label">{label}</div>
      {indices.map((idx, i) => (
        <div key={i} className="markup-callout__text">
          {sentences ? sentences[idx - 1] : ''}
        </div>
      ))}
    </div>
  );
}
