import React from "react";
import "./markup.css";
import { sanitizeHTML } from "../../utils/sanitize";

/**
 * @param {{ html?: string | null }} props
 * @returns {React.ReactElement | null}
 */
export default function MarkupRenderer({ html }) {
  const safeHtml = typeof html === "string" ? sanitizeHTML(html) : "";

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
