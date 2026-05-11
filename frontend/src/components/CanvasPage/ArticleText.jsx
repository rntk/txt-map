import React, { memo, useMemo } from "react";
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
 *   images?: {src: string, alt: string, title?: string, anchorOffset: number}[],
 *   textRef?: React.RefObject<HTMLDivElement | null>,
 *   sentenceOffsets?: number[],
 *   onTextClick?: (e: React.MouseEvent<HTMLDivElement>) => void,
 * }} props
 */
function ArticleText({
  text,
  highlights,
  activeHighlightRef,
  readRanges,
  showReadStatus,
  temperatureHighlights,
  pages,
  images,
  textRef,
  sentenceOffsets,
  onTextClick,
}) {
  const sortedImages = useMemo(
    () =>
      Array.isArray(images)
        ? [...images]
            .filter(
              (image) =>
                image?.src &&
                Number.isFinite(Number(image.anchorOffset)) &&
                Number(image.anchorOffset) >= 0,
            )
            .sort((left, right) => left.anchorOffset - right.anchorOffset)
        : [],
    [images],
  );
  const segments = useMemo(() => {
    const segmentBoundaries = [
      ...(Array.isArray(sentenceOffsets) ? sentenceOffsets : []),
      ...sortedImages.map((image) => Number(image.anchorOffset)),
    ];
    return buildSegmentsWithPages(
      text,
      highlights,
      showReadStatus ? readRanges : undefined,
      temperatureHighlights,
      pages,
      segmentBoundaries,
    );
  }, [
    text,
    highlights,
    showReadStatus,
    readRanges,
    temperatureHighlights,
    pages,
    sortedImages,
    sentenceOffsets,
  ]);

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
  let nextImageIndex = 0;

  const renderArticleImage = (image, key) => (
    <figure className="canvas-article-image" key={key}>
      <img
        className="canvas-article-image__media"
        src={image.src}
        alt={image.alt || ""}
        title={image.title}
        loading="lazy"
      />
      {image.alt && (
        <figcaption className="canvas-article-image__caption">
          {image.alt}
        </figcaption>
      )}
    </figure>
  );

  const takeImagesBefore = (offset) => {
    const rendered = [];
    while (
      nextImageIndex < sortedImages.length &&
      sortedImages[nextImageIndex].anchorOffset <= offset
    ) {
      const image = sortedImages[nextImageIndex];
      rendered.push(renderArticleImage(image, `image-${nextImageIndex}`));
      nextImageIndex += 1;
    }
    return rendered;
  };

  return (
    <div className="canvas-article-text" ref={textRef} onClick={onTextClick}>
      {segments.flatMap((seg, idx) => {
        if (seg.type === "page-splitter") {
          return [
            ...takeImagesBefore(seg.start ?? text.length),
            <div key={idx} className="canvas-page-splitter">
              <span className="canvas-page-splitter-line" />
              <span className="canvas-page-splitter-label">
                Page {seg.page_number}
              </span>
              <span className="canvas-page-splitter-line" />
            </div>,
          ];
        }

        const imagesBeforeSegment = takeImagesBefore(seg.start ?? 0);
        const isActiveHighlightTarget =
          seg.highlighted && !firstHighlightedSegmentFound;
        if (seg.highlighted) {
          firstHighlightedSegmentFound = true;
        }

        const sentenceIdx = sentenceIndexFor(seg.start);
        const sentenceAttr =
          sentenceIdx !== undefined ? String(sentenceIdx) : undefined;

        if (seg.highlighted) {
          return [
            ...imagesBeforeSegment,
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
            </mark>,
          ];
        }

        if (seg.temperatureColor) {
          const classes = [
            "canvas-temperature-highlight",
            seg.read && showReadStatus ? "canvas-sentence--read" : undefined,
          ]
            .filter(Boolean)
            .join(" ");
          return [
            ...imagesBeforeSegment,
            <span
              key={idx}
              className={classes || undefined}
              style={{ backgroundColor: seg.temperatureColor }}
              data-char-start={seg.start}
              data-char-end={seg.end}
              data-sentence-index={sentenceAttr}
            >
              {seg.text}
            </span>,
          ];
        }

        return [
          ...imagesBeforeSegment,
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
          </span>,
        ];
      })}
      {takeImagesBefore(text.length)}
    </div>
  );
}

export default memo(ArticleText);
