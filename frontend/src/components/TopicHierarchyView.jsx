import React, { useMemo, useCallback } from "react";
import { buildTopicTree } from "../utils/topicTree";
import {
  getTopicHighlightColor,
  getTopicAccentColor,
} from "../utils/topicColorUtils";
import "./TopicHierarchyView.css";

/**
 * @typedef {Object} TopicHierarchyViewProps
 * @property {Array<{ name: string, sentences?: number[] }>} topics
 * @property {string|null} [selectedPath]
 * @property {string|null} [hoveredPath]
 * @property {(path: string, topic: unknown) => void} [onSelectPath]
 * @property {(path: string|null) => void} [onHoverPath]
 */

function computeWeight(entry) {
  if (entry.node.isLeaf) {
    const topic = entry.node.topic;
    const count = Array.isArray(topic?.sentences) ? topic.sentences.length : 0;
    return Math.max(count, 1);
  }
  let total = 0;
  entry.children.forEach((child) => {
    total += computeWeight(child);
  });
  return total || 1;
}

function isAncestorPath(ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  if (ancestor === descendant) return true;
  return descendant.startsWith(`${ancestor}>`);
}

function HierarchyNode({
  entry,
  selectedPath,
  hoveredPath,
  onSelectPath,
  onHoverPath,
}) {
  const { node } = entry;
  const children = Array.from(entry.children.values());
  const isLeaf = node.isLeaf || children.length === 0;
  const weight = computeWeight(entry);

  const isHovered = isAncestorPath(node.fullPath, hoveredPath);
  const isSelected = isAncestorPath(node.fullPath, selectedPath);
  const highlightColor = getTopicHighlightColor(node.fullPath);
  const accentColor = getTopicAccentColor(node.fullPath);

  const handleMouseEnter = useCallback(() => {
    if (onHoverPath) onHoverPath(node.fullPath);
  }, [onHoverPath, node.fullPath]);

  const handleMouseLeave = useCallback(() => {
    if (onHoverPath) onHoverPath(null);
  }, [onHoverPath]);

  const handleClick = useCallback(
    (event) => {
      event.stopPropagation();
      if (onSelectPath) onSelectPath(node.fullPath, node.topic);
    },
    [onSelectPath, node.fullPath, node.topic],
  );

  const stateClass = [
    isSelected ? "is-selected" : "",
    isHovered ? "is-hovered" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isLeaf) {
    const sentenceCount = Array.isArray(node.topic?.sentences)
      ? node.topic.sentences.length
      : 0;
    return (
      <div
        className={`th-leaf ${stateClass}`}
        style={{
          flexGrow: weight,
          backgroundColor: highlightColor,
          borderLeftColor: accentColor,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        title={`${node.fullPath} (${sentenceCount} sentences)`}
      >
        <span className="th-leaf__label">{node.name}</span>
        {sentenceCount > 0 && (
          <span className="th-leaf__count">{sentenceCount}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`th-node ${stateClass}`}
      style={{ flexGrow: weight }}
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
        title={node.fullPath}
      >
        <span className="th-node__label-text">{node.name}</span>
      </div>
      <div className="th-node__children">
        {children.map((child) => (
          <HierarchyNode
            key={child.node.uid}
            entry={child}
            selectedPath={selectedPath}
            hoveredPath={hoveredPath}
            onSelectPath={onSelectPath}
            onHoverPath={onHoverPath}
          />
        ))}
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
  onSelectPath,
  onHoverPath,
}) {
  const roots = useMemo(() => buildTopicTree(topics || []), [topics]);

  if (!roots || roots.length === 0) {
    return <div className="th-empty">No topics available.</div>;
  }

  return (
    <div className="th-root">
      {roots.map((root) => (
        <HierarchyNode
          key={root.node.uid}
          entry={root}
          selectedPath={selectedPath}
          hoveredPath={hoveredPath}
          onSelectPath={onSelectPath}
          onHoverPath={onHoverPath}
        />
      ))}
    </div>
  );
}

export default TopicHierarchyView;
