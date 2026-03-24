import React from 'react';
import { getNestedIndices, getTextByIndex } from './markupUtils';

export default function DefinitionMarkup({ segment, sentences }) {
  const { term } = segment.data || {};
  const explanationIndices = getNestedIndices(
    segment.data,
    'explanation_position_indices',
    'explanation_sentence_indices'
  );
  const explanationText = explanationIndices
    .map(idx => getTextByIndex(sentences, idx))
    .filter(Boolean)
    .join(' ');

  return (
    <div className="markup-segment">
      {term && <div className="markup-definition__term">{term}</div>}
      {explanationText && <div className="markup-definition__explanation">{explanationText}</div>}
    </div>
  );
}
