import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { ArticleProvider, useArticle } from "../contexts/ArticleContext";
import TopicHierarchyView from "./TopicHierarchyView";
import TooltipTopicName from "./shared/TooltipTopicName";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import { useTooltip } from "../hooks/useTooltip";
import { getTopicAccentColor } from "../utils/topicColorUtils";
import { isTopicRead } from "../utils/topicReadUtils";
import "./TopicHierarchyView.css";

const TOOLTIP_WIDTH = 260;
const TOOLTIP_HEIGHT_ESTIMATE = 100;
const TOOLTIP_VIEWPORT_MARGIN = 10;

function extractWord(text, clientX, clientY, token) {
  if (!text) return null;
  const clean = (v) => {
    const c = v.replace(/[^a-zA-ZÀ-ÿ0-9\-']/g, "");
    return c.length > 1 ? c : null;
  };
  let offset = null;
  const fromPoint =
    document.caretPositionFromPoint?.(clientX, clientY) ||
    document.caretRangeFromPoint?.(clientX, clientY);
  if (fromPoint) {
    const node = fromPoint.offsetNode || fromPoint.startContainer;
    const localOffset =
      fromPoint.offset !== undefined ? fromPoint.offset : fromPoint.startOffset;
    if (node && token.contains(node) && node.nodeType === Node.TEXT_NODE) {
      const walker = document.createTreeWalker(token, NodeFilter.SHOW_TEXT);
      let traversed = 0;
      let current = walker.nextNode();
      while (current) {
        if (current === node) {
          offset =
            traversed +
            Math.max(0, Math.min(localOffset, current.textContent.length));
          break;
        }
        traversed += current.textContent.length;
        current = walker.nextNode();
      }
    }
  }
  if (offset === null) {
    return clean(text.trim().split(/\s+/).find(Boolean) || "");
  }
  let start = offset;
  let end = offset;
  while (start > 0 && /[a-zA-ZÀ-ÿ0-9\-']/.test(text[start - 1])) start -= 1;
  while (end < text.length && /[a-zA-ZÀ-ÿ0-9\-']/.test(text[end])) end += 1;
  return clean(text.slice(start, end));
}

function pathSegments(path) {
  if (!path) return [];
  return path
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
}

function TopicHierarchyPageContent() {
  const {
    submission,
    submissionId,
    loading,
    error,
    safeTopics,
    articles,
    readTopics,
    toggleRead,
  } = useArticle();

  const [selectedPath, setSelectedPath] = useState(null);
  const [hoveredPath, setHoveredPath] = useState(null);
  const [drilldownPath, setDrilldownPath] = useState(null);
  const [tooltipEnabled, setTooltipEnabled] = useState(true);
  const [summaryModalTopic, setSummaryModalTopic] = useState(null);

  const isArticleOpen = Boolean(selectedPath);
  const isDrillingDown = drilldownPath !== null;

  const handleSelectPath = useCallback((path) => {
    setDrilldownPath(null);
    setSelectedPath((prev) => (prev === path ? null : path));
  }, []);

  const handleDrilldownPath = useCallback((path) => {
    setSelectedPath(null);
    setDrilldownPath(path);
  }, []);

  const handleHoverPath = useCallback((path) => {
    setHoveredPath(path);
  }, []);

  const selectedTopic = useMemo(() => {
    if (!selectedPath) return null;
    return (safeTopics || []).find((t) => t.name === selectedPath) || null;
  }, [selectedPath, safeTopics]);

  const highlightedSentenceSet = useMemo(() => {
    if (!selectedTopic) return new Set();
    const indices = Array.isArray(selectedTopic.sentences)
      ? selectedTopic.sentences
      : [];
    return new Set(indices.map((i) => i - 1));
  }, [selectedTopic]);

  const article = articles?.[0];
  const sentences = useMemo(
    () => (Array.isArray(article?.sentences) ? article.sentences : []),
    [article],
  );

  const firstHighlightedIndex = useMemo(() => {
    if (!selectedTopic) return null;
    const indices = Array.isArray(selectedTopic.sentences)
      ? selectedTopic.sentences
      : [];
    if (indices.length === 0) return null;
    const min = Math.min(...indices);
    return Number.isFinite(min) ? min - 1 : null;
  }, [selectedTopic]);

  const articleRef = useRef(null);
  const sentenceRefs = useRef(new Map());
  const tooltipContainerRef = useRef(null);

  const { tooltip, lastTargetRef, showTooltip, hideTooltip } =
    useTooltip(tooltipEnabled);
  const tooltipRef = useRef(tooltip);
  tooltipRef.current = tooltip;

  const sentenceToTopicsMap = useMemo(() => {
    const map = new Map();
    (safeTopics || []).forEach((topic) => {
      const sents = Array.isArray(topic.sentences) ? topic.sentences : [];
      sents.forEach((num) => {
        const idx = num - 1;
        if (!map.has(idx)) map.set(idx, []);
        map.get(idx).push(topic);
      });
    });
    return map;
  }, [safeTopics]);

  const getTooltipPosition = useCallback((clientX, clientY) => {
    let x = clientX - 10;
    let y = clientY - 10;
    const maxX = window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_VIEWPORT_MARGIN;
    const maxY =
      window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_VIEWPORT_MARGIN;
    x = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(x, maxX));
    y = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(y, maxY));
    return { x, y };
  }, []);

  const handleSentenceClick = useCallback(
    (e) => {
      if (!tooltipEnabled) return;
      const token = e.target.closest("[data-sentence-index]");
      if (!token) {
        hideTooltip();
        return;
      }
      if (token === lastTargetRef.current && tooltipRef.current) {
        hideTooltip();
        return;
      }
      const sentenceIdx = Number(token.dataset.sentenceIndex);
      const topics = sentenceToTopicsMap.get(sentenceIdx) || [];
      if (topics.length === 0) {
        hideTooltip();
        return;
      }
      const matchedTopics = topics.map((t) => ({
        topic: t,
        rangeCount: Array.isArray(t.ranges) ? t.ranges.length : 0,
      }));
      const { x, y } = getTooltipPosition(e.clientX, e.clientY);
      const word = extractWord(
        token.textContent || "",
        e.clientX,
        e.clientY,
        token,
      );
      lastTargetRef.current = token;
      showTooltip(matchedTopics, x, y, {
        sentenceIdx,
        totalSentences: sentences.length,
        word,
      });
    },
    [
      getTooltipPosition,
      hideTooltip,
      lastTargetRef,
      sentenceToTopicsMap,
      sentences.length,
      showTooltip,
      tooltipEnabled,
    ],
  );

  useEffect(() => {
    const onOutside = (e) => {
      if (!tooltipRef.current) return;
      if (tooltipContainerRef.current?.contains(e.target)) return;
      if (articleRef.current?.contains(e.target)) return;
      hideTooltip();
    };
    const onKey = (e) => {
      if (e.key === "Escape") hideTooltip();
    };
    document.addEventListener("click", onOutside, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onOutside, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [hideTooltip]);

  useEffect(() => {
    if (!isArticleOpen) hideTooltip();
  }, [isArticleOpen, hideTooltip]);

  useEffect(() => {
    if (firstHighlightedIndex === null || !articleRef.current) return;
    const target = sentenceRefs.current.get(firstHighlightedIndex);
    if (!target) return;
    const container = articleRef.current;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop =
      container.scrollTop +
      (targetRect.top - containerRect.top) -
      container.clientHeight / 2 +
      targetRect.height / 2;
    container.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  }, [firstHighlightedIndex]);

  if (loading) {
    return (
      <div className="topic-hierarchy-page__state">Loading submission...</div>
    );
  }
  if (error) {
    return (
      <div className="topic-hierarchy-page__state">Error: {String(error)}</div>
    );
  }
  if (!submission) {
    return (
      <div className="topic-hierarchy-page__state">No submission data.</div>
    );
  }

  const collapsedSegments = pathSegments(selectedPath);
  const drilldownSegments = pathSegments(drilldownPath);
  const drilldownTitle =
    drilldownSegments.length === 0
      ? "All Topics"
      : drilldownSegments[drilldownSegments.length - 1];

  return (
    <div className="topic-hierarchy-page">
      <div className="topic-hierarchy-page__body">
        <div
          className={`topic-hierarchy-page__viz${
            isArticleOpen ? " topic-hierarchy-page__viz--collapsed" : ""
          }${isDrillingDown ? " topic-hierarchy-page__viz--drilldown" : ""}`}
        >
          {isArticleOpen ? (
            <div
              className="topic-hierarchy-page__collapsed-strip"
              onClick={() => setSelectedPath(null)}
              title="Click to expand topic hierarchy"
            >
              {collapsedSegments.map((segment, idx) => {
                const partialPath = collapsedSegments
                  .slice(0, idx + 1)
                  .join(">");
                return (
                  <div
                    key={partialPath}
                    className="topic-hierarchy-page__collapsed-label"
                    style={{
                      borderLeftColor: getTopicAccentColor(partialPath),
                    }}
                  >
                    {segment}
                  </div>
                );
              })}
            </div>
          ) : isDrillingDown ? (
            <div className="topic-hierarchy-page__drilldown">
              <div className="topic-hierarchy-page__drilldown-bar">
                <div className="topic-hierarchy-page__breadcrumbs">
                  <button
                    type="button"
                    className={`topic-hierarchy-page__breadcrumb${
                      drilldownSegments.length === 0
                        ? " topic-hierarchy-page__breadcrumb--current"
                        : ""
                    }`}
                    onClick={() => setDrilldownPath("")}
                  >
                    All Topics
                  </button>
                  {drilldownSegments.map((segment, index) => {
                    const partialPath = drilldownSegments
                      .slice(0, index + 1)
                      .join(">");
                    const isCurrent = index === drilldownSegments.length - 1;
                    return (
                      <button
                        key={partialPath}
                        type="button"
                        className={`topic-hierarchy-page__breadcrumb${
                          isCurrent
                            ? " topic-hierarchy-page__breadcrumb--current"
                            : ""
                        }`}
                        onClick={() => setDrilldownPath(partialPath)}
                      >
                        {segment}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="topic-hierarchy-page__overview-button"
                  onClick={() => setDrilldownPath(null)}
                >
                  Overview
                </button>
              </div>
              <div className="topic-hierarchy-page__drilldown-title">
                {drilldownTitle}
              </div>
              <TopicHierarchyView
                topics={safeTopics}
                selectedPath={selectedPath}
                hoveredPath={hoveredPath}
                scopePath={drilldownSegments}
                drilldownMode
                childLimit={0}
                rootLimit={0}
                onSelectPath={handleSelectPath}
                onHoverPath={handleHoverPath}
                onDrilldownPath={handleDrilldownPath}
              />
            </div>
          ) : (
            <TopicHierarchyView
              topics={safeTopics}
              selectedPath={selectedPath}
              hoveredPath={hoveredPath}
              onSelectPath={handleSelectPath}
              onHoverPath={handleHoverPath}
              onDrilldownPath={handleDrilldownPath}
            />
          )}
        </div>
        {isArticleOpen && (
          <div
            ref={articleRef}
            className={`topic-hierarchy-page__article${
              sentences.length === 0
                ? " topic-hierarchy-page__article--empty"
                : ""
            }`}
            onClick={handleSentenceClick}
          >
            {sentences.length === 0 ? (
              <span>No article content available.</span>
            ) : (
              sentences.map((sentence, idx) => {
                const isHighlighted = highlightedSentenceSet.has(idx);
                const hasTopics = sentenceToTopicsMap.has(idx);
                return (
                  <span
                    key={idx}
                    data-sentence-index={idx}
                    ref={(el) => {
                      if (el) {
                        sentenceRefs.current.set(idx, el);
                      } else {
                        sentenceRefs.current.delete(idx);
                      }
                    }}
                    className={`topic-hierarchy-page__sentence${
                      isHighlighted
                        ? " topic-hierarchy-page__sentence--highlight"
                        : ""
                    }${
                      tooltipEnabled && hasTopics
                        ? " topic-hierarchy-page__sentence--clickable"
                        : ""
                    }`}
                  >
                    {sentence}{" "}
                  </span>
                );
              })
            )}
          </div>
        )}
        {tooltip &&
          createPortal(
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
              {tooltip.topics.map(({ topic, rangeCount }, i) => {
                const isSelected = selectedPath === topic.name;
                const isRead = isTopicRead(topic.name, readTopics);
                return (
                  <div
                    key={topic.name}
                    className={`text-topic-tooltip-topic${
                      i < tooltip.topics.length - 1
                        ? " text-topic-tooltip-topic--spaced"
                        : ""
                    }`}
                  >
                    <div className="text-topic-tooltip-name">
                      <TooltipTopicName name={topic.name} />
                    </div>
                    {rangeCount > 1 && (
                      <div className="text-topic-tooltip-warning">
                        This topic has {rangeCount} separate ranges.
                      </div>
                    )}
                    <div className="text-topic-tooltip-actions">
                      <label className="text-topic-tooltip-toggle">
                        <input
                          type="checkbox"
                          className="text-topic-tooltip-toggle-input"
                          checked={isSelected}
                          onChange={() => handleSelectPath(topic.name)}
                        />
                        Highlight
                      </label>
                      {toggleRead && (
                        <button
                          className="text-topic-tooltip-btn"
                          onClick={() => {
                            toggleRead(topic);
                            hideTooltip();
                          }}
                        >
                          {isRead ? "Mark Unread" : "Mark Read"}
                        </button>
                      )}
                      <button
                        className="text-topic-tooltip-btn"
                        onClick={() => {
                          setSummaryModalTopic(topic);
                          hideTooltip();
                        }}
                        title="Open sentences modal for this topic"
                      >
                        View sentences
                      </button>
                      <button
                        className="text-topic-tooltip-btn"
                        onClick={() => {
                          handleDrilldownPath(topic.name);
                          hideTooltip();
                        }}
                        title="Drill down into this topic"
                      >
                        Drill down
                      </button>
                    </div>
                  </div>
                );
              })}
              {submissionId && tooltip.meta?.word && (
                <div className="text-topic-tooltip-footer">
                  <a
                    className="text-topic-tooltip-btn text-topic-tooltip-link"
                    href={`/page/word/${submissionId}/${encodeURIComponent(tooltip.meta.word)}`}
                  >
                    Explore &quot;{tooltip.meta.word}&quot;
                  </a>
                </div>
              )}
            </div>,
            document.body,
          )}
      </div>
      {summaryModalTopic && (
        <TopicSentencesModal
          topic={summaryModalTopic}
          sentences={sentences}
          onClose={() => setSummaryModalTopic(null)}
          onShowInArticle={(normalizedTopic) => {
            const name =
              normalizedTopic?.primaryTopicName ||
              normalizedTopic?.name ||
              normalizedTopic?.fullPath;
            if (name) {
              setDrilldownPath(null);
              setSelectedPath(name);
            }
            setSummaryModalTopic(null);
          }}
          markup={submission?.results?.markup}
          allTopics={safeTopics}
          readTopics={readTopics}
          onToggleRead={toggleRead}
        />
      )}
    </div>
  );
}

function TopicHierarchyPage() {
  const submissionId = window.location.pathname.split("/")[3];
  return (
    <ArticleProvider submissionId={submissionId}>
      <TopicHierarchyPageContent />
    </ArticleProvider>
  );
}

export default TopicHierarchyPage;
