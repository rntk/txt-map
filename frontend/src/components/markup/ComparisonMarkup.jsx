import React from 'react';

const COLUMN_COLORS = ['#e8f5e9', '#fce4ec', '#e3f2fd', '#fff3e0', '#f3e5f5'];

export default function ComparisonMarkup({ segment, sentences }) {
  const data = segment.data || {};

  // Normalise to new columns format; support legacy left_label/right_label data
  const columns = data.columns || [
    {
      label: data.left_label || 'Left',
      items: (data.left_items || []).map(text => ({ text })),
    },
    {
      label: data.right_label || 'Right',
      items: (data.right_items || []).map(text => ({ text })),
    },
  ];

  const gridStyle = { gridTemplateColumns: `repeat(${columns.length}, 1fr)` };

  return (
    <div className="markup-segment markup-comparison">
      <div className="markup-comparison__headers" style={gridStyle}>
        {columns.map((col, i) => (
          <div
            key={i}
            className="markup-comparison__header"
            style={{ background: COLUMN_COLORS[i % COLUMN_COLORS.length] }}
          >
            {col.label}
          </div>
        ))}
      </div>
      <div className="markup-comparison__body" style={gridStyle}>
        {columns.map((col, i) => (
          <div key={i} className="markup-comparison__col">
            {col.items.map((item, j) => {
              const text = item.text || (sentences && item.sentence_index != null ? sentences[item.sentence_index - 1] : '') || '';
              return <div key={j} className="markup-comparison__item">{text}</div>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
