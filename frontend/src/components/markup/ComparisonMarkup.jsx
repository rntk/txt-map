import React from 'react';

export default function ComparisonMarkup({ segment, sentences }) {
  const { left_label = 'Left', right_label = 'Right', left_items = [], right_items = [] } = segment.data || {};

  return (
    <div className="markup-segment markup-comparison">
      <div className="markup-comparison__headers">
        <div className="markup-comparison__header markup-comparison__header--left">{left_label}</div>
        <div className="markup-comparison__header markup-comparison__header--right">{right_label}</div>
      </div>
      <div className="markup-comparison__body">
        <div className="markup-comparison__col markup-comparison__col--left">
          {left_items.map((item, i) => (
            <div key={i} className="markup-comparison__item">{item}</div>
          ))}
        </div>
        <div className="markup-comparison__col">
          {right_items.map((item, i) => (
            <div key={i} className="markup-comparison__item">{item}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
