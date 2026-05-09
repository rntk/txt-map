import { useEffect, useState } from "react";
import { rangeAtOffset } from "./utils";

/**
 * Estimates the rendered height needed for a tag topic card.
 * @param {{summaryText?: string, preview?: string}} entry
 * @returns {number}
 */
function getTagTopicCardHeight(entry) {
  const text = entry.summaryText || entry.preview || "";
  const estimatedLines = Math.max(1, Math.ceil(text.length / 48));
  return Math.max(92, 50 + estimatedLines * 16);
}

/**
 * Computes right-side card positions for topics assigned to selected tag hits.
 * @param {{
 *   show: boolean,
 *   entries: Array<{
 *     key: string,
 *     topicName: string,
 *     fullPath: string,
 *     sentences: number[],
 *     preview: string,
 *     summaryText?: string,
 *     charStart: number,
 *     charEnd: number,
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
 * @returns {{
 *   cards: Array<{
 *     key: string,
 *     topicName: string,
 *     fullPath: string,
 *     sentences: number[],
 *     preview: string,
 *     summaryText?: string,
 *     charStart: number,
 *     charEnd: number,
 *     midY: number,
 *     startY: number,
 *     endY: number,
 *     cardY: number,
 *     cardHeight: number,
 *   }>,
 *   articleRight: number,
 *   articleHeight: number,
 * }}
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
  const [tagTopicsLayout, setTagTopicsLayout] = useState({
    cards: [],
    articleRight: 0,
    articleHeight: 0,
  });

  useEffect(() => {
    if (!show || articleLoading || articleError || entries.length === 0) {
      setTagTopicsLayout({ cards: [], articleRight: 0, articleHeight: 0 });
      return undefined;
    }

    let raf = 0;
    const compute = () => {
      const articleEl = articleTextRef.current;
      const wrapEl = summaryWrapRef.current;
      if (!articleEl || !wrapEl) return;

      const articleRect = articleEl.getBoundingClientRect();
      const wrapRect = wrapEl.getBoundingClientRect();
      // Derive the actually-rendered transform scale from the DOM rather than
      // scaleRef. While the canvas viewport's CSS transform is mid-transition
      // (e.g. focus zoom on tag select), the rendered scale lags behind the
      // ref's final value, so dividing by scaleRef would produce coordinates
      // that don't match what the browser is currently painting.
      const offsetH = articleEl.offsetHeight;
      const s =
        offsetH > 0 ? articleRect.height / offsetH : scaleRef.current || 1;

      const positioned = entries
        .map((entry) => {
          const midOff = Math.floor((entry.charStart + entry.charEnd) / 2);
          const midRange = rangeAtOffset(articleEl, midOff);
          const startRange = rangeAtOffset(articleEl, entry.charStart);
          const endRange = rangeAtOffset(
            articleEl,
            Math.max(0, entry.charEnd - 1),
          );
          if (!midRange) return null;

          const midRect = midRange.getBoundingClientRect();
          const startRect = startRange?.getBoundingClientRect();
          const endRect = endRange?.getBoundingClientRect();
          const midY = ((midRect.top + midRect.bottom) / 2 - wrapRect.top) / s;
          const startY = startRect ? (startRect.top - wrapRect.top) / s : midY;
          const endY = endRect ? (endRect.bottom - wrapRect.top) / s : midY;

          return { ...entry, midY, startY, endY };
        })
        .filter(Boolean);

      positioned.sort((a, b) => a.midY - b.midY);

      const GAP = 10;
      let lastBottom = 0;
      for (const card of positioned) {
        const cardHeight = getTagTopicCardHeight(card);
        const desired = card.midY - cardHeight / 2;
        card.cardY = Math.max(desired, lastBottom + GAP);
        card.cardHeight = cardHeight;
        lastBottom = card.cardY + cardHeight;
      }

      setTagTopicsLayout({
        cards: positioned,
        articleRight: (articleRect.right - wrapRect.left) / s,
        articleHeight: articleEl.offsetHeight,
      });
    };

    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(compute);
    };

    schedule();
    window.addEventListener("resize", schedule);

    let resizeObserver = null;
    if (typeof window.ResizeObserver !== "undefined") {
      resizeObserver = new window.ResizeObserver(schedule);
      if (articleTextRef.current)
        resizeObserver.observe(articleTextRef.current);
      if (summaryWrapRef.current)
        resizeObserver.observe(summaryWrapRef.current);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      if (resizeObserver) resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    show,
    entries,
    articleLoading,
    articleError,
    articleText,
    articlePages,
    articleImages,
  ]);

  return tagTopicsLayout;
}
