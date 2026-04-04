import React from "react";
import { getNestedIndices, getTextByIndex } from "./markupUtils";
import HighlightedText from "../shared/HighlightedText";

/**
 * QuoteMarkup - Displays blockquotes with proper semantic HTML and accessibility
 * Uses semantic <blockquote> and <cite> elements per HTML5 spec
 */
export default function QuoteMarkup({ segment, sentences }) {
  const { attribution } = segment.data || {};
  const quoteIndices = getNestedIndices(
    segment.data,
    "position_indices",
    "sentence_indices",
  );
  const quoteText = quoteIndices
    .map((idx) => getTextByIndex(sentences, idx))
    .filter(Boolean)
    .join(" ");

  if (!quoteText) return null;

  return (
    <div className="markup-segment">
      <blockquote className="markup-quote" cite={attribution || undefined}>
        <p className="markup-quote__text">
          <HighlightedText text={quoteText} />
        </p>
      </blockquote>
      {attribution && (
        <cite className="markup-quote__attribution">
          <HighlightedText text={attribution} />
        </cite>
      )}
    </div>
  );
}
