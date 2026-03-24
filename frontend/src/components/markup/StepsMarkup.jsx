import React from 'react';

export default function StepsMarkup({ segment, sentences }) {
  const items = (segment.data?.items || []).slice().sort(
    (a, b) => (a.step_number ?? 0) - (b.step_number ?? 0)
  );

  return (
    <div className="markup-segment markup-steps">
      {items.map((item, i) => {
        const text = item.text || (sentences && sentences[item.sentence_index - 1]) || '';
        return (
          <div key={i} className="markup-steps__item">
            <span className="markup-steps__number">{item.step_number ?? i + 1}</span>
            <span className="markup-steps__text">{text}</span>
          </div>
        );
      })}
    </div>
  );
}
