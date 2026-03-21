import { useState, useRef, useCallback, useEffect } from 'react';

const TOOLTIP_SHOW_DELAY_MS = 300;
const TOOLTIP_HIDE_DELAY_MS = 200;

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   topics: Array,
 *   meta: ({ sentenceIdx?: number, totalSentences?: number, word?: string }|null),
 * }} TooltipState
 */

/**
 * Manages tooltip visibility state with delayed show and debounced hide behaviour.
 *
 * @param {boolean} enabled - When false the tooltip will never be shown.
 * @returns {{
 *   tooltip: TooltipState|null,
 *   lastTargetRef: React.MutableRefObject<EventTarget|null>,
 *   showTooltip: (topics: Array, x: number, y: number, meta?: TooltipState["meta"]) => void,
 *   updateTooltipPosition: (x: number, y: number, meta?: TooltipState["meta"]) => void,
 *   scheduleHide: () => void,
 *   cancelHide: () => void,
 *   hideTooltip: () => void,
 * }}
 */
export function useTooltip(enabled = true) {
  /** @type {[TooltipState|null, import('react').Dispatch<import('react').SetStateAction<TooltipState|null>>]} */
  const [tooltip, setTooltip] = useState(null);
  const showTimeoutRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const lastTargetRef = useRef(null);
  const pendingTooltipRef = useRef(null);

  const clearShowTimeout = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
  }, []);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // Cleanup any pending timeout on unmount
  useEffect(() => {
    return () => {
      clearShowTimeout();
      clearHideTimeout();
    };
  }, [clearHideTimeout, clearShowTimeout]);

  const showTooltip = useCallback((topics, x, y, meta = null) => {
    if (!enabled) return;
    clearHideTimeout();
    clearShowTimeout();
    pendingTooltipRef.current = { x, y, topics, meta };
    showTimeoutRef.current = setTimeout(() => {
      setTooltip(pendingTooltipRef.current);
      showTimeoutRef.current = null;
    }, TOOLTIP_SHOW_DELAY_MS);
  }, [clearHideTimeout, clearShowTimeout, enabled]);

  const updateTooltipPosition = useCallback((x, y, meta = undefined) => {
    if (pendingTooltipRef.current) {
      pendingTooltipRef.current = {
        ...pendingTooltipRef.current,
        x,
        y,
        meta: meta === undefined ? pendingTooltipRef.current.meta : meta,
      };
    }

    setTooltip((currentTooltip) => {
      if (!currentTooltip) {
        return currentTooltip;
      }

      return {
        ...currentTooltip,
        x,
        y,
        meta: meta === undefined ? currentTooltip.meta : meta,
      };
    });
  }, []);

  const scheduleHide = useCallback(() => {
    clearShowTimeout();
    pendingTooltipRef.current = null;

    if (!tooltip) {
      lastTargetRef.current = null;
      return;
    }

    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      setTooltip(null);
      lastTargetRef.current = null;
      pendingTooltipRef.current = null;
      hideTimeoutRef.current = null;
    }, TOOLTIP_HIDE_DELAY_MS);
  }, [clearHideTimeout, clearShowTimeout, tooltip]);

  const cancelHide = useCallback(() => {
    clearHideTimeout();
  }, [clearHideTimeout]);

  /** Immediately hide the tooltip and clear the last target reference. */
  const hideTooltip = useCallback(() => {
    clearShowTimeout();
    clearHideTimeout();
    setTooltip(null);
    lastTargetRef.current = null;
    pendingTooltipRef.current = null;
  }, [clearHideTimeout, clearShowTimeout]);

  useEffect(() => {
    if (!enabled) {
      hideTooltip();
    }
  }, [enabled, hideTooltip]);

  return { tooltip, lastTargetRef, showTooltip, updateTooltipPosition, scheduleHide, cancelHide, hideTooltip };
}
