import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ArticleProvider, useArticle } from "../contexts/ArticleContext";
import TopicHierarchyView from "./TopicHierarchyView";
import { getTopicAccentColor } from "../utils/topicColorUtils";
import "./TopicHierarchyView.css";

function pathSegments(path) {
  if (!path) return [];
  return path
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
}

function TopicHierarchyPageContent() {
  const { submission, loading, error, safeTopics, articles } = useArticle();

  const [selectedPath, setSelectedPath] = useState(null);
  const [hoveredPath, setHoveredPath] = useState(null);

  const isCollapsed = Boolean(selectedPath);

  const handleSelectPath = useCallback((path) => {
    setSelectedPath((prev) => (prev === path ? null : path));
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

  return (
    <div className="topic-hierarchy-page">
      <div className="topic-hierarchy-page__header">
        <h2 className="topic-hierarchy-page__title">Topic Structure</h2>
        <span className="topic-hierarchy-page__hint">
          {isCollapsed
            ? "Click the collapsed bar to expand the hierarchy."
            : "Hover to highlight a path, click a topic to open it."}
        </span>
      </div>
      <div className="topic-hierarchy-page__body">
        <div
          className={`topic-hierarchy-page__viz${
            isCollapsed ? " topic-hierarchy-page__viz--collapsed" : ""
          }`}
        >
          {isCollapsed ? (
            <div
              className="topic-hierarchy-page__collapsed-strip"
              onClick={() => setSelectedPath(null)}
              title="Click to expand topic hierarchy"
            >
              {collapsedSegments.map((segment, idx) => {
                const partialPath = collapsedSegments.slice(0, idx + 1).join(">");
                return (
                  <div
                    key={partialPath}
                    className="topic-hierarchy-page__collapsed-label"
                    style={{ borderLeftColor: getTopicAccentColor(partialPath) }}
                  >
                    {segment}
                  </div>
                );
              })}
            </div>
          ) : (
            <TopicHierarchyView
              topics={safeTopics}
              selectedPath={selectedPath}
              hoveredPath={hoveredPath}
              onSelectPath={handleSelectPath}
              onHoverPath={handleHoverPath}
            />
          )}
        </div>
        {isCollapsed && (
          <div
            ref={articleRef}
            className={`topic-hierarchy-page__article${
              sentences.length === 0
                ? " topic-hierarchy-page__article--empty"
                : ""
            }`}
          >
            {sentences.length === 0 ? (
              <span>No article content available.</span>
            ) : (
              sentences.map((sentence, idx) => {
                const isHighlighted = highlightedSentenceSet.has(idx);
                return (
                  <span
                    key={idx}
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
                    }`}
                  >
                    {sentence}{" "}
                  </span>
                );
              })
            )}
          </div>
        )}
      </div>
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
