import { useEffect, useState } from "react";
import { getTopicParts } from "../../utils/topicHierarchy";
import { TOPIC_HIERARCHY_CARD_MIN_HEIGHT_PX } from "./constants";
import {
  clampCanvasScale,
  getTopicDisplayName,
  getTopicSentenceNumbers,
  getTopicTextRange,
  rangeAtOffset,
  splitTopicHierarchyRowsForArticleOrder,
  splitTopicHierarchyRowsForSummaryOrder,
  getMatchingSummaryCardsForHierarchyRow,
} from "./utils";

/**
 * Computes positioned topic cards for the hierarchy rail.
 * @param {{
 *   showTopicHierarchy: boolean,
 *   showSummaryMode: boolean,
 *   articleLoading: boolean,
 *   articleError: string | null,
 *   topicHierarchyRowsByLevel: Array<Array<unknown>>,
 *   summaryViewCards: Array<{path: string}>,
 *   sentenceOffsets: number[],
 *   submissionSentences: string[],
 *   articleText: string,
 *   articlePages: Array<unknown>,
 *   articleImages: Array<unknown>,
 *   selectedLevel: number,
 *   articleTextRef: React.RefObject<HTMLElement>,
 *   summaryWrapRef: React.RefObject<HTMLElement>,
 *   summaryCardRefs: React.MutableRefObject<Record<string, HTMLElement>>,
 *   scaleRef: React.MutableRefObject<number>,
 * }} params
 * @returns {{ topicCards: Array<unknown> }}
 */
export function useTopicHierarchyLayout({
  showTopicHierarchy,
  showSummaryMode,
  articleLoading,
  articleError,
  topicHierarchyRowsByLevel,
  summaryViewCards,
  sentenceOffsets,
  submissionSentences,
  articleText,
  articlePages,
  articleImages,
  selectedLevel,
  articleTextRef,
  summaryWrapRef,
  summaryCardRefs,
  scaleRef,
}) {
  const [topicHierarchyLayout, setTopicHierarchyLayout] = useState({
    topicCards: [],
  });

  useEffect(() => {
    const hierarchyVisible = showTopicHierarchy || showSummaryMode;
    if (!hierarchyVisible || articleLoading || articleError) {
      setTopicHierarchyLayout({ topicCards: [] });
      return undefined;
    }
    if (topicHierarchyRowsByLevel.every((rows) => rows.length === 0)) {
      setTopicHierarchyLayout({ topicCards: [] });
      return undefined;
    }

    let raf = 0;
    const compute = () => {
      const articleEl = articleTextRef.current;
      const wrapEl = summaryWrapRef.current;
      if (!articleEl || !wrapEl) return;
      const articleRect = articleEl.getBoundingClientRect();
      const wrapRect = wrapEl.getBoundingClientRect();
      const offsetH = articleEl.offsetHeight;
      const s =
        offsetH > 0
          ? clampCanvasScale(articleRect.height / offsetH)
          : scaleRef.current || 1;
      const summaryRectForRow = (row) => {
        const matching = getMatchingSummaryCardsForHierarchyRow(
          row,
          summaryViewCards,
        );
        if (matching.length === 0) return null;
        let top = Number.POSITIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;
        for (const c of matching) {
          const el = summaryCardRefs.current[c.path];
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.top < top) top = r.top;
          if (r.bottom > bottom) bottom = r.bottom;
        }
        if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
        return { top, bottom };
      };

      const toPositionedCard = (row, levelIndex) => {
        let rawTop;
        let rawBottom;

        if (showSummaryMode) {
          const rect = summaryRectForRow(row);
          if (!rect) return null;
          rawTop = (rect.top - wrapRect.top) / s;
          rawBottom = (rect.bottom - wrapRect.top) / s;
        } else {
          const textRange = getTopicTextRange(
            row,
            sentenceOffsets,
            submissionSentences,
          );
          if (!textRange) return null;
          const startRange = rangeAtOffset(articleEl, textRange.charStart);
          const endRange = rangeAtOffset(
            articleEl,
            Math.max(0, textRange.charEnd - 1),
          );
          if (!startRange || !endRange) return null;
          const startRect = startRange.getBoundingClientRect();
          const endRect = endRange.getBoundingClientRect();
          rawTop = (startRect.top - wrapRect.top) / s;
          rawBottom = (endRect.bottom - wrapRect.top) / s;
        }

        const sentenceNumbers = getTopicSentenceNumbers(row);
        const startSentence =
          sentenceNumbers.length > 0 ? Math.min(...sentenceNumbers) : 0;
        const endSentence =
          sentenceNumbers.length > 0 ? Math.max(...sentenceNumbers) : 0;
        const height = Math.max(
          TOPIC_HIERARCHY_CARD_MIN_HEIGHT_PX,
          rawBottom - rawTop,
        );

        return {
          key: `${levelIndex}:${row.occurrenceKey || row.fullPath}`,
          fullPath: row.fullPath,
          displayName: getTopicDisplayName(row),
          sentenceCount: sentenceNumbers.length,
          startSentence,
          endSentence,
          top: rawTop,
          height,
          depth: Math.max(0, getTopicParts(row.fullPath).length - 1),
          levelIndex,
        };
      };

      const layoutRowsByLevel = showSummaryMode
        ? topicHierarchyRowsByLevel.map((rows) =>
            splitTopicHierarchyRowsForSummaryOrder(rows, summaryViewCards),
          )
        : topicHierarchyRowsByLevel.map(splitTopicHierarchyRowsForArticleOrder);

      const topicCards = layoutRowsByLevel
        .flatMap((rows, levelIndex) =>
          rows.map((row) => toPositionedCard(row, levelIndex)),
        )
        .filter(Boolean)
        .sort(
          (left, right) =>
            left.levelIndex - right.levelIndex || left.top - right.top,
        );

      setTopicHierarchyLayout({ topicCards });
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
      if (articleTextRef.current) {
        resizeObserver.observe(articleTextRef.current);
      }
      if (summaryWrapRef.current) {
        resizeObserver.observe(summaryWrapRef.current);
      }
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      if (resizeObserver) resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    articleError,
    articleLoading,
    articlePages,
    articleImages,
    articleText,
    selectedLevel,
    sentenceOffsets,
    showTopicHierarchy,
    showSummaryMode,
    submissionSentences,
    summaryViewCards,
    topicHierarchyRowsByLevel,
  ]);

  return topicHierarchyLayout;
}
