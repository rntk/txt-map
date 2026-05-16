import React from "react";
import { eventLabel } from "./utils";

/**
 * @param {{
 *   events: Array<any>,
 *   selectedIndex: number,
 *   isLive: boolean,
 *   newIndices: Set<number>,
 *   deleteError: string | null,
 *   onSelectEvent: (idx: number) => void,
 *   onGoLive: () => void,
 *   onDeleteEvent: (seq: any) => Promise<void>,
 *   showEvents: boolean,
 *   onToggleEvents: () => void,
 * }} props
 */
export default function CanvasEventsPanel({
  events,
  selectedIndex,
  isLive,
  newIndices,
  deleteError,
  onSelectEvent,
  onGoLive,
  onDeleteEvent,
  showEvents,
  onToggleEvents,
}) {
  return (
    <div className="canvas-tab-content is-active">
      <div className="canvas-events-list">
        {deleteError && (
          <div className="canvas-events-error">{deleteError}</div>
        )}
        {events.length === 0 && !deleteError && (
          <span className="canvas-events-empty">No events yet</span>
        )}
        <div role="list">
          {events.map((ev, i) => {
            const classes = ["canvas-events-item"];
            if (i === selectedIndex) classes.push("is-selected");
            if (newIndices.has(i)) classes.push("is-new");
            return (
              <div key={i} className={classes.join(" ")} role="listitem">
                <button
                  type="button"
                  className="canvas-events-item-select"
                  onClick={() => onSelectEvent(i)}
                  title={eventLabel(ev, i)}
                  aria-label={eventLabel(ev, i)}
                >
                  <span className="canvas-events-item-index">#{i + 1}</span>
                  <span className="canvas-events-item-label">
                    {eventLabel(ev, i)}
                  </span>
                </button>
                <button
                  type="button"
                  className="canvas-events-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEvent(ev.seq);
                  }}
                  title="Delete event"
                  aria-label="Delete event"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="canvas-events-footer">
        <button
          type="button"
          className={`canvas-timeline-live${isLive ? " is-active" : ""}`}
          onClick={onGoLive}
          title="Follow latest events"
        >
          ● Live
        </button>
        <button
          type="button"
          className={`canvas-timeline-live${showEvents ? " is-active" : ""}`}
          onClick={onToggleEvents}
          title="Show events alongside the article"
          aria-pressed={showEvents}
        >
          {showEvents ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
