import { useCallback, useMemo } from "react";
import { useRailLayout } from "./useRailLayout";
import { getZoomAdjustedSummaryCardHeight } from "./utils";

/**
 * Computes sidebar positions for summary cards based on the article layout.
 * Thin wrapper over {@link useRailLayout}.
 *
 * @param {{
 *   showSummaries: boolean,
 *   articleLoading: boolean,
 *   articleError: string | null,
 *   summaryEntries: Array<{charStart: number, charEnd: number}>,
 *   articleText: string,
 *   articlePages: Array<unknown>,
 *   articleImages: Array<unknown>,
 *   showTopicHierarchy: boolean,
 *   articleTextRef: React.RefObject<HTMLElement>,
 *   summaryWrapRef: React.RefObject<HTMLElement>,
 *   scaleRef: React.MutableRefObject<number>,
 *   scale: number,
 * }} params
 * @returns {{ cards: Array<unknown>, width: number, articleRight: number, articleHeight: number }}
 */
export function useSummaryLayout({
  showSummaries,
  articleLoading,
  articleError,
  summaryEntries,
  articleText,
  articlePages,
  articleImages,
  showTopicHierarchy,
  articleTextRef,
  summaryWrapRef,
  scaleRef,
  scale,
}) {
  const cardHeight = useMemo(
    () => getZoomAdjustedSummaryCardHeight(scale),
    [scale],
  );
  const getCardHeight = useCallback(() => cardHeight, [cardHeight]);

  const { cards, width, articleRight, articleHeight } = useRailLayout({
    show: showSummaries,
    entries: summaryEntries,
    articleLoading,
    articleError,
    articleText,
    articlePages,
    articleImages,
    articleTextRef,
    summaryWrapRef,
    scaleRef,
    getCardHeight,
    extraDepKey: `${showTopicHierarchy}|${cardHeight}`,
  });

  return { cards, width, articleRight, articleHeight };
}
