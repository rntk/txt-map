import React from "react";
import { buildRawTextSegments } from "../../utils/textHighlight";

/**
 * @typedef {Object} RawTextDisplayProps
 * @property {string} rawText
 * @property {number} articleIndex
 * @property {Array<{start: number, end: number}>} highlightRanges
 * @property {Array<{start: number, end: number}>} fadeRanges
 * @property {Array<{start: number, end: number, color: string}>} [coloredRanges]
 */

/** @param {RawTextDisplayProps} props */
function RawTextDisplay({
  rawText,
  articleIndex,
  highlightRanges,
  fadeRanges,
  coloredRanges = [],
}) {
  if (!rawText) {
    return (
      <pre className="raw-text-content raw-text-content-page">
        No raw text available.
      </pre>
    );
  }

  const segments = buildRawTextSegments(
    rawText,
    highlightRanges,
    fadeRanges,
    coloredRanges,
  );

  return (
    <pre className="raw-text-content raw-text-content-page">
      {segments.map((segment) =>
        segment.state ? (
          <span
            key={`${segment.start}-${segment.end}-${segment.state}`}
            className={
              segment.state !== "colored"
                ? `raw-text-token ${segment.state}`
                : "raw-text-token"
            }
            style={
              segment.color ? { backgroundColor: segment.color } : undefined
            }
            data-article-index={articleIndex}
            data-char-start={segment.start}
            data-char-end={segment.end}
          >
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={`${segment.start}-${segment.end}-plain`}>
            {segment.text}
          </React.Fragment>
        ),
      )}
    </pre>
  );
}

export default RawTextDisplay;
