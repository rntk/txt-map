import React, { useState, useMemo, useCallback } from 'react';
import { buildTopicTree, getSubtreeStats as getSubtreeStatsUtil } from '../utils/topicTree';
import TopicTreeNode from './TopicTreeNode';
import { getTopicSelectionKey } from '../utils/chartConstants';

function TopicList({
  topics = [],
  selectedTopics = [],
  onToggleTopic = () => { },
  onHoverTopic: _onHoverTopic = () => { },
  readTopics = new Set(),
  onToggleRead = () => { },
  showPanel = false,
  panelTopic = null,
  onToggleShowPanel = () => { },
  onNavigateTopic,
  onToggleReadAll = () => { },
  onOpenVisualization,
  highlightAllTopics = false,
  onToggleHighlightAll = () => { },
}) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const safeSelectedTopics = useMemo(
    () => (Array.isArray(selectedTopics) ? selectedTopics : []),
    [selectedTopics]
  );
  const safeReadTopics = useMemo(
    () => (readTopics instanceof Set ? readTopics : new Set(readTopics || [])),
    [readTopics]
  );

  const topicTree = useMemo(() => buildTopicTree(topics), [topics]);

  const getSubtreeStats = useCallback((treeNode) => getSubtreeStatsUtil(treeNode), []);

  const selectedNamesSet = useMemo(
    () => new Set(safeSelectedTopics.map(t => t.name)),
    [safeSelectedTopics]
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
      node.children.forEach(child => {
        const childEntry = compute(child);
        if (childEntry.hasSelected) hasSelected = true;
        if (!childEntry.allRead || !childEntry.hasLeaves) allRead = false;
        if (childEntry.hasLeaves) hasLeaves = true;
      });
      const entry = { hasSelected, allRead: hasLeaves && allRead, hasLeaves };
      map.set(node.node.fullPath, entry);
      return entry;
    };
    topicTree.forEach(root => compute(root));
    return map;
  }, [topicTree, selectedNamesSet, safeReadTopics]);

  const isSubtreeSelected = useCallback((treeNode) => {
    return subtreeStateMap.get(treeNode.node.fullPath)?.hasSelected ?? false;
  }, [subtreeStateMap]);

  const isSubtreeRead = useCallback((treeNode) => {
    const entry = subtreeStateMap.get(treeNode.node.fullPath);
    return entry ? entry.hasLeaves && entry.allRead : false;
  }, [subtreeStateMap]);

  const toggleAllInSubtree = useCallback((treeNode) => {
    const allSelected = isSubtreeSelected(treeNode);
    const shouldNavigateToFirstLeaf = !allSelected;

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
    if (shouldNavigateToFirstLeaf && onNavigateTopic && firstLeaf) {
      onNavigateTopic(firstLeaf, 'focus');
    }
  }, [safeSelectedTopics, onToggleTopic, onNavigateTopic, isSubtreeSelected]);

  const toggleReadInSubtree = useCallback((treeNode) => {
    const allRead = isSubtreeRead(treeNode);

    // Check if any leaf in the subtree has split ranges
    const hasSplitRanges = (() => {
      let found = false;
      const check = (node) => {
        if (node.node.isLeaf && node.node.topic) {
          const r = node.node.topic.ranges;
          if (Array.isArray(r) && r.length > 1) found = true;
        }
        if (!found) node.children.forEach(child => check(child));
      };
      check(treeNode);
      return found;
    })();

    if (hasSplitRanges) {
      const action = allRead ? 'unread' : 'read';
      const ok = window.confirm(
        `Some topics in this group have multiple separate ranges. Mark all as ${action}?`
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

  const getAllNonLeafPaths = useCallback(() => {
    const paths = new Set();
    const traverse = (treeNode) => {
      if (treeNode.children.size > 0) {
        paths.add(treeNode.node.fullPath);
        treeNode.children.forEach(child => traverse(child));
      }
    };
    topicTree.forEach(root => traverse(root));
    return paths;
  }, [topicTree]);

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return topicTree;
    const q = searchQuery.trim().toLowerCase();

    const filterNode = (treeNode) => {
      if (treeNode.node.isLeaf) {
        return treeNode.node.fullPath.toLowerCase().includes(q) ? treeNode : null;
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

  const [allExpanded, setAllExpanded] = useState(false);

  const toggleExpandAll = useCallback(() => {
    setAllExpanded(prev => {
      const newState = !prev;
      setExpandedNodes(newState ? getAllNonLeafPaths() : new Set());
      return newState;
    });
  }, [getAllNonLeafPaths]);

  const allRead = useMemo(() => {
    const leaves = [];
    const collect = (treeNode) => {
      if (treeNode.node.isLeaf && treeNode.node.topic) {
        leaves.push(treeNode.node.topic.name);
      }
      treeNode.children.forEach(child => collect(child));
    };
    topicTree.forEach(root => collect(root));
    return leaves.length > 0 && leaves.every(name => safeReadTopics.has(name));
  }, [topicTree, safeReadTopics]);

  const isPanelSelection = (topic) => {
    return showPanel && panelTopic && getTopicSelectionKey(panelTopic) === getTopicSelectionKey(topic);
  };

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
    onToggleShowPanel,
    onNavigateTopic,
    isPanelSelection,
    onOpenVisualization,
    highlightAllTopics,
  };

  const buttonStyle = {
    fontSize: '11px',
    padding: '1px 6px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    background: '#f9f9f9',
    cursor: 'pointer',
    color: '#555',
  };
  const buttonActiveStyle = { ...buttonStyle, background: '#e8f4e8', borderColor: '#a8d8a8', color: '#2d6a2d' };

  return (
    <>
      {topicTree.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', flex: '0 0 auto' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button onClick={toggleExpandAll} style={buttonStyle}>
              {allExpanded ? 'Fold All' : 'Unfold All'}
            </button>
            <button onClick={onToggleReadAll} style={allRead ? buttonActiveStyle : buttonStyle}>
              {allRead ? 'Unread All' : 'Read All'}
            </button>
            <button onClick={onToggleHighlightAll} style={highlightAllTopics ? buttonActiveStyle : buttonStyle}>
              {highlightAllTopics ? 'Clear Colors' : 'Color Topics'}
            </button>
          </div>
          <input
            type="text"
            placeholder="Filter topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              fontSize: '12px',
              padding: '2px 6px',
              border: '1px solid #ddd',
              borderRadius: '3px',
              outline: 'none',
            }}
          />
        </div>
      )}
      <div style={{ fontSize: '13px', lineHeight: '1.4', paddingBottom: '6px', flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '5px', marginRight: '-5px' }}>
        {topicTree.length === 0 ? (
          <div style={{ color: '#888', fontSize: '13px' }}>No topics yet.</div>
        ) : (
          filteredTree.length === 0 ? (
            <div style={{ color: '#888', fontSize: '13px' }}>No matching topics.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {filteredTree.map((treeNode) => (
                <TopicTreeNode key={treeNode.node.fullPath} treeNode={treeNode} depth={0} {...nodeProps} />
              ))}
            </ul>
          )
        )}
      </div>
    </>
  );
}

export default React.memo(TopicList);
