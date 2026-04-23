import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import "./CanvasPage.css";

const POLL_INTERVAL_MS = 2000;
const EVENT_APPLY_DELAY_MS = 120;
const EVENTS_LIMIT = 50;

/**
 * Build text segments with highlights applied.
 * @param {string} text
 * @param {{start: number, end: number, label?: string}[]} highlights
 * @returns {{text: string, highlighted: boolean, label?: string}[]}
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
    const matching = highlights.filter(
      (h) => h.start <= start && h.end >= end
    );
    segments.push({
      text: chunk,
      highlighted: matching.length > 0,
      label: matching.length > 0 ? matching[0].label : undefined,
    });
  }

  return segments;
}

/**
 * @param {{text: string, highlights: {start: number, end: number, label?: string}[]}} props
 */
function ArticleText({ text, highlights }) {
  const segments = buildSegments(text, highlights);
  return (
    <div className="canvas-article-text">
      {segments.map((seg, idx) =>
        seg.highlighted ? (
          <mark
            key={idx}
            className="canvas-highlight"
            title={seg.label || undefined}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={idx}>{seg.text}</span>
        )
      )}
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

  // Events / highlights
  const [highlights, setHighlights] = useState([]);
  const offsetRef = useRef(0);
  const pendingEventsRef = useRef([]);
  const applyingRef = useRef(false);

  // Chat
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

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

    if (ev.event_type === "highlight_span") {
      const { start, end, label } = ev.data;
      setHighlights((prev) => [...prev, { start, end, label: label || "" }]);
    }

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
      .then((r) => r.ok ? r.json() : null)
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

  // Canvas drag
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
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
    const newHistory = [...messages, { role: "user", content: msg }];
    setMessages(newHistory);
    setIsChatLoading(true);

    try {
      const r = await fetch(`/api/canvas/${articleId}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: messages }),
      });
      const data = await r.json();
      const reply = r.ok ? (data.reply || "") : (data.detail || "Error");
      setMessages([...newHistory, { role: "assistant", content: reply }]);
    } catch {
      setMessages([
        ...newHistory,
        { role: "assistant", content: "Failed to get a response." },
      ]);
    } finally {
      setIsChatLoading(false);
      // Fetch new events after chat response (LLM may have added highlights)
      setTimeout(fetchEvents, 300);
    }
  }, [articleId, inputValue, isChatLoading, messages, fetchEvents]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="canvas-page">
      {/* Left: Canvas */}
      <div
        ref={canvasWrapRef}
        className="canvas-area"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging.current ? "grabbing" : "grab" }}
      >
        <div
          className="canvas-viewport"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
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
            <ArticleText text={articleText} highlights={highlights} />
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

      {/* Right: Chat */}
      <div className="canvas-chat-panel">
        <div className="canvas-chat-header">Article Assistant</div>
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
    </div>
  );
}
