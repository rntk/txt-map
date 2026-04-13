import { useMemo } from "react";
import { buildTopicStateRanges } from "../utils/textHighlight";
import { buildSummaryTimelineItems } from "../utils/summaryTimeline";
import { matchSummaryToTopics } from "../utils/summaryMatcher";

/**
 * @typedef {Object} TopicMarkerSpan
 * @property {number} [start_word]
 * @property {number} [end_word]
 * @property {string} [text]
 */

/**
 * @typedef {Object} TopicMarkerSummaryRange
 * @property {number} [range_index]
 * @property {number} [sentence_start]
 * @property {number} [sentence_end]
 * @property {Array<TopicMarkerSpan>} [marker_spans]
 * @property {string} [summary_text]
 */

/**
 * @typedef {Object} TopicMarkerSummaryEntry
 * @property {Array<TopicMarkerSummaryRange>} [ranges]
 */

/**
 * @typedef {Object} CharacterRange
 * @property {number} start
 * @property {number} end
 */

function mapInsightSentenceIndicesToTopics(insight, topics) {
  const explicitTopics = Array.isArray(insight?.topics)
    ? insight.topics.filter(
        (topicName) => typeof topicName === "string" && topicName.trim(),
      )
    : [];
  if (explicitTopics.length > 0) {
    return [...new Set(explicitTopics)];
  }

  const sentenceIndices = Array.isArray(insight?.source_sentence_indices)
    ? insight.source_sentence_indices.filter((value) => Number.isInteger(value))
    : [];
  if (
    sentenceIndices.length === 0 ||
    !Array.isArray(topics) ||
    topics.length === 0
  ) {
    return [];
  }

  const sentenceIndexSet = new Set(sentenceIndices);
  const topicMatches = topics
    .map((topic) => {
      const topicName =
        typeof topic?.name === "string" ? topic.name.trim() : "";
      const topicSentences = Array.isArray(topic?.sentences)
        ? topic.sentences
        : [];
      const matchingIndices = topicSentences.filter((sentenceIndex) =>
        sentenceIndexSet.has(sentenceIndex),
      );
      if (!topicName || matchingIndices.length === 0) {
        return null;
      }
      return { topicName, firstIndex: Math.min(...matchingIndices) };
    })
    .filter(Boolean)
    .sort((left, right) => left.firstIndex - right.firstIndex);

  return [...new Set(topicMatches.map((match) => match.topicName))];
}

function normalizeSentenceText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function alignInsightSourceSentences(sourceSentences, resultsSentences) {
  if (
    !Array.isArray(sourceSentences) ||
    sourceSentences.length === 0 ||
    !Array.isArray(resultsSentences) ||
    resultsSentences.length === 0
  ) {
    return [];
  }

  const normalizedIndexMap = new Map();
  resultsSentences.forEach((sentence, index) => {
    const normalized = normalizeSentenceText(sentence);
    if (!normalized) {
      return;
    }
    if (!normalizedIndexMap.has(normalized)) {
      normalizedIndexMap.set(normalized, []);
    }
    normalizedIndexMap.get(normalized).push(index + 1);
  });

  const occurrenceCursor = new Map();
  const alignedIndices = [];

  sourceSentences.forEach((sourceSentence) => {
    const normalized = normalizeSentenceText(sourceSentence);
    const candidateIndices = normalizedIndexMap.get(normalized) || [];
    const candidatePosition = occurrenceCursor.get(normalized) || 0;
    if (candidatePosition >= candidateIndices.length) {
      return;
    }
    alignedIndices.push(candidateIndices[candidatePosition]);
    occurrenceCursor.set(normalized, candidatePosition + 1);
  });

  return alignedIndices;
}

function findMatchingResultSentenceIndices(sourceSentence, resultsSentences) {
  const normalizedSourceSentence = normalizeSentenceText(sourceSentence);
  if (
    !normalizedSourceSentence ||
    !Array.isArray(resultsSentences) ||
    resultsSentences.length === 0
  ) {
    return [];
  }

  const matches = [];
  resultsSentences.forEach((resultSentence, index) => {
    const normalizedResultSentence = normalizeSentenceText(resultSentence);
    if (!normalizedResultSentence) {
      return;
    }

    if (normalizedResultSentence === normalizedSourceSentence) {
      matches.push(index + 1);
      return;
    }

    if (
      normalizedSourceSentence.length >= 24 &&
      (normalizedSourceSentence.includes(normalizedResultSentence) ||
        normalizedResultSentence.includes(normalizedSourceSentence))
    ) {
      matches.push(index + 1);
    }
  });

  return matches;
}

function getInsightRangeSentenceIndices(insight, resultsSentences) {
  const safeResultsSentences = Array.isArray(resultsSentences)
    ? resultsSentences
    : [];
  const maxSentenceIndex = safeResultsSentences.length;
  const indices = [];

  (Array.isArray(insight?.ranges) ? insight.ranges : []).forEach((range) => {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      return;
    }

    for (
      let sentenceIndex = start + 1;
      sentenceIndex <= end + 1;
      sentenceIndex += 1
    ) {
      if (
        sentenceIndex >= 1 &&
        (maxSentenceIndex === 0 || sentenceIndex <= maxSentenceIndex)
      ) {
        indices.push(sentenceIndex);
      }
    }
  });

  return [...new Set(indices)];
}

function resolveInsightSentenceIndices(insight, resultsSentences) {
  const explicitSentenceIndices = Array.isArray(
    insight?.source_sentence_indices,
  )
    ? insight.source_sentence_indices.filter((value) => Number.isInteger(value))
    : [];
  if (explicitSentenceIndices.length > 0) {
    return explicitSentenceIndices;
  }

  const sourceSentences = Array.isArray(insight?.source_sentences)
    ? insight.source_sentences.filter(
        (sentence) => typeof sentence === "string" && sentence.trim(),
      )
    : [];
  const exactAlignedIndices = alignInsightSourceSentences(
    sourceSentences,
    resultsSentences,
  );
  if (exactAlignedIndices.length > 0) {
    return exactAlignedIndices;
  }

  const fuzzyAlignedIndices = [];
  const usedIndices = new Set();
  let lastMatchedIndex = 0;

  sourceSentences.forEach((sourceSentence) => {
    const candidateIndices = findMatchingResultSentenceIndices(
      sourceSentence,
      resultsSentences,
    );
    if (candidateIndices.length === 0) {
      return;
    }

    const nextMonotonicMatch = candidateIndices.find(
      (index) => index > lastMatchedIndex && !usedIndices.has(index),
    );
    const nextUnusedMatch = candidateIndices.find(
      (index) => !usedIndices.has(index),
    );
    const chosenIndex =
      nextMonotonicMatch || nextUnusedMatch || candidateIndices[0];

    fuzzyAlignedIndices.push(chosenIndex);
    usedIndices.add(chosenIndex);
    lastMatchedIndex = chosenIndex;
  });

  if (fuzzyAlignedIndices.length > 0) {
    return fuzzyAlignedIndices;
  }

  return getInsightRangeSentenceIndices(insight, resultsSentences);
}

function buildInsightMatchingRanges(sourceSentenceIndices, topicRefs) {
  if (
    !Array.isArray(sourceSentenceIndices) ||
    sourceSentenceIndices.length === 0
  ) {
    return [];
  }

  const sentenceIndexSet = new Set(
    sourceSentenceIndices.filter((value) => Number.isInteger(value)),
  );
  const ranges = [];

  (Array.isArray(topicRefs) ? topicRefs : []).forEach((topic) => {
    (Array.isArray(topic?.ranges) ? topic.ranges : []).forEach((range) => {
      const sentenceStart = Number(range?.sentence_start);
      const sentenceEnd = Number(range?.sentence_end);
      const start = Number(range?.start);
      const end = Number(range?.end);

      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return;
      }

      if (Number.isFinite(sentenceStart) && Number.isFinite(sentenceEnd)) {
        for (let index = sentenceStart; index <= sentenceEnd; index += 1) {
          if (sentenceIndexSet.has(index)) {
            ranges.push({
              start,
              end,
              sentence_start: sentenceStart,
              sentence_end: sentenceEnd,
              topicName: topic.name,
            });
            return;
          }
        }
        return;
      }

      const topicSentences = Array.isArray(topic?.sentences)
        ? topic.sentences
        : [];
      if (topicSentences.some((value) => sentenceIndexSet.has(value))) {
        ranges.push({
          start,
          end,
          topicName: topic.name,
        });
      }
    });
  });

  ranges.sort((left, right) => left.start - right.start);
  return ranges;
}

/**
 * @param {string} text
 * @param {number} offset
 * @returns {Array<CharacterRange>}
 */
function getWordCharacterRanges(text, offset) {
  if (typeof text !== "string" || !text) {
    return [];
  }

  const ranges = [];
  const wordMatcher = /\S+/g;
  let match = wordMatcher.exec(text);

  while (match) {
    ranges.push({
      start: offset + match.index,
      end: offset + match.index + match[0].length,
    });
    match = wordMatcher.exec(text);
  }

  return ranges;
}

/**
 * @param {string} rawText
 * @param {Array<string>} sentences
 * @returns {Array<CharacterRange | null>}
 */
function buildSentenceCharacterRanges(rawText, sentences) {
  if (
    typeof rawText !== "string" ||
    !rawText ||
    !Array.isArray(sentences) ||
    sentences.length === 0
  ) {
    return [];
  }

  const ranges = [];
  let cursor = 0;

  sentences.forEach((sentence) => {
    if (typeof sentence !== "string" || !sentence) {
      ranges.push(null);
      return;
    }

    const start = rawText.indexOf(sentence, cursor);
    if (start === -1) {
      ranges.push(null);
      return;
    }

    const end = start + sentence.length;
    ranges.push({ start, end });
    cursor = end;
  });

  return ranges;
}

/**
 * @param {Array<CharacterRange>} ranges
 * @returns {Array<CharacterRange>}
 */
function normalizeCharacterRanges(ranges) {
  const validRanges = Array.isArray(ranges)
    ? ranges
        .map((range) => ({
          start: Number(range?.start),
          end: Number(range?.end),
        }))
        .filter(
          (range) =>
            Number.isFinite(range.start) &&
            Number.isFinite(range.end) &&
            range.end > range.start,
        )
        .sort((left, right) => left.start - right.start)
    : [];

  if (validRanges.length === 0) {
    return [];
  }

  const mergedRanges = [validRanges[0]];
  for (let index = 1; index < validRanges.length; index += 1) {
    const currentRange = validRanges[index];
    const previousRange = mergedRanges[mergedRanges.length - 1];
    if (currentRange.start <= previousRange.end) {
      previousRange.end = Math.max(previousRange.end, currentRange.end);
      continue;
    }
    mergedRanges.push(currentRange);
  }

  return mergedRanges;
}

/**
 * @param {Array<{ start?: number, end?: number, sentence_start?: number, sentence_end?: number }>} topicRanges
 * @param {TopicMarkerSummaryRange} markerSummaryRange
 * @returns {{ start?: number, end?: number, sentence_start?: number, sentence_end?: number } | null}
 */
function resolveTopicSourceRange(topicRanges, markerSummaryRange) {
  if (!Array.isArray(topicRanges) || topicRanges.length === 0) {
    return null;
  }

  const rangeIndex = Number(markerSummaryRange?.range_index);
  if (
    Number.isInteger(rangeIndex) &&
    rangeIndex >= 1 &&
    rangeIndex <= topicRanges.length
  ) {
    return topicRanges[rangeIndex - 1];
  }

  const sentenceStart = Number(markerSummaryRange?.sentence_start);
  const sentenceEnd = Number(markerSummaryRange?.sentence_end);
  return (
    topicRanges.find(
      (topicRange) =>
        Number(topicRange?.sentence_start) === sentenceStart &&
        Number(topicRange?.sentence_end) === sentenceEnd,
    ) || null
  );
}

/**
 * @param {string} rawText
 * @param {Array<string>} resultSentences
 * @param {Array<CharacterRange | null>} sentenceCharacterRanges
 * @param {Array<{ start?: number, end?: number, sentence_start?: number, sentence_end?: number }>} topicRanges
 * @param {TopicMarkerSummaryEntry | undefined} topicMarkerSummary
 * @returns {Array<CharacterRange>}
 */
function getTopicMarkerSummaryHighlightRanges(
  rawText,
  resultSentences,
  sentenceCharacterRanges,
  topicRanges,
  topicMarkerSummary,
) {
  if (
    typeof rawText !== "string" ||
    !rawText ||
    !topicMarkerSummary ||
    !Array.isArray(topicMarkerSummary.ranges)
  ) {
    return [];
  }

  const highlightRanges = [];

  topicMarkerSummary.ranges.forEach((markerSummaryRange) => {
    const sourceRange = resolveTopicSourceRange(
      topicRanges,
      markerSummaryRange,
    );
    const wordRanges = [];
    const sentenceStart = Number(
      markerSummaryRange?.sentence_start ?? sourceRange?.sentence_start,
    );
    const sentenceEnd = Number(
      markerSummaryRange?.sentence_end ??
        sourceRange?.sentence_end ??
        markerSummaryRange?.sentence_start ??
        sourceRange?.sentence_start,
    );

    if (
      Number.isInteger(sentenceStart) &&
      Number.isInteger(sentenceEnd) &&
      sentenceStart >= 1 &&
      sentenceEnd >= sentenceStart
    ) {
      for (
        let sentenceIndex = sentenceStart;
        sentenceIndex <= sentenceEnd;
        sentenceIndex += 1
      ) {
        const sentenceText = resultSentences[sentenceIndex - 1];
        const sentenceRange = sentenceCharacterRanges[sentenceIndex - 1];
        if (
          typeof sentenceText !== "string" ||
          !sentenceText ||
          !sentenceRange
        ) {
          continue;
        }
        wordRanges.push(
          ...getWordCharacterRanges(sentenceText, sentenceRange.start),
        );
      }
    }

    if (wordRanges.length === 0) {
      const rangeStart = Number(sourceRange?.start);
      const rangeEnd = Number(sourceRange?.end);
      if (
        !Number.isFinite(rangeStart) ||
        !Number.isFinite(rangeEnd) ||
        rangeEnd <= rangeStart
      ) {
        return;
      }

      const rangeText = rawText.slice(rangeStart, rangeEnd);
      wordRanges.push(...getWordCharacterRanges(rangeText, rangeStart));
    }

    if (wordRanges.length === 0) {
      return;
    }

    const markerSpans = Array.isArray(markerSummaryRange?.marker_spans)
      ? markerSummaryRange.marker_spans
      : [];

    markerSpans.forEach((markerSpan) => {
      const startWord = Number(markerSpan?.start_word);
      const endWord = Number(markerSpan?.end_word);
      if (
        !Number.isInteger(startWord) ||
        !Number.isInteger(endWord) ||
        startWord < 1 ||
        endWord < startWord ||
        endWord > wordRanges.length
      ) {
        return;
      }

      highlightRanges.push({
        start: wordRanges[startWord - 1].start,
        end: wordRanges[endWord - 1].end,
      });
    });
  });

  return normalizeCharacterRanges(highlightRanges);
}

export function useTextPageData(
  submission,
  selectedTopics,
  hoveredTopic,
  readTopics,
) {
  const results = useMemo(() => submission?.results || {}, [submission]);
  const rawText = submission?.text_content || "";
  const resultSentences = useMemo(
    () => (Array.isArray(results.sentences) ? results.sentences : []),
    [results.sentences],
  );
  const sentenceCharacterRanges = useMemo(
    () => buildSentenceCharacterRanges(rawText, resultSentences),
    [rawText, resultSentences],
  );
  const safeTopics = useMemo(() => {
    const rawTopics = Array.isArray(results.topics) ? results.topics : [];
    const claimedSentences = new Set();

    return rawTopics.map((topic) => {
      const sentences = Array.isArray(topic.sentences) ? topic.sentences : [];
      const exclusiveSentences = sentences.filter((s) => {
        if (claimedSentences.has(s)) return false;
        claimedSentences.add(s);
        return true;
      });

      const exclusiveSentenceSet = new Set(exclusiveSentences);
      const sentenceSpans = Array.isArray(topic.sentence_spans)
        ? topic.sentence_spans
        : [];
      const sourceRanges = Array.isArray(topic.ranges) ? topic.ranges : [];

      let ranges;
      if (sentenceSpans.length > 0) {
        // Build exact character ranges for each exclusive sentence to avoid spanning gaps
        ranges = sentenceSpans
          .filter((span) => exclusiveSentenceSet.has(span.sentence))
          .map((span) => ({
            start: span.start,
            end: span.end,
            sentence_start: span.sentence,
            sentence_end: span.sentence,
          }))
          .filter(
            (range) =>
              Number.isFinite(range.start) && Number.isFinite(range.end),
          );
      } else {
        // Fallback for older backend data without sentence_spans
        ranges = Array.isArray(topic.ranges) ? topic.ranges : [];
      }

      return {
        ...topic,
        sentences: exclusiveSentences,
        sentence_spans: sentenceSpans.filter((span) =>
          exclusiveSentenceSet.has(span.sentence),
        ),
        ranges,
        summaryHighlightRanges: getTopicMarkerSummaryHighlightRanges(
          rawText,
          resultSentences,
          sentenceCharacterRanges,
          sourceRanges,
          results.topic_marker_summaries?.[topic.name],
        ),
      };
    });
  }, [
    rawText,
    resultSentences,
    sentenceCharacterRanges,
    results.topics,
    results.topic_marker_summaries,
  ]);
  const insights = useMemo(() => {
    const rawInsights = Array.isArray(results.insights) ? results.insights : [];
    return rawInsights.map((insight) => ({
      ...insight,
      topics: (() => {
        const explicitTopics = Array.isArray(insight?.topics)
          ? insight.topics.filter(
              (topicName) => typeof topicName === "string" && topicName.trim(),
            )
          : [];
        if (explicitTopics.length > 0) {
          return [...new Set(explicitTopics)];
        }

        const alignedSentenceIndices = resolveInsightSentenceIndices(
          insight,
          resultSentences,
        );

        return mapInsightSentenceIndicesToTopics(
          { ...insight, source_sentence_indices: alignedSentenceIndices },
          safeTopics,
        );
      })(),
    }));
  }, [resultSentences, results.insights, safeTopics]);
  const insightNavItems = useMemo(() => {
    return insights
      .map((insight, index) => {
        const sourceSentences = Array.isArray(insight?.source_sentences)
          ? insight.source_sentences.filter(
              (sentence) => typeof sentence === "string",
            )
          : [];
        const sourceSentenceIndices = resolveInsightSentenceIndices(
          insight,
          resultSentences,
        );
        const topicNames = Array.isArray(insight?.topics)
          ? insight.topics.filter(
              (topicName) => typeof topicName === "string" && topicName.trim(),
            )
          : [];
        const topicRefs = topicNames
          .map((topicName) =>
            safeTopics.find((topic) => topic.name === topicName),
          )
          .filter(Boolean);
        const matchingRanges = buildInsightMatchingRanges(
          sourceSentenceIndices,
          topicRefs,
        );
        const firstSentenceIndex =
          sourceSentenceIndices.length > 0
            ? Math.min(...sourceSentenceIndices)
            : Number.MAX_SAFE_INTEGER;
        const displayName =
          typeof insight?.name === "string" && insight.name.trim()
            ? insight.name.trim()
            : `Insight ${index + 1}`;

        return {
          id: `${displayName}-${index}`,
          index,
          name: displayName,
          sourceSentenceIndices,
          sourceSentences,
          topicNames,
          topicRefs,
          matchingRanges,
          firstSentenceIndex,
        };
      })
      .sort((left, right) => {
        if (left.firstSentenceIndex !== right.firstSentenceIndex) {
          return left.firstSentenceIndex - right.firstSentenceIndex;
        }
        return left.index - right.index;
      });
  }, [insights, resultSentences, safeTopics]);
  const insightTopicNameSet = useMemo(() => {
    const names = new Set();
    insightNavItems.forEach((insight) => {
      insight.topicNames.forEach((name) => names.add(name));
    });
    return names;
  }, [insightNavItems]);
  const articleSummary =
    results.article_summary && typeof results.article_summary === "object"
      ? results.article_summary
      : {};
  const articleSummaryText =
    typeof articleSummary.text === "string" ? articleSummary.text : "";
  const articleSummaryBullets = useMemo(
    () =>
      Array.isArray(articleSummary.bullets)
        ? articleSummary.bullets.filter(
            (bullet) => typeof bullet === "string" && bullet.trim(),
          )
        : [],
    [articleSummary.bullets],
  );

  const topicSummaryParaMap = useMemo(() => {
    const mappings = results.summary_mappings;
    if (!Array.isArray(mappings) || mappings.length === 0) return {};
    const map = {};
    for (const topic of safeTopics) {
      if (!topic.name || !Array.isArray(topic.sentences)) continue;
      const topicSentenceSet = new Set(topic.sentences);
      const paraIndices = [];
      for (const mapping of mappings) {
        if (!Array.isArray(mapping.source_sentences)) continue;
        if (mapping.source_sentences.some((s) => topicSentenceSet.has(s))) {
          paraIndices.push(mapping.summary_index);
        }
      }
      if (paraIndices.length > 0) {
        map[topic.name] = paraIndices;
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, safeTopics]);

  const allTopics = useMemo(
    () =>
      safeTopics.map((topic) => ({
        ...topic,
        totalSentences: topic.sentences ? topic.sentences.length : 0,
        summary: results.topic_summaries
          ? results.topic_summaries[topic.name]
          : "",
      })),
    [safeTopics, results.topic_summaries],
  );

  const {
    highlightRanges: rawTextHighlightRanges,
    fadeRanges: rawTextFadeRanges,
  } = useMemo(
    () =>
      buildTopicStateRanges(
        safeTopics,
        selectedTopics,
        hoveredTopic,
        readTopics,
        rawText.length,
      ),
    [safeTopics, selectedTopics, hoveredTopic, readTopics, rawText.length],
  );

  const highlightedSummaryParas = useMemo(() => {
    const set = new Set();
    for (const topic of selectedTopics) {
      const indices = topicSummaryParaMap[topic.name];
      if (Array.isArray(indices)) {
        for (const idx of indices) set.add(idx);
      }
    }
    return set;
  }, [selectedTopics, topicSummaryParaMap]);

  const articles = useMemo(() => {
    const safeSentences = Array.isArray(results.sentences)
      ? results.sentences
      : [];
    const rawHtml = submission?.html_content || "";
    if (safeSentences.length === 0 && !rawHtml) return [];
    return [
      {
        sentences: safeSentences,
        topics: safeTopics,
        topic_summaries: results.topic_summaries || {},
        paragraph_map: results.paragraph_map || null,
        raw_html: rawHtml,
        marker_word_indices: Array.isArray(results.marker_word_indices)
          ? results.marker_word_indices
          : [],
      },
    ];
  }, [submission, safeTopics, results]);

  const summaryTimelineItems = useMemo(() => {
    return buildSummaryTimelineItems(
      results.summary,
      results.summary_mappings,
      safeTopics,
    );
  }, [results, safeTopics]);

  const articleBulletMatches = useMemo(() => {
    if (!articleSummaryBullets.length || !safeTopics.length) return [];
    const sentences = Array.isArray(results.sentences) ? results.sentences : [];
    return articleSummaryBullets.map((bullet) =>
      matchSummaryToTopics(bullet, safeTopics, sentences),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleSummaryBullets, safeTopics, results.sentences]);

  const articleTextMatches = useMemo(() => {
    if (!articleSummaryText || !safeTopics.length) return [];
    const sentences = Array.isArray(results.sentences) ? results.sentences : [];
    return matchSummaryToTopics(articleSummaryText, safeTopics, sentences);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleSummaryText, safeTopics, results.sentences]);

  return {
    safeTopics,
    rawText,
    articleSummaryText,
    articleSummaryBullets,
    topicSummaryParaMap,
    allTopics,
    rawTextHighlightRanges,
    rawTextFadeRanges,
    highlightedSummaryParas,
    articles,
    insights,
    insightNavItems,
    insightTopicNameSet,
    summaryTimelineItems,
    articleBulletMatches,
    articleTextMatches,
  };
}
