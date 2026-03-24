import React from 'react';
import { getSegmentIndices, getTextByIndex } from './markupUtils';

export default function PlainMarkup({ segment, sentences }) {
  const indices = getSegmentIndices(segment);
  return (
    <div className="markup-segment">
      {indices.map(idx => (
        <div key={idx} className="markup-plain__sentence">
          <span className="markup-plain__num">{idx}.</span>
          <span>{getTextByIndex(sentences, idx)}</span>
        </div>
      ))}
    </div>
  );
}
