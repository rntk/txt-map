import React, { useState, useEffect } from 'react';
import '../styles/App.css';

function PrefixTreeNode({ label, nodeData, level = 0, expandMode, onNodeClick, selectedNode }) {
  const [isExpanded, setIsExpanded] = useState(level < 1);

  const children = nodeData.children || {};
  const count = nodeData.count || 0;
  const hasChildren = Object.keys(children).length > 0;

  useEffect(() => {
    if (expandMode === 'all') {
      setIsExpanded(true);
    } else if (expandMode === 'none') {
      setIsExpanded(false);
    }
  }, [expandMode]);

  return (
    <div className="tree-node" style={{ marginLeft: `${level * 20}px` }}>
      <div
        className={`node-content ${selectedNode === nodeData ? 'selected' : ''}`}
        onClick={() => onNodeClick && onNodeClick(nodeData, label)}
      >
        {hasChildren && (
          <button
            className={`expand-btn ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            ▶
          </button>
        )}
        {!hasChildren && <span className="no-children-spacer"></span>}
        <span className="node-label">{label}</span>
        {count > 0 && <span className="node-sentence-count">({count})</span>}
      </div>

      {isExpanded && hasChildren && (
        <div className="node-children">
          {Object.entries(children).map(([childLabel, childData]) => (
            <PrefixTreeNode
              key={childLabel}
              label={childLabel}
              nodeData={childData}
              level={level + 1}
              expandMode={expandMode}
              onNodeClick={onNodeClick}
              selectedNode={selectedNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PrefixTreeResults({ treeData, sentences }) {
  const [expandMode, setExpandMode] = useState('default');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState(null);

  if (!treeData) {
    return (
      <div className="mindmap-results-container">
        <div className="mindmap-placeholder">
          <h2>No Data Available</h2>
          <p>Please analyze an article first.</p>
        </div>
      </div>
    );
  }

  const handleNodeClick = (nodeData, label) => {
    setSelectedNode(nodeData);
    setSelectedLabel(label);
  };

  const selectedCount = selectedNode ? (selectedNode.count || 0) : 0;
  const selectedSentences = selectedNode ? (selectedNode.sentences || []) : [];

  return (
    <div className="mindmap-results-container">
      <div className="mindmap-results-header" style={{ background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
        <h2>Prefix Tree</h2>
      </div>

      <div className="mindmap-body">
        <div className="mindmap-left">
          <div className="tree-view">
            {Object.keys(treeData).length > 0 ? (
              <>
                <div className="tree-controls">
                  <button
                    className="tree-control-btn"
                    onClick={() => setExpandMode('none')}
                  >
                    Fold All
                  </button>
                  <button
                    className="tree-control-btn"
                    onClick={() => setExpandMode('all')}
                  >
                    Unfold All
                  </button>
                </div>
                <div className="tree-scroller">
                  <div className="tree-root">
                    {Object.entries(treeData).map(([label, nodeData]) => (
                      <PrefixTreeNode
                        key={label}
                        label={label}
                        nodeData={nodeData}
                        level={0}
                        expandMode={expandMode}
                        onNodeClick={handleNodeClick}
                        selectedNode={selectedNode}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="mindmap-placeholder">
                <h2>No Data Found</h2>
                <p>The prefix tree analysis has not completed yet.</p>
              </div>
            )}
          </div>
        </div>
        <div className="mindmap-right">
          <div className="topic-sentences-panel">
            <h3>{selectedLabel ? `"${selectedLabel}"` : 'Sentences'}</h3>
            {selectedNode && (
              <button
                className="close-panel-btn"
                onClick={() => { setSelectedNode(null); setSelectedLabel(null); }}
                title="Clear selection"
              >
                ×
              </button>
            )}
            <div className="topic-sentences-list">
              {selectedNode ? (
                selectedCount > 0 ? (
                  selectedSentences.map((idx) => {
                    const text = sentences[idx - 1];
                    if (!text) return null;
                    return (
                      <div key={idx} className="topic-sentence-item">
                        <div className="sentence-main-content">
                          <div className="sentence-number">Sentence {idx}</div>
                          <div className="sentence-text">{text}</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="no-sentences">Intermediate prefix — select a child node to see sentences.</div>
                )
              ) : (
                <div className="no-sentences">Select a word node to see related sentences.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrefixTreeResults;
