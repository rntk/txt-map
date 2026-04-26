import React from "react";
import { buildSegmentsWithPages } from "./utils";

/**
 * @param {{
 *   text: string,
 *   highlights: {start: number, end: number, label?: string}[],
 *   activeHighlightRef?: React.MutableRefObject<HTMLElement | null>,
 *   readRanges?: {start: number, end: number}[],
 *   showReadStatus?: boolean,
 *   temperatureHighlights?: {start: number, end: number, color: string}[],
 *   pages?: {page_number: number, start: number, end: number}[],
 *   textRef?: React.RefObject<HTMLDivElement | null>,
 * }} props
 */
export default function ArticleText({
  text,
  highlights,
  activeHighlightRef,
  readRanges,
  showReadStatus,
  temperatureHighlights,
  pages,
  textRef,
}) {
  const segments = buildSegmentsWithPages(
    text,
    highlights,
    showReadStatus ? readRanges : undefined,
    temperatureHighlights,
    pages,
  );
  let firstHighlightedSegmentFound = false;

  return (
    <div className="canvas-article-text" ref={textRef}>
      {segments.map((seg, idx) => {
        if (seg.type === "page-splitter") {
          return (
            <div key={idx} className="canvas-page-splitter">
              <span className="canvas-page-splitter-line" />
              <span className="canvas-page-splitter-label">
                Page {seg.page_number}
              </span>
              <span className="canvas-page-splitter-line" />
            </div>
          );
        }

        const isActiveHighlightTarget =
          seg.highlighted && !firstHighlightedSegmentFound;
        if (seg.highlighted) {
          firstHighlightedSegmentFound = true;
        }

        if (seg.highlighted) {
          return (
            <mark
              key={idx}
              className="canvas-highlight"
              ref={isActiveHighlightTarget ? activeHighlightRef : undefined}
              title={seg.label || undefined}
              data-char-start={seg.start}
              data-char-end={seg.end}
            >
              {seg.text}
            </mark>
          );
        }

        if (seg.temperatureColor) {
          const classes = [
            "canvas-temperature-highlight",
            seg.read && showReadStatus ? "canvas-sentence--read" : undefined,
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <span
              key={idx}
              className={classes || undefined}
              style={{ backgroundColor: seg.temperatureColor }}
              data-char-start={seg.start}
              data-char-end={seg.end}
            >
              {seg.text}
            </span>
          );
        }

        return (
          <span
            key={idx}
            className={
              seg.read && showReadStatus ? "canvas-sentence--read" : undefined
            }
          >
            {seg.text}
          </span>
        );
      })}
    </div>
  );
}
