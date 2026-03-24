import React from 'react';

export default function DefinitionMarkup({ segment, sentences }) {
  const { term, explanation_sentence_indices = [] } = segment.data || {};
  const explanationText = explanation_sentence_indices
    .slice()
    .sort((a, b) => a - b)
    .map(idx => (sentences && sentences[idx - 1]) ? sentences[idx - 1] : '')
    .filter(Boolean)
    .join(' ');

  return (
    <div className="markup-segment">
      {term && <div className="markup-definition__term">{term}</div>}
      {explanationText && <div className="markup-definition__explanation">{explanationText}</div>}
    </div>
  );
}
