import React, { useState } from "react";

/**
 * @param {{
 *   scale: number,
 *   translate: {x: number, y: number},
 *   onNavigate: (pos: "top" | "bottom" | "prev" | "next") => void,
 *   onZoomIn: () => void,
 *   onZoomOut: () => void,
 *   onReset: () => void,
 *   showReadStatus: boolean,
 *   onToggleRead: () => void,
 *   showSummaryMode: boolean,
 *   onToggleSummaryMode: () => void,
 *   showSummaries: boolean,
 *   onToggleSummaries: () => void,
 *   showTopicHierarchy: boolean,
 *   onToggleTopicHierarchy: () => void,
 *   showTemperature: boolean,
 *   onToggleTemperature: () => void,
 *   temperatureAvailable: boolean,
 *   showInsights: boolean,
 *   onToggleInsights: () => void,
 *   showChat: boolean,
 *   onToggleChat: () => void,
 * }} props
 */
export default function CanvasZoomControls({
  onNavigate,
  onZoomIn,
  onZoomOut,
  onReset,
  showReadStatus,
  onToggleRead,
  showSummaryMode,
  onToggleSummaryMode,
  showSummaries,
  onToggleSummaries,
  showTopicHierarchy,
  onToggleTopicHierarchy,
  showTemperature,
  onToggleTemperature,
  temperatureAvailable,
  showInsights,
  onToggleInsights,
  showChat,
  onToggleChat,
  tooltipEnabled,
  onToggleTooltip,
}) {
  const [isFolded, setIsFolded] = useState(false);
  const [isHorizontal, setIsHorizontal] = useState(false);

  return (
    <div
      className={`canvas-controls${isFolded ? " is-folded" : ""}${isHorizontal ? " is-horizontal" : ""}`}
    >
      <div className="canvas-controls-header">
        <button
          type="button"
          className="canvas-zoom-btn"
          onClick={() => setIsFolded((v) => !v)}
          title={isFolded ? "Expand controls" : "Collapse controls"}
        >
          {isFolded ? "⊞" : "⊟"}
        </button>
        <button
          type="button"
          className="canvas-zoom-btn"
          onClick={() => setIsHorizontal((v) => !v)}
          title={isHorizontal ? "Switch to vertical" : "Switch to horizontal"}
        >
          {isHorizontal ? "⬍" : "⬌"}
        </button>
      </div>
      {!isFolded && (
        <div className="canvas-controls-body">
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => onNavigate("top")}
            title="Scroll to top"
          >
            ⇈
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => onNavigate("prev")}
            title="Previous page"
          >
            ↑
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => onNavigate("next")}
            title="Next page"
          >
            ↓
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => onNavigate("bottom")}
            title="Scroll to bottom"
          >
            ⇊
          </button>
          <div className="canvas-spacer" />
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={onZoomIn}
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={onZoomOut}
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={onReset}
            title="Reset zoom"
          >
            ⊙
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showReadStatus ? " is-active" : ""}`}
            onClick={onToggleRead}
            title={
              showReadStatus
                ? "Hide read/unread status"
                : "Show read/unread status"
            }
          >
            R
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showSummaryMode ? " is-active" : ""}`}
            onClick={onToggleSummaryMode}
            title={
              showSummaryMode
                ? "Show article text"
                : "Show summary view (per topic level)"
            }
          >
            M
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showSummaries ? " is-active" : ""}`}
            onClick={onToggleSummaries}
            title={
              showSummaries ? "Hide topic summaries" : "Show topic summaries"
            }
          >
            S
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showTopicHierarchy ? " is-active" : ""}`}
            onClick={onToggleTopicHierarchy}
            title={
              showTopicHierarchy
                ? "Hide topic hierarchy"
                : "Show topic hierarchy"
            }
          >
            H
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showTemperature ? " is-active" : ""}`}
            onClick={onToggleTemperature}
            title={
              showTemperature
                ? "Hide temperature highlights"
                : "Show temperature highlights"
            }
            disabled={!temperatureAvailable}
          >
            T
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${tooltipEnabled ? " is-active" : ""}`}
            onClick={onToggleTooltip}
            title={
              tooltipEnabled ? "Disable click tooltip" : "Enable click tooltip"
            }
          >
            ?
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showInsights ? " is-active" : ""}`}
            onClick={onToggleInsights}
            title={showInsights ? "Hide insights" : "Show insights"}
          >
            I
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showChat ? " is-active" : ""}`}
            onClick={onToggleChat}
            title={showChat ? "Hide chat panel" : "Show chat panel"}
          >
            C
          </button>
        </div>
      )}
    </div>
  );
}
