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

/**
 * @typedef {Object} TopicTimelineItem
 * @property {string} name
 * @property {number} startSentenceIndex
 * @property {number} endSentenceIndex
 * @property {number|null} startCharIndex
 * @property {number|null} endCharIndex
 * @property {Object} topic
 */

/**
 * @typedef {Object} TopicMeasuredLayout
 * @property {string} name
 * @property {number} startSentenceIndex
 * @property {number} endSentenceIndex
 * @property {number} bracketTop
 * @property {number} bracketHeight
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

      return {
        name: topic.name,
        startSentenceIndex: bounds.startSentenceIndex,
        endSentenceIndex: bounds.endSentenceIndex,
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

  return items
    .map((item) => {
      const { startNode, endNode } = getTopicBoundaryNodes(articleRoot, item);

      if (
        !(startNode instanceof HTMLElement) ||
        !(endNode instanceof HTMLElement)
      ) {
        return null;
      }

      const startRect = startNode.getBoundingClientRect();
      const endRect = endNode.getBoundingClientRect();
      const bracketTop =
        startRect.top - articleRect.top + articleRoot.scrollTop;
      const bracketBottom =
        endRect.bottom - articleRect.top + articleRoot.scrollTop;
      const bracketHeight = Math.max(24, bracketBottom - bracketTop);

      return {
        name: item.name,
        startSentenceIndex: item.startSentenceIndex,
        endSentenceIndex: item.endSentenceIndex,
        bracketTop,
        bracketHeight,
        topic: item.topic,
      };
    })
    .filter(Boolean);
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
  const bottomEdge =
    viewportBottom - NOTE_VIEWPORT_PADDING - NOTE_CARD_ESTIMATED_HEIGHT;
  const forwardTops = [];
  limitedCandidates.forEach((layout, index) => {
    const bracketCenter = layout.bracketTop + layout.bracketHeight / 2;
    const naturalTop = bracketCenter - NOTE_CARD_ESTIMATED_HEIGHT / 2;
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
        forwardTops[index - 1] + NOTE_CARD_ESTIMATED_HEIGHT + NOTE_MIN_GAP,
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
    nextTop = positionedTops[index] - NOTE_CARD_ESTIMATED_HEIGHT - NOTE_MIN_GAP;
  }

  return limitedCandidates.map((layout, index) => ({
    ...layout,
    noteTop: positionedTops[index],
    noteHeight: NOTE_CARD_ESTIMATED_HEIGHT,
  }));
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
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollTop: 0,
    viewportHeight: 0,
  });
  const [previewTopicName, setPreviewTopicName] = useState(null);
  const [pinnedTopicName, setPinnedTopicName] = useState(null);
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
  const visibleNoteLayouts = useMemo(
    () =>
      buildVisibleTopicNoteLayouts(
        noteLayouts,
        scrollMetrics.scrollTop,
        scrollMetrics.viewportHeight,
        activeTopicName,
      ),
    [activeTopicName, noteLayouts, scrollMetrics],
  );
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

  const syncScrollMetrics = useCallback(() => {
    const container = articleScrollRef.current;
    if (!(container instanceof HTMLElement)) {
      return;
    }

    setScrollMetrics((previousMetrics) => {
      const nextMetrics = {
        scrollTop: container.scrollTop,
        viewportHeight: container.clientHeight,
      };
      return previousMetrics.scrollTop === nextMetrics.scrollTop &&
        previousMetrics.viewportHeight === nextMetrics.viewportHeight
        ? previousMetrics
        : nextMetrics;
    });
  }, []);

  const syncActiveTopicToViewport = useCallback(() => {
    const container = articleScrollRef.current;
    if (!(container instanceof HTMLElement)) {
      return;
    }

    if (noteLayouts.length === 0) {
      return;
    }

    const probeOffset =
      container.scrollTop +
      Math.min(84, Math.max(40, container.clientHeight / 4));
    const activeItem =
      noteLayouts.find(
        (layout) =>
          probeOffset >= layout.bracketTop &&
          probeOffset <= layout.bracketTop + layout.bracketHeight,
      ) ||
      noteLayouts.find((layout) => layout.bracketTop >= probeOffset) ||
      noteLayouts[noteLayouts.length - 1];
    if (activeItem?.name) {
      setActiveTopicName(activeItem.name);
    }
  }, [noteLayouts]);

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
    visibleNoteLayouts.forEach((layout) => {
      const noteAnchor = noteAnchorRefs.current[layout.name];
      if (noteAnchor instanceof HTMLElement) {
        noteAnchor.style.setProperty("--topic-note-top", `${layout.noteTop}px`);
      }

      const articleRangeAccent = articleRangeAccentRefs.current[layout.name];
      if (articleRangeAccent instanceof HTMLElement) {
        articleRangeAccent.style.setProperty(
          "--topic-range-top",
          `${layout.bracketTop}px`,
        );
        articleRangeAccent.style.setProperty(
          "--topic-range-height",
          `${layout.bracketHeight}px`,
        );
      }
    });
  }, [visibleNoteLayouts]);

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

      animationFrameRef.current =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame(() => {
              syncScrollMetrics();
              syncActiveTopicToViewport();
            })
          : window.setTimeout(() => {
              syncScrollMetrics();
              syncActiveTopicToViewport();
            }, 0);
    };

    const handleResize = () => {
      measureLayouts();
      syncScrollMetrics();
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
  }, [measureLayouts, syncActiveTopicToViewport, syncScrollMetrics]);

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

  useEffect(() => {
    return () => {
      if (typeof setHoveredTopic === "function") {
        setHoveredTopic(null);
      }
    };
  }, [setHoveredTopic]);

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
      dangerouslySetInnerHTML={{
        __html: (() => {
          const rawHtml = article?.raw_html || "";
          const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          return bodyMatch ? bodyMatch[1] : rawHtml;
        })(),
      }}
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
              <div className="topic-article-view__article-column">
                <div
                  ref={articleRootRef}
                  className="topic-article-view__article"
                >
                  {articleContent}
                  {visibleNoteLayouts.map((layout) => (
                    <div
                      key={`${layout.name}-range-accent`}
                      ref={(node) => {
                        articleRangeAccentRefs.current[layout.name] = node;
                      }}
                      className={`topic-article-view__range-accent ${getTopicCSSClass(layout.name)}`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              </div>

              <aside
                className="topic-article-view__notes-column"
                role="region"
                aria-label="Synced topics list"
              >
                {visibleNoteLayouts.length > 0 ? (
                  visibleNoteLayouts.map((layout) => {
                    const isActive = layout.name === activeTopicName;
                    const isHighlighted =
                      layout.name === previewTopicName ||
                      layout.name === pinnedTopicName;
                    return (
                      <div
                        key={layout.name}
                        ref={(node) => {
                          noteAnchorRefs.current[layout.name] = node;
                        }}
                        className={`topic-article-view__note-anchor ${getTopicCSSClass(layout.name)}`}
                      >
                        <button
                          type="button"
                          className={`topic-article-view__topic-note ${getTopicCSSClass(layout.name)}${isActive ? " topic-article-view__topic-note--active" : ""}${isHighlighted ? " topic-article-view__topic-note--highlighted" : ""}`}
                          data-topic-name={layout.name}
                          aria-current={isActive ? "true" : undefined}
                          aria-pressed={isHighlighted ? "true" : "false"}
                          onMouseEnter={() => handleNoteEnter(layout.topic)}
                          onMouseLeave={handleNoteLeave}
                          onFocus={() => handleNoteEnter(layout.topic)}
                          onBlur={handleNoteLeave}
                          onPointerDown={() => handleNoteEnter(layout.topic)}
                          onClick={() => scrollToTopic(layout)}
                        >
                          <span className="topic-article-view__topic-name">
                            {layout.name}
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
                  })
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

export default React.memo(TopicArticleFullscreenView);
