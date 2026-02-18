import React, { useState, useMemo, useCallback } from 'react';

function TopicList({
  topics = [],
  selectedTopics = [],
  onToggleTopic = () => { },
  onHoverTopic = () => { },
  readTopics = new Set(),
  onToggleRead = () => { },
  showPanel = false,
  panelTopic = null,
  onToggleShowPanel = () => { },
  onNavigateTopic
}) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const safeSelectedTopics = Array.isArray(selectedTopics) ? selectedTopics : [];
  const safeReadTopics = readTopics instanceof Set ? readTopics : new Set(readTopics || []);

  // Build a tree structure from topic paths (split by '>')
  const topicTree = useMemo(() => {
    const safe = Array.isArray(topics) ? topics : [];
    const tree = new Map();

    safe.forEach(topic => {
      const parts = topic.name.split('>').map(p => p.trim());
      let path = '';

      for (let i = 0; i < parts.length; i++) {
        const prevPath = path;
        path = path ? `${path}>${parts[i]}` : parts[i];

        if (!tree.has(path)) {
          const isLeaf = i === parts.length - 1;
          tree.set(path, {
            node: {
              name: parts[i],
              fullPath: path,
              isLeaf,
              topic: isLeaf ? topic : null,
              depth: i
            },
            children: new Map(),
            parent: prevPath || null
          });
        }

        if (prevPath) {
          const parentEntry = tree.get(prevPath);
          parentEntry.children.set(parts[i], tree.get(path));
        }
      }
    });

    const roots = [];
    tree.forEach((value, key) => {
      if (value.node.depth === 0) {
        roots.push(value);
      }
    });

    roots.sort((a, b) => a.node.name.localeCompare(b.node.name));
    return roots;
  }, [topics]);

  const getSubtreeStats = useCallback((treeNode) => {
    let totalTopics = 0;
    let totalSentences = 0;

    const traverse = (node) => {
      if (node.node.isLeaf && node.node.topic) {
        totalTopics++;
        totalSentences += node.node.topic.totalSentences || 0;
      }
      node.children.forEach(child => traverse(child));
    };

    traverse(treeNode);
    return { totalTopics, totalSentences };
  }, []);

  const isSubtreeSelected = useCallback((treeNode) => {
    let hasSelected = false;
    const traverse = (node) => {
      if (node.node.isLeaf && node.node.topic) {
        if (safeSelectedTopics.some(t => t.name === node.node.topic.name)) {
          hasSelected = true;
        }
      }
      node.children.forEach(child => traverse(child));
    };
    traverse(treeNode);
    return hasSelected;
  }, [safeSelectedTopics]);

  const isSubtreeRead = useCallback((treeNode) => {
    let allRead = true;
    let hasLeaves = false;
    const traverse = (node) => {
      if (node.node.isLeaf && node.node.topic) {
        hasLeaves = true;
        if (!safeReadTopics.has(node.node.topic.name)) {
          allRead = false;
        }
      }
      node.children.forEach(child => traverse(child));
    };
    traverse(treeNode);
    return hasLeaves && allRead;
  }, [safeReadTopics]);

  const toggleAllInSubtree = useCallback((treeNode) => {
    const allSelected = isSubtreeSelected(treeNode);

    const traverse = (node) => {
      if (node.node.isLeaf && node.node.topic) {
        const isSelected = safeSelectedTopics.some(t => t.name === node.node.topic.name);
        if (allSelected && isSelected) {
          onToggleTopic(node.node.topic);
        } else if (!allSelected && !isSelected) {
          onToggleTopic(node.node.topic);
        }
      }
      node.children.forEach(child => traverse(child));
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
      onNavigateTopic(firstLeaf, 'focus');
    }
  }, [safeSelectedTopics, onToggleTopic, onNavigateTopic, isSubtreeSelected]);

  const toggleReadInSubtree = useCallback((treeNode) => {
    const allRead = isSubtreeRead(treeNode);

    const traverse = (node) => {
      if (node.node.isLeaf && node.node.topic) {
        const isRead = safeReadTopics.has(node.node.topic.name);
        if (allRead && isRead) {
          onToggleRead(node.node.topic);
        } else if (!allRead && !isRead) {
          onToggleRead(node.node.topic);
        }
      }
      node.children.forEach(child => traverse(child));
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
      onNavigateTopic(firstLeaf, 'focus');
    }
  }, [safeReadTopics, onToggleRead, onNavigateTopic, isSubtreeRead]);

  const toggleNode = (path) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const getTopicSelectionKey = (topicOrTopics) => {
    if (!topicOrTopics) return '';
    if (Array.isArray(topicOrTopics)) {
      return topicOrTopics
        .map(topic => topic?.name)
        .filter(Boolean)
        .sort()
        .join('|');
    }
    return topicOrTopics.name || '';
  };

  const isPanelSelection = (topic) => {
    return showPanel && panelTopic && getTopicSelectionKey(panelTopic) === getTopicSelectionKey(topic);
  };

  // Minimalistic styles
  const styles = {
    topicList: {
      fontSize: '13px',
      lineHeight: '1.4',
      paddingBottom: '6px',
      height: 'calc(100vh - 100px)',
      overflowY: 'auto',
      paddingRight: '5px',
      marginRight: '-5px',
    },
    treeNode: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
    },
    nodeContent: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      padding: '10px 8px',
      borderBottom: '1px solid #eee',
    },
    guideLine: {
      width: '10px',
      borderLeft: '1px dotted #ccc',
      marginLeft: '2px',
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
      paddingLeft: '8px',
    },
  };

  // Recursive TreeNode component
  const TreeNode = ({ treeNode, depth = 0 }) => {
    const { node, children } = treeNode;
    const hasChildren = children.size > 0;
    const isExpanded = expandedNodes.has(node.fullPath);
    const { totalTopics, totalSentences } = getSubtreeStats(treeNode);
    const isNodeSelected = isSubtreeSelected(treeNode);
    const isNodeRead = isSubtreeRead(treeNode);

    const topic = node.topic;
    const isLeafSelected = topic && safeSelectedTopics.some(t => t.name === topic.name);
    const isLeafRead = topic && safeReadTopics.has(topic.name);

    const [isTitleHovered, setIsTitleHovered] = useState(false);

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
                    style={{
                      ...styles.topicTitle,
                      ...(isTitleHovered ? styles.topicTitleHover : {}),
                      ...(isLeafRead ? { color: '#888' } : {})
                    }}
                    onClick={() => {
                      onNavigateTopic && onNavigateTopic(topic, 'focus');
                    }}
                    onMouseEnter={() => setIsTitleHovered(true)}
                    onMouseLeave={() => setIsTitleHovered(false)}
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
                    onClick={() => onToggleRead(topic)}
                    style={{
                      ...styles.button,
                      ...(isLeafRead ? styles.buttonActive : {})
                    }}
                  >
                    {isLeafRead ? 'Readed' : 'Unreaded'}
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
                    {isNodeRead ? 'Readed' : 'Unreaded'}
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
                <TreeNode key={childNode.node.fullPath} treeNode={childNode} depth={depth + 1} />
              ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div style={styles.topicList}>
      {topicTree.length === 0 ? (
        <div style={{ color: '#888', fontSize: '13px' }}>No topics yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {topicTree.map((treeNode) => (
            <TreeNode key={treeNode.node.fullPath} treeNode={treeNode} depth={0} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default TopicList;
