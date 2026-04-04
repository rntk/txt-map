import React from "react";
import { getNestedIndices, getTextByIndex } from "./markupUtils";
import HighlightedText from "../shared/HighlightedText";

/**
 * DefinitionMarkup - Displays term with its definition/explanation
 * Uses semantic HTML with <dfn> and <dd> elements
 */
export default function DefinitionMarkup({ segment, sentences }) {
  const { term } = segment.data || {};
  const explanationIndices = getNestedIndices(
    segment.data,
    "explanation_position_indices",
    "explanation_sentence_indices",
  );
  const explanationText = explanationIndices
    .map((idx) => getTextByIndex(sentences, idx))
    .filter(Boolean)
    .join(" ");

  if (!term && !explanationText) return null;

  return (
    <div
      className="markup-segment markup-definition"
      role="region"
      aria-label={term ? `Definition of ${term}` : "Definition"}
    >
      {term && (
        <dfn className="markup-definition__term">
          <HighlightedText text={term} />
        </dfn>
      )}
      {explanationText && (
        <dd className="markup-definition__explanation">
          <HighlightedText text={explanationText} />
        </dd>
      )}
    </div>
  );
}
