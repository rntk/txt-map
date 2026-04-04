import React, { useState, useMemo, useCallback } from "react";
import {
  buildTopicTree,
  getSubtreeStats as getSubtreeStatsUtil,
} from "../utils/topicTree";
import TopicTreeNode from "./TopicTreeNode";
import { getTopicSelectionKey } from "../utils/chartConstants";
import {
  getTopicCSSClass,
  getTopicHighlightColor,
} from "../utils/topicColorUtils";
import "./TopicNavigation.css";

/**
 * @typedef {Object} TopicListTopic
 * @property {string} name
 * @property {number} [totalSentences]
 * @property {Array<unknown>} [ranges]
 */

/**
 * @typedef {Object} TopicTreeNodeEntry
 * @property {{ name: string, fullPath: string, isLeaf: boolean, topic: TopicListTopic | null }} node
 * @property {Map<string, TopicTreeNodeEntry>} children
 */

/**
 * @typedef {Object} TopicListProps
 * @property {Array<TopicListTopic>} [topics]
 * @property {Array<TopicListTopic>} [selectedTopics]
 * @property {Array<InsightListItem>} [insights]
 * @property {'topics' | 'insights'} [sidebarTab]
 * @property {(topic: TopicListTopic) => void} [onToggleTopic]
 * @property {(topic: TopicListTopic) => void} [onHoverTopic]
 * @property {Set<string> | Iterable<string>} [readTopics]
 * @property {(topic: TopicListTopic) => void} [onToggleRead]
 * @property {(topic: TopicListTopic | Array<TopicListTopic>) => void} [onShowTopicSentences]
 * @property {(topic: TopicListTopic, mode: 'focus' | 'prev' | 'next') => void} [onNavigateTopic]
 * @property {() => void} [onToggleReadAll]
 * @property {() => void} [onOpenVisualization]
 * @property {boolean} [highlightAllTopics]
 * @property {() => void} [onToggleHighlightAll]
 * @property {(tab: 'topics' | 'insights') => void} [onSidebarTabChange]
 * @property {string | null} [activeInsightId]
 * @property {(insight: InsightListItem) => void} [onSelectInsight]
 * @property {boolean} [highlightInsightTopics]
 * @property {() => void} [onToggleHighlightInsightTopics]
 * @property {(topic: TopicListTopic) => void} [onCompareTopicRanges]
 * @property {(topic: TopicListTopic) => void} [onAnalyzeTopic]
 */

/**
 * @typedef {Object} InsightListItem
 * @property {string} id
 * @property {string} name
 * @property {number} [firstSentenceIndex]
 * @property {Array<number>} [sourceSentenceIndices]
 * @property {Array<string>} [sourceSentences]
 * @property {Array<string>} [topicNames]
 */

/**
 * Render the topic sidebar list using shared topic-navigation chrome.
 *
 * @param {TopicListProps} props
 * @returns {React.ReactElement}
 */
function TopicList({
  topics = [],
  selectedTopics = [],
  insights = [],
  sidebarTab = "topics",
  onToggleTopic = () => {},
  onHoverTopic: _onHoverTopic = () => {},
  readTopics = new Set(),
  onToggleRead = () => {},
  onShowTopicSentences = () => {},
  onNavigateTopic,
  onToggleReadAll = () => {},
  onOpenVisualization,
  highlightAllTopics = false,
  onToggleHighlightAll = () => {},
  onSidebarTabChange = () => {},
  activeInsightId = null,
  onSelectInsight = () => {},
  highlightInsightTopics = false,
  onToggleHighlightInsightTopics = () => {},
  onCompareTopicRanges,
  onAnalyzeTopic,
}) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [insightSearchQuery, setInsightSearchQuery] = useState("");
  const [activeActionMenuPath, setActiveActionMenuPath] = useState(null);

  const safeSelectedTopics = useMemo(
    () => (Array.isArray(selectedTopics) ? selectedTopics : []),
    [selectedTopics],
  );
  const safeReadTopics = useMemo(
    () => (readTopics instanceof Set ? readTopics : new Set(readTopics || [])),
    [readTopics],
  );
  const safeInsights = useMemo(
    () => (Array.isArray(insights) ? insights : []),
    [insights],
  );
  const hasInsights = safeInsights.length > 0;
  const currentSidebarTab = hasInsights ? sidebarTab : "topics";

  const topicTree = useMemo(() => buildTopicTree(topics), [topics]);
  const getSubtreeStats = useCallback(
    (treeNode) => getSubtreeStatsUtil(treeNode),
    [],
  );

  const selectedNamesSet = useMemo(
    () => new Set(safeSelectedTopics.map((topic) => topic.name)),
    [safeSelectedTopics],
  );

  const subtreeStateMap = useMemo(() => {
    const map = new Map();

    const compute = (node) => {
      if (node.node.isLeaf && node.node.topic) {
        const name = node.node.topic.name;
        const hasSelected = selectedNamesSet.has(name);
        const allRead = safeReadTopics.has(name);
        const entry = { hasSelected, allRead, hasLeaves: true };
        map.set(node.node.fullPath, entry);
        return entry;
      }

      let hasSelected = false;
      let allRead = true;
      let hasLeaves = false;

      node.children.forEach((child) => {
        const childEntry = compute(child);
        if (childEntry.hasSelected) hasSelected = true;
        if (!childEntry.allRead || !childEntry.hasLeaves) allRead = false;
        if (childEntry.hasLeaves) hasLeaves = true;
      });

      const entry = { hasSelected, allRead: hasLeaves && allRead, hasLeaves };
      map.set(node.node.fullPath, entry);
      return entry;
    };

    topicTree.forEach((root) => compute(root));
    return map;
  }, [topicTree, selectedNamesSet, safeReadTopics]);

  const isSubtreeSelected = useCallback(
    (treeNode) =>
      subtreeStateMap.get(treeNode.node.fullPath)?.hasSelected ?? false,
    [subtreeStateMap],
  );

  const isSubtreeRead = useCallback(
    (treeNode) => {
      const entry = subtreeStateMap.get(treeNode.node.fullPath);
      return entry ? entry.hasLeaves && entry.allRead : false;
    },
    [subtreeStateMap],
  );

  const toggleAllInSubtree = useCallback(
    (treeNode) => {
      const allSelected = isSubtreeSelected(treeNode);
      const shouldNavigateToFirstLeaf = !allSelected;

      const traverse = (node) => {
        if (node.node.isLeaf && node.node.topic) {
          const isSelected = safeSelectedTopics.some(
            (topic) => topic.name === node.node.topic.name,
          );
          if (allSelected && isSelected) {
            onToggleTopic(node.node.topic);
          } else if (!allSelected && !isSelected) {
            onToggleTopic(node.node.topic);
          }
        }
        node.children.forEach((child) => traverse(child));
      };

      traverse(treeNode);

      const findFirstLeaf = (node) => {
        if (node.node.isLeaf && node.node.topic) {
          return node.node.topic;
        }
        for (const child of node.children.values()) {
          const found = findFirstLeaf(child);
          if (found) return found;
        }
        return null;
      };

      const firstLeaf = findFirstLeaf(treeNode);
      if (shouldNavigateToFirstLeaf && onNavigateTopic && firstLeaf) {
        onNavigateTopic(firstLeaf, "focus");
      }
    },
    [safeSelectedTopics, onToggleTopic, onNavigateTopic, isSubtreeSelected],
  );

  const toggleReadInSubtree = useCallback(
    (treeNode) => {
      const allRead = isSubtreeRead(treeNode);

      const hasSplitRanges = (() => {
        let found = false;
        const check = (node) => {
          if (node.node.isLeaf && node.node.topic) {
            const ranges = node.node.topic.ranges;
            if (Array.isArray(ranges) && ranges.length > 1) found = true;
          }
          if (!found) node.children.forEach((child) => check(child));
        };
        check(treeNode);
        return found;
      })();

      if (hasSplitRanges) {
        const action = allRead ? "unread" : "read";
        const ok = window.confirm(
          `Some topics in this group have multiple separate ranges. Mark all as ${action}?`,
        );
        if (!ok) return;
      }

      const traverse = (node) => {
        if (node.node.isLeaf && node.node.topic) {
          const isRead = safeReadTopics.has(node.node.topic.name);
          if (allRead && isRead) {
            onToggleRead(node.node.topic);
          } else if (!allRead && !isRead) {
            onToggleRead(node.node.topic);
          }
        }
        node.children.forEach((child) => traverse(child));
      };

      traverse(treeNode);

      const findFirstLeaf = (node) => {
        if (node.node.isLeaf && node.node.topic) {
          return node.node.topic;
        }
        for (const child of node.children.values()) {
          const found = findFirstLeaf(child);
          if (found) return found;
        }
        return null;
      };

      const firstLeaf = findFirstLeaf(treeNode);
      if (onNavigateTopic && firstLeaf) {
        onNavigateTopic(firstLeaf, "focus");
      }
    },
    [safeReadTopics, onToggleRead, onNavigateTopic, isSubtreeRead],
  );

  const toggleNode = (path) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const getAllNonLeafPaths = useCallback(() => {
    const paths = new Set();
    const traverse = (treeNode) => {
      if (treeNode.children.size > 0) {
        paths.add(treeNode.node.fullPath);
        treeNode.children.forEach((child) => traverse(child));
      }
    };
    topicTree.forEach((root) => traverse(root));
    return paths;
  }, [topicTree]);

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return topicTree;
    const q = searchQuery.trim().toLowerCase();

    const filterNode = (treeNode) => {
      if (treeNode.node.isLeaf) {
        return treeNode.node.fullPath.toLowerCase().includes(q)
          ? treeNode
          : null;
      }
      const filteredChildren = new Map();
      treeNode.children.forEach((child, key) => {
        const filtered = filterNode(child);
        if (filtered) filteredChildren.set(key, filtered);
      });
      if (filteredChildren.size === 0) return null;
      return { ...treeNode, children: filteredChildren };
    };

    return topicTree.map(filterNode).filter(Boolean);
  }, [topicTree, searchQuery]);

  const filteredInsights = useMemo(() => {
    if (!insightSearchQuery.trim()) {
      return safeInsights;
    }

    const query = insightSearchQuery.trim().toLowerCase();
    return safeInsights.filter((insight) => {
      const haystacks = [
        insight.name,
        ...(Array.isArray(insight.topicNames) ? insight.topicNames : []),
        ...(Array.isArray(insight.sourceSentences)
          ? insight.sourceSentences
          : []),
      ];
      return haystacks.some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      );
    });
  }, [insightSearchQuery, safeInsights]);
  const insightTopicStyleSheet = useMemo(() => {
    if (!highlightInsightTopics) {
      return "";
    }

    const seen = new Set();
    const lines = [];
    safeInsights.forEach((insight) => {
      (Array.isArray(insight.topicNames) ? insight.topicNames : []).forEach(
        (topicName) => {
          const cssClass = getTopicCSSClass(topicName);
          if (seen.has(cssClass)) {
            return;
          }
          seen.add(cssClass);
          lines.push(
            `.${cssClass} { --topic-highlight-color: ${getTopicHighlightColor(topicName)}; }`,
          );
        },
      );
    });
    return lines.join("\n");
  }, [highlightInsightTopics, safeInsights]);

  const [allExpanded, setAllExpanded] = useState(false);

  const toggleExpandAll = useCallback(() => {
    setAllExpanded((prev) => {
      const nextState = !prev;
      setExpandedNodes(nextState ? getAllNonLeafPaths() : new Set());
      return nextState;
    });
  }, [getAllNonLeafPaths]);

  const allRead = useMemo(() => {
    const leaves = [];
    const collect = (treeNode) => {
      if (treeNode.node.isLeaf && treeNode.node.topic) {
        leaves.push(treeNode.node.topic.name);
      }
      treeNode.children.forEach((child) => collect(child));
    };
    topicTree.forEach((root) => collect(root));
    return (
      leaves.length > 0 && leaves.every((name) => safeReadTopics.has(name))
    );
  }, [topicTree, safeReadTopics]);

  const toggleActionMenu = useCallback((path) => {
    setActiveActionMenuPath((prev) => (prev === path ? null : path));
  }, []);

  const closeActionMenu = useCallback((path) => {
    setActiveActionMenuPath((prev) => (prev === path ? null : prev));
  }, []);

  const nodeProps = {
    searchQuery,
    expandedNodes,
    getSubtreeStats,
    isSubtreeSelected,
    isSubtreeRead,
    safeSelectedTopics,
    safeReadTopics,
    toggleNode,
    toggleAllInSubtree,
    toggleReadInSubtree,
    onToggleTopic,
    onToggleRead,
    onShowTopicSentences,
    onNavigateTopic,
    onOpenVisualization,
    highlightAllTopics,
    activeActionMenuPath,
    onToggleActionMenu: toggleActionMenu,
    onCloseActionMenu: closeActionMenu,
    onCompareTopicRanges,
    onAnalyzeTopic,
  };

  return (
    <>
      <div className="topic-nav-panel">
        <div
          className="topic-nav-sidebar-tabs"
          role="tablist"
          aria-label="Sidebar navigation tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={currentSidebarTab === "topics"}
            className={`topic-nav-sidebar-tab${currentSidebarTab === "topics" ? " topic-nav-sidebar-tab--active" : ""}`}
            onClick={() => onSidebarTabChange("topics")}
          >
            Topics ({topics.length})
          </button>
          {hasInsights && (
            <button
              type="button"
              role="tab"
              aria-selected={currentSidebarTab === "insights"}
              className={`topic-nav-sidebar-tab${currentSidebarTab === "insights" ? " topic-nav-sidebar-tab--active" : ""}`}
              onClick={() => onSidebarTabChange("insights")}
            >
              Insights ({safeInsights.length})
            </button>
          )}
        </div>
      </div>

      {currentSidebarTab === "topics" && topicTree.length > 0 && (
        <div className="topic-nav-panel">
          <div className="topic-nav-toolbar">
            <div className="topic-nav-toolbar__group">
              <button
                type="button"
                onClick={toggleExpandAll}
                className="topic-nav-button"
              >
                {allExpanded ? "Fold All" : "Unfold All"}
              </button>
              <button
                type="button"
                onClick={onToggleReadAll}
                className={`topic-nav-button${allRead ? " topic-nav-button--active" : ""}`}
              >
                {allRead ? "Unread All" : "Read All"}
              </button>
              <button
                type="button"
                onClick={onToggleHighlightAll}
                className={`topic-nav-button${highlightAllTopics ? " topic-nav-button--active" : ""}`}
              >
                {highlightAllTopics ? "Clear Colors" : "Color Topics"}
              </button>
            </div>
            <input
              type="text"
              placeholder="Filter topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="topic-nav-filter"
            />
          </div>
        </div>
      )}

      {currentSidebarTab === "insights" && hasInsights && (
        <div className="topic-nav-panel">
          <div className="topic-nav-toolbar">
            <div className="topic-nav-toolbar__group">
              <button
                type="button"
                onClick={onToggleHighlightInsightTopics}
                className={`topic-nav-button${highlightInsightTopics ? " topic-nav-button--active" : ""}`}
              >
                {highlightInsightTopics
                  ? "Clear Colors"
                  : "Color Insight Topics"}
              </button>
            </div>
            <input
              type="text"
              placeholder="Filter insights..."
              value={insightSearchQuery}
              onChange={(event) => setInsightSearchQuery(event.target.value)}
              className="topic-nav-filter"
            />
          </div>
        </div>
      )}

      <div className="topic-nav-results">
        {insightTopicStyleSheet ? (
          <style>{insightTopicStyleSheet}</style>
        ) : null}
        {currentSidebarTab === "topics" ? (
          topicTree.length === 0 ? (
            <div className="topic-nav-empty">No topics yet.</div>
          ) : filteredTree.length === 0 ? (
            <div className="topic-nav-empty">No matching topics.</div>
          ) : (
            <ul className="topic-nav-list">
              {filteredTree.map((treeNode) => (
                <TopicTreeNode
                  key={treeNode.node.fullPath}
                  treeNode={treeNode}
                  depth={0}
                  {...nodeProps}
                />
              ))}
            </ul>
          )
        ) : !hasInsights ? (
          <div className="topic-nav-empty">No insights yet.</div>
        ) : filteredInsights.length === 0 ? (
          <div className="topic-nav-empty">No matching insights.</div>
        ) : (
          <ul className="topic-nav-list topic-nav-list--insights">
            {filteredInsights.map((insight) => {
              const topicNames = Array.isArray(insight.topicNames)
                ? insight.topicNames
                : [];
              const sentenceCount =
                Array.isArray(insight.sourceSentenceIndices) &&
                insight.sourceSentenceIndices.length > 0
                  ? insight.sourceSentenceIndices.length
                  : Array.isArray(insight.sourceSentences)
                    ? insight.sourceSentences.length
                    : 0;

              return (
                <li key={insight.id} className="topic-nav-insight">
                  <button
                    type="button"
                    className={`topic-nav-insight__card${activeInsightId === insight.id ? " topic-nav-insight__card--active" : ""}`}
                    onClick={() => onSelectInsight(insight)}
                  >
                    <div className="topic-nav-insight__header">
                      <span className="topic-nav-insight__title">
                        {insight.name}
                      </span>
                      <span className="topic-nav-insight__meta">
                        {sentenceCount} sent.
                      </span>
                    </div>
                    {topicNames.length > 0 ? (
                      <div className="topic-nav-insight__topics">
                        {topicNames.map((topicName) => (
                          <span
                            key={topicName}
                            className={`topic-nav-insight__topic${highlightInsightTopics ? ` ${getTopicCSSClass(topicName)}` : ""}`}
                          >
                            {topicName.split(">").pop().trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="topic-nav-insight__empty">
                        No linked topics
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export default React.memo(TopicList);
