import React from "react";
import { createPortal } from "react-dom";
import TooltipTopicName from "../shared/TooltipTopicName";
import { isTopicRead } from "../../utils/topicReadUtils";

/**
 * @param {{
 *   tooltip: ({x: number, y: number, topics: Array, meta: Object|null}|null),
 *   containerRef: React.MutableRefObject<HTMLDivElement | null>,
 *   readTopics: Array<string> | Set<string>,
 *   selectedTopicKey: string | null,
 *   onToggleHighlight?: (topicName: string) => void,
 *   onToggleRead?: (topicName: string) => void,
 *   onHide: () => void,
 *   submissionId?: string,
 * }} props
 */
export default function CanvasArticleTooltip({
  tooltip,
  containerRef,
  readTopics,
  highlightedTopicNames,
  onToggleHighlight,
  onToggleRead,
  onHide,
  submissionId,
}) {
  if (!tooltip) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="text-topic-tooltip"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      {tooltip.meta && tooltip.meta.sentenceIdx !== undefined && (
        <div className="text-topic-tooltip-meta">
          Sentence {tooltip.meta.sentenceIdx + 1} /{" "}
          {tooltip.meta.totalSentences}
        </div>
      )}
      {tooltip.topics.length > 0 &&
        tooltip.topics.map(({ topic }, i) => {
          const isRead = isTopicRead(topic.name, readTopics);
          const isSelected =
            highlightedTopicNames instanceof Set
              ? highlightedTopicNames.has(topic.name)
              : false;
          return (
            <div
              key={topic.name}
              className={`text-topic-tooltip-topic${i < tooltip.topics.length - 1 ? " text-topic-tooltip-topic--spaced" : ""}`}
            >
              <div className="text-topic-tooltip-name">
                <TooltipTopicName name={topic.name} />
              </div>
              <div className="text-topic-tooltip-actions">
                {onToggleHighlight && (
                  <label className="text-topic-tooltip-toggle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleHighlight(topic.name)}
                      className="text-topic-tooltip-toggle-input"
                    />
                    Highlight
                  </label>
                )}
                {onToggleRead && (
                  <button
                    className="text-topic-tooltip-btn"
                    onClick={() => {
                      onToggleRead(topic.name);
                      onHide();
                    }}
                  >
                    {isRead ? "Mark Unread" : "Mark Read"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      {submissionId && tooltip.meta?.word && (
        <div className="text-topic-tooltip-footer">
          <a
            className="text-topic-tooltip-btn text-topic-tooltip-link"
            href={`/page/word/${submissionId}/${encodeURIComponent(tooltip.meta.word)}`}
          >
            Explore "{tooltip.meta.word}"
          </a>
        </div>
      )}
    </div>,
    document.body,
  );
}
