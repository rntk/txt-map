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
 *   sentenceOffsets?: number[],
 *   onTextClick?: (e: React.MouseEvent<HTMLDivElement>) => void,
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
  sentenceOffsets,
  onTextClick,
}) {
  const segments = buildSegmentsWithPages(
    text,
    highlights,
    showReadStatus ? readRanges : undefined,
    temperatureHighlights,
    pages,
    sentenceOffsets,
  );

  const sentenceIndexFor = (start) => {
    if (
      !Array.isArray(sentenceOffsets) ||
      sentenceOffsets.length === 0 ||
      typeof start !== "number"
    ) {
      return undefined;
    }
    let lo = 0;
    let hi = sentenceOffsets.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sentenceOffsets[mid] <= start) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result >= 0 ? result : undefined;
  };

  let firstHighlightedSegmentFound = false;

  return (
    <div
      className="canvas-article-text"
      ref={textRef}
      onClick={onTextClick}
    >
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

        const sentenceIdx = sentenceIndexFor(seg.start);
        const sentenceAttr =
          sentenceIdx !== undefined ? String(sentenceIdx) : undefined;

        if (seg.highlighted) {
          return (
            <mark
              key={idx}
              className="canvas-highlight"
              ref={isActiveHighlightTarget ? activeHighlightRef : undefined}
              title={seg.label || undefined}
              data-char-start={seg.start}
              data-char-end={seg.end}
              data-sentence-index={sentenceAttr}
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
              data-sentence-index={sentenceAttr}
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
            data-char-start={seg.start}
            data-char-end={seg.end}
            data-sentence-index={sentenceAttr}
          >
            {seg.text}
          </span>
        );
      })}
    </div>
  );
}
