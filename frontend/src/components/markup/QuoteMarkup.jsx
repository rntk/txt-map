import React from 'react';

export default function QuoteMarkup({ segment, sentences }) {
  const { attribution, sentence_indices = [] } = segment.data || {};
  const quoteText = sentence_indices
    .slice()
    .sort((a, b) => a - b)
    .map(idx => (sentences && sentences[idx - 1]) ? sentences[idx - 1] : '')
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
