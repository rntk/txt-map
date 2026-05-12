import { useMemo } from "react";
import {
  getTopicDisplayName,
  getTopicSentenceNumbers,
  getTopicTextRange,
} from "./utils";
import { useRailLayout } from "./useRailLayout";

export const DEFAULT_TOPIC_TAG_VISIBLE_COUNT = 4;
export const TOPIC_TAGS_PER_LOAD = 4;

/**
 * @typedef {{tag: string, score: number}} TopicTagRankingEntry
 * @typedef {{name?: string, fullPath?: string, sentences?: number[]}} Topic
 */

/**
 * @param {unknown} value
 * @returns {Array<{tag: string, score: number}>}
 */
function normalizeRankedTags(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const tag =
        typeof entry.tag === "string" ? entry.tag.trim().toLowerCase() : "";
      const score = Math.max(0, Math.min(100, Math.round(Number(entry.score))));
      if (!tag || !Number.isFinite(score)) {
        return null;
      }
      return { tag, score };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.tag.localeCompare(right.tag);
    });
}

/**
 * @param {Record<string, Array<TopicTagRankingEntry>> | undefined} topicTagRankings
 * @param {Topic} topic
 * @returns {Array<{tag: string, score: number}>}
 */
function getRankingsForTopic(topicTagRankings, topic) {
  if (!topicTagRankings || typeof topicTagRankings !== "object") return [];
  const names = [topic.fullPath, topic.name].filter(
    (name, index, list) =>
      typeof name === "string" && name.trim() && list.indexOf(name) === index,
  );

  for (const name of names) {
    const tags = normalizeRankedTags(topicTagRankings[name]);
    if (tags.length > 0) return tags;
  }
  return [];
}

/**
 * @param {object} entry
 * @returns {number}
 */
function getTopicTagsCardHeight(entry) {
  const tagCount = Array.isArray(entry.tags) ? entry.tags.length : 0;
  const visibleTagCount =
    typeof entry.visibleTagCount === "number"
      ? Math.min(entry.visibleTagCount, tagCount)
      : Math.min(DEFAULT_TOPIC_TAG_VISIBLE_COUNT, tagCount);
  const tagRows = Math.max(1, Math.ceil(visibleTagCount / 2));
  const moreButton = tagCount > visibleTagCount ? 22 : 0;
  return Math.max(76, 46 + tagRows * 22 + moreButton);
}

/**
 * @param {{
 *   submissionTopics: Array<Topic>,
 *   topicTagRankings: Record<string, Array<TopicTagRankingEntry>>,
 *   visibleCounts?: Record<string, number>,
 *   sentenceOffsets: number[],
 *   submissionSentences: string[],
 * }} params
 * @returns {Array<object>}
 */
export function buildTopicTagsEntries({
  submissionTopics,
  topicTagRankings,
  visibleCounts = {},
  sentenceOffsets,
  submissionSentences,
}) {
  return (submissionTopics || [])
    .map((topic) => {
      const tags = getRankingsForTopic(topicTagRankings, topic);
      if (tags.length === 0) return null;

      const textRange = getTopicTextRange(
        topic,
        sentenceOffsets,
        submissionSentences,
      );
      if (!textRange) return null;

      const sentenceNumbers = getTopicSentenceNumbers(topic);
      const sentenceStart = sentenceNumbers.length
        ? Math.min(...sentenceNumbers)
        : 0;
      const sentenceEnd = sentenceNumbers.length
        ? Math.max(...sentenceNumbers)
        : 0;
      const fullPath = topic.fullPath || topic.name || "";
      const topicName = getTopicDisplayName(topic);
      const key = fullPath || topicName;
      const visibleTagCount = Math.min(
        tags.length,
        visibleCounts[key] || DEFAULT_TOPIC_TAG_VISIBLE_COUNT,
      );

      return {
        key,
        topicName,
        fullPath,
        sentenceNumbers,
        sentenceStart,
        sentenceEnd,
        charStart: textRange.charStart,
        charEnd: textRange.charEnd,
        tags,
        visibleTagCount,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.charStart !== right.charStart) {
        return left.charStart - right.charStart;
      }
      return left.topicName.localeCompare(right.topicName);
    });
}

/**
 * Computes right-side card positions for scored tags grouped by topic.
 *
 * @param {{
 *   show: boolean,
 *   submissionTopics: Array<Topic>,
 *   topicTagRankings: Record<string, Array<TopicTagRankingEntry>>,
 *   visibleCounts?: Record<string, number>,
 *   sentenceOffsets: number[],
 *   submissionSentences: string[],
 *   articleLoading: boolean,
 *   articleError: string | null,
 *   articleText: string,
 *   articlePages: Array<unknown>,
 *   articleImages: Array<unknown>,
 *   articleTextRef: React.RefObject<HTMLElement>,
 *   summaryWrapRef: React.RefObject<HTMLElement>,
 *   scaleRef: React.MutableRefObject<number>,
 * }} params
 * @returns {{ cards: Array<object>, articleRight: number, articleHeight: number, entries: Array<object> }}
 */
export function useTopicTagsLayout({
  show,
  submissionTopics,
  topicTagRankings,
  visibleCounts = {},
  sentenceOffsets,
  submissionSentences,
  articleLoading,
  articleError,
  articleText,
  articlePages,
  articleImages,
  articleTextRef,
  summaryWrapRef,
  scaleRef,
}) {
  const entries = useMemo(
    () =>
      buildTopicTagsEntries({
        submissionTopics,
        topicTagRankings,
        visibleCounts,
        sentenceOffsets,
        submissionSentences,
      }),
    [
      submissionTopics,
      topicTagRankings,
      visibleCounts,
      sentenceOffsets,
      submissionSentences,
    ],
  );

  const { cards, articleRight, articleHeight } = useRailLayout({
    show,
    entries,
    articleLoading,
    articleError,
    articleText,
    articlePages,
    articleImages,
    articleTextRef,
    summaryWrapRef,
    scaleRef,
    getCardHeight: getTopicTagsCardHeight,
  });

  return { cards, articleRight, articleHeight, entries };
}
