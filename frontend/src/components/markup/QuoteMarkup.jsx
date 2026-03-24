import React from 'react';
import { getNestedIndices, getTextByIndex } from './markupUtils';

export default function QuoteMarkup({ segment, sentences }) {
  const { attribution } = segment.data || {};
  const quoteIndices = getNestedIndices(segment.data, 'position_indices', 'sentence_indices');
  const quoteText = quoteIndices
    .map(idx => getTextByIndex(sentences, idx))
    .filter(Boolean)
    .join(' ');

  if (!quoteText) return null;

  return (
    <div className="markup-segment">
      <blockquote className="markup-quote">
        <p className="markup-quote__text">{quoteText}</p>
        {attribution && <p className="markup-quote__attribution">{attribution}</p>}
      </blockquote>
    </div>
  );
}
