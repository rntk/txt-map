import React, { useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { sanitizeHTML } from '../utils/sanitize';
import { buildHighlightedRawHtml } from '../utils/htmlHighlight';
import { useTooltip } from '../hooks/useTooltip';

// Tooltip positioning constants
const TOOLTIP_WIDTH = 260;
const TOOLTIP_HEIGHT_ESTIMATE = 100;
const TOOLTIP_VIEWPORT_MARGIN = 10;

function TextDisplay({ sentences, selectedTopics, hoveredTopic, readTopics, articleTopics, articleIndex, paragraphMap, topicSummaries, onShowTopicSummary, rawHtml, onToggleRead, onToggleTopic, onNavigateTopic, tooltipEnabled = true }) {
  const safeSentences = useMemo(() => (Array.isArray(sentences) ? sentences : []), [sentences]);
  const safeSelectedTopics = useMemo(
    () => (Array.isArray(selectedTopics) ? selectedTopics : []),
    [selectedTopics]
  );
  const safeArticleTopics = useMemo(
    () => (Array.isArray(articleTopics) ? articleTopics : []),
    [articleTopics]
  );
  const readTopicsSet = useMemo(() => 
    readTopics instanceof Set ? readTopics : new Set(readTopics || [])
  , [readTopics]);
  const safeParagraphMap = paragraphMap && typeof paragraphMap === 'object' ? paragraphMap : null;

  // Build character ranges from topic.ranges (in raw HTML string coordinates)
  const { highlightRanges, fadeRanges } = useMemo(() => {
    const highlights = [];
    const fades = [];
    
    safeArticleTopics.forEach(topic => {
      const ranges = Array.isArray(topic.ranges) ? topic.ranges : [];
      if (ranges.length === 0) return;

      const isHighlighted = safeSelectedTopics.some(t => t.name === topic.name) ||
        (hoveredTopic && hoveredTopic.name === topic.name);
      const isFaded = readTopicsSet.has(topic.name);

      ranges.forEach(range => {
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

  // Sentence-index-based sets for non-rawHtml fallback paths
  const fadedIndices = useMemo(() => {
    const set = new Set();
    readTopicsSet.forEach(topicName => {
      const relatedTopic = safeArticleTopics.find(t => t.name === topicName);
      if (relatedTopic) {
        relatedTopic.sentences.forEach(num => set.add(num - 1));
      }
    });
    return set;
  }, [readTopicsSet, safeArticleTopics]);

  const highlightedIndices = useMemo(() => {
    const set = new Set();
    safeSelectedTopics.forEach(topic => {
      const relatedTopic = safeArticleTopics.find(t => t.name === topic.name);
      if (relatedTopic && relatedTopic.sentences) {
        relatedTopic.sentences.forEach(num => set.add(num - 1));
      }
    });
    if (hoveredTopic) {
      const relatedTopic = safeArticleTopics.find(t => t.name === hoveredTopic.name);
      if (relatedTopic && relatedTopic.sentences) {
        relatedTopic.sentences.forEach(num => set.add(num - 1));
      }
    }
    return set;
  }, [safeSelectedTopics, hoveredTopic, safeArticleTopics]);

  const highlightedRawHtml = useMemo(() => buildHighlightedRawHtml(
    rawHtml,
    safeArticleTopics,
    articleIndex,
    highlightRanges,
    fadeRanges
  ), [rawHtml, safeArticleTopics, articleIndex, highlightRanges, fadeRanges]);

  const sentenceToTopicsEnding = useMemo(() => {
    const map = new Map();
    safeArticleTopics.forEach(topic => {
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

  // --- Reverse mapping: char position -> topic(s) ---
  const charToTopics = useMemo(() => {
    // Sorted flat array of {start, end, topic}
    const entries = [];
    safeArticleTopics.forEach(topic => {
      const ranges = Array.isArray(topic.ranges) ? topic.ranges : [];
      ranges.forEach(range => {
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
    safeArticleTopics.forEach(topic => {
      const sents = Array.isArray(topic.sentences) ? topic.sentences : [];
      sents.forEach(num => {
        const idx = num - 1;
        if (!map.has(idx)) map.set(idx, []);
        map.get(idx).push(topic);
      });
    });
    return map;
  }, [safeArticleTopics]);

  // --- Tooltip state ---
  const { tooltip, lastTargetRef, showTooltip, scheduleHide, cancelHide, hideTooltip } = useTooltip(tooltipEnabled);

  // Handler for toggling read status from tooltip
  const handleToggleRead = useCallback((topic) => {
    if (onToggleRead) {
      onToggleRead(topic);
    }
    hideTooltip();
  }, [onToggleRead, hideTooltip]);

  // Find topics for a char range
  const findTopicsForChar = useCallback((charStart, charEnd) => {
    const cs = Number(charStart);
    const ce = Number(charEnd);
    if (!Number.isFinite(cs) || !Number.isFinite(ce)) return [];
    return charToTopics.filter(e => cs < e.end && ce > e.start).map(e => ({
      topic: e.topic,
      rangeCount: Array.isArray(e.topic.ranges) ? e.topic.ranges.length : 1,
    }));
  }, [charToTopics]);

  // Find topics for a sentence index
  const findTopicsForSentence = useCallback((sentenceIdx) => {
    const idx = Number(sentenceIdx);
    const topics = sentenceToTopicsMap.get(idx) || [];
    return topics.map(t => ({
      topic: t,
      rangeCount: Array.isArray(t.ranges) ? t.ranges.length : 0,
    }));
  }, [sentenceToTopicsMap]);

  // Event delegation handler
  const handleMouseOver = useCallback((e) => {
    if (!onToggleRead || !tooltipEnabled) return;
    const token = e.target.closest('.word-token, .sentence-token');
    if (!token) {
      if (lastTargetRef.current) {
        scheduleHide();
      }
      return;
    }

    // Only update if we've moved to a different token
    if (token === lastTargetRef.current) {
      cancelHide();
      return;
    }

    let matchedTopics = [];
    if (token.dataset.charStart !== undefined && token.dataset.charEnd !== undefined) {
      matchedTopics = findTopicsForChar(token.dataset.charStart, token.dataset.charEnd);
    } else if (token.dataset.sentenceIndex !== undefined) {
      matchedTopics = findTopicsForSentence(token.dataset.sentenceIndex);
    }

    if (matchedTopics.length === 0) {
      lastTargetRef.current = null;
      scheduleHide();
      return;
    }

    lastTargetRef.current = token;

    // Position tooltip right at the cursor
    // Using -2 to put the cursor slightly inside the tooltip boundary
    // to ensure the transition from token hover to tooltip hover is seamless.
    let x = e.clientX - 2;
    let y = e.clientY - 2;

    // Clamp to viewport instead of flipping to the other side
    const maxX = window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_VIEWPORT_MARGIN;
    const maxY = window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_VIEWPORT_MARGIN;

    x = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(x, maxX));
    y = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(y, maxY));

    let meta = null;
    if (token.dataset.sentenceIndex !== undefined) {
      const idx = Number(token.dataset.sentenceIndex);
      meta = { sentenceIdx: idx, totalSentences: safeSentences.length };
    }

    showTooltip(matchedTopics, x, y, meta);
  }, [
    cancelHide,
    findTopicsForChar,
    findTopicsForSentence,
    lastTargetRef,
    onToggleRead,
    safeSentences.length,
    scheduleHide,
    showTooltip,
    tooltipEnabled,
  ]);

  const handleMouseOut = useCallback((e) => {
    const token = e.target.closest('.word-token, .sentence-token');
    if (!token) return;
    scheduleHide();
  }, [scheduleHide]);

  // Tooltip JSX - Use createPortal to move it to document.body
  const tooltipEl = tooltip && onToggleRead ? createPortal(
    <div
      className="text-topic-tooltip"
      style={{ left: tooltip.x, top: tooltip.y }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      {tooltip.meta && (
        <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '6px', borderBottom: '1px solid #444', paddingBottom: '4px' }}>
          Sentence {tooltip.meta.sentenceIdx + 1} / {tooltip.meta.totalSentences}
        </div>
      )}
      {tooltip.topics.map(({ topic, rangeCount }, i) => {
        const isRead = readTopicsSet.has(topic.name);
        const isSelected = safeSelectedTopics.some(t => t.name === topic.name);
        return (
          <div key={topic.name} style={{ marginBottom: i < tooltip.topics.length - 1 ? 10 : 0 }}>
            <div className="text-topic-tooltip-name">{topic.name}</div>
            {rangeCount > 1 && (
              <div className="text-topic-tooltip-warning">
                This topic has {rangeCount} separate ranges. Some may not be visible.
              </div>
            )}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', marginTop: '4px' }}>
              {onToggleTopic && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px', color: '#ddd' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleTopic(topic)}
                    style={{ margin: 0, cursor: 'pointer' }}
                  />
                  Highlight
                </label>
              )}
              <button
                className="text-topic-tooltip-btn"
                onClick={() => handleToggleRead(topic)}
              >
                {isRead ? 'Mark Unread' : 'Mark Read'}
              </button>
              {onNavigateTopic && (
                <>
                  <button
                    className="text-topic-tooltip-btn"
                    onClick={() => onNavigateTopic(topic, 'prev')}
                    title="Scroll to previous occurrence"
                  >
                    ‹ Prev
                  </button>
                  <button
                    className="text-topic-tooltip-btn"
                    onClick={() => onNavigateTopic(topic, 'next')}
                    title="Scroll to next occurrence"
                  >
                    Next ›
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>,
    document.body
  ) : null;

  const paragraphs = useMemo(() => {
    if (!safeParagraphMap || Object.keys(safeParagraphMap).length === 0) return null;
    const groups = new Map();

    safeSentences.forEach((sentence, idx) => {
      const sentenceParagraphIdx = safeParagraphMap[idx] !== undefined ? safeParagraphMap[idx] : 0;
      if (!groups.has(sentenceParagraphIdx)) {
        groups.set(sentenceParagraphIdx, []);
      }
      groups.get(sentenceParagraphIdx).push({ text: sentence, index: idx });
    });

    const sortedParagraphIndices = Array.from(groups.keys()).sort((a, b) => a - b);
    return sortedParagraphIndices.map(paraIdx => groups.get(paraIdx));
  }, [safeParagraphMap, safeSentences]);

  if (highlightedRawHtml) {
    return (
      <div className="text-display">
        <div
          className="text-content"
          dangerouslySetInnerHTML={{ __html: highlightedRawHtml }}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
        />
        {tooltipEl}
      </div>
    );
  }

  if (paragraphs) {
    return (
      <div className="text-display">
        <div
          className="text-content"
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
        >
          {paragraphs.map((para, paraIdx) => (
            <p key={paraIdx} className="article-paragraph">
              {para.map(({ text, index }) => (
                <React.Fragment key={index}>
                  <span
                    id={`sentence-${articleIndex}-${index}`}
                    data-article-index={articleIndex}
                    data-sentence-index={index}
                    className={`sentence-token ${highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}`}
                    dangerouslySetInnerHTML={{ __html: sanitizeHTML(text) + ' ' }}
                  />
                  {sentenceToTopicsEnding.has(index) && topicSummaries && onShowTopicSummary && (
                    sentenceToTopicsEnding.get(index).map((topic, tIdx) => (
                      <button
                        key={`${index}-${tIdx}`}
                        className="topic-summary-link"
                        onClick={() => onShowTopicSummary(topic, topicSummaries[topic.name])}
                        title={`View summary for topic: ${topic.name}`}
                      >
                        [📝 {topic.name}]
                      </button>
                    ))
                  )}
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
    <div className="text-display">
      <div
        className="text-content"
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
      >
        <p className="article-text">
          {safeSentences.map((sentence, index) => (
            <React.Fragment key={index}>
              <span
                id={`sentence-${articleIndex}-${index}`}
                data-article-index={articleIndex}
                data-sentence-index={index}
                className={`sentence-token ${highlightedIndices.has(index) ? 'highlighted' : fadedIndices.has(index) ? 'faded' : ''}`}
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(sentence) + ' ' }}
              />
              {sentenceToTopicsEnding.has(index) && topicSummaries && onShowTopicSummary && (
                sentenceToTopicsEnding.get(index).map((topic, tIdx) => (
                  <button
                    key={`${index}-${tIdx}`}
                    className="topic-summary-link"
                    onClick={() => onShowTopicSummary(topic, topicSummaries[topic.name])}
                    title={`View summary for topic: ${topic.name}`}
                  >
                    [📝 {topic.name}]
                  </button>
                ))
              )}
            </React.Fragment>
          ))}
        </p>
      </div>
      {tooltipEl}
    </div>
  );
}

export default React.memo(TextDisplay);
