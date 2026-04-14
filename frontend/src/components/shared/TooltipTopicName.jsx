import React from "react";

/**
 * @typedef {Object} TooltipTopicNameProps
 * @property {string} name
 */

/**
 * @param {TooltipTopicNameProps} props
 * @returns {React.ReactElement}
 */
function TooltipTopicName({ name }) {
  const segments = name
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return <span className="text-topic-tooltip-name-leaf">{name}</span>;
  }

  const ancestors = segments.slice(0, -1);
  const leaf = segments[segments.length - 1];

  return (
    <span className="text-topic-tooltip-name-crumb">
      <span className="text-topic-tooltip-name-path">
        {ancestors.map((segment, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <span className="text-topic-tooltip-name-sep"> › </span>
            )}
            <span className="text-topic-tooltip-name-ancestor">{segment}</span>
          </React.Fragment>
        ))}
      </span>
      <span className="text-topic-tooltip-name-leaf">{leaf}</span>
    </span>
  );
}

export default React.memo(TooltipTopicName);
