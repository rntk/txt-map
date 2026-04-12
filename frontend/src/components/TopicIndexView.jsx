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
import {
  buildArticleTfIdfIndex,
  buildTopicKeyPhrases,
  buildTopicTagCloud,
} from "../utils/gridUtils";
import { useArticle } from "../contexts/ArticleContext";

const MIN_TILE_HEIGHT = 44;
const PER_RANGE_CHAR_PX = 0.28;
const ESTIMATED_SENTENCE_CHAR_COUNT = 90;
const MAX_TILE_HEIGHT = 180;
const TOPIC_TILE_META_ORDER = ["key_phrases", "subtopics", "tags"];

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
 * @typedef {Object} TopicIndexTagItem
 * @property {string} label
 * @property {number} count
 * @property {string} sizeClass
 */

/**
 * @typedef {Object} TopicIndexSubtopicItem
 * @property {string} name
 * @property {number} sentenceCount
 */

/**
 * @typedef {Object} TopicIndexKeyPhraseItem
 * @property {string} label
 * @property {number} score
 * @property {string} sizeClass
 * @property {boolean} isBigram
 */

/**
 * @typedef {Object} TopicIndexMetaCategory
 * @property {"key_phrases"|"subtopics"|"tags"} key
 * @property {string} label
 * @property {TopicIndexKeyPhraseItem[]=} phrases
 * @property {string=} representativeSentence
 * @property {TopicIndexSubtopicItem[]=} subtopics
 * @property {TopicIndexTagItem[]=} tags
 */

/**
 * @typedef {Object.<string, number>} TopicIndexTileMetaIndexMap
 */

/**
 * @typedef {Object} TopicIndexViewProps
 * @property {Array<Object>} articles
 * @property {Array<Object>} safeTopics
 * @property {Set<string> | string[]} readTopics
 * @property {(topic: Object) => void} onToggleRead
 * @property {() => void} onClose
 * @property {(topic: Object) => void} [onShowInArticle]
 * @property {string|null} [scrollToTopic] - Topic name to scroll into view
 * @property {() => void} [onScrolledToTopic] - Called after scrolling completes
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
      charStart: Number(range?.start),
    }))
    .filter(
      (range) =>
        Number.isInteger(range.startSentenceIndex) &&
        Number.isInteger(range.endSentenceIndex) &&
        range.startSentenceIndex >= 0 &&
        range.endSentenceIndex >= range.startSentenceIndex,
    )
    .sort((left, right) => {
      if (
        Number.isFinite(left.charStart) &&
        Number.isFinite(right.charStart) &&
        left.charStart !== right.charStart
      ) {
        return left.charStart - right.charStart;
      }
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

/**
 * @param {MouseEvent | React.MouseEvent<HTMLElement>} event
 * @returns {void}
 */
function stopTileClickPropagation(event) {
  event.stopPropagation();
}

/**
 * @param {string[]} keywords
 * @param {number} limit
 * @returns {string[]}
 */
/**
 * @param {Object} topic
 * @param {Map<string, { phrases: TopicIndexKeyPhraseItem[], representativeSentence: string }>} topicKeyPhrasesMap
 * @param {Map<string, TopicIndexTagItem[]>} topicTagCloudMap
 * @param {Map<string, TopicIndexSubtopicItem[]>} subtopicsByParent
 * @returns {TopicIndexMetaCategory[]}
 */
function buildTopicTileMetaCategories(
  topic,
  topicKeyPhrasesMap,
  topicTagCloudMap,
  subtopicsByParent,
) {
  /** @type {Record<string, TopicIndexMetaCategory|null>} */
  const categoriesByKey = {
    key_phrases: null,
    subtopics: null,
    tags: null,
  };

  const keyPhraseData = topicKeyPhrasesMap.get(topic.name);
  if (keyPhraseData && keyPhraseData.phrases.length > 0) {
    categoriesByKey.key_phrases = {
      key: "key_phrases",
      label: "Key Phrases",
      phrases: keyPhraseData.phrases,
      representativeSentence: keyPhraseData.representativeSentence,
    };
  }

  const subtopics = subtopicsByParent.get(topic.name) || [];
  if (subtopics.length > 0) {
    categoriesByKey.subtopics = {
      key: "subtopics",
      label: "Subtopics",
      subtopics,
    };
  }

  const tags = topicTagCloudMap.get(topic.name) || [];
  if (tags.length > 0) {
    categoriesByKey.tags = {
      key: "tags",
      label: "Tags",
      tags,
    };
  }

  return TOPIC_TILE_META_ORDER.map((key) => categoriesByKey[key]).filter(
    Boolean,
  );
}

/** @param {TopicIndexViewProps} props */
function TopicIndexView({
  articles,
  submissionId,
  safeTopics,
  readTopics,
  onToggleRead,
  onClose,
  onShowInArticle,
  scrollToTopic,
  onScrolledToTopic,
}) {
  const articleContext = useArticle();
  const article =
    Array.isArray(articles) && articles.length > 0 ? articles[0] : null;
  const submissionResults = articleContext?.submission?.results || {};
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

  const subtopicsByParent = useMemo(() => {
    /** @type {Map<string, TopicIndexSubtopicItem[]>} */
    const groupedSubtopics = new Map();
    const rawSubtopics = Array.isArray(submissionResults?.subtopics)
      ? submissionResults.subtopics
      : [];

    rawSubtopics.forEach((subtopic) => {
      const parentTopicName =
        typeof subtopic?.parent_topic === "string" ? subtopic.parent_topic : "";
      const subtopicName =
        typeof subtopic?.name === "string" ? subtopic.name : "";
      if (!parentTopicName || !subtopicName) {
        return;
      }

      const entry = groupedSubtopics.get(parentTopicName) || [];
      entry.push({
        name: subtopicName,
        sentenceCount: Array.isArray(subtopic?.sentences)
          ? subtopic.sentences.length
          : 0,
      });
      groupedSubtopics.set(parentTopicName, entry);
    });

    groupedSubtopics.forEach((items, key) => {
      groupedSubtopics.set(
        key,
        items
          .slice()
          .sort((left, right) => right.sentenceCount - left.sentenceCount)
          .slice(0, 3),
      );
    });

    return groupedSubtopics;
  }, [submissionResults?.subtopics]);

  const topicKeyPhrasesMap = useMemo(() => {
    /** @type {Map<string, { phrases: TopicIndexKeyPhraseItem[], representativeSentence: string }>} */
    const phrasesByTopicName = new Map();
    deduplicatedTopics.forEach((topic) => {
      if (!topic?.name || phrasesByTopicName.has(topic.name)) {
        return;
      }
      phrasesByTopicName.set(
        topic.name,
        buildTopicKeyPhrases(topic, articleTfIdfIndex, articleSentences),
      );
    });
    return phrasesByTopicName;
  }, [deduplicatedTopics, articleTfIdfIndex, articleSentences]);

  const tileMetaCategoriesByTopic = useMemo(() => {
    /** @type {Map<string, TopicIndexMetaCategory[]>} */
    const categoriesByTopicName = new Map();
    deduplicatedTopics.forEach((topic) => {
      categoriesByTopicName.set(
        topic.name,
        buildTopicTileMetaCategories(
          topic,
          topicKeyPhrasesMap,
          topicTagCloudMap,
          subtopicsByParent,
        ),
      );
    });
    return categoriesByTopicName;
  }, [
    deduplicatedTopics,
    topicKeyPhrasesMap,
    topicTagCloudMap,
    subtopicsByParent,
  ]);

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
      if (
        Number.isFinite(a.segment.charStart) &&
        Number.isFinite(b.segment.charStart) &&
        a.segment.charStart !== b.segment.charStart
      ) {
        return a.segment.charStart - b.segment.charStart;
      }
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
  const [activeTileKey, setActiveTileKey] = useState(null);
  const [tileMetaIndexByKey, setTileMetaIndexByKey] = useState(
    /** @type {TopicIndexTileMetaIndexMap} */ ({}),
  );

  const handleCloseSentencesModal = useCallback(() => {
    setSentencesModalTopic(null);
  }, []);

  const handleShowSentences = useCallback((topic) => {
    setSentencesModalTopic(buildModalSelectionFromTopic(topic));
  }, []);

  const handleTileClick = useCallback((tileKey) => {
    setActiveTileKey((prev) => (prev === tileKey ? null : tileKey));
  }, []);

  const handleSwitchTileMeta = useCallback((tileKey, categoryCount, delta) => {
    if (!Number.isFinite(categoryCount) || categoryCount <= 1) {
      return;
    }

    setTileMetaIndexByKey((prev) => {
      const currentIndex = Number.isInteger(prev[tileKey]) ? prev[tileKey] : 0;
      const nextIndex =
        (((currentIndex + delta) % categoryCount) + categoryCount) %
        categoryCount;
      return {
        ...prev,
        [tileKey]: nextIndex,
      };
    });
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

  useEffect(() => {
    if (!scrollToTopic) {
      return;
    }
    const container = scrollRef.current;
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const targetEl = container.querySelector(
      `[data-topic-name="${CSS.escape(scrollToTopic)}"]`,
    );
    if (targetEl instanceof HTMLElement) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      if (onScrolledToTopic) {
        onScrolledToTopic();
      }
    }
  }, [scrollToTopic, onScrolledToTopic, rangeTiles]);

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
                    const metaCategories =
                      tileMetaCategoriesByTopic.get(topic.name) || [];
                    const activeMetaIndexRaw = tileMetaIndexByKey[tile.key];
                    const activeMetaIndex =
                      metaCategories.length > 0
                        ? Number.isInteger(activeMetaIndexRaw)
                          ? activeMetaIndexRaw % metaCategories.length
                          : 0
                        : -1;
                    const activeMetaCategory =
                      activeMetaIndex >= 0
                        ? metaCategories[activeMetaIndex]
                        : null;
                    const hasMetaSwitcher = metaCategories.length > 1;
                    const previousMetaCategory =
                      hasMetaSwitcher && activeMetaIndex >= 0
                        ? metaCategories[
                            (activeMetaIndex - 1 + metaCategories.length) %
                              metaCategories.length
                          ]
                        : null;
                    const nextMetaCategory =
                      hasMetaSwitcher && activeMetaIndex >= 0
                        ? metaCategories[
                            (activeMetaIndex + 1) % metaCategories.length
                          ]
                        : null;

                    return (
                      <div
                        key={tile.key}
                        className={`topic-index-view__tile ${tile.heightClassName} ${cssClass}${isRead ? " topic-index-view__tile--read" : ""}${activeTileKey === tile.key ? " topic-index-view__tile--active" : ""}`}
                        onClick={() => handleTileClick(tile.key)}
                        data-top-level-label={topLevelLabel}
                        data-topic-name={topic.name}
                        data-topic-segment-key={tile.key}
                        data-topic-range-chars={tile.charCount}
                      >
                        <div className="topic-index-view__tile-content">
                          <div className="topic-index-view__tile-info">
                            <span className="topic-index-view__tile-name">
                              {noteTitleLines.map((line, index) => {
                                const isLeaf =
                                  index === noteTitleLines.length - 1;
                                return (
                                  <span
                                    key={`${topic.name}-${index}-${line}`}
                                    className={`topic-index-view__tile-name-line ${isLeaf ? "topic-index-view__tile-name-line--leaf" : "topic-index-view__tile-name-line--parent"}`}
                                  >
                                    {onShowInArticle ? (
                                      <button
                                        type="button"
                                        className="topic-index-view__tile-name-link"
                                        onClick={(event) => {
                                          stopTileClickPropagation(event);
                                          onShowInArticle(
                                            buildNormalizedTopicSelection(
                                              topic,
                                            ),
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
                                );
                              })}
                            </span>
                            <span className="topic-index-view__tile-count">
                              {tile.sentenceCount} sentence
                              {tile.sentenceCount === 1 ? "" : "s"}
                            </span>
                          </div>
                          {activeMetaCategory ? (
                            <div
                              className="topic-index-view__tile-meta"
                              aria-label={`${activeMetaCategory.label} for ${topic.name}`}
                            >
                              <div className="topic-index-view__tile-meta-label">
                                <span className="topic-index-view__tile-meta-title">
                                  {activeMetaCategory.label}
                                </span>
                              </div>
                              {hasMetaSwitcher ? (
                                <div className="topic-index-view__tile-meta-nav">
                                  <div className="topic-index-view__tile-meta-buttons">
                                    <button
                                      type="button"
                                      className="topic-index-view__tile-meta-button"
                                      aria-label={`Show previous ${previousMetaCategory?.label || "metadata"} for ${topic.name}`}
                                      title={previousMetaCategory?.label || ""}
                                      onClick={(event) => {
                                        stopTileClickPropagation(event);
                                        handleSwitchTileMeta(
                                          tile.key,
                                          metaCategories.length,
                                          -1,
                                        );
                                      }}
                                    >
                                      {previousMetaCategory?.label}
                                    </button>
                                    <button
                                      type="button"
                                      className="topic-index-view__tile-meta-button"
                                      aria-label={`Show next ${nextMetaCategory?.label || "metadata"} for ${topic.name}`}
                                      title={nextMetaCategory?.label || ""}
                                      onClick={(event) => {
                                        stopTileClickPropagation(event);
                                        handleSwitchTileMeta(
                                          tile.key,
                                          metaCategories.length,
                                          1,
                                        );
                                      }}
                                    >
                                      {nextMetaCategory?.label}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              <div
                                className="topic-index-view__tile-meta-content"
                                onClick={(event) => {
                                  stopTileClickPropagation(event);
                                  handleSwitchTileMeta(
                                    tile.key,
                                    metaCategories.length,
                                    1,
                                  );
                                }}
                              >
                                {activeMetaCategory.key === "key_phrases" ? (
                                  <>
                                    <div className="topic-index-view__tile-keyphrases">
                                      {activeMetaCategory.phrases.map(
                                        (phrase) => {
                                          const label = phrase.label;
                                          const displayLabel =
                                            label.length > 25
                                              ? `${label.substring(0, 25)}...`
                                              : label;
                                          return (
                                            <a
                                              key={`${topic.name}-${label}`}
                                              className={`topic-index-view__tile-keyphrase topic-index-view__tile-tag--${phrase.sizeClass}`}
                                              href={`/page/word/${submissionId || "unknown"}/${encodeURIComponent(label)}`}
                                              title={label}
                                              onClick={stopTileClickPropagation}
                                            >
                                              {displayLabel}
                                            </a>
                                          );
                                        },
                                      )}
                                    </div>
                                    {activeMetaCategory.representativeSentence ? (
                                      <p className="topic-index-view__tile-excerpt">
                                        {
                                          activeMetaCategory.representativeSentence
                                        }
                                      </p>
                                    ) : null}
                                  </>
                                ) : null}
                                {activeMetaCategory.key === "subtopics"
                                  ? activeMetaCategory.subtopics.map(
                                      (subtopic) => (
                                        <div
                                          key={`${topic.name}-${subtopic.name}`}
                                          className="topic-index-view__tile-meta-item"
                                        >
                                          <span className="topic-index-view__tile-meta-item-title">
                                            {subtopic.name}
                                          </span>
                                          <span className="topic-index-view__tile-meta-item-detail">
                                            {subtopic.sentenceCount} sentence
                                            {subtopic.sentenceCount === 1
                                              ? ""
                                              : "s"}
                                          </span>
                                        </div>
                                      ),
                                    )
                                  : null}
                                {activeMetaCategory.key === "tags"
                                  ? activeMetaCategory.tags.map((tag) => {
                                      const label = tag.label;
                                      const displayLabel =
                                        label.length > 10
                                          ? `${label.substring(0, 10)}...`
                                          : label;
                                      return (
                                        <a
                                          key={`${topic.name}-${label}`}
                                          className={`topic-index-view__tile-tag topic-index-view__tile-tag--${tag.sizeClass}`}
                                          href={`/page/word/${submissionId || "unknown"}/${encodeURIComponent(label)}`}
                                          title={`${label} (${tag.count})`}
                                          onClick={stopTileClickPropagation}
                                        >
                                          {displayLabel}
                                        </a>
                                      );
                                    })
                                  : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="topic-index-view__tile-actions">
                          <button
                            type="button"
                            className={`topic-index-view__read-btn${isRead ? " topic-index-view__read-btn--active" : ""}`}
                            onClick={(event) => {
                              stopTileClickPropagation(event);
                              handleToggleRead(topic);
                            }}
                          >
                            {isRead ? "Mark unread" : "Mark as read"}
                          </button>
                          <button
                            type="button"
                            className="topic-index-view__sentences-btn"
                            onClick={(event) => {
                              stopTileClickPropagation(event);
                              handleShowSentences(topic);
                            }}
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
