import React from 'react';

export default function ListMarkup({ segment, sentences }) {
  const items = segment.data?.items || [];
  const ordered = segment.data?.ordered === true;
  const Tag = ordered ? 'ol' : 'ul';

  return (
    <div className="markup-segment">
      <Tag className={`markup-list${ordered ? ' markup-list--ordered' : ''}`}>
        {items.map((item, i) => {
          const text = item.text || (sentences && sentences[item.sentence_index - 1]) || '';
          return (
            <li key={i} className="markup-list__item">
              {ordered
                ? <span className="markup-list__ordinal">{i + 1}.</span>
                : <>
                    <span className="markup-list__num">{item.sentence_index != null ? `${item.sentence_index}.` : ''}</span>
                    <span className="markup-list__bullet">•</span>
                  </>
              }
              <span>{text}</span>
            </li>
          );
        })}
      </Tag>
    </div>
  );
}
