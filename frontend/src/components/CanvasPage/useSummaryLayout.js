import { useRailLayout } from "./useRailLayout";

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
}) {
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
    extraDepKey: showTopicHierarchy,
  });

  return { cards, width, articleRight, articleHeight };
}
