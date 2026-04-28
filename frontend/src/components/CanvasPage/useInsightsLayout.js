import { useEffect, useState } from "react";
import { rangeAtOffset } from "./utils";

/**
 * Computes sidebar positions for insight cards based on their source sentences
 * in the article layout.
 * @param {{
 *   showInsights: boolean,
 *   articleLoading: boolean,
 *   articleError: string | null,
 *   insights: Array<{
 *     name?: string,
 *     topics?: string[],
 *     source_sentences?: string[],
 *     source_sentence_indices?: number[],
 *   }>,
 *   sentenceOffsets: number[],
 *   submissionSentences: string[],
 *   articleText: string,
 *   articlePages: Array<unknown>,
 *   articleImages: Array<unknown>,
 *   articleTextRef: React.RefObject<HTMLElement>,
 *   summaryWrapRef: React.RefObject<HTMLElement>,
 *   scaleRef: React.MutableRefObject<number>,
 * }} params
 * @returns {{
 *   cards: Array<{
 *     key: string,
 *     name: string,
 *     topicNames: string[],
 *     sourceSentences: string[],
 *     sentenceIndices: number[],
 *     charStart: number,
 *     charEnd: number,
 *     midY: number,
 *     startY: number,
 *     endY: number,
 *     cardY: number,
 *     cardHeight: number,
 *   }>,
 *   articleLeft: number,
 *   articleHeight: number,
 * }}
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
  const [insightsLayout, setInsightsLayout] = useState({
    cards: [],
    articleLeft: 0,
    articleHeight: 0,
  });

  useEffect(() => {
    if (!showInsights || articleLoading || articleError) {
      setInsightsLayout({ cards: [], articleLeft: 0, articleHeight: 0 });
      return undefined;
    }

    const validInsights = (Array.isArray(insights) ? insights : []).filter(
      (insight) =>
        Array.isArray(insight.source_sentence_indices) &&
        insight.source_sentence_indices.length > 0,
    );

    if (validInsights.length === 0) {
      setInsightsLayout({ cards: [], articleLeft: 0, articleHeight: 0 });
      return undefined;
    }

    let raf = 0;
    const compute = () => {
      const articleEl = articleTextRef.current;
      const wrapEl = summaryWrapRef.current;
      if (!articleEl || !wrapEl) return;
      const articleRect = articleEl.getBoundingClientRect();
      const wrapRect = wrapEl.getBoundingClientRect();
      const s = scaleRef.current || 1;

      const positioned = validInsights
        .map((insight, index) => {
          const indices = insight.source_sentence_indices.filter(
            (n) => Number.isInteger(n) && n > 0,
          );
          if (indices.length === 0) return null;

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

          const midOff = Math.floor((charStart + charEnd) / 2);
          const midRange = rangeAtOffset(articleEl, midOff);
          const startRange = rangeAtOffset(articleEl, charStart);
          const endRange = rangeAtOffset(articleEl, Math.max(0, charEnd - 1));

          if (!midRange) return null;
          const midRect = midRange.getBoundingClientRect();
          const startRect = startRange?.getBoundingClientRect();
          const endRect = endRange?.getBoundingClientRect();

          const midY = ((midRect.top + midRect.bottom) / 2 - wrapRect.top) / s;
          const startY = startRect ? (startRect.top - wrapRect.top) / s : midY;
          const endY = endRect ? (endRect.bottom - wrapRect.top) / s : midY;

          const topicNames = Array.isArray(insight.topics)
            ? insight.topics.filter((t) => typeof t === "string" && t.trim())
            : [];
          const sourceSentences = Array.isArray(insight.source_sentences)
            ? insight.source_sentences.filter(
                (s) => typeof s === "string" && s.trim(),
              )
            : indices
                .map((idx) => submissionSentences[idx - 1] || "")
                .filter(Boolean);

          return {
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
            midY,
            startY,
            endY,
          };
        })
        .filter(Boolean);

      positioned.sort((a, b) => a.midY - b.midY);

      const CARD_HEIGHT = 92;
      const GAP = 10;
      let lastBottom = 0;
      for (const c of positioned) {
        const desired = c.midY - CARD_HEIGHT / 2;
        c.cardY = Math.max(desired, lastBottom + GAP);
        c.cardHeight = CARD_HEIGHT;
        lastBottom = c.cardY + CARD_HEIGHT;
      }

      setInsightsLayout({
        cards: positioned,
        articleLeft: (articleRect.left - wrapRect.left) / s,
        articleHeight: articleEl.offsetHeight,
      });
    };

    raf = window.requestAnimationFrame(compute);
    const onResize = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(compute);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showInsights,
    insights,
    sentenceOffsets,
    submissionSentences,
    articleLoading,
    articleError,
    articleText,
    articlePages,
    articleImages,
  ]);

  return insightsLayout;
}
