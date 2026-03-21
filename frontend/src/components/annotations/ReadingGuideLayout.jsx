import React, { useRef, useMemo, useCallback, useState } from 'react';
import ReadingOrderBar from './ReadingOrderBar';
import TopicCard from './TopicCard';
import DataExtractionTable from './DataExtractionTable';
import { COMPONENT_REGISTRY, assembleChartProps } from '../storytelling/componentRegistry';
import { buildExtractionKey } from '../../utils/extractionHighlight';

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
  safeTopics,
  safeSentences,
  submissionId,
  readTopics,
  toggleRead,
}) {
  const cardRefs = useRef({});
  const results = submission?.results || {};
  const [hoveredExtractionKey, setHoveredExtractionKey] = useState(null);
  const [lockedExtractionKey, setLockedExtractionKey] = useState(null);

  const {
    sentence_annotations: sentenceAnnotations = {},
    topic_annotations: topicAnnotations = {},
    data_extractions: dataExtractions = [],
    structural_suggestions: structuralSuggestions = {},
  } = annotations;

  const recommendedCharts = structuralSuggestions.recommended_charts || [];
  const readingOrder = useMemo(
    () => (Array.isArray(structuralSuggestions.reading_order) ? structuralSuggestions.reading_order : []),
    [structuralSuggestions.reading_order]
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
  const activeExtraction = activeExtractionKey ? extractionByKey.get(activeExtractionKey) || null : null;
  const lockedExtraction = lockedExtractionKey ? extractionByKey.get(lockedExtractionKey) || null : null;
  const extractionHints = useMemo(() => {
    const hints = {};

    dataExtractions.forEach((extraction) => {
      const extractionKey = buildExtractionKey(extraction);
      if (!extractionKey) return;

      const sourceSentences = Array.isArray(extraction.source_sentences) ? extraction.source_sentences : [];
      let hiddenCount = 0;

      safeTopics.forEach((topic) => {
        const topicName = topic?.name;
        const topicSentenceIndices = Array.isArray(topic?.sentences) ? topic.sentences : [];
        const matchingSourceIndices = sourceSentences.filter((idx) => topicSentenceIndices.includes(idx));
        if (matchingSourceIndices.length === 0) return;

        const topicAnnotation = topicAnnotations[topicName] || {};
        const recommendedSentences = Array.isArray(topicAnnotation.recommended_sentences)
          ? topicAnnotation.recommended_sentences
          : [];
        const defaultVisibleSentences = recommendedSentences.length > 0
          ? recommendedSentences.slice(0, 5)
          : topicSentenceIndices
              .filter((idx) => sentenceAnnotations?.[String(idx)]?.importance === 'high')
              .slice(0, 5);

        hiddenCount += matchingSourceIndices.filter((idx) => !defaultVisibleSentences.includes(idx)).length;
      });

      if (hiddenCount > 0) {
        hints[extractionKey] = `${hiddenCount} hidden source sentence${hiddenCount === 1 ? '' : 's'}. Click to reveal.`;
      }
    });

    return hints;
  }, [dataExtractions, safeTopics, topicAnnotations, sentenceAnnotations]);

  // All topics ordered: reading_order first, then all remaining (nothing omitted)
  const orderedTopics = useMemo(() => {
    const topicByName = {};
    for (const t of safeTopics) topicByName[t.name] = t;

    const ordered = [];
    const seen = new Set();

    for (const name of readingOrder) {
      if (topicByName[name] && !seen.has(name)) {
        ordered.push(topicByName[name]);
        seen.add(name);
      }
    }
    for (const t of safeTopics) {
      if (!seen.has(t.name)) {
        ordered.push(t);
        seen.add(t.name);
      }
    }
    return ordered;
  }, [safeTopics, readingOrder]);

  // Group consecutive topics that share the same parent path
  const groupedTopics = useMemo(() => {
    const groups = [];
    for (const topic of orderedTopics) {
      const parts = topic.name.split('>').map(s => s.trim());
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join(' > ') : null;
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.parentPath === parentPath && parentPath !== null) {
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
      return priority === 'must_read' || priority === 'recommended';
    });
  }, [readingOrder, topicAnnotations]);

  const scrollToTopic = useCallback((name) => {
    const el = cardRefs.current[name];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const handleExtractionHoverStart = useCallback((extractionKey) => {
    setHoveredExtractionKey(extractionKey);
  }, []);
  const handleExtractionHoverEnd = useCallback((extractionKey) => {
    setHoveredExtractionKey((currentKey) => (currentKey === extractionKey ? null : currentKey));
  }, []);
  const handleExtractionToggle = useCallback((extractionKey) => {
    setLockedExtractionKey((currentKey) => (currentKey === extractionKey ? null : extractionKey));
  }, []);

  const handleRegenerate = async () => {
    try {
      await fetch(`/api/submission/${submissionId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: ['storytelling_generation'] }),
      });
      window.location.reload();
    } catch (e) {
      console.error('Regenerate failed', e);
    }
  };

  const dataCtx = {
    submissionId,
    topics: safeTopics,
    sentences: safeSentences,
    topicMindmaps: results.topic_mindmaps || {},
  };

  const mustReadCount = Object.values(topicAnnotations).filter(
    (a) => a.reading_priority === 'must_read'
  ).length;
  const highSentenceCount = Object.values(sentenceAnnotations).filter(
    (a) => a.importance === 'high'
  ).length;
  const readCount = readTopics ? readTopics.size : 0;

  return (
    <div className="rg-layout">
      {/* Header */}
      <div className="rg-header">
        <div className="rg-header__stats">
          <span className="rg-stat"><strong>{safeSentences.length}</strong> sentences</span>
          <span className="rg-stat"><strong>{safeTopics.length}</strong> topics</span>
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
          {readCount > 0 && (
            <span className="rg-stat rg-stat--read">
              <strong>{readCount}</strong> read
            </span>
          )}
        </div>
        <div className="rg-header__actions">
          <button className="storytelling-regen-btn" onClick={handleRegenerate} title="Re-annotate with AI">
            Re-annotate
          </button>
          <a className="overview-exit-link" href={`/page/text/${submissionId}`}>
            Open Full View
          </a>
        </div>
      </div>

      {/* Reading order navigation */}
      {navTopicNames.length > 0 && (
        <ReadingOrderBar
          topics={navTopicNames}
          topicAnnotations={topicAnnotations}
          readTopics={readTopics}
          onTopicClick={scrollToTopic}
        />
      )}

      {/* Charts */}
      {recommendedCharts.length > 0 && (
        <div className="rg-charts">
          {recommendedCharts.slice(0, 2).map((chartSpec, i) => {
            const entry = COMPONENT_REGISTRY[chartSpec.component];
            if (!entry) return null;
            const props = assembleChartProps(chartSpec.component, dataCtx, chartSpec);
            const ChartComponent = entry.component;
            return (
              <div key={i} className="rg-chart-block">
                <div className="storytelling-chart__container">
                  <ChartComponent {...props} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Topic cards — ALL topics rendered, optional/skip/read start folded */}
      <div className="rg-topics">
        {groupedTopics.map((group, gi) => {
          const isGrouped = group.parentPath !== null && group.topics.length >= 2;
          const cards = group.topics.map((topic) => (
            <TopicCard
              key={topic.name}
              topic={topic}
              topicAnnotation={topicAnnotations[topic.name]}
              sentenceAnnotations={sentenceAnnotations}
              sentences={safeSentences}
              dataExtractions={dataExtractions}
              isRead={readTopics ? readTopics.has(topic.name) : false}
              onToggleRead={toggleRead}
              cardRef={(el) => { cardRefs.current[topic.name] = el; }}
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
                {group.parentPath.replace(/\s*>\s*/g, ' › ')}
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
  );
}
