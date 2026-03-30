import React from 'react';
import HighlightedText from '../shared/HighlightedText';

export default function RatingMarkup({ segment }) {
  const { score, label, verdict } = segment.data || {};
  if (!score) return null;

  return (
    <div className="markup-segment markup-rating">
      <div className="markup-rating__score">
        <HighlightedText text={score} />
      </div>
      <div className="markup-rating__body">
        {label && (
          <div className="markup-rating__label"><HighlightedText text={label} /></div>
        )}
        {verdict && (
          <div className="markup-rating__verdict"><HighlightedText text={verdict} /></div>
        )}
      </div>
    </div>
  );
}
