import { useState, useRef, useCallback, useEffect } from 'react';

const TOOLTIP_HIDE_DELAY_MS = 200;

/**
 * Manages tooltip visibility state with debounced hide behaviour.
 *
 * @param {boolean} enabled - When false the tooltip will never be shown.
 * @returns {{
 *   tooltip: {x: number, y: number, topics: Array}|null,
 *   lastTargetRef: React.MutableRefObject,
 *   showTooltip: (topics: Array, x: number, y: number) => void,
 *   scheduleHide: () => void,
 *   cancelHide: () => void,
 *   hideTooltip: () => void,
 * }}
 */
export function useTooltip(enabled = true) {
  const [tooltip, setTooltip] = useState(null); // {x, y, topics: [{topic, rangeCount}]}
  const hideTimeoutRef = useRef(null);
  const lastTargetRef = useRef(null);

  // Cleanup any pending timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const showTooltip = useCallback((topics, x, y, meta = null) => {
    if (!enabled) return;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setTooltip({ x, y, topics, meta });
  }, [enabled]);

  const scheduleHide = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setTooltip(null);
      lastTargetRef.current = null;
    }, TOOLTIP_HIDE_DELAY_MS);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  /** Immediately hide the tooltip and clear the last target reference. */
  const hideTooltip = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setTooltip(null);
    lastTargetRef.current = null;
  }, []);

  return { tooltip, lastTargetRef, showTooltip, scheduleHide, cancelHide, hideTooltip };
}
