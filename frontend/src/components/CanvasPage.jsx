import TopbarPortal from "./shared/TopbarPortal";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTopicLevel } from "../hooks/useTopicLevel";
import { buildScopedChartData } from "../utils/topicHierarchy";
import { getTopicParts } from "../utils/topicHierarchy";
import "./CanvasPage.css";

import {
  TOPIC_HIERARCHY_COLUMN_GAP,
  TOPIC_HIERARCHY_RAIL_PADDING,
} from "./CanvasPage/constants";
import {
  clampCanvasScale,
  getTopicTitleFontSize,
  getZoomAdjustedTopicCardWidth,
  getZoomAdjustedTopicTitleFontSize,
  getTopicDisplayName,
  getTopicSentenceNumbers,
  getTopicSentenceTextRanges,
  getTopicTextRange,
  rangeAtOffset,
} from "./CanvasPage/utils";
import CanvasTopicHierarchyRail from "./CanvasPage/CanvasTopicHierarchyRail";
import ArticleText from "./CanvasPage/ArticleText";
import CanvasZoomControls from "./CanvasPage/CanvasZoomControls";
import CanvasSummaryView from "./CanvasPage/CanvasSummaryView";
import CanvasArticleTooltip from "./CanvasPage/CanvasArticleTooltip";
import CanvasSummaryRail from "./CanvasPage/CanvasSummaryRail";
import CanvasRightPanel from "./CanvasPage/CanvasRightPanel";
import CanvasInsightsRail from "./CanvasPage/CanvasInsightsRail";
import { useCanvasEvents } from "./CanvasPage/useCanvasEvents";
import { useTooltip } from "../hooks/useTooltip";
import { useArticleData } from "./CanvasPage/useArticleData";
import { useTopicReadStatus } from "./CanvasPage/useTopicReadStatus";
import { useTopicTemperature } from "./CanvasPage/useTopicTemperature";
import { useSummaryLayout } from "./CanvasPage/useSummaryLayout";
import { useInsightsLayout } from "./CanvasPage/useInsightsLayout";
import { useTopicHierarchyLayout } from "./CanvasPage/useTopicHierarchyLayout";

const TOOLTIP_WIDTH = 260;
const TOOLTIP_HEIGHT_ESTIMATE = 100;
const TOOLTIP_VIEWPORT_MARGIN = 10;

function getHoverWord(rootEl, clientX, clientY) {
  if (!rootEl) return null;
  const normalize = (value) => {
    const cleaned = String(value || "").replace(/[^a-zA-ZÀ-ÿ0-9\-']/g, "");
    return cleaned.length > 1 ? cleaned : null;
  };

  let node = null;
  let offset = null;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos?.offsetNode && rootEl.contains(pos.offsetNode)) {
      node = pos.offsetNode;
      offset = pos.offset;
    }
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (range?.startContainer && rootEl.contains(range.startContainer)) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }

  if (!node || node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.nodeValue || "";
  let start = offset;
  let end = offset;
  while (start > 0 && /[a-zA-ZÀ-ÿ0-9\-']/.test(text[start - 1])) start -= 1;
  while (end < text.length && /[a-zA-ZÀ-ÿ0-9\-']/.test(text[end])) end += 1;
  return normalize(text.slice(start, end));
}

export default function CanvasPage() {
  const articleId = window.location.pathname.split("/")[3];

  // Refs
  const articleTextRef = useRef(null);
  const summaryWrapRef = useRef(null);
  const activeHighlightRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 40, y: 40 });
  const transformFrameRef = useRef(0);
  const pendingTransformRef = useRef(null);
  const userMovedCanvasRef = useRef(false);
  const smoothZoomTimerRef = useRef(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const isTouchDragging = useRef(false);
  const lastTouch = useRef({ x: 0, y: 0 });
  const touchDragStart = useRef({ x: 0, y: 0 });
  const touchHasMoved = useRef(false);
  const pinchState = useRef(null);
  const summaryCardRefs = useRef({});

  // Canvas transform state
  const [translate, setTranslate] = useState({ x: 40, y: 40 });
  const [scale, setScale] = useState(1);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [isFocusingHighlight, setIsFocusingHighlight] = useState(false);

  // Article data
  const {
    articleText,
    articlePages,
    articleImages,
    articleLoading,
    articleError,
    topicSummaries,
    topicSummaryIndex,
    submissionSentences,
    submissionTopics,
    readTopics,
    setReadTopics,
    topicTemperatures,
    insights,
  } = useArticleData(articleId);

  // Events / timeline
  const {
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
  } = useCanvasEvents(articleId);

  // Chat
  const [messages, setMessages] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [contextPages, setContextPages] = useState("");

  // View modes
  const [showSummaryMode, setShowSummaryMode] = useState(false);
  const [showSummaries, setShowSummaries] = useState(false);
  const [showTopicHierarchy, setShowTopicHierarchy] = useState(false);
  const [showReadStatus, setShowReadStatus] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [activeInsightKey, setActiveInsightKey] = useState(null);

  // Topic interaction state
  const [hoveredSummaryKey, setHoveredSummaryKey] = useState(null);
  const [hoveredTopicKey, setHoveredTopicKey] = useState(null);
  const [selectedTopicKey, setSelectedTopicKey] = useState(null);
  const [highlightedTopicNames, setHighlightedTopicNames] = useState(
    () => new Set(),
  );

  // Tooltip
  const [tooltipEnabled, setTooltipEnabled] = useState(true);
  const { tooltip, lastTargetRef, showTooltip, hideTooltip } =
    useTooltip(tooltipEnabled);
  const tooltipContainerRef = useRef(null);

  const { selectedLevel, setSelectedLevel, maxLevel } =
    useTopicLevel(submissionTopics);

  const { toggleTopicRead, readSentenceIndices, readRanges } =
    useTopicReadStatus({
      articleId,
      submissionTopics,
      submissionSentences,
      readTopics,
      setReadTopics,
    });

  const {
    showTemperature,
    toggleTemperature,
    topicTemperatureMap,
    temperatureAvailable,
    temperatureTopicColorMap,
  } = useTopicTemperature(topicTemperatures);

  // ── Canvas transform helpers ──────

  useEffect(() => {
    return () => {
      if (transformFrameRef.current) {
        window.cancelAnimationFrame(transformFrameRef.current);
      }
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

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    const viewport = canvasViewportRef.current;
    if (!wrap || !viewport) return;
    const update = () => {
      viewport.style.setProperty(
        "--canvas-area-height",
        `${wrap.clientHeight}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const cancelPendingCanvasTransform = useCallback(() => {
    if (transformFrameRef.current) {
      window.cancelAnimationFrame(transformFrameRef.current);
      transformFrameRef.current = 0;
    }
    pendingTransformRef.current = null;
  }, []);

  const setCanvasTransformNow = useCallback(
    (nextScale, nextTranslate) => {
      cancelPendingCanvasTransform();
      scaleRef.current = nextScale;
      translateRef.current = nextTranslate;
      setScale(nextScale);
      setTranslate(nextTranslate);
    },
    [cancelPendingCanvasTransform],
  );

  const scheduleCanvasTransform = useCallback((nextScale, nextTranslate) => {
    scaleRef.current = nextScale;
    translateRef.current = nextTranslate;
    pendingTransformRef.current = {
      scale: nextScale,
      translate: nextTranslate,
    };
    if (transformFrameRef.current) return;
    transformFrameRef.current = window.requestAnimationFrame(() => {
      transformFrameRef.current = 0;
      const pt = pendingTransformRef.current;
      pendingTransformRef.current = null;
      if (!pt) return;
      setScale(pt.scale);
      setTranslate(pt.translate);
    });
  }, []);

  // ── Mouse handlers ──────────────────────

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    setIsFocusingHighlight(false);
    setIsCanvasDragging(true);
    userMovedCanvasRef.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      scheduleCanvasTransform(scaleRef.current || 1, {
        x: translateRef.current.x + dx,
        y: translateRef.current.y + dy,
      });
    },
    [scheduleCanvasTransform],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    setIsCanvasDragging(false);
  }, []);

  // ── Touch handlers ────────────────────────────────────────────────────────

  const getTouchDistance = useCallback((touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getTouchMidpoint = useCallback(
    (touches) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    }),
    [],
  );

  const handleTouchStart = useCallback(
    (e) => {
      const touches = e.touches;
      if (touches.length === 1) {
        touchDragStart.current = {
          x: touches[0].clientX,
          y: touches[0].clientY,
        };
        lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
        isTouchDragging.current = true;
        touchHasMoved.current = false;
        setIsFocusingHighlight(false);
        userMovedCanvasRef.current = true;
      } else if (touches.length === 2) {
        isTouchDragging.current = false;
        touchHasMoved.current = false;
        setIsCanvasDragging(false);
        pinchState.current = {
          startDistance: getTouchDistance(touches),
          startScale: scaleRef.current || 1,
          startTranslate: { ...translateRef.current },
        };
        setIsFocusingHighlight(false);
        userMovedCanvasRef.current = true;
      }
    },
    [getTouchDistance],
  );

  const handleTouchMove = useCallback(
    (e) => {
      const touches = e.touches;
      if (pinchState.current && touches.length === 2) {
        e.preventDefault();
        const { startDistance, startScale, startTranslate } =
          pinchState.current;
        const newDistance = getTouchDistance(touches);
        if (startDistance === 0) return;
        const nextScale = clampCanvasScale(
          startScale * (newDistance / startDistance),
        );
        const wrap = canvasWrapRef.current;
        if (!wrap) return;
        const wrapRect = wrap.getBoundingClientRect();
        const midpoint = getTouchMidpoint(touches);
        const cursor = {
          x: midpoint.x - wrapRect.left,
          y: midpoint.y - wrapRect.top,
        };
        // Compute cursor-anchored translate manually (same logic as getCursorAnchoredTranslate)
        const scaleRatio = nextScale / startScale;
        const nextTranslate = {
          x: cursor.x - scaleRatio * (cursor.x - startTranslate.x),
          y: cursor.y - scaleRatio * (cursor.y - startTranslate.y),
        };
        scheduleCanvasTransform(nextScale, nextTranslate);
      } else if (isTouchDragging.current && touches.length === 1) {
        const dx = touches[0].clientX - touchDragStart.current.x;
        const dy = touches[0].clientY - touchDragStart.current.y;
        if (!touchHasMoved.current) {
          if (Math.sqrt(dx * dx + dy * dy) < 6) return;
          touchHasMoved.current = true;
          setIsCanvasDragging(true);
        }
        e.preventDefault();
        const moveDx = touches[0].clientX - lastTouch.current.x;
        const moveDy = touches[0].clientY - lastTouch.current.y;
        lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
        scheduleCanvasTransform(scaleRef.current || 1, {
          x: translateRef.current.x + moveDx,
          y: translateRef.current.y + moveDy,
        });
      }
    },
    [getTouchDistance, getTouchMidpoint, scheduleCanvasTransform],
  );

  const handleTouchEnd = useCallback((e) => {
    const touches = e.touches;
    if (touches.length === 0) {
      isTouchDragging.current = false;
      setIsCanvasDragging(false);
      pinchState.current = null;
      touchHasMoved.current = false;
    } else if (touches.length === 1 && pinchState.current) {
      pinchState.current = null;
      isTouchDragging.current = true;
      touchHasMoved.current = false;
      touchDragStart.current = { x: touches[0].clientX, y: touches[0].clientY };
      lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
    } else if (touches.length < 2) {
      pinchState.current = null;
    }
  }, []);

  // ── Wheel zoom ─────────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      const currentScale = scaleRef.current || 1;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = clampCanvasScale(currentScale * factor);
      if (nextScale === currentScale) return;
      const wrapRect = wrap.getBoundingClientRect();
      const cursor = {
        x: e.clientX - wrapRect.left,
        y: e.clientY - wrapRect.top,
      };
      const scaleRatio = nextScale / currentScale;
      const nextTranslate = {
        x: cursor.x - scaleRatio * (cursor.x - translateRef.current.x),
        y: cursor.y - scaleRatio * (cursor.y - translateRef.current.y),
      };
      setIsFocusingHighlight(false);
      userMovedCanvasRef.current = true;
      scheduleCanvasTransform(nextScale, nextTranslate);
    },
    [scheduleCanvasTransform],
  );

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const navigateCanvas = useCallback(
    (pos) => {
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      const currentScale = scaleRef.current || 1;
      const viewportHeight =
        wrap.clientHeight || wrap.getBoundingClientRect().height || 0;
      const pageStep = Math.max(120, viewportHeight * 0.8);
      const topY = 40;
      userMovedCanvasRef.current = true;
      const currentTranslate = translateRef.current;
      let nextY = currentTranslate.y;
      if (pos === "top") {
        nextY = topY;
      } else if (pos === "bottom") {
        const viewport = canvasViewportRef.current;
        const content = articleTextRef.current || summaryWrapRef.current;
        if (viewport && content) {
          const viewportRect = viewport.getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          const scaledContentBottom = contentRect.bottom - viewportRect.top;
          nextY = Math.min(topY, viewportHeight - scaledContentBottom - topY);
        } else {
          nextY = currentTranslate.y - pageStep;
        }
      } else if (pos === "prev") {
        nextY = currentTranslate.y + pageStep;
      } else if (pos === "next") {
        nextY = currentTranslate.y - pageStep;
      }
      setIsFocusingHighlight(true);
      setCanvasTransformNow(currentScale, { ...currentTranslate, y: nextY });
      if (smoothZoomTimerRef.current) clearTimeout(smoothZoomTimerRef.current);
      smoothZoomTimerRef.current = setTimeout(
        () => setIsFocusingHighlight(false),
        380,
      );
    },
    [setCanvasTransformNow],
  );

  useEffect(() => {
    const handleKeyDownGlobal = (e) => {
      const target = e.target;
      const tagName = target?.tagName;
      const isEditable =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.isContentEditable;
      if (isEditable) return;
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

  // ── Tooltip ──────────────────────────────────────────────────────────────

  const sentenceToTopicsMap = useMemo(() => {
    const map = new Map();
    (submissionTopics || []).forEach((topic) => {
      const sents = Array.isArray(topic.sentences) ? topic.sentences : [];
      sents.forEach((num) => {
        const idx = num - 1;
        if (!map.has(idx)) map.set(idx, []);
        map.get(idx).push(topic);
      });
    });
    return map;
  }, [submissionTopics]);

  const getTooltipPosition = useCallback((clientX, clientY) => {
    let x = clientX - 10;
    let y = clientY - 10;
    const maxX = window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_VIEWPORT_MARGIN;
    const maxY =
      window.innerHeight - TOOLTIP_HEIGHT_ESTIMATE - TOOLTIP_VIEWPORT_MARGIN;
    x = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(x, maxX));
    y = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(y, maxY));
    return { x, y };
  }, []);

  const handleArticleClick = useCallback(
    (e) => {
      if (!tooltipEnabled) return;
      const token = e.target.closest("[data-sentence-index]");
      if (!token) {
        hideTooltip();
        return;
      }
      if (token === lastTargetRef.current && tooltip) {
        hideTooltip();
        return;
      }
      const sentenceIdx = Number(token.getAttribute("data-sentence-index"));
      if (!Number.isInteger(sentenceIdx)) {
        hideTooltip();
        return;
      }
      const topics = sentenceToTopicsMap.get(sentenceIdx) || [];
      const matchedTopics = topics.map((t) => ({ topic: t }));
      const word = getHoverWord(articleTextRef.current, e.clientX, e.clientY);
      if (matchedTopics.length === 0 && !word) {
        hideTooltip();
        return;
      }
      lastTargetRef.current = token;
      const { x, y } = getTooltipPosition(e.clientX, e.clientY);
      showTooltip(matchedTopics, x, y, {
        sentenceIdx,
        totalSentences: submissionSentences.length,
        word,
      });
    },
    [
      tooltipEnabled,
      tooltip,
      lastTargetRef,
      sentenceToTopicsMap,
      submissionSentences.length,
      getTooltipPosition,
      hideTooltip,
      showTooltip,
    ],
  );

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!tooltip) return;
      if (tooltipContainerRef.current?.contains(e.target)) return;
      if (articleTextRef.current?.contains(e.target)) return;
      hideTooltip();
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") hideTooltip();
    };
    document.addEventListener("click", handleOutsideClick, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleOutsideClick, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hideTooltip, tooltip]);

  // ── Topic highlight toggle ─────────────────────────────────────────────────

  const toggleTopicHighlight = useCallback((topicName) => {
    setHighlightedTopicNames((prev) => {
      const next = new Set(prev);
      if (next.has(topicName)) next.delete(topicName);
      else next.add(topicName);
      return next;
    });
  }, []);

  // ── data Derived ────────────────

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

  const topicHierarchyRowsByLevel = useMemo(
    () =>
      Array.from({ length: selectedLevel + 1 }, (_, level) =>
        buildScopedChartData(submissionTopics, submissionSentences, [], level),
      ),
    [selectedLevel, submissionSentences, submissionTopics],
  );

  const summaryViewCards = useMemo(() => {
    if (!topicSummaryIndex || typeof topicSummaryIndex !== "object") return [];
    const targetLevel = selectedLevel + 1;
    return Object.entries(topicSummaryIndex)
      .filter(([path, entry]) => {
        if (!path || !entry || typeof entry !== "object") return false;
        if (entry.level !== targetLevel) return false;
        const text = entry.text || "";
        const bullets = Array.isArray(entry.bullets) ? entry.bullets : [];
        return Boolean(text) || bullets.length > 0;
      })
      .map(([path, entry]) => {
        const sourceSentences = Array.isArray(entry.source_sentences)
          ? entry.source_sentences.filter((n) => Number.isInteger(n) && n > 0)
          : [];
        return {
          path,
          name: getTopicParts(path).slice(-1)[0] || path,
          text: entry.text || "",
          bullets: Array.isArray(entry.bullets) ? entry.bullets : [],
          sourceSentences,
          startSentence: sourceSentences.length
            ? Math.min(...sourceSentences)
            : 0,
        };
      })
      .sort((a, b) => a.startSentence - b.startSentence);
  }, [topicSummaryIndex, selectedLevel]);

  const activeSummaryKey = hoveredSummaryKey;
  const activeTopicKey = hoveredTopicKey || selectedTopicKey;

  const selectedTopic = useMemo(
    () =>
      !activeTopicKey
        ? null
        : (submissionTopics || []).find((t) => t.name === activeTopicKey) ||
          null,
    [activeTopicKey, submissionTopics],
  );

  const summaryViewActivePath = useMemo(() => {
    if (!showSummaryMode || !activeTopicKey) return null;
    const exact = summaryViewCards.find((c) => c.path === activeTopicKey);
    if (exact) return exact.path;
    const ancestor = summaryViewCards.find(
      (c) =>
        activeTopicKey === c.path || activeTopicKey.startsWith(`${c.path}>`),
    );
    if (ancestor) return ancestor.path;
    const descendant = summaryViewCards.find((c) =>
      c.path.startsWith(`${activeTopicKey}>`),
    );
    return descendant ? descendant.path : null;
  }, [showSummaryMode, activeTopicKey, summaryViewCards]);

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

  // ── Layout hooks ───────────────────────────────────────────────────────────

  const summaryLayout = useSummaryLayout({
    showSummaries,
    articleLoading,
    articleError,
    summaryEntries,
    articleText,
    articlePages,
    articleImages,
    showTopicHierarchy,
    articleTextRef,
    summaryWrapRef,
    scaleRef,
  });

  const insightsLayout = useInsightsLayout({
    showInsights,
    articleLoading,
    articleError,
    insights,
    sentenceOffsets,
    submissionSentences,
    articleText,
    articlePages,
    articleImages,
    articleTextRef,
    summaryWrapRef,
    scaleRef,
  });

  const topicHierarchyLayout = useTopicHierarchyLayout({
    showTopicHierarchy,
    showSummaryMode,
    articleLoading,
    articleError,
    topicHierarchyRowsByLevel,
    summaryViewCards,
    sentenceOffsets,
    submissionSentences,
    articleText,
    articlePages,
    articleImages,
    selectedLevel,
    articleTextRef,
    summaryWrapRef,
    summaryCardRefs,
    scaleRef,
  });

  const zoomAdjustedTopicCards = useMemo(
    () =>
      topicHierarchyLayout.topicCards.map((card) => ({
        ...card,
        titleFontSize: getTopicTitleFontSize({ scale, height: card.height }),
        right:
          TOPIC_HIERARCHY_RAIL_PADDING +
          card.levelIndex *
            (topicHierarchyCardWidth + TOPIC_HIERARCHY_COLUMN_GAP),
      })),
    [scale, topicHierarchyCardWidth, topicHierarchyLayout.topicCards],
  );

  // ── Article highlights ─────────────────────────────────────────────────────

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
      getTopicSentenceTextRanges(
        activeTopicSelection,
        sentenceOffsets,
        submissionSentences,
      ).forEach((r) => {
        base.push({
          start: r.charStart,
          end: r.charEnd,
          label: activeTopicSelection.fullPath || activeTopicSelection.name,
        });
      });
    }
    if (highlightedTopicNames.size > 0) {
      (submissionTopics || []).forEach((topic) => {
        if (!highlightedTopicNames.has(topic.name)) return;
        getTopicSentenceTextRanges(
          topic,
          sentenceOffsets,
          submissionSentences,
        ).forEach((r) => {
          base.push({ start: r.charStart, end: r.charEnd, label: topic.name });
        });
      });
    }
    if (showInsights && activeInsightKey !== null) {
      const card = insightsLayout.cards.find((c) => c.key === activeInsightKey);
      if (card) {
        card.sentenceIndices.forEach((idx) => {
          const i = idx - 1;
          if (i >= 0 && i < submissionSentences.length) {
            base.push({
              start: sentenceOffsets[i],
              end: sentenceOffsets[i] + submissionSentences[i].length,
              label: card.name,
            });
          }
        });
      }
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
    highlightedTopicNames,
    submissionTopics,
    showInsights,
    activeInsightKey,
    insightsLayout.cards,
  ]);

  const temperatureHighlights = useMemo(() => {
    if (!showTemperature || submissionSentences.length === 0) return [];
    const ranges = [];
    (submissionTopics || []).forEach((topic) => {
      const color = temperatureTopicColorMap.get(topic.name);
      if (!color) return;
      (Array.isArray(topic.sentences) ? topic.sentences : []).forEach(
        (sentIdx) => {
          const idx = sentIdx - 1;
          if (idx < 0 || idx >= submissionSentences.length) return;
          ranges.push({
            start: sentenceOffsets[idx],
            end: sentenceOffsets[idx] + submissionSentences[idx].length,
            color,
          });
        },
      );
    });
    return ranges;
  }, [
    showTemperature,
    submissionTopics,
    temperatureTopicColorMap,
    sentenceOffsets,
    submissionSentences,
  ]);

  // ── Auto-focus on highlight event ─────────────────────────────────────────

  useEffect(() => {
    if (currentHighlights.length === 0) return;
    if (userMovedCanvasRef.current) return;
    const raf = window.requestAnimationFrame(() => {
      const el = activeHighlightRef.current;
      if (!el) return;
      const wrap = canvasWrapRef.current;
      const viewport = canvasViewportRef.current;
      if (!wrap || !viewport) return;
      const wrapRect = wrap.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = el.getBoundingClientRect();
      const currentScale = scaleRef.current || 1;
      const nextScale = clampCanvasScale(Math.max(currentScale, 1.4));
      const localTargetX =
        (targetRect.left + targetRect.width / 2 - viewportRect.left) /
        currentScale;
      const localTargetY =
        (targetRect.top + targetRect.height / 2 - viewportRect.top) /
        currentScale;
      setIsFocusingHighlight(true);
      setCanvasTransformNow(nextScale, {
        x: wrapRect.width / 2 - localTargetX * nextScale,
        y: wrapRect.height / 2 - localTargetY * nextScale,
      });
      if (smoothZoomTimerRef.current) clearTimeout(smoothZoomTimerRef.current);
      smoothZoomTimerRef.current = setTimeout(
        () => setIsFocusingHighlight(false),
        380,
      );
    });
    return () => window.cancelAnimationFrame(raf);
  }, [currentHighlights, setCanvasTransformNow]);

  // ── Zoom to summary card ───────────────────────────────────────────────────

  const zoomToSummaryCard = useCallback(
    (topicKey) => {
      if (!topicKey) return;
      const wrap = canvasWrapRef.current;
      const viewport = canvasViewportRef.current;
      if (!wrap || !viewport) return;
      const wrapRect = wrap.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const currentScale = scaleRef.current || 1;
      const nextScale = clampCanvasScale(Math.max(currentScale, 1.4));

      let localTargetX;
      let localTargetY;

      if (showSummaryMode) {
        const cardEl =
          summaryCardRefs.current[topicKey] ||
          summaryViewCards
            .filter(
              (c) => topicKey === c.path || topicKey.startsWith(`${c.path}>`),
            )
            .map((c) => summaryCardRefs.current[c.path])
            .find(Boolean);
        if (!cardEl) return;
        const targetRect = cardEl.getBoundingClientRect();
        localTargetX =
          (targetRect.left + targetRect.width / 2 - viewportRect.left) /
          currentScale;
        localTargetY =
          (targetRect.top + targetRect.height / 2 - viewportRect.top) /
          currentScale;
      } else {
        const topic = submissionTopics.find((t) => t.name === topicKey);
        if (!topic) return;
        const textRange = getTopicTextRange(
          topic,
          sentenceOffsets,
          submissionSentences,
        );
        if (!textRange) return;
        const articleEl = articleTextRef.current;
        if (!articleEl) return;
        const startRange = rangeAtOffset(articleEl, textRange.charStart);
        if (!startRange) return;
        const startRect = startRange.getBoundingClientRect();
        localTargetX =
          (startRect.left + startRect.width / 2 - viewportRect.left) /
          currentScale;
        localTargetY =
          (startRect.top + startRect.height / 2 - viewportRect.top) /
          currentScale;
      }

      setIsFocusingHighlight(true);
      setCanvasTransformNow(nextScale, {
        x: wrapRect.width / 2 - localTargetX * nextScale,
        y: wrapRect.height / 2 - localTargetY * nextScale,
      });
      if (smoothZoomTimerRef.current) clearTimeout(smoothZoomTimerRef.current);
      smoothZoomTimerRef.current = setTimeout(
        () => setIsFocusingHighlight(false),
        380,
      );
    },
    [
      showSummaryMode,
      summaryViewCards,
      submissionTopics,
      sentenceOffsets,
      submissionSentences,
      setCanvasTransformNow,
    ],
  );

  const zoomToInsight = useCallback(
    (insightKey) => {
      const card = insightsLayout.cards.find((c) => c.key === insightKey);
      if (!card) return;
      const articleEl = articleTextRef.current;
      const wrap = canvasWrapRef.current;
      const viewport = canvasViewportRef.current;
      if (!articleEl || !wrap || !viewport) return;
      const wrapRect = wrap.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const currentScale = scaleRef.current || 1;
      const nextScale = clampCanvasScale(Math.max(currentScale, 1.4));
      const startRange = rangeAtOffset(articleEl, card.charStart);
      if (!startRange) return;
      const startRect = startRange.getBoundingClientRect();
      const localTargetX =
        (startRect.left + startRect.width / 2 - viewportRect.left) /
        currentScale;
      const localTargetY =
        (startRect.top + startRect.height / 2 - viewportRect.top) /
        currentScale;
      setIsFocusingHighlight(true);
      setCanvasTransformNow(nextScale, {
        x: wrapRect.width / 2 - localTargetX * nextScale,
        y: wrapRect.height / 2 - localTargetY * nextScale,
      });
      if (smoothZoomTimerRef.current) clearTimeout(smoothZoomTimerRef.current);
      smoothZoomTimerRef.current = setTimeout(
        () => setIsFocusingHighlight(false),
        380,
      );
    },
    [insightsLayout.cards, setCanvasTransformNow],
  );

  // ── Render ────────────────────────────────────────────────────────────────

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
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
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
                className={`canvas-article-with-summaries${showSummaries && !showSummaryMode ? " has-summaries" : ""}${showTopicHierarchy || showSummaryMode ? " has-topic-hierarchy" : ""}${showSummaryMode ? " is-summary-mode" : ""}${showInsights && !showSummaryMode ? " has-insights" : ""}`}
                style={{
                  "--canvas-topic-hierarchy-width": `${topicHierarchyRailWidth}px`,
                }}
              >
                {showSummaryMode ? (
                  <CanvasSummaryView
                    summaryViewCards={summaryViewCards}
                    summaryViewActivePath={summaryViewActivePath}
                    summaryCardRefs={summaryCardRefs}
                    setHoveredTopicKey={setHoveredTopicKey}
                    activeTopicKey={activeTopicKey}
                    articleTextRef={articleTextRef}
                  />
                ) : (
                  <ArticleText
                    text={articleText}
                    highlights={articleHighlights}
                    activeHighlightRef={activeHighlightRef}
                    readRanges={readRanges}
                    showReadStatus={showReadStatus}
                    temperatureHighlights={temperatureHighlights}
                    pages={articlePages}
                    images={articleImages}
                    textRef={articleTextRef}
                    sentenceOffsets={sentenceOffsets}
                    onTextClick={handleArticleClick}
                  />
                )}

                {!showSummaryMode && showSummaries && (
                  <CanvasSummaryRail
                    summaryLayout={summaryLayout}
                    activeSummaryKey={activeSummaryKey}
                    onCardEnter={setHoveredSummaryKey}
                    onCardLeave={(key) =>
                      setHoveredSummaryKey((k) => (k === key ? null : k))
                    }
                    translate={translate}
                    scale={scale}
                    isAnimating={isFocusingHighlight}
                  />
                )}

                {!showSummaryMode && showInsights && (
                  <CanvasInsightsRail
                    insightsLayout={insightsLayout}
                    activeInsightKey={activeInsightKey}
                    onCardEnter={setActiveInsightKey}
                    onCardLeave={(key) =>
                      setActiveInsightKey((k) => (k === key ? null : k))
                    }
                    onCardClick={zoomToInsight}
                    translate={translate}
                    scale={scale}
                    isAnimating={isFocusingHighlight}
                  />
                )}

                <CanvasTopicHierarchyRail
                  show={showTopicHierarchy || showSummaryMode}
                  selectedLevel={selectedLevel}
                  maxLevel={maxLevel}
                  onLevelChange={(level) => {
                    setSelectedLevel(level);
                    setHoveredTopicKey(null);
                    setSelectedTopicKey(null);
                  }}
                  topicCards={zoomAdjustedTopicCards}
                  railWidth={topicHierarchyRailWidth}
                  cardWidth={topicHierarchyCardWidth}
                  activeTopicKey={activeTopicKey}
                  selectedTopicKey={selectedTopicKey}
                  onTopicEnter={setHoveredTopicKey}
                  onTopicLeave={(topicKey) =>
                    setHoveredTopicKey((current) =>
                      current === topicKey ? null : current,
                    )
                  }
                  onTopicClick={(topicKey) => {
                    setSelectedTopicKey((current) =>
                      current === topicKey ? null : topicKey,
                    );
                    zoomToSummaryCard(topicKey);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <CanvasZoomControls
          onNavigate={navigateCanvas}
          onZoomIn={() =>
            setCanvasTransformNow(
              clampCanvasScale((scaleRef.current || 1) * 1.2),
              translateRef.current,
            )
          }
          onZoomOut={() =>
            setCanvasTransformNow(
              clampCanvasScale((scaleRef.current || 1) / 1.2),
              translateRef.current,
            )
          }
          onReset={() => setCanvasTransformNow(1, { x: 40, y: 40 })}
          showReadStatus={showReadStatus}
          onToggleRead={() => setShowReadStatus((v) => !v)}
          showSummaryMode={showSummaryMode}
          onToggleSummaryMode={() => setShowSummaryMode((v) => !v)}
          showSummaries={showSummaries}
          onToggleSummaries={() => setShowSummaries((v) => !v)}
          showTopicHierarchy={showTopicHierarchy}
          onToggleTopicHierarchy={() => setShowTopicHierarchy((v) => !v)}
          showTemperature={showTemperature}
          onToggleTemperature={toggleTemperature}
          temperatureAvailable={temperatureAvailable}
          showInsights={showInsights}
          onToggleInsights={() => setShowInsights((v) => !v)}
          showChat={showChat}
          onToggleChat={() => setShowChat((v) => !v)}
          tooltipEnabled={tooltipEnabled}
          onToggleTooltip={() => setTooltipEnabled((v) => !v)}
        />
      </div>

      <CanvasArticleTooltip
        tooltip={tooltip}
        containerRef={tooltipContainerRef}
        readTopics={readTopics}
        highlightedTopicNames={highlightedTopicNames}
        onToggleHighlight={toggleTopicHighlight}
        onToggleRead={toggleTopicRead}
        onHide={hideTooltip}
        submissionId={articleId}
      />

      <CanvasRightPanel
        show={showChat}
        newIndices={newIndices}
        articleId={articleId}
        messages={messages}
        setMessages={setMessages}
        isChatLoading={isChatLoading}
        setIsChatLoading={setIsChatLoading}
        contextPages={contextPages}
        setContextPages={setContextPages}
        articlePages={articlePages}
        fetchEvents={fetchEvents}
        events={events}
        selectedIndex={selectedIndex}
        isLive={isLive}
        deleteError={deleteError}
        onSelectEvent={handleSelectEvent}
        onGoLive={handleGoLive}
        onDeleteEvent={handleDeleteEvent}
      />
    </div>
  );
}
