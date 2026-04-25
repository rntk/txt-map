import React, { useMemo, useCallback } from "react";
import { buildTopicTree } from "../utils/topicTree";
import { getTopicParts, isWithinScope } from "../utils/topicHierarchy";
import {
  getHierarchyTopicHighlightColor,
  getHierarchyTopicAccentColor,
} from "../utils/topicColorUtils";
import "./TopicHierarchyView.css";

const DEFAULT_CHILD_LIMIT = 0;
const DEFAULT_ROOT_LIMIT = 0;

/**
 * @typedef {Object} TopicHierarchyTopic
 * @property {string} name
 * @property {number[]} [sentences]
 */

/**
 * @typedef {Object} TopicTreeNode
 * @property {string} name
 * @property {string} fullPath
 * @property {string} uid
 * @property {boolean} isLeaf
 * @property {TopicHierarchyTopic|null} topic
 * @property {number} depth
 */

/**
 * @typedef {Object} TopicTreeEntry
 * @property {TopicTreeNode} node
 * @property {Map<string, TopicTreeEntry>} children
 * @property {string|null|TopicTreeEntry} parent
 */

/**
 * @typedef {Object} TopicHierarchyViewProps
 * @property {TopicHierarchyTopic[]} topics
 * @property {string|null} [selectedPath]
 * @property {string|null} [hoveredPath]
 * @property {string[]} [scopePath]
 * @property {number} [childLimit]
 * @property {number} [rootLimit]
 * @property {boolean} [drilldownMode]
 * @property {(path: string, topic: TopicHierarchyTopic|null) => void} [onSelectPath]
 * @property {(path: string|null) => void} [onHoverPath]
 * @property {(path: string) => void} [onDrilldownPath]
 * @property {(topic: TopicHierarchyTopic) => void} [onOpenTopicMeta]
 * @property {() => void} [onCloseTopicMeta]
 * @property {(topic: TopicHierarchyTopic) => React.ReactNode} [renderMetaPanel]
 * @property {string|null} [activeMetaTopicName]
 */

/**
 * @param {TopicTreeEntry} entry
 * @returns {number}
 */
/**
 * @param {TopicTreeEntry} entry
 * @returns {number}
 */
function countVisibleLeaves(entry) {
  const children = Array.from(entry.children.values());
  if (children.length === 0) return 1;

  return children.reduce(
    (total, child) => total + countVisibleLeaves(child),
    0,
  );
}

/**
 * @param {TopicTreeEntry} entry
 * @param {number} childLimit
 * @param {boolean} drilldownMode
 * @returns {number}
 */
function countRenderedRows(entry, childLimit, drilldownMode) {
  const children = Array.from(entry.children.values());
  if (children.length === 0) return 1;

  const shouldLimitChildren = !drilldownMode && childLimit > 0;
  const visibleChildren = shouldLimitChildren
    ? children.slice(0, childLimit)
    : children;
  const hiddenRowCount =
    shouldLimitChildren && children.length > childLimit ? 1 : 0;

  return (
    visibleChildren.reduce(
      (total, child) =>
        total + countRenderedRows(child, childLimit, drilldownMode),
      0,
    ) + hiddenRowCount
  );
}

/**
 * @param {string|null|undefined} ancestor
 * @param {string|null|undefined} descendant
 * @returns {boolean}
 */
function isAncestorPath(ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  if (ancestor === descendant) return true;
  return descendant.startsWith(`${ancestor}>`);
}

/**
 * @param {TopicHierarchyTopic[]} topics
 * @param {string[]} scopePath
 * @returns {TopicHierarchyTopic[]}
 */
function getScopedTopics(topics, scopePath) {
  if (scopePath.length === 0) return topics;

  return topics.filter((topic) => {
    const parts = getTopicParts(topic);
    return parts.length > scopePath.length && isWithinScope(parts, scopePath);
  });
}

/**
 * @param {Object} props
 * @param {TopicTreeEntry[]} props.hiddenChildren
 * @param {string} props.parentPath
 * @param {(path: string) => void} [props.onDrilldownPath]
 * @returns {React.ReactElement|null}
 */
function MoreChildrenIndicator({
  hiddenChildren,
  parentPath,
  onDrilldownPath,
}) {
  const hiddenLeafCount = hiddenChildren.reduce(
    (total, child) => total + countVisibleLeaves(child),
    0,
  );

  const handleClick = useCallback(
    (event) => {
      event.stopPropagation();
      if (onDrilldownPath) onDrilldownPath(parentPath);
    },
    [onDrilldownPath, parentPath],
  );

  if (hiddenLeafCount === 0) return null;

  return (
    <button
      type="button"
      className="th-more"
      onClick={handleClick}
      title="Open this topic branch"
    >
      <span className="th-more__dot" aria-hidden="true" />
      <span className="th-more__label">{hiddenLeafCount} more topics</span>
    </button>
  );
}

/**
 * @param {Object} props
 * @param {number} props.hiddenCount
 * @param {(path: string) => void} [props.onDrilldownPath]
 * @returns {React.ReactElement|null}
 */
function MoreRootIndicator({ hiddenCount, onDrilldownPath }) {
  const handleClick = useCallback(() => {
    if (onDrilldownPath) onDrilldownPath("");
  }, [onDrilldownPath]);

  if (hiddenCount === 0) return null;

  return (
    <button
      type="button"
      className="th-more th-more--root"
      onClick={handleClick}
      title="Open a scrollable view of all topics"
    >
      <span className="th-more__dot" aria-hidden="true" />
      <span className="th-more__label">{hiddenCount} more root topics</span>
    </button>
  );
}

/**
 * @param {Object} props
 * @param {TopicTreeEntry} props.entry
 * @param {string|null} props.selectedPath
 * @param {string|null} props.hoveredPath
 * @param {number} props.childLimit
 * @param {boolean} props.drilldownMode
 * @param {(path: string, topic: TopicHierarchyTopic|null) => void} [props.onSelectPath]
 * @param {(path: string|null) => void} [props.onHoverPath]
 * @param {(path: string) => void} [props.onDrilldownPath]
 * @param {(topic: TopicHierarchyTopic) => void} [props.onOpenTopicMeta]
 * @param {string|null} [props.activeMetaTopicName]
 * @returns {React.ReactElement}
 */
function HierarchyNode({
  entry,
  selectedPath,
  hoveredPath,
  childLimit,
  drilldownMode,
  onSelectPath,
  onHoverPath,
  onDrilldownPath,
  onOpenTopicMeta,
  onCloseTopicMeta,
  renderMetaPanel,
  activeMetaTopicName,
  startLevel,
}) {
  const { node } = entry;
  const children = Array.from(entry.children.values());
  const isLeaf = children.length === 0;
  const shouldLimitChildren = !drilldownMode && childLimit > 0;
  const visibleChildren = shouldLimitChildren
    ? children.slice(0, childLimit)
    : children;
  const hiddenChildren = shouldLimitChildren ? children.slice(childLimit) : [];
  const renderedRows = countRenderedRows(entry, childLimit, drilldownMode);

  const isHovered = isAncestorPath(node.fullPath, hoveredPath);
  const isSelected = isAncestorPath(node.fullPath, selectedPath);
  const isMetaActive = activeMetaTopicName === node.fullPath;
  const relativeDepth = Math.max(0, node.depth - startLevel);
  const highlightColor = getHierarchyTopicHighlightColor(
    node.fullPath,
    relativeDepth,
  );
  const accentColor = getHierarchyTopicAccentColor(
    node.fullPath,
    relativeDepth,
  );

  const handleMouseEnter = useCallback(() => {
    if (onHoverPath) onHoverPath(node.fullPath);
  }, [onHoverPath, node.fullPath]);

  const handleMouseLeave = useCallback(() => {
    if (onHoverPath) onHoverPath(null);
  }, [onHoverPath]);

  const handleClick = useCallback(
    (event) => {
      event.stopPropagation();
      if (!isLeaf && onDrilldownPath) {
        onDrilldownPath(node.fullPath);
        return;
      }
      if (onSelectPath) onSelectPath(node.fullPath, node.topic);
    },
    [isLeaf, onDrilldownPath, onSelectPath, node.fullPath, node.topic],
  );

  const handleMetaClick = useCallback(
    (event) => {
      event.stopPropagation();
      if (isMetaActive && onCloseTopicMeta) {
        onCloseTopicMeta();
        return;
      }
      if (!onOpenTopicMeta) return;
      onOpenTopicMeta(node.topic || { name: node.fullPath, sentences: [] });
    },
    [
      isMetaActive,
      node.fullPath,
      node.topic,
      onCloseTopicMeta,
      onOpenTopicMeta,
    ],
  );

  const stateClass = [
    isSelected ? "is-selected" : "",
    isHovered ? "is-hovered" : "",
    isMetaActive ? "is-meta-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isLeaf) {
    const sentenceCount = Array.isArray(node.topic?.sentences)
      ? node.topic.sentences.length
      : 0;
    const metaTopic = node.topic || { name: node.fullPath, sentences: [] };
    return (
      <>
        <div
          className={`th-leaf ${stateClass}`}
          style={{
            backgroundColor: highlightColor,
            borderLeftColor: accentColor,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          title={`${node.fullPath} (${sentenceCount} sentences)`}
        >
          <span className="th-leaf__label">{node.name}</span>
          <span className="th-leaf__actions">
            {sentenceCount > 0 && (
              <span className="th-leaf__count">{sentenceCount}</span>
            )}
            {onOpenTopicMeta && (
              <button
                type="button"
                className="th-leaf__meta-button"
                onClick={handleMetaClick}
                title={`Show topics meta for ${node.fullPath}`}
                aria-label={`Show topics meta for ${node.fullPath}`}
              >
                i
              </button>
            )}
          </span>
        </div>
        {isMetaActive && renderMetaPanel && (
          <div
            className="th-meta-embed"
            style={{
              borderLeftColor: accentColor,
              backgroundColor: highlightColor,
            }}
          >
            <div className="th-meta-embed__header">
              <span className="th-meta-embed__title" title={node.fullPath}>
                {node.name}
              </span>
              {onCloseTopicMeta && (
                <button
                  type="button"
                  className="th-meta-embed__close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTopicMeta();
                  }}
                  aria-label="Close topics meta"
                  title="Close topics meta"
                >
                  &times;
                </button>
              )}
            </div>
            <div className="th-meta-embed__body">
              {renderMetaPanel(metaTopic)}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={`th-node ${stateClass}`}
      style={{ "--th-row-span": renderedRows }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`th-node__label ${stateClass}`}
        style={{
          backgroundColor: highlightColor,
          borderLeftColor: accentColor,
        }}
        onClick={handleClick}
        title={
          isLeaf ? node.fullPath : `Open ${node.fullPath || node.name} branch`
        }
      >
        <span className="th-node__label-text">{node.name}</span>
        {!isLeaf && (
          <span className="th-node__drill" aria-hidden="true">
            &gt;
          </span>
        )}
      </div>
      <div className="th-node__children">
        {visibleChildren.map((child) => (
          <HierarchyNode
            key={child.node.uid}
            entry={child}
            selectedPath={selectedPath}
            hoveredPath={hoveredPath}
            childLimit={childLimit}
            drilldownMode={drilldownMode}
            onSelectPath={onSelectPath}
            onHoverPath={onHoverPath}
            onDrilldownPath={onDrilldownPath}
            onOpenTopicMeta={onOpenTopicMeta}
            onCloseTopicMeta={onCloseTopicMeta}
            renderMetaPanel={renderMetaPanel}
            activeMetaTopicName={activeMetaTopicName}
            startLevel={startLevel}
          />
        ))}
        {hiddenChildren.length > 0 && (
          <MoreChildrenIndicator
            hiddenChildren={hiddenChildren}
            parentPath={node.fullPath}
            onDrilldownPath={onDrilldownPath}
          />
        )}
      </div>
    </div>
  );
}

/**
 * @param {TopicHierarchyViewProps} props
 */
function TopicHierarchyView({
  topics,
  selectedPath = null,
  hoveredPath = null,
  scopePath = [],
  childLimit = DEFAULT_CHILD_LIMIT,
  rootLimit = DEFAULT_ROOT_LIMIT,
  drilldownMode = false,
  onSelectPath,
  onHoverPath,
  onDrilldownPath,
  onOpenTopicMeta,
  onCloseTopicMeta,
  renderMetaPanel,
  activeMetaTopicName = null,
}) {
  const startLevel = Array.isArray(scopePath) ? scopePath.length : 0;

  const roots = useMemo(() => {
    const safeTopics = Array.isArray(topics) ? topics : [];
    const safeScopePath = Array.isArray(scopePath) ? scopePath : [];
    const scopedTopics = getScopedTopics(safeTopics, safeScopePath);
    return buildTopicTree(scopedTopics, safeScopePath.length);
  }, [topics, scopePath]);

  if (!roots || roots.length === 0) {
    return <div className="th-empty">No topics available.</div>;
  }

  const shouldLimitRoots = !drilldownMode && rootLimit > 0;
  const visibleRoots = shouldLimitRoots ? roots.slice(0, rootLimit) : roots;
  const hiddenRootCount = shouldLimitRoots
    ? Math.max(0, roots.length - rootLimit)
    : 0;

  return (
    <div className={`th-root${drilldownMode ? " th-root--drilldown" : ""}`}>
      {visibleRoots.map((root) => (
        <HierarchyNode
          key={root.node.uid}
          entry={root}
          selectedPath={selectedPath}
          hoveredPath={hoveredPath}
          childLimit={childLimit}
          drilldownMode={drilldownMode}
          onSelectPath={onSelectPath}
          onHoverPath={onHoverPath}
          onDrilldownPath={onDrilldownPath}
          onOpenTopicMeta={onOpenTopicMeta}
          onCloseTopicMeta={onCloseTopicMeta}
          renderMetaPanel={renderMetaPanel}
          activeMetaTopicName={activeMetaTopicName}
          startLevel={startLevel}
        />
      ))}
      {hiddenRootCount > 0 && (
        <MoreRootIndicator
          hiddenCount={hiddenRootCount}
          onDrilldownPath={onDrilldownPath}
        />
      )}
    </div>
  );
}

export default TopicHierarchyView;
