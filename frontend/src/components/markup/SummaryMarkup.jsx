import React from 'react';
import { getSegmentIndices, getItemIndex, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

export default function SummaryMarkup({ segment, sentences }) {
  const { label, points = [] } = segment.data || {};

  if (points.length === 0) {
    const indices = getSegmentIndices(segment);
    const text = indices.map(idx => getTextByIndex(sentences, idx)).filter(Boolean).join(' ');
    if (!text) return null;
    return (
      <div className="markup-segment markup-summary">
        {label && <div className="markup-summary__label"><HighlightedText text={label} /></div>}
        <div className="markup-summary__text"><HighlightedText text={text} /></div>
      </div>
    );
  }

  return (
    <div className="markup-segment markup-summary">
      {label && <div className="markup-summary__label"><HighlightedText text={label} /></div>}
      <ul className="markup-summary__points">
        {points.map((point, i) => {
          const text = point.text || getTextByIndex(sentences, getItemIndex(point)) || '';
          if (!text) return null;
          return (
            <li key={i} className="markup-summary__point">
              <HighlightedText text={text} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
