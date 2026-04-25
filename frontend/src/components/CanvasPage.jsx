import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
 * Build text segments with highlights applied.
 * @param {string} text
 * @param {{start: number, end: number, label?: string}[]} highlights
 * @returns {{text: string, start?: number, end?: number, highlighted: boolean, label?: string}[]}
 */
function buildSegments(text, highlights) {
  if (!highlights.length) return [{ text, highlighted: false }];

  const boundaries = new Set([0, text.length]);
  for (const h of highlights) {
    const s = Math.max(0, h.start);
    const e = Math.min(text.length, h.end);
    if (s < e) {
      boundaries.add(s);
      boundaries.add(e);
    }
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segments = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const chunk = text.slice(start, end);
    const matching = highlights.filter((h) => h.start <= start && h.end >= end);
    segments.push({
      text: chunk,
      start,
      end,
      highlighted: matching.length > 0,
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
 * @param {{
 *   text: string,
 *   highlights: {start: number, end: number, label?: string}[],
 *   activeHighlightRef?: React.MutableRefObject<HTMLElement | null>
 * }} props
 */
function ArticleText({ text, highlights, activeHighlightRef }) {
  const segments = buildSegments(text, highlights);
  let firstHighlightedSegmentFound = false;

  return (
    <div className="canvas-article-text">
      {segments.map((seg, idx) => {
        const isActiveHighlightTarget =
          seg.highlighted && !firstHighlightedSegmentFound;
        if (seg.highlighted) {
          firstHighlightedSegmentFound = true;
        }

        return seg.highlighted ? (
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
        ) : (
          <span key={idx}>{seg.text}</span>
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
    if (!articleId) return;
    const url = `/api/canvas/${articleId}/events?offset=${offsetRef.current}&limit=${EVENTS_LIMIT}`;
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.events || data.events.length === 0) return;
        offsetRef.current += data.events.length;
        pendingEventsRef.current.push(...data.events);
        applyNextEvent();
      })
      .catch(() => {});
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

  // Chat submit
  const handleSend = useCallback(async () => {
    const msg = inputValue.trim();
    if (!msg || isChatLoading) return;

    setInputValue("");
    const history = messages;
    const newHistory = [...history, { role: "user", content: msg }];
    setMessages(newHistory);
    setIsChatLoading(true);

    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const r = await fetch(`/api/canvas/${articleId}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history }),
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
  }, [articleId, inputValue, isChatLoading, messages, fetchEvents]);

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
              />
            )}
          </div>
          <div className="canvas-controls">
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
          </div>
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
            {events.length === 0 && (
              <span className="canvas-events-empty">No events yet</span>
            )}
            {events.map((ev, i) => {
              const classes = ["canvas-events-item"];
              if (i === selectedIndex) classes.push("is-selected");
              if (newIndices.has(i)) classes.push("is-new");
              return (
                <button
                  type="button"
                  key={i}
                  className={classes.join(" ")}
                  onClick={() => handleSelectEvent(i)}
                  title={eventLabel(ev, i)}
                  aria-label={eventLabel(ev, i)}
                >
                  <span className="canvas-events-item-index">#{i + 1}</span>
                  <span className="canvas-events-item-label">
                    {eventLabel(ev, i)}
                  </span>
                </button>
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
