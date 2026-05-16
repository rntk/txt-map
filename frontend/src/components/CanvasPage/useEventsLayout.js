import { useMemo } from "react";
import { useRailLayout } from "./useRailLayout";
import { eventLabel } from "./utils";

/**
 * Builds rail entries from raw timeline events. Only events that carry a
 * numeric character span (`highlight_span`) can be anchored to the article,
 * so other event types are skipped.
 *
 * @param {Array<object>} events
 * @returns {Array<{
 *   key: string,
 *   eventIndex: number,
 *   name: string,
 *   preview: string,
 *   charStart: number,
 *   charEnd: number,
 * }>}
 */
function buildEventEntries(events) {
  const list = Array.isArray(events) ? events : [];
  const entries = [];
  list.forEach((ev, index) => {
    if (!ev || ev.event_type !== "highlight_span") return;
    const { start, end, label } = ev.data || {};
    if (typeof start !== "number" || typeof end !== "number") return;
    if (end <= start) return;
    entries.push({
      key: String(ev.seq ?? index),
      eventIndex: index,
      name: eventLabel(ev, index),
      preview: label || "highlight",
      charStart: start,
      charEnd: end,
    });
  });
  return entries;
}

/**
 * Computes sidebar positions for timeline-event cards based on their
 * highlight span in the article layout. Thin wrapper over
 * {@link useRailLayout}.
 *
 * @param {{
 *   showEvents: boolean,
 *   events: Array<object>,
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
export function useEventsLayout({
  showEvents,
  events,
  articleLoading,
  articleError,
  articleText,
  articlePages,
  articleImages,
  articleTextRef,
  summaryWrapRef,
  scaleRef,
}) {
  const entries = useMemo(() => buildEventEntries(events), [events]);

  const { cards, articleRight, articleHeight } = useRailLayout({
    show: showEvents,
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

  return { cards, articleRight, articleHeight };
}
