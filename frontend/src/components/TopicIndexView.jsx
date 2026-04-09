import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import FullScreenGraph from "./FullScreenGraph";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import {
  getTopicAccentColor,
  getTopicCSSClass,
} from "../utils/topicColorUtils";
import { splitTopicPath } from "../utils/summaryTimeline";
import { isTopicRead } from "../utils/topicReadUtils";
import { buildModalSelectionFromTopic } from "../utils/topicModalSelection";
import { buildArticleTfIdfIndex, buildTopicTagCloud } from "../utils/gridUtils";
import { useArticle } from "../contexts/ArticleContext";

const MIN_TILE_HEIGHT = 44;
const PER_RANGE_CHAR_PX = 0.28;
const ESTIMATED_SENTENCE_CHAR_COUNT = 90;
const MAX_TILE_HEIGHT = 180;

/**
 * @typedef {Object} TopicIndexRangeSegment
 * @property {number} startSentenceIndex
 * @property {number} endSentenceIndex
 * @property {number} sourceIndex
 */

/**
 * @typedef {Object} TopicIndexTile
 * @property {string} key
 * @property {Object} topic
 * @property {TopicIndexRangeSegment} segment
 * @property {number} topicIndex
 * @property {number} segmentIndex
 * @property {number} sentenceCount
 * @property {number} charCount
 * @property {string} heightClassName
 */

/**
 * @typedef {Object} TopicIndexViewProps
 * @property {Array<Object>} articles
 * @property {Array<Object>} safeTopics
 * @property {Set<string> | string[]} readTopics
 * @property {(topic: Object) => void} onToggleRead
 * @property {() => void} onClose
 * @property {(topic: Object) => void} [onShowInArticle]
 */

/**
 * @param {Object} topic
 * @returns {Object}
 */
function buildNormalizedTopicSelection(topic) {
  const baseTopic = buildModalSelectionFromTopic({
    ...topic,
    displayName: topic.displayName || topic.name,
    fullPath: topic.fullPath || topic.name,
    sentences: topic.sentences,
    sentenceIndices: topic.sentenceIndices || topic.sentences,
  });

  return {
    ...baseTopic,
    canonicalTopicNames:
      Array.isArray(baseTopic.canonicalTopicNames) &&
      baseTopic.canonicalTopicNames.length > 0
        ? baseTopic.canonicalTopicNames
        : [topic.name],
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stringifySentence(value) {
  return typeof value === "string" ? value : "";
}

/**
 * @param {number[]} indices
 * @returns {TopicIndexRangeSegment[]}
 */
function buildConsecutiveSentenceSegments(indices) {
  const sortedIndices = (Array.isArray(indices) ? indices : [])
    .map((value) => Number(value) - 1)
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((left, right) => left - right);

  if (sortedIndices.length === 0) {
    return [];
  }

  /** @type {TopicIndexRangeSegment[]} */
  const segments = [];
  let startSentenceIndex = sortedIndices[0];
  let endSentenceIndex = sortedIndices[0];
  let sourceIndex = 0;

  for (let index = 1; index < sortedIndices.length; index += 1) {
    const nextIndex = sortedIndices[index];
    if (nextIndex <= endSentenceIndex + 1) {
      endSentenceIndex = Math.max(endSentenceIndex, nextIndex);
      continue;
    }

    segments.push({ startSentenceIndex, endSentenceIndex, sourceIndex });
    sourceIndex += 1;
    startSentenceIndex = nextIndex;
    endSentenceIndex = nextIndex;
  }

  segments.push({ startSentenceIndex, endSentenceIndex, sourceIndex });
  return segments;
}

/**
 * @param {Array<Object>} ranges
 * @returns {TopicIndexRangeSegment[]}
 */
function buildSentenceRangeSegments(ranges) {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range, sourceIndex) => ({
      startSentenceIndex: Number(range?.sentence_start) - 1,
      endSentenceIndex: Number(range?.sentence_end) - 1,
      sourceIndex,
    }))
    .filter(
      (range) =>
        Number.isInteger(range.startSentenceIndex) &&
        Number.isInteger(range.endSentenceIndex) &&
        range.startSentenceIndex >= 0 &&
        range.endSentenceIndex >= range.startSentenceIndex,
    )
    .sort((left, right) => {
      if (left.startSentenceIndex !== right.startSentenceIndex) {
        return left.startSentenceIndex - right.startSentenceIndex;
      }
      if (left.endSentenceIndex !== right.endSentenceIndex) {
        return left.endSentenceIndex - right.endSentenceIndex;
      }
      return left.sourceIndex - right.sourceIndex;
    });
}

/**
 * @param {Object} topic
 * @returns {TopicIndexRangeSegment[]}
 */
function getTopicSegments(topic) {
  const rangeSegments = buildSentenceRangeSegments(topic?.ranges);
  if (rangeSegments.length > 0) {
    return rangeSegments;
  }

  const sentenceSegments = buildConsecutiveSentenceSegments(topic?.sentences);
  if (sentenceSegments.length > 0) {
    return sentenceSegments;
  }

  return [];
}

/**
 * @param {number} sentenceCount
 * @param {number} charCount
 * @returns {number}
 */
function computeRangeHeight(sentenceCount, charCount) {
  const safeSentenceCount =
    Number.isFinite(sentenceCount) && sentenceCount > 0 ? sentenceCount : 0;
  const safeCharCount =
    Number.isFinite(charCount) && charCount > 0
      ? charCount
      : safeSentenceCount * ESTIMATED_SENTENCE_CHAR_COUNT;
  return Math.min(
    MAX_TILE_HEIGHT,
    Math.max(
      MIN_TILE_HEIGHT,
      MIN_TILE_HEIGHT + safeCharCount * PER_RANGE_CHAR_PX,
    ),
  );
}

/**
 * @param {string[]} sentences
 * @param {TopicIndexRangeSegment} segment
 * @param {Object} topic
 * @returns {number}
 */
function computeSegmentCharCount(sentences, segment, topic) {
  let charCount = 0;
  for (
    let index = segment.startSentenceIndex;
    index <= segment.endSentenceIndex;
    index += 1
  ) {
    charCount += stringifySentence(sentences[index]).length;
  }

  if (charCount > 0) {
    return charCount;
  }

  const range = Array.isArray(topic?.ranges)
    ? topic.ranges[segment.sourceIndex]
    : null;
  const rangeStart = Number(range?.start);
  const rangeEnd = Number(range?.end);
  if (
    Number.isFinite(rangeStart) &&
    Number.isFinite(rangeEnd) &&
    rangeEnd > rangeStart
  ) {
    return rangeEnd - rangeStart;
  }

  const sentenceCount =
    segment.endSentenceIndex - segment.startSentenceIndex + 1;
  return sentenceCount * ESTIMATED_SENTENCE_CHAR_COUNT;
}

/** @param {TopicIndexViewProps} props */
function TopicIndexView({
  articles,
  safeTopics,
  readTopics,
  onToggleRead,
  onClose,
  onShowInArticle,
}) {
  const articleContext = useArticle();
  const article =
    Array.isArray(articles) && articles.length > 0 ? articles[0] : null;
  const contextMarkup = articleContext?.markup;
  const articleSentences = useMemo(
    () =>
      (Array.isArray(article?.sentences) ? article.sentences : []).map(
        stringifySentence,
      ),
    [article?.sentences],
  );

  const deduplicatedTopics = useMemo(() => {
    const seen = new Set();
    const result = [];
    (Array.isArray(safeTopics) ? safeTopics : []).forEach((topic) => {
      if (!topic?.name || seen.has(topic.name)) {
        return;
      }
      seen.add(topic.name);
      result.push(topic);
    });
    return result;
  }, [safeTopics]);

  const articleTfIdfIndex = useMemo(
    () => buildArticleTfIdfIndex(article?.sentences || []),
    [article?.sentences],
  );

  const topicTagCloudMap = useMemo(() => {
    const tagsByTopicName = new Map();
    deduplicatedTopics.forEach((topic) => {
      if (!topic?.name || tagsByTopicName.has(topic.name)) {
        return;
      }
      tagsByTopicName.set(
        topic.name,
        buildTopicTagCloud(topic, articleTfIdfIndex),
      );
    });
    return tagsByTopicName;
  }, [deduplicatedTopics, articleTfIdfIndex]);

  const noteAccentStyleSheet = useMemo(() => {
    const seen = new Set();
    const lines = [];
    deduplicatedTopics.forEach((topic) => {
      const cssClass = getTopicCSSClass(topic.name);
      if (seen.has(cssClass)) {
        return;
      }
      seen.add(cssClass);
      lines.push(
        `.${cssClass} { --topic-accent-color: ${getTopicAccentColor(topic.name)}; }`,
      );
    });
    return lines.join("\n");
  }, [deduplicatedTopics]);

  const rangeTiles = useMemo(() => {
    /** @type {TopicIndexTile[]} */
    const tiles = [];
    deduplicatedTopics.forEach((topic, topicIndex) => {
      const segments = getTopicSegments(topic);
      segments.forEach((segment, segmentIndex) => {
        const sentenceCount =
          segment.endSentenceIndex - segment.startSentenceIndex + 1;
        const charCount = computeSegmentCharCount(
          articleSentences,
          segment,
          topic,
        );
        tiles.push({
          key: `${topic.name}::${segmentIndex}`,
          topic,
          segment,
          topicIndex,
          segmentIndex,
          sentenceCount,
          charCount,
          heightClassName: `topic-index-view__tile-height-${topicIndex}-${segmentIndex}`,
        });
      });
    });
    tiles.sort((a, b) => {
      if (a.segment.startSentenceIndex !== b.segment.startSentenceIndex) {
        return a.segment.startSentenceIndex - b.segment.startSentenceIndex;
      }
      if (a.segment.endSentenceIndex !== b.segment.endSentenceIndex) {
        return a.segment.endSentenceIndex - b.segment.endSentenceIndex;
      }
      if (a.topicIndex !== b.topicIndex) {
        return a.topicIndex - b.topicIndex;
      }
      return a.segment.sourceIndex - b.segment.sourceIndex;
    });
    return tiles;
  }, [deduplicatedTopics, articleSentences]);

  const tileHeightStyleSheet = useMemo(
    () =>
      rangeTiles
        .map((tile) => {
          const tileHeight = computeRangeHeight(
            tile.sentenceCount,
            tile.charCount,
          );
          return `.${tile.heightClassName} { --topic-row-height: ${tileHeight}px; }`;
        })
        .join("\n"),
    [rangeTiles],
  );

  const scrollRef = useRef(null);
  const [visibleTopLevelLabels, setVisibleTopLevelLabels] = useState([]);
  const [sentencesModalTopic, setSentencesModalTopic] = useState(null);

  const handleCloseSentencesModal = useCallback(() => {
    setSentencesModalTopic(null);
  }, []);

  const handleShowSentences = useCallback((topic) => {
    setSentencesModalTopic(buildModalSelectionFromTopic(topic));
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!(container instanceof HTMLElement)) {
      return undefined;
    }

    const updateVisibleLabels = () => {
      const containerRect = container.getBoundingClientRect();
      const labels = [];
      const seen = new Set();
      const tileElements = container.querySelectorAll("[data-top-level-label]");
      for (let i = 0; i < tileElements.length; i += 1) {
        const el = tileElements[i];
        const tileRect = el.getBoundingClientRect();
        if (
          tileRect.bottom > containerRect.top &&
          tileRect.top < containerRect.bottom
        ) {
          const label = el.getAttribute("data-top-level-label");
          if (label && !seen.has(label)) {
            seen.add(label);
            labels.push(label);
          }
        }
      }
      setVisibleTopLevelLabels((prev) => {
        const prevKey = prev.join("\0");
        const nextKey = labels.join("\0");
        return prevKey === nextKey ? prev : labels;
      });
    };

    container.addEventListener("scroll", updateVisibleLabels, {
      passive: true,
    });
    updateVisibleLabels();

    return () => container.removeEventListener("scroll", updateVisibleLabels);
  }, [rangeTiles]);

  const handleToggleRead = useCallback(
    (topic) => {
      const normalizedTopic = buildNormalizedTopicSelection(topic);
      const isRead = normalizedTopic
        ? normalizedTopic.canonicalTopicNames.every((name) =>
            isTopicRead(name, readTopics),
          )
        : false;

      if (!normalizedTopic) {
        return;
      }

      const ranges = normalizedTopic?.ranges;
      if (Array.isArray(ranges) && ranges.length > 1 && !isRead) {
        const ok = window.confirm(
          `"${normalizedTopic.name}" has ${ranges.length} separate ranges. Some may not be visible on screen. Mark as read?`,
        );
        if (!ok) {
          return;
        }
      }

      onToggleRead(normalizedTopic);
    },
    [readTopics, onToggleRead],
  );

  return (
    <FullScreenGraph title="Topic Index" onClose={onClose}>
      <div className="topic-index-view">
        {noteAccentStyleSheet ? <style>{noteAccentStyleSheet}</style> : null}
        {tileHeightStyleSheet ? <style>{tileHeightStyleSheet}</style> : null}
        <div className="topic-index-view__body">
          <div className="topic-index-view__scroll" ref={scrollRef}>
            <div className="topic-index-view__canvas">
              <div className="topic-index-view__left-rail">
                {visibleTopLevelLabels.length > 0 ? (
                  <div
                    className="topic-index-view__current-area"
                    aria-label="Current topic areas"
                  >
                    {visibleTopLevelLabels.map((label) => (
                      <span
                        key={label}
                        className="topic-index-view__current-area-label"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="topic-index-view__tile-column">
                {rangeTiles.length === 0 ? (
                  <p className="topic-index-view__empty">
                    No topics available.
                  </p>
                ) : (
                  rangeTiles.map((tile) => {
                    const topic = tile.topic;
                    const pathSegments = splitTopicPath(topic.name);
                    const normalizedPathSegments =
                      pathSegments.length > 0 ? pathSegments : [topic.name];
                    const noteTitleLines =
                      normalizedPathSegments.length > 1
                        ? normalizedPathSegments.slice(1)
                        : [topic.name];
                    const topLevelLabel =
                      normalizedPathSegments[0] || topic.name;
                    const cssClass = getTopicCSSClass(topic.name);
                    const isRead = isTopicRead(topic.name, readTopics);
                    const tags = topicTagCloudMap.get(topic.name) || [];

                    return (
                      <div
                        key={tile.key}
                        className={`topic-index-view__tile ${tile.heightClassName} ${cssClass}${isRead ? " topic-index-view__tile--read" : ""}`}
                        data-top-level-label={topLevelLabel}
                        data-topic-name={topic.name}
                        data-topic-segment-key={tile.key}
                        data-topic-range-chars={tile.charCount}
                      >
                        <div className="topic-index-view__tile-content">
                          <div className="topic-index-view__tile-info">
                            <span className="topic-index-view__tile-eyebrow">
                              {topLevelLabel}
                            </span>
                            <span className="topic-index-view__tile-name">
                              {noteTitleLines.map((line, index) => (
                                <span
                                  key={`${topic.name}-${index}-${line}`}
                                  className="topic-index-view__tile-name-line"
                                >
                                  {onShowInArticle ? (
                                    <button
                                      type="button"
                                      className="topic-index-view__tile-name-link"
                                      onClick={() => {
                                        onShowInArticle(
                                          buildNormalizedTopicSelection(topic),
                                        );
                                      }}
                                      title="Show in article"
                                    >
                                      {line}
                                    </button>
                                  ) : (
                                    line
                                  )}
                                </span>
                              ))}
                            </span>
                            <span className="topic-index-view__tile-count">
                              {tile.sentenceCount} sentence
                              {tile.sentenceCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {tags.length > 0 ? (
                            <span
                              className="topic-index-view__tile-tags"
                              aria-label={`Key tags for ${topic.name}`}
                            >
                              {tags.map((tag) => (
                                <span
                                  key={`${topic.name}-${tag.label}`}
                                  className={`topic-index-view__tile-tag topic-index-view__tile-tag--${tag.sizeClass}`}
                                  title={`${tag.label} (${tag.count})`}
                                >
                                  {tag.label}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </div>
                        <div className="topic-index-view__tile-actions">
                          <button
                            type="button"
                            className={`topic-index-view__read-btn${isRead ? " topic-index-view__read-btn--active" : ""}`}
                            onClick={() => handleToggleRead(topic)}
                          >
                            {isRead ? "Mark unread" : "Mark as read"}
                          </button>
                          <button
                            type="button"
                            className="topic-index-view__sentences-btn"
                            onClick={() => handleShowSentences(topic)}
                            title="View sentences"
                          >
                            View sentences
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {sentencesModalTopic && (
        <TopicSentencesModal
          topic={sentencesModalTopic}
          sentences={sentencesModalTopic._sentences || articleSentences}
          onClose={handleCloseSentencesModal}
          onShowInArticle={onShowInArticle}
          markup={contextMarkup}
          allTopics={safeTopics}
          readTopics={readTopics}
          onToggleRead={onToggleRead}
        />
      )}
    </FullScreenGraph>
  );
}

export default React.memo(TopicIndexView);
