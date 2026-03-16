import React from 'react';

const TILE_GRID_COLS = 2;

function SummaryBackground({ items, cols }) {
  return (
    <div className="grid-view-background">
      <div
        className="grid-view-tiles"
        style={{ gridTemplateColumns: `repeat(${cols ?? TILE_GRID_COLS}, 1fr)` }}
      >
        {items.map((item, i) => (
          <div key={item.label + i} className="grid-view-tile grid-view-tile-summary-bg">
            <div className="grid-view-tile-label">{item.label}</div>
            {item.summary && (
              <div className="grid-view-tile-summary-text">{item.summary}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SummaryBackground;
