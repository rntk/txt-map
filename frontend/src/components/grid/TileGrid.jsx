import React from "react";

const TILE_GRID_COLS = 2;

function TileGrid({ items, onTileClick, isBackground }) {
  return (
    <div
      className={isBackground ? "grid-view-background" : "grid-view-foreground"}
    >
      <div
        className="grid-view-tiles"
        style={{ gridTemplateColumns: `repeat(${TILE_GRID_COLS}, 1fr)` }}
      >
        {items.map((item, i) => (
          <div
            key={item.label + i}
            className={`grid-view-tile ${isBackground ? "" : "grid-view-tile-interactive"} ${item.isRead ? "grid-view-tile--read" : ""}`}
            onClick={
              !isBackground && onTileClick ? () => onTileClick(item) : undefined
            }
            style={
              item.isRead
                ? {
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 8px)",
                  }
                : undefined
            }
          >
            <div className="grid-view-tile-content">
              <div className="grid-view-tile-label">{item.label}</div>
              {item.previewLabel && (
                <div className="grid-view-tile-preview-label">
                  {item.previewLabel}
                </div>
              )}
              {item.previewText && (
                <div className="grid-view-tile-preview">{item.previewText}</div>
              )}
              {Array.isArray(item.bullets) && item.bullets.length > 0 && (
                <ul className="grid-view-tile-bullets">
                  {item.bullets.map((bullet, bi) => (
                    <li key={bi}>{bullet}</li>
                  ))}
                </ul>
              )}
              {item.tags && item.tags.length > 0 ? (
                <div className="grid-view-tags-cloud">
                  {item.tags.map((tag) => (
                    <span
                      key={tag.label}
                      className="grid-view-tag-chip"
                      style={{ fontSize: `${tag.fontSize.toFixed(1)}px` }}
                      title={`Frequency: ${tag.count}`}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="grid-view-tags-empty">No tags</div>
              )}
            </div>
            <div className="grid-view-tile-stats">
              <div className="grid-view-tile-stat">
                <div className="grid-view-tile-stat-value">
                  {item.topicCount ?? 0}
                </div>
                <div className="grid-view-tile-stat-label">Topics</div>
              </div>
              <div className="grid-view-tile-stat grid-view-tile-stat--hero">
                <div className="grid-view-tile-stat-value">
                  {item.sentenceCount ?? 0}
                </div>
                <div className="grid-view-tile-stat-label">Sentences</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TileGrid;
