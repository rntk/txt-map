import React from "react";
import "./markup.css";
import { sanitizeHTML } from "../../utils/sanitize";
import { buildHighlightedRawHtml } from "../../utils/htmlHighlight";

/**
 * @param {{ html?: string | null, highlightWords?: string[] }} props
 * @returns {React.ReactElement | null}
 */
export default function MarkupRenderer({ html, highlightWords }) {
  if (typeof html !== "string" || !html) {
    return null;
  }

  const shouldHighlight =
    Array.isArray(highlightWords) && highlightWords.length > 0;

  const safeHtml = shouldHighlight
    ? buildHighlightedRawHtml(
        html,
        [],
        0,
        [],
        [],
        [],
        [],
        [],
        "",
        [],
        "",
        highlightWords,
      )
    : sanitizeHTML(html);

  if (!safeHtml) {
    return null;
  }

  return (
    <div
      className="markup-rendered markup-segment"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
