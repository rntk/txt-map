import React from 'react';

export default function ListMarkup({ segment, sentences }) {
  const items = segment.data?.items || [];

  return (
    <div className="markup-segment">
      <ul className="markup-list">
        {items.map((item, i) => {
          const text = item.text || (sentences && sentences[item.sentence_index - 1]) || '';
          return (
            <li key={i} className="markup-list__item">
              <span className="markup-list__num">{item.sentence_index != null ? `${item.sentence_index}.` : ''}</span>
              <span className="markup-list__bullet">•</span>
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
