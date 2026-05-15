import { useCallback, useEffect, useRef, useState } from "react";
import {
  EVENT_APPLY_DELAY_MS,
  EVENTS_LIMIT,
  POLL_INTERVAL_MS,
} from "./constants";
import { readJsonSafe } from "./utils";

/**
 * Derives the current highlight spans from the selected event.
 * @param {Array} events
 * @param {number} selectedIndex
 * @returns {Array<{start: number, end: number, label: string}>}
 */
function deriveCurrentHighlights(events, selectedIndex) {
  const ev = events[selectedIndex];
  if (!ev) return [];
  if (ev.event_type === "highlight_span") {
    const { start, end, label } = ev.data || {};
    if (typeof start === "number" && typeof end === "number") {
      return [{ start, end, label: label || "" }];
    }
  }
  return [];
}

/**
 * Sub-hook: manages the queued event application loop.
 * @param {React.MutableRefObject<boolean>} isLiveRef
 */
function useEventApplyQueue(isLiveRef) {
  const pendingEventsRef = useRef([]);
  const applyingRef = useRef(false);

  const applyNextEvent = useCallback(
    (setEvents, setSelectedIndex, setNewIndices) => {
      if (applyingRef.current) return;
      if (pendingEventsRef.current.length === 0) return;

      applyingRef.current = true;
      const ev = pendingEventsRef.current.shift();

      setEvents((prev) => {
        const next = [...prev, ev];
        const newIdx = next.length - 1;
        if (isLiveRef.current) {
          setSelectedIndex(newIdx);
        } else {
          setNewIndices((s) => {
            const n = new Set(s);
            n.add(newIdx);
            return n;
          });
        }
        return next;
      });

      setTimeout(() => {
        applyingRef.current = false;
        if (pendingEventsRef.current.length > 0) {
          applyNextEvent(setEvents, setSelectedIndex, setNewIndices);
        }
      }, EVENT_APPLY_DELAY_MS);
    },
    [isLiveRef],
  );

  return { pendingEventsRef, applyNextEvent };
}

/**
 * Sub-hook: manages per-chat polling state and provides fetchEvents callback.
 */
function useEventPolling(articleId, chatId, pendingEventsRef, applyNextEvent) {
  const offsetRef = useRef(0);
  const fetchInFlightRef = useRef(false);
  const fetchGenerationRef = useRef(0);
  const chatIdRef = useRef(chatId);

  const fetchEvents = useCallback(
    (setEvents, setSelectedIndex, setNewIndices) => {
      if (!articleId || !chatId) return;
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;
      const generation = fetchGenerationRef.current;
      const url = `/api/canvas/${articleId}/chats/${chatId}/events?offset=${offsetRef.current}&limit=${EVENTS_LIMIT}`;
      fetch(url, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (generation !== fetchGenerationRef.current) return;
          if (chatIdRef.current !== chatId) return;
          if (!data || !data.events || data.events.length === 0) return;
          offsetRef.current += data.events.length;
          pendingEventsRef.current.push(...data.events);
          applyNextEvent(setEvents, setSelectedIndex, setNewIndices);
        })
        .catch(() => {})
        .finally(() => {
          if (generation === fetchGenerationRef.current) {
            fetchInFlightRef.current = false;
          }
        });
    },
    [articleId, chatId, pendingEventsRef, applyNextEvent],
  );

  return { offsetRef, fetchInFlightRef, fetchGenerationRef, chatIdRef, fetchEvents };
}

/**
 * Hook that manages canvas events polling, timeline selection, and deletion
 * for a single chat session.
 *
 * Events are scoped per chat: changing `chatId` resets internal state and
 * starts polling the new chat's events endpoint. Background polling only runs
 * for the currently active chat.
 *
 * @param {string} articleId
 * @param {string|null|undefined} chatId
 */
export function useCanvasEvents(articleId, chatId) {
  const [events, setEvents] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLive, setIsLive] = useState(false);
  const [newIndices, setNewIndices] = useState(() => new Set());
  const [deleteError, setDeleteError] = useState(null);

  const isLiveRef = useRef(false);
  useEffect(() => { isLiveRef.current = isLive; }, [isLive]);

  const { pendingEventsRef, applyNextEvent } = useEventApplyQueue(isLiveRef);
  const { offsetRef, fetchInFlightRef, fetchGenerationRef, chatIdRef, fetchEvents: fetchEventsRaw } =
    useEventPolling(articleId, chatId, pendingEventsRef, applyNextEvent);

  // Stable wrapper so callers don't need to pass state setters
  const fetchEvents = useCallback(() => {
    fetchEventsRaw(setEvents, setSelectedIndex, setNewIndices);
  }, [fetchEventsRaw]);

  // Reset state when the active chat changes so events are scoped per chat.
  useEffect(() => {
    chatIdRef.current = chatId;
    fetchGenerationRef.current += 1;
    offsetRef.current = 0;
    pendingEventsRef.current = [];
    fetchInFlightRef.current = false;
    setEvents([]);
    setSelectedIndex(-1);
    setIsLive(false);
    setNewIndices(new Set());
    setDeleteError(null);
  }, [chatId, chatIdRef, fetchGenerationRef, offsetRef, pendingEventsRef, fetchInFlightRef]);

  useEffect(() => {
    if (!articleId || !chatId) return undefined;
    fetchEvents();
    const timer = setInterval(fetchEvents, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [articleId, chatId, fetchEvents]);

  const handleSelectEvent = useCallback((idx) => {
    setSelectedIndex(idx);
    setIsLive(false);
    setNewIndices((s) => {
      if (!s.has(idx)) return s;
      const n = new Set(s);
      n.delete(idx);
      return n;
    });
  }, []);

  const handleGoLive = useCallback(() => {
    setIsLive(true);
    setNewIndices(new Set());
  }, []);

  // Keep selectedIndex in sync with live events
  useEffect(() => {
    if (isLive && events.length > 0) setSelectedIndex(events.length - 1);
  }, [isLive, events.length]);

  const handleDeleteEvent = useCallback(
    async (seq) => {
      if (!articleId || !chatId) return;
      if (!window.confirm("Delete this event?")) return;
      setDeleteError(null);
      try {
        const response = await fetch(
          `/api/canvas/${articleId}/chats/${chatId}/events/${seq}`,
          { method: "DELETE", credentials: "include" },
        );
        if (!response.ok) {
          const data = await readJsonSafe(response);
          throw new Error(data.detail || `HTTP ${response.status}`);
        }
        fetchGenerationRef.current += 1;
        setEvents([]);
        setSelectedIndex(-1);
        setNewIndices(new Set());
        offsetRef.current = 0;
        pendingEventsRef.current = [];
        fetchInFlightRef.current = false;
        fetchEvents();
      } catch (err) {
        console.error("Failed to delete event", err);
        setDeleteError(err.message || "Failed to delete event");
      }
    },
    [articleId, chatId, fetchEvents, fetchGenerationRef, offsetRef, pendingEventsRef, fetchInFlightRef],
  );

  const currentHighlights = deriveCurrentHighlights(events, selectedIndex);

  return {
    events,
    selectedIndex,
    isLive,
    newIndices,
    deleteError,
    currentHighlights,
    handleSelectEvent,
    handleGoLive,
    handleDeleteEvent,
    fetchEvents,
  };
}
