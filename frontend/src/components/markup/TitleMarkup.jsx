import React from 'react';
import { getSegmentIndices, getTextByIndex } from './markupUtils';

export default function TitleMarkup({ segment, sentences }) {
  const { level = 2, title_position_index, title_sentence_index } = segment.data || {};
  const Tag = `h${Math.min(Math.max(parseInt(level, 10) || 2, 2), 4)}`;
  const titleIndex = title_position_index ?? title_sentence_index;

  const titleText = getTextByIndex(sentences, titleIndex);

  const bodyIndices = getSegmentIndices(segment).filter(
    idx => idx !== titleIndex
  );

  return (
    <div className="markup-segment markup-title">
      <Tag className="markup-title__heading">{titleText}</Tag>
      {bodyIndices.map((idx, i) => (
        <div key={i} className="markup-title__body">
          <span className="markup-plain__num">{idx}.</span>
          <span>{getTextByIndex(sentences, idx)}</span>
        </div>
      ))}
    </div>
  );
}
