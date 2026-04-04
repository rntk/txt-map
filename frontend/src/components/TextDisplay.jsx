import React, {
  useMemo,
  useCallback,
  useRef,
  useContext,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { sanitizeHTML } from "../utils/sanitize";
import { buildHighlightedRawHtml } from "../utils/htmlHighlight";
import {
  getTopicHighlightColor,
  getTopicCSSClass,
} from "../utils/topicColorUtils";
import { useTooltip } from "../hooks/useTooltip";
import { HighlightContext } from "./shared/HighlightContext";
import HighlightedText from "./shared/HighlightedText";
import "../styles/text-reading.css";

// Tooltip positioning constants
const TOOLTIP_WIDTH = 260;
const TOOLTIP_HEIGHT_ESTIMATE = 100;
const TOOLTIP_VIEWPORT_MARGIN = 10;

/**
 * @typedef {Object} TextDisplayProps
 * @property {string[]} sentences
 * @property {Array} selectedTopics
 * @property {{ name: string }|null} hoveredTopic
 * @property {Set<string>|string[]} readTopics
 * @property {Array} articleTopics
 * @property {number} articleIndex
 * @property {Object|null} [paragraphMap]
 * @property {Object} [topicSummaries]
 * @property {(topic: Object, summary: string) => void} [onShowTopicSummary]
 * @property {string|null} [rawHtml]
 * @property {(topic: Object) => void} [onToggleRead]
 * @property {(topic: Object) => void} [onToggleTopic]
 * @property {(topic: Object, direction: 'prev'|'next'|'focus') => void} [onNavigateTopic]
 * @property {(topic: Object) => void} [onOpenTopicSummaries]
 * @property {boolean} [tooltipEnabled]
 * @property {string} [submissionId]
 * @property {(topic: Object) => void} [onShowSentences]
 * @property {string[]} [highlightWords] - Words to highlight in the text
 * @property {boolean} [coloredHighlightMode] - When true, all topics are highlighted with per-topic muted colors
 * @property {Array<number>} [activeInsightSentenceIndices]
 * @property {Array<{start: number, end: number}>} [activeInsightRanges]
 * @property {Set<string> | string[]} [coloredTopicNames]
 */

/**
 * @param {TextDisplayProps} props
 */
function TextDisplay({
  sentences,
  selectedTopics,
  hoveredTopic,
  readTopics,
  articleTopics,
  articleIndex,
  paragraphMap,
  topicSummaries,
  onShowTopicSummary,
  rawHtml,
  onToggleRead,
  onToggleTopic,
  onNavigateTopic,
  onOpenTopicSummaries,
  tooltipEnabled = true,
  submissionId,
  onShowSentences,
  highlightWords,
  coloredHighlightMode = false,
  activeInsightSentenceIndices = [],
  activeInsightRanges = [],
  coloredTopicNames = null,
}) {
  const safeSentences = useMemo(
    () => (Array.isArray(sentences) ? sentences : []),
    [sentences],
  );
  const safeSelectedTopics = useMemo(
    () => (Array.isArray(selectedTopics) ? selectedTopics : []),
    [selectedTopics],
  );
  const safeArticleTopics = useMemo(
    () => (Array.isArray(articleTopics) ? articleTopics : []),
    [articleTopics],
  );
  const readTopicsSet = useMemo(
    () => (readTopics instanceof Set ? readTopics : new Set(readTopics || [])),
    [readTopics],
  );
  const safeColoredTopicNames = useMemo(
    () =>
      coloredTopicNames instanceof Set
        ? coloredTopicNames
        : coloredTopicNames
          ? new Set(coloredTopicNames)
          : null,
    [coloredTopicNames],
  );
  const safeParagraphMap =
    paragraphMap && typeof paragraphMap === "object" ? paragraphMap : null;
  const activeInsightSentenceIndexSet = useMemo(
    () =>
      new Set(
        (Array.isArray(activeInsightSentenceIndices)
          ? activeInsightSentenceIndices
          : []
        )
          .filter((value) => Number.isInteger(value))
          .map((value) => value - 1),
      ),
    [activeInsightSentenceIndices],
  );
  const safeActiveInsightRanges = useMemo(
    () =>
      Array.isArray(activeInsightRanges)
        ? activeInsightRanges
            .map((range) => ({
              start: Number(range?.start),
              end: Number(range?.end),
            }))
            .filter(
              (range) =>
                Number.isFinite(range.start) &&
                Number.isFinite(range.end) &&
                range.end > range.start,
            )
        : [],
    [activeInsightRanges],
  );

  // Get highlight words from prop or context
  const contextHighlightWords = useContext(HighlightContext);
  const effectiveHighlightWords = useMemo(() => {
    if (Array.isArray(highlightWords) && highlightWords.length > 0) {
      return highlightWords;
    }
    if (
      Array.isArray(contextHighlightWords) &&
      contextHighlightWords.length > 0
    ) {
      return contextHighlightWords;
    }
    return null;
  }, [highlightWords, contextHighlightWords]);

  // Build character ranges from topic.ranges (in raw HTML string coordinates)
  const { highlightRanges, fadeRanges } = useMemo(() => {
    const highlights = [];
    const fades = [];

    safeArticleTopics.forEach((topic) => {
      const ranges = Array.isArray(topic.ranges) ? topic.ranges : [];
      if (ranges.length === 0) return;

      const isHighlighted =
        safeSelectedTopics.some((t) => t.name === topic.name) ||
        (hoveredTopic && hoveredTopic.name === topic.name);
      const isFaded = readTopicsSet.has(topic.name);

      ranges.forEach((range) => {
        const rangeStart = Number(range.start);
        const rangeEnd = Number(range.end);
        if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return;

        if (isHighlighted) {
          highlights.push({ start: rangeStart, end: rangeEnd });
        } else if (isFaded) {
          fades.push({ start: rangeStart, end: rangeEnd });
        }
      });
    });
    return { highlightRanges: highlights, fadeRanges: fades };
  }, [safeArticleTopics, safeSelectedTopics, hoveredTopic, readTopicsSet]);

  // Per-topic colored ranges for "Highlight All" mode (rawHtml path uses CSS classes)
  const coloredRanges = useMemo(() => {
    if (!coloredHighlightMode) return [];
    const ranges = [];
    safeArticleTopics.forEach((topic) => {
      if (safeColoredTopicNames && !safeColoredTopicNames.has(topic.name)) {
        return;
      }
      const cssClass = getTopicCSSClass(topic.name);
      (Array.isArray(topic.ranges) ? topic.ranges : []).forEach((range) => {
        const start = Number(range.start);
        const end = Number(range.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          ranges.push({ start, end, cssClass });
        }
      });
    });
    return ranges;
  }, [coloredHighlightMode, safeArticleTopics, safeColoredTopicNames]);

  // CSS stylesheet for topic highlight classes (used in rawHtml path)
  const topicStyleSheet = useMemo(() => {
    if (!coloredHighlightMode) return null;
    const seen = new Set();
    const lines = [];
    safeArticleTopics.forEach((topic) => {
      if (safeColoredTopicNames && !safeColoredTopicNames.has(topic.name)) {
        return;
      }
      const cssClass = getTopicCSSClass(topic.name);
      if (!seen.has(cssClass)) {
        seen.add(cssClass);
        lines.push(
          `.${cssClass} { background-color: ${getTopicHighlightColor(topic.name)}; }`,
        );
      }
    });
    return lines.join("\n");
  }, [coloredHighlightMode, safeArticleTopics, safeColoredTopicNames]);

  // Per-sentence color map for sentence/paragraph rendering in "Highlight All" mode
  const sentenceColorMap = useMemo(() => {
    if (!coloredHighlightMode) return null;
    const map = new Map();
    safeArticleTopics.forEach((topic) => {
      if (safeColoredTopicNames && !safeColoredTopicNames.has(topic.name)) {
        return;
      }
      const color = getTopicHighlightColor(topic.name);
      (Array.isArray(topic.sentences) ? topic.sentences : []).forEach((num) => {
        const idx = num - 1;
        if (!map.has(idx)) {
          map.set(idx, color);
        }
      });
    });
    return map;
  }, [coloredHighlightMode, safeArticleTopics, safeColoredTopicNames]);

  // Sentence-index-based sets for non-rawHtml fallback paths
  const fadedIndices = useMemo(() => {
    const set = new Set();
    readTopicsSet.forEach((topicName) => {
      const relatedTopic = safeArticleTopics.find((t) => t.name === topicName);
      if (relatedTopic) {
        relatedTopic.sentences.forEach((num) => set.add(num - 1));
      }
    });
    return set;
  }, [readTopicsSet, safeArticleTopics]);

  const highlightedIndices = useMemo(() => {
    const set = new Set();
    safeSelectedTopics.forEach((topic) => {
      const relatedTopic = safeArticleTopics.find((t) => t.name === topic.name);
      if (relatedTopic && relatedTopic.sentences) {
        relatedTopic.sentences.forEach((num) => set.add(num - 1));
      }
    });
    if (hoveredTopic) {
      const relatedTopic = safeArticleTopics.find(
        (t) => t.name === hoveredTopic.name,
      );
      if (relatedTopic && relatedTopic.sentences) {
        relatedTopic.sentences.forEach((num) => set.add(num - 1));
      }
    }
    activeInsightSentenceIndexSet.forEach((index) => set.add(index));
    return set;
  }, [
    safeSelectedTopics,
    hoveredTopic,
    safeArticleTopics,
    activeInsightSentenceIndexSet,
  ]);

  const effectiveHighlightRanges = useMemo(
    () => [...highlightRanges, ...safeActiveInsightRanges],
    [highlightRanges, safeActiveInsightRanges],
  );

  const highlightedRawHtml = useMemo(
    () =>
      buildHighlightedRawHtml(
        rawHtml,
        safeArticleTopics,
        articleIndex,
        effectiveHighlightRanges,
        fadeRanges,
        coloredRanges,
      ),
    [
      rawHtml,
      safeArticleTopics,
      articleIndex,
      effectiveHighlightRanges,
      fadeRanges,
      coloredRanges,
    ],
  );

  const sentenceToTopicsEnding = useMemo(() => {
    const map = new Map();
    safeArticleTopics.forEach((topic) => {
      if (topic.sentences && topic.sentences.length > 0) {
        const lastSentenceIndex = Math.max(...topic.sentences) - 1;
        if (!map.has(lastSentenceIndex)) {
          map.set(lastSentenceIndex, []);
        }
        map.get(lastSentenceIndex).push(topic);
      }
    });
    return map;
  }, [safeArticleTopics]);

  const getColoredSentenceStyle = useCallback(
    (index) => {
      if (!coloredHighlightMode || !sentenceColorMap?.has(index)) {
        return undefined;
      }

      return { "--topic-highlight-color": sentenceColorMap.get(index) };
    },
    [coloredHighlightMode, sentenceColorMap],
  );

  // --- Reverse mapping: char position -> topic(s) ---
  const charToTopics = useMemo(() => {
    // Sorted flat array of {start, end, topic}
    const entries = [];
    safeArticleTopics.forEach((topic) => {
      const ranges = Array.isArray(topic.ranges) ? topic.ranges : [];
      ranges.forEach((range) => {
        const s = Number(range.start);
        const e = Number(range.end);
        if (Number.isFinite(s) && Number.isFinite(e)) {
          entries.push({ start: s, end: e, topic });
        }
      });
    });
    entries.sort((a, b) => a.start - b.start);
    return entries;
  }, [safeArticleTopics]);

  // Reverse mapping: sentence index -> topic(s)
  const sentenceToTopicsMap = useMemo(() => {
    const map = new Map();
    safeArticleTopics.forEach((topic) => {
      const sents = Array.isArray(topic.sentences) ? topic.sentences : [];
      sents.forEach((num) => {
        const idx = num - 1;
        if (!map.has(idx)) map.set(idx, []);
        map.get(idx).push(topic);
      });
    });
    return map;
  }, [safeArticleTopics]);

  // --- Tooltip state ---
  const { tooltip, lastTargetRef, showTooltip, hideTooltip } =
    useTooltip(tooltipEnabled);
  const tooltipContainerRef = useRef(null);
  const textContentRef = useRef(null);

  const getTooltipPosition = useCallback((clientX, clientY) => {
    // Keep the tooltip close enough to the pointer so it feels anchored to the
    // current hover location even with the delayed show.
    let x = clientX - 10;
    let y = clientY - 10;

    const maxX = window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_VIEWPORT_MARGIN;
    const maxY =
      window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_VIEWPORT_MARGIN;

    x = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(x, maxX));
    y = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(y, maxY));

    return { x, y };
  }, []);

  const getHoverWord = useCallback((token, clientX, clientY) => {
    if (!token || !token.textContent) {
      return null;
    }

    if (token.classList.contains("word-token")) {
      const rawWord = token.textContent
        .trim()
        .replace(/[^a-zA-ZÀ-ÿ0-9\-']/g, "");
      return rawWord.length > 1 ? rawWord : null;
    }

    const normalizeWord = (value) => {
      const cleaned = value.replace(/[^a-zA-ZÀ-ÿ0-9\-']/g, "");
      return cleaned.length > 1 ? cleaned : null;
    };

    const fullText = token.textContent;
    const getTextOffsetWithinToken = (targetNode, localOffset) => {
      const walker = document.createTreeWalker(token, NodeFilter.SHOW_TEXT);
      let traversed = 0;
      let currentNode = walker.nextNode();

      while (currentNode) {
        const nodeText = currentNode.textContent || "";
        if (currentNode === targetNode) {
          return (
            traversed + Math.max(0, Math.min(localOffset, nodeText.length))
          );
        }
        traversed += nodeText.length;
        currentNode = walker.nextNode();
      }

      return null;
    };
    let offset = null;

    if (document.caretPositionFromPoint) {
      const caretPosition = document.caretPositionFromPoint(clientX, clientY);
      if (
        caretPosition?.offsetNode &&
        token.contains(caretPosition.offsetNode)
      ) {
        if (caretPosition.offsetNode.nodeType === Node.TEXT_NODE) {
          offset = getTextOffsetWithinToken(
            caretPosition.offsetNode,
            caretPosition.offset,
          );
        }
      }
    } else if (document.caretRangeFromPoint) {
      const caretRange = document.caretRangeFromPoint(clientX, clientY);
      if (
        caretRange?.startContainer &&
        token.contains(caretRange.startContainer)
      ) {
        if (caretRange.startContainer.nodeType === Node.TEXT_NODE) {
          offset = getTextOffsetWithinToken(
            caretRange.startContainer,
            caretRange.startOffset,
          );
        }
      }
    }

    if (offset === null) {
      const fallbackWord = fullText.trim().split(/\s+/).find(Boolean) || "";
      return normalizeWord(fallbackWord);
    }

    let start = offset;
    let end = offset;
    while (start > 0 && /[a-zA-ZÀ-ÿ0-9\-']/.test(fullText[start - 1])) {
      start -= 1;
    }
    while (end < fullText.length && /[a-zA-ZÀ-ÿ0-9\-']/.test(fullText[end])) {
      end += 1;
    }

    return normalizeWord(fullText.slice(start, end));
  }, []);

  const buildTooltipMeta = useCallback(
    (token, clientX, clientY) => {
      const hoverWord = getHoverWord(token, clientX, clientY);
      if (token.dataset.sentenceIndex !== undefined) {
        return {
          sentenceIdx: Number(token.dataset.sentenceIndex),
          totalSentences: safeSentences.length,
          word: hoverWord,
        };
      }

      return { word: hoverWord };
    },
    [getHoverWord, safeSentences.length],
  );

  // Handler for toggling read status from tooltip
  const handleToggleRead = useCallback(
    (topic) => {
      if (onToggleRead) {
        onToggleRead(topic);
      }
      hideTooltip();
    },
    [onToggleRead, hideTooltip],
  );

  // Find topics for a char range
  const findTopicsForChar = useCallback(
    (charStart, charEnd) => {
      const cs = Number(charStart);
      const ce = Number(charEnd);
      if (!Number.isFinite(cs) || !Number.isFinite(ce)) return [];
      return charToTopics
        .filter((e) => cs < e.end && ce > e.start)
        .map((e) => ({
          topic: e.topic,
          rangeCount: Array.isArray(e.topic.ranges) ? e.topic.ranges.length : 1,
        }));
    },
    [charToTopics],
  );

  // Find topics for a sentence index
  const findTopicsForSentence = useCallback(
    (sentenceIdx) => {
      const idx = Number(sentenceIdx);
      const topics = sentenceToTopicsMap.get(idx) || [];
      return topics.map((t) => ({
        topic: t,
        rangeCount: Array.isArray(t.ranges) ? t.ranges.length : 0,
      }));
    },
    [sentenceToTopicsMap],
  );

  // Click/tap event handler — tooltip is triggered on click, not hover
  const handleTextClick = useCallback(
    (e) => {
      if (!tooltipEnabled) return;

      const { x, y } = getTooltipPosition(e.clientX, e.clientY);

      // Check if user clicked on (or inside) a link
      const link = e.target.closest("a[href]");
      if (link) {
        e.preventDefault();
        // e.target may be a word-token span *inside* the link, so check it first;
        // fall back to searching upward from the link (e.g. link inside a sentence-token).
        const token =
          e.target.closest(".word-token, .sentence-token") ||
          link.closest(".word-token, .sentence-token");
        let matchedTopics = [];
        if (token) {
          if (
            token.dataset.charStart !== undefined &&
            token.dataset.charEnd !== undefined
          ) {
            matchedTopics = findTopicsForChar(
              token.dataset.charStart,
              token.dataset.charEnd,
            );
          } else if (token.dataset.sentenceIndex !== undefined) {
            matchedTopics = findTopicsForSentence(token.dataset.sentenceIndex);
          }
        }
        const meta = token
          ? {
              ...buildTooltipMeta(token, e.clientX, e.clientY),
              linkHref: link.href,
              linkText: link.textContent?.trim(),
            }
          : { linkHref: link.href, linkText: link.textContent?.trim() };
        lastTargetRef.current = link;
        showTooltip(matchedTopics, x, y, meta);
        return;
      }

      const token = e.target.closest(".word-token, .sentence-token");
      if (!token) {
        hideTooltip();
        return;
      }

      // Toggle: clicking the same token again hides the tooltip
      if (token === lastTargetRef.current && tooltip) {
        hideTooltip();
        return;
      }

      let matchedTopics = [];
      if (
        token.dataset.charStart !== undefined &&
        token.dataset.charEnd !== undefined
      ) {
        matchedTopics = findTopicsForChar(
          token.dataset.charStart,
          token.dataset.charEnd,
        );
      } else if (token.dataset.sentenceIndex !== undefined) {
        matchedTopics = findTopicsForSentence(token.dataset.sentenceIndex);
      }

      // Only show if there are topics to display
      if (matchedTopics.length === 0) {
        hideTooltip();
        return;
      }

      lastTargetRef.current = token;
      const meta = buildTooltipMeta(token, e.clientX, e.clientY);
      showTooltip(matchedTopics, x, y, meta);
    },
    [
      buildTooltipMeta,
      findTopicsForChar,
      findTopicsForSentence,
      getTooltipPosition,
      hideTooltip,
      lastTargetRef,
      showTooltip,
      tooltip,
      tooltipEnabled,
    ],
  );

  // Hide tooltip on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!tooltip) return;
      if (tooltipContainerRef.current?.contains(e.target)) return;
      if (textContentRef.current?.contains(e.target)) return;
      hideTooltip();
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") hideTooltip();
    };
    document.addEventListener("click", handleOutsideClick, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleOutsideClick, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hideTooltip, tooltip]);

  // Tooltip JSX - Use createPortal to move it to document.body
  const tooltipEl = tooltip
    ? createPortal(
        <div
          ref={tooltipContainerRef}
          className="text-topic-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.meta && tooltip.meta.sentenceIdx !== undefined && (
            <div className="text-topic-tooltip-meta">
              Sentence {tooltip.meta.sentenceIdx + 1} /{" "}
              {tooltip.meta.totalSentences}
            </div>
          )}
          {tooltip.topics.length > 0 &&
            tooltip.topics.map(({ topic, rangeCount }, i) => {
              const isRead = readTopicsSet.has(topic.name);
              const isSelected = safeSelectedTopics.some(
                (t) => t.name === topic.name,
              );
              return (
                <div
                  key={topic.name}
                  className={`text-topic-tooltip-topic${i < tooltip.topics.length - 1 ? " text-topic-tooltip-topic--spaced" : ""}`}
                >
                  <div className="text-topic-tooltip-name">{topic.name}</div>
                  {rangeCount > 1 && (
                    <div className="text-topic-tooltip-warning">
                      This topic has {rangeCount} separate ranges. Some may not
                      be visible.
                    </div>
                  )}
                  <div className="text-topic-tooltip-actions">
                    {onToggleTopic && (
                      <label className="text-topic-tooltip-toggle">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleTopic(topic)}
                          className="text-topic-tooltip-toggle-input"
                        />
                        Highlight
                      </label>
                    )}
                    <button
                      className="text-topic-tooltip-btn"
                      onClick={() => handleToggleRead(topic)}
                    >
                      {isRead ? "Mark Unread" : "Mark Read"}
                    </button>
                    {onNavigateTopic && (
                      <>
                        <button
                          className="text-topic-tooltip-btn"
                          onClick={() => onNavigateTopic(topic, "prev")}
                          title="Scroll to previous occurrence"
                        >
                          ‹ Prev
                        </button>
                        <button
                          className="text-topic-tooltip-btn"
                          onClick={() => onNavigateTopic(topic, "next")}
                          title="Scroll to next occurrence"
                        >
                          Next ›
                        </button>
                      </>
                    )}
                    {onShowSentences && (
                      <button
                        className="text-topic-tooltip-btn"
                        onClick={() => {
                          onShowSentences(topic);
                          hideTooltip();
                        }}
                        title="Open sentences modal for this topic"
                      >
                        View sentences
                      </button>
                    )}
                    {onOpenTopicSummaries && (
                      <button
                        className="text-topic-tooltip-btn"
                        onClick={() => {
                          onOpenTopicSummaries(topic);
                          hideTooltip();
                        }}
                        title="Open topic summaries for this topic"
                      >
                        Topic Summaries
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          {tooltip.meta?.linkHref && (
            <div className="text-topic-tooltip-footer">
              <a
                className="text-topic-tooltip-btn text-topic-tooltip-link"
                href={tooltip.meta.linkHref}
                onClick={hideTooltip}
                rel="noopener noreferrer"
              >
                Go to: {tooltip.meta.linkText || tooltip.meta.linkHref}
              </a>
            </div>
          )}
          {submissionId && tooltip.meta?.word && (
            <div className="text-topic-tooltip-footer">
              <a
                className="text-topic-tooltip-btn text-topic-tooltip-link"
                href={`/page/word/${submissionId}/${encodeURIComponent(tooltip.meta.word)}`}
              >
                Explore "{tooltip.meta.word}"
              </a>
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  const paragraphs = useMemo(() => {
    if (!safeParagraphMap || Object.keys(safeParagraphMap).length === 0)
      return null;
    const groups = new Map();

    safeSentences.forEach((sentence, idx) => {
      const sentenceParagraphIdx =
        safeParagraphMap[idx] !== undefined ? safeParagraphMap[idx] : 0;
      if (!groups.has(sentenceParagraphIdx)) {
        groups.set(sentenceParagraphIdx, []);
      }
      groups.get(sentenceParagraphIdx).push({ text: sentence, index: idx });
    });

    const sortedParagraphIndices = Array.from(groups.keys()).sort(
      (a, b) => a - b,
    );
    return sortedParagraphIndices.map((paraIdx) => groups.get(paraIdx));
  }, [safeParagraphMap, safeSentences]);

  if (highlightedRawHtml) {
    return (
      <div className="text-display reading-article">
        {topicStyleSheet && <style>{topicStyleSheet}</style>}
        <div
          ref={textContentRef}
          className="text-content reading-article__content"
          dangerouslySetInnerHTML={{ __html: highlightedRawHtml }}
          onClick={handleTextClick}
        />
        {tooltipEl}
      </div>
    );
  }

  if (paragraphs) {
    return (
      <div className="text-display reading-article">
        <div
          ref={textContentRef}
          className="text-content reading-article__content"
          onClick={handleTextClick}
        >
          {paragraphs.map((para, paraIdx) => (
            <p
              key={paraIdx}
              className="article-paragraph reading-article__paragraph"
            >
              {para.map(({ text, index }) => (
                <React.Fragment key={index}>
                  <span
                    id={`sentence-${articleIndex}-${index}`}
                    data-article-index={articleIndex}
                    data-sentence-index={index}
                    className={`sentence-token reading-article__sentence${!coloredHighlightMode && highlightedIndices.has(index) ? " highlighted" : fadedIndices.has(index) ? " faded" : ""}${coloredHighlightMode && sentenceColorMap?.has(index) ? " reading-article__sentence--colored" : ""}${activeInsightSentenceIndexSet.has(index) ? " reading-article__sentence--insight-active" : ""}`}
                    style={getColoredSentenceStyle(index)}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHTML(text) + " ",
                    }}
                  />
                  {sentenceToTopicsEnding.has(index) &&
                    topicSummaries &&
                    onShowTopicSummary &&
                    sentenceToTopicsEnding.get(index).map((topic, tIdx) => (
                      <button
                        key={`${index}-${tIdx}`}
                        className="topic-summary-link"
                        onClick={() =>
                          onShowTopicSummary(topic, topicSummaries[topic.name])
                        }
                        title={`View summary for topic: ${topic.name}`}
                      >
                        [📝 {topic.name}]
                      </button>
                    ))}
                </React.Fragment>
              ))}
            </p>
          ))}
        </div>
        {tooltipEl}
      </div>
    );
  }

  return (
    <div className="text-display reading-article">
      <div
        ref={textContentRef}
        className="text-content reading-article__content"
        onClick={handleTextClick}
      >
        <p className="article-text">
          {safeSentences.map((sentence, index) => (
            <React.Fragment key={index}>
              <span
                id={`sentence-${articleIndex}-${index}`}
                data-article-index={articleIndex}
                data-sentence-index={index}
                className={`sentence-token reading-article__sentence${!coloredHighlightMode && highlightedIndices.has(index) ? " highlighted" : fadedIndices.has(index) ? " faded" : ""}${coloredHighlightMode && sentenceColorMap?.has(index) ? " reading-article__sentence--colored" : ""}${activeInsightSentenceIndexSet.has(index) ? " reading-article__sentence--insight-active" : ""}`}
                style={getColoredSentenceStyle(index)}
              >
                {effectiveHighlightWords ? (
                  <HighlightedText
                    text={sentence}
                    words={effectiveHighlightWords}
                  />
                ) : (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHTML(sentence) + " ",
                    }}
                  />
                )}
              </span>
              {sentenceToTopicsEnding.has(index) &&
                topicSummaries &&
                onShowTopicSummary &&
                sentenceToTopicsEnding.get(index).map((topic, tIdx) => (
                  <button
                    key={`${index}-${tIdx}`}
                    className="topic-summary-link"
                    onClick={() =>
                      onShowTopicSummary(topic, topicSummaries[topic.name])
                    }
                    title={`View summary for topic: ${topic.name}`}
                  >
                    [📝 {topic.name}]
                  </button>
                ))}
            </React.Fragment>
          ))}
        </p>
      </div>
      {tooltipEl}
    </div>
  );
}

export default React.memo(TextDisplay);
