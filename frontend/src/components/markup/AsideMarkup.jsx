import React from "react";
import { getSegmentIndices, getTextByIndex } from "./markupUtils";
import HighlightedText from "../shared/HighlightedText";

/**
 * AsideMarkup - Displays parenthetical background context or editorial aside
 * Features icon and accessibility attributes
 */
export default function AsideMarkup({ segment, sentences }) {
  const { label } = segment.data || {};
  const indices = getSegmentIndices(segment);
  const text = indices
    .map((idx) => getTextByIndex(sentences, idx))
    .filter(Boolean)
    .join(" ");
  if (!text) return null;

  const displayLabel = label || "Background";

  return (
    <aside className="markup-segment markup-aside" aria-label={displayLabel}>
      <div className="markup-aside__label">
        <span className="markup-aside__icon" aria-hidden="true">
          ℹ
        </span>
        <HighlightedText text={displayLabel} />
      </div>
      <div className="markup-aside__text">
        <HighlightedText text={text} />
      </div>
    </aside>
  );
}
