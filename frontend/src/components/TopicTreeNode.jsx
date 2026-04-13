import React from "react";
import { getTopicHighlightColor } from "../utils/topicColorUtils";
import "./TopicNavigation.css";

/**
 * @typedef {Object} TopicTreeNodeModel
 * @property {{ name: string, fullPath: string, isLeaf: boolean, topic: { name: string, totalSentences?: number, ranges?: Array<unknown>, summary?: string } | null }} node
 * @property {Map<string, TopicTreeNodeModel>} children
 */

/**
 * @typedef {Object} TopicTreeNodeProps
 * @property {TopicTreeNodeModel} treeNode
 * @property {number} [depth]
 * @property {string} searchQuery
 * @property {Set<string>} expandedNodes
 * @property {(treeNode: TopicTreeNodeModel) => { totalTopics: number, totalSentences: number }} getSubtreeStats
 * @property {(treeNode: TopicTreeNodeModel) => boolean} isSubtreeSelected
 * @property {(treeNode: TopicTreeNodeModel) => boolean} isSubtreeRead
 * @property {Array<{ name: string }>} safeSelectedTopics
 * @property {Set<string>} safeReadTopics
 * @property {(path: string) => void} toggleNode
 * @property {(treeNode: TopicTreeNodeModel) => void} toggleAllInSubtree
 * @property {(treeNode: TopicTreeNodeModel) => void} toggleReadInSubtree
 * @property {(topic: { name: string, totalSentences?: number, ranges?: Array<unknown>, summary?: string }) => void} onToggleTopic
 * @property {(topic: { name: string, totalSentences?: number, ranges?: Array<unknown>, summary?: string }) => void} onToggleRead
 * @property {(topic: { name: string } | Array<{ name: string }>) => void} onShowTopicSentences
 * @property {(topic: { name: string, totalSentences?: number, ranges?: Array<unknown>, summary?: string }, mode: 'focus' | 'prev' | 'next') => void} [onNavigateTopic]
 * @property {(topic: { name: string, totalSentences?: number, ranges?: Array<unknown>, summary?: string }) => boolean} isPanelSelection
 * @property {(topic: { name: string, totalSentences?: number, ranges?: Array<unknown>, summary?: string }) => void} [onOpenVisualization]
 * @property {(topic: { name: string, totalSentences?: number, ranges?: Array<unknown>, summary?: string }) => void} [onCompareTopicRanges]
 * @property {(topic: { name: string, totalSentences?: number, ranges?: Array<unknown>, summary?: string }) => void} [onAnalyzeTopic]
 * @property {boolean} [highlightAllTopics]
 * @property {string | null} [activeActionMenuPath]
 * @property {(path: string) => void} [onToggleActionMenu]
 * @property {(path: string) => void} [onCloseActionMenu]
 */

/**
 * Render a topic tree node with semantic classes and only runtime color vars.
 *
 * @param {TopicTreeNodeProps} props
 * @returns {React.ReactElement}
 */
function TopicTreeNode({
  treeNode,
  depth = 0,
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
  onCompareTopicRanges,
  onAnalyzeTopic,
  highlightAllTopics = false,
  activeActionMenuPath = null,
  onToggleActionMenu = () => {},
  onCloseActionMenu = () => {},
}) {
  const { node, children } = treeNode;
  const hasChildren = children.size > 0;
  const isExpanded = searchQuery.trim()
    ? true
    : expandedNodes.has(node.fullPath);
  const { totalTopics, totalSentences } = getSubtreeStats(treeNode);
  const isNodeSelected = isSubtreeSelected(treeNode);
  const isNodeRead = isSubtreeRead(treeNode);

  const topic = node.topic;
  const isLeafSelected = Boolean(
    topic && safeSelectedTopics.some((t) => t.name === topic.name),
  );
  const isLeafRead = Boolean(topic && safeReadTopics.has(topic.name));
  const topicHighlightStyle = topic
    ? { "--topic-highlight-color": getTopicHighlightColor(topic.name) }
    : undefined;

  const childProps = {
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
    onCompareTopicRanges,
    onAnalyzeTopic,
    highlightAllTopics,
    activeActionMenuPath,
    onToggleActionMenu,
    onCloseActionMenu,
  };

  const titleClassName = [
    "topic-tree-node__title",
    node.isLeaf
      ? "topic-tree-node__title--leaf"
      : "topic-tree-node__title--branch",
    depth === 0
      ? "topic-tree-node__title--root"
      : "topic-tree-node__title--nested",
    isNodeRead || isLeafRead ? "topic-tree-node__title--read" : "",
    highlightAllTopics && topic ? "topic-tree-node__title--highlighted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const titleStyle = highlightAllTopics ? topicHighlightStyle : undefined;
  const isActionMenuOpen = activeActionMenuPath === node.fullPath;
  const areActionsVisible = isActionMenuOpen;
  const actionsId = `topic-tree-node-actions-${node.fullPath.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const handleAction = (callback) => {
    callback();
    onCloseActionMenu(node.fullPath);
  };

  return (
    <li className="topic-tree-node">
      <div
        className={`topic-tree-node__row${depth === 0 ? " topic-tree-node__row--root" : ""}${isActionMenuOpen ? " topic-tree-node__row--actions-open" : ""}`}
      >
        <div className="topic-tree-node__guide" />

        {hasChildren ? (
          <button
            type="button"
            className="topic-tree-node__expand"
            onClick={() => toggleNode(node.fullPath)}
            aria-label={
              isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`
            }
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        ) : (
          <div className="topic-tree-node__expand-spacer" />
        )}

        <div className="topic-tree-node__main">
          <div className="topic-tree-node__header">
            <div className="topic-tree-node__title-row">
              {!node.isLeaf && (
                <label className="topic-tree-node__label">
                  <input
                    type="checkbox"
                    checked={isNodeSelected}
                    onChange={() => toggleAllInSubtree(treeNode)}
                    className="topic-tree-node__checkbox"
                  />
                  <span
                    className={titleClassName}
                    onClick={() => toggleNode(node.fullPath)}
                  >
                    {node.name}
                  </span>
                </label>
              )}

              {node.isLeaf && topic && (
                <>
                  <input
                    type="checkbox"
                    checked={isLeafSelected}
                    onChange={() => onToggleTopic(topic)}
                    className="topic-tree-node__checkbox"
                  />
                  <span
                    className={titleClassName}
                    style={titleStyle}
                    onClick={() => {
                      onNavigateTopic?.(topic, "focus");
                    }}
                    title={topic.summary || undefined}
                  >
                    {node.name}
                  </span>
                </>
              )}

              <span className="topic-tree-node__stats">
                {node.isLeaf && topic
                  ? `(${topic.totalSentences})`
                  : `(${totalTopics}, ${totalSentences})`}
              </span>
            </div>

            <button
              type="button"
              className={`topic-tree-node__menu-trigger${isActionMenuOpen ? " topic-tree-node__menu-trigger--active" : ""}`}
              aria-label={`Show actions for ${node.name}`}
              aria-controls={actionsId}
              aria-expanded={isActionMenuOpen}
              onClick={() => onToggleActionMenu(node.fullPath)}
            >
              <span aria-hidden="true">...</span>
            </button>
          </div>

          <div
            id={actionsId}
            className={`topic-tree-node__actions${areActionsVisible ? " topic-tree-node__actions--visible" : ""}`}
          >
            {node.isLeaf && topic ? (
              <>
                <button
                  type="button"
                  className={`topic-nav-button${isLeafRead ? " topic-nav-button--active" : ""}`}
                  tabIndex={areActionsVisible ? 0 : -1}
                  onClick={() => {
                    handleAction(() => {
                      const ranges = topic.ranges;
                      if (
                        Array.isArray(ranges) &&
                        ranges.length > 1 &&
                        !isLeafRead
                      ) {
                        const ok = window.confirm(
                          `"${topic.name}" has ${ranges.length} separate ranges. Some may not be visible on screen. Mark as read?`,
                        );
                        if (!ok) return;
                      }
                      onToggleRead(topic);
                    });
                  }}
                >
                  {isLeafRead ? "Mark Unread" : "Mark Read"}
                </button>
                <button
                  type="button"
                  className="topic-nav-button"
                  tabIndex={areActionsVisible ? 0 : -1}
                  onClick={() =>
                    handleAction(() => onShowTopicSentences(topic))
                  }
                >
                  Show
                </button>
                {Array.isArray(topic.ranges) && topic.ranges.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="topic-nav-button"
                      tabIndex={areActionsVisible ? 0 : -1}
                      onClick={() =>
                        handleAction(() => onNavigateTopic?.(topic, "prev"))
                      }
                      title="Scroll to previous sentence for this topic"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="topic-nav-button"
                      tabIndex={areActionsVisible ? 0 : -1}
                      onClick={() =>
                        handleAction(() => onNavigateTopic?.(topic, "next"))
                      }
                      title="Scroll to next sentence for this topic"
                    >
                      Next
                    </button>
                  </>
                )}
                {onOpenVisualization && (
                  <button
                    type="button"
                    className="topic-nav-button"
                    tabIndex={areActionsVisible ? 0 : -1}
                    onClick={() =>
                      handleAction(() => onOpenVisualization(topic))
                    }
                    title="Open Topics chart"
                  >
                    Chart
                  </button>
                )}
                {onCompareTopicRanges &&
                  Array.isArray(topic.ranges) &&
                  topic.ranges.length > 1 && (
                    <button
                      type="button"
                      className="topic-nav-button"
                      tabIndex={areActionsVisible ? 0 : -1}
                      onClick={() =>
                        handleAction(() => onCompareTopicRanges(topic))
                      }
                      title="Compare sentence ranges side by side"
                    >
                      Compare
                    </button>
                  )}
                {onAnalyzeTopic && (
                  <button
                    type="button"
                    className="topic-nav-button"
                    tabIndex={areActionsVisible ? 0 : -1}
                    onClick={() => handleAction(() => onAnalyzeTopic(topic))}
                    title="Open Topic Analysis page"
                  >
                    Analyze
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`topic-nav-button${isNodeRead ? " topic-nav-button--active" : ""}`}
                  tabIndex={areActionsVisible ? 0 : -1}
                  onClick={() =>
                    handleAction(() => toggleReadInSubtree(treeNode))
                  }
                >
                  {isNodeRead ? "Mark Unread" : "Mark Read"}
                </button>
                <button
                  type="button"
                  className="topic-nav-button"
                  tabIndex={areActionsVisible ? 0 : -1}
                  onClick={() => {
                    handleAction(() => {
                      const leaves = [];
                      const collectLeaves = (n) => {
                        if (n.node.isLeaf && n.node.topic) {
                          leaves.push(n.node.topic);
                        }
                        n.children.forEach((child) => collectLeaves(child));
                      };
                      collectLeaves(treeNode);
                      if (leaves.length > 0) {
                        onShowTopicSentences(leaves);
                      }
                    });
                  }}
                >
                  Show
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <ul className="topic-tree-node__children">
          {Array.from(children.values())
            .sort((a, b) => a.node.name.localeCompare(b.node.name))
            .map((childNode) => (
              <TopicTreeNode
                key={childNode.node.fullPath}
                treeNode={childNode}
                depth={depth + 1}
                {...childProps}
              />
            ))}
        </ul>
      )}
    </li>
  );
}

export default React.memo(TopicTreeNode);
