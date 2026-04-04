import React from "react";
import { getSegmentIndices, getTextByIndex } from "./markupUtils";
import HighlightedText from "../shared/HighlightedText";

/**
 * AttributionBlockMarkup - Displays statement attributed to a source
 * Features source badge with icon and accessibility attributes
 */
export default function AttributionBlockMarkup({ segment, sentences }) {
  const { source } = segment.data || {};
  const indices = getSegmentIndices(segment);
  const text = indices
    .map((idx) => getTextByIndex(sentences, idx))
    .filter(Boolean)
    .join(" ");
  if (!text) return null;

  return (
    <figure
      className="markup-segment markup-attribution"
      role="region"
      aria-label={
        source ? `Statement attributed to ${source}` : "Attributed statement"
      }
    >
      {source && (
        <figcaption className="markup-attribution__source">
          <span className="markup-attribution__source-icon" aria-hidden="true">
            ›
          </span>
          <HighlightedText text={source} />
        </figcaption>
      )}
      <blockquote className="markup-attribution__text">
        <HighlightedText text={text} />
      </blockquote>
    </figure>
  );
}
