import { useMemo } from "react";
import { useRailLayout } from "./useRailLayout";

/**
 * Builds enriched entries from raw insights using sentence offsets/text.
 * @param {Array<object>} insights
 * @param {number[]} sentenceOffsets
 * @param {string[]} submissionSentences
 * @returns {Array<object>}
 */
function buildInsightEntries(insights, sentenceOffsets, submissionSentences) {
  const list = Array.isArray(insights) ? insights : [];
  const entries = [];
  list.forEach((insight, index) => {
    if (
      !Array.isArray(insight.source_sentence_indices) ||
      insight.source_sentence_indices.length === 0
    )
      return;
    const indices = insight.source_sentence_indices.filter(
      (n) => Number.isInteger(n) && n > 0,
    );
    if (indices.length === 0) return;

    const firstIdx = indices[0];
    const lastIdx = indices[indices.length - 1];

    const charStart =
      firstIdx >= 1 && firstIdx <= sentenceOffsets.length
        ? sentenceOffsets[firstIdx - 1]
        : 0;
    const lastSentLen =
      lastIdx >= 1 && lastIdx <= submissionSentences.length
        ? (submissionSentences[lastIdx - 1] || "").length
        : 0;
    const charEnd =
      lastIdx >= 1 && lastIdx <= sentenceOffsets.length
        ? sentenceOffsets[lastIdx - 1] + lastSentLen
        : charStart;

    const topicNames = Array.isArray(insight.topics)
      ? insight.topics.filter((t) => typeof t === "string" && t.trim())
      : [];
    const sourceSentences = Array.isArray(insight.source_sentences)
      ? insight.source_sentences.filter(
          (s) => typeof s === "string" && s.trim(),
        )
      : indices.map((idx) => submissionSentences[idx - 1] || "").filter(Boolean);

    entries.push({
      key: String(index),
      name:
        typeof insight.name === "string" && insight.name.trim()
          ? insight.name.trim()
          : `Insight ${index + 1}`,
      topicNames,
      sourceSentences,
      sentenceIndices: indices,
      charStart,
      charEnd,
    });
  });
  return entries;
}

/**
 * Computes sidebar positions for insight cards based on their source sentences
 * in the article layout. Thin wrapper over {@link useRailLayout}.
 *
 * @param {{
 *   showInsights: boolean,
 *   articleLoading: boolean,
 *   articleError: string | null,
 *   insights: Array<object>,
 *   sentenceOffsets: number[],
 *   submissionSentences: string[],
 *   articleText: string,
 *   articlePages: Array<unknown>,
 *   articleImages: Array<unknown>,
 *   articleTextRef: React.RefObject<HTMLElement>,
 *   summaryWrapRef: React.RefObject<HTMLElement>,
 *   scaleRef: React.MutableRefObject<number>,
 * }} params
 * @returns {{ cards: Array<object>, articleLeft: number, articleHeight: number }}
 */
export function useInsightsLayout({
  showInsights,
  articleLoading,
  articleError,
  insights,
  sentenceOffsets,
  submissionSentences,
  articleText,
  articlePages,
  articleImages,
  articleTextRef,
  summaryWrapRef,
  scaleRef,
}) {
  const entries = useMemo(
    () => buildInsightEntries(insights, sentenceOffsets, submissionSentences),
    [insights, sentenceOffsets, submissionSentences],
  );

  const { cards, articleLeft, articleHeight } = useRailLayout({
    show: showInsights,
    entries,
    articleLoading,
    articleError,
    articleText,
    articlePages,
    articleImages,
    articleTextRef,
    summaryWrapRef,
    scaleRef,
  });

  return { cards, articleLeft, articleHeight };
}
