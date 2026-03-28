import React from 'react';
import { getItemIndex, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

export default function StepsMarkup({ segment, sentences }) {
  const items = (segment.data?.items || []).slice().sort(
    (a, b) => (a.step_number ?? 0) - (b.step_number ?? 0)
  );

  return (
    <div className="markup-segment markup-steps">
      {items.map((item, i) => {
        const text = item.text || getTextByIndex(sentences, getItemIndex(item)) || '';
        return (
          <div key={i} className="markup-steps__item">
            <span className="markup-steps__number">{item.step_number ?? i + 1}</span>
            <span className="markup-steps__text">
              <HighlightedText text={text} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
