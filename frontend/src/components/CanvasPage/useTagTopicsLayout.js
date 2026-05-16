import { useRailLayout } from "./useRailLayout";

/**
 * Estimates the rendered height needed for a tag topic card.
 * @param {{summaryText?: string, preview?: string}} entry
 * @returns {number}
 */
function getTagTopicCardHeight(entry) {
  const text = entry.summaryText || entry.preview || "";
  // Wider cards (340px) fit ~58 chars per line.
  const estimatedLines = Math.max(1, Math.ceil(text.length / 58));
  // Reserve a row for the "contextualize" button so it is never clipped behind
  // the summary text by the card's fixed height + overflow:hidden.
  const CONTEXTUALIZE_BUTTON_HEIGHT = 30;
  return Math.max(120, 50 + estimatedLines * 16 + CONTEXTUALIZE_BUTTON_HEIGHT);
}

/**
 * Computes right-side card positions for topics assigned to selected tag hits.
 * Thin wrapper over {@link useRailLayout}.
 *
 * @param {{
 *   show: boolean,
 *   entries: Array<{
 *     key: string,
 *     charStart: number,
 *     charEnd: number,
 *     summaryText?: string,
 *     preview?: string,
 *   }>,
 *   articleLoading: boolean,
 *   articleError: string | null,
 *   articleText: string,
 *   articlePages: Array<unknown>,
 *   articleImages: Array<unknown>,
 *   articleTextRef: React.RefObject<HTMLElement>,
 *   summaryWrapRef: React.RefObject<HTMLElement>,
 *   scaleRef: React.MutableRefObject<number>,
 * }} params
 * @returns {{ cards: Array<object>, articleRight: number, articleHeight: number }}
 */
export function useTagTopicsLayout({
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
}) {
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
    getCardHeight: getTagTopicCardHeight,
  });

  return { cards, articleRight, articleHeight };
}
