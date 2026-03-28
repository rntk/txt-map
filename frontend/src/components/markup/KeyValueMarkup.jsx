import React from 'react';
import HighlightedText from '../shared/HighlightedText';

export default function KeyValueMarkup({ segment }) {
  const pairs = segment.data?.pairs || [];

  return (
    <div className="markup-segment markup-kv">
      {pairs.map((pair, i) => (
        <React.Fragment key={i}>
          <span className="markup-kv__key">
            <HighlightedText text={pair.key} />
          </span>
          <span className="markup-kv__value">
            <HighlightedText text={pair.value} />
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
