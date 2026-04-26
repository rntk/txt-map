import TopbarPortal from "./shared/TopbarPortal";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isTopicRead } from "../utils/topicReadUtils";
import { getTemperatureColor } from "../utils/temperatureColor";
import TopicLevelSwitcher from "./shared/TopicLevelSwitcher";
import { useTopicLevel } from "../hooks/useTopicLevel";
import { buildScopedChartData, getTopicParts } from "../utils/topicHierarchy";
import { getHierarchyTopicAccentColor } from "../utils/topicColorUtils";
import "./CanvasPage.css";

const POLL_INTERVAL_MS = 2000;
const CHAT_POLL_MAX_ATTEMPTS = 150;
const EVENT_APPLY_DELAY_MS = 120;
const EVENTS_LIMIT = 50;
const HIGHLIGHT_FOCUS_SCALE = 1.4;
const HIGHLIGHT_FOCUS_DELAY_MS = 50;
const HIGHLIGHT_FOCUS_TRANSITION_MS = 350;
const MIN_CANVAS_SCALE = 0.2;
const MAX_CANVAS_SCALE = 4;
const WHEEL_ZOOM_IN_FACTOR = 1.1;
const WHEEL_ZOOM_OUT_FACTOR = 0.9;
const TOPIC_HIERARCHY_CARD_WIDTH = 190;
const TOPIC_HIERARCHY_COLUMN_GAP = 18;
const TOPIC_HIERARCHY_RAIL_PADDING = 24;
const TOPIC_HIERARCHY_TITLE_FONT_SIZE_PX = 12;
const TOPIC_HIERARCHY_TITLE_LINE_HEIGHT = 1.2;
const TOPIC_HIERARCHY_TITLE_MAX_LINES = 2;
const TOPIC_HIERARCHY_CARD_VERTICAL_CHROME_PX = 31;

/**
 * @typedef {{x: number, y: number}} CanvasPoint
 */

/**
 * @param {number} value
 * @returns {number}
 */
function clampCanvasScale(value) {
  return Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, value));
}

/**
 * @param {number} scale
 * @returns {number}
 */
function getZoomAdjustedTopicTitleFontSize(scale) {
  const safeScale = clampCanvasScale(scale || 1);
  return TOPIC_HIERARCHY_TITLE_FONT_SIZE_PX * Math.max(1, 1 / safeScale);
}

/**
 * @param {number} scale
 * @returns {number}
 */
function getZoomAdjustedTopicCardWidth(scale) {
  const safeScale = clampCanvasScale(scale || 1);
  return TOPIC_HIERARCHY_CARD_WIDTH * Math.max(1, 1 / safeScale);
}

/**
 * @param {{scale: number, height: number}} params
 * @returns {number}
 */
function getTopicTitleFontSize({ scale, height }) {
  const zoomAdjustedFontSize = getZoomAdjustedTopicTitleFontSize(scale);
  const availableTitleHeight = Math.max(
    1,
    height - TOPIC_HIERARCHY_CARD_VERTICAL_CHROME_PX,
  );
  const heightCappedFontSize =
    availableTitleHeight /
    (TOPIC_HIERARCHY_TITLE_LINE_HEIGHT * TOPIC_HIERARCHY_TITLE_MAX_LINES);

  return Math.max(1, Math.min(zoomAdjustedFontSize, heightCappedFontSize));
}

/**
 * Keep the canvas coordinate under the cursor at the same viewport position
 * while changing scale.
 * @param {{cursor: CanvasPoint, translate: CanvasPoint, currentScale: number, nextScale: number}} params
 * @returns {CanvasPoint}
 */
function getCursorAnchoredTranslate({
  cursor,
  translate,
  currentScale,
  nextScale,
}) {
  const canvasX = (cursor.x - translate.x) / currentScale;
  const canvasY = (cursor.y - translate.y) / currentScale;
  return {
    x: cursor.x - canvasX * nextScale,
    y: cursor.y - canvasY * nextScale,
  };
}

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
 * Build text segments with highlights, optional read ranges, and optional
 * temperature color ranges applied.
 * @param {string} text
 * @param {{start: number, end: number, label?: string}[]} highlights
 * @param {{start: number, end: number}[]} [readRanges]
 * @param {{start: number, end: number, color: string}[]} [temperatureHighlights]
 * @returns {{text: string, start?: number, end?: number, highlighted: boolean, read: boolean, label?: string, temperatureColor?: string}[]}
 */
function buildSegments(text, highlights, readRanges, temperatureHighlights) {
  const hasRead = Array.isArray(readRanges) && readRanges.length > 0;
  const hasTemp =
    Array.isArray(temperatureHighlights) && temperatureHighlights.length > 0;
  if (!highlights.length && !hasRead && !hasTemp)
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
  if (hasTemp) {
    for (const t of temperatureHighlights) {
      const s = Math.max(0, t.start);
      const e = Math.min(text.length, t.end);
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
    const matchingTemp = hasTemp
      ? temperatureHighlights.filter((t) => t.start <= start && t.end >= end)
      : [];
    segments.push({
      text: chunk,
      start,
      end,
      highlighted: matching.length > 0,
      read: matchingRead.length > 0,
      label: matching.length > 0 ? matching[0].label : undefined,
      temperatureColor:
        matchingTemp.length > 0 ? matchingTemp[0].color : undefined,
    });
  }

  return segments;
}

/**
 * Locate a Range at a given character offset within an article element,
 * skipping page splitter chrome.
 * @param {HTMLElement} rootEl
 * @param {number} offset
 * @returns {Range | null}
 */
function rangeAtOffset(rootEl, offset) {
  if (!rootEl) return null;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent && parent !== rootEl) {
        if (parent.classList?.contains("canvas-page-splitter")) {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let acc = 0;
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue.length;
    if (acc + len >= offset) {
      const local = Math.max(0, Math.min(offset - acc, len));
      const range = document.createRange();
      range.setStart(node, local);
      range.setEnd(node, Math.min(local + 1, len));
      return range;
    }
    acc += len;
    node = walker.nextNode();
  }
  return null;
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
 * @param {{name?: string, fullPath?: string, displayName?: string}} topic
 * @returns {string}
 */
function getTopicDisplayName(topic) {
  if (topic?.displayName) return topic.displayName;
  const parts = getTopicParts(topic?.fullPath || topic?.name || "");
  return parts[parts.length - 1] || topic?.name || "";
}

/**
 * @param {{sentences?: number[], sentenceIndices?: number[]}} topic
 * @returns {number[]}
 */
function getTopicSentenceNumbers(topic) {
  const source = Array.isArray(topic?.sentenceIndices)
    ? topic.sentenceIndices
    : topic?.sentences;
  return Array.isArray(source)
    ? source.filter((value) => Number.isInteger(value) && value > 0)
    : [];
}

/**
 * @param {{sentences?: number[], sentenceIndices?: number[]}} topic
 * @param {number[]} sentenceOffsets
 * @param {string[]} submissionSentences
 * @returns {{charStart: number, charEnd: number} | null}
 */
function getTopicTextRange(topic, sentenceOffsets, submissionSentences) {
  const sentenceNumbers = getTopicSentenceNumbers(topic).filter(
    (value) => value <= submissionSentences.length,
  );
  if (sentenceNumbers.length === 0) return null;

  const startSent = Math.min(...sentenceNumbers);
  const endSent = Math.max(...sentenceNumbers);
  const charStart = sentenceOffsets[startSent - 1];
  const endOffset = sentenceOffsets[endSent - 1];
  const endSentence = submissionSentences[endSent - 1];

  if (
    !Number.isFinite(charStart) ||
    !Number.isFinite(endOffset) ||
    typeof endSentence !== "string"
  ) {
    return null;
  }

  return {
    charStart,
    charEnd: endOffset + endSentence.length,
  };
}

/**
 * @param {{sentences?: number[], sentenceIndices?: number[]}} topic
 * @param {number[]} sentenceOffsets
 * @param {string[]} submissionSentences
 * @returns {{charStart: number, charEnd: number}[]}
 */
function getTopicSentenceTextRanges(
  topic,
  sentenceOffsets,
  submissionSentences,
) {
  return getTopicSentenceNumbers(topic)
    .filter((value) => value <= submissionSentences.length)
    .map((sentenceNumber) => {
      const sentenceIndex = sentenceNumber - 1;
      const charStart = sentenceOffsets[sentenceIndex];
      const sentenceText = submissionSentences[sentenceIndex];
      if (!Number.isFinite(charStart) || typeof sentenceText !== "string") {
        return null;
      }
      return {
        charStart,
        charEnd: charStart + sentenceText.length,
      };
    })
    .filter(Boolean);
}

/**
 * @param {{
 *   show: boolean,
 *   selectedLevel: number,
 *   maxLevel: number,
 *   onLevelChange: (level: number) => void,
 *   topicCards: Array<{
 *     key: string,
 *     fullPath: string,
 *     displayName: string,
 *     sentenceCount: number,
 *     startSentence: number,
 *     endSentence: number,
 *     top: number,
 *     height: number,
 *     titleFontSize: number,
 *     depth: number,
 *     levelIndex: number,
 *     right: number,
 *   }>,
 *   railWidth: number,
 *   cardWidth: number,
 *   activeTopicKey: string | null,
 *   selectedTopicKey: string | null,
 *   onTopicEnter: (topicKey: string) => void,
 *   onTopicLeave: (topicKey: string) => void,
 *   onTopicClick: (topicKey: string) => void,
 * }} props
 */
function CanvasTopicHierarchyRail({
  show,
  selectedLevel,
  maxLevel,
  onLevelChange,
  topicCards,
  railWidth,
  cardWidth,
  activeTopicKey,
  selectedTopicKey,
  onTopicEnter,
  onTopicLeave,
  onTopicClick,
}) {
  if (!show) return null;

  return (
    <aside
      className="canvas-topic-hierarchy"
      aria-label="Topic hierarchy"
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        "--canvas-topic-hierarchy-width": `${railWidth}px`,
        "--topic-card-width": `${cardWidth}px`,
      }}
    >
      <div className="canvas-topic-hierarchy__header">
        <span className="canvas-topic-hierarchy__title">Topics</span>
        <TopicLevelSwitcher
          className="canvas-topic-hierarchy__levels"
          selectedLevel={selectedLevel}
          maxLevel={maxLevel}
          onChange={onLevelChange}
          label="Level"
        />
      </div>
      <div className="canvas-topic-hierarchy__body">
        {topicCards.length === 0 ? (
          <p className="canvas-topic-hierarchy__empty">
            No topics at this level.
          </p>
        ) : (
          <>
            {topicCards.map((card) => {
              const isActive = activeTopicKey === card.fullPath;
              const isSelected = selectedTopicKey === card.fullPath;
              const classes = [
                "canvas-topic-hierarchy__card",
                card.levelIndex === 0
                  ? "canvas-topic-hierarchy__card--root"
                  : "canvas-topic-hierarchy__card--child",
                isActive ? "is-active" : "",
                isSelected ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={card.key}
                  type="button"
                  className={classes}
                  style={{
                    "--topic-card-top": `${card.top}px`,
                    "--topic-card-height": `${card.height}px`,
                    "--topic-card-title-font-size": `${card.titleFontSize}px`,
                    "--topic-card-right": `${card.right}px`,
                    "--topic-accent-color": getHierarchyTopicAccentColor(
                      card.fullPath,
                      card.depth,
                    ),
                  }}
                  onMouseEnter={() => onTopicEnter(card.fullPath)}
                  onMouseLeave={() => onTopicLeave(card.fullPath)}
                  onClick={() => onTopicClick(card.fullPath)}
                  title={`${card.fullPath}: sentences ${card.startSentence}-${card.endSentence}`}
                >
                  <span className="canvas-topic-hierarchy__card-name">
                    {card.displayName}
                  </span>
                  <span className="canvas-topic-hierarchy__card-meta">
                    {card.sentenceCount} sent.
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * Build text segments with highlights, optional read ranges, and optional
 * temperature color ranges applied, split across pages.
 * @param {string} text
 * @param {{start: number, end: number, label?: string}[]} highlights
 * @param {{start: number, end: number}[]} [readRanges]
 * @param {{start: number, end: number, color: string}[]} [temperatureHighlights]
 * @param {{page_number: number, start: number, end: number}[]} [pages]
 * @returns {{type: "page-splitter", page_number: number} | {type: "segment", text: string, start?: number, end?: number, highlighted: boolean, read: boolean, label?: string, temperatureColor?: string}[]}
 */
function buildSegmentsWithPages(
  text,
  highlights,
  readRanges,
  temperatureHighlights,
  pages,
) {
  const hasPages = Array.isArray(pages) && pages.length > 0;
  if (!hasPages) {
    return buildSegments(
      text,
      highlights,
      readRanges,
      temperatureHighlights,
    ).map((s) => ({
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

    const pageTemp = (temperatureHighlights || []).map((t) => ({
      start: Math.max(0, t.start - page.start),
      end: Math.min(page.end - page.start, t.end - page.start),
      color: t.color,
    }));

    const segments = buildSegments(
      pageText,
      pageHighlights,
      pageRead,
      pageTemp,
    );
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
 *   temperatureHighlights?: {start: number, end: number, color: string}[],
 *   pages?: {page_number: number, start: number, end: number}[]
 * }} props
 */
function ArticleText({
  text,
  highlights,
  activeHighlightRef,
  readRanges,
  showReadStatus,
  temperatureHighlights,
  pages,
  textRef,
}) {
  const segments = buildSegmentsWithPages(
    text,
    highlights,
    showReadStatus ? readRanges : undefined,
    temperatureHighlights,
    pages,
  );
  let firstHighlightedSegmentFound = false;

  return (
    <div className="canvas-article-text" ref={textRef}>
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

        if (seg.temperatureColor) {
          const classes = [
            "canvas-temperature-highlight",
            seg.read && showReadStatus ? "canvas-sentence--read" : undefined,
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <span
              key={idx}
              className={classes || undefined}
              style={{ backgroundColor: seg.temperatureColor }}
              data-char-start={seg.start}
              data-char-end={seg.end}
            >
              {seg.text}
            </span>
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
  const [topicSummaries, setTopicSummaries] = useState({});
  const articleTextRef = useRef(null);
  const summaryWrapRef = useRef(null);

  // Canvas transform
  const [translate, setTranslate] = useState({ x: 40, y: 40 });
  const [scale, setScale] = useState(1);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const canvasWrapRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const activeHighlightRef = useRef(null);
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 40, y: 40 });
  const focusTimerRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const chatAbortRef = useRef(null);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [isFocusingHighlight, setIsFocusingHighlight] = useState(false);
  const [focusedTopicKey, setFocusedTopicKey] = useState(null);

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
    translateRef.current = translate;
  }, [translate]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    viewport.style.setProperty("--canvas-translate-x", `${translate.x}px`);
    viewport.style.setProperty("--canvas-translate-y", `${translate.y}px`);
    viewport.style.setProperty("--canvas-scale", `${scale}`);
    viewport.style.setProperty(
      "--canvas-topic-title-font-size",
      `${getZoomAdjustedTopicTitleFontSize(scale)}px`,
    );
  }, [scale, translate.x, translate.y]);

  // Chat
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Temperature
  const [showTemperature, setShowTemperature] = useState(false);
  const [topicTemperatures, setTopicTemperatures] = useState({});

  // Summaries layer
  const [showSummaries, setShowSummaries] = useState(false);
  const [hoveredSummaryKey, setHoveredSummaryKey] = useState(null);
  const [pinnedSummaryKey, setPinnedSummaryKey] = useState(null);
  const [summaryLayout, setSummaryLayout] = useState({ cards: [], width: 0 });

  // Topic hierarchy layer
  const [showTopicHierarchy, setShowTopicHierarchy] = useState(false);
  const [hoveredTopicKey, setHoveredTopicKey] = useState(null);
  const [selectedTopicKey, setSelectedTopicKey] = useState(null);
  const [topicHierarchyLayout, setTopicHierarchyLayout] = useState({
    topicCards: [],
  });

  // Read/unread
  const [showReadStatus, setShowReadStatus] = useState(false);
  const [submissionSentences, setSubmissionSentences] = useState([]);
  const [submissionTopics, setSubmissionTopics] = useState([]);
  const [readTopics, setReadTopics] = useState([]);
  const { selectedLevel, setSelectedLevel, maxLevel } =
    useTopicLevel(submissionTopics);

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
        setTopicSummaries(data.topic_summaries || {});
        setTopicTemperatures(data.topic_temperatures || {});
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

  const topicTemperatureMap = useMemo(() => {
    if (!topicTemperatures || typeof topicTemperatures !== "object") {
      return new Map();
    }
    const map = new Map();
    Object.entries(topicTemperatures).forEach(([topicName, value]) => {
      const rawRate =
        value && typeof value === "object" ? value.rate : Number(value);
      const rate = Math.max(0, Math.min(100, Math.round(Number(rawRate))));
      if (!Number.isFinite(rate)) return;
      const rawReasoning =
        value && typeof value === "object" ? value.reasoning : "";
      const reasoning =
        typeof rawReasoning === "string" ? rawReasoning.trim() : "";
      map.set(topicName, { rate, reasoning });
    });
    return map;
  }, [topicTemperatures]);

  const temperatureAvailable = topicTemperatureMap.size > 0;

  const temperatureTopicColorMap = useMemo(() => {
    const map = new Map();
    topicTemperatureMap.forEach((entry, topicName) => {
      map.set(topicName, getTemperatureColor(entry.rate));
    });
    return map;
  }, [topicTemperatureMap]);

  const toggleTemperature = useCallback(() => {
    setShowTemperature((prev) => !prev);
  }, []);

  const sentenceOffsets = useMemo(() => {
    const arr = [];
    let off = 0;
    for (const s of submissionSentences) {
      arr.push(off);
      off += s.length + 1;
    }
    return arr;
  }, [submissionSentences]);

  const summaryEntries = useMemo(() => {
    if (!topicSummaries || submissionSentences.length === 0) return [];
    const entries = [];
    (submissionTopics || []).forEach((topic) => {
      const text = topicSummaries[topic.name];
      if (!text) return;
      const sentences = Array.isArray(topic.sentences) ? topic.sentences : [];
      if (sentences.length === 0) return;
      const sortedSents = [...sentences]
        .filter((n) => Number.isInteger(n) && n > 0)
        .sort((a, b) => a - b);
      if (sortedSents.length === 0) return;
      const startSent = sortedSents[0];
      const endSent = sortedSents[sortedSents.length - 1];
      const charStart = sentenceOffsets[startSent - 1] ?? 0;
      const lastLen = submissionSentences[endSent - 1]?.length ?? 0;
      const charEnd = (sentenceOffsets[endSent - 1] ?? 0) + lastLen;
      entries.push({
        key: topic.name,
        topicName: topic.name,
        summaryText: text,
        sentenceStart: startSent,
        sentenceEnd: endSent,
        sentences: sortedSents,
        charStart,
        charEnd,
      });
    });
    return entries;
  }, [topicSummaries, submissionTopics, sentenceOffsets, submissionSentences]);

  const activeSummaryKey = hoveredSummaryKey || pinnedSummaryKey;
  const activeTopicKey = hoveredTopicKey || selectedTopicKey;

  const selectedTopic = useMemo(() => {
    if (!activeTopicKey) return null;
    return (
      (submissionTopics || []).find((topic) => topic.name === activeTopicKey) ||
      null
    );
  }, [activeTopicKey, submissionTopics]);

  const topicHierarchyRowsByLevel = useMemo(() => {
    return Array.from({ length: selectedLevel + 1 }, (_, level) =>
      buildScopedChartData(submissionTopics, submissionSentences, [], level),
    );
  }, [selectedLevel, submissionSentences, submissionTopics]);

  const activeTopicSelection = useMemo(() => {
    if (!activeTopicKey) return null;
    const rows = topicHierarchyRowsByLevel.flat();
    return rows.find((row) => row.fullPath === activeTopicKey) || selectedTopic;
  }, [activeTopicKey, selectedTopic, topicHierarchyRowsByLevel]);

  const topicHierarchyCardWidth = useMemo(
    () => getZoomAdjustedTopicCardWidth(scale),
    [scale],
  );

  const topicHierarchyRailWidth = useMemo(
    () =>
      (selectedLevel + 1) * topicHierarchyCardWidth +
      selectedLevel * TOPIC_HIERARCHY_COLUMN_GAP +
      TOPIC_HIERARCHY_RAIL_PADDING * 2,
    [selectedLevel, topicHierarchyCardWidth],
  );

  const articleHighlights = useMemo(() => {
    const base = currentHighlights.slice();
    if (showSummaries && activeSummaryKey) {
      const entry = summaryEntries.find((e) => e.key === activeSummaryKey);
      if (entry) {
        base.push({
          start: entry.charStart,
          end: entry.charEnd,
          label: entry.topicName,
        });
      }
    }
    if (showTopicHierarchy && activeTopicSelection) {
      const textRanges = getTopicSentenceTextRanges(
        activeTopicSelection,
        sentenceOffsets,
        submissionSentences,
      );
      textRanges.forEach((textRange) => {
        base.push({
          start: textRange.charStart,
          end: textRange.charEnd,
          label: activeTopicSelection.fullPath || activeTopicSelection.name,
        });
      });
    }
    return base;
  }, [
    currentHighlights,
    showSummaries,
    activeSummaryKey,
    summaryEntries,
    showTopicHierarchy,
    activeTopicSelection,
    sentenceOffsets,
    submissionSentences,
  ]);

  const temperatureHighlights = useMemo(() => {
    if (!showTemperature || submissionSentences.length === 0) return [];
    const ranges = [];
    (submissionTopics || []).forEach((topic) => {
      const color = temperatureTopicColorMap.get(topic.name);
      if (!color) return;
      const sentences = Array.isArray(topic.sentences) ? topic.sentences : [];
      sentences.forEach((sentIdx) => {
        const idx = sentIdx - 1;
        if (idx < 0 || idx >= submissionSentences.length) return;
        const start = sentenceOffsets[idx];
        const end = start + submissionSentences[idx].length;
        ranges.push({ start, end, color });
      });
    });
    return ranges;
  }, [
    showTemperature,
    submissionTopics,
    temperatureTopicColorMap,
    sentenceOffsets,
    submissionSentences,
  ]);

  useEffect(() => {
    if (!showSummaries || articleLoading || articleError) {
      setSummaryLayout({ cards: [], width: 0 });
      return undefined;
    }
    if (summaryEntries.length === 0) {
      setSummaryLayout({ cards: [], width: 0 });
      return undefined;
    }

    let raf = 0;
    const compute = () => {
      const articleEl = articleTextRef.current;
      const wrapEl = summaryWrapRef.current;
      if (!articleEl || !wrapEl) return;
      const articleRect = articleEl.getBoundingClientRect();
      const wrapRect = wrapEl.getBoundingClientRect();
      const s = scaleRef.current || 1;

      const positioned = summaryEntries
        .map((entry) => {
          const midOff = Math.floor((entry.charStart + entry.charEnd) / 2);
          const midRange = rangeAtOffset(articleEl, midOff);
          const startRange = rangeAtOffset(articleEl, entry.charStart);
          const endRange = rangeAtOffset(
            articleEl,
            Math.max(0, entry.charEnd - 1),
          );
          if (!midRange) return null;
          const midRect = midRange.getBoundingClientRect();
          const startRect = startRange?.getBoundingClientRect();
          const endRect = endRange?.getBoundingClientRect();
          const midY = ((midRect.top + midRect.bottom) / 2 - wrapRect.top) / s;
          const startY = startRect ? (startRect.top - wrapRect.top) / s : midY;
          const endY = endRect ? (endRect.bottom - wrapRect.top) / s : midY;
          return { ...entry, midY, startY, endY };
        })
        .filter(Boolean);

      positioned.sort((a, b) => a.midY - b.midY);

      const CARD_HEIGHT = 92;
      const GAP = 10;
      let lastBottom = 0;
      for (const c of positioned) {
        const desired = c.midY - CARD_HEIGHT / 2;
        c.cardY = Math.max(desired, lastBottom + GAP);
        c.cardHeight = CARD_HEIGHT;
        lastBottom = c.cardY + CARD_HEIGHT;
      }

      setSummaryLayout({
        cards: positioned,
        width: wrapRect.width / s,
        articleRight: (articleRect.right - wrapRect.left) / s,
        articleHeight: articleEl.offsetHeight,
      });
    };

    raf = window.requestAnimationFrame(compute);
    const onResize = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(compute);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [
    showSummaries,
    summaryEntries,
    articleLoading,
    articleError,
    articleText,
    articlePages,
    scale,
    showTopicHierarchy,
  ]);

  useEffect(() => {
    if (!showTopicHierarchy || articleLoading || articleError) {
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
      const wrapRect = wrapEl.getBoundingClientRect();
      const s = scaleRef.current || 1;
      const cardWidth = getZoomAdjustedTopicCardWidth(s);

      const toPositionedCard = (row, levelIndex) => {
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
        const rawTop = (startRect.top - wrapRect.top) / s;
        const rawBottom = (endRect.bottom - wrapRect.top) / s;
        const sentenceNumbers = getTopicSentenceNumbers(row);
        const startSentence =
          sentenceNumbers.length > 0 ? Math.min(...sentenceNumbers) : 0;
        const endSentence =
          sentenceNumbers.length > 0 ? Math.max(...sentenceNumbers) : 0;
        const height = Math.max(1, rawBottom - rawTop);

        return {
          key: `${levelIndex}:${row.fullPath}`,
          fullPath: row.fullPath,
          displayName: getTopicDisplayName(row),
          sentenceCount: sentenceNumbers.length,
          startSentence,
          endSentence,
          top: rawTop,
          height,
          titleFontSize: getTopicTitleFontSize({ scale: s, height }),
          depth: Math.max(0, getTopicParts(row.fullPath).length - 1),
          levelIndex,
          right:
            TOPIC_HIERARCHY_RAIL_PADDING +
            levelIndex * (cardWidth + TOPIC_HIERARCHY_COLUMN_GAP),
        };
      };

      const topicCards = topicHierarchyRowsByLevel
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

    raf = window.requestAnimationFrame(compute);
    const onResize = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(compute);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [
    articleError,
    articleLoading,
    articlePages,
    articleText,
    scale,
    selectedLevel,
    sentenceOffsets,
    showTopicHierarchy,
    submissionSentences,
    topicHierarchyRowsByLevel,
  ]);

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
      scaleRef.current = nextScale;
      translateRef.current = {
        x: wrapRect.width / 2 - localTargetX * nextScale,
        y: wrapRect.height / 2 - localTargetY * nextScale,
      };
      setScale(nextScale);
      setTranslate(translateRef.current);

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
    const wrap = canvasWrapRef.current;
    if (!wrap) return;

    const currentScale = scaleRef.current || 1;
    const delta = e.deltaY > 0 ? WHEEL_ZOOM_OUT_FACTOR : WHEEL_ZOOM_IN_FACTOR;
    const nextScale = clampCanvasScale(currentScale * delta);
    if (nextScale === currentScale) return;

    const wrapRect = wrap.getBoundingClientRect();
    const nextTranslate = getCursorAnchoredTranslate({
      cursor: {
        x: e.clientX - wrapRect.left,
        y: e.clientY - wrapRect.top,
      },
      translate: translateRef.current,
      currentScale,
      nextScale,
    });

    setIsFocusingHighlight(false);
    setFocusedTopicKey(null);
    scaleRef.current = nextScale;
    translateRef.current = nextTranslate;
    setScale(nextScale);
    setTranslate(nextTranslate);
  }, []);

  // Zoom to a specific topic/summary
  const handleZoomToTopic = useCallback(
    (topicKey) => {
      if (!topicKey) {
        setFocusedTopicKey(null);
        return;
      }

      const summaryEntry = summaryEntries.find(
        (entry) => entry.key === topicKey,
      );
      const topicEntry =
        summaryEntry ||
        topicHierarchyRowsByLevel
          .flat()
          .find((row) => row.fullPath === topicKey || row.name === topicKey);
      if (!topicEntry) return;

      const textRange = summaryEntry
        ? { charStart: summaryEntry.charStart, charEnd: summaryEntry.charEnd }
        : getTopicTextRange(topicEntry, sentenceOffsets, submissionSentences);
      if (!textRange) return;

      const wrap = canvasWrapRef.current;
      const viewport = canvasViewportRef.current;
      const articleEl = articleTextRef.current;
      if (!wrap || !viewport || !articleEl) return;

      const midOff = Math.floor((textRange.charStart + textRange.charEnd) / 2);
      const midRange = rangeAtOffset(articleEl, midOff);
      if (!midRange) return;

      const midRect = midRange.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const currentScale = scaleRef.current || 1;
      const nextScale = Math.min(
        MAX_CANVAS_SCALE,
        Math.max(currentScale, HIGHLIGHT_FOCUS_SCALE),
      );

      // Calculate the target position in canvas coordinates
      const targetCenterX = midRect.left + midRect.width / 2;
      const targetCenterY = midRect.top + midRect.height / 2;
      const localTargetX = (targetCenterX - viewportRect.left) / currentScale;
      const localTargetY = (targetCenterY - viewportRect.top) / currentScale;

      setFocusedTopicKey(topicKey);
      setIsFocusingHighlight(true);
      scaleRef.current = nextScale;
      translateRef.current = {
        x: wrapRect.width / 2 - localTargetX * nextScale,
        y: wrapRect.height / 2 - localTargetY * nextScale,
      };
      setScale(nextScale);
      setTranslate(translateRef.current);

      // Reset the focusing state after transition completes
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      transitionTimerRef.current = setTimeout(() => {
        setIsFocusingHighlight(false);
      }, HIGHLIGHT_FOCUS_TRANSITION_MS);
    },
    [
      sentenceOffsets,
      submissionSentences,
      summaryEntries,
      topicHierarchyRowsByLevel,
    ],
  );

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Canvas navigation helpers
  const navigateCanvas = useCallback((pos) => {
    const wrap = canvasWrapRef.current;
    const content = summaryWrapRef.current || canvasViewportRef.current;
    if (!wrap) return;

    const currentScale = scaleRef.current || 1;
    const wrapRect = wrap.getBoundingClientRect();
    const viewportHeight = wrap.clientHeight || wrapRect.height || 0;
    const contentHeight =
      (content?.scrollHeight ||
        content?.offsetHeight ||
        content?.getBoundingClientRect().height ||
        0) * currentScale;
    const pageStep = Math.max(120, viewportHeight * 0.8);
    const topY = 40;
    const bottomY =
      contentHeight > viewportHeight
        ? viewportHeight - contentHeight - topY
        : topY;
    const minY = Math.min(topY, bottomY);
    const maxY = Math.max(topY, bottomY);

    setIsFocusingHighlight(false);
    setFocusedTopicKey(null);
    setTranslate((prev) => {
      let nextY = prev.y;
      if (pos === "top") nextY = topY;
      else if (pos === "bottom") nextY = bottomY;
      else if (pos === "prev") nextY = prev.y + pageStep;
      else if (pos === "next") nextY = prev.y - pageStep;

      if (contentHeight > 0 && viewportHeight > 0) {
        nextY = Math.min(maxY, Math.max(minY, nextY));
      }

      const nextTranslate = { ...prev, y: nextY };
      translateRef.current = nextTranslate;
      return nextTranslate;
    });
  }, []);

  useEffect(() => {
    const handleKeyDownGlobal = (e) => {
      const target = e.target;
      const tagName = target?.tagName;
      const isEditable =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.isContentEditable;
      if (isEditable) {
        return;
      }

      if (e.key === "Home") {
        e.preventDefault();
        navigateCanvas("top");
      } else if (e.key === "End") {
        e.preventDefault();
        navigateCanvas("bottom");
      } else if (e.key === "PageUp") {
        e.preventDefault();
        navigateCanvas("prev");
      } else if (e.key === "PageDown") {
        e.preventDefault();
        navigateCanvas("next");
      }
    };
    window.addEventListener("keydown", handleKeyDownGlobal);
    return () => window.removeEventListener("keydown", handleKeyDownGlobal);
  }, [navigateCanvas]);

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
      <TopbarPortal>
        <div className="topbar-nav-dropdown">
          <button className="topbar-nav-btn">Canvas ▼</button>
          <div className="topbar-nav-menu">
            <a href={`/page/text/${articleId}`}>Read Text</a>
            <a href={`/page/topic-hierarchy/${articleId}`}>Hierarchy</a>
          </div>
        </div>
      </TopbarPortal>
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
              <div
                ref={summaryWrapRef}
                className={`canvas-article-with-summaries${showSummaries ? " has-summaries" : ""}${showTopicHierarchy ? " has-topic-hierarchy" : ""}`}
                style={{
                  "--canvas-topic-hierarchy-width": `${topicHierarchyRailWidth}px`,
                }}
              >
                <ArticleText
                  text={articleText}
                  highlights={articleHighlights}
                  activeHighlightRef={activeHighlightRef}
                  readRanges={readRanges}
                  showReadStatus={showReadStatus}
                  temperatureHighlights={temperatureHighlights}
                  pages={articlePages}
                  textRef={articleTextRef}
                />
                {showSummaries && summaryLayout.cards.length > 0 && (
                  <>
                    <svg
                      className="canvas-summary-connectors"
                      style={{
                        height: Math.max(
                          summaryLayout.articleHeight || 0,
                          summaryLayout.cards.length > 0
                            ? summaryLayout.cards[
                                summaryLayout.cards.length - 1
                              ].cardY + 100
                            : 0,
                        ),
                      }}
                    >
                      {summaryLayout.cards.map((card) => {
                        const x1 = summaryLayout.articleRight || 0;
                        const y1 = card.midY;
                        const x2 = (summaryLayout.articleRight || 0) + 80;
                        const y2 = card.cardY + card.cardHeight / 2;
                        const cx1 = x1 + 30;
                        const cx2 = x2 - 30;
                        const isActive = activeSummaryKey === card.key;
                        return (
                          <g key={card.key}>
                            <circle
                              cx={x1}
                              cy={y1}
                              r={3}
                              className={`canvas-summary-anchor${isActive ? " is-active" : ""}`}
                            />
                            <path
                              d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                              className={`canvas-summary-connector${isActive ? " is-active" : ""}`}
                            />
                            <circle
                              cx={x2}
                              cy={y2}
                              r={4}
                              className={`canvas-summary-bulb${isActive ? " is-active" : ""}`}
                            />
                          </g>
                        );
                      })}
                    </svg>
                    <div className="canvas-summary-rail">
                      {summaryLayout.cards.map((card) => (
                        <div
                          key={card.key}
                          className={`canvas-summary-card${activeSummaryKey === card.key ? " is-active" : ""}${pinnedSummaryKey === card.key ? " is-pinned" : ""}${focusedTopicKey === card.key ? " is-focused" : ""}`}
                          style={{
                            top: `${card.cardY}px`,
                            height: `${card.cardHeight}px`,
                          }}
                          onMouseEnter={() => setHoveredSummaryKey(card.key)}
                          onMouseLeave={() =>
                            setHoveredSummaryKey((k) =>
                              k === card.key ? null : k,
                            )
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            // Toggle pin behavior
                            setPinnedSummaryKey((k) =>
                              k === card.key ? null : card.key,
                            );
                            // Zoom to topic
                            handleZoomToTopic(card.key);
                          }}
                          title={card.topicName}
                        >
                          <div className="canvas-summary-card-topic">
                            {card.topicName}
                          </div>
                          <div className="canvas-summary-card-text">
                            {card.summaryText}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <CanvasTopicHierarchyRail
                  show={showTopicHierarchy}
                  selectedLevel={selectedLevel}
                  maxLevel={maxLevel}
                  onLevelChange={(level) => {
                    setSelectedLevel(level);
                    setHoveredTopicKey(null);
                    setSelectedTopicKey(null);
                  }}
                  topicCards={topicHierarchyLayout.topicCards}
                  railWidth={topicHierarchyRailWidth}
                  cardWidth={topicHierarchyCardWidth}
                  activeTopicKey={activeTopicKey}
                  selectedTopicKey={selectedTopicKey}
                  onTopicEnter={setHoveredTopicKey}
                  onTopicLeave={(topicKey) => {
                    setHoveredTopicKey((current) =>
                      current === topicKey ? null : current,
                    );
                  }}
                  onTopicClick={(topicKey) => {
                    setSelectedTopicKey((current) =>
                      current === topicKey ? null : topicKey,
                    );
                    handleZoomToTopic(topicKey);
                  }}
                />
              </div>
            )}
          </div>
        </div>
        <div className="canvas-controls">
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => navigateCanvas("top")}
            title="Scroll to top"
          >
            ⇈
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => navigateCanvas("prev")}
            title="Previous page"
          >
            ↑
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => navigateCanvas("next")}
            title="Next page"
          >
            ↓
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => navigateCanvas("bottom")}
            title="Scroll to bottom"
          >
            ⇊
          </button>
          <div className="canvas-spacer" />
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => setScale((s) => clampCanvasScale(s * 1.2))}
          >
            +
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => setScale((s) => clampCanvasScale(s / 1.2))}
          >
            −
          </button>
          <button
            type="button"
            className="canvas-zoom-btn"
            onClick={() => {
              setScale(1);
              setTranslate({ x: 40, y: 40 });
              setFocusedTopicKey(null);
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
          <button
            type="button"
            className={`canvas-read-toggle${showSummaries ? " is-active" : ""}`}
            onClick={() => setShowSummaries((v) => !v)}
            title={
              showSummaries ? "Hide topic summaries" : "Show topic summaries"
            }
          >
            S
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showTopicHierarchy ? " is-active" : ""}`}
            onClick={() => setShowTopicHierarchy((value) => !value)}
            title={
              showTopicHierarchy
                ? "Hide topic hierarchy"
                : "Show topic hierarchy"
            }
          >
            H
          </button>
          <button
            type="button"
            className={`canvas-read-toggle${showTemperature ? " is-active" : ""}`}
            onClick={toggleTemperature}
            title={
              showTemperature
                ? "Hide temperature highlights"
                : "Show temperature highlights"
            }
            disabled={!temperatureAvailable}
          >
            T
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
