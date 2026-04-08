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
 * @property {number} bracketTop
 * @property {number} bracketHeight
 * @property {string[]} pathSegments
 * @property {string} topLevelLabel
 * @property {string[]} noteTitleLines
 * @property {Object} topic
 */

/**
 * @typedef {TopicMeasuredLayout & {
 *   noteTop: number,
 *   noteHeight: number,
 * }} TopicVisibleNoteLayout
 */

/**
 * @typedef {{
 *   segmentKey: string,
 *   name: string,
 *   summary: string,
 *   summaryTop: number,
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

const NOTE_CARD_ESTIMATED_HEIGHT = 84;
const NOTE_MIN_GAP = 12;
const NOTE_VIEWPORT_PADDING = 8;
const NOTE_CARD_BASE_HEIGHT = 58;
const NOTE_CARD_LINE_HEIGHT = 18;
const NOTE_CARD_MAX_TITLE_LINES = 3;
const SUMMARY_CARD_VIEWPORT_PADDING = 18;
const SUMMARY_CARD_TOP_CLEARANCE = 72;

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
    NOTE_CARD_ESTIMATED_HEIGHT,
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
  const rangeSegments = buildSentenceRangeSegments(topic?.ranges);
  if (rangeSegments.length > 0) {
    return rangeSegments;
  }

  return buildConsecutiveSentenceSegments(topic?.sentences).map((segment) => ({
    ...segment,
    startCharIndex: null,
    endCharIndex: null,
  }));
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
 * @param {number} startSentenceIndex
 * @param {number} endSentenceIndex
 * @returns {string}
 */
function formatSentenceRangeLabel(startSentenceIndex, endSentenceIndex) {
  const startLabel = startSentenceIndex + 1;
  const endLabel = endSentenceIndex + 1;
  return startLabel === endLabel
    ? `Sentence ${startLabel}`
    : `Sentences ${startLabel}-${endLabel}`;
}

/**
 * @param {HTMLElement|null} root
 * @param {number} sentenceIndex
 * @returns {HTMLElement|null}
 */
function getSentenceNode(root, sentenceIndex) {
  if (!(root instanceof HTMLElement)) {
    return null;
  }

  return (
    root.querySelector(
      `#sentence-0-${sentenceIndex}, [data-article-index="0"][data-sentence-index="${sentenceIndex}"]`,
    ) || document.getElementById(`sentence-0-${sentenceIndex}`)
  );
}

/**
 * @param {HTMLElement|null} root
 * @param {number|null} charIndex
 * @returns {HTMLElement|null}
 */
function getCharNode(root, charIndex) {
  if (!(root instanceof HTMLElement) || !Number.isFinite(charIndex)) {
    return null;
  }

  const exactNode = root.querySelector(
    `[data-article-index="0"][data-char-start="${charIndex}"]`,
  );
  if (exactNode instanceof HTMLElement) {
    return exactNode;
  }

  const candidates = Array.from(
    root.querySelectorAll('[data-article-index="0"][data-char-start]'),
  )
    .map((node) => ({
      node,
      start: Number(node.getAttribute("data-char-start")),
    }))
    .filter((entry) => Number.isFinite(entry.start))
    .sort((left, right) => left.start - right.start);

  const firstAfter = candidates.find((entry) => entry.start >= charIndex);
  if (firstAfter?.node instanceof HTMLElement) {
    return firstAfter.node;
  }

  return candidates[candidates.length - 1]?.node || null;
}

/**
 * @param {HTMLElement|null} articleRoot
 * @param {TopicTimelineItem} item
 * @returns {{startNode: HTMLElement | null, endNode: HTMLElement | null}}
 */
function getTopicBoundaryNodes(articleRoot, item) {
  const startSentenceNode = getSentenceNode(
    articleRoot,
    item.startSentenceIndex,
  );
  const endSentenceNode = getSentenceNode(articleRoot, item.endSentenceIndex);
  if (startSentenceNode && endSentenceNode) {
    return { startNode: startSentenceNode, endNode: endSentenceNode };
  }

  return {
    startNode: getCharNode(articleRoot, item.startCharIndex),
    endNode: getCharNode(articleRoot, item.endCharIndex),
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
 * @param {TopicMeasuredLayout[]} layouts
 * @param {number} scrollTop
 * @param {number} viewportHeight
 * @param {string|null} activeSegmentKey
 * @param {number} [mountBuffer] - Extra pixels beyond the viewport to keep cards mounted (hysteresis)
 * @returns {TopicVisibleNoteLayout[]}
 */
function buildVisibleTopicNoteLayouts(
  layouts,
  scrollTop,
  viewportHeight,
  activeSegmentKey,
  mountBuffer = 0,
) {
  if (layouts.length === 0 || viewportHeight <= 0) {
    return [];
  }

  const viewportTop = scrollTop - mountBuffer;
  const viewportBottom = scrollTop + viewportHeight + mountBuffer;
  const maxVisibleNotes = Math.max(
    1,
    Math.floor(
      (viewportHeight - NOTE_VIEWPORT_PADDING * 2 + NOTE_MIN_GAP) /
        (NOTE_CARD_ESTIMATED_HEIGHT + NOTE_MIN_GAP),
    ),
  );
  const visibleCandidates = layouts.filter((layout) => {
    const bracketBottom = layout.bracketTop + layout.bracketHeight;
    return bracketBottom > viewportTop && layout.bracketTop < viewportBottom;
  });

  if (visibleCandidates.length === 0) {
    return [];
  }

  const sortedVisibleCandidates = [...visibleCandidates].sort((left, right) => {
    if (left.bracketTop !== right.bracketTop) {
      return left.bracketTop - right.bracketTop;
    }
    if (left.startSentenceIndex !== right.startSentenceIndex) {
      return left.startSentenceIndex - right.startSentenceIndex;
    }
    if (left.endSentenceIndex !== right.endSentenceIndex) {
      return left.endSentenceIndex - right.endSentenceIndex;
    }
    return left.segmentKey.localeCompare(right.segmentKey);
  });

  const limitedCandidates =
    sortedVisibleCandidates.length <= maxVisibleNotes
      ? sortedVisibleCandidates
      : (() => {
          const focusIndex = Math.max(
            0,
            sortedVisibleCandidates.findIndex(
              (layout) => layout.segmentKey === activeSegmentKey,
            ),
          );
          const startIndex = Math.min(
            Math.max(0, focusIndex - Math.floor(maxVisibleNotes / 2)),
            sortedVisibleCandidates.length - maxVisibleNotes,
          );
          return sortedVisibleCandidates.slice(
            startIndex,
            startIndex + maxVisibleNotes,
          );
        })();

  // Position clamping always uses the real viewport boundaries (without buffer)
  // so that cards don't get pushed to off-screen positions.
  const realViewportTop = scrollTop;
  const realViewportBottom = scrollTop + viewportHeight;
  const topEdge = realViewportTop + NOTE_VIEWPORT_PADDING;
  const noteHeights = limitedCandidates.map((layout) =>
    estimateTopicNoteHeight(layout.noteTitleLines),
  );
  const maxNoteHeight = Math.max(...noteHeights);
  const bottomEdge = realViewportBottom - NOTE_VIEWPORT_PADDING - maxNoteHeight;
  const forwardTops = [];
  limitedCandidates.forEach((layout, index) => {
    const naturalTop = layout.bracketTop;
    const clampedTop = Math.min(
      Math.max(naturalTop, topEdge),
      Math.max(topEdge, bottomEdge),
    );
    if (index === 0) {
      forwardTops.push(clampedTop);
      return;
    }
    forwardTops.push(
      Math.max(
        clampedTop,
        forwardTops[index - 1] + noteHeights[index - 1] + NOTE_MIN_GAP,
      ),
    );
  });

  const positionedTops = new Array(forwardTops.length).fill(topEdge);
  let nextTop = Math.max(topEdge, bottomEdge);
  for (let index = forwardTops.length - 1; index >= 0; index -= 1) {
    positionedTops[index] = Math.max(
      topEdge,
      Math.min(forwardTops[index], nextTop),
    );
    nextTop = positionedTops[index] - noteHeights[index] - NOTE_MIN_GAP;
  }

  return limitedCandidates.map((layout, index) => ({
    ...layout,
    noteTop: positionedTops[index],
    noteHeight: noteHeights[index],
  }));
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

  return {
    segmentKey: layout.segmentKey,
    name: layout.name,
    summary: trimmedSummary,
    summaryTop,
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
  const articleRangeAccentRefs = useRef({});
  const noteAnchorRefs = useRef({});
  const animationFrameRef = useRef(0);
  const [activeSegmentKey, setActiveSegmentKey] = useState(
    topicTimelineItems[0]?.segmentKey || null,
  );
  const [noteLayouts, setNoteLayouts] = useState([]);
  // Controls which TopicNoteCard components are mounted; updated only when the
  // visible card set changes (not on every scroll pixel).
  const [mountedLayouts, setMountedLayouts] = useState([]);
  const [previewTopicName, setPreviewTopicName] = useState(null);
  const [previewSegmentKey, setPreviewSegmentKey] = useState(null);
  const [pinnedTopicName, setPinnedTopicName] = useState(null);
  const [pinnedSegmentKey, setPinnedSegmentKey] = useState(null);
  const [visibleTopLevelLabels, setVisibleTopLevelLabels] = useState([]);
  const [summaryCardLayout, setSummaryCardLayout] = useState(null);

  // Refs that mirror state for use inside rAF callbacks without stale closures.
  // Updated synchronously during render so they are always current by the time
  // any pending animation frame fires.
  const noteLayoutsRef = useRef(noteLayouts);
  const activeSegmentKeyRef = useRef(activeSegmentKey);
  const prevVisibleSetRef = useRef("");
  const visibleTopLevelLabelsRef = useRef(visibleTopLevelLabels);
  // Cached joined key for visibleTopLevelLabels to avoid re-joining on every rAF frame.
  const visibleTopLevelLabelsKeyRef = useRef("");
  const summaryCardRef = useRef(null);
  const summaryCardLayoutRef = useRef(summaryCardLayout);
  // Tracks the debounce timer used to remove the --scrolling CSS class.
  const scrollingClassTimerRef = useRef(0);
  noteLayoutsRef.current = noteLayouts;
  activeSegmentKeyRef.current = activeSegmentKey;
  visibleTopLevelLabelsRef.current = visibleTopLevelLabels;
  summaryCardLayoutRef.current = summaryCardLayout;

  const effectiveHoveredTopic = useMemo(() => {
    const hoveredTopicName =
      previewTopicName || pinnedTopicName || hoveredTopic?.name || null;
    if (!hoveredTopicName) {
      return null;
    }

    return (
      topicTimelineItems.find((item) => item.name === hoveredTopicName)
        ?.topic ||
      hoveredTopic || { name: hoveredTopicName }
    );
  }, [hoveredTopic, pinnedTopicName, previewTopicName, topicTimelineItems]);

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
  const activeSummaryLayout = useMemo(() => {
    const preferredSegmentKey = previewSegmentKey || pinnedSegmentKey;
    const preferredTopicName = previewTopicName || pinnedTopicName || null;

    if (!preferredSegmentKey && !preferredTopicName) {
      return null;
    }

    if (preferredSegmentKey) {
      const matchingSegment = noteLayouts.find(
        (layout) => layout.segmentKey === preferredSegmentKey,
      );
      if (matchingSegment) {
        return matchingSegment;
      }
    }

    return (
      noteLayouts.find(
        (layout) =>
          layout.name === preferredTopicName &&
          layout.segmentKey === activeSegmentKey,
      ) ||
      noteLayouts.find((layout) => layout.name === preferredTopicName) ||
      null
    );
  }, [
    activeSegmentKey,
    noteLayouts,
    pinnedSegmentKey,
    pinnedTopicName,
    previewSegmentKey,
    previewTopicName,
  ]);
  const activeSummary = useMemo(() => {
    if (!activeSummaryLayout) {
      return "";
    }
    const summary = topicSummaryMap[activeSummaryLayout.name];
    return typeof summary === "string" ? summary.trim() : "";
  }, [activeSummaryLayout, topicSummaryMap]);

  // Stable callbacks for ref assignment — avoids creating new closures each
  // render which would otherwise cause React to teardown/re-attach DOM refs.
  const handleNoteAnchorRef = useCallback((segmentKey, node) => {
    noteAnchorRefs.current[segmentKey] = node;
  }, []);

  const handleRangeAccentRef = useCallback((segmentKey, node) => {
    articleRangeAccentRefs.current[segmentKey] = node;
  }, []);

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
    const container = articleScrollRef.current;
    if (!(container instanceof HTMLElement)) {
      return undefined;
    }

    const SCROLL_CLASS = "topic-article-view__scroll--scrolling";
    const MOUNT_BUFFER = 40;

    const scheduleSync = () => {
      if (animationFrameRef.current) {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(animationFrameRef.current);
        } else {
          window.clearTimeout(animationFrameRef.current);
        }
      }

      // Mark the container as actively scrolling so CSS transitions are
      // suppressed — cards track the viewport live without visual lag.
      container.classList.add(SCROLL_CLASS);
      clearTimeout(scrollingClassTimerRef.current);
      scrollingClassTimerRef.current = setTimeout(() => {
        container.classList.remove(SCROLL_CLASS);
      }, 150);

      const run = () => {
        animationFrameRef.current = 0;
        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;

        // Compute visible layouts once per frame (pure math — no DOM reads).
        // mountBuffer keeps cards mounted a bit beyond the viewport edges to
        // reduce mount/unmount churn at boundaries.
        const visible = buildVisibleTopicNoteLayouts(
          noteLayoutsRef.current,
          scrollTop,
          viewportHeight,
          activeSegmentKeyRef.current,
          MOUNT_BUFFER,
        );
        const nextVisibleTopLevelLabels = buildVisibleTopLevelLabels(
          noteLayoutsRef.current,
          scrollTop,
          viewportHeight,
        );
        const nextSummaryCardLayout = buildTopicSummaryCardLayout(
          activeSummaryLayout,
          activeSummary,
          scrollTop,
          viewportHeight,
        );

        // Write positions directly to DOM refs, bypassing the React render
        // cycle entirely.  This keeps scroll at 60 fps without re-renders.
        for (let i = 0; i < visible.length; i += 1) {
          const layout = visible[i];
          const anchor = noteAnchorRefs.current[layout.segmentKey];
          if (anchor instanceof HTMLElement) {
            anchor.style.setProperty("--topic-note-top", `${layout.noteTop}px`);
            anchor.style.setProperty(
              "--topic-note-height",
              `${layout.noteHeight}px`,
            );
          }
          const accent = articleRangeAccentRefs.current[layout.segmentKey];
          if (accent instanceof HTMLElement) {
            accent.style.setProperty(
              "--topic-range-top",
              `${layout.bracketTop}px`,
            );
            accent.style.setProperty(
              "--topic-range-height",
              `${layout.bracketHeight}px`,
            );
          }
        }
        const summaryCardNode = summaryCardRef.current;
        if (summaryCardNode instanceof HTMLElement && nextSummaryCardLayout) {
          summaryCardNode.style.setProperty(
            "--topic-summary-top",
            `${nextSummaryCardLayout.summaryTop}px`,
          );
        }

        // Trigger a React re-render only when the mounted card *set* changes
        // (topics entering / leaving the viewport window).  For pure position
        // changes the direct DOM writes above are sufficient.
        const newSet = visible.map((layout) => layout.segmentKey).join("\0");
        if (newSet !== prevVisibleSetRef.current) {
          prevVisibleSetRef.current = newSet;
          setMountedLayouts(visible);
        }
        // Use cached key ref to avoid re-joining on every frame.
        const nextLabelsKey = nextVisibleTopLevelLabels.join("\0");
        if (nextLabelsKey !== visibleTopLevelLabelsKeyRef.current) {
          visibleTopLevelLabelsKeyRef.current = nextLabelsKey;
          setVisibleTopLevelLabels(nextVisibleTopLevelLabels);
        }
        const currentSummaryCardLayout = summaryCardLayoutRef.current;
        const isSameSummaryCardLayout =
          currentSummaryCardLayout?.segmentKey ===
            nextSummaryCardLayout?.segmentKey &&
          currentSummaryCardLayout?.summary === nextSummaryCardLayout?.summary;
        if (!isSameSummaryCardLayout) {
          setSummaryCardLayout(nextSummaryCardLayout);
        }

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
        scheduleSync();
      }, 150);
    };

    container.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", handleResize);
    measureLayouts();
    scheduleSync();

    return () => {
      clearTimeout(resizeTimeout);
      clearTimeout(scrollingClassTimerRef.current);
      container.classList.remove(SCROLL_CLASS);
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
  }, [
    activeSummary,
    activeSummaryLayout,
    measureLayouts,
    syncActiveTopicToViewport,
  ]);

  // After mountedLayouts changes (new cards mounted), write their initial CSS
  // custom-property positions to the freshly attached DOM nodes.  The rAF loop
  // keeps positions current from that point on, so we only need to seed the
  // values here — no need to recompute layouts from scratch.
  useEffect(() => {
    for (let i = 0; i < mountedLayouts.length; i += 1) {
      const layout = mountedLayouts[i];
      const anchor = noteAnchorRefs.current[layout.segmentKey];
      if (anchor instanceof HTMLElement) {
        anchor.style.setProperty("--topic-note-top", `${layout.noteTop}px`);
        anchor.style.setProperty(
          "--topic-note-height",
          `${layout.noteHeight}px`,
        );
      }
      const accent = articleRangeAccentRefs.current[layout.segmentKey];
      if (accent instanceof HTMLElement) {
        accent.style.setProperty("--topic-range-top", `${layout.bracketTop}px`);
        accent.style.setProperty(
          "--topic-range-height",
          `${layout.bracketHeight}px`,
        );
      }
    }
  }, [mountedLayouts]);

  useEffect(() => {
    return () => {
      if (typeof setHoveredTopic === "function") {
        setHoveredTopic(null);
      }
    };
  }, [setHoveredTopic]);

  const scrollToTopic = useCallback(
    (item) => {
      const container = articleScrollRef.current;
      const articleRoot = articleRootRef.current;
      if (!(container instanceof HTMLElement) || !item) {
        return;
      }

      setActiveSegmentKey(item.segmentKey);
      setPinnedTopicName(item.name);
      setPinnedSegmentKey(item.segmentKey);
      if (typeof setHoveredTopic === "function") {
        setHoveredTopic(item.topic);
      }

      const { startNode: sentenceElement } = getTopicBoundaryNodes(
        articleRoot,
        item,
      );
      if (!(sentenceElement instanceof HTMLElement)) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const targetRect = sentenceElement.getBoundingClientRect();
      const nextTop =
        container.scrollTop +
        (targetRect.top - containerRect.top) -
        container.clientHeight / 2 +
        targetRect.height / 2;

      if (typeof container.scrollTo === "function") {
        container.scrollTo({
          top: Math.max(0, nextTop),
          behavior: "smooth",
        });
      } else {
        container.scrollTop = Math.max(0, nextTop);
      }

      sentenceElement.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [setHoveredTopic],
  );

  const handleNoteEnter = useCallback(
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

  const handleNoteLeave = useCallback(() => {
    setPreviewSegmentKey(null);
    setPreviewTopicName(null);
    if (typeof setHoveredTopic === "function") {
      const nextTopic =
        topicTimelineItems.find((item) => item.segmentKey === pinnedSegmentKey)
          ?.topic ||
        topicTimelineItems.find((item) => item.name === pinnedTopicName)
          ?.topic ||
        null;
      setHoveredTopic(nextTopic);
    }
  }, [pinnedSegmentKey, pinnedTopicName, setHoveredTopic, topicTimelineItems]);

  const handleSummaryCardRef = useCallback((node) => {
    summaryCardRef.current = node;
  }, []);

  const articleContent = article?.sentences?.length ? (
    <TextDisplay
      sentences={article.sentences}
      selectedTopics={selectedTopics}
      hoveredTopic={effectiveHoveredTopic}
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
      activeInsightSentenceIndices={activeInsightSentenceIndices}
      activeInsightRanges={activeInsightRanges}
      coloredTopicNames={coloredTopicNames}
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
              {visibleTopLevelLabels.length > 0 ? (
                <CurrentAreaLabel topLevelLabels={visibleTopLevelLabels} />
              ) : null}
              {summaryCardLayout ? (
                <TopicSummaryCard
                  layout={summaryCardLayout}
                  onCardRef={handleSummaryCardRef}
                />
              ) : null}
              <div className="topic-article-view__article-column">
                <div
                  ref={articleRootRef}
                  className="topic-article-view__article"
                >
                  {articleContent}
                  {mountedLayouts.map((layout) => (
                    <RangeAccentDot
                      key={layout.segmentKey}
                      segmentKey={layout.segmentKey}
                      topicName={layout.name}
                      onRef={handleRangeAccentRef}
                    />
                  ))}
                </div>
              </div>

              <aside
                className="topic-article-view__notes-column"
                role="region"
                aria-label="Synced topics list"
              >
                {mountedLayouts.length > 0 ? (
                  mountedLayouts.map((layout) => (
                    <TopicNoteCard
                      key={layout.segmentKey}
                      layout={layout}
                      isActive={layout.segmentKey === activeSegmentKey}
                      isHighlighted={
                        layout.segmentKey === previewSegmentKey ||
                        layout.segmentKey === pinnedSegmentKey ||
                        (layout.name === previewTopicName &&
                          previewSegmentKey === null) ||
                        (layout.name === pinnedTopicName &&
                          pinnedSegmentKey === null)
                      }
                      readTopics={readTopics}
                      onToggleRead={onToggleRead}
                      onEnter={handleNoteEnter}
                      onLeave={handleNoteLeave}
                      onScrollTo={scrollToTopic}
                      onAnchorRef={handleNoteAnchorRef}
                    />
                  ))
                ) : noteLayouts.length === 0 ? (
                  <p className="topic-article-view__empty">
                    No aligned topics available.
                  </p>
                ) : null}
              </aside>
            </div>
          </div>
        </div>
      </div>
    </FullScreenGraph>
  );
}

/**
 * @typedef {Object} TopicNoteCardProps
 * @property {TopicVisibleNoteLayout} layout
 * @property {boolean} isActive
 * @property {boolean} isHighlighted
 * @property {Set<string> | string[]} readTopics
 * @property {(topic: Object) => void} onToggleRead
 * @property {(layout: TopicVisibleNoteLayout) => void} onEnter
 * @property {() => void} onLeave
 * @property {(layout: TopicVisibleNoteLayout) => void} onScrollTo
 * @property {(segmentKey: string, node: HTMLElement | null) => void} onAnchorRef
 */

/** @param {TopicNoteCardProps} props */
const TopicNoteCard = React.memo(function TopicNoteCard({
  layout,
  isActive,
  isHighlighted,
  readTopics,
  onToggleRead,
  onEnter,
  onLeave,
  onScrollTo,
  onAnchorRef,
}) {
  const setRef = useCallback(
    (node) => onAnchorRef(layout.segmentKey, node),
    [layout.segmentKey, onAnchorRef],
  );
  const handleEnter = useCallback(() => onEnter(layout), [layout, onEnter]);
  const handleClick = useCallback(
    () => onScrollTo(layout),
    [layout, onScrollTo],
  );
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
  const normalizedTopic = useMemo(() => {
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
  }, [layout.name, layout.topic]);
  const isRead = isTopicSelectionRead(normalizedTopic, readTopics);
  const handleToggleRead = useCallback(
    (event) => {
      event.stopPropagation();

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
    },
    [isRead, normalizedTopic, onToggleRead],
  );
  const cssClass = getTopicCSSClass(layout.name);

  return (
    <div
      ref={setRef}
      className={`topic-article-view__note-anchor ${cssClass}`}
      onMouseEnter={handleEnter}
      onMouseLeave={onLeave}
      onFocus={handleEnter}
      onBlur={handleBlur}
    >
      <div
        className={`topic-article-view__topic-note ${cssClass}${isActive ? " topic-article-view__topic-note--active" : ""}${isHighlighted ? " topic-article-view__topic-note--highlighted" : ""}`}
      >
        <button
          type="button"
          className="topic-article-view__topic-main-action"
          data-topic-name={layout.name}
          data-topic-segment-key={layout.segmentKey}
          aria-current={isActive ? "true" : undefined}
          aria-pressed={isHighlighted ? "true" : "false"}
          onPointerDown={handleEnter}
          onClick={handleClick}
        >
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
        </button>
        <div className="topic-article-view__topic-note-footer">
          <span className="topic-article-view__topic-range">
            {formatSentenceRangeLabel(
              layout.startSentenceIndex,
              layout.endSentenceIndex,
            )}
          </span>
          <button
            type="button"
            className={`topic-article-view__read-btn${isRead ? " topic-article-view__read-btn--active" : ""}`}
            onPointerDown={handleEnter}
            onClick={handleToggleRead}
            title={isRead ? "Mark topic as unread" : "Mark topic as read"}
          >
            {isRead ? "Mark unread" : "Mark as read"}
          </button>
        </div>
      </div>
    </div>
  );
});

/**
 * @typedef {Object} TopicSummaryCardProps
 * @property {TopicSummaryCardLayout} layout
 * @property {(node: HTMLElement | null) => void} onCardRef
 */

/** @param {TopicSummaryCardProps} props */
const TopicSummaryCard = React.memo(function TopicSummaryCard({
  layout,
  onCardRef,
}) {
  return (
    <aside
      ref={onCardRef}
      className="topic-article-view__summary-card"
      aria-label={`Summary for ${layout.name}`}
    >
      <div className="topic-article-view__summary-card-title">Summary</div>
      <p className="topic-article-view__summary-card-body">{layout.summary}</p>
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

/** @param {{ segmentKey: string, topicName: string, onRef: (segmentKey: string, node: HTMLElement | null) => void }} props */
const RangeAccentDot = React.memo(function RangeAccentDot({
  segmentKey,
  topicName,
  onRef,
}) {
  const setRef = useCallback(
    (node) => onRef(segmentKey, node),
    [onRef, segmentKey],
  );
  return (
    <div
      ref={setRef}
      className={`topic-article-view__range-accent ${getTopicCSSClass(topicName)}`}
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
