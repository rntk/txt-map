import React, { useState, useEffect } from 'react';
import '../styles/App.css';

function TreeNode({ name, nodeData, level = 0, expandMode, onNodeClick, selectedNode, sentences }) {
  const [isExpanded, setIsExpanded] = useState(level < 1);

  const children = nodeData.children || {};
  const nodeSentences = nodeData.sentences || [];
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
        className={`node-content ${selectedNode === name ? 'selected' : ''}`}
        onClick={() => onNodeClick && onNodeClick(name, nodeSentences)}
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
        <span className="node-label">{name}</span>
        <span className="node-sentence-count">({nodeSentences.length})</span>
      </div>

      {isExpanded && hasChildren && (
        <div className="node-children">
          {Object.entries(children).map(([childKey, childData]) => (
            <TreeNode
              key={childKey}
              name={childKey}
              nodeData={childData}
              level={level + 1}
              expandMode={expandMode}
              onNodeClick={onNodeClick}
              selectedNode={selectedNode}
              sentences={sentences}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MindmapResults({ mindmapData }) {
  const [expandMode, setExpandMode] = useState('default');
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedSentenceIndices, setSelectedSentenceIndices] = useState([]);

  if (!mindmapData) {
    return (
      <div className="mindmap-results-container">
        <div className="mindmap-placeholder">
          <h2>No Data Available</h2>
          <p>Please analyze an article first.</p>
        </div>
      </div>
    );
  }

  const structure = mindmapData.topic_mindmaps || {};
  const sentences = mindmapData.sentences || [];

  const handleNodeClick = (name, sentenceIndices) => {
    setSelectedNode(name);
    setSelectedSentenceIndices(sentenceIndices || []);
  };

  return (
    <div className="mindmap-results-container">
      <div className="mindmap-results-header">
        <h2>Mindmap</h2>
      </div>

      <div className="mindmap-body">
        <div className="mindmap-left">
          <div className="tree-view">
            {Object.keys(structure).length > 0 ? (
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
                    {Object.entries(structure).map(([topicKey, topicData]) => (
                      <TreeNode
                        key={topicKey}
                        name={topicKey}
                        nodeData={topicData}
                        level={0}
                        expandMode={expandMode}
                        onNodeClick={handleNodeClick}
                        selectedNode={selectedNode}
                        sentences={sentences}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="mindmap-placeholder">
                <h2>No Topics Found</h2>
                <p>The analysis didn't identify any topic hierarchies.</p>
              </div>
            )}
          </div>
        </div>
        <div className="mindmap-right">
          <div className="topic-sentences-panel">
            <h3>{selectedNode ? `"${selectedNode}"` : 'Sentences'}</h3>
            {selectedNode && (
              <button
                className="close-panel-btn"
                onClick={() => { setSelectedNode(null); setSelectedSentenceIndices([]); }}
                title="Clear selection"
              >
                ×
              </button>
            )}
            <div className="topic-sentences-list">
              {selectedNode ? (
                selectedSentenceIndices.length > 0 ? (
                  selectedSentenceIndices.map((idx) => {
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
                  <div className="no-sentences">No sentences for this topic.</div>
                )
              ) : (
                <div className="no-sentences">Select a topic to see related sentences.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MindmapResults;
