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
import { useTopicLevel } from "../hooks/useTopicLevel";
import { buildScopedChartData } from "../utils/topicHierarchy";
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
  getCursorAnchoredTranslate,
  getTopicDisplayName,
  getTopicSentenceNumbers,
  getTopicSentenceTextRanges,
  getTopicTextRange,
  rangeAtOffset,
  WHEEL_ZOOM_IN_FACTOR,
  WHEEL_ZOOM_OUT_FACTOR,
} from "./CanvasPage/utils";
import CanvasTopicHierarchyRail from "./CanvasPage/CanvasTopicHierarchyRail";
import ArticleText from "./CanvasPage/ArticleText";
import CanvasChatPanel from "./CanvasPage/CanvasChatPanel";
import CanvasEventsPanel from "./CanvasPage/CanvasEventsPanel";
import CanvasZoomControls from "./CanvasPage/CanvasZoomControls";
import CanvasSummaryView from "./CanvasPage/CanvasSummaryView";
import { useCanvasEvents } from "./CanvasPage/useCanvasEvents";

export default function CanvasPage() {
  const articleId = window.location.pathname.split("/")[3];

  // Article text
  const [articleText, setArticleText] = useState("");
  const [articlePages, setArticlePages] = useState([]);
  const [articleLoading, setArticleLoading] = useState(true);
  const [articleError, setArticleError] = useState(null);
  const [topicSummaries, setTopicSummaries] = useState({});
  const [topicSummaryIndex, setTopicSummaryIndex] = useState({});
  const articleTextRef = useRef(null);
  const summaryWrapRef = useRef(null);
  const activeHighlightRef = useRef(null);

  // Canvas transform
  const [translate, setTranslate] = useState({ x: 40, y: 40 });
  const [scale, setScale] = useState(1);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [isFocusingHighlight, setIsFocusingHighlight] = useState(false);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const canvasWrapRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 40, y: 40 });
  const transformFrameRef = useRef(0);
  const pendingTransformRef = useRef(null);
  const userMovedCanvasRef = useRef(false);
  const smoothZoomTimerRef = useRef(null);
  const isTouchDragging = useRef(false);
  const lastTouch = useRef({ x: 0, y: 0 });
  const touchDragStart = useRef({ x: 0, y: 0 });
  const touchHasMoved = useRef(false);
  const pinchState = useRef(null);

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

  const getTouchDistance = useCallback((touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getTouchMidpoint = useCallback((touches) => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }, []);

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
        const nextTranslate = getCursorAnchoredTranslate({
          cursor,
          translate: startTranslate,
          currentScale: startScale,
          nextScale,
        });
        scheduleCanvasTransform(nextScale, nextTranslate);
      } else if (isTouchDragging.current && touches.length === 1) {
        const dx = touches[0].clientX - touchDragStart.current.x;
        const dy = touches[0].clientY - touchDragStart.current.y;
        if (!touchHasMoved.current) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 6) return;
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

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      const currentScale = scaleRef.current || 1;
      const delta = e.deltaY > 0 ? WHEEL_ZOOM_OUT_FACTOR : WHEEL_ZOOM_IN_FACTOR;
      const nextScale = clampCanvasScale(currentScale * delta);
      if (nextScale === currentScale) return;
      const wrapRect = wrap.getBoundingClientRect();
      const nextTranslate = getCursorAnchoredTranslate({
        cursor: { x: e.clientX - wrapRect.left, y: e.clientY - wrapRect.top },
        translate: translateRef.current,
        currentScale,
        nextScale,
      });
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

  const navigateCanvas = useCallback(
    (pos) => {
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      const currentScale = scaleRef.current || 1;
      const wrapRect = wrap.getBoundingClientRect();
      const viewportHeight = wrap.clientHeight || wrapRect.height || 0;
      const pageStep = Math.max(120, viewportHeight * 0.8);
      const topY = 40;
      setIsFocusingHighlight(false);
      userMovedCanvasRef.current = true;
      const currentTranslate = translateRef.current;
      let nextY = currentTranslate.y;
      if (pos === "top") nextY = topY;
      else if (pos === "bottom") nextY = currentTranslate.y - pageStep * 4;
      else if (pos === "prev") nextY = currentTranslate.y + pageStep;
      else if (pos === "next") nextY = currentTranslate.y - pageStep;
      setCanvasTransformNow(currentScale, { ...currentTranslate, y: nextY });
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

  // Temperature
  const [showTemperature, setShowTemperature] = useState(false);
  const [topicTemperatures, setTopicTemperatures] = useState({});

  // Summary view mode
  const [showSummaryMode, setShowSummaryMode] = useState(false);
  const summaryCardRefs = useRef({});

  // Summaries layer
  const [showSummaries, setShowSummaries] = useState(false);
  const [hoveredSummaryKey, setHoveredSummaryKey] = useState(null);
  const [summaryLayout, setSummaryLayout] = useState({ cards: [], width: 0 });

  // Topic hierarchy
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

  // Context limiter
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
        setTopicSummaryIndex(data.topic_summary_index || {});
        setTopicTemperatures(data.topic_temperatures || {});
        setArticleLoading(false);
      })
      .catch((err) => {
        setArticleError(err.message);
        setArticleLoading(false);
      });
  }, [articleId]);

  // Read ranges
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

  // Temperature
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
      map.set(topicName, { rate });
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

  // Sentence offsets
  const sentenceOffsets = useMemo(() => {
    const arr = [];
    let off = 0;
    for (const s of submissionSentences) {
      arr.push(off);
      off += s.length + 1;
    }
    return arr;
  }, [submissionSentences]);

  // Summary entries
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

  const activeSummaryKey = hoveredSummaryKey;

  // Active topic key
  const activeTopicKey = hoveredTopicKey || selectedTopicKey;

  const selectedTopic = useMemo(() => {
    if (!activeTopicKey) return null;
    return (
      (submissionTopics || []).find((topic) => topic.name === activeTopicKey) ||
      null
    );
  }, [activeTopicKey, submissionTopics]);

  // Topic hierarchy rows
  const topicHierarchyRowsByLevel = useMemo(() => {
    return Array.from({ length: selectedLevel + 1 }, (_, level) =>
      buildScopedChartData(submissionTopics, submissionSentences, [], level),
    );
  }, [selectedLevel, submissionSentences, submissionTopics]);

  // Summary view cards
  const summaryViewCards = useMemo(() => {
    if (!topicSummaryIndex || typeof topicSummaryIndex !== "object") return [];
    const targetLevel = selectedLevel + 1;
    const entries = Object.entries(topicSummaryIndex)
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
        const startSent = sourceSentences.length
          ? Math.min(...sourceSentences)
          : 0;
        return {
          path,
          name: getTopicParts(path).slice(-1)[0] || path,
          text: entry.text || "",
          bullets: Array.isArray(entry.bullets) ? entry.bullets : [],
          sourceSentences,
          startSentence: startSent,
        };
      })
      .sort((a, b) => a.startSentence - b.startSentence);
    return entries;
  }, [topicSummaryIndex, selectedLevel]);

  const summaryViewActivePath = useMemo(() => {
    if (!showSummaryMode) return null;
    const candidate = activeTopicKey;
    if (!candidate) return null;
    const exact = summaryViewCards.find((c) => c.path === candidate);
    if (exact) return exact.path;
    const ancestor = summaryViewCards.find(
      (c) => candidate === c.path || candidate.startsWith(`${c.path}>`),
    );
    if (ancestor) return ancestor.path;
    const descendant = summaryViewCards.find((c) =>
      c.path.startsWith(`${candidate}>`),
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

  const zoomAdjustedTopicCards = useMemo(() => {
    return topicHierarchyLayout.topicCards.map((card) => ({
      ...card,
      titleFontSize: getTopicTitleFontSize({
        scale,
        height: card.height,
      }),
      right:
        TOPIC_HIERARCHY_RAIL_PADDING +
        card.levelIndex *
          (topicHierarchyCardWidth + TOPIC_HIERARCHY_COLUMN_GAP),
    }));
  }, [scale, topicHierarchyCardWidth, topicHierarchyLayout.topicCards]);

  // Article highlights
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

  // Auto-focus canvas on the selected highlight event
  useEffect(() => {
    if (currentHighlights.length === 0) return;
    if (userMovedCanvasRef.current) return;

    // Defer to the next paint so the highlight DOM has rendered
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
      if (smoothZoomTimerRef.current) {
        clearTimeout(smoothZoomTimerRef.current);
      }
      smoothZoomTimerRef.current = setTimeout(() => {
        setIsFocusingHighlight(false);
      }, 380);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [currentHighlights, setCanvasTransformNow]);

  // Temperature highlights
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

  // Summary layout computation
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
    showTopicHierarchy,
  ]);

  // Topic hierarchy layout computation
  useEffect(() => {
    const hierarchyVisible = showTopicHierarchy || showSummaryMode;
    if (!hierarchyVisible || articleLoading || articleError) {
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

      const summaryRectForRow = (row) => {
        const matching = summaryViewCards.filter(
          (c) =>
            c.path === row.fullPath ||
            c.path.startsWith(`${row.fullPath}>`) ||
            row.fullPath.startsWith(`${c.path}>`),
        );
        if (matching.length === 0) return null;
        let top = Number.POSITIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;
        for (const c of matching) {
          const el = summaryCardRefs.current[c.path];
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.top < top) top = r.top;
          if (r.bottom > bottom) bottom = r.bottom;
        }
        if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
        return { top, bottom };
      };

      const toPositionedCard = (row, levelIndex) => {
        let rawTop;
        let rawBottom;

        if (showSummaryMode) {
          const rect = summaryRectForRow(row);
          if (!rect) return null;
          rawTop = (rect.top - wrapRect.top) / s;
          rawBottom = (rect.bottom - wrapRect.top) / s;
        } else {
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
          rawTop = (startRect.top - wrapRect.top) / s;
          rawBottom = (endRect.bottom - wrapRect.top) / s;
        }

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
          depth: Math.max(0, getTopicParts(row.fullPath).length - 1),
          levelIndex,
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
    selectedLevel,
    sentenceOffsets,
    showTopicHierarchy,
    showSummaryMode,
    submissionSentences,
    summaryViewCards,
    topicHierarchyRowsByLevel,
  ]);

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
        // Use the topic's text range in the article for positioning
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
      if (smoothZoomTimerRef.current) {
        clearTimeout(smoothZoomTimerRef.current);
      }
      smoothZoomTimerRef.current = setTimeout(() => {
        setIsFocusingHighlight(false);
      }, 380);
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
                className={`canvas-article-with-summaries${showSummaries && !showSummaryMode ? " has-summaries" : ""}${showTopicHierarchy || showSummaryMode ? " has-topic-hierarchy" : ""}${showSummaryMode ? " is-summary-mode" : ""}`}
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
                    textRef={articleTextRef}
                  />
                )}
                {!showSummaryMode &&
                  showSummaries &&
                  summaryLayout.cards.length > 0 && (
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
                            className={`canvas-summary-card${activeSummaryKey === card.key ? " is-active" : ""}`}
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
                  onTopicLeave={(topicKey) => {
                    setHoveredTopicKey((current) =>
                      current === topicKey ? null : current,
                    );
                  }}
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
          onReset={() => {
            setCanvasTransformNow(1, { x: 40, y: 40 });
          }}
          showReadStatus={showReadStatus}
          onToggleRead={() => setShowReadStatus((v) => !v)}
          showSummaryMode={showSummaryMode}
          onToggleSummaryMode={() => setShowSummaryMode((v) => !v)}
          showSummaries={showSummaries}
          onToggleSummaries={() => setShowSummaries((v) => !v)}
          showTopicHierarchy={showTopicHierarchy}
          onToggleTopicHierarchy={() =>
            setShowTopicHierarchy((value) => !value)
          }
          showTemperature={showTemperature}
          onToggleTemperature={toggleTemperature}
          temperatureAvailable={temperatureAvailable}
          showChat={showChat}
          onToggleChat={() => setShowChat((v) => !v)}
        />
      </div>

      {/* Right: Tabbed Panel */}
      {showChat && (
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
          {activeTab === "chat" && (
            <CanvasChatPanel
              articleId={articleId}
              messages={messages}
              setMessages={setMessages}
              isChatLoading={isChatLoading}
              setIsChatLoading={setIsChatLoading}
              contextPages={contextPages}
              setContextPages={setContextPages}
              articlePages={articlePages}
              fetchEvents={fetchEvents}
            />
          )}

          {/* Events tab */}
          {activeTab === "events" && (
            <CanvasEventsPanel
              events={events}
              selectedIndex={selectedIndex}
              isLive={isLive}
              newIndices={newIndices}
              deleteError={deleteError}
              onSelectEvent={handleSelectEvent}
              onGoLive={handleGoLive}
              onDeleteEvent={handleDeleteEvent}
            />
          )}
        </div>
      )}
    </div>
  );
}

function getTopicParts(fullPath) {
  return (fullPath || "").split(">").filter(Boolean);
}
