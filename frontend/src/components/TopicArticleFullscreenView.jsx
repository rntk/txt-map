import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import FullScreenGraph from "./FullScreenGraph";
import TextDisplay from "./TextDisplay";
import {
  getTopicAccentColor,
  getTopicCSSClass,
} from "../utils/topicColorUtils";
import { splitTopicPath } from "../utils/summaryTimeline";
import { isTopicSelectionRead } from "../utils/topicReadUtils";
import { buildModalSelectionFromTopic } from "../utils/topicModalSelection";
import { buildArticleTfIdfIndex, buildTopicTagCloud } from "../utils/gridUtils";

/**
 * @typedef {Object} TopicTimelineItem
 * @property {string} segmentKey
 * @property {string} name
 * @property {number} startSentenceIndex
 * @property {number} endSentenceIndex
 * @property {number|null} startCharIndex
 * @property {number|null} endCharIndex
 * @property {string[]} pathSegments
 * @property {string} topLevelLabel
 * @property {string[]} noteTitleLines
 * @property {Object} topic
 */

/**
 * @typedef {Object} TopicMeasuredLayout
 * @property {string} segmentKey
 * @property {string} name
 * @property {number} startSentenceIndex
 * @property {number} endSentenceIndex
 * @property {number|null} startCharIndex
 * @property {number|null} endCharIndex
 * @property {number} bracketTop
 * @property {number} bracketHeight
 * @property {string[]} pathSegments
 * @property {string} topLevelLabel
 * @property {string[]} noteTitleLines
 * @property {Object} topic
 */

/**
 * @typedef {{
 *   segmentKey: string,
 *   name: string,
 *   summary: string,
 *   summaryTop: number,
 *   startSentenceIndex: number,
 *   endSentenceIndex: number,
 * }} TopicSummaryCardLayout
 */

/**
 * @typedef {Object} TopicArticleFullscreenViewProps
 * @property {Array<Object>} articles
 * @property {Array<Object>} safeTopics
 * @property {Array<Object>} selectedTopics
 * @property {Object|null} hoveredTopic
 * @property {Set<string> | string[]} readTopics
 * @property {(topic: Object) => void} onToggleRead
 * @property {(topic: Object) => void} onToggleTopic
 * @property {(topic: Object, direction: 'prev'|'next'|'focus') => void} onNavigateTopic
 * @property {(topic: Object) => void} onShowSentences
 * @property {(topic: Object) => void} onOpenTopicSummaries
 * @property {boolean} tooltipEnabled
 * @property {string} submissionId
 * @property {Array<number>} activeInsightSentenceIndices
 * @property {Array<{start: number, end: number}>} activeInsightRanges
 * @property {Set<string> | string[] | null} coloredTopicNames
 * @property {boolean} coloredHighlightMode
 * @property {(topic: Object | null) => void} [setHoveredTopic]
 * @property {() => void} onClose
 */

const OVERLAY_CARD_MIN_HEIGHT = 44;
const OVERLAY_STACK_GAP_PX = 2;
const REVEALED_TOKEN_CLASSNAME = "topic-article-view__revealed-token";
const REVEALED_READ_TOKEN_CLASSNAME =
  "topic-article-view__revealed-token--read";
const NOTE_CARD_BASE_HEIGHT = 58;
const NOTE_CARD_LINE_HEIGHT = 18;
const NOTE_CARD_MAX_TITLE_LINES = 3;
const SUMMARY_CARD_VIEWPORT_PADDING = 18;
const SUMMARY_CARD_TOP_CLEARANCE = 72;
const SCROLL_THROTTLE_MS = 32;
const ACTIVE_SEGMENT_HYSTERESIS_PX = 28;
const HOVER_INTENT_ENTER_MS = 80;
const HOVER_INTENT_LEAVE_MS = 120;
const SUMMARY_POSITION_STEP_PX = 4;

/**
 * @param {string[]} noteTitleLines
 * @returns {number}
 */
export function estimateTopicNoteHeight(noteTitleLines) {
  const lineCount = Math.max(
    1,
    Math.min(
      NOTE_CARD_MAX_TITLE_LINES,
      Array.isArray(noteTitleLines) ? noteTitleLines.length : 0,
    ),
  );
  return Math.max(
    OVERLAY_CARD_MIN_HEIGHT,
    NOTE_CARD_BASE_HEIGHT + lineCount * NOTE_CARD_LINE_HEIGHT,
  );
}

/**
 * @param {number[]} indices
 * @returns {Array<{ startSentenceIndex: number, endSentenceIndex: number }>}
 */
function buildConsecutiveSentenceSegments(indices) {
  const sortedIndices = (Array.isArray(indices) ? indices : [])
    .map((value) => Number(value) - 1)
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((left, right) => left - right);

  if (sortedIndices.length === 0) {
    return [];
  }

  /** @type {Array<{ startSentenceIndex: number, endSentenceIndex: number }>} */
  const segments = [];
  let startSentenceIndex = sortedIndices[0];
  let endSentenceIndex = sortedIndices[0];

  for (let index = 1; index < sortedIndices.length; index += 1) {
    const nextIndex = sortedIndices[index];
    if (nextIndex <= endSentenceIndex + 1) {
      endSentenceIndex = Math.max(endSentenceIndex, nextIndex);
      continue;
    }

    segments.push({ startSentenceIndex, endSentenceIndex });
    startSentenceIndex = nextIndex;
    endSentenceIndex = nextIndex;
  }

  segments.push({ startSentenceIndex, endSentenceIndex });
  return segments;
}

/**
 * @param {Array<Object>} ranges
 * @returns {Array<{
 *   startSentenceIndex: number,
 *   endSentenceIndex: number,
 *   startCharIndex: number | null,
 *   endCharIndex: number | null,
 * }>}
 */
function buildSentenceRangeSegments(ranges) {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => ({
      startSentenceIndex: Number(range?.sentence_start) - 1,
      endSentenceIndex: Number(range?.sentence_end) - 1,
      startCharIndex: Number(range?.start),
      endCharIndex: Number(range?.end),
    }))
    .filter(
      (range) =>
        Number.isInteger(range.startSentenceIndex) &&
        Number.isInteger(range.endSentenceIndex) &&
        range.startSentenceIndex >= 0 &&
        range.endSentenceIndex >= range.startSentenceIndex,
    )
    .map((range) => ({
      startSentenceIndex: range.startSentenceIndex,
      endSentenceIndex: range.endSentenceIndex,
      startCharIndex: Number.isFinite(range.startCharIndex)
        ? range.startCharIndex
        : null,
      endCharIndex: Number.isFinite(range.endCharIndex)
        ? range.endCharIndex
        : null,
    }))
    .sort((left, right) => {
      if (left.startSentenceIndex !== right.startSentenceIndex) {
        return left.startSentenceIndex - right.startSentenceIndex;
      }
      if (left.endSentenceIndex !== right.endSentenceIndex) {
        return left.endSentenceIndex - right.endSentenceIndex;
      }
      const leftStart = left.startCharIndex ?? Number.NEGATIVE_INFINITY;
      const rightStart = right.startCharIndex ?? Number.NEGATIVE_INFINITY;
      return leftStart - rightStart;
    });
}

/**
 * @param {Object} topic
 * @returns {Array<{
 *   startSentenceIndex: number,
 *   endSentenceIndex: number,
 *   startCharIndex: number | null,
 *   endCharIndex: number | null,
 * }>}
 */
function getTopicSegments(topic) {
  const sentenceSegments = buildConsecutiveSentenceSegments(topic?.sentences);
  const rangeSegments = buildSentenceRangeSegments(topic?.ranges);

  // Prefer range-based segments when available — they preserve non-adjacent
  // ranges as separate segments, while sentence-based segments may merge
  // them into one contiguous block when the sentences array is a flat list.
  if (rangeSegments.length > 0) {
    return rangeSegments;
  }

  if (sentenceSegments.length > 0) {
    return sentenceSegments.map((segment) => ({
      ...segment,
      startCharIndex: null,
      endCharIndex: null,
    }));
  }

  return [];
}

/**
 * @param {Array<Object>} topics
 * @returns {TopicTimelineItem[]}
 */
function buildTopicTimelineItems(topics) {
  return (Array.isArray(topics) ? topics : [])
    .flatMap((topic) => {
      if (!topic?.name) {
        return [];
      }
      const pathSegments = splitTopicPath(topic.name);
      const normalizedPathSegments =
        pathSegments.length > 0 ? pathSegments : [topic.name];

      return getTopicSegments(topic).map((segment, segmentIndex) => ({
        segmentKey: `${topic.name}::${segmentIndex}`,
        name: topic.name,
        startSentenceIndex: segment.startSentenceIndex,
        endSentenceIndex: segment.endSentenceIndex,
        pathSegments: normalizedPathSegments,
        topLevelLabel: normalizedPathSegments[0] || topic.name,
        noteTitleLines:
          normalizedPathSegments.length > 1
            ? normalizedPathSegments.slice(1)
            : [topic.name],
        startCharIndex: segment.startCharIndex,
        endCharIndex: segment.endCharIndex,
        topic,
      }));
    })
    .sort((left, right) => {
      if (left.startSentenceIndex !== right.startSentenceIndex) {
        return left.startSentenceIndex - right.startSentenceIndex;
      }
      if (left.endSentenceIndex !== right.endSentenceIndex) {
        return left.endSentenceIndex - right.endSentenceIndex;
      }
      return left.name.localeCompare(right.name);
    });
}

/**
 * @param {TopicMeasuredLayout | { name: string, topic: Object }} layout
 * @returns {Object}
 */
function buildNormalizedTopicSelection(layout) {
  const baseTopic = buildModalSelectionFromTopic({
    ...layout.topic,
    displayName: layout.topic?.displayName || layout.name,
    fullPath: layout.topic?.fullPath || layout.name,
    sentences: layout.topic?.sentences,
    sentenceIndices: layout.topic?.sentenceIndices || layout.topic?.sentences,
  });

  return {
    ...baseTopic,
    canonicalTopicNames:
      Array.isArray(baseTopic.canonicalTopicNames) &&
      baseTopic.canonicalTopicNames.length > 0
        ? baseTopic.canonicalTopicNames
        : [layout.name],
  };
}

/**
 * @param {HTMLElement|null} articleRoot
 * @param {TopicTimelineItem[]} items
 * @returns {TopicMeasuredLayout[]}
 */
function buildTopicNoteLayouts(articleRoot, items) {
  if (!(articleRoot instanceof HTMLElement) || items.length === 0) {
    return [];
  }

  const articleRect = articleRoot.getBoundingClientRect();

  // Cache sentences
  const sentenceElements = articleRoot.querySelectorAll(
    '[data-article-index="0"][data-sentence-index], [id^="sentence-0-"]',
  );
  const sentenceMap = new Map();
  for (let i = 0; i < sentenceElements.length; i++) {
    const el = sentenceElements[i];
    const indexStr =
      el.getAttribute("data-sentence-index") ||
      el.id.replace("sentence-0-", "");
    const index = parseInt(indexStr, 10);
    if (!isNaN(index)) {
      sentenceMap.set(index, el);
    }
  }

  // Cache characters
  const charElements = articleRoot.querySelectorAll(
    '[data-article-index="0"][data-char-start]',
  );
  const charCandidates = [];
  for (let i = 0; i < charElements.length; i++) {
    const el = charElements[i];
    const start = parseInt(el.getAttribute("data-char-start"), 10);
    if (!isNaN(start)) {
      charCandidates.push({ node: el, start });
    }
  }
  charCandidates.sort((a, b) => a.start - b.start);

  const getSentenceNodeCached = (index) => sentenceMap.get(index) || null;
  const getCharNodeCached = (charIndex) => {
    if (!Number.isFinite(charIndex) || charCandidates.length === 0) return null;
    let left = 0,
      right = charCandidates.length - 1;
    let best = charCandidates[right];
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (charCandidates[mid].start >= charIndex) {
        best = charCandidates[mid];
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return best.node;
  };

  /** @type {TopicMeasuredLayout[]} */
  const results = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    let startNode = getSentenceNodeCached(item.startSentenceIndex);
    let endNode = getSentenceNodeCached(item.endSentenceIndex);

    if (!startNode || !endNode) {
      startNode = startNode || getCharNodeCached(item.startCharIndex);
      endNode = endNode || getCharNodeCached(item.endCharIndex);
    }

    if (
      !(startNode instanceof HTMLElement) ||
      !(endNode instanceof HTMLElement)
    ) {
      continue;
    }

    const startRect = startNode.getBoundingClientRect();
    const endRect = endNode.getBoundingClientRect();
    const bracketTop = startRect.top - articleRect.top + articleRoot.scrollTop;
    const bracketBottom =
      endRect.bottom - articleRect.top + articleRoot.scrollTop;
    const bracketHeight = Math.max(24, bracketBottom - bracketTop);

    results.push({
      segmentKey: item.segmentKey,
      name: item.name,
      startSentenceIndex: item.startSentenceIndex,
      endSentenceIndex: item.endSentenceIndex,
      startCharIndex: item.startCharIndex,
      endCharIndex: item.endCharIndex,
      bracketTop,
      bracketHeight,
      pathSegments: item.pathSegments,
      topLevelLabel: item.topLevelLabel,
      noteTitleLines: item.noteTitleLines,
      topic: item.topic,
    });
  }
  return results;
}

/**
 * @param {TopicMeasuredLayout[]} previousLayouts
 * @param {TopicMeasuredLayout[]} nextLayouts
 * @returns {boolean}
 */
function areNoteLayoutsEqual(previousLayouts, nextLayouts) {
  if (previousLayouts.length !== nextLayouts.length) {
    return false;
  }

  return previousLayouts.every((layout, index) => {
    const nextLayout = nextLayouts[index];
    return (
      layout.segmentKey === nextLayout.segmentKey &&
      layout.name === nextLayout.name &&
      layout.startSentenceIndex === nextLayout.startSentenceIndex &&
      layout.endSentenceIndex === nextLayout.endSentenceIndex &&
      Math.abs(layout.bracketTop - nextLayout.bracketTop) < 1 &&
      Math.abs(layout.bracketHeight - nextLayout.bracketHeight) < 1
    );
  });
}

/**
 * @typedef {TopicMeasuredLayout & {
 *   stackedTop: number,
 *   stackedHeight: number,
 *   laneIndex: number,
 *   laneCount: number,
 *   clusterIndex: number,
 *   isRevealed: boolean,
 * }} TopicOverlayLayout
 */

/**
 * @param {TopicMeasuredLayout[]} layouts
 * @param {Set<string>} revealedSegmentKeys
 * @returns {TopicOverlayLayout[]}
 */
function buildTopicOverlayLayouts(layouts, revealedSegmentKeys) {
  if (layouts.length === 0) {
    return [];
  }

  const allLayouts = layouts.map((layout) => ({
    ...layout,
    isRevealed: revealedSegmentKeys.has(layout.segmentKey),
  }));

  const sortedLayouts = [...allLayouts].sort((left, right) => {
    if (left.bracketTop !== right.bracketTop) {
      return left.bracketTop - right.bracketTop;
    }
    if (left.bracketHeight !== right.bracketHeight) {
      return right.bracketHeight - left.bracketHeight;
    }
    return left.segmentKey.localeCompare(right.segmentKey);
  });

  /** @type {Array<TopicOverlayLayout>} */
  const stackedLayouts = [];
  let nextAvailableTop = Number.NEGATIVE_INFINITY;

  sortedLayouts.forEach((layout, index) => {
    const stackedTop = Math.max(layout.bracketTop, nextAvailableTop);
    const stackedHeight = layout.bracketHeight;

    stackedLayouts.push({
      ...layout,
      stackedTop,
      stackedHeight,
      laneIndex: 0,
      laneCount: 1,
      clusterIndex: index,
    });

    nextAvailableTop = stackedTop + stackedHeight + OVERLAY_STACK_GAP_PX;
  });

  return stackedLayouts;
}

/**
 * @param {TopicMeasuredLayout} layout
 * @param {number|null} sentenceIndex
 * @param {number|null} charStart
 * @param {number|null} charEnd
 * @returns {boolean}
 */
function isEventInsideLayout(layout, sentenceIndex, charStart, charEnd) {
  if (
    Number.isInteger(sentenceIndex) &&
    sentenceIndex >= layout.startSentenceIndex &&
    sentenceIndex <= layout.endSentenceIndex
  ) {
    return true;
  }

  if (!Number.isFinite(charStart) && !Number.isFinite(charEnd)) {
    return false;
  }

  const layoutStart = layout.startCharIndex;
  const layoutEnd = layout.endCharIndex;
  if (!Number.isFinite(layoutStart) || !Number.isFinite(layoutEnd)) {
    return false;
  }

  const eventStart = Number.isFinite(charStart) ? charStart : charEnd;
  const eventEnd = Number.isFinite(charEnd) ? charEnd : charStart;
  return (
    Number.isFinite(eventStart) &&
    Number.isFinite(eventEnd) &&
    eventStart < layoutEnd &&
    eventEnd > layoutStart
  );
}

/**
 * @param {TopicMeasuredLayout[]} layouts
 * @param {number} scrollTop
 * @param {number} viewportHeight
 * @returns {string[]}
 */
function buildVisibleTopLevelLabels(layouts, scrollTop, viewportHeight) {
  if (layouts.length === 0 || viewportHeight <= 0) {
    return [];
  }

  const viewportTop = scrollTop;
  const viewportBottom = scrollTop + viewportHeight;
  const seen = new Set();
  const labels = [];

  layouts.forEach((layout) => {
    const bracketBottom = layout.bracketTop + layout.bracketHeight;
    if (bracketBottom <= viewportTop || layout.bracketTop >= viewportBottom) {
      return;
    }

    if (!layout.topLevelLabel || seen.has(layout.topLevelLabel)) {
      return;
    }

    seen.add(layout.topLevelLabel);
    labels.push(layout.topLevelLabel);
  });

  return labels;
}

/**
 * @param {TopicMeasuredLayout | null} layout
 * @param {string} summary
 * @param {number} scrollTop
 * @param {number} viewportHeight
 * @returns {TopicSummaryCardLayout | null}
 */
function buildTopicSummaryCardLayout(
  layout,
  summary,
  scrollTop,
  viewportHeight,
) {
  const trimmedSummary = typeof summary === "string" ? summary.trim() : "";
  if (!layout || !trimmedSummary || viewportHeight <= 0) {
    return null;
  }

  const topEdge = scrollTop + SUMMARY_CARD_VIEWPORT_PADDING;
  const topWithClearance = scrollTop + SUMMARY_CARD_TOP_CLEARANCE;
  const bottomEdge = scrollTop + viewportHeight - SUMMARY_CARD_VIEWPORT_PADDING;
  const summaryTop = Math.min(
    Math.max(layout.bracketTop, Math.max(topEdge, topWithClearance)),
    Math.max(topEdge, bottomEdge),
  );
  const roundedSummaryTop =
    Math.round(summaryTop / SUMMARY_POSITION_STEP_PX) *
    SUMMARY_POSITION_STEP_PX;

  return {
    segmentKey: layout.segmentKey,
    name: layout.name,
    summary: trimmedSummary,
    summaryTop: roundedSummaryTop,
    startSentenceIndex: layout.startSentenceIndex,
    endSentenceIndex: layout.endSentenceIndex,
  };
}

/**
 * @param {TopicArticleFullscreenViewProps} props
 * @returns {React.JSX.Element}
 */
function TopicArticleFullscreenView({
  articles,
  safeTopics,
  selectedTopics,
  hoveredTopic,
  readTopics,
  onToggleRead,
  onToggleTopic,
  onNavigateTopic,
  onShowSentences,
  onOpenTopicSummaries,
  tooltipEnabled,
  submissionId,
  activeInsightSentenceIndices,
  activeInsightRanges,
  coloredTopicNames,
  coloredHighlightMode,
  onClose,
  setHoveredTopic,
}) {
  const article =
    Array.isArray(articles) && articles.length > 0 ? articles[0] : null;
  const topicTimelineItems = useMemo(
    () => buildTopicTimelineItems(article?.topics || safeTopics),
    [article?.topics, safeTopics],
  );
  const articleScrollRef = useRef(null);
  const articleRootRef = useRef(null);
  const animationFrameRef = useRef(0);
  const lastSyncTimeRef = useRef(0);
  const [activeSegmentKey, setActiveSegmentKey] = useState(
    topicTimelineItems[0]?.segmentKey || null,
  );
  const [noteLayouts, setNoteLayouts] = useState([]);
  const [revealedSegmentKeys, setRevealedSegmentKeys] = useState(
    () => new Set(),
  );
  const [previewTopicName, setPreviewTopicName] = useState(null);
  const [previewSegmentKey, setPreviewSegmentKey] = useState(null);
  const [visibleTopLevelLabels, setVisibleTopLevelLabels] = useState([]);
  const [summaryCardLayout, setSummaryCardLayout] = useState(null);

  const noteLayoutsRef = useRef(noteLayouts);
  const activeSegmentKeyRef = useRef(activeSegmentKey);
  const hoverEnterTimeoutRef = useRef(0);
  const hoverLeaveTimeoutRef = useRef(0);
  noteLayoutsRef.current = noteLayouts;
  activeSegmentKeyRef.current = activeSegmentKey;

  const noteAccentStyleSheet = useMemo(() => {
    const seen = new Set();
    const lines = [];
    topicTimelineItems.forEach((item) => {
      const cssClass = getTopicCSSClass(item.name);
      if (seen.has(cssClass)) {
        return;
      }
      seen.add(cssClass);
      lines.push(
        `.${cssClass} { --topic-accent-color: ${getTopicAccentColor(item.name)}; }`,
      );
    });
    return lines.join("\n");
  }, [topicTimelineItems]);
  // Memoise raw-HTML body extraction so it does not run on every re-render.
  const rawHtmlBody = useMemo(() => {
    const rawHtml = article?.raw_html || "";
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return bodyMatch ? bodyMatch[1] : rawHtml;
  }, [article?.raw_html]);
  const topicSummaryMap = useMemo(
    () =>
      article?.topic_summaries && typeof article.topic_summaries === "object"
        ? article.topic_summaries
        : {},
    [article?.topic_summaries],
  );
  const articleTfIdfIndex = useMemo(
    () => buildArticleTfIdfIndex(article?.sentences || []),
    [article?.sentences],
  );
  const topicTagCloudMap = useMemo(() => {
    const tagsByTopicName = new Map();

    (article?.topics || safeTopics || []).forEach((topic) => {
      if (!topic?.name || tagsByTopicName.has(topic.name)) {
        return;
      }
      tagsByTopicName.set(
        topic.name,
        buildTopicTagCloud(topic, articleTfIdfIndex),
      );
    });

    return tagsByTopicName;
  }, [article?.topics, articleTfIdfIndex, safeTopics]);
  const activeSummaryLayout = useMemo(() => {
    const preferredSegmentKey = previewSegmentKey || activeSegmentKey;
    if (preferredSegmentKey) {
      const matchingSegment = noteLayouts.find(
        (layout) => layout.segmentKey === preferredSegmentKey,
      );
      if (matchingSegment) {
        return matchingSegment;
      }
    }

    if (!previewTopicName) {
      return null;
    }

    return (
      noteLayouts.find((layout) => layout.name === previewTopicName) || null
    );
  }, [activeSegmentKey, noteLayouts, previewSegmentKey, previewTopicName]);
  const activeSummary = useMemo(() => {
    if (!activeSummaryLayout) {
      return "";
    }
    const summary = topicSummaryMap[activeSummaryLayout.name];
    return typeof summary === "string" ? summary.trim() : "";
  }, [activeSummaryLayout, topicSummaryMap]);
  const activeSummaryLayoutRef = useRef(activeSummaryLayout);
  const activeSummaryRef = useRef(activeSummary);
  activeSummaryLayoutRef.current = activeSummaryLayout;
  activeSummaryRef.current = activeSummary;

  const overlayLayouts = useMemo(
    () => buildTopicOverlayLayouts(noteLayouts, revealedSegmentKeys),
    [noteLayouts, revealedSegmentKeys],
  );
  const revealedLayouts = useMemo(
    () =>
      noteLayouts.filter((layout) =>
        revealedSegmentKeys.has(layout.segmentKey),
      ),
    [noteLayouts, revealedSegmentKeys],
  );
  const revealedSentenceIndices = useMemo(() => {
    const merged = new Set();
    revealedLayouts.forEach((layout) => {
      for (
        let sentenceIndex = layout.startSentenceIndex;
        sentenceIndex <= layout.endSentenceIndex;
        sentenceIndex += 1
      ) {
        merged.add(sentenceIndex + 1);
      }
    });
    return Array.from(merged).sort((left, right) => left - right);
  }, [revealedLayouts]);
  const revealedCharRanges = useMemo(() => {
    const ranges = [];
    revealedLayouts.forEach((layout) => {
      if (
        Number.isFinite(layout.startCharIndex) &&
        Number.isFinite(layout.endCharIndex)
      ) {
        ranges.push({
          start: layout.startCharIndex,
          end: layout.endCharIndex,
        });
      }
    });
    return ranges;
  }, [revealedLayouts]);
  const readRevealedSentenceIndices = useMemo(() => {
    const merged = new Set();
    revealedLayouts.forEach((layout) => {
      const normalizedTopic = buildNormalizedTopicSelection(layout);
      if (!isTopicSelectionRead(normalizedTopic, readTopics)) {
        return;
      }
      for (
        let sentenceIndex = layout.startSentenceIndex;
        sentenceIndex <= layout.endSentenceIndex;
        sentenceIndex += 1
      ) {
        merged.add(sentenceIndex + 1);
      }
    });
    return Array.from(merged).sort((left, right) => left - right);
  }, [readTopics, revealedLayouts]);
  const readRevealedCharRanges = useMemo(() => {
    const ranges = [];
    revealedLayouts.forEach((layout) => {
      const normalizedTopic = buildNormalizedTopicSelection(layout);
      if (
        !isTopicSelectionRead(normalizedTopic, readTopics) ||
        !Number.isFinite(layout.startCharIndex) ||
        !Number.isFinite(layout.endCharIndex)
      ) {
        return;
      }
      ranges.push({
        start: layout.startCharIndex,
        end: layout.endCharIndex,
      });
    });
    return ranges;
  }, [readTopics, revealedLayouts]);
  const mergedInsightSentenceIndices = useMemo(() => {
    const merged = new Set(
      Array.isArray(activeInsightSentenceIndices)
        ? activeInsightSentenceIndices.filter((value) =>
            Number.isInteger(value),
          )
        : [],
    );
    revealedLayouts.forEach((layout) => {
      for (
        let sentenceIndex = layout.startSentenceIndex;
        sentenceIndex <= layout.endSentenceIndex;
        sentenceIndex += 1
      ) {
        merged.add(sentenceIndex + 1);
      }
    });
    return Array.from(merged).sort((left, right) => left - right);
  }, [activeInsightSentenceIndices, revealedLayouts]);
  const mergedInsightRanges = useMemo(() => {
    const merged = Array.isArray(activeInsightRanges)
      ? [...activeInsightRanges]
      : [];
    revealedLayouts.forEach((layout) => {
      if (
        Number.isFinite(layout.startCharIndex) &&
        Number.isFinite(layout.endCharIndex)
      ) {
        merged.push({
          start: layout.startCharIndex,
          end: layout.endCharIndex,
        });
      }
    });
    return merged;
  }, [activeInsightRanges, revealedLayouts]);
  const activeSummaryTopic = activeSummaryLayout?.topic || null;

  const syncActiveTopicToViewport = useCallback(() => {
    const container = articleScrollRef.current;
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const layouts = noteLayoutsRef.current;
    if (layouts.length === 0) {
      return;
    }

    const probeOffset =
      container.scrollTop +
      Math.min(84, Math.max(40, container.clientHeight / 4));
    const currentActiveLayout = layouts.find(
      (layout) => layout.segmentKey === activeSegmentKeyRef.current,
    );
    if (currentActiveLayout) {
      const currentTop =
        currentActiveLayout.bracketTop - ACTIVE_SEGMENT_HYSTERESIS_PX;
      const currentBottom =
        currentActiveLayout.bracketTop +
        currentActiveLayout.bracketHeight +
        ACTIVE_SEGMENT_HYSTERESIS_PX;
      if (probeOffset >= currentTop && probeOffset <= currentBottom) {
        return;
      }
    }
    const activeItem =
      layouts.find(
        (layout) =>
          probeOffset >= layout.bracketTop &&
          probeOffset <= layout.bracketTop + layout.bracketHeight,
      ) ||
      layouts.find((layout) => layout.bracketTop >= probeOffset) ||
      layouts[layouts.length - 1];
    if (activeItem?.segmentKey) {
      setActiveSegmentKey((prev) =>
        prev === activeItem.segmentKey ? prev : activeItem.segmentKey,
      );
    }
  }, []); // stable — reads from noteLayoutsRef

  const measureLayouts = useCallback(() => {
    const articleRoot = articleRootRef.current;
    const nextLayouts = buildTopicNoteLayouts(articleRoot, topicTimelineItems);
    setNoteLayouts((previousLayouts) =>
      areNoteLayoutsEqual(previousLayouts, nextLayouts)
        ? previousLayouts
        : nextLayouts,
    );
  }, [topicTimelineItems]);

  useLayoutEffect(() => {
    measureLayouts();
  }, [measureLayouts]);

  useEffect(() => {
    setActiveSegmentKey((currentValue) => {
      if (
        currentValue &&
        topicTimelineItems.some((item) => item.segmentKey === currentValue)
      ) {
        return currentValue;
      }
      return topicTimelineItems[0]?.segmentKey || null;
    });
  }, [topicTimelineItems]);

  useEffect(() => {
    setRevealedSegmentKeys((currentValue) => {
      if (!(currentValue instanceof Set) || currentValue.size === 0) {
        return currentValue;
      }
      const validSegmentKeys = new Set(
        topicTimelineItems.map((item) => item.segmentKey),
      );
      const nextValue = new Set(
        Array.from(currentValue).filter((key) => validSegmentKeys.has(key)),
      );
      return nextValue.size === currentValue.size ? currentValue : nextValue;
    });
  }, [topicTimelineItems]);

  useEffect(() => {
    const container = articleScrollRef.current;
    if (!(container instanceof HTMLElement)) {
      return undefined;
    }

    const scheduleSync = () => {
      // Cancel any pending animation frame
      if (animationFrameRef.current) {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(animationFrameRef.current);
        } else {
          window.clearTimeout(animationFrameRef.current);
        }
        animationFrameRef.current = 0;
      }

      const run = () => {
        animationFrameRef.current = 0;

        // Throttle: skip if we synced recently
        const now = Date.now();
        if (now - lastSyncTimeRef.current < SCROLL_THROTTLE_MS) {
          return;
        }
        lastSyncTimeRef.current = now;

        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;
        const nextVisibleTopLevelLabels = buildVisibleTopLevelLabels(
          noteLayoutsRef.current,
          scrollTop,
          viewportHeight,
        );
        const nextSummaryCardLayout = buildTopicSummaryCardLayout(
          activeSummaryLayoutRef.current,
          activeSummaryRef.current,
          scrollTop,
          viewportHeight,
        );

        // Batch state updates - React 18 auto-batches these
        setVisibleTopLevelLabels((currentValue) => {
          const currentKey = currentValue.join("\0");
          const nextKey = nextVisibleTopLevelLabels.join("\0");
          return currentKey === nextKey
            ? currentValue
            : nextVisibleTopLevelLabels;
        });
        setSummaryCardLayout((currentValue) => {
          const isSameSummaryCardLayout =
            currentValue?.segmentKey === nextSummaryCardLayout?.segmentKey &&
            currentValue?.summary === nextSummaryCardLayout?.summary &&
            currentValue?.summaryTop === nextSummaryCardLayout?.summaryTop;
          return isSameSummaryCardLayout ? currentValue : nextSummaryCardLayout;
        });

        syncActiveTopicToViewport();
      };

      animationFrameRef.current =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame(run)
          : window.setTimeout(run, 0);
    };

    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        measureLayouts();
        lastSyncTimeRef.current = 0; // Reset throttle on resize
        scheduleSync();
      }, 150);
    };

    container.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", handleResize);
    measureLayouts();
    lastSyncTimeRef.current = 0; // Initial sync without throttle
    scheduleSync();

    return () => {
      clearTimeout(resizeTimeout);
      container.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(animationFrameRef.current);
        } else {
          window.clearTimeout(animationFrameRef.current);
        }
        animationFrameRef.current = 0;
      }
    };
  }, [measureLayouts, syncActiveTopicToViewport]);

  useEffect(() => {
    return () => {
      if (typeof setHoveredTopic === "function") {
        setHoveredTopic(null);
      }
    };
  }, [setHoveredTopic]);

  const clearHoverTimers = useCallback(() => {
    if (hoverEnterTimeoutRef.current) {
      window.clearTimeout(hoverEnterTimeoutRef.current);
      hoverEnterTimeoutRef.current = 0;
    }
    if (hoverLeaveTimeoutRef.current) {
      window.clearTimeout(hoverLeaveTimeoutRef.current);
      hoverLeaveTimeoutRef.current = 0;
    }
  }, []);

  const commitPreviewState = useCallback(
    (layout) => {
      if (!layout?.topic?.name) {
        return;
      }
      setPreviewSegmentKey(layout.segmentKey);
      setPreviewTopicName(layout.topic.name);
      if (typeof setHoveredTopic === "function") {
        setHoveredTopic(layout.topic);
      }
    },
    [setHoveredTopic],
  );

  const handleOverlayEnter = useCallback(
    (layout) => {
      if (!layout?.topic?.name) {
        return;
      }
      if (hoverLeaveTimeoutRef.current) {
        window.clearTimeout(hoverLeaveTimeoutRef.current);
        hoverLeaveTimeoutRef.current = 0;
      }
      if (hoverEnterTimeoutRef.current) {
        window.clearTimeout(hoverEnterTimeoutRef.current);
      }
      hoverEnterTimeoutRef.current = window.setTimeout(() => {
        hoverEnterTimeoutRef.current = 0;
        commitPreviewState(layout);
      }, HOVER_INTENT_ENTER_MS);
    },
    [commitPreviewState],
  );

  const handleOverlayLeave = useCallback(() => {
    if (hoverEnterTimeoutRef.current) {
      window.clearTimeout(hoverEnterTimeoutRef.current);
      hoverEnterTimeoutRef.current = 0;
    }
    if (hoverLeaveTimeoutRef.current) {
      window.clearTimeout(hoverLeaveTimeoutRef.current);
    }
    hoverLeaveTimeoutRef.current = window.setTimeout(() => {
      hoverLeaveTimeoutRef.current = 0;
      setPreviewSegmentKey(null);
      setPreviewTopicName(null);
      if (typeof setHoveredTopic === "function") {
        setHoveredTopic(null);
      }
    }, HOVER_INTENT_LEAVE_MS);
  }, [setHoveredTopic]);

  useEffect(() => clearHoverTimers, [clearHoverTimers]);

  const hideOverlayForSegment = useCallback(
    (layout) => {
      if (!layout) {
        return;
      }
      clearHoverTimers();
      setActiveSegmentKey(layout.segmentKey);
      setPreviewSegmentKey(layout.segmentKey);
      setPreviewTopicName(layout.name);
      setRevealedSegmentKeys((currentValue) => {
        if (currentValue.has(layout.segmentKey)) {
          return currentValue;
        }
        const nextValue = new Set(currentValue);
        nextValue.add(layout.segmentKey);
        return nextValue;
      });
      if (typeof setHoveredTopic === "function") {
        setHoveredTopic(layout.topic);
      }
    },
    [clearHoverTimers, setHoveredTopic],
  );

  const restoreOverlayForSegment = useCallback(
    (layout) => {
      if (!layout) {
        return;
      }
      clearHoverTimers();
      setActiveSegmentKey(layout.segmentKey);
      setPreviewSegmentKey(layout.segmentKey);
      setPreviewTopicName(layout.name);
      setRevealedSegmentKeys((currentValue) => {
        if (!currentValue.has(layout.segmentKey)) {
          return currentValue;
        }
        const nextValue = new Set(currentValue);
        nextValue.delete(layout.segmentKey);
        return nextValue;
      });
      if (typeof setHoveredTopic === "function") {
        setHoveredTopic(layout.topic);
      }
    },
    [clearHoverTimers, setHoveredTopic],
  );

  useEffect(() => {
    if (!previewSegmentKey && !previewTopicName) {
      return undefined;
    }

    const handlePointerDownOutside = (event) => {
      const scrollRoot = articleScrollRef.current;
      if (
        scrollRoot instanceof HTMLElement &&
        event.target instanceof Node &&
        scrollRoot.contains(event.target)
      ) {
        return;
      }
      handleOverlayLeave();
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        handleOverlayLeave();
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDownOutside,
        true,
      );
      document.removeEventListener("keydown", handleEscape);
    };
  }, [handleOverlayLeave, previewSegmentKey, previewTopicName]);

  const handleArticleClickCapture = useCallback(
    (event) => {
      if (
        revealedLayouts.length === 0 ||
        !(event.target instanceof HTMLElement)
      ) {
        return;
      }

      const token = event.target.closest(`.${REVEALED_TOKEN_CLASSNAME}`);
      if (!(token instanceof HTMLElement)) {
        return;
      }

      const sentenceIndexRaw = token.getAttribute("data-sentence-index");
      const charStartRaw = token.getAttribute("data-char-start");
      const charEndRaw = token.getAttribute("data-char-end");
      const sentenceIndex = Number.isFinite(Number(sentenceIndexRaw))
        ? Number(sentenceIndexRaw)
        : null;
      const charStart = Number.isFinite(Number(charStartRaw))
        ? Number(charStartRaw)
        : null;
      const charEnd = Number.isFinite(Number(charEndRaw))
        ? Number(charEndRaw)
        : null;
      const preferredSegmentKey = previewSegmentKey || activeSegmentKey;
      const matchingLayout =
        revealedLayouts.find(
          (layout) =>
            layout.segmentKey === preferredSegmentKey &&
            isEventInsideLayout(layout, sentenceIndex, charStart, charEnd),
        ) ||
        revealedLayouts.find((layout) =>
          isEventInsideLayout(layout, sentenceIndex, charStart, charEnd),
        );

      if (!matchingLayout) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      restoreOverlayForSegment(matchingLayout);
    },
    [
      activeSegmentKey,
      previewSegmentKey,
      restoreOverlayForSegment,
      revealedLayouts,
    ],
  );

  const articleContent = article?.sentences?.length ? (
    <TextDisplay
      sentences={article.sentences}
      selectedTopics={selectedTopics}
      hoveredTopic={hoveredTopic}
      readTopics={readTopics}
      articleTopics={article.topics}
      articleIndex={0}
      topicSummaries={article.topic_summaries}
      paragraphMap={article.paragraph_map}
      rawHtml={article.raw_html}
      onToggleRead={onToggleRead}
      onToggleTopic={onToggleTopic}
      onNavigateTopic={onNavigateTopic}
      onShowSentences={onShowSentences}
      onOpenTopicSummaries={onOpenTopicSummaries}
      tooltipEnabled={tooltipEnabled}
      submissionId={submissionId}
      coloredHighlightMode={coloredHighlightMode}
      activeInsightSentenceIndices={mergedInsightSentenceIndices}
      activeInsightRanges={mergedInsightRanges}
      coloredTopicNames={coloredTopicNames}
      interactiveSentenceIndices={revealedSentenceIndices}
      interactiveHighlightRanges={revealedCharRanges}
      interactiveHighlightClassName={REVEALED_TOKEN_CLASSNAME}
      dimmedSentenceIndices={readRevealedSentenceIndices}
      dimmedHighlightRanges={readRevealedCharRanges}
      dimmedHighlightClassName={REVEALED_READ_TOKEN_CLASSNAME}
    />
  ) : (
    <div
      className="topic-article-view__raw-html"
      dangerouslySetInnerHTML={{ __html: rawHtmlBody }}
    />
  );

  return (
    <FullScreenGraph title="Topics + Article" onClose={onClose}>
      <div className="topic-article-view">
        {noteAccentStyleSheet ? <style>{noteAccentStyleSheet}</style> : null}
        <div className="topic-article-view__body">
          <div
            ref={articleScrollRef}
            className="topic-article-view__scroll"
            role="region"
            aria-label="Synced article scroll area"
          >
            <div className="topic-article-view__canvas">
              <div className="topic-article-view__left-rail">
                {visibleTopLevelLabels.length > 0 ? (
                  <CurrentAreaLabel topLevelLabels={visibleTopLevelLabels} />
                ) : null}
                {summaryCardLayout && activeSummaryLayout ? (
                  <TopicSummaryCard
                    layout={summaryCardLayout}
                    topic={activeSummaryTopic}
                    readTopics={readTopics}
                    isRevealed={revealedSegmentKeys.has(
                      activeSummaryLayout.segmentKey,
                    )}
                    onToggleRead={onToggleRead}
                    onToggleReveal={() => {
                      if (
                        revealedSegmentKeys.has(activeSummaryLayout.segmentKey)
                      ) {
                        restoreOverlayForSegment(activeSummaryLayout);
                        return;
                      }
                      hideOverlayForSegment(activeSummaryLayout);
                    }}
                  />
                ) : null}
              </div>
              <div className="topic-article-view__article-column">
                <div
                  ref={articleRootRef}
                  className="topic-article-view__article"
                  onClickCapture={handleArticleClickCapture}
                >
                  {articleContent}
                  <div
                    className="topic-article-view__overlay-layer"
                    aria-label="Topic overlays"
                  >
                    {overlayLayouts.map((layout) => (
                      <TopicOverlayCard
                        key={layout.segmentKey}
                        layout={layout}
                        topicTags={topicTagCloudMap.get(layout.name) || []}
                        isActive={layout.segmentKey === activeSegmentKey}
                        isHighlighted={layout.segmentKey === previewSegmentKey}
                        isRevealed={layout.isRevealed}
                        isRead={isTopicSelectionRead(
                          buildNormalizedTopicSelection(layout),
                          readTopics,
                        )}
                        onEnter={handleOverlayEnter}
                        onLeave={handleOverlayLeave}
                        onReveal={hideOverlayForSegment}
                      />
                    ))}
                  </div>
                  {noteLayouts.map((layout) => (
                    <RangeAccentDot
                      key={layout.segmentKey}
                      segmentKey={layout.segmentKey}
                      topicName={layout.name}
                      top={layout.bracketTop}
                      height={layout.bracketHeight}
                    />
                  ))}
                </div>
              </div>
            </div>
            {noteLayouts.length === 0 ? (
              <p className="topic-article-view__empty">
                No aligned topics available.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </FullScreenGraph>
  );
}

/**
 * @typedef {Object} TopicOverlayCardProps
 * @property {TopicOverlayLayout} layout
 * @property {Array<{ label: string, count: number, score: number, sizeClass: string }>} topicTags
 * @property {boolean} isActive
 * @property {boolean} isHighlighted
 * @property {boolean} isRevealed
 * @property {boolean} isRead
 * @property {(layout: TopicMeasuredLayout) => void} onEnter
 * @property {() => void} onLeave
 * @property {(layout: TopicMeasuredLayout) => void} onReveal
 */

/** @param {TopicOverlayCardProps} props */
const TopicOverlayCard = React.memo(function TopicOverlayCard({
  layout,
  topicTags,
  isActive,
  isHighlighted,
  isRevealed,
  isRead,
  onEnter,
  onLeave,
  onReveal,
}) {
  const handleEnter = useCallback(() => onEnter(layout), [layout, onEnter]);
  const handleClick = useCallback(() => onReveal(layout), [layout, onReveal]);
  const handleBlur = useCallback(
    (event) => {
      const nextFocusedElement = event.relatedTarget;
      if (
        nextFocusedElement instanceof Node &&
        event.currentTarget.contains(nextFocusedElement)
      ) {
        return;
      }
      onLeave();
    },
    [onLeave],
  );
  const cssClass = getTopicCSSClass(layout.name);

  return (
    <div
      className={`topic-article-view__overlay-anchor ${cssClass}${isActive ? " topic-article-view__overlay-anchor--active" : ""}${isHighlighted ? " topic-article-view__overlay-anchor--highlighted" : ""}${isRevealed ? " topic-article-view__overlay-anchor--revealed" : ""}${isRead ? " topic-article-view__overlay-anchor--read" : ""}`}
      style={{
        "--topic-overlay-top": `${layout.stackedTop}px`,
        "--topic-overlay-height": `${layout.stackedHeight}px`,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={onLeave}
      onFocus={handleEnter}
      onBlur={handleBlur}
    >
      <button
        type="button"
        className={`topic-article-view__topic-note ${cssClass}${isActive ? " topic-article-view__topic-note--active" : ""}${isHighlighted ? " topic-article-view__topic-note--highlighted" : ""}`}
        data-topic-name={layout.name}
        data-topic-segment-key={layout.segmentKey}
        aria-current={isActive ? "true" : undefined}
        onClick={handleClick}
      >
        <span className="topic-article-view__topic-note-main">
          <span className="topic-article-view__topic-name">
            {layout.noteTitleLines.map((line, index) => (
              <span
                key={`${layout.name}-${index}-${line}`}
                className="topic-article-view__topic-name-line"
              >
                {line}
              </span>
            ))}
          </span>
        </span>{" "}
        {topicTags.length > 0 ? (
          <span
            className="topic-article-view__topic-tags"
            aria-label={`Key tags for ${layout.name}`}
          >
            {topicTags.map((tag) => (
              <span
                key={`${layout.name}-${tag.label}`}
                className={`topic-article-view__topic-tag topic-article-view__topic-tag--${tag.sizeClass}`}
                title={`${tag.label} (${tag.count})`}
              >
                {tag.label}
              </span>
            ))}
          </span>
        ) : null}
      </button>
    </div>
  );
});

/**
 * @typedef {Object} TopicSummaryCardProps
 * @property {TopicSummaryCardLayout} layout
 * @property {Object|null} topic
 * @property {Set<string> | string[]} readTopics
 * @property {boolean} isRevealed
 * @property {(topic: Object) => void} onToggleRead
 * @property {() => void} onToggleReveal
 */

/** @param {TopicSummaryCardProps} props */
const TopicSummaryCard = React.memo(function TopicSummaryCard({
  layout,
  topic,
  readTopics,
  isRevealed,
  onToggleRead,
  onToggleReveal,
}) {
  const normalizedTopic = useMemo(() => {
    if (!topic) {
      return null;
    }
    return buildNormalizedTopicSelection({
      name: layout.name,
      topic,
    });
  }, [layout.name, topic]);
  const isRead = normalizedTopic
    ? isTopicSelectionRead(normalizedTopic, readTopics)
    : false;
  const handleToggleRead = useCallback(() => {
    if (!normalizedTopic) {
      return;
    }

    const ranges = normalizedTopic?.ranges;
    if (Array.isArray(ranges) && ranges.length > 1 && !isRead) {
      const ok = window.confirm(
        `"${normalizedTopic.name}" has ${ranges.length} separate ranges. Some may not be visible on screen. Mark as read?`,
      );
      if (!ok) {
        return;
      }
    }

    onToggleRead(normalizedTopic);
  }, [isRead, normalizedTopic, onToggleRead]);

  return (
    <aside
      className="topic-article-view__summary-card"
      style={{ "--topic-summary-offset": `${layout.summaryTop}px` }}
      aria-label={`Summary for ${layout.name}`}
    >
      <div className="topic-article-view__summary-card-topic">
        {layout.name}
      </div>
      <p className="topic-article-view__summary-card-body">{layout.summary}</p>
      <div className="topic-article-view__summary-card-actions">
        <button
          type="button"
          className="topic-article-view__summary-action"
          onClick={onToggleReveal}
        >
          {isRevealed ? "Show topic" : "Show source"}
        </button>
        <button
          type="button"
          className={`topic-article-view__read-btn${isRead ? " topic-article-view__read-btn--active" : ""}`}
          onClick={handleToggleRead}
        >
          {isRead ? "Mark unread" : "Mark as read"}
        </button>
      </div>
    </aside>
  );
});

/**
 * @typedef {Object} CurrentAreaLabelProps
 * @property {string[]} topLevelLabels
 */

/** @param {CurrentAreaLabelProps} props */
const CurrentAreaLabel = React.memo(function CurrentAreaLabel({
  topLevelLabels,
}) {
  return (
    <div
      className="topic-article-view__current-area"
      aria-label="Current topic areas"
    >
      {topLevelLabels.map((topLevelLabel) => (
        <span
          key={topLevelLabel}
          className="topic-article-view__current-area-label"
        >
          {topLevelLabel}
        </span>
      ))}
    </div>
  );
});

/** @param {{ segmentKey: string, topicName: string, top: number, height: number }} props */
const RangeAccentDot = React.memo(function RangeAccentDot({
  segmentKey,
  topicName,
  top,
  height,
}) {
  return (
    <div
      className={`topic-article-view__range-accent ${getTopicCSSClass(topicName)}`}
      style={{
        "--topic-range-top": `${top}px`,
        "--topic-range-height": `${height}px`,
      }}
      data-topic-segment-key={segmentKey}
      data-topic-name={topicName}
      aria-hidden="true"
    >
      <div className="topic-article-view__range-accent-top" />
      <div className="topic-article-view__range-accent-bottom" />
    </div>
  );
});

export default React.memo(TopicArticleFullscreenView);
