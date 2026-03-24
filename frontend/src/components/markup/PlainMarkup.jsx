import React from 'react';

export default function PlainMarkup({ segment, sentences }) {
  const indices = (segment.sentence_indices || []).slice().sort((a, b) => a - b);
  return (
    <div className="markup-segment">
      {indices.map(idx => (
        <div key={idx} className="markup-plain__sentence">
          <span className="markup-plain__num">{idx}.</span>
          <span>{sentences && sentences[idx - 1] ? sentences[idx - 1] : ''}</span>
        </div>
      ))}
    </div>
  );
}
