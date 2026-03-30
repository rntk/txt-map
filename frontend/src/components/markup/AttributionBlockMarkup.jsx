import React from 'react';
import { getSegmentIndices, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

export default function AttributionBlockMarkup({ segment, sentences }) {
  const { source } = segment.data || {};
  const indices = getSegmentIndices(segment);
  const text = indices.map(idx => getTextByIndex(sentences, idx)).filter(Boolean).join(' ');
  if (!text) return null;

  return (
    <div className="markup-segment markup-attribution">
      {source && (
        <div className="markup-attribution__source"><HighlightedText text={source} /></div>
      )}
      <div className="markup-attribution__text"><HighlightedText text={text} /></div>
    </div>
  );
}
