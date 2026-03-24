import React from 'react';

export default function TitleMarkup({ segment, sentences }) {
  const { level = 2, title_sentence_index } = segment.data || {};
  const Tag = `h${Math.min(Math.max(parseInt(level, 10) || 2, 2), 4)}`;

  const titleText = title_sentence_index != null && sentences
    ? sentences[title_sentence_index - 1]
    : '';

  const bodyIndices = (segment.sentence_indices || []).filter(
    idx => idx !== title_sentence_index
  );

  return (
    <div className="markup-segment markup-title">
      <Tag className="markup-title__heading">{titleText}</Tag>
      {bodyIndices.map((idx, i) => (
        <div key={i} className="markup-title__body">
          <span className="markup-plain__num">{idx}.</span>
          <span>{sentences ? sentences[idx - 1] : ''}</span>
        </div>
      ))}
    </div>
  );
}
