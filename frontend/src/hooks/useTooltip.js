import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   topics: Array,
 *   meta: ({ sentenceIdx?: number, totalSentences?: number, word?: string, linkHref?: string, linkText?: string }|null),
 * }} TooltipState
 */

/**
 * Manages tooltip visibility state for click/tap triggered tooltips.
 * The tooltip is shown immediately on demand and dismissed explicitly.
 *
 * @param {boolean} enabled - When false the tooltip will never be shown.
 * @returns {{
 *   tooltip: TooltipState|null,
 *   lastTargetRef: React.MutableRefObject<EventTarget|null>,
 *   showTooltip: (topics: Array, x: number, y: number, meta?: TooltipState["meta"]) => void,
 *   hideTooltip: () => void,
 * }}
 */
export function useTooltip(enabled = true) {
  /** @type {[TooltipState|null, import('react').Dispatch<import('react').SetStateAction<TooltipState|null>>]} */
  const [tooltip, setTooltip] = useState(null);
  const lastTargetRef = useRef(null);

  const showTooltip = useCallback((topics, x, y, meta = null) => {
    if (!enabled) return;
    setTooltip({ x, y, topics, meta });
  }, [enabled]);

  /** Immediately hide the tooltip and clear the last target reference. */
  const hideTooltip = useCallback(() => {
    setTooltip(null);
    lastTargetRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      hideTooltip();
    }
  }, [enabled, hideTooltip]);

  return { tooltip, lastTargetRef, showTooltip, hideTooltip };
}
