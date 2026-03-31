import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import MarkupRenderer from './markup/MarkupRenderer';
import {
  buildEnrichedRangeGroupsWithFallbacks,
  buildGroupMarkup,
  resolveTopicMarkup,
} from './markup/topicMarkupUtils';
import { useTooltip } from '../hooks/useTooltip';
import { getTopicHighlightColor } from '../utils/topicColorUtils';

const TOOLTIP_WIDTH = 260;
const TOOLTIP_HEIGHT_ESTIMATE = 100;
const TOOLTIP_VIEWPORT_MARGIN = 10;

function hasNonPlainMarkup(topicMarkup) {
  return Boolean(
    topicMarkup
    && Array.isArray(topicMarkup.segments)
    && topicMarkup.segments.some(segment => segment?.type !== 'plain')
  );
}

function buildArticleMarkupBlocks(sentences, topics, markup) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  const safeTopics = Array.isArray(topics) ? topics : [];
  const totalSentences = safeSentences.length;

  if (totalSentences === 0) {
    return [];
  }

  const candidateBlocks = [];

  safeTopics.forEach((topic, topicIndex) => {
    const topicMarkup = resolveTopicMarkup(markup, topic);
    if (!hasNonPlainMarkup(topicMarkup)) {
      return;
    }

    const rangeGroups = buildEnrichedRangeGroupsWithFallbacks(
      Array.isArray(topicMarkup?.positions) ? topicMarkup.positions : [],
      Array.isArray(topic?.sentences) ? topic.sentences : [],
      Array.isArray(topic?.ranges) ? topic.ranges : []
    );

    rangeGroups.forEach((rangeGroup, rangeIndex) => {
      if (!Number.isInteger(rangeGroup?.firstSourceSentenceIndex) || !Number.isInteger(rangeGroup?.lastSourceSentenceIndex)) {
        return;
      }

      const groupMarkup = buildGroupMarkup(topicMarkup, rangeGroup);
      if (!hasNonPlainMarkup(groupMarkup)) {
        return;
      }

      candidateBlocks.push({
        kind: 'markup',
        key: `${topic?.name || 'topic'}-${topicIndex}-${rangeIndex}-${rangeGroup.firstSourceSentenceIndex}-${rangeGroup.lastSourceSentenceIndex}`,
        topic,
        rangeCount: rangeGroups.length,
        startSentenceIndex: rangeGroup.firstSourceSentenceIndex,
        endSentenceIndex: rangeGroup.lastSourceSentenceIndex,
        sentences: groupMarkup.positions.map((position) => position.text || ''),
        segments: groupMarkup.segments,
      });
    });
  });

  candidateBlocks.sort((left, right) => {
    if (left.startSentenceIndex !== right.startSentenceIndex) {
      return left.startSentenceIndex - right.startSentenceIndex;
    }
    return left.endSentenceIndex - right.endSentenceIndex;
  });

  const blocks = [];
  let cursor = 1;

  const pushPlainBlock = (startSentenceIndex, endSentenceIndex) => {
    if (startSentenceIndex > endSentenceIndex) {
      return;
    }

    blocks.push({
      kind: 'plain',
      key: `plain-${startSentenceIndex}-${endSentenceIndex}`,
      startSentenceIndex,
      endSentenceIndex,
      sentences: safeSentences.slice(startSentenceIndex - 1, endSentenceIndex),
    });
  };

  candidateBlocks.forEach((block) => {
    const startSentenceIndex = Math.max(1, block.startSentenceIndex);
    const endSentenceIndex = Math.min(totalSentences, block.endSentenceIndex);

    if (startSentenceIndex > endSentenceIndex) {
      return;
    }

    if (startSentenceIndex < cursor) {
      return;
    }

    if (cursor < startSentenceIndex) {
      pushPlainBlock(cursor, startSentenceIndex - 1);
    }

    blocks.push({
      ...block,
      startSentenceIndex,
      endSentenceIndex,
    });
    cursor = endSentenceIndex + 1;
  });

  if (cursor <= totalSentences) {
    pushPlainBlock(cursor, totalSentences);
  }

  return blocks;
}

function ArticleMarkupPlainBlock({ sentences, startSentenceIndex, sentenceColorMap }) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];

  return (
    <div className="markup-segment">
      {safeSentences.map((sentence, index) => {
        const sentenceNum = startSentenceIndex + index;
        const color = sentenceColorMap?.get(sentenceNum);
        return (
          <div key={`${sentenceNum}-${sentence}`} className="markup-plain__sentence">
            <span className="markup-plain__num">{sentenceNum}.</span>
            <span style={color ? { backgroundColor: color, borderRadius: '2px', padding: '0 2px' } : undefined}>
              {sentence}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * @typedef {Object} MarkupTopicBlockProps
 * @property {{
 *   key: string,
 *   topic: { name: string, sentences?: number[] },
 *   rangeCount: number,
 *   startSentenceIndex: number,
 *   endSentenceIndex: number,
 *   sentences: string[],
 *   segments: Array,
 * }} block
 * @property {Array<{ name: string }>} selectedTopics
 * @property {Set<string>|string[]} readTopics
 * @property {(topic: Object) => void} onToggleRead
 * @property {(topic: Object) => void} onToggleTopic
 * @property {(topic: Object, direction: 'prev'|'next'|'focus') => void} onNavigateTopic
 * @property {(topic: Object) => void} onShowSentences
 * @property {boolean} tooltipEnabled
 */
function MarkupTopicBlock({
  block,
  selectedTopics,
  readTopics,
  onToggleRead,
  onToggleTopic,
  onNavigateTopic,
  onShowSentences,
  tooltipEnabled,
  coloredHighlightMode = false,
}) {
  const readTopicsSet = useMemo(
    () => (readTopics instanceof Set ? readTopics : new Set(readTopics || [])),
    [readTopics]
  );
  const safeSelectedTopics = useMemo(
    () => (Array.isArray(selectedTopics) ? selectedTopics : []),
    [selectedTopics]
  );
  const { tooltip, lastTargetRef, showTooltip, hideTooltip } = useTooltip(tooltipEnabled);
  const tooltipContainerRef = useRef(null);
  const blockRef = useRef(null);

  const getTooltipPosition = useCallback((clientX, clientY) => {
    let x = clientX - 10;
    let y = clientY - 10;

    const maxX = window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_VIEWPORT_MARGIN;
    const maxY = window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_VIEWPORT_MARGIN;

    x = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(x, maxX));
    y = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(y, maxY));

    return { x, y };
  }, []);

  const openTooltip = useCallback((target, clientX, clientY) => {
    if (!block?.topic) {
      hideTooltip();
      return;
    }

    if (target === lastTargetRef.current && tooltip) {
      hideTooltip();
      return;
    }

    lastTargetRef.current = target;
    const { x, y } = getTooltipPosition(clientX, clientY);
    showTooltip([{ topic: block.topic, rangeCount: block.rangeCount }], x, y);
  }, [block, getTooltipPosition, hideTooltip, lastTargetRef, showTooltip, tooltip]);

  const handleBlockClick = useCallback((event) => {
    if (!tooltipEnabled || !blockRef.current) {
      return;
    }

    openTooltip(blockRef.current, event.clientX, event.clientY);
  }, [blockRef, openTooltip, tooltipEnabled]);

  const handleBlockKeyDown = useCallback((event) => {
    if (!tooltipEnabled || !blockRef.current) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    const rect = blockRef.current.getBoundingClientRect();
    openTooltip(blockRef.current, rect.left + 24, rect.top + 24);
  }, [blockRef, openTooltip, tooltipEnabled]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!tooltip) return;
      if (tooltipContainerRef.current?.contains(event.target)) return;
      if (blockRef.current?.contains(event.target)) return;
      hideTooltip();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        hideTooltip();
      }
    };

    document.addEventListener('click', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleOutsideClick, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [hideTooltip, tooltip]);

  const tooltipEl = tooltip ? createPortal(
    <div
      ref={tooltipContainerRef}
      className="text-topic-tooltip"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      {tooltip.topics.map(({ topic, rangeCount }) => {
        const isRead = readTopicsSet.has(topic.name);
        const isSelected = safeSelectedTopics.some((selectedTopic) => selectedTopic.name === topic.name);

        return (
          <div key={topic.name} className="text-topic-tooltip-topic">
            <div className="text-topic-tooltip-name">{topic.name}</div>
            {rangeCount > 1 && (
              <div className="text-topic-tooltip-warning">
                This topic has {rangeCount} separate ranges. Some may not be visible.
              </div>
            )}
            <div className="text-topic-tooltip-actions">
              <label className="text-topic-tooltip-toggle">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleTopic(topic)}
                  className="text-topic-tooltip-toggle-input"
                />
                Highlight
              </label>
              <button
                className="text-topic-tooltip-btn"
                onClick={() => onToggleRead(topic)}
              >
                {isRead ? 'Mark Unread' : 'Mark Read'}
              </button>
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
            </div>
          </div>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div
        ref={blockRef}
        className="markup-topic-block"
        style={coloredHighlightMode ? { backgroundColor: getTopicHighlightColor(block.topic.name) } : undefined}
        onClick={handleBlockClick}
        onKeyDown={handleBlockKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Show topic actions for ${block.topic.name}`}
      >
        <MarkupRenderer
          segments={block.segments}
          sentences={block.sentences}
        />
      </div>
      {tooltipEl}
    </>
  );
}

/**
 * @typedef {Object} ArticleMarkupViewProps
 * @property {string[]} safeSentences
 * @property {Array} safeTopics
 * @property {Object} markup
 * @property {Array<{ name: string }>} selectedTopics
 * @property {Set<string>|string[]} readTopics
 * @property {(topic: Object) => void} onToggleRead
 * @property {(topic: Object) => void} onToggleTopic
 * @property {(topic: Object, direction: 'prev'|'next'|'focus') => void} onNavigateTopic
 * @property {(topic: Object) => void} onShowSentences
 * @property {boolean} tooltipEnabled
 * @property {boolean} [coloredHighlightMode]
 */
function ArticleMarkupView({
  safeSentences,
  safeTopics,
  markup,
  selectedTopics,
  readTopics,
  onToggleRead,
  onToggleTopic,
  onNavigateTopic,
  onShowSentences,
  tooltipEnabled,
  coloredHighlightMode = false,
}) {
  const articleMarkupBlocks = useMemo(
    () => buildArticleMarkupBlocks(safeSentences, safeTopics, markup),
    [safeSentences, safeTopics, markup]
  );

  // Map sentence number (1-based) → color for plain blocks
  const sentenceColorMap = useMemo(() => {
    if (!coloredHighlightMode) return null;
    const map = new Map();
    (Array.isArray(safeTopics) ? safeTopics : []).forEach(topic => {
      const color = getTopicHighlightColor(topic.name);
      (Array.isArray(topic.sentences) ? topic.sentences : []).forEach(sentenceNum => {
        if (!map.has(sentenceNum)) {
          map.set(sentenceNum, color);
        }
      });
    });
    return map;
  }, [coloredHighlightMode, safeTopics]);

  return (
    <div className="summary-content">
      <div className="markup-content">
        {articleMarkupBlocks.map((block) => (
          block.kind === 'markup' ? (
            <MarkupTopicBlock
              key={block.key}
              block={block}
              selectedTopics={selectedTopics}
              readTopics={readTopics}
              onToggleRead={onToggleRead}
              onToggleTopic={onToggleTopic}
              onNavigateTopic={onNavigateTopic}
              onShowSentences={onShowSentences}
              tooltipEnabled={tooltipEnabled}
              coloredHighlightMode={coloredHighlightMode}
            />
          ) : (
            <ArticleMarkupPlainBlock
              key={block.key}
              sentences={block.sentences}
              startSentenceIndex={block.startSentenceIndex}
              sentenceColorMap={sentenceColorMap}
            />
          )
        ))}
      </div>
    </div>
  );
}

export default ArticleMarkupView;
