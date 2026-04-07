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

/**
 * @typedef {Object} TopicTimelineItem
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
 * @param {Object} topic
 * @returns {{startSentenceIndex: number, endSentenceIndex: number} | null}
 */
function getTopicSentenceBounds(topic) {
  const rangeBounds = (Array.isArray(topic?.ranges) ? topic.ranges : [])
    .map((range) => ({
      start: Number(range?.sentence_start) - 1,
      end: Number(range?.sentence_end) - 1,
    }))
    .filter(
      (range) =>
        Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start >= 0 &&
        range.end >= range.start,
    );

  if (rangeBounds.length > 0) {
    return {
      startSentenceIndex: Math.min(...rangeBounds.map((range) => range.start)),
      endSentenceIndex: Math.max(...rangeBounds.map((range) => range.end)),
    };
  }

  const sentenceIndices = (
    Array.isArray(topic?.sentences) ? topic.sentences : []
  )
    .map((value) => Number(value) - 1)
    .filter((value) => Number.isInteger(value) && value >= 0);

  if (sentenceIndices.length === 0) {
    return null;
  }

  return {
    startSentenceIndex: Math.min(...sentenceIndices),
    endSentenceIndex: Math.max(...sentenceIndices),
  };
}

/**
 * @param {Array<Object>} topics
 * @returns {TopicTimelineItem[]}
 */
function buildTopicTimelineItems(topics) {
  return (Array.isArray(topics) ? topics : [])
    .map((topic) => {
      const bounds = getTopicSentenceBounds(topic);
      if (!topic?.name || !bounds) {
        return null;
      }

      const pathSegments = splitTopicPath(topic.name);
      const normalizedPathSegments =
        pathSegments.length > 0 ? pathSegments : [topic.name];

      return {
        name: topic.name,
        startSentenceIndex: bounds.startSentenceIndex,
        endSentenceIndex: bounds.endSentenceIndex,
        pathSegments: normalizedPathSegments,
        topLevelLabel: normalizedPathSegments[0] || topic.name,
        noteTitleLines:
          normalizedPathSegments.length > 1
            ? normalizedPathSegments.slice(1)
            : [topic.name],
        startCharIndex: (() => {
          const values = (Array.isArray(topic?.ranges) ? topic.ranges : [])
            .map((range) => Number(range?.start))
            .filter(Number.isFinite);
          return values.length > 0 ? Math.min(...values) : null;
        })(),
        endCharIndex: (() => {
          const values = (Array.isArray(topic?.ranges) ? topic.ranges : [])
            .map((range) => Number(range?.end))
            .filter(Number.isFinite);
          return values.length > 0 ? Math.max(...values) : null;
        })(),
        topic,
      };
    })
    .filter(Boolean)
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

  /** @type {TopicMeasuredLayout[]} */
  const results = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const { startNode, endNode } = getTopicBoundaryNodes(articleRoot, item);

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
 * @param {string|null} activeTopicName
 * @returns {TopicVisibleNoteLayout[]}
 */
function buildVisibleTopicNoteLayouts(
  layouts,
  scrollTop,
  viewportHeight,
  activeTopicName,
) {
  if (layouts.length === 0 || viewportHeight <= 0) {
    return [];
  }

  const viewportTop = scrollTop;
  const viewportBottom = scrollTop + viewportHeight;
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

  const limitedCandidates =
    visibleCandidates.length <= maxVisibleNotes
      ? visibleCandidates
      : (() => {
          const focusIndex = Math.max(
            0,
            visibleCandidates.findIndex(
              (layout) => layout.name === activeTopicName,
            ),
          );
          const startIndex = Math.min(
            Math.max(0, focusIndex - Math.floor(maxVisibleNotes / 2)),
            visibleCandidates.length - maxVisibleNotes,
          );
          return visibleCandidates.slice(
            startIndex,
            startIndex + maxVisibleNotes,
          );
        })();

  const topEdge = viewportTop + NOTE_VIEWPORT_PADDING;
  const noteHeights = limitedCandidates.map((layout) =>
    estimateTopicNoteHeight(layout.noteTitleLines),
  );
  const maxNoteHeight = Math.max(...noteHeights);
  const bottomEdge = viewportBottom - NOTE_VIEWPORT_PADDING - maxNoteHeight;
  const forwardTops = [];
  limitedCandidates.forEach((layout, index) => {
    const noteHeight = noteHeights[index];
    const bracketCenter = layout.bracketTop + layout.bracketHeight / 2;
    const naturalTop = bracketCenter - noteHeight / 2;
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
  const [activeTopicName, setActiveTopicName] = useState(
    topicTimelineItems[0]?.name || null,
  );
  const [noteLayouts, setNoteLayouts] = useState([]);
  // Controls which TopicNoteCard components are mounted; updated only when the
  // visible card set changes (not on every scroll pixel).
  const [mountedLayouts, setMountedLayouts] = useState([]);
  const [previewTopicName, setPreviewTopicName] = useState(null);
  const [pinnedTopicName, setPinnedTopicName] = useState(null);
  const [visibleTopLevelLabels, setVisibleTopLevelLabels] = useState([]);

  // Refs that mirror state for use inside rAF callbacks without stale closures.
  // Updated synchronously during render so they are always current by the time
  // any pending animation frame fires.
  const noteLayoutsRef = useRef(noteLayouts);
  const activeTopicNameRef = useRef(activeTopicName);
  const prevVisibleSetRef = useRef("");
  const visibleTopLevelLabelsRef = useRef(visibleTopLevelLabels);
  noteLayoutsRef.current = noteLayouts;
  activeTopicNameRef.current = activeTopicName;
  visibleTopLevelLabelsRef.current = visibleTopLevelLabels;

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

  // Stable callbacks for ref assignment — avoids creating new closures each
  // render which would otherwise cause React to teardown/re-attach DOM refs.
  const handleNoteAnchorRef = useCallback((name, node) => {
    noteAnchorRefs.current[name] = node;
  }, []);

  const handleRangeAccentRef = useCallback((name, node) => {
    articleRangeAccentRefs.current[name] = node;
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
    if (activeItem?.name) {
      setActiveTopicName((prev) =>
        prev === activeItem.name ? prev : activeItem.name,
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
    setActiveTopicName((currentValue) => {
      if (
        currentValue &&
        topicTimelineItems.some((item) => item.name === currentValue)
      ) {
        return currentValue;
      }
      return topicTimelineItems[0]?.name || null;
    });
  }, [topicTimelineItems]);

  useEffect(() => {
    const container = articleScrollRef.current;
    if (!(container instanceof HTMLElement)) {
      return undefined;
    }

    const scheduleSync = () => {
      if (animationFrameRef.current) {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(animationFrameRef.current);
        } else {
          window.clearTimeout(animationFrameRef.current);
        }
      }

      const run = () => {
        animationFrameRef.current = 0;
        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;

        // Compute visible layouts once per frame (pure math — no DOM reads).
        const visible = buildVisibleTopicNoteLayouts(
          noteLayoutsRef.current,
          scrollTop,
          viewportHeight,
          activeTopicNameRef.current,
        );
        const nextVisibleTopLevelLabels = buildVisibleTopLevelLabels(
          noteLayoutsRef.current,
          scrollTop,
          viewportHeight,
        );

        // Write positions directly to DOM refs, bypassing the React render
        // cycle entirely.  This keeps scroll at 60 fps without re-renders.
        for (let i = 0; i < visible.length; i += 1) {
          const layout = visible[i];
          const anchor = noteAnchorRefs.current[layout.name];
          if (anchor instanceof HTMLElement) {
            anchor.style.setProperty("--topic-note-top", `${layout.noteTop}px`);
            anchor.style.setProperty(
              "--topic-note-height",
              `${layout.noteHeight}px`,
            );
          }
          const accent = articleRangeAccentRefs.current[layout.name];
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

        // Trigger a React re-render only when the mounted card *set* changes
        // (topics entering / leaving the viewport window).  For pure position
        // changes the direct DOM writes above are sufficient.
        const newSet = visible.map((l) => l.name).join("\0");
        if (newSet !== prevVisibleSetRef.current) {
          prevVisibleSetRef.current = newSet;
          setMountedLayouts(visible);
        }
        if (
          nextVisibleTopLevelLabels.join("\0") !==
          visibleTopLevelLabelsRef.current.join("\0")
        ) {
          setVisibleTopLevelLabels(nextVisibleTopLevelLabels);
        }

        syncActiveTopicToViewport();
      };

      animationFrameRef.current =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame(run)
          : window.setTimeout(run, 0);
    };

    const handleResize = () => {
      measureLayouts();
      scheduleSync();
    };

    container.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
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

  // After mountedLayouts changes (new cards mounted), write their initial
  // positions.  The rAF loop will keep positions current from that point on.
  useEffect(() => {
    const container = articleScrollRef.current;
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const visible = buildVisibleTopicNoteLayouts(
      noteLayoutsRef.current,
      container.scrollTop,
      container.clientHeight,
      activeTopicNameRef.current,
    );
    for (let i = 0; i < visible.length; i += 1) {
      const layout = visible[i];
      const anchor = noteAnchorRefs.current[layout.name];
      if (anchor instanceof HTMLElement) {
        anchor.style.setProperty("--topic-note-top", `${layout.noteTop}px`);
        anchor.style.setProperty(
          "--topic-note-height",
          `${layout.noteHeight}px`,
        );
      }
      const accent = articleRangeAccentRefs.current[layout.name];
      if (accent instanceof HTMLElement) {
        accent.style.setProperty("--topic-range-top", `${layout.bracketTop}px`);
        accent.style.setProperty(
          "--topic-range-height",
          `${layout.bracketHeight}px`,
        );
      }
    }
    const nextVisibleTopLevelLabels = buildVisibleTopLevelLabels(
      noteLayoutsRef.current,
      container.scrollTop,
      container.clientHeight,
    );
    if (
      nextVisibleTopLevelLabels.join("\0") !==
      visibleTopLevelLabelsRef.current.join("\0")
    ) {
      setVisibleTopLevelLabels(nextVisibleTopLevelLabels);
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

      setActiveTopicName(item.name);
      setPinnedTopicName(item.name);
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
    (topic) => {
      if (!topic?.name) {
        return;
      }
      setPreviewTopicName(topic.name);
      if (typeof setHoveredTopic === "function") {
        setHoveredTopic(topic);
      }
    },
    [setHoveredTopic],
  );

  const handleNoteLeave = useCallback(() => {
    setPreviewTopicName(null);
    if (typeof setHoveredTopic === "function") {
      const nextTopic =
        topicTimelineItems.find((item) => item.name === pinnedTopicName)
          ?.topic || null;
      setHoveredTopic(nextTopic);
    }
  }, [pinnedTopicName, setHoveredTopic, topicTimelineItems]);

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
              <div className="topic-article-view__article-column">
                <div
                  ref={articleRootRef}
                  className="topic-article-view__article"
                >
                  {articleContent}
                  {mountedLayouts.map((layout) => (
                    <RangeAccentDot
                      key={layout.name}
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
                      key={layout.name}
                      layout={layout}
                      isActive={layout.name === activeTopicName}
                      isHighlighted={
                        layout.name === previewTopicName ||
                        layout.name === pinnedTopicName
                      }
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
 * @property {(topic: Object) => void} onEnter
 * @property {() => void} onLeave
 * @property {(layout: TopicVisibleNoteLayout) => void} onScrollTo
 * @property {(name: string, node: HTMLElement | null) => void} onAnchorRef
 */

/** @param {TopicNoteCardProps} props */
const TopicNoteCard = React.memo(function TopicNoteCard({
  layout,
  isActive,
  isHighlighted,
  onEnter,
  onLeave,
  onScrollTo,
  onAnchorRef,
}) {
  const setRef = useCallback(
    (node) => onAnchorRef(layout.name, node),
    [onAnchorRef, layout.name],
  );
  const handleEnter = useCallback(
    () => onEnter(layout.topic),
    [layout.topic, onEnter],
  );
  const handleClick = useCallback(
    () => onScrollTo(layout),
    [layout, onScrollTo],
  );
  const cssClass = getTopicCSSClass(layout.name);

  return (
    <div ref={setRef} className={`topic-article-view__note-anchor ${cssClass}`}>
      <button
        type="button"
        className={`topic-article-view__topic-note ${cssClass}${isActive ? " topic-article-view__topic-note--active" : ""}${isHighlighted ? " topic-article-view__topic-note--highlighted" : ""}`}
        data-topic-name={layout.name}
        aria-current={isActive ? "true" : undefined}
        aria-pressed={isHighlighted ? "true" : "false"}
        onMouseEnter={handleEnter}
        onMouseLeave={onLeave}
        onFocus={handleEnter}
        onBlur={onLeave}
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
        <span className="topic-article-view__topic-range">
          {formatSentenceRangeLabel(
            layout.startSentenceIndex,
            layout.endSentenceIndex,
          )}
        </span>
      </button>
    </div>
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

/** @param {{ topicName: string, onRef: (name: string, node: HTMLElement | null) => void }} props */
const RangeAccentDot = React.memo(function RangeAccentDot({
  topicName,
  onRef,
}) {
  const setRef = useCallback(
    (node) => onRef(topicName, node),
    [onRef, topicName],
  );
  return (
    <div
      ref={setRef}
      className={`topic-article-view__range-accent ${getTopicCSSClass(topicName)}`}
      aria-hidden="true"
    />
  );
});

export default React.memo(TopicArticleFullscreenView);
