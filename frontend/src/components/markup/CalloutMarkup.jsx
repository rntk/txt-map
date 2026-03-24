import React from 'react';
import { getSegmentIndices, getTextByIndex } from './markupUtils';

const LEVEL_LABELS = {
  warning: '⚠ Warning',
  tip: '💡 Tip',
  note: 'ℹ Note',
  important: '! Important',
};

export default function CalloutMarkup({ segment, sentences }) {
  const level = segment.data?.level || 'note';
  const label = LEVEL_LABELS[level] || level;
  const indices = getSegmentIndices(segment);

  return (
    <div className={`markup-segment markup-callout markup-callout--${level}`}>
      <div className="markup-callout__label">{label}</div>
      {indices.map((idx, i) => (
        <div key={i} className="markup-callout__text">
          {getTextByIndex(sentences, idx)}
        </div>
      ))}
    </div>
  );
}
