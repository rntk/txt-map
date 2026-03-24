import React from 'react';

export default function KeyValueMarkup({ segment }) {
  const pairs = segment.data?.pairs || [];

  return (
    <div className="markup-segment markup-kv">
      {pairs.map((pair, i) => (
        <React.Fragment key={i}>
          <span className="markup-kv__key">{pair.key}</span>
          <span className="markup-kv__value">{pair.value}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
