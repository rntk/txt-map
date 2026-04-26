import { useCallback, useEffect, useRef, useState } from "react";
import {
  EVENT_APPLY_DELAY_MS,
  EVENTS_LIMIT,
  POLL_INTERVAL_MS,
} from "./constants";
import { readJsonSafe } from "./utils";

/**
 * Hook that manages canvas events polling, timeline selection, and deletion.
 */
export function useCanvasEvents(articleId) {
  const [events, setEvents] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLive, setIsLive] = useState(true);
  const [newIndices, setNewIndices] = useState(() => new Set());
  const [deleteError, setDeleteError] = useState(null);

  const offsetRef = useRef(0);
  const pendingEventsRef = useRef([]);
  const applyingRef = useRef(false);
  const isLiveRef = useRef(true);
  const fetchInFlightRef = useRef(false);
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  const applyNextEvent = useCallback(() => {
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
        applyNextEvent();
      }
    }, EVENT_APPLY_DELAY_MS);
  }, []);

  const fetchEvents = useCallback(() => {
    if (!articleId || fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    const generation = fetchGenerationRef.current;
    const url = `/api/canvas/${articleId}/events?offset=${offsetRef.current}&limit=${EVENTS_LIMIT}`;
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (generation !== fetchGenerationRef.current) return;
        if (!data || !data.events || data.events.length === 0) return;
        offsetRef.current += data.events.length;
        pendingEventsRef.current.push(...data.events);
        applyNextEvent();
      })
      .catch(() => {})
      .finally(() => {
        if (generation === fetchGenerationRef.current) {
          fetchInFlightRef.current = false;
        }
      });
  }, [articleId, applyNextEvent]);

  useEffect(() => {
    fetchEvents();
    const timer = setInterval(fetchEvents, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchEvents]);

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
    setSelectedIndex((prev) => {
      // will be set to events.length - 1 via effect
      return prev;
    });
  }, []);

  // Keep selectedIndex in sync with live events
  useEffect(() => {
    if (isLive && events.length > 0) {
      setSelectedIndex(events.length - 1);
    }
  }, [isLive, events.length]);

  const handleDeleteEvent = useCallback(
    async (seq) => {
      if (!articleId) return;
      if (!window.confirm("Delete this event?")) return;
      setDeleteError(null);

      try {
        const response = await fetch(`/api/canvas/${articleId}/events/${seq}`, {
          method: "DELETE",
          credentials: "include",
        });
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
    [articleId, fetchEvents],
  );

  const currentHighlights = events[selectedIndex]
    ? (() => {
        const ev = events[selectedIndex];
        if (!ev) return [];
        if (ev.event_type === "highlight_span") {
          const { start, end, label } = ev.data || {};
          if (typeof start === "number" && typeof end === "number") {
            return [{ start, end, label: label || "" }];
          }
        }
        return [];
      })()
    : [];

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
