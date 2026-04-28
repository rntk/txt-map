import { useEffect, useState } from "react";
import { rangeAtOffset } from "./utils";

/**
 * Computes sidebar positions for summary cards based on the article layout.
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
 * @returns {{ cards: Array<unknown>, width: number, articleRight?: number, articleHeight?: number }}
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
  const [summaryLayout, setSummaryLayout] = useState({ cards: [], width: 0 });

  useEffect(() => {
    if (!showSummaries || articleLoading || articleError) {
      setSummaryLayout({ cards: [], width: 0 });
      return undefined;
    }
    if (summaryEntries.length === 0) {
      setSummaryLayout({ cards: [], width: 0 });
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

      const positioned = summaryEntries
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

      const CARD_HEIGHT = 92;
      const GAP = 10;
      let lastBottom = 0;
      for (const c of positioned) {
        const desired = c.midY - CARD_HEIGHT / 2;
        c.cardY = Math.max(desired, lastBottom + GAP);
        c.cardHeight = CARD_HEIGHT;
        lastBottom = c.cardY + CARD_HEIGHT;
      }

      setSummaryLayout({
        cards: positioned,
        width: wrapRect.width / s,
        articleRight: (articleRect.right - wrapRect.left) / s,
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
    showSummaries,
    summaryEntries,
    articleLoading,
    articleError,
    articleText,
    articlePages,
    articleImages,
    showTopicHierarchy,
  ]);

  return summaryLayout;
}
