import React from "react";

const PRIORITY_LABELS = {
  must_read: "Must Read",
  recommended: "Recommended",
  optional: "Optional",
  skip: "Low priority",
};

/**
 * Horizontal bar of topic pills ordered by suggested reading order.
 * Colored by priority; read topics shown with a "done" style.
 * Click scrolls to the topic card (all topics including skip are rendered below).
 */
export default function ReadingOrderBar({
  topics,
  topicAnnotations,
  readTopics,
  onTopicClick,
}) {
  if (!topics || topics.length === 0) return null;

  return (
    <div className="rg-order-bar">
      <span className="rg-order-bar__label">Reading order:</span>
      <div className="rg-order-bar__pills">
        {topics.map((name) => {
          const ann = topicAnnotations[name] || {};
          const priority = ann.reading_priority || "recommended";
          const isRead = readTopics ? readTopics.has(name) : false;
          const displayName = name.includes(">") ? name.split(">").pop() : name;
          return (
            <button
              key={name}
              className={`rg-order-bar__pill rg-order-bar__pill--${priority}${isRead ? " rg-order-bar__pill--done" : ""}`}
              onClick={() => onTopicClick(name)}
              title={`${name} — ${PRIORITY_LABELS[priority] || priority}${isRead ? " (read)" : ""}`}
            >
              {displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
