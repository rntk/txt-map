import { useEffect, useState } from "react";
import { rangeAtOffset } from "./utils";

const DEFAULT_CARD_HEIGHT = 92;
const GAP = 10;

const defaultGetCardHeight = () => DEFAULT_CARD_HEIGHT;

const EMPTY_LAYOUT = Object.freeze({
  cards: [],
  articleLeft: 0,
  articleRight: 0,
  articleHeight: 0,
  width: 0,
});

/**
 * Shared layout engine for canvas side rails. Projects per-entry character
 * offsets onto wrap-local coordinates and stacks cards along the article.
 *
 * @param {{
 *   show: boolean,
 *   entries: Array<{charStart: number, charEnd: number}>,
 *   articleLoading: boolean,
 *   articleError: string | null,
 *   articleText: string,
 *   articlePages: Array<unknown>,
 *   articleImages: Array<unknown>,
 *   articleTextRef: React.RefObject<HTMLElement>,
 *   summaryWrapRef: React.RefObject<HTMLElement>,
 *   scaleRef: React.MutableRefObject<number>,
 *   getCardHeight?: (entry: object) => number,
 *   extraDepKey?: unknown,
 * }} params
 *
 * Note: `getCardHeight` is intentionally NOT included in the effect deps
 * (refs are not deps, and we don't want every render to re-run the layout).
 * Callers MUST pass a stable function reference (module-level or memoized).
 * Passing an inline lambda will work, but the layout won't react to changes
 * captured by that lambda's closure — pass an `extraDepKey` if such inputs
 * exist.
 * @returns {{
 *   cards: Array<object>,
 *   articleLeft: number,
 *   articleRight: number,
 *   articleHeight: number,
 *   width: number,
 * }}
 */
export function useRailLayout({
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
  getCardHeight = defaultGetCardHeight,
  extraDepKey = null,
}) {
  const [layout, setLayout] = useState(EMPTY_LAYOUT);

  useEffect(() => {
    if (!show || articleLoading || articleError || entries.length === 0) {
      setLayout(EMPTY_LAYOUT);
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
          if (!midRange) return null;
          const startRange = rangeAtOffset(articleEl, entry.charStart);
          const endRange = rangeAtOffset(
            articleEl,
            Math.max(0, entry.charEnd - 1),
          );

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

      let lastBottom = 0;
      for (const card of positioned) {
        const cardHeight = getCardHeight(card);
        const desired = card.midY - cardHeight / 2;
        card.cardY = Math.max(desired, lastBottom + GAP);
        card.cardHeight = cardHeight;
        lastBottom = card.cardY + cardHeight;
      }

      setLayout({
        cards: positioned,
        articleLeft: (articleRect.left - wrapRect.left) / s,
        articleRight: (articleRect.right - wrapRect.left) / s,
        articleHeight: articleEl.offsetHeight,
        width: wrapRect.width / s,
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
      if (summaryWrapRef.current) resizeObserver.observe(summaryWrapRef.current);
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
    extraDepKey,
  ]);

  return layout;
}
