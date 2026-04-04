import React, {
  useRef,
  useMemo,
  useCallback,
  useState,
  useEffect,
} from "react";
import ReadingOrderBar from "./ReadingOrderBar";
import TopicCard from "./TopicCard";
import DataExtractionTable from "./DataExtractionTable";
import ArticleTreeNav from "./ArticleTreeNav";
import KeyInsightsCard from "./KeyInsightsCard";
import {
  COMPONENT_REGISTRY,
  assembleChartProps,
  TOPIC_CHART_NAMES,
  DATA_CHART_NAMES,
} from "./componentRegistry";
import { buildExtractionKey } from "../../utils/extractionHighlight";

/**
 * ReadingGuideLayout — overview page driven by content annotations.
 * Shows actual article content (quoted sentences) with AI-generated
 * importance/priority metadata. No LLM-generated prose.
 *
 * All topics are always rendered (never hidden) — optional/skip topics
 * start folded so the user can always expand any content they want to read.
 */
export default function ReadingGuideLayout({
  submission,
  annotations,
  insights = [],
  safeTopics,
  safeSentences,
  submissionId,
  readTopics,
  toggleRead,
  topicSummaries = {},
}) {
  const cardRefs = useRef({});
  const elementToName = useRef(new Map());
  const results = submission?.results || {};
  const [hoveredExtractionKey, setHoveredExtractionKey] = useState(null);
  const [lockedExtractionKey, setLockedExtractionKey] = useState(null);
  const [activeTopic, setActiveTopic] = useState(null);
  const [highlightedTopic, setHighlightedTopic] = useState(null);
  const [topicChartIdx, setTopicChartIdx] = useState(() =>
    Math.floor(Math.random() * TOPIC_CHART_NAMES.length),
  );

  const {
    sentence_annotations: sentenceAnnotations = {},
    topic_annotations: topicAnnotations = {},
    data_extractions: dataExtractions = [],
    structural_suggestions: structuralSuggestions = {},
  } = annotations;

  const recommendedCharts = structuralSuggestions.recommended_charts || [];
  const readingOrder = useMemo(
    () =>
      Array.isArray(structuralSuggestions.reading_order)
        ? structuralSuggestions.reading_order
        : [],
    [structuralSuggestions.reading_order],
  );
  const extractionByKey = useMemo(() => {
    const entries = new Map();
    dataExtractions.forEach((extraction) => {
      const key = buildExtractionKey(extraction);
      if (key) {
        entries.set(key, extraction);
      }
    });
    return entries;
  }, [dataExtractions]);
  const activeExtractionKey = lockedExtractionKey || hoveredExtractionKey;
  const activeExtraction = activeExtractionKey
    ? extractionByKey.get(activeExtractionKey) || null
    : null;
  const lockedExtraction = lockedExtractionKey
    ? extractionByKey.get(lockedExtractionKey) || null
    : null;
  const extractionHints = useMemo(() => {
    const hints = {};

    dataExtractions.forEach((extraction) => {
      const extractionKey = buildExtractionKey(extraction);
      if (!extractionKey) return;

      const sourceSentences = Array.isArray(extraction.source_sentences)
        ? extraction.source_sentences
        : [];
      let hiddenCount = 0;

      safeTopics.forEach((topic) => {
        const topicName = topic?.name;
        const topicSentenceIndices = Array.isArray(topic?.sentences)
          ? topic.sentences
          : [];
        const matchingSourceIndices = sourceSentences.filter((idx) =>
          topicSentenceIndices.includes(idx),
        );
        if (matchingSourceIndices.length === 0) return;

        const topicAnnotation = topicAnnotations[topicName] || {};
        const recommendedSentences = Array.isArray(
          topicAnnotation.recommended_sentences,
        )
          ? topicAnnotation.recommended_sentences
          : [];
        const defaultVisibleSentences =
          recommendedSentences.length > 0
            ? recommendedSentences.slice(0, 5)
            : topicSentenceIndices
                .filter(
                  (idx) =>
                    sentenceAnnotations?.[String(idx)]?.importance === "high",
                )
                .slice(0, 5);

        hiddenCount += matchingSourceIndices.filter(
          (idx) => !defaultVisibleSentences.includes(idx),
        ).length;
      });

      if (hiddenCount > 0) {
        hints[extractionKey] =
          `${hiddenCount} hidden source sentence${hiddenCount === 1 ? "" : "s"}. Click to reveal.`;
      }
    });

    return hints;
  }, [dataExtractions, safeTopics, topicAnnotations, sentenceAnnotations]);

  // All topics sorted by article order (first sentence index), preserving natural article flow
  const orderedTopics = useMemo(() => {
    return [...safeTopics].sort((a, b) => {
      const aMin =
        Array.isArray(a.sentences) && a.sentences.length
          ? Math.min(...a.sentences)
          : Infinity;
      const bMin =
        Array.isArray(b.sentences) && b.sentences.length
          ? Math.min(...b.sentences)
          : Infinity;
      return aMin - bMin;
    });
  }, [safeTopics]);

  // Group consecutive topics that share the same parent path
  const groupedTopics = useMemo(() => {
    const groups = [];
    for (const topic of orderedTopics) {
      const parts = topic.name.split(">").map((s) => s.trim());
      const parentPath =
        parts.length > 1 ? parts.slice(0, -1).join(" > ") : null;
      const lastGroup = groups[groups.length - 1];
      if (
        lastGroup &&
        lastGroup.parentPath === parentPath &&
        parentPath !== null
      ) {
        lastGroup.topics.push(topic);
      } else {
        groups.push({ parentPath, topics: [topic] });
      }
    }
    return groups;
  }, [orderedTopics]);

  // Nav bar shows must_read + recommended; skip/optional topics are still in the cards below
  const navTopicNames = useMemo(() => {
    return readingOrder.filter((name) => {
      const priority = topicAnnotations[name]?.reading_priority;
      return priority === "must_read" || priority === "recommended";
    });
  }, [readingOrder, topicAnnotations]);

  const scrollToTopic = useCallback((name) => {
    const el = cardRefs.current[name];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleInsightTopicClick = useCallback(
    (topicName) => {
      setHighlightedTopic(topicName);
      scrollToTopic(topicName);
      // Clear highlight after 3 seconds
      setTimeout(() => setHighlightedTopic(null), 3000);
    },
    [scrollToTopic],
  );

  // Track which topic card is currently in view to highlight it in the tree
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting entry
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const name = elementToName.current.get(visible[0].target);
          if (name) setActiveTopic(name);
        }
      },
      { rootMargin: "-10% 0px -55% 0px" },
    );

    Object.entries(cardRefs.current).forEach(([, el]) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [orderedTopics]);
  const handleExtractionHoverStart = useCallback((extractionKey) => {
    setHoveredExtractionKey(extractionKey);
  }, []);
  const handleExtractionHoverEnd = useCallback((extractionKey) => {
    setHoveredExtractionKey((currentKey) =>
      currentKey === extractionKey ? null : currentKey,
    );
  }, []);
  const handleExtractionToggle = useCallback((extractionKey) => {
    setLockedExtractionKey((currentKey) =>
      currentKey === extractionKey ? null : extractionKey,
    );
  }, []);

  const handleRegenerate = async () => {
    try {
      await fetch(`/api/submission/${submissionId}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: ["markup_generation"] }),
      });
      window.location.reload();
    } catch (e) {
      console.error("Regenerate failed", e);
    }
  };

  const dataCtx = {
    submissionId,
    topics: safeTopics,
    sentences: safeSentences,
    topicMindmaps: results.topic_mindmaps || {},
    dataExtractions,
  };

  const hasMindmapData = Object.keys(results.topic_mindmaps || {}).length > 0;
  const dataCharts = recommendedCharts.filter((c) =>
    DATA_CHART_NAMES.has(c.component),
  );

  // All charts in one list: data-driven first (LLM-selected), then topic structure charts
  const allCharts = useMemo(() => {
    const topic = TOPIC_CHART_NAMES.filter(
      (name) => name !== "MindmapResults" || hasMindmapData,
    ).map((name) => ({ type: "topic", component: name }));
    const data = dataCharts.map((spec) => ({
      type: "data",
      component: spec.component,
      spec,
    }));
    return [...data, ...topic];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMindmapData, recommendedCharts]);

  const currentChart = allCharts[topicChartIdx % allCharts.length];

  const mustReadCount = Object.values(topicAnnotations).filter(
    (a) => a.reading_priority === "must_read",
  ).length;
  const highSentenceCount = Object.values(sentenceAnnotations).filter(
    (a) => a.importance === "high",
  ).length;
  const readCount = readTopics ? readTopics.size : 0;

  return (
    <div className="rg-layout">
      {/* Header */}
      <div className="rg-header">
        <div className="rg-header__stats">
          <span className="rg-stat">
            <strong>{safeSentences.length}</strong> sentences
          </span>
          <span className="rg-stat">
            <strong>{safeTopics.length}</strong> topics
          </span>
          {mustReadCount > 0 && (
            <span className="rg-stat rg-stat--accent">
              <strong>{mustReadCount}</strong> must-read
            </span>
          )}
          {highSentenceCount > 0 && (
            <span className="rg-stat">
              <strong>{highSentenceCount}</strong> key sentences
            </span>
          )}
          {dataExtractions.length > 0 && (
            <span className="rg-stat">
              <strong>{dataExtractions.length}</strong> data points
            </span>
          )}
          {insights.length > 0 && (
            <span className="rg-stat rg-stat--insight">
              <strong>{insights.length}</strong> key insights
            </span>
          )}
          {readCount > 0 && (
            <span className="rg-stat rg-stat--read">
              <strong>{readCount}</strong> read
            </span>
          )}
        </div>
        <div className="rg-header__actions">
          <button
            className="storytelling-regen-btn"
            onClick={handleRegenerate}
            title="Re-annotate with AI"
          >
            Re-annotate
          </button>
          <a className="overview-exit-link" href={`/page/text/${submissionId}`}>
            Open Full View
          </a>
        </div>
      </div>

      {/* Reading order quick-nav pills */}
      {navTopicNames.length > 0 && (
        <ReadingOrderBar
          topics={navTopicNames}
          topicAnnotations={topicAnnotations}
          readTopics={readTopics}
          onTopicClick={scrollToTopic}
        />
      )}

      {/* Two-column body: tree nav + cards */}
      <div className="rg-body">
        {/* Left: sticky article-flow tree */}
        <div className="rg-tree-panel">
          <ArticleTreeNav
            orderedTopics={orderedTopics}
            topicAnnotations={topicAnnotations}
            readTopics={readTopics}
            activeTopic={activeTopic}
            onTopicClick={scrollToTopic}
            totalSentences={safeSentences.length}
          />
        </div>

        {/* Right: charts + cards + dashboard */}
        <div className="rg-main-panel">
          {/* Single chart — full width, cycle through all available */}
          {safeTopics.length > 0 &&
            currentChart &&
            (() => {
              const entry = COMPONENT_REGISTRY[currentChart.component];
              if (!entry) return null;
              const props = assembleChartProps(
                currentChart.component,
                dataCtx,
                currentChart.spec || null,
              );
              const ChartComponent = entry.component;
              return (
                <div className="rg-chart-block">
                  <div className="rg-chart-block__header">
                    <span className="rg-chart-block__title">
                      Article structure
                    </span>
                    {allCharts.length > 1 && (
                      <button
                        className="action-btn rg-chart-cycle-btn"
                        onClick={() =>
                          setTopicChartIdx((i) => (i + 1) % allCharts.length)
                        }
                      >
                        ↻ Switch view
                      </button>
                    )}
                  </div>
                  <div className="storytelling-chart__container">
                    <ChartComponent {...props} />
                  </div>
                </div>
              );
            })()}

          {/* Key Insights card */}
          <KeyInsightsCard
            keyInsights={insights}
            onTopicClick={handleInsightTopicClick}
          />

          {/* Topic cards — ALL topics, optional/skip/read start folded */}
          <div className="rg-topics">
            {groupedTopics.map((group, gi) => {
              const isGrouped =
                group.parentPath !== null && group.topics.length >= 2;
              const cards = group.topics.map((topic) => (
                <TopicCard
                  key={topic.name}
                  topic={topic}
                  topicSummary={topicSummaries[topic.name]}
                  topicAnnotation={topicAnnotations[topic.name]}
                  sentenceAnnotations={sentenceAnnotations}
                  sentences={safeSentences}
                  dataExtractions={dataExtractions}
                  isRead={readTopics ? readTopics.has(topic.name) : false}
                  isHighlighted={highlightedTopic === topic.name}
                  onToggleRead={toggleRead}
                  cardRef={(el) => {
                    cardRefs.current[topic.name] = el;
                    if (el) elementToName.current.set(el, topic.name);
                  }}
                  activeExtraction={activeExtraction}
                  lockedExtraction={lockedExtraction}
                  activeExtractionKey={activeExtractionKey}
                  hoveredExtractionKey={hoveredExtractionKey}
                  extractionHints={extractionHints}
                  onExtractionHoverStart={handleExtractionHoverStart}
                  onExtractionHoverEnd={handleExtractionHoverEnd}
                  onExtractionToggle={handleExtractionToggle}
                  showPath={!isGrouped}
                />
              ));
              if (!isGrouped) return cards;
              return (
                <div key={`group-${gi}`} className="rg-topic-group">
                  <div className="rg-topic-group__header">
                    {group.parentPath.replace(/\s*>\s*/g, " › ")}
                  </div>
                  <div className="rg-topic-group__cards">{cards}</div>
                </div>
              );
            })}
          </div>

          {/* Data dashboard */}
          {dataExtractions.length > 0 && (
            <div className="rg-data-dashboard">
              <h3 className="rg-data-dashboard__title">Data Points</h3>
              <DataExtractionTable
                extractions={dataExtractions}
                sentences={safeSentences}
                activeExtractionKey={activeExtractionKey}
                hoveredExtractionKey={hoveredExtractionKey}
                extractionHints={extractionHints}
                onExtractionHoverStart={handleExtractionHoverStart}
                onExtractionHoverEnd={handleExtractionHoverEnd}
                onExtractionToggle={handleExtractionToggle}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
