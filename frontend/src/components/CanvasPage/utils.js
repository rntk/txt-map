import { getTopicParts } from "../../utils/topicHierarchy";
import {
  MAX_CANVAS_SCALE,
  MIN_CANVAS_SCALE,
  TOPIC_HIERARCHY_CARD_WIDTH,
  TOPIC_HIERARCHY_CARD_VERTICAL_CHROME_PX,
  TOPIC_HIERARCHY_TITLE_FONT_SIZE_PX,
  TOPIC_HIERARCHY_TITLE_LINE_HEIGHT,
  TOPIC_HIERARCHY_TITLE_MAX_LINES,
  CHAT_POLL_MAX_ATTEMPTS,
  POLL_INTERVAL_MS,
  WHEEL_ZOOM_IN_FACTOR,
  WHEEL_ZOOM_OUT_FACTOR,
} from "./constants";

export { WHEEL_ZOOM_IN_FACTOR, WHEEL_ZOOM_OUT_FACTOR };

/**
 * @typedef {{x: number, y: number}} CanvasPoint
 */

/**
 * @param {number} value
 * @returns {number}
 */
export function clampCanvasScale(value) {
  return Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, value));
}

/**
 * @param {number} scale
 * @returns {number}
 */
export function getZoomAdjustedTopicTitleFontSize(scale) {
  const safeScale = clampCanvasScale(scale || 1);
  return TOPIC_HIERARCHY_TITLE_FONT_SIZE_PX * Math.max(1, 1 / safeScale);
}

/**
 * @param {number} scale
 * @param {number} baseSize
 * @returns {number}
 */
export function getZoomAdjustedFontSize(scale, baseSize) {
  const safeScale = clampCanvasScale(scale || 1);
  return baseSize * Math.max(1, 1 / safeScale);
}

/**
 * @param {number} scale
 * @returns {number}
 */
export function getZoomAdjustedTopicCardWidth(scale) {
  const safeScale = clampCanvasScale(scale || 1);
  return TOPIC_HIERARCHY_CARD_WIDTH * Math.max(1, 1 / safeScale);
}

/**
 * @param {{scale: number, height: number}} params
 * @returns {number}
 */
export function getTopicTitleFontSize({ scale, height }) {
  const zoomAdjustedFontSize = getZoomAdjustedTopicTitleFontSize(scale);
  const availableTitleHeight = Math.max(
    1,
    height - TOPIC_HIERARCHY_CARD_VERTICAL_CHROME_PX,
  );
  const heightCappedFontSize =
    availableTitleHeight /
    (TOPIC_HIERARCHY_TITLE_LINE_HEIGHT * TOPIC_HIERARCHY_TITLE_MAX_LINES);

  return Math.max(1, Math.min(zoomAdjustedFontSize, heightCappedFontSize));
}

/**
 * Keep the canvas coordinate under the cursor at the same viewport position
 * while changing scale.
 * @param {{cursor: CanvasPoint, translate: CanvasPoint, currentScale: number, nextScale: number}} params
 * @returns {CanvasPoint}
 */
export function getCursorAnchoredTranslate({
  cursor,
  translate,
  currentScale,
  nextScale,
}) {
  const canvasX = (cursor.x - translate.x) / currentScale;
  const canvasY = (cursor.y - translate.y) / currentScale;
  return {
    x: cursor.x - canvasX * nextScale,
    y: cursor.y - canvasY * nextScale,
  };
}

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Read a fetch response as JSON, tolerating empty or non-JSON bodies.
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Poll a canvas chat job until the backend finishes the slow LLM work.
 * @param {string} articleId
 * @param {string} requestId
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
export async function pollCanvasChatReply(articleId, requestId, signal) {
  for (let attempt = 0; attempt < CHAT_POLL_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`/api/canvas/${articleId}/chat/${requestId}`, {
      credentials: "include",
      signal,
    });
    const data = await readJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}`);
    }
    if (data.status === "completed") {
      return data.reply || "";
    }
    if (data.status === "failed") {
      throw new Error(data.error || "Error");
    }

    await sleep(POLL_INTERVAL_MS, signal);
  }
  throw new Error("Chat response timed out.");
}

/**
 * Build text segments with highlights, optional read ranges, and optional
 * temperature color ranges applied.
 * @param {string} text
 * @param {{start: number, end: number, label?: string}[]} highlights
 * @param {{start: number, end: number}[]} [readRanges]
 * @param {{start: number, end: number, color: string}[]} [temperatureHighlights]
 * @returns {{text: string, start?: number, end?: number, highlighted: boolean, read: boolean, label?: string, temperatureColor?: string}[]}
 */
export function buildSegments(
  text,
  highlights,
  readRanges,
  temperatureHighlights,
  sentenceBoundaries,
) {
  const hasRead = Array.isArray(readRanges) && readRanges.length > 0;
  const hasTemp =
    Array.isArray(temperatureHighlights) && temperatureHighlights.length > 0;
  const hasSentences =
    Array.isArray(sentenceBoundaries) && sentenceBoundaries.length > 0;
  if (!highlights.length && !hasRead && !hasTemp && !hasSentences)
    return [
      { text, start: 0, end: text.length, highlighted: false, read: false },
    ];

  const boundaries = new Set([0, text.length]);
  for (const h of highlights) {
    const s = Math.max(0, h.start);
    const e = Math.min(text.length, h.end);
    if (s < e) {
      boundaries.add(s);
      boundaries.add(e);
    }
  }
  if (hasRead) {
    for (const r of readRanges) {
      const s = Math.max(0, r.start);
      const e = Math.min(text.length, r.end);
      if (s < e) {
        boundaries.add(s);
        boundaries.add(e);
      }
    }
  }
  if (hasTemp) {
    for (const t of temperatureHighlights) {
      const s = Math.max(0, t.start);
      const e = Math.min(text.length, t.end);
      if (s < e) {
        boundaries.add(s);
        boundaries.add(e);
      }
    }
  }
  if (hasSentences) {
    for (const b of sentenceBoundaries) {
      if (Number.isFinite(b) && b > 0 && b < text.length) {
        boundaries.add(b);
      }
    }
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segments = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const chunk = text.slice(start, end);
    const matching = highlights.filter((h) => h.start <= start && h.end >= end);
    const matchingRead = hasRead
      ? readRanges.filter((r) => r.start <= start && r.end >= end)
      : [];
    const matchingTemp = hasTemp
      ? temperatureHighlights.filter((t) => t.start <= start && t.end >= end)
      : [];
    segments.push({
      text: chunk,
      start,
      end,
      highlighted: matching.length > 0,
      read: matchingRead.length > 0,
      label: matching.length > 0 ? matching[0].label : undefined,
      temperatureColor:
        matchingTemp.length > 0 ? matchingTemp[0].color : undefined,
    });
  }

  return segments;
}

/**
 * Build text segments with highlights, optional read ranges, and optional
 * temperature color ranges applied, split across pages.
 * @param {string} text
 * @param {{start: number, end: number, label?: string}[]} highlights
 * @param {{start: number, end: number}[]} [readRanges]
 * @param {{start: number, end: number, color: string}[]} [temperatureHighlights]
 * @param {{page_number: number, start: number, end: number}[]} [pages]
 * @returns {{type: "page-splitter", page_number: number, start: number} | {type: "segment", text: string, start?: number, end?: number, highlighted: boolean, read: boolean, label?: string, temperatureColor?: string}[]}
 */
export function buildSegmentsWithPages(
  text,
  highlights,
  readRanges,
  temperatureHighlights,
  pages,
  sentenceOffsets,
) {
  const hasPages = Array.isArray(pages) && pages.length > 0;
  if (!hasPages) {
    return buildSegments(
      text,
      highlights,
      readRanges,
      temperatureHighlights,
      sentenceOffsets,
    ).map((s) => ({
      ...s,
      type: "segment",
    }));
  }

  const result = [];

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    const pageText = text.slice(page.start, page.end);

    if (p > 0) {
      result.push({
        type: "page-splitter",
        page_number: page.page_number,
        start: page.start,
      });
    }

    const pageHighlights = highlights
      .map((h) => ({
        start: Math.max(0, h.start - page.start),
        end: Math.min(page.end - page.start, h.end - page.start),
        label: h.label,
      }))
      .filter((h) => h.start < h.end && h.end > 0 && h.start < pageText.length);

    const pageRead = (readRanges || []).map((r) => ({
      start: Math.max(0, r.start - page.start),
      end: Math.min(page.end - page.start, r.end - page.start),
    }));

    const pageTemp = (temperatureHighlights || []).map((t) => ({
      start: Math.max(0, t.start - page.start),
      end: Math.min(page.end - page.start, t.end - page.start),
      color: t.color,
    }));

    const pageSentences = (sentenceOffsets || [])
      .map((off) => off - page.start)
      .filter((off) => off > 0 && off < page.end - page.start);

    const segments = buildSegments(
      pageText,
      pageHighlights,
      pageRead,
      pageTemp,
      pageSentences,
    );
    for (const seg of segments) {
      result.push({
        ...seg,
        type: "segment",
        start: seg.start !== undefined ? seg.start + page.start : undefined,
        end: seg.end !== undefined ? seg.end + page.start : undefined,
      });
    }
  }

  return result;
}

/**
 * Locate a Range at a given character offset within an article element,
 * skipping page splitter chrome.
 * @param {HTMLElement} rootEl
 * @param {number} offset
 * @returns {Range | null}
 */
export function rangeAtOffset(rootEl, offset) {
  if (!rootEl) return null;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent && parent !== rootEl) {
        if (
          parent.classList?.contains("canvas-page-splitter") ||
          parent.classList?.contains("canvas-article-image")
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let acc = 0;
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue.length;
    if (acc + len >= offset) {
      const local = Math.max(0, Math.min(offset - acc, len));
      const range = document.createRange();
      range.setStart(node, local);
      range.setEnd(node, Math.min(local + 1, len));
      return range;
    }
    acc += len;
    node = walker.nextNode();
  }
  return null;
}

/**
 * Derive highlights to render from a single event.
 */
export function eventToHighlights(ev) {
  if (!ev) return [];
  if (ev.event_type === "highlight_span") {
    const { start, end, label } = ev.data || {};
    if (typeof start === "number" && typeof end === "number") {
      return [{ start, end, label: label || "" }];
    }
  }
  return [];
}

/**
 * @param {any} ev
 * @param {number} idx
 * @returns {string}
 */
export function eventLabel(ev, idx) {
  if (!ev) return `#${idx + 1}`;
  if (ev.event_type === "highlight_span") {
    const lbl = ev.data?.label;
    return lbl ? `${idx + 1}. ${lbl}` : `${idx + 1}. highlight`;
  }
  return `${idx + 1}. ${ev.event_type || "event"}`;
}

/**
 * @param {{name?: string, fullPath?: string, displayName?: string}} topic
 * @returns {string}
 */
export function getTopicDisplayName(topic) {
  if (topic?.displayName) return topic.displayName;
  const parts = getTopicParts(topic?.fullPath || topic?.name || "");
  return parts[parts.length - 1] || topic?.name || "";
}

/**
 * @param {{sentences?: number[], sentenceIndices?: number[]}} topic
 * @returns {number[]}
 */
export function getTopicSentenceNumbers(topic) {
  const source = Array.isArray(topic?.sentenceIndices)
    ? topic.sentenceIndices
    : topic?.sentences;
  return Array.isArray(source)
    ? source.filter((value) => Number.isInteger(value) && value > 0)
    : [];
}

/**
 * @param {{sentences?: number[], sentenceIndices?: number[]}} topic
 * @param {number[]} sentenceOffsets
 * @param {string[]} submissionSentences
 * @returns {{charStart: number, charEnd: number} | null}
 */
export function getTopicTextRange(topic, sentenceOffsets, submissionSentences) {
  const sentenceNumbers = getTopicSentenceNumbers(topic).filter(
    (value) => value <= submissionSentences.length,
  );
  if (sentenceNumbers.length === 0) return null;

  const startSent = Math.min(...sentenceNumbers);
  const endSent = Math.max(...sentenceNumbers);
  const charStart = sentenceOffsets[startSent - 1];
  const endOffset = sentenceOffsets[endSent - 1];
  const endSentence = submissionSentences[endSent - 1];

  if (
    !Number.isFinite(charStart) ||
    !Number.isFinite(endOffset) ||
    typeof endSentence !== "string"
  ) {
    return null;
  }

  return {
    charStart,
    charEnd: endOffset + endSentence.length,
  };
}

/**
 * @param {{sentences?: number[], sentenceIndices?: number[]}} topic
 * @param {number[]} sentenceOffsets
 * @param {string[]} submissionSentences
 * @returns {{charStart: number, charEnd: number}[]}
 */
export function getTopicSentenceTextRanges(
  topic,
  sentenceOffsets,
  submissionSentences,
) {
  return getTopicSentenceNumbers(topic)
    .filter((value) => value <= submissionSentences.length)
    .map((sentenceNumber) => {
      const sentenceIndex = sentenceNumber - 1;
      const charStart = sentenceOffsets[sentenceIndex];
      const sentenceText = submissionSentences[sentenceIndex];
      if (!Number.isFinite(charStart) || typeof sentenceText !== "string") {
        return null;
      }
      return {
        charStart,
        charEnd: charStart + sentenceText.length,
      };
    })
    .filter(Boolean);
}

/**
 * @typedef {{
 *   fullPath: string,
 *   sentenceIndices?: number[] | Set<number>,
 *   sentences?: number[],
 *   summaryCardPaths?: string[],
 *   occurrenceKey?: string,
 * }} CanvasTopicHierarchyRow
 */

/**
 * @typedef {{
 *   path: string,
 *   name: string,
 *   text: string,
 *   bullets: string[],
 *   sourceSentences: number[],
 *   startSentence: number,
 * }} CanvasSummaryCard
 */

/**
 * Splits recurring topics into per-occurrence runs in article reading order.
 * @param {CanvasTopicHierarchyRow[]} rows
 * @returns {CanvasTopicHierarchyRow[]}
 */
export function splitTopicHierarchyRowsForArticleOrder(rows) {
  return rows
    .flatMap((row) => {
      const sentenceNumbers = getTopicSentenceNumbers(row)
        .slice()
        .sort((left, right) => left - right);
      if (sentenceNumbers.length <= 1) {
        return [
          {
            ...row,
            sentenceIndices: sentenceNumbers,
            occurrenceKey: `${row.fullPath}:0`,
          },
        ];
      }

      /** @type {number[][]} */
      const runs = [];
      let currentRun = [sentenceNumbers[0]];
      for (let index = 1; index < sentenceNumbers.length; index += 1) {
        const sentenceNumber = sentenceNumbers[index];
        const previousSentenceNumber = sentenceNumbers[index - 1];
        if (sentenceNumber === previousSentenceNumber + 1) {
          currentRun.push(sentenceNumber);
        } else {
          runs.push(currentRun);
          currentRun = [sentenceNumber];
        }
      }
      runs.push(currentRun);

      return runs.map((run, index) => ({
        ...row,
        sentenceIndices: run,
        occurrenceKey: `${row.fullPath}:${index}`,
      }));
    })
    .sort((left, right) => {
      const leftSentences = getTopicSentenceNumbers(left);
      const rightSentences = getTopicSentenceNumbers(right);
      const leftStart =
        leftSentences.length > 0 ? Math.min(...leftSentences) : 0;
      const rightStart =
        rightSentences.length > 0 ? Math.min(...rightSentences) : 0;
      return (
        leftStart - rightStart || left.fullPath.localeCompare(right.fullPath)
      );
    });
}

/**
 * Returns the summary cards that correspond to a given hierarchy row.
 * @param {CanvasTopicHierarchyRow} row
 * @param {CanvasSummaryCard[]} summaryCards
 * @returns {CanvasSummaryCard[]}
 */
export function getMatchingSummaryCardsForHierarchyRow(row, summaryCards) {
  if (Array.isArray(row.summaryCardPaths) && row.summaryCardPaths.length > 0) {
    const allowedPaths = new Set(row.summaryCardPaths);
    return summaryCards.filter((card) => allowedPaths.has(card.path));
  }

  return summaryCards.filter(
    (card) =>
      card.path === row.fullPath ||
      card.path.startsWith(`${row.fullPath}>`) ||
      row.fullPath.startsWith(`${card.path}>`),
  );
}

/**
 * Splits hierarchy rows for summary-mode, aligning parent topics to contiguous
 * runs in the visible summary-card order.
 * @param {CanvasTopicHierarchyRow[]} rows
 * @param {CanvasSummaryCard[]} summaryCards
 * @returns {CanvasTopicHierarchyRow[]}
 */
export function splitTopicHierarchyRowsForSummaryOrder(rows, summaryCards) {
  return rows.flatMap((row) => {
    const matchingCards = getMatchingSummaryCardsForHierarchyRow(
      row,
      summaryCards,
    );
    if (matchingCards.length <= 1) {
      return [
        {
          ...row,
          summaryCardPaths: matchingCards.map((card) => card.path),
          occurrenceKey: `${row.fullPath}:summary:0`,
        },
      ];
    }

    const matchingPaths = new Set(matchingCards.map((card) => card.path));
    /** @type {CanvasSummaryCard[][]} */
    const runs = [];
    let currentRun = [];

    summaryCards.forEach((card) => {
      if (!matchingPaths.has(card.path)) {
        if (currentRun.length > 0) {
          runs.push(currentRun);
          currentRun = [];
        }
        return;
      }
      currentRun.push(card);
    });

    if (currentRun.length > 0) {
      runs.push(currentRun);
    }

    return runs.map((run, index) => ({
      ...row,
      summaryCardPaths: run.map((card) => card.path),
      occurrenceKey: `${row.fullPath}:summary:${index}`,
    }));
  });
}
