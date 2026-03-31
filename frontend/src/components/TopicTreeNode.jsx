import React from 'react';
import { getTopicHighlightColor } from '../utils/topicColorUtils';

const styles = {
  treeNode: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  nodeContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '4px',
    padding: '10px 4px',
    borderBottom: '1px solid #eee',
  },
  guideLine: {
    width: '6px',
    borderLeft: '1px dotted #ccc',
    marginLeft: '0px',
    flexShrink: 0,
  },
  expandIcon: {
    cursor: 'pointer',
    width: '12px',
    textAlign: 'center',
    fontSize: '10px',
    color: '#666',
    flexShrink: 0,
    paddingTop: '2px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    marginBottom: '3px',
  },
  topicTitle: {
    fontWeight: '500',
    cursor: 'pointer',
  },
  topicTitleHover: {
    textDecoration: 'underline',
  },
  topicTitleClickable: {
    cursor: 'pointer',
    fontWeight: '500',
  },
  stats: {
    fontSize: '11px',
    color: '#888',
  },
  buttonsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexWrap: 'wrap',
    marginTop: '1px',
    marginBottom: '3px',
  },
  button: {
    fontSize: '11px',
    padding: '1px 6px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    background: '#f9f9f9',
    cursor: 'pointer',
    color: '#555',
  },
  buttonActive: {
    background: '#e8f4e8',
    borderColor: '#a8d8a8',
    color: '#2d6a2d',
  },
  summaryRow: {
    fontSize: '11px',
    color: '#666',
    marginTop: '1px',
    fontStyle: 'italic',
  },
  checkbox: {
    margin: 0,
    cursor: 'pointer',
  },
  childrenList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    paddingLeft: '4px',
  },
};

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
  onToggleShowPanel,
  onNavigateTopic,
  isPanelSelection,
  onOpenVisualization,
  highlightAllTopics = false,
}) {
  const { node, children } = treeNode;
  const hasChildren = children.size > 0;
  const isExpanded = searchQuery.trim() ? true : expandedNodes.has(node.fullPath);
  const { totalTopics, totalSentences } = getSubtreeStats(treeNode);
  const isNodeSelected = isSubtreeSelected(treeNode);
  const isNodeRead = isSubtreeRead(treeNode);

  const topic = node.topic;
  const isLeafSelected = topic && safeSelectedTopics.some(t => t.name === topic.name);
  const isLeafRead = topic && safeReadTopics.has(topic.name);

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
    onToggleShowPanel,
    onNavigateTopic,
    isPanelSelection,
    onOpenVisualization,
    highlightAllTopics,
  };

  return (
    <li style={styles.treeNode}>
      <div style={styles.nodeContent}>
        {/* Guide line for hierarchy */}
        <div style={styles.guideLine} />

        {/* Expand icon */}
        {hasChildren && (
          <span
            style={styles.expandIcon}
            onClick={() => toggleNode(node.fullPath)}
          >
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span style={{ ...styles.expandIcon, visibility: 'hidden' }}>▶</span>}

        {/* Main content area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: Title + Stats */}
          <div style={styles.titleRow}>
            {!node.isLeaf && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isNodeSelected}
                  onChange={() => toggleAllInSubtree(treeNode)}
                  style={styles.checkbox}
                />
                <span
                  style={{ ...styles.topicTitle, ...(isNodeRead ? { color: '#888' } : {}) }}
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
                  style={styles.checkbox}
                />
                <span
                  className="topic-tree-node-title"
                  style={{
                    ...styles.topicTitle,
                    ...(isLeafRead ? { color: '#888' } : {}),
                    ...(highlightAllTopics ? {
                      backgroundColor: getTopicHighlightColor(topic.name),
                      borderRadius: '3px',
                      padding: '1px 5px',
                    } : {}),
                  }}
                  onClick={() => {
                    onNavigateTopic && onNavigateTopic(topic, 'focus');
                  }}
                >
                  {node.name}
                </span>
              </>
            )}

            <span style={styles.stats}>
              {node.isLeaf && topic
                ? `(${topic.totalSentences} sent.)`
                : `(${totalTopics} topics, ${totalSentences} sent.)`
              }
            </span>
          </div>

          {/* Row 2: Buttons */}
          <div style={styles.buttonsRow}>
            {node.isLeaf && topic ? (
              <>
                <button
                  onClick={() => {
                    const ranges = topic.ranges;
                    if (Array.isArray(ranges) && ranges.length > 1 && !isLeafRead) {
                      const ok = window.confirm(
                        `"${topic.name}" has ${ranges.length} separate ranges. Some may not be visible on screen. Mark as read?`
                      );
                      if (!ok) return;
                    }
                    onToggleRead(topic);
                  }}
                  style={{
                    ...styles.button,
                    ...(isLeafRead ? styles.buttonActive : {})
                  }}
                >
                  {isLeafRead ? 'Mark Unread' : 'Mark Read'}
                </button>
                <button
                  onClick={() => onToggleShowPanel(topic)}
                  style={styles.button}
                >
                  {isPanelSelection(topic) ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={() => onNavigateTopic && onNavigateTopic(topic, 'prev')}
                  style={styles.button}
                  title="Scroll to previous sentence for this topic"
                >
                  Prev
                </button>
                <button
                  onClick={() => onNavigateTopic && onNavigateTopic(topic, 'next')}
                  style={styles.button}
                  title="Scroll to next sentence for this topic"
                >
                  Next
                </button>
                {onOpenVisualization && (
                  <button
                    onClick={() => onOpenVisualization(topic)}
                    style={styles.button}
                    title="Open Topics chart"
                  >
                    Chart
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => toggleReadInSubtree(treeNode)}
                  style={{
                    ...styles.button,
                    ...(isNodeRead ? styles.buttonActive : {})
                  }}
                >
                  {isNodeRead ? 'Mark Unread' : 'Mark Read'}
                </button>
                <button
                  onClick={() => {
                    const leaves = [];
                    const collectLeaves = (n) => {
                      if (n.node.isLeaf && n.node.topic) {
                        leaves.push(n.node.topic);
                      }
                      n.children.forEach(c => collectLeaves(c));
                    };
                    collectLeaves(treeNode);
                    if (leaves.length > 0) {
                      onToggleShowPanel(leaves);
                    }
                  }}
                  style={styles.button}
                >
                  Show
                </button>
              </>
            )}
          </div>

          {/* Row 3: Summary (leaf nodes only) */}
          {node.isLeaf && topic && topic.summary && (
            <div style={styles.summaryRow}>
              {topic.summary}
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <ul style={styles.childrenList}>
          {Array.from(children.values())
            .sort((a, b) => a.node.name.localeCompare(b.node.name))
            .map((childNode) => (
              <TopicTreeNode key={childNode.node.fullPath} treeNode={childNode} depth={depth + 1} {...childProps} />
            ))}
        </ul>
      )}
    </li>
  );
}

export default React.memo(TopicTreeNode);
