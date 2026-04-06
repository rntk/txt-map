import React, { useState, useEffect, useRef, useCallback } from "react";
import TopicList from "./TopicList";
import GlobalTopicsClassicView from "./GlobalTopicsClassicView";
import GlobalTopicsTimelineView from "./GlobalTopicsTimelineView";
import GlobalTopicsCompareView from "./GlobalTopicsCompareView";
import GlobalVisualizationPanels from "./GlobalVisualizationPanels";
import { useGlobalChartData } from "../hooks/useGlobalChartData";
import "../styles/GlobalTopics.css";

const EMPTY_READ_TOPICS = new Set();
const NOOP = () => {};

const FULLSCREEN_TABS = [
  { key: "topics", label: "Topics" },
  { key: "mindmap", label: "Mindmap" },
  { key: "circular_packing", label: "Circles" },
  { key: "radar_chart", label: "Radar Chart" },
  { key: "venn", label: "Venn Diagram" },
  { key: "grid_view", label: "Grid View" },
  { key: "dataset_structure", label: "Dataset Structure" },
  { key: "treemap", label: "Treemap" },
];

function GlobalTopicsPage() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sentencesLoading, setSentencesLoading] = useState(false);
  const [activeView, setActiveView] = useState("classic");
  const [fullscreenGraph, setFullscreenGraph] = useState(null);
  const [allTopicSentences, setAllTopicSentences] = useState(null);
  const [chartSentencesFetched, setChartSentencesFetched] = useState(false);
  const groupRefs = useRef({});

  const { chartTopics, chartSentences, allTopics, mindmapData } =
    useGlobalChartData(topics, allTopicSentences);

  const handleTabClick = useCallback((key) => {
    setFullscreenGraph(key);
  }, []);

  const closeFullscreenGraph = useCallback(() => {
    setFullscreenGraph(null);
  }, []);

  // Fetch real sentences for all topics the first time a chart panel opens
  useEffect(() => {
    if (!fullscreenGraph || chartSentencesFetched || topics.length === 0)
      return;
    setChartSentencesFetched(true);
    const params = topics
      .map((t) => `topic_name=${encodeURIComponent(t.name)}`)
      .join("&");
    fetch(`/api/global-topics/sentences?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const byTopic = {};
        for (const group of data.groups || []) {
          if (!byTopic[group.topic_name]) byTopic[group.topic_name] = [];
          byTopic[group.topic_name].push(...group.sentences);
        }
        setAllTopicSentences(byTopic);
      })
      .catch(() => {});
  }, [fullscreenGraph, chartSentencesFetched, topics]);

  useEffect(() => {
    fetch("/api/global-topics", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const transformed = (data.topics || []).map((t) => ({
          name: t.name,
          totalSentences: t.total_sentences,
          source_count: t.source_count,
          sources: t.sources,
        }));
        setTopics(transformed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedTopics.length === 0) {
      setGroups([]);
      return;
    }
    setSentencesLoading(true);
    const params = selectedTopics
      .map((t) => `topic_name=${encodeURIComponent(t.name)}`)
      .join("&");
    const includeContext =
      activeView === "compare" ? "&include_context=true" : "";
    fetch(`/api/global-topics/sentences?${params}${includeContext}`)
      .then((r) => r.json())
      .then((data) => setGroups(data.groups || []))
      .catch(() => setGroups([]))
      .finally(() => setSentencesLoading(false));
  }, [selectedTopics, activeView]);

  const handleToggleTopic = (topic) => {
    setSelectedTopics((prev) => {
      const exists = prev.some((t) => t.name === topic.name);
      return exists
        ? prev.filter((t) => t.name !== topic.name)
        : [...prev, topic];
    });
  };

  const handleNavigateTopic = (topic) => {
    const key = topic.name;
    const el = groupRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="container global-topics-page">
      <div className="left-column global-topics-sidebar">
        {loading ? (
          <div className="global-topics-status global-topics-status--loading">
            Loading topics...
          </div>
        ) : (
          <TopicList
            topics={topics}
            selectedTopics={selectedTopics}
            onToggleTopic={handleToggleTopic}
            onNavigateTopic={handleNavigateTopic}
            readTopics={EMPTY_READ_TOPICS}
            onToggleRead={NOOP}
            onToggleReadAll={NOOP}
          />
        )}
      </div>
      <div className="right-column global-topics-workspace">
        <div className="article-header-sticky global-topics-toolbar">
          <div
            className="global-menu-links global-topics-view-switcher"
            role="tablist"
            aria-label="Global topics views"
          >
            <button
              type="button"
              className={`global-menu-link global-topics-view-switcher__button${activeView === "classic" ? " active global-topics-view-switcher__button--active" : ""}`}
              aria-pressed={activeView === "classic"}
              onClick={() => setActiveView("classic")}
            >
              Classic
            </button>
            <button
              type="button"
              className={`global-menu-link global-topics-view-switcher__button${activeView === "timeline" ? " active global-topics-view-switcher__button--active" : ""}`}
              aria-pressed={activeView === "timeline"}
              onClick={() => setActiveView("timeline")}
            >
              Timeline
            </button>
            <button
              type="button"
              className={`global-menu-link global-topics-view-switcher__button${activeView === "compare" ? " active global-topics-view-switcher__button--active" : ""}`}
              aria-pressed={activeView === "compare"}
              onClick={() => setActiveView("compare")}
            >
              Compare
            </button>
          </div>
          {topics.length > 0 && (
            <div className="tab-bar global-topics-toolbar__tabs">
              <div className="tab-group">
                <span className="tab-group-label">Visualizations</span>
                <div className="tabs">
                  {FULLSCREEN_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={fullscreenGraph === tab.key ? "active" : ""}
                      aria-pressed={fullscreenGraph === tab.key}
                      onClick={() => handleTabClick(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {selectedTopics.length === 0 && (
          <div className="global-topics-empty-state">
            Select one or more topics to see sentences from all sources.
          </div>
        )}
        {sentencesLoading && (
          <div className="global-topics-status">Loading sentences...</div>
        )}
        {!sentencesLoading &&
          groups.length === 0 &&
          selectedTopics.length > 0 && (
            <div className="global-topics-empty-state">No sentences found.</div>
          )}
        {!sentencesLoading && activeView === "classic" && (
          <GlobalTopicsClassicView groups={groups} groupRefs={groupRefs} />
        )}
        {!sentencesLoading && activeView === "timeline" && (
          <GlobalTopicsTimelineView groups={groups} groupRefs={groupRefs} />
        )}
        {!sentencesLoading && activeView === "compare" && (
          <GlobalTopicsCompareView groups={groups} groupRefs={groupRefs} />
        )}
      </div>
      {fullscreenGraph && (
        <GlobalVisualizationPanels
          fullscreenGraph={fullscreenGraph}
          onClose={closeFullscreenGraph}
          chartTopics={chartTopics}
          chartSentences={chartSentences}
          allTopics={allTopics}
          mindmapData={mindmapData}
        />
      )}
    </div>
  );
}

export default GlobalTopicsPage;
