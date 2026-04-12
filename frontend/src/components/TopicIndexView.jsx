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
const TOPIC_TILE_META_ORDER = [
  "tags",
  "summary",
  "subtopics",
  "latent_topics",
  "clusters",
];

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
 * @typedef {Object} TopicIndexLatentTopicItem
 * @property {number} id
 * @property {string[]} keywords
 * @property {number} score
 * @property {number} weight
 */

/**
 * @typedef {Object} TopicIndexClusterItem
 * @property {number} clusterId
 * @property {string[]} keywords
 * @property {number} sentenceCount
 */

/**
 * @typedef {Object} TopicIndexMetaCategory
 * @property {"tags"|"summary"|"subtopics"|"latent_topics"|"clusters"} key
 * @property {string} label
 * @property {TopicIndexTagItem[]=} tags
 * @property {string=} summary
 * @property {TopicIndexSubtopicItem[]=} subtopics
 * @property {TopicIndexLatentTopicItem[]=} latentTopics
 * @property {TopicIndexClusterItem[]=} clusters
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
function sliceKeywords(keywords, limit) {
  return (Array.isArray(keywords) ? keywords : [])
    .filter((keyword) => typeof keyword === "string" && keyword.trim())
    .slice(0, limit);
}

/**
 * @param {string} value
 * @returns {string}
 */
function truncateTileText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length <= 160) {
    return text;
  }
  return `${text.slice(0, 157).trimEnd()}...`;
}

/**
 * @param {Object} topic
 * @param {Map<string, TopicIndexTagItem[]>} topicTagCloudMap
 * @param {Record<string, string>} topicSummaries
 * @param {Map<string, TopicIndexSubtopicItem[]>} subtopicsByParent
 * @param {Map<string, TopicIndexLatentTopicItem[]>} latentTopicsByTopic
 * @param {Map<string, TopicIndexClusterItem[]>} clustersByTopic
 * @returns {TopicIndexMetaCategory[]}
 */
function buildTopicTileMetaCategories(
  topic,
  topicTagCloudMap,
  topicSummaries,
  subtopicsByParent,
  latentTopicsByTopic,
  clustersByTopic,
) {
  /** @type {Record<string, TopicIndexMetaCategory|null>} */
  const categoriesByKey = {
    tags: null,
    summary: null,
    subtopics: null,
    latent_topics: null,
    clusters: null,
  };

  const tags = topicTagCloudMap.get(topic.name) || [];
  if (tags.length > 0) {
    categoriesByKey.tags = {
      key: "tags",
      label: "Tags",
      tags,
    };
  }

  const summary = truncateTileText(topicSummaries[topic.name] || "");
  if (summary) {
    categoriesByKey.summary = {
      key: "summary",
      label: "Summary",
      summary,
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

  const latentTopics = latentTopicsByTopic.get(topic.name) || [];
  if (latentTopics.length > 0) {
    categoriesByKey.latent_topics = {
      key: "latent_topics",
      label: "Latent Topics",
      latentTopics,
    };
  }

  const clusters = clustersByTopic.get(topic.name) || [];
  if (clusters.length > 0) {
    categoriesByKey.clusters = {
      key: "clusters",
      label: "Clusters",
      clusters,
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
  const topicSummaries = articleContext?.topicSummaries || {};
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

  const latentTopicsByTopic = useMemo(() => {
    /** @type {Map<number, { id: number, keywords: string[], weight: number }>} */
    const latentTopicById = new Map();
    const rawLatentTopics = Array.isArray(
      submissionResults?.topic_model?.latent_topics,
    )
      ? submissionResults.topic_model.latent_topics
      : [];
    const rawTopicMappings = Array.isArray(
      submissionResults?.topic_model?.topic_mapping,
    )
      ? submissionResults.topic_model.topic_mapping
      : [];

    rawLatentTopics.forEach((latentTopic) => {
      if (!Number.isInteger(latentTopic?.id)) {
        return;
      }
      latentTopicById.set(latentTopic.id, {
        id: latentTopic.id,
        keywords: sliceKeywords(latentTopic?.keywords, 4),
        weight: Number(latentTopic?.weight) || 0,
      });
    });

    /** @type {Map<string, TopicIndexLatentTopicItem[]>} */
    const groupedLatentTopics = new Map();
    rawTopicMappings.forEach((mapping) => {
      const topicName =
        typeof mapping?.topic_name === "string" ? mapping.topic_name : "";
      if (!topicName) {
        return;
      }

      const relevantItems = (
        Array.isArray(mapping?.latent_topic_ids) ? mapping.latent_topic_ids : []
      )
        .map((latentTopicId, index) => {
          const latentTopic = latentTopicById.get(latentTopicId);
          if (!latentTopic) {
            return null;
          }
          return {
            id: latentTopic.id,
            keywords: latentTopic.keywords,
            score: Number(mapping?.scores?.[index]) || 0,
            weight: latentTopic.weight,
          };
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score)
        .slice(0, 2);

      if (relevantItems.length > 0) {
        groupedLatentTopics.set(topicName, relevantItems);
      }
    });

    return groupedLatentTopics;
  }, [
    submissionResults?.topic_model?.latent_topics,
    submissionResults?.topic_model?.topic_mapping,
  ]);

  const clustersByTopic = useMemo(() => {
    /** @type {Map<string, TopicIndexClusterItem[]>} */
    const groupedClusters = new Map();
    const rawClusters = Array.isArray(submissionResults?.clusters)
      ? submissionResults.clusters
      : [];

    deduplicatedTopics.forEach((topic) => {
      const topicSentenceSet = new Set(
        Array.isArray(topic?.sentences) ? topic.sentences : [],
      );
      if (topicSentenceSet.size === 0) {
        return;
      }

      const relevantClusters = rawClusters
        .map((cluster) => {
          const overlappingSentenceCount = (
            Array.isArray(cluster?.sentence_indices)
              ? cluster.sentence_indices
              : []
          ).filter((sentenceIndex) =>
            topicSentenceSet.has(sentenceIndex),
          ).length;
          if (overlappingSentenceCount === 0) {
            return null;
          }
          return {
            clusterId: Number(cluster?.cluster_id) || 0,
            keywords: sliceKeywords(cluster?.keywords, 3),
            sentenceCount: overlappingSentenceCount,
          };
        })
        .filter(Boolean)
        .sort((left, right) => right.sentenceCount - left.sentenceCount)
        .slice(0, 2);

      if (relevantClusters.length > 0) {
        groupedClusters.set(topic.name, relevantClusters);
      }
    });

    return groupedClusters;
  }, [deduplicatedTopics, submissionResults?.clusters]);

  const tileMetaCategoriesByTopic = useMemo(() => {
    /** @type {Map<string, TopicIndexMetaCategory[]>} */
    const categoriesByTopicName = new Map();
    deduplicatedTopics.forEach((topic) => {
      categoriesByTopicName.set(
        topic.name,
        buildTopicTileMetaCategories(
          topic,
          topicTagCloudMap,
          topicSummaries,
          subtopicsByParent,
          latentTopicsByTopic,
          clustersByTopic,
        ),
      );
    });
    return categoriesByTopicName;
  }, [
    deduplicatedTopics,
    topicTagCloudMap,
    topicSummaries,
    subtopicsByParent,
    latentTopicsByTopic,
    clustersByTopic,
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
                                {activeMetaCategory.key === "summary" ? (
                                  <p className="topic-index-view__tile-summary">
                                    {activeMetaCategory.summary}
                                  </p>
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
                                {activeMetaCategory.key === "latent_topics"
                                  ? activeMetaCategory.latentTopics.map(
                                      (latentTopic) => {
                                        const targetKeyword =
                                          latentTopic.keywords[0] ||
                                          `Latent Topic ${latentTopic.id + 1}`;
                                        return (
                                          <a
                                            key={`${topic.name}-${latentTopic.id}`}
                                            className="topic-index-view__tile-meta-item topic-index-view__tile-meta-item--link"
                                            href={`/page/word/${submissionId || "unknown"}/${encodeURIComponent(targetKeyword)}`}
                                            onClick={stopTileClickPropagation}
                                          >
                                            <span className="topic-index-view__tile-meta-item-title">
                                              {targetKeyword}
                                            </span>
                                            <span className="topic-index-view__tile-meta-item-detail">
                                              {sliceKeywords(
                                                latentTopic.keywords,
                                                3,
                                              ).join(", ")}
                                              {` · ${(
                                                latentTopic.score * 100
                                              ).toFixed(1)}%`}
                                            </span>
                                          </a>
                                        );
                                      },
                                    )
                                  : null}
                                {activeMetaCategory.key === "clusters"
                                  ? activeMetaCategory.clusters.map(
                                      (cluster) => (
                                        <div
                                          key={`${topic.name}-cluster-${cluster.clusterId}`}
                                          className="topic-index-view__tile-meta-item"
                                        >
                                          <span className="topic-index-view__tile-meta-item-title">
                                            Cluster {cluster.clusterId + 1}
                                          </span>
                                          <span className="topic-index-view__tile-meta-item-detail">
                                            {cluster.keywords.join(", ")}
                                            {cluster.keywords.length > 0
                                              ? " · "
                                              : ""}
                                            {cluster.sentenceCount} sentence
                                            {cluster.sentenceCount === 1
                                              ? ""
                                              : "s"}
                                          </span>
                                        </div>
                                      ),
                                    )
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
