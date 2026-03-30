import React from 'react';
import { getSegmentIndices, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

export default function AsideMarkup({ segment, sentences }) {
  const { label } = segment.data || {};
  const indices = getSegmentIndices(segment);
  const text = indices.map(idx => getTextByIndex(sentences, idx)).filter(Boolean).join(' ');
  if (!text) return null;

  return (
    <div className="markup-segment markup-aside">
      <div className="markup-aside__label">
        {label ? <HighlightedText text={label} /> : 'Background'}
      </div>
      <div className="markup-aside__text"><HighlightedText text={text} /></div>
    </div>
  );
}
