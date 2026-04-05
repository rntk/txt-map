import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import TopicList from "./TopicList";
import TextDisplay from "./TextDisplay";
import ReadProgress from "./ReadProgress";
import GroupedByTopicsView from "./GroupedByTopicsView";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import TextPageActionsPortal from "./TextPageActionsPortal";
import VisualizationPanels from "./VisualizationPanels";
import GlobalTopicsCompareView from "./GlobalTopicsCompareView";
import FullScreenGraph from "./FullScreenGraph";
import SummaryTimeline from "./SummaryTimeline";
import TextPageToolbar from "./TextPageToolbar";
import ArticleTabHeader from "./ArticleTabHeader";
import ArticleSummaryView from "./ArticleSummaryView";
import ArticleMarkupView from "./ArticleMarkupView";
import RawTextView from "./RawTextView";
import WordSelectionPopup from "./WordSelectionPopup";
import ArticleMinimap from "./grid/ArticleMinimap";
import TopicsMetaPanel from "./TopicsMetaPanel";
import { useSubmission } from "../hooks/useSubmission";
import { useTopicNavigation } from "../hooks/useTopicNavigation";
import { useTextSelection } from "../hooks/useTextSelection";
import { getTopicSelectionKey } from "../utils/chartConstants";
import { useTextPageData } from "../hooks/useTextPageData";
import { getTopicHighlightColor } from "../utils/topicColorUtils";
import "../styles/text-reading.css";

const FULLSCREEN_TABS = [
  { key: "topic_summary_timeline", label: "Topic Summaries" },
  { key: "insights", label: "Insights" },
  { key: "topics", label: "Topics" },
  { key: "topics_river", label: "Topics River" },
  { key: "gantt_chart", label: "Gantt Chart" },
  { key: "marimekko", label: "Marimekko" },
  { key: "mindmap", label: "Mindmap" },
  { key: "prefix_tree", label: "Prefix Tree" },
  { key: "tags_cloud", label: "Tags Cloud" },
  { key: "circular_packing", label: "Circles" },
  { key: "venn_chart", label: "Venn Diagram" },
  { key: "radar_chart", label: "Radar Chart" },
  { key: "grid_view", label: "Grid View" },
  { key: "article_structure", label: "Article Structure" },
  { key: "treemap", label: "Treemap" },
];

function TextPage() {
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [activeTab, setActiveTab] = useState("article");
  const [sidebarTab, setSidebarTab] = useState("topics");
  const [groupedByTopics, setGroupedByTopics] = useState(false);
  const [tooltipEnabled, setTooltipEnabled] = useState(true);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showTopicsMeta, setShowTopicsMeta] = useState(false);
  const [highlightedGroupedTopic, setHighlightedGroupedTopic] = useState(null);
  useEffect(() => {
    if (
      highlightedGroupedTopic &&
      !selectedTopics.some((t) => t.name === highlightedGroupedTopic)
    ) {
      setHighlightedGroupedTopic(null);
    }
  }, [selectedTopics, highlightedGroupedTopic]);
  const [summaryModalTopic, setSummaryModalTopic] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [panelTopic, setPanelTopic] = useState(null);
  const [fullscreenGraph, setFullscreenGraph] = useState(null);
  const [compareTopicData, setCompareTopicData] = useState(null);
  const [highlightAllTopics, setHighlightAllTopics] = useState(false);
  const [highlightInsightTopics, setHighlightInsightTopics] = useState(false);
  const [activeInsightId, setActiveInsightId] = useState(null);
  const [activeInsightSentenceIndices, setActiveInsightSentenceIndices] =
    useState([]);
  const [activeInsightRanges, setActiveInsightRanges] = useState([]);
  const [focusedSummaryTopicName, setFocusedSummaryTopicName] = useState(null);
  const pendingMinimapSentenceRef = useRef(null);
  const pendingSummaryTopicRef = useRef(null);
  const rightColumnRef = useRef(null);

  const toggleHighlightAll = useCallback(() => {
    setHighlightAllTopics((prev) => !prev);
  }, []);

  const toggleHighlightInsightTopics = useCallback(() => {
    setHighlightInsightTopics((prev) => !prev);
  }, []);

  const clearActiveInsight = useCallback(() => {
    setActiveInsightId(null);
    setActiveInsightSentenceIndices([]);
    setActiveInsightRanges([]);
  }, []);

  const closeFullscreenGraph = useCallback(() => {
    setFullscreenGraph(null);
    setActiveTab("article");
    setFocusedSummaryTopicName(null);
    pendingSummaryTopicRef.current = null;
  }, []);

  const handleTabClick = useCallback((tabKey) => {
    const isFullscreen = FULLSCREEN_TABS.some((t) => t.key === tabKey);
    setActiveTab(tabKey);
    setFullscreenGraph(isFullscreen ? tabKey : null);
    if (tabKey !== "topic_summary_timeline") {
      setFocusedSummaryTopicName(null);
      pendingSummaryTopicRef.current = null;
    }
  }, []);

  const submissionId = window.location.pathname.split("/")[3];

  const {
    submission,
    loading,
    error,
    fetchSubmission,
    readTopics,
    toggleRead,
    toggleReadAll: toggleReadAllBase,
  } = useSubmission(submissionId);

  const { selectionData } = useTextSelection();

  const {
    safeTopics: _safeTopics,
    rawText: _rawText,
    articleSummaryText,
    articleSummaryBullets,
    topicSummaryParaMap: _topicSummaryParaMap,
    allTopics,
    insightNavItems,
    insightTopicNameSet,
    rawTextHighlightRanges,
    rawTextFadeRanges,
    highlightedSummaryParas,
    articles,
    insights,
    summaryTimelineItems,
    articleBulletMatches,
    articleTextMatches,
  } = useTextPageData(submission, selectedTopics, hoveredTopic, readTopics);

  const readProgressInfo = useMemo(() => {
    let total_count = 0;
    const read_indices = new Set();
    articles.forEach((article, aIdx) => {
      total_count += (article.sentences || []).length;
      (article.topics || []).forEach((topic) => {
        if (readTopics.has(topic.name)) {
          (topic.sentences || []).forEach((idx) =>
            read_indices.add(`${aIdx}-${idx}`),
          );
        }
      });
    });
    return { read_count: read_indices.size, total_count };
  }, [articles, readTopics]);

  const readPercentage =
    readProgressInfo.total_count > 0
      ? (readProgressInfo.read_count / readProgressInfo.total_count) * 100
      : 0;

  const { navigateTopicSentence } = useTopicNavigation({
    activeTab,
    rawText: _rawText,
    safeTopics: _safeTopics,
    groupedByTopics,
    selectedTopics,
    topicSummaryParaMap: _topicSummaryParaMap,
    setHighlightedGroupedTopic,
  });

  const toggleTopic = useCallback(
    (topic) => {
      clearActiveInsight();
      setSelectedTopics((prev) => {
        const isCurrentlySelected = prev.some((t) => t.name === topic.name);
        if (isCurrentlySelected) {
          setHoveredTopic(null);
        }
        return isCurrentlySelected
          ? prev.filter((t) => t.name !== topic.name)
          : [...prev, topic];
      });
    },
    [clearActiveInsight],
  );

  const handleHoverTopic = useCallback((topic) => {
    setHoveredTopic(topic);
  }, []);

  const toggleReadAll = useCallback(() => {
    if (!submission) return;
    const allTopicNames = (submission.results?.topics || [])
      .filter((t) => t?.name)
      .map((t) => t.name);
    toggleReadAllBase(allTopicNames);
  }, [submission, toggleReadAllBase]);

  const handleOpenTopicSentences = useCallback(
    (topicOrTopics) => {
      const results = submission?.results || {};
      const localSafeSentences = Array.isArray(results.sentences)
        ? results.sentences
        : [];

      if (Array.isArray(topicOrTopics)) {
        const topicNames = topicOrTopics.map((t) => t.name);
        const displayName = `${topicOrTopics[0].name.split(/[\s_>]/)[0]} Group (${topicOrTopics.length} topics)`;
        const relatedTopics = (submission?.results?.topics || []).filter((t) =>
          topicNames.includes(t.name),
        );
        const allIndices = new Set();
        const allRanges = [];
        relatedTopics.forEach((t) => {
          (t.sentences || []).forEach((idx) => allIndices.add(idx));
          if (t.ranges) {
            allRanges.push(...t.ranges);
          }
        });
        setSummaryModalTopic({
          name: displayName,
          displayName: displayName,
          fullPath: displayName,
          sentenceIndices: Array.from(allIndices).sort((a, b) => a - b),
          ranges: allRanges,
          _sentences: localSafeSentences,
        });
      } else {
        const fullTopic =
          (submission?.results?.topics || []).find(
            (t) => t.name === topicOrTopics.name,
          ) || topicOrTopics;
        setSummaryModalTopic({
          ...fullTopic,
          _sentences: localSafeSentences,
        });
      }
    },
    [submission?.results],
  );

  const handleSummaryClick = useCallback((mapping, article, topicName) => {
    if (mapping && mapping.source_sentences) {
      setSummaryModalTopic({
        name: topicName || "Source Sentences",
        displayName: topicName || "Source Sentences",
        fullPath: topicName || null,
        sentenceIndices: mapping.source_sentences,
        _summarySentence: mapping.summary_sentence,
        _sentences: article.sentences,
      });
    }
  }, []);

  const closeSummaryModal = useCallback(() => {
    setSummaryModalTopic(null);
  }, []);

  const handleShowTopicSentences = useCallback((topic) => {
    setSummaryModalTopic({
      name: topic.name,
      displayName: topic.name,
      fullPath: topic.name,
      sentenceIndices: topic.sentences || [],
      ranges: Array.isArray(topic.ranges) ? topic.ranges : [],
    });
  }, []);

  const pendingShowTopicRef = useRef(null);

  const handleShowInArticle = useCallback(
    (modalTopic) => {
      const topicName = modalTopic.fullPath || modalTopic.displayName;
      const matchedTopic = _safeTopics.find((t) => t.name === topicName);
      if (!matchedTopic) return;
      pendingShowTopicRef.current = matchedTopic;
      closeFullscreenGraph();
      setSelectedTopics((prev) =>
        prev.some((t) => t.name === matchedTopic.name)
          ? prev
          : [...prev, matchedTopic],
      );
    },
    [_safeTopics, closeFullscreenGraph],
  );

  useEffect(() => {
    if (!fullscreenGraph && pendingShowTopicRef.current) {
      const topic = pendingShowTopicRef.current;
      pendingShowTopicRef.current = null;
      const timer = setTimeout(() => {
        navigateTopicSentence(topic, "focus");
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [fullscreenGraph, navigateTopicSentence]);

  const handleOpenVisualization = useCallback(() => {
    handleTabClick("topics");
  }, [handleTabClick]);

  const focusedSummaryParas = useMemo(() => {
    if (!focusedSummaryTopicName) {
      return [];
    }

    return Array.isArray(_topicSummaryParaMap[focusedSummaryTopicName])
      ? _topicSummaryParaMap[focusedSummaryTopicName]
      : [];
  }, [_topicSummaryParaMap, focusedSummaryTopicName]);

  const effectiveHighlightedSummaryParas = useMemo(() => {
    if (focusedSummaryParas.length === 0) {
      return highlightedSummaryParas;
    }

    const merged = new Set(highlightedSummaryParas);
    focusedSummaryParas.forEach((index) => merged.add(index));
    return merged;
  }, [focusedSummaryParas, highlightedSummaryParas]);

  const handleOpenTopicSummaries = useCallback((topic) => {
    const topicName = typeof topic?.name === "string" ? topic.name : "";
    if (!topicName) {
      return;
    }

    pendingSummaryTopicRef.current = { name: topicName };
    setFocusedSummaryTopicName(topicName);
    setGroupedByTopics(false);
    setActiveTab("topic_summary_timeline");
    setFullscreenGraph("topic_summary_timeline");
  }, []);

  useEffect(() => {
    if (
      fullscreenGraph !== "topic_summary_timeline" ||
      activeTab !== "topic_summary_timeline" ||
      !pendingSummaryTopicRef.current ||
      focusedSummaryParas.length === 0
    ) {
      return undefined;
    }

    let cancelled = false;
    let attemptCount = 0;
    let timeoutId = null;

    const attemptScroll = () => {
      if (cancelled) {
        return;
      }

      attemptCount += 1;
      const pendingTopic = pendingSummaryTopicRef.current;
      if (!pendingTopic) {
        return;
      }

      const targetEl = document.getElementById(
        `summary-para-${focusedSummaryParas[0]}`,
      );
      if (targetEl) {
        pendingSummaryTopicRef.current = null;
        navigateTopicSentence(pendingTopic, "focus");
        return;
      }

      if (attemptCount >= 8) {
        pendingSummaryTopicRef.current = null;
        return;
      }

      timeoutId = window.setTimeout(attemptScroll, 120);
    };

    timeoutId = window.setTimeout(attemptScroll, 0);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeTab, focusedSummaryParas, fullscreenGraph, navigateTopicSentence]);

  const results = submission?.results || {};
  const safeSentences = useMemo(
    () => (Array.isArray(results.sentences) ? results.sentences : []),
    [results.sentences],
  );

  const handleCompareTopicRanges = useCallback(
    (topic) => {
      const ranges = topic.ranges;
      if (!Array.isArray(ranges) || ranges.length < 1) return;

      const topicsFormatted = allTopics.map((t) => ({
        name: t.name,
        sentences: t.sentences,
      }));

      const groups = ranges.map((range, idx) => {
        const indices = [];
        for (let i = range.sentence_start; i <= range.sentence_end; i++) {
          indices.push(i);
        }
        return {
          submission_id: `Range ${idx + 1}`,
          topic_name: topic.name,
          sentences: indices.map((i) => safeSentences[i - 1]).filter(Boolean),
          all_sentences: safeSentences,
          topics: topicsFormatted,
          indices,
        };
      });

      setCompareTopicData({ topic, groups });
    },
    [allTopics, safeSentences],
  );

  const safeTopics = _safeTopics;
  const rawText = _rawText;
  const coloredTopicNames = useMemo(() => {
    if (sidebarTab === "insights" && highlightInsightTopics) {
      return insightTopicNameSet;
    }
    return null;
  }, [highlightInsightTopics, insightTopicNameSet, sidebarTab]);

  // Colored ranges for raw text view (character-position based, one per topic)
  const rawTextColoredRanges = useMemo(() => {
    if (!highlightAllTopics && !highlightInsightTopics) return [];
    const ranges = [];
    safeTopics.forEach((topic) => {
      if (coloredTopicNames && !coloredTopicNames.has(topic.name)) {
        return;
      }
      const color = getTopicHighlightColor(topic.name);
      (Array.isArray(topic.ranges) ? topic.ranges : []).forEach((range) => {
        const start = Number(range.start);
        const end = Number(range.end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          ranges.push({ start, end, color });
        }
      });
    });
    return ranges;
  }, [
    coloredTopicNames,
    highlightAllTopics,
    highlightInsightTopics,
    safeTopics,
  ]);

  const activeInsight = useMemo(
    () =>
      insightNavItems.find((insight) => insight.id === activeInsightId) || null,
    [activeInsightId, insightNavItems],
  );
  const minimapVisible = useMemo(() => {
    const supportedTab =
      activeTab === "article" ||
      activeTab === "raw_text" ||
      activeTab === "markup";
    return (
      showMinimap && supportedTab && !groupedByTopics && articles.length > 0
    );
  }, [activeTab, articles.length, groupedByTopics, showMinimap]);

  const topicsMetaVisible = useMemo(() => {
    const supportedTab =
      activeTab === "article" ||
      activeTab === "raw_text" ||
      activeTab === "markup";
    return (
      showTopicsMeta && supportedTab && !groupedByTopics && articles.length > 0
    );
  }, [activeTab, articles.length, groupedByTopics, showTopicsMeta]);

  const minimapSentenceStates = useMemo(() => {
    const article = articles[0];
    const articleSentences = Array.isArray(article?.sentences)
      ? article.sentences
      : [];
    if (articleSentences.length === 0) {
      return [];
    }

    const sentenceCount = articleSentences.length;
    const states = Array.from({ length: sentenceCount }, () => null);
    const selectedTopicNames = new Set(
      selectedTopics.map((topic) => topic.name),
    );
    const insightSentenceIndexSet = new Set(
      activeInsightSentenceIndices
        .filter((value) => Number.isInteger(value))
        .map((value) => value - 1),
    );
    const shouldUseColorAllMode =
      highlightAllTopics ||
      (sidebarTab === "insights" && highlightInsightTopics);
    const activeTopicNames = shouldUseColorAllMode
      ? coloredTopicNames instanceof Set
        ? coloredTopicNames
        : null
      : null;

    safeTopics.forEach((topic) => {
      const sentenceIndices = Array.isArray(topic.sentences)
        ? topic.sentences
        : [];
      const isExplicitlyActive =
        selectedTopicNames.has(topic.name) || hoveredTopic?.name === topic.name;
      const isColorModeActive =
        shouldUseColorAllMode &&
        (!activeTopicNames || activeTopicNames.has(topic.name));
      const hasInsightSentence = sentenceIndices.some((sentenceIndex) =>
        insightSentenceIndexSet.has(sentenceIndex - 1),
      );
      const isActive =
        isExplicitlyActive || isColorModeActive || hasInsightSentence;

      if (!isActive) {
        return;
      }

      const color = getTopicHighlightColor(topic.name);
      sentenceIndices.forEach((sentenceIndex) => {
        const index = sentenceIndex - 1;
        if (index < 0 || index >= sentenceCount || states[index]) {
          return;
        }
        states[index] = { isActive: true, color };
      });
    });

    activeInsightSentenceIndices.forEach((sentenceIndex) => {
      const index = sentenceIndex - 1;
      if (index < 0 || index >= sentenceCount || states[index]) {
        return;
      }
      states[index] = { isActive: true, color: "rgba(255, 235, 153, 0.95)" };
    });

    return states;
  }, [
    activeInsightSentenceIndices,
    articles,
    coloredTopicNames,
    highlightAllTopics,
    highlightInsightTopics,
    hoveredTopic,
    safeTopics,
    selectedTopics,
    sidebarTab,
  ]);

  const scrollToInsight = useCallback(
    (insight) => {
      if (!insight) {
        return false;
      }

      const normalizeText = (value) =>
        String(value || "")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();

      const ranges = Array.isArray(insight.matchingRanges)
        ? insight.matchingRanges
        : [];
      const sortedRanges = [...ranges].sort(
        (left, right) => left.start - right.start,
      );

      if (sortedRanges.length > 0) {
        const firstRange = sortedRanges[0];
        const exactMatch = document.querySelector(
          `[data-char-start="${firstRange.start}"]`,
        );
        const rangeMatch =
          exactMatch ||
          Array.from(document.querySelectorAll("[data-char-start]"))
            .map((element) => ({
              element,
              charStart: Number(element.getAttribute("data-char-start")),
            }))
            .filter((entry) => Number.isFinite(entry.charStart))
            .sort((left, right) => left.charStart - right.charStart)
            .find((entry) => entry.charStart >= firstRange.start)?.element;

        if (rangeMatch) {
          rangeMatch.scrollIntoView({ behavior: "smooth", block: "center" });
          return true;
        }
      }

      const sentenceIndices = Array.isArray(insight.sourceSentenceIndices)
        ? insight.sourceSentenceIndices
        : [];
      if (sentenceIndices.length > 0) {
        for (const sentenceIndex of sentenceIndices) {
          const targetSentenceIndex = sentenceIndex - 1;
          const sentenceEl =
            document.getElementById(`sentence-0-${targetSentenceIndex}`) ||
            document.querySelector(
              `[data-sentence-index="${targetSentenceIndex}"]`,
            );

          if (sentenceEl) {
            sentenceEl.scrollIntoView({ behavior: "smooth", block: "center" });
            return true;
          }
        }
      }

      const sourceSentences = Array.isArray(insight.sourceSentences)
        ? insight.sourceSentences
        : [];
      const fallbackTexts = [
        ...sourceSentences,
        ...sentenceIndices
          .map((sentenceIndex) => safeSentences[sentenceIndex - 1])
          .filter(
            (sentence) => typeof sentence === "string" && sentence.trim(),
          ),
      ];

      const articleRoot = document.querySelector(".reading-article__content");
      if (!articleRoot) {
        return false;
      }

      const blockCandidates = Array.from(
        articleRoot.querySelectorAll(
          ".reading-article__sentence, p, li, blockquote, section, article, div",
        ),
      );

      const matchedBlock = fallbackTexts
        .map((text) => normalizeText(text))
        .filter(Boolean)
        .map((targetText) =>
          blockCandidates.find((element) => {
            const text = normalizeText(element.textContent);
            return text.includes(targetText) || targetText.includes(text);
          }),
        )
        .find(Boolean);

      if (matchedBlock instanceof HTMLElement) {
        matchedBlock.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }

      return false;
    },
    [safeSentences],
  );

  const scrollToArticleSentence = useCallback(
    (sentenceIndex) => {
      const targetSentenceIndex = Number(sentenceIndex);
      if (!Number.isInteger(targetSentenceIndex) || targetSentenceIndex < 0) {
        return false;
      }

      const normalizeText = (value) =>
        String(value || "")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();
      const targetSentenceText = safeSentences[targetSentenceIndex];
      const sentenceEl =
        document.getElementById(`sentence-0-${targetSentenceIndex}`) ||
        document.querySelector(
          `[data-sentence-index="${targetSentenceIndex}"]`,
        );

      const scrollContainer =
        rightColumnRef.current instanceof HTMLElement
          ? rightColumnRef.current
          : document.querySelector(".right-column");

      const scrollElementIntoContainerView = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }

        if (scrollContainer instanceof HTMLElement) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const targetRect = element.getBoundingClientRect();
          const scrollTop = scrollContainer.scrollTop;
          const nextTop =
            scrollTop +
            (targetRect.top - containerRect.top) -
            scrollContainer.clientHeight / 2 +
            targetRect.height / 2;

          if (typeof scrollContainer.scrollTo === "function") {
            scrollContainer.scrollTo({
              top: Math.max(0, nextTop),
              behavior: "smooth",
            });
          } else {
            scrollContainer.scrollTop = Math.max(0, nextTop);
          }
        }

        element.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      };

      if (scrollElementIntoContainerView(sentenceEl)) {
        return true;
      }

      const normalizedTargetSentence = normalizeText(targetSentenceText);
      if (!normalizedTargetSentence) {
        return false;
      }

      const articleRoot = document.querySelector(
        ".reading-article__content, .reading-markup__content",
      );
      if (!(articleRoot instanceof HTMLElement)) {
        return false;
      }

      const blockCandidates = Array.from(
        articleRoot.querySelectorAll(
          ".word-token, .reading-article__sentence, .markup-topic-block, .reading-markup__plain-sentence, p, li, blockquote, section, article, div",
        ),
      );

      const matchedBlock = blockCandidates.find((element) => {
        const text = normalizeText(element.textContent);
        return (
          text &&
          (text.includes(normalizedTargetSentence) ||
            normalizedTargetSentence.includes(text))
        );
      });

      return scrollElementIntoContainerView(matchedBlock);
    },
    [safeSentences],
  );

  const handleMinimapSentenceClick = useCallback(
    (sentenceIndex) => {
      if (activeTab === "article" && !fullscreenGraph && !groupedByTopics) {
        scrollToArticleSentence(sentenceIndex);
        return;
      }

      pendingMinimapSentenceRef.current = sentenceIndex;
      closeFullscreenGraph();
      setGroupedByTopics(false);
      setActiveTab("article");
    },
    [
      activeTab,
      closeFullscreenGraph,
      fullscreenGraph,
      groupedByTopics,
      scrollToArticleSentence,
    ],
  );

  const handleSidebarTabChange = useCallback(
    (tab) => {
      setSidebarTab(tab);
      if (tab === "topics") {
        clearActiveInsight();
        setHighlightInsightTopics(false);
      } else {
        setHighlightAllTopics(false);
      }
    },
    [clearActiveInsight],
  );

  const handleSelectInsight = useCallback(
    (insight) => {
      if (!insight) {
        return;
      }

      setGroupedByTopics(false);
      closeFullscreenGraph();
      setSidebarTab("insights");
      setActiveTab("article");
      setActiveInsightId(insight.id);
      setActiveInsightSentenceIndices(
        Array.isArray(insight.sourceSentenceIndices)
          ? insight.sourceSentenceIndices
          : [],
      );
      setActiveInsightRanges(
        Array.isArray(insight.matchingRanges) ? insight.matchingRanges : [],
      );
    },
    [closeFullscreenGraph],
  );

  const handleAnalyzeTopic = useCallback(
    (topic) => {
      if (!topic || !submissionId) {
        return;
      }
      const topicParam = encodeURIComponent(topic.name);
      window.location.href = `/page/topic-analysis/${submissionId}?topic=${topicParam}`;
    },
    [submissionId],
  );

  useEffect(() => {
    if (
      !activeInsight ||
      activeTab !== "article" ||
      groupedByTopics ||
      fullscreenGraph
    ) {
      return undefined;
    }

    let cancelled = false;
    let attemptCount = 0;
    let timeoutId = null;

    const attemptScroll = () => {
      if (cancelled) {
        return;
      }
      attemptCount += 1;
      if (scrollToInsight(activeInsight) || attemptCount >= 8) {
        return;
      }
      timeoutId = window.setTimeout(attemptScroll, 120);
    };

    timeoutId = window.setTimeout(attemptScroll, 0);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    activeInsight,
    activeTab,
    fullscreenGraph,
    groupedByTopics,
    scrollToInsight,
  ]);

  useEffect(() => {
    if (
      activeTab !== "article" ||
      groupedByTopics ||
      fullscreenGraph ||
      pendingMinimapSentenceRef.current === null
    ) {
      return undefined;
    }

    let cancelled = false;
    let attemptCount = 0;
    let timeoutId = null;

    const attemptScroll = () => {
      if (cancelled) {
        return;
      }
      attemptCount += 1;
      const sentenceIndex = pendingMinimapSentenceRef.current;
      if (scrollToArticleSentence(sentenceIndex)) {
        pendingMinimapSentenceRef.current = null;
        return;
      }
      if (attemptCount >= 8) {
        pendingMinimapSentenceRef.current = null;
        return;
      }
      timeoutId = window.setTimeout(attemptScroll, 120);
    };

    timeoutId = window.setTimeout(attemptScroll, 0);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeTab, fullscreenGraph, groupedByTopics, scrollToArticleSentence]);

  if (loading) {
    return (
      <div className="reading-state">
        <h2 className="reading-state__title">Loading submission...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reading-state">
        <h2 className="reading-state__title reading-state__title--error">
          Error: {error}
        </h2>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="reading-state">
        <h2 className="reading-state__title">No submission data</h2>
      </div>
    );
  }

  const { status } = submission;
  const isProcessing =
    status.overall === "processing" || status.overall === "pending";
  return (
    <div className="app reading-page">
      <TextPageActionsPortal>
        <TextPageToolbar
          submissionId={submissionId}
          status={status}
          onRefresh={fetchSubmission}
          visualizationTabs={articles.length > 0 ? FULLSCREEN_TABS : []}
          onTabClick={handleTabClick}
        />
      </TextPageActionsPortal>

      {isProcessing && (
        <div className="reading-page__toolbar-stack">
          <div className="reading-page__status-banner reading-page__status-banner--processing">
            <strong>Processing in progress...</strong> Results will appear as
            tasks complete.
          </div>
        </div>
      )}

      {articles.length > 0 ? (
        <>
          <div className="container reading-page__content reading-page__workspace">
            <div className="left-column">
              <TopicList
                topics={allTopics}
                insights={insightNavItems}
                sidebarTab={sidebarTab}
                selectedTopics={selectedTopics}
                hoveredTopic={hoveredTopic}
                onToggleTopic={toggleTopic}
                onHoverTopic={handleHoverTopic}
                readTopics={readTopics}
                onToggleRead={toggleRead}
                onShowTopicSentences={handleOpenTopicSentences}
                onNavigateTopic={navigateTopicSentence}
                onToggleReadAll={toggleReadAll}
                onOpenVisualization={handleOpenVisualization}
                onCompareTopicRanges={handleCompareTopicRanges}
                onAnalyzeTopic={handleAnalyzeTopic}
                highlightAllTopics={highlightAllTopics}
                onToggleHighlightAll={toggleHighlightAll}
                onSidebarTabChange={handleSidebarTabChange}
                activeInsightId={activeInsightId}
                onSelectInsight={handleSelectInsight}
                highlightInsightTopics={highlightInsightTopics}
                onToggleHighlightInsightTopics={toggleHighlightInsightTopics}
              />
            </div>
            <div className="right-column" ref={rightColumnRef}>
              <div className="article-section">
                <ArticleTabHeader
                  activeTab={activeTab}
                  onTabClick={handleTabClick}
                  groupedByTopics={groupedByTopics}
                  onToggleGrouped={() => setGroupedByTopics((prev) => !prev)}
                  tooltipEnabled={tooltipEnabled}
                  onToggleTooltip={() => setTooltipEnabled((prev) => !prev)}
                  showMinimap={showMinimap}
                  onToggleMinimap={() => setShowMinimap((prev) => !prev)}
                  showTopicsMeta={showTopicsMeta}
                  onToggleTopicsMeta={() => setShowTopicsMeta((prev) => !prev)}
                  sourceUrl={submission.source_url}
                  readPercentage={readPercentage}
                />

                <div
                  className={`article-body${minimapVisible ? " reading-page__article-body--with-minimap" : ""}${topicsMetaVisible ? " reading-page__article-body--with-topics-meta" : ""}`}
                >
                  <div className="reading-page__article-main">
                    {activeTab === "article_summary" ? (
                      <ArticleSummaryView
                        articleSummaryText={articleSummaryText}
                        articleSummaryBullets={articleSummaryBullets}
                        articleBulletMatches={articleBulletMatches}
                        articleTextMatches={articleTextMatches}
                        selectedTopics={selectedTopics}
                        onToggleTopic={toggleTopic}
                        onShowTopicSentences={handleShowTopicSentences}
                      />
                    ) : activeTab === "markup" ? (
                      <ArticleMarkupView
                        safeSentences={safeSentences}
                        safeTopics={safeTopics}
                        markup={submission?.results?.markup}
                        selectedTopics={selectedTopics}
                        readTopics={readTopics}
                        onToggleRead={toggleRead}
                        onToggleTopic={toggleTopic}
                        onNavigateTopic={navigateTopicSentence}
                        onShowSentences={handleShowTopicSentences}
                        onOpenTopicSummaries={handleOpenTopicSummaries}
                        tooltipEnabled={tooltipEnabled}
                        coloredHighlightMode={
                          highlightAllTopics || highlightInsightTopics
                        }
                        coloredTopicNames={coloredTopicNames}
                      />
                    ) : groupedByTopics ? (
                      <GroupedByTopicsView
                        topics={safeTopics}
                        rawHtml={articles[0]?.raw_html || ""}
                        sentences={articles[0]?.sentences || []}
                        isRawTextMode={activeTab === "raw_text"}
                        highlightedTopicName={highlightedGroupedTopic}
                      />
                    ) : activeTab === "raw_text" ? (
                      <RawTextView
                        rawText={rawText}
                        submissionId={submissionId}
                        sourceUrl={submission.source_url}
                        highlightRanges={rawTextHighlightRanges}
                        fadeRanges={rawTextFadeRanges}
                        coloredRanges={rawTextColoredRanges}
                      />
                    ) : (
                      articles.map((article, index) =>
                        article.sentences.length === 0 ? (
                          <div
                            key={index}
                            className="article-section"
                            dangerouslySetInnerHTML={{
                              __html: (() => {
                                const m = article.raw_html.match(
                                  /<body[^>]*>([\s\S]*?)<\/body>/i,
                                );
                                return m ? m[1] : article.raw_html;
                              })(),
                            }}
                          />
                        ) : (
                          <TextDisplay
                            key={index}
                            sentences={article.sentences}
                            selectedTopics={selectedTopics}
                            hoveredTopic={hoveredTopic}
                            readTopics={readTopics}
                            articleTopics={article.topics}
                            articleIndex={index}
                            topicSummaries={article.topic_summaries}
                            paragraphMap={article.paragraph_map}
                            rawHtml={article.raw_html}
                            markerWordIndices={article.marker_word_indices}
                            onToggleRead={toggleRead}
                            onToggleTopic={toggleTopic}
                            onNavigateTopic={navigateTopicSentence}
                            onShowSentences={handleShowTopicSentences}
                            onOpenTopicSummaries={handleOpenTopicSummaries}
                            tooltipEnabled={tooltipEnabled}
                            submissionId={submissionId}
                            coloredHighlightMode={
                              highlightAllTopics || highlightInsightTopics
                            }
                            activeInsightSentenceIndices={
                              activeInsightSentenceIndices
                            }
                            activeInsightRanges={activeInsightRanges}
                            coloredTopicNames={coloredTopicNames}
                          />
                        ),
                      )
                    )}
                  </div>
                  {topicsMetaVisible && (
                    <TopicsMetaPanel
                      submissionId={submissionId}
                      selectedTopicName={
                        selectedTopics.length > 0
                          ? selectedTopics[0].name
                          : null
                      }
                    />
                  )}
                  {minimapVisible && (
                    <aside
                      className="reading-page__minimap-panel"
                      aria-label="Article minimap panel"
                    >
                      <div className="reading-page__minimap-header">
                        <div className="reading-page__minimap-title">
                          Article Minimap
                        </div>
                        <div className="reading-page__minimap-subtitle">
                          {minimapSentenceStates.filter(Boolean).length} active
                          sentences
                        </div>
                      </div>
                      <ArticleMinimap
                        sentences={articles[0]?.sentences || []}
                        sentenceStates={minimapSentenceStates}
                        onSentenceClick={handleMinimapSentenceClick}
                      />
                    </aside>
                  )}
                </div>
              </div>
            </div>
          </div>

          {fullscreenGraph === "topic_summary_timeline" && (
            <SummaryTimeline
              mode="summary"
              title="Topic Summaries"
              summaryTimelineItems={summaryTimelineItems}
              highlightedSummaryParas={effectiveHighlightedSummaryParas}
              summaryModalTopic={summaryModalTopic}
              closeSummaryModal={closeSummaryModal}
              handleSummaryClick={handleSummaryClick}
              articles={articles}
              onClose={closeFullscreenGraph}
              onShowInArticle={handleShowInArticle}
              readTopics={readTopics}
              onToggleRead={toggleRead}
              markup={submission?.results?.markup}
            />
          )}

          {fullscreenGraph === "insights" && (
            <SummaryTimeline
              mode="insights"
              title="Insights"
              insights={insights}
              sentences={safeSentences}
              highlightedSummaryParas={new Set()}
              summaryModalTopic={null}
              closeSummaryModal={closeSummaryModal}
              handleSummaryClick={handleSummaryClick}
              articles={articles}
              onClose={closeFullscreenGraph}
              onShowInArticle={handleShowInArticle}
              readTopics={readTopics}
              onToggleRead={toggleRead}
              markup={submission?.results?.markup}
            />
          )}

          <VisualizationPanels
            fullscreenGraph={fullscreenGraph}
            onClose={closeFullscreenGraph}
            safeTopics={safeTopics}
            safeSentences={safeSentences}
            results={results}
            submissionId={submissionId}
            allTopics={allTopics}
            onShowInArticle={handleShowInArticle}
            readTopics={readTopics}
            onToggleRead={toggleRead}
            markup={submission?.results?.markup}
          />
        </>
      ) : (
        <div className="reading-state">
          <p className="reading-state__message">
            No results yet. Processing is in progress...
          </p>
        </div>
      )}

      {!fullscreenGraph && summaryModalTopic && (
        <TopicSentencesModal
          topic={summaryModalTopic}
          sentences={summaryModalTopic._sentences || safeSentences}
          onClose={closeSummaryModal}
          markup={submission?.results?.markup}
          readTopics={readTopics}
          onToggleRead={toggleRead}
        />
      )}

      {compareTopicData && (
        <FullScreenGraph
          title={`Compare Ranges: ${compareTopicData.topic.name}`}
          onClose={() => setCompareTopicData(null)}
        >
          <GlobalTopicsCompareView
            groups={compareTopicData.groups}
            groupRefs={{ current: {} }}
          />
        </FullScreenGraph>
      )}

      <WordSelectionPopup
        selectionData={selectionData}
        submissionId={submissionId}
      />
    </div>
  );
}

export default TextPage;
