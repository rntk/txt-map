import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { sanitizeHTML } from '../utils/sanitize';

// Tooltip configuration constants
const TOOLTIP_WIDTH = 260;
const TOOLTIP_HEIGHT_ESTIMATE = 100;
const TOOLTIP_VIEWPORT_MARGIN = 10;
const TOOLTIP_HIDE_DELAY_MS = 200;

function isInAnyRange(start, end, ranges) {
  return ranges.some(r => start < r.end && end > r.start);
}

function wrapWord(htmlWord, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges) {
  const wordEnd = wordStart + htmlWord.length;

  if (!isInAnyRange(wordStart, wordEnd, allTopicRanges)) {
    return htmlWord;
  }

  const classes = ['word-token'];
  if (isInAnyRange(wordStart, wordEnd, highlightRanges)) {
    classes.push('highlighted');
  } else if (isInAnyRange(wordStart, wordEnd, fadeRanges)) {
    classes.push('faded');
  }

  return `<span class="${classes.join(' ')}" data-article-index="${articleIndex}" data-char-start="${wordStart}" data-char-end="${wordEnd}">${htmlWord}</span>`;
}

function buildHighlightedRawHtml(rawHtml, articleTopics, articleIndex, highlightRanges, fadeRanges) {
  if (!rawHtml) return '';

  const safeTopics = Array.isArray(articleTopics) ? articleTopics : [];
  const allTopicRanges = [];
  safeTopics.forEach(topic => {
    (Array.isArray(topic.ranges) ? topic.ranges : []).forEach(range => {
      const s = Number(range.start);
      const e = Number(range.end);
      if (Number.isFinite(s) && Number.isFinite(e)) {
        allTopicRanges.push({ start: s, end: e });
      }
    });
  });

  if (allTopicRanges.length === 0) {
    return sanitizeHTML(rawHtml);
  }

  // Scan the raw HTML string character by character.
  // The ranges are in raw-HTML-string coordinates, so we work directly
  // with the string to match positions correctly.
  let result = '';
  let inTag = false;
  let inQuote = false;
  let quoteChar = '';
  let wordBuffer = '';
  let wordStart = -1;

  for (let i = 0; i < rawHtml.length; i++) {
    const ch = rawHtml[i];

    if (inTag) {
      if (inQuote) {
        if (ch === quoteChar) inQuote = false;
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === '>') {
        inTag = false;
      }
      result += ch;
    } else if (ch === '<') {
      // Flush any accumulated word before entering tag
      if (wordBuffer) {
        result += wrapWord(wordBuffer, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges);
        wordBuffer = '';
        wordStart = -1;
      }
      inTag = true;
      result += ch;
    } else {
      // Text content
      if (/\s/.test(ch)) {
        // Whitespace: flush word buffer
        if (wordBuffer) {
          result += wrapWord(wordBuffer, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges);
          wordBuffer = '';
          wordStart = -1;
        }
        result += ch;
      } else {
        // Non-whitespace: accumulate into word
        if (wordStart === -1) wordStart = i;
        wordBuffer += ch;
      }
    }
  }

  // Flush remaining word
  if (wordBuffer) {
    result += wrapWord(wordBuffer, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges);
  }

  // Sanitize the final HTML (preserves our span wrappers with data-* attrs)
  return sanitizeHTML(result);
}

function TextDisplay({ sentences, selectedTopics, hoveredTopic, readTopics, articleTopics, articleIndex, paragraphMap, topicSummaries, onShowTopicSummary, rawHtml, onToggleRead, onToggleTopic, onNavigateTopic }) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  const safeSelectedTopics = Array.isArray(selectedTopics) ? selectedTopics : [];
  const safeArticleTopics = Array.isArray(articleTopics) ? articleTopics : [];
  const readTopicsSet = readTopics instanceof Set ? readTopics : new Set(readTopics || []);
  const safeParagraphMap = paragraphMap && typeof paragraphMap === 'object' ? paragraphMap : null;

  // Build character ranges from topic.ranges (in raw HTML string coordinates)
  const highlightRanges = [];
  const fadeRanges = [];

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
        highlightRanges.push({ start: rangeStart, end: rangeEnd });
      } else if (isFaded) {
        fadeRanges.push({ start: rangeStart, end: rangeEnd });
      }
    });
  });

  // Sentence-index-based sets for non-rawHtml fallback paths
  const fadedIndices = new Set();
  readTopicsSet.forEach(topicName => {
    const relatedTopic = safeArticleTopics.find(t => t.name === topicName);
    if (relatedTopic) {
      relatedTopic.sentences.forEach(num => fadedIndices.add(num - 1));
    }
  });

  const highlightedIndices = new Set();
  safeSelectedTopics.forEach(topic => {
    const relatedTopic = safeArticleTopics.find(t => t.name === topic.name);
    if (relatedTopic && relatedTopic.sentences) {
      relatedTopic.sentences.forEach(num => highlightedIndices.add(num - 1));
    }
  });
  if (hoveredTopic) {
    const relatedTopic = safeArticleTopics.find(t => t.name === hoveredTopic.name);
    if (relatedTopic && relatedTopic.sentences) {
      relatedTopic.sentences.forEach(num => highlightedIndices.add(num - 1));
    }
  }

  const highlightedRawHtml = buildHighlightedRawHtml(
    rawHtml,
    safeArticleTopics,
    articleIndex,
    highlightRanges,
    fadeRanges
  );

  const sentenceToTopicsEnding = new Map();
  safeArticleTopics.forEach(topic => {
    if (topic.sentences && topic.sentences.length > 0) {
      const lastSentenceIndex = Math.max(...topic.sentences) - 1;
      if (!sentenceToTopicsEnding.has(lastSentenceIndex)) {
        sentenceToTopicsEnding.set(lastSentenceIndex, []);
      }
      sentenceToTopicsEnding.get(lastSentenceIndex).push(topic);
    }
  });

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
  const [tooltip, setTooltip] = useState(null); // {x, y, topics: [{topic, rangeCount}]}
  const hideTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const showTooltip = useCallback((topics, x, y) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setTooltip({ x, y, topics });
  }, []);

  const scheduleHide = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setTooltip(null);
    }, TOOLTIP_HIDE_DELAY_MS);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // Handler for toggling read status from tooltip
  const handleToggleRead = useCallback((topic) => {
    if (onToggleRead) {
      onToggleRead(topic);
    }
    setTooltip(null);
  }, [onToggleRead]);

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
    if (!onToggleRead) return;
    const token = e.target.closest('.word-token, .sentence-token');
    if (!token) return;

    let matchedTopics = [];
    if (token.dataset.charStart !== undefined && token.dataset.charEnd !== undefined) {
      matchedTopics = findTopicsForChar(token.dataset.charStart, token.dataset.charEnd);
    } else if (token.dataset.sentenceIndex !== undefined) {
      matchedTopics = findTopicsForSentence(token.dataset.sentenceIndex);
    }

    if (matchedTopics.length === 0) return;

    // Clamp tooltip to viewport
    let x = e.clientX + 12;
    let y = e.clientY + 12;
    if (x + TOOLTIP_WIDTH > window.innerWidth - TOOLTIP_VIEWPORT_MARGIN) {
      x = e.clientX - TOOLTIP_WIDTH - 12;
    }
    if (y + TOOLTIP_HEIGHT_ESTIMATE > window.innerHeight - TOOLTIP_VIEWPORT_MARGIN) {
      y = e.clientY - TOOLTIP_HEIGHT_ESTIMATE - 12;
    }

    showTooltip(matchedTopics, x, y);
  }, [onToggleRead, findTopicsForChar, findTopicsForSentence, showTooltip]);

  const handleMouseOut = useCallback((e) => {
    const token = e.target.closest('.word-token, .sentence-token');
    if (!token) return;
    scheduleHide();
  }, [scheduleHide]);

  // Tooltip JSX
  const tooltipEl = tooltip && onToggleRead ? (
    <div
      className="text-topic-tooltip"
      style={{ left: tooltip.x, top: tooltip.y }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', color: '#ddd' }}>
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
    </div>
  ) : null;

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

  if (safeParagraphMap && Object.keys(safeParagraphMap).length > 0) {
    const paragraphGroups = new Map();

    safeSentences.forEach((sentence, idx) => {
      const sentenceParagraphIdx = safeParagraphMap[idx] !== undefined ? safeParagraphMap[idx] : 0;

      if (!paragraphGroups.has(sentenceParagraphIdx)) {
        paragraphGroups.set(sentenceParagraphIdx, []);
      }

      paragraphGroups.get(sentenceParagraphIdx).push({ text: sentence, index: idx });
    });

    const sortedParagraphIndices = Array.from(paragraphGroups.keys()).sort((a, b) => a - b);
    const paragraphs = sortedParagraphIndices.map(paraIdx => paragraphGroups.get(paraIdx));

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
                  <div
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
              <div
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

export default TextDisplay;
