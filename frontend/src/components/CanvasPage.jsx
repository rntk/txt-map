import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isTopicRead } from "../utils/topicReadUtils";
import "./CanvasPage.css";

const POLL_INTERVAL_MS = 2000;
const CHAT_POLL_MAX_ATTEMPTS = 150;
const EVENT_APPLY_DELAY_MS = 120;
const EVENTS_LIMIT = 50;
const HIGHLIGHT_FOCUS_SCALE = 1.4;
const HIGHLIGHT_FOCUS_DELAY_MS = 50;
const HIGHLIGHT_FOCUS_TRANSITION_MS = 350;

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Read a fetch response as JSON, tolerating empty or non-JSON bodies so the
 * caller can still inspect response.ok and surface a useful error.
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Poll a canvas chat job until the backend finishes the slow LLM work.
 * @param {string} articleId
 * @param {string} requestId
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
async function pollCanvasChatReply(articleId, requestId, signal) {
  for (let attempt = 0; attempt < CHAT_POLL_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`/api/canvas/${articleId}/chat/${requestId}`, {
      credentials: "include",
      signal,
    });
    const data = await readJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}`);
    }
    if (data.status === "completed") {
      return data.reply || "";
    }
    if (data.status === "failed") {
      throw new Error(data.error || "Error");
    }

    await sleep(POLL_INTERVAL_MS, signal);
  }
  throw new Error("Chat response timed out.");
}

/**
 * Build text segments with highlights and optional read ranges applied.
 * @param {string} text
 * @param {{start: number, end: number, label?: string}[]} highlights
 * @param {{start: number, end: number}[]} [readRanges]
 * @returns {{text: string, start?: number, end?: number, highlighted: boolean, read: boolean, label?: string}[]}
 */
function buildSegments(text, highlights, readRanges) {
  const hasRead = Array.isArray(readRanges) && readRanges.length > 0;
  if (!highlights.length && !hasRead)
    return [{ text, highlighted: false, read: false }];

  const boundaries = new Set([0, text.length]);
  for (const h of highlights) {
    const s = Math.max(0, h.start);
    const e = Math.min(text.length, h.end);
    if (s < e) {
      boundaries.add(s);
      boundaries.add(e);
    }
  }
  if (hasRead) {
    for (const r of readRanges) {
      const s = Math.max(0, r.start);
      const e = Math.min(text.length, r.end);
      if (s < e) {
        boundaries.add(s);
        boundaries.add(e);
      }
    }
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segments = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const chunk = text.slice(start, end);
    const matching = highlights.filter((h) => h.start <= start && h.end >= end);
    const matchingRead = hasRead
      ? readRanges.filter((r) => r.start <= start && r.end >= end)
      : [];
    segments.push({
      text: chunk,
      start,
      end,
      highlighted: matching.length > 0,
      read: matchingRead.length > 0,
      label: matching.length > 0 ? matching[0].label : undefined,
    });
  }

  return segments;
}

/**
 * Derive highlights to render from a single event.
 */
function eventToHighlights(ev) {
  if (!ev) return [];
  if (ev.event_type === "highlight_span") {
    const { start, end, label } = ev.data || {};
    if (typeof start === "number" && typeof end === "number") {
      return [{ start, end, label: label || "" }];
    }
  }
  return [];
}

function eventLabel(ev, idx) {
  if (!ev) return `#${idx + 1}`;
  if (ev.event_type === "highlight_span") {
    const lbl = ev.data?.label;
    return lbl ? `${idx + 1}. ${lbl}` : `${idx + 1}. highlight`;
  }
  return `${idx + 1}. ${ev.event_type || "event"}`;
}

/**
 * Build text segments with highlights and optional read ranges applied,
 * split across pages.
 * @param {string} text
 * @param {{start: number, end: number, label?: string}[]} highlights
 * @param {{start: number, end: number}[]} [readRanges]
 * @param {{page_number: number, start: number, end: number}[]} [pages]
 * @returns {{type: "page-splitter", page_number: number} | {type: "segment", text: string, start?: number, end?: number, highlighted: boolean, read: boolean, label?: string}[]}
 */
function buildSegmentsWithPages(text, highlights, readRanges, pages) {
  const hasPages = Array.isArray(pages) && pages.length > 0;
  if (!hasPages) {
    return buildSegments(text, highlights, readRanges).map((s) => ({
      ...s,
      type: "segment",
    }));
  }

  const result = [];

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    const pageText = text.slice(page.start, page.end);

    if (p > 0) {
      result.push({ type: "page-splitter", page_number: page.page_number });
    }

    const pageHighlights = highlights
      .map((h) => ({
        start: Math.max(0, h.start - page.start),
        end: Math.min(page.end - page.start, h.end - page.start),
        label: h.label,
      }))
      .filter((h) => h.start < h.end && h.end > 0 && h.start < pageText.length);

    const pageRead = (readRanges || []).map((r) => ({
      start: Math.max(0, r.start - page.start),
      end: Math.min(page.end - page.start, r.end - page.start),
    }));

    const segments = buildSegments(pageText, pageHighlights, pageRead);
    for (const seg of segments) {
      result.push({
        ...seg,
        type: "segment",
        start: seg.start !== undefined ? seg.start + page.start : undefined,
        end: seg.end !== undefined ? seg.end + page.start : undefined,
      });
    }
  }

  return result;
}

/**
 * @param {{
 *   text: string,
 *   highlights: {start: number, end: number, label?: string}[],
 *   activeHighlightRef?: React.MutableRefObject<HTMLElement | null>,
 *   readRanges?: {start: number, end: number}[],
 *   showReadStatus?: boolean,
 *   pages?: {page_number: number, start: number, end: number}[]
 * }} props
 */
function ArticleText({
  text,
  highlights,
  activeHighlightRef,
  readRanges,
  showReadStatus,
  pages,
}) {
  const segments = buildSegmentsWithPages(
    text,
    highlights,
    showReadStatus ? readRanges : undefined,
    pages,
  );
  let firstHighlightedSegmentFound = false;

  return (
    <div className="canvas-article-text">
      {segments.map((seg, idx) => {
        if (seg.type === "page-splitter") {
          return (
            <div key={idx} className="canvas-page-splitter">
              <span className="canvas-page-splitter-line" />
              <span className="canvas-page-splitter-label">
                Page {seg.page_number}
              </span>
              <span className="canvas-page-splitter-line" />
            </div>
          );
        }

        const isActiveHighlightTarget =
          seg.highlighted && !firstHighlightedSegmentFound;
        if (seg.highlighted) {
          firstHighlightedSegmentFound = true;
        }

        if (seg.highlighted) {
          return (
            <mark
              key={idx}
              className="canvas-highlight"
              ref={isActiveHighlightTarget ? activeHighlightRef : undefined}
              title={seg.label || undefined}
              data-char-start={seg.start}
              data-char-end={seg.end}
            >
              {seg.text}
            </mark>
          );
        }

        return (
          <span
            key={idx}
            className={
              seg.read && showReadStatus ? "canvas-sentence--read" : undefined
            }
          >
            {seg.text}
          </span>
        );
      })}
    </div>
  );
}

/**
 * @param {{messages: {role: string, content: string}[], isLoading: boolean}} props
 */
function ChatHistory({ messages, isLoading }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="canvas-chat-history">
      {messages.length === 0 && (
        <div className="canvas-chat-empty">
          Send a message to start exploring this article.
        </div>
      )}
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`canvas-chat-message canvas-chat-message--${msg.role}`}
        >
          <span className="canvas-chat-role">
            {msg.role === "user" ? "You" : "Assistant"}
          </span>
          <span className="canvas-chat-content">{msg.content}</span>
        </div>
      ))}
      {isLoading && (
        <div className="canvas-chat-message canvas-chat-message--assistant">
          <span className="canvas-chat-role">Assistant</span>
          <span className="canvas-chat-content canvas-chat-loading">
            Thinking...
          </span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

export default function CanvasPage() {
  const articleId = window.location.pathname.split("/")[3];

  // Article text
  const [articleText, setArticleText] = useState("");
  const [articlePages, setArticlePages] = useState([]);
  const [articleLoading, setArticleLoading] = useState(true);
  const [articleError, setArticleError] = useState(null);

  // Canvas transform
  const [translate, setTranslate] = useState({ x: 40, y: 40 });
  const [scale, setScale] = useState(1);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const canvasWrapRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const activeHighlightRef = useRef(null);
  const scaleRef = useRef(1);
  const focusTimerRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const chatAbortRef = useRef(null);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [isFocusingHighlight, setIsFocusingHighlight] = useState(false);

  // Events / timeline
  const [events, setEvents] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLive, setIsLive] = useState(true);
  const [newIndices, setNewIndices] = useState(() => new Set());
  const offsetRef = useRef(0);
  const pendingEventsRef = useRef([]);
  const applyingRef = useRef(false);
  const isLiveRef = useRef(true);
  const fetchInFlightRef = useRef(false);
  const fetchGenerationRef = useRef(0);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    viewport.style.setProperty("--canvas-translate-x", `${translate.x}px`);
    viewport.style.setProperty("--canvas-translate-y", `${translate.y}px`);
    viewport.style.setProperty("--canvas-scale", `${scale}`);
  }, [scale, translate.x, translate.y]);

  // Chat
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Read/unread
  const [showReadStatus, setShowReadStatus] = useState(false);
  const [submissionSentences, setSubmissionSentences] = useState([]);
  const [submissionTopics, setSubmissionTopics] = useState([]);
  const [readTopics, setReadTopics] = useState([]);

  // Context limiter: comma-separated page numbers for chat
  const [contextPages, setContextPages] = useState("");

  // Right panel tab
  const [activeTab, setActiveTab] = useState("chat");

  // Load article text
  useEffect(() => {
    if (!articleId) return;
    fetch(`/api/canvas/${articleId}/article`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setArticleText(data.text || "");
        setArticlePages(data.pages || []);
        setSubmissionSentences(data.sentences || []);
        setSubmissionTopics(data.topics || []);
        setReadTopics(data.read_topics || []);
        setArticleLoading(false);
      })
      .catch((err) => {
        setArticleError(err.message);
        setArticleLoading(false);
      });
  }, [articleId]);

  // Apply events one-by-one with a small delay
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

  // Poll events
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

  // Highlights to render = only those from the selected event
  const currentHighlights = useMemo(
    () => eventToHighlights(events[selectedIndex]),
    [events, selectedIndex],
  );
  const currentHighlight = currentHighlights[0] || null;
  const currentHighlightFocusKey = currentHighlight
    ? `${selectedIndex}:${currentHighlight.start}:${currentHighlight.end}`
    : "";

  const readSentenceIndices = useMemo(() => {
    const set = new Set();
    (submissionTopics || []).forEach((topic) => {
      if (!isTopicRead(topic.name, readTopics)) return;
      const sents = Array.isArray(topic.sentences) ? topic.sentences : [];
      sents.forEach((num) => set.add(num - 1));
    });
    return set;
  }, [submissionTopics, readTopics]);

  const readRanges = useMemo(() => {
    if (submissionSentences.length === 0) return [];
    const ranges = [];
    let offset = 0;
    for (let i = 0; i < submissionSentences.length; i++) {
      const len = submissionSentences[i].length;
      if (readSentenceIndices.has(i)) {
        ranges.push({ start: offset, end: offset + len });
      }
      offset += len + 1;
    }
    return ranges;
  }, [submissionSentences, readSentenceIndices]);

  useEffect(() => {
    if (!currentHighlightFocusKey || articleLoading || articleError) {
      return undefined;
    }

    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
    }
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    focusTimerRef.current = setTimeout(() => {
      const wrap = canvasWrapRef.current;
      const viewport = canvasViewportRef.current;
      const target = activeHighlightRef.current;
      if (!wrap || !viewport || !target) return;

      const wrapRect = wrap.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      const currentScale = scaleRef.current || 1;
      const nextScale = Math.max(currentScale, HIGHLIGHT_FOCUS_SCALE);
      const localTargetX = (targetCenterX - viewportRect.left) / currentScale;
      const localTargetY = (targetCenterY - viewportRect.top) / currentScale;

      setIsFocusingHighlight(true);
      setScale(nextScale);
      setTranslate({
        x: wrapRect.width / 2 - localTargetX * nextScale,
        y: wrapRect.height / 2 - localTargetY * nextScale,
      });

      transitionTimerRef.current = setTimeout(() => {
        setIsFocusingHighlight(false);
      }, HIGHLIGHT_FOCUS_TRANSITION_MS);
    }, HIGHLIGHT_FOCUS_DELAY_MS);

    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, [articleError, articleLoading, currentHighlightFocusKey]);

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
    setSelectedIndex(events.length - 1);
  }, [events.length]);

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

  // Canvas drag
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setIsFocusingHighlight(false);
    setIsCanvasDragging(true);
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setTranslate((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    setIsCanvasDragging(false);
  }, []);

  // Canvas zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.min(4, Math.max(0.2, prev * delta)));
  }, []);

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Scroll control helpers
  const scrollTo = useCallback((pos) => {
    const el = canvasWrapRef.current;
    if (el) {
      if (pos === "top") el.scrollTop = 0;
      else if (pos === "bottom") el.scrollTop = el.scrollHeight;
      else if (pos === "prev") el.scrollTop -= el.clientHeight;
      else if (pos === "next") el.scrollTop += el.clientHeight;
    }
  }, []);

  useEffect(() => {
    const handleKeyDownGlobal = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if (e.key === "Home") scrollTo("top");
      else if (e.key === "End") scrollTo("bottom");
      else if (e.key === "PageUp") scrollTo("prev");
      else if (e.key === "PageDown") scrollTo("next");
    };
    window.addEventListener("keydown", handleKeyDownGlobal);
    return () => window.removeEventListener("keydown", handleKeyDownGlobal);
  }, [scrollTo]);

  // Chat submit
  const handleSend = useCallback(async () => {
    const msg = inputValue.trim();
    if (!msg || isChatLoading) return;

    setInputValue("");
    const history = messages;
    const newHistory = [...history, { role: "user", content: msg }];
    setMessages(newHistory);
    setIsChatLoading(true);

    // Parse context pages from input (comma-separated numbers)
    let parsedPages = null;
    if (contextPages.trim()) {
      const maxPage = articlePages.length;
      const seen = new Set();
      parsedPages = contextPages
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => {
          if (isNaN(n) || n <= 0) return false;
          if (maxPage > 0 && n > maxPage) return false;
          if (seen.has(n)) return false;
          seen.add(n);
          return true;
        });
      if (parsedPages.length === 0) {
        parsedPages = null;
      }
    }

    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const r = await fetch(`/api/canvas/${articleId}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history, pages: parsedPages }),
        signal: controller.signal,
      });
      const data = await readJsonSafe(r);
      if (!r.ok) {
        throw new Error(data.detail || `HTTP ${r.status}`);
      }

      const reply = data.request_id
        ? await pollCanvasChatReply(
            articleId,
            data.request_id,
            controller.signal,
          )
        : data.reply || "";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("Canvas chat failed", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to get a response." },
      ]);
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setIsChatLoading(false);
        // Fetch new events after chat response (LLM may have added highlights)
        setTimeout(fetchEvents, 300);
      }
    }
  }, [
    articleId,
    inputValue,
    isChatLoading,
    messages,
    fetchEvents,
    contextPages,
    articlePages,
  ]);

  const handleNewChat = useCallback(() => {
    if (isChatLoading) return;
    setMessages([]);
    setInputValue("");
  }, [isChatLoading]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="canvas-page">
      {/* Left: Canvas */}
      <div className="canvas-main">
        <div
          ref={canvasWrapRef}
          className={`canvas-area${isCanvasDragging ? " is-dragging" : ""}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            ref={canvasViewportRef}
            className={`canvas-viewport${isFocusingHighlight ? " is-focusing-highlight" : ""}`}
          >
            {articleLoading && (
              <div className="canvas-status">Loading article...</div>
            )}
            {articleError && (
              <div className="canvas-status canvas-status--error">
                Error: {articleError}
              </div>
            )}
            {!articleLoading && !articleError && (
              <ArticleText
                text={articleText}
                highlights={currentHighlights}
                activeHighlightRef={activeHighlightRef}
                readRanges={readRanges}
                showReadStatus={showReadStatus}
                pages={articlePages}
              />
            )}
          </div>
        </div>
        <div className="canvas-controls">
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => scrollTo("top")}
            title="Scroll to top"
          >
            ⇈
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => scrollTo("prev")}
            title="Previous page"
          >
            ↑
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => scrollTo("next")}
            title="Next page"
          >
            ↓
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => scrollTo("bottom")}
            title="Scroll to bottom"
          >
            ⇊
          </button>
          <div className="canvas-spacer" />
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => setScale((s) => Math.min(4, s * 1.2))}
          >
            +
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => setScale((s) => Math.max(0.2, s / 1.2))}
          >
            −
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => {
              setScale(1);
              setTranslate({ x: 40, y: 40 });
            }}
          >
            ⊙
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showReadStatus ? " is-active" : ""}`}
            onClick={() => setShowReadStatus((v) => !v)}
            title={
              showReadStatus
                ? "Hide read/unread status"
                : "Show read/unread status"
            }
          >
            R
          </button>
        </div>
      </div>

      {/* Right: Tabbed Panel */}
      <div className="canvas-chat-panel">
        <div className="canvas-panel-tabs">
          <button
            type="button"
            className={`canvas-panel-tab${activeTab === "chat" ? " is-active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            className={`canvas-panel-tab${activeTab === "events" ? " is-active" : ""}`}
            onClick={() => setActiveTab("events")}
          >
            Events
            {newIndices.size > 0 && <span className="canvas-tab-dot" />}
          </button>
        </div>

        {/* Chat tab */}
        <div
          className={`canvas-tab-content${activeTab === "chat" ? " is-active" : ""}`}
        >
          <div className="canvas-chat-header">
            <span>Article Assistant</span>
            <button
              type="button"
              className="canvas-chat-new"
              onClick={handleNewChat}
              disabled={isChatLoading || messages.length === 0}
              title="Start a new chat"
            >
              New Chat
            </button>
          </div>
          <div className="canvas-chat-context-limiter">
            <label htmlFor="context-pages-input">Context pages:</label>
            <input
              id="context-pages-input"
              className="canvas-chat-context-pages-input"
              type="text"
              placeholder="e.g. 1,3,5 (all if empty)"
              value={contextPages}
              onChange={(e) => setContextPages(e.target.value)}
              disabled={isChatLoading}
            />
          </div>
          <ChatHistory messages={messages} isLoading={isChatLoading} />
          <div className="canvas-chat-input-row">
            <textarea
              className="canvas-chat-input"
              placeholder="Ask about this article…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={isChatLoading}
            />
            <button
              type="button"
              className="canvas-chat-send"
              onClick={handleSend}
              disabled={!inputValue.trim() || isChatLoading}
            >
              Send
            </button>
          </div>
        </div>

        {/* Events tab */}
        <div
          className={`canvas-tab-content${activeTab === "events" ? " is-active" : ""}`}
        >
          <div className="canvas-events-list">
            {deleteError && (
              <div className="canvas-events-error">{deleteError}</div>
            )}
            {events.length === 0 && !deleteError && (
              <span className="canvas-events-empty">No events yet</span>
            )}
            {events.map((ev, i) => {
              const classes = ["canvas-events-item"];
              if (i === selectedIndex) classes.push("is-selected");
              if (newIndices.has(i)) classes.push("is-new");
              return (
                <div key={i} className={classes.join(" ")} role="listitem">
                  <button
                    type="button"
                    className="canvas-events-item-select"
                    onClick={() => handleSelectEvent(i)}
                    title={eventLabel(ev, i)}
                    aria-label={eventLabel(ev, i)}
                  >
                    <span className="canvas-events-item-index">#{i + 1}</span>
                    <span className="canvas-events-item-label">
                      {eventLabel(ev, i)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="canvas-events-item-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEvent(ev.seq);
                    }}
                    title="Delete event"
                    aria-label="Delete event"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div className="canvas-events-footer">
            <button
              type="button"
              className={`canvas-timeline-live${isLive ? " is-active" : ""}`}
              onClick={handleGoLive}
              title="Follow latest events"
            >
              ● Live
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
