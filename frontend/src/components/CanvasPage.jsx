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
import CanvasTagsCloud from "./CanvasPage/CanvasTagsCloud";
import CanvasTagTopicsRail from "./CanvasPage/CanvasTagTopicsRail";
import CanvasTopicTagsRail from "./CanvasPage/CanvasTopicTagsRail";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import {
  buildModalSelectionFromTopic,
  buildTopicModalSelection,
} from "../utils/topicModalSelection";
import { useCanvasEvents } from "./CanvasPage/useCanvasEvents";
import { useCanvasChats } from "./CanvasPage/useCanvasChats";
import { useTooltip } from "../hooks/useTooltip";
import { useArticleData } from "./CanvasPage/useArticleData";
import { useTopicReadStatus } from "./CanvasPage/useTopicReadStatus";
import { useTopicTemperature } from "./CanvasPage/useTopicTemperature";
import { useSummaryLayout } from "./CanvasPage/useSummaryLayout";
import { useInsightsLayout } from "./CanvasPage/useInsightsLayout";
import { useTopicHierarchyLayout } from "./CanvasPage/useTopicHierarchyLayout";
import { useTagTopicsLayout } from "./CanvasPage/useTagTopicsLayout";
import { useTopicTagsLayout } from "./CanvasPage/useTopicTagsLayout";
import { useCanvasTransform } from "./CanvasPage/useCanvasTransform";
import { buildArticleWordCloud, naiveLemmatize } from "../utils/wordCloud";

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

  // Refs (non-transform)
  const articleTextRef = useRef(null);
  const summaryWrapRef = useRef(null);
  const activeHighlightRef = useRef(null);
  const summaryCardRefs = useRef({});

  // Canvas transform (state, refs, handlers, keyboard nav)
  const {
    translate,
    scale,
    isCanvasDragging,
    isFocusingHighlight,
    userMovedCanvasRef,
    canvasWrapRef,
    canvasViewportRef,
    scaleRef,
    translateRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    setCanvasTransformNow,
    navigateCanvas,
    zoomToTarget,
  } = useCanvasTransform({ contentRef: articleTextRef });

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
    topicTagRankings,
    insights,
    markup,
  } = useArticleData(articleId);

  // Chat sessions (history)
  const {
    chats,
    activeChatId,
    isLoading: isChatsLoading,
    error: chatsError,
    selectChat,
    deleteChat,
    touchChatPreview,
    setActiveChatId,
  } = useCanvasChats(articleId);

  // Events / timeline (scoped to current chat)
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
  } = useCanvasEvents(articleId, activeChatId);

  // Chat
  const [messages, setMessages] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [contextPages, setContextPages] = useState("");

  // Reload persisted messages whenever the active chat changes.
  const lastLoadedChatRef = useRef(null);
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      lastLoadedChatRef.current = null;
      return;
    }
    if (lastLoadedChatRef.current === activeChatId) return;
    lastLoadedChatRef.current = activeChatId;
    let cancelled = false;
    (async () => {
      const persisted = await selectChat(activeChatId);
      if (cancelled) return;
      if (lastLoadedChatRef.current !== activeChatId) return;
      setMessages(persisted.map((m) => ({ role: m.role, content: m.content })));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeChatId, selectChat]);

  /**
   * @param {string} chatId
   */
  const handleSelectChat = useCallback(
    (chatId) => {
      if (!chatId || chatId === activeChatId) return;
      setActiveChatId(chatId);
    },
    [activeChatId, setActiveChatId],
  );

  const handleNewChat = useCallback(() => {
    // Clear messages and reset active chat to null
    // Next message will trigger creation of a new chat session
    setMessages([]);
    setActiveChatId(null);
  }, [setMessages, setActiveChatId]);

  /**
   * @param {string} chatId
   */
  const handleDeleteChat = useCallback(
    async (chatId) => {
      await deleteChat(chatId);
    },
    [deleteChat],
  );

  /**
   * @param {string} chatId
   * @param {string} lastMessage
   * @returns {void}
   */
  const handleChatPersisted = useCallback(
    (chatId, lastMessage) => {
      if (chatId !== activeChatId) {
        setActiveChatId(chatId);
      }
      touchChatPreview(chatId, lastMessage);
    },
    [activeChatId, setActiveChatId, touchChatPreview],
  );

  // View modes
  const [showSummaryMode, setShowSummaryMode] = useState(false);
  const [showSummaries, setShowSummaries] = useState(false);
  const [showTopicHierarchy, setShowTopicHierarchy] = useState(false);
  const [showReadStatus, setShowReadStatus] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [activeInsightKey, setActiveInsightKey] = useState(null);
  const [showTagsCloud, setShowTagsCloud] = useState(false);
  const [showTopicTagsRail, setShowTopicTagsRail] = useState(false);
  const [hoveredCloudLemma, setHoveredCloudLemma] = useState(null);
  const [selectedCloudLemma, setSelectedCloudLemma] = useState(null);
  const [activeTagTopicKey, setActiveTagTopicKey] = useState(null);
  const [activeTopicTagsKey, setActiveTopicTagsKey] = useState(null);
  const [topicTagVisibleCounts, setTopicTagVisibleCounts] = useState({});
  const cloudRangesRef = useRef(new Map());
  const tagsCloudRef = useRef(null);
  const [cloudRangesMap, setCloudRangesMap] = useState(() => new Map());
  const [articleHeight, setArticleHeight] = useState(0);
  const [cloudSize, setCloudSize] = useState({ width: 0, height: 0 });

  // Topic interaction state
  const [hoveredSummaryKey, setHoveredSummaryKey] = useState(null);
  const [hoveredTopicKey, setHoveredTopicKey] = useState(null);
  const [selectedTopicKey, setSelectedTopicKey] = useState(null);
  const [highlightedTopicNames, setHighlightedTopicNames] = useState(
    () => new Set(),
  );

  // Sentences modal (opened from tooltip)
  const [summaryModalTopic, setSummaryModalTopic] = useState(null);

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

  useEffect(() => {
    const el = articleTextRef.current;
    if (!el) {
      setArticleHeight(0);
      return undefined;
    }
    const update = () => setArticleHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [articleText, articleLoading, articleError, showSummaryMode]);

  const handleCloudWordsComputed = useCallback((rangesMap) => {
    const nextRangesMap = rangesMap || new Map();
    cloudRangesRef.current = nextRangesMap;
    setCloudRangesMap(nextRangesMap);
  }, []);

  const tagTopicNavKeyRef = useRef(null);

  useEffect(() => {
    setActiveTagTopicKey(null);
    tagTopicNavKeyRef.current = null;
  }, [selectedCloudLemma]);

  useEffect(() => {
    if (!showTopicTagsRail) setActiveTopicTagsKey(null);
  }, [showTopicTagsRail]);

  useEffect(() => {
    setTopicTagVisibleCounts({});
  }, [topicTagRankings]);

  const focusArticleOffset = useCallback(
    (charOffset) => {
      const articleEl = articleTextRef.current;
      if (!articleEl) return;
      const startRange = rangeAtOffset(articleEl, charOffset);
      if (!startRange) return;
      zoomToTarget(startRange.getBoundingClientRect());
    },
    [zoomToTarget],
  );

  const handleCloudWordSelect = useCallback(
    (lemma) => {
      if (!lemma) return;
      setSelectedCloudLemma(lemma);
      setHoveredCloudLemma(lemma);

      const firstRange = cloudRangesRef.current.get(lemma)?.[0];
      if (!firstRange) return;

      window.requestAnimationFrame(() => {
        focusArticleOffset(firstRange.start);
      });
    },
    [focusArticleOffset],
  );

  const moveToTagsCloud = useCallback(() => {
    const cloudEl = tagsCloudRef.current;
    if (!cloudEl) return;

    const selectedTagEl = selectedCloudLemma
      ? Array.from(cloudEl.querySelectorAll("[data-cloud-lemma]")).find(
          (el) => el.getAttribute("data-cloud-lemma") === selectedCloudLemma,
        )
      : null;
    const targetEl = selectedTagEl || cloudEl;
    // Center on the cloud without zooming in (zoomLevel=0 keeps currentScale).
    zoomToTarget(targetEl.getBoundingClientRect(), 0);
  }, [selectedCloudLemma, zoomToTarget]);

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

  // ── Topic sentences modal ────────────────────────────────────────────────

  const handleShowTopicSentences = useCallback(
    (topic) => {
      if (!topic) return;
      const fullTopic =
        (submissionTopics || []).find((t) => t.name === topic.name) || topic;
      const summaryText =
        (topicSummaries && topicSummaries[fullTopic.name]) ||
        (topicSummaries && topicSummaries[fullTopic.fullPath]) ||
        "";
      setSummaryModalTopic(
        buildModalSelectionFromTopic({
          ...fullTopic,
          _sentences: submissionSentences,
          _summarySentence: summaryText || undefined,
        }),
      );
    },
    [submissionTopics, submissionSentences, topicSummaries],
  );

  const closeSummaryModal = useCallback(() => {
    setSummaryModalTopic(null);
  }, []);

  const handleModalToggleRead = useCallback(
    (modalTopic) => {
      const names = Array.isArray(modalTopic?.canonicalTopicNames)
        ? modalTopic.canonicalTopicNames
        : [modalTopic?.primaryTopicName || modalTopic?.name].filter(Boolean);
      names.forEach((name) => toggleTopicRead(name));
    },
    [toggleTopicRead],
  );

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

  const selectedTagTopicEntries = useMemo(() => {
    if (!selectedCloudLemma) return [];
    const ranges = cloudRangesMap.get(selectedCloudLemma) || [];
    if (ranges.length === 0 || sentenceOffsets.length === 0) return [];

    const matchingSentenceNumbers = new Set();
    ranges.forEach((range) => {
      for (let index = 0; index < sentenceOffsets.length; index += 1) {
        const sentenceStart = sentenceOffsets[index];
        const sentenceEnd =
          sentenceStart + (submissionSentences[index] || "").length;
        if (range.start < sentenceEnd && range.end > sentenceStart) {
          matchingSentenceNumbers.add(index + 1);
          break;
        }
      }
    });

    if (matchingSentenceNumbers.size === 0) return [];

    return (submissionTopics || [])
      .flatMap((topic) => {
        const topicSentences = getTopicSentenceNumbers(topic);
        const sentences = topicSentences
          .filter((sentenceNumber) =>
            matchingSentenceNumbers.has(sentenceNumber),
          )
          .sort((left, right) => left - right);
        if (sentences.length === 0) return [];

        const fullPath = topic.fullPath || topic.name || "";
        const topicName = getTopicDisplayName(topic);

        return sentences.map((sentenceNumber) => {
          const charStart = sentenceOffsets[sentenceNumber - 1] ?? 0;
          const sentenceText = submissionSentences[sentenceNumber - 1] || "";
          const charEnd = charStart + sentenceText.length;
          const summaryText =
            topicSummaries?.[topic.name] || topicSummaries?.[fullPath] || "";

          return {
            key: `${fullPath || topicName}:${sentenceNumber}`,
            topicName,
            fullPath,
            sentences: [sentenceNumber],
            preview: sentenceText,
            summaryText,
            charStart,
            charEnd,
          };
        });
      })
      .sort((left, right) => {
        if (left.charStart !== right.charStart) {
          return left.charStart - right.charStart;
        }
        return left.topicName.localeCompare(right.topicName);
      });
  }, [
    cloudRangesMap,
    selectedCloudLemma,
    sentenceOffsets,
    submissionSentences,
    submissionTopics,
    topicSummaries,
  ]);

  const zoomToTagTopic = useCallback(
    (cardKey) => {
      const card = selectedTagTopicEntries.find(
        (entry) => entry.key === cardKey,
      );
      if (!card) return;
      tagTopicNavKeyRef.current = cardKey;
      focusArticleOffset(card.charStart);
    },
    [focusArticleOffset, selectedTagTopicEntries],
  );

  const navigateTagHighlight = useCallback(
    (direction) => {
      if (selectedTagTopicEntries.length === 0) return;
      const anchorKey = tagTopicNavKeyRef.current ?? activeTagTopicKey;
      const currentIdx = selectedTagTopicEntries.findIndex(
        (entry) => entry.key === anchorKey,
      );
      const length = selectedTagTopicEntries.length;
      let nextIdx;
      if (currentIdx === -1) {
        nextIdx = direction > 0 ? 0 : length - 1;
      } else {
        nextIdx = (currentIdx + direction + length) % length;
      }
      const card = selectedTagTopicEntries[nextIdx];
      tagTopicNavKeyRef.current = card.key;
      setActiveTagTopicKey(null);
      focusArticleOffset(card.charStart);
    },
    [activeTagTopicKey, focusArticleOffset, selectedTagTopicEntries],
  );

  const handlePrevTagHighlight = useCallback(
    () => navigateTagHighlight(-1),
    [navigateTagHighlight],
  );
  const handleNextTagHighlight = useCallback(
    () => navigateTagHighlight(1),
    [navigateTagHighlight],
  );

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

  const tagTopicsLayout = useTagTopicsLayout({
    show: showTagsCloud && Boolean(selectedCloudLemma),
    entries: selectedTagTopicEntries,
    articleLoading,
    articleError,
    articleText,
    articlePages,
    articleImages,
    articleTextRef,
    summaryWrapRef,
    scaleRef,
  });

  const topicTagsLayout = useTopicTagsLayout({
    show: showTopicTagsRail,
    submissionTopics,
    topicTagRankings,
    visibleCounts: topicTagVisibleCounts,
    sentenceOffsets,
    submissionSentences,
    articleLoading,
    articleError,
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

  const articleLemmaRanges = useMemo(() => {
    if (!articleText) return new Map();
    return buildArticleWordCloud(articleText).ranges;
  }, [articleText]);

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
    if (showTagsCloud) {
      const activeCloudLemmas = [selectedCloudLemma, hoveredCloudLemma].filter(
        (lemma, index, lemmas) => lemma && lemmas.indexOf(lemma) === index,
      );
      activeCloudLemmas.forEach((lemma) => {
        const ranges = cloudRangesMap.get(lemma) || [];
        ranges.forEach((r) => {
          base.push({ start: r.start, end: r.end, label: lemma });
        });
      });
    }
    if (showTagsCloud && activeTagTopicKey) {
      const activeCard = selectedTagTopicEntries.find(
        (card) => card.key === activeTagTopicKey,
      );
      activeCard?.sentences.forEach((sentenceNumber) => {
        const index = sentenceNumber - 1;
        if (index < 0 || index >= submissionSentences.length) return;
        base.push({
          start: sentenceOffsets[index],
          end: sentenceOffsets[index] + submissionSentences[index].length,
          label: activeCard.topicName,
        });
      });
    }
    if (showTopicTagsRail && activeTopicTagsKey) {
      const activeCard = topicTagsLayout.cards.find(
        (card) => card.key === activeTopicTagsKey,
      );
      if (activeCard) {
        const sentenceBounds = [];
        activeCard.sentenceNumbers.forEach((sentenceNumber) => {
          const index = sentenceNumber - 1;
          if (index < 0 || index >= submissionSentences.length) return;
          const start = sentenceOffsets[index];
          const end = sentenceOffsets[index] + submissionSentences[index].length;
          base.push({ start, end, label: activeCard.topicName });
          sentenceBounds.push({ start, end });
        });
        const visibleCount =
          activeCard.visibleTagCount || activeCard.tags.length;
        activeCard.tags.slice(0, visibleCount).forEach(({ tag }) => {
          const lemma = naiveLemmatize(tag) || tag;
          const ranges = articleLemmaRanges.get(lemma) || [];
          ranges.forEach((r) => {
            if (
              sentenceBounds.some((s) => r.start >= s.start && r.end <= s.end)
            ) {
              base.push({
                start: r.start,
                end: r.end,
                label: tag,
                variant: "tag",
              });
            }
          });
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
    showTagsCloud,
    hoveredCloudLemma,
    selectedCloudLemma,
    cloudRangesMap,
    activeTagTopicKey,
    selectedTagTopicEntries,
    showTopicTagsRail,
    activeTopicTagsKey,
    topicTagsLayout.cards,
    articleLemmaRanges,
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
      zoomToTarget(el.getBoundingClientRect());
    });
    return () => window.cancelAnimationFrame(raf);
  }, [currentHighlights, zoomToTarget]);

  // ── Zoom to summary card ───────────────────────────────────────────────────

  const zoomToSummaryCard = useCallback(
    (topicKey) => {
      if (!topicKey) return;

      let targetRect = null;

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
        targetRect = cardEl.getBoundingClientRect();
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
        targetRect = startRange.getBoundingClientRect();
      }

      zoomToTarget(targetRect);
    },
    [
      showSummaryMode,
      summaryViewCards,
      submissionTopics,
      sentenceOffsets,
      submissionSentences,
      zoomToTarget,
    ],
  );

  const zoomToInsight = useCallback(
    (insightKey) => {
      const card = insightsLayout.cards.find((c) => c.key === insightKey);
      if (!card) return;
      const articleEl = articleTextRef.current;
      if (!articleEl) return;
      const startRange = rangeAtOffset(articleEl, card.charStart);
      if (!startRange) return;
      zoomToTarget(startRange.getBoundingClientRect());
    },
    [insightsLayout.cards, zoomToTarget],
  );

  const zoomToTopicTags = useCallback(
    (topicKey) => {
      const card = topicTagsLayout.cards.find((c) => c.key === topicKey);
      if (!card) return;
      focusArticleOffset(card.charStart);
    },
    [focusArticleOffset, topicTagsLayout.cards],
  );

  const handleLoadMoreTopicTags = useCallback((key, nextCount) => {
    setTopicTagVisibleCounts((prev) => ({
      ...prev,
      [key]: nextCount,
    }));
  }, []);

  const handleManualSelectEvent = useCallback(
    (idx) => {
      handleSelectEvent(idx);

      const raf = window.requestAnimationFrame(() => {
        const el = activeHighlightRef.current;
        if (!el) return;
        zoomToTarget(el.getBoundingClientRect());
      });
      return () => window.cancelAnimationFrame(raf);
    },
    [handleSelectEvent, zoomToTarget],
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
                className={`canvas-article-with-summaries${showSummaries && !showSummaryMode ? " has-summaries" : ""}${showTopicHierarchy || showSummaryMode ? " has-topic-hierarchy" : ""}${showSummaryMode ? " is-summary-mode" : ""}${showInsights && !showSummaryMode ? " has-insights" : ""}${showTagsCloud && !showSummaryMode ? " has-tags-cloud" : ""}${showTagsCloud && selectedCloudLemma && !showSummaryMode ? " has-tag-topics" : ""}${showTopicTagsRail && !showSummaryMode ? " has-topic-tags" : ""}`}
                style={{
                  "--canvas-topic-hierarchy-width": `${topicHierarchyRailWidth}px`,
                  "--canvas-tags-cloud-width": `${cloudSize.width}px`,
                }}
              >
                {!showSummaryMode && showTagsCloud && (
                  <CanvasTagsCloud
                    cloudRef={tagsCloudRef}
                    articleText={articleText}
                    articleHeight={articleHeight}
                    onWordHoverChange={setHoveredCloudLemma}
                    onWordSelect={handleCloudWordSelect}
                    onWordsComputed={handleCloudWordsComputed}
                    onSizeChange={setCloudSize}
                    selectedLemma={selectedCloudLemma}
                    topicTagRankings={topicTagRankings}
                  />
                )}

                {showSummaryMode ? (
                  <CanvasSummaryView
                    summaryViewCards={summaryViewCards}
                    summaryViewActivePath={summaryViewActivePath}
                    summaryCardRefs={summaryCardRefs}
                    setHoveredTopicKey={setHoveredTopicKey}
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

                {!showSummaryMode && showTagsCloud && selectedCloudLemma && (
                  <CanvasTagTopicsRail
                    tagTopicsLayout={tagTopicsLayout}
                    activeTopicKey={activeTagTopicKey}
                    onCardEnter={(key) => {
                      tagTopicNavKeyRef.current = key;
                      setActiveTagTopicKey(key);
                    }}
                    onCardLeave={(key) =>
                      setActiveTagTopicKey((current) =>
                        current === key ? null : current,
                      )
                    }
                    onCardClick={zoomToTagTopic}
                    onMoveToTagsCloud={moveToTagsCloud}
                    onPrevHighlight={handlePrevTagHighlight}
                    onNextHighlight={handleNextTagHighlight}
                    translate={translate}
                    scale={scale}
                    isAnimating={isFocusingHighlight}
                  />
                )}

                {!showSummaryMode && showTopicTagsRail && (
                  <CanvasTopicTagsRail
                    topicTagsLayout={topicTagsLayout}
                    activeTopicKey={activeTopicTagsKey}
                    onCardEnter={setActiveTopicTagsKey}
                    onCardLeave={(key) =>
                      setActiveTopicTagsKey((current) =>
                        current === key ? null : current,
                      )
                    }
                    onCardClick={zoomToTopicTags}
                    onLoadMore={handleLoadMoreTopicTags}
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
          showTagsCloud={showTagsCloud}
          onToggleTagsCloud={() => setShowTagsCloud((v) => !v)}
          showTopicTagsRail={showTopicTagsRail}
          onToggleTopicTagsRail={() => setShowTopicTagsRail((v) => !v)}
        />
      </div>

      <CanvasArticleTooltip
        tooltip={tooltip}
        containerRef={tooltipContainerRef}
        readTopics={readTopics}
        highlightedTopicNames={highlightedTopicNames}
        onToggleHighlight={toggleTopicHighlight}
        onToggleRead={toggleTopicRead}
        onShowSentences={handleShowTopicSentences}
        onHide={hideTooltip}
        submissionId={articleId}
      />

      {summaryModalTopic && (
        <TopicSentencesModal
          topic={summaryModalTopic}
          sentences={summaryModalTopic._sentences || submissionSentences}
          onClose={closeSummaryModal}
          onShowInArticle={(modalTopic) => {
            const normalized = buildTopicModalSelection(
              modalTopic,
              submissionTopics,
            );
            const topicName =
              normalized?.primaryTopicName ||
              normalized?.fullPath ||
              normalized?.displayName;
            setSummaryModalTopic(null);
            if (!topicName) return;
            setHighlightedTopicNames((prev) => {
              const next = new Set(prev);
              next.add(topicName);
              return next;
            });
            zoomToSummaryCard(topicName);
          }}
          markup={markup}
          allTopics={submissionTopics}
          readTopics={readTopics}
          onToggleRead={handleModalToggleRead}
        />
      )}

      <CanvasRightPanel
        show={showChat}
        newIndices={newIndices}
        articleId={articleId}
        chatId={activeChatId}
        chats={chats}
        isChatsLoading={isChatsLoading}
        chatsError={chatsError}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onNewChat={handleNewChat}
        onChatPersisted={handleChatPersisted}
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
        onSelectEvent={handleManualSelectEvent}
        onGoLive={handleGoLive}
        onDeleteEvent={handleDeleteEvent}
      />
    </div>
  );
}
