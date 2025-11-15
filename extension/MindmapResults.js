import React, { useState, useEffect } from 'react';
import '../frontend/src/styles/App.css';

// Recursive component to render tree nodes
function TreeNode({ nodeKey, children, level = 0, expandMode, onTopicClick, selectedTopic }) {
  const [isExpanded, setIsExpanded] = useState(false); // All branches folded by default
  const hasChildren = children && Object.keys(children).length > 0;

  useEffect(() => {
    if (expandMode === 'all') {
      setIsExpanded(true);
    } else if (expandMode === 'none') {
      setIsExpanded(false);
    }
    // For 'default', keep the current state
  }, [expandMode]);

  const colors = [
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#45B7D1', // Blue
    '#FFA07A', // Salmon
    '#98D8C8', // Mint
    '#F7DC6F', // Yellow
    '#BB8FCE', // Purple
    '#85C1E2', // Light Blue
  ];

  const color = colors[level % colors.length];

  return (
    <div className="tree-node" style={{ marginLeft: `${level * 24}px` }}>
      <div
        className={`node-content ${selectedTopic === nodeKey ? 'selected' : ''}`}
        style={{
          backgroundColor: color,
          borderLeft: `4px solid ${color}`,
        }}
        onClick={() => onTopicClick && onTopicClick(nodeKey)}
      >
        {hasChildren && (
          <button
            className={`expand-btn ${isExpanded ? 'expanded' : ''}`}
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            ▶
          </button>
        )}
        {!hasChildren && <span className="no-children-spacer"></span>}
        <span className="node-label">{nodeKey}</span>
      </div>

      {isExpanded && hasChildren && (
        <div className="node-children">
          {Object.entries(children).map(([childKey, childChildren]) => (
            <TreeNode
              key={childKey}
              nodeKey={childKey}
              children={childChildren}
              level={level + 1}
              expandMode={expandMode}
              onTopicClick={onTopicClick}
              selectedTopic={selectedTopic}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MindmapResults({ mindmapData }) {
  const [showRawData, setShowRawData] = useState(false);
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' | 'list' | 'details'
  const [expandMode, setExpandMode] = useState('default'); // 'default', 'all', 'none'
  const [selectedTopic, setSelectedTopic] = useState(null); // Track selected topic for showing sentences

  if (!mindmapData) {
    return (
      <div className="mindmap-container">
        <div className="mindmap-header">
          <h1>Mindmap Analysis</h1>
        </div>
        <div className="mindmap-content">
          <div className="placeholder">
            <div className="placeholder-icon">⚠️</div>
            <h2>No Data Available</h2>
            <p>Please analyze an article first.</p>
          </div>
        </div>
      </div>
    );
  }

  const aggregatedMindmap = mindmapData.aggregated_mindmap || {};
  const structure = aggregatedMindmap.structure || {};
  const mindmapResults = mindmapData.mindmap_results || [];
  const sentenceCount = mindmapData.sentences ? mindmapData.sentences.length : 0;

  // Count total unique topics
  const countTopics = (obj) => {
    if (!obj || typeof obj !== 'object') return 0;
    return Object.keys(obj).length + Object.values(obj).reduce((sum, child) => sum + countTopics(child), 0);
  };

  const totalTopics = countTopics(structure);

  // Function to get sentences for a specific topic
  const getSentencesForTopic = (topicName) => {
    if (!mindmapResults || !Array.isArray(mindmapResults)) return [];
    
    return mindmapResults.filter(result => 
      result.mindmap_topics && 
      result.mindmap_topics.some(hierarchy => 
        hierarchy.some(topic => topic === topicName)
      )
    );
  };

  return (
    <div className="mindmap-container">
      <div className="mindmap-header">
        <h1>🧠 Mindmap Analysis</h1>
        <div className="mindmap-stats">
          <span className="stat-item">📊 {sentenceCount} sentences analyzed</span>
          <span className="stat-item">🏷️ {mindmapResults.length} topic hierarchies</span>
          <span className="stat-item">🌳 {totalTopics} total unique topics</span>
        </div>
      </div>

      <div className="mindmap-controls">
        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'tree' ? 'active' : ''}`}
            onClick={() => setActiveTab('tree')}
          >
            🌳 Tree View
          </button>
          <button
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            📋 Details
          </button>
          <button
            className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            📄 Raw Data
          </button>
        </div>
        <button
          className="toggle-raw-btn"
          onClick={() => setShowRawData(!showRawData)}
          title={showRawData ? 'Hide raw data' : 'Show raw data'}
        >
          {showRawData ? '🔽 Hide' : '🔽 Show'} Raw JSON
        </button>
      </div>

      <div className="mindmap-content">
        {activeTab === 'tree' && (
          <div className="tree-view">
            {Object.keys(structure).length > 0 ? (
              <div className="tree-root">
                <h3>Topic Hierarchy</h3>
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
                {Object.entries(structure).map(([topicKey, children]) => (
                  <TreeNode
                    key={topicKey}
                    nodeKey={topicKey}
                    children={children}
                    level={0}
                    expandMode={expandMode}
                    onTopicClick={setSelectedTopic}
                    selectedTopic={selectedTopic}
                  />
                ))}
              </div>
            ) : (
              <div className="placeholder">
                <div className="placeholder-icon">📭</div>
                <h2>No Topics Found</h2>
                <p>The analysis didn't identify any topic hierarchies.</p>
              </div>
            )}
          </div>
        )}

        {selectedTopic && (
          <div className="topic-sentences-panel">
            <h3>Sentences for topic: "{selectedTopic}"</h3>
            <button 
              className="close-panel-btn"
              onClick={() => setSelectedTopic(null)}
              title="Close panel"
            >
              ×
            </button>
            <div className="topic-sentences-list">
              {getSentencesForTopic(selectedTopic).map((result, idx) => (
                <div key={idx} className="topic-sentence-item">
                  <div className="sentence-number">Sentence {result.sentence_index}</div>
                  <div className="sentence-text">{result.sentence}</div>
                  {result.mindmap_topics && result.mindmap_topics.length > 0 && (
                    <div className="sentence-topics">
                      <strong>Topic hierarchies:</strong>
                      <ul>
                        {result.mindmap_topics.map((hierarchy, topicIdx) => (
                          <li key={topicIdx} className="topic-hierarchy">
                            {hierarchy.join(' > ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
              {getSentencesForTopic(selectedTopic).length === 0 && (
                <div className="no-sentences">No sentences found for this topic.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="details-view">
            <h3>Sentence-by-Sentence Analysis</h3>
            {mindmapResults.length > 0 ? (
              <div className="sentence-list">
                {mindmapResults.map((result, idx) => (
                  <div key={idx} className="sentence-item">
                    <div className="sentence-number">Sentence {result.sentence_index}</div>
                    <div className="sentence-text">{result.sentence}</div>
                    {result.mindmap_topics && result.mindmap_topics.length > 0 ? (
                      <div className="topics-hierarchy">
                        <strong>Topics identified:</strong>
                        <ul>
                          {result.mindmap_topics.map((topicHierarchy, topicIdx) => (
                            <li key={topicIdx} className="topic-hierarchy">
                              {topicHierarchy.join(' > ')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="no-topics">No topics identified for this sentence</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="placeholder">
                <div className="placeholder-icon">📭</div>
                <h2>No Results</h2>
              </div>
            )}
          </div>
        )}

        {activeTab === 'details' && (
          <div className="details-view">
            <h3>Raw Data Structure</h3>
            <pre className="raw-data">
              {JSON.stringify(mindmapData, null, 2)}
            </pre>
          </div>
        )}

        {showRawData && (
          <div className="raw-data-modal-overlay" onClick={() => setShowRawData(false)}>
            <div className="raw-data-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Full Data Structure</h3>
                <button
                  className="modal-close"
                  onClick={() => setShowRawData(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <pre className="raw-data-full">
                  {JSON.stringify(mindmapData, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .mindmap-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background-color: #ffffff;
        }

        .mindmap-header {
          padding: 20px;
          border-bottom: 2px solid #e0e0e0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .mindmap-header h1 {
          margin: 0 0 10px 0;
          color: white;
          font-size: 28px;
          font-weight: bold;
        }

        .mindmap-stats {
          display: flex;
          gap: 20px;
          font-size: 14px;
          opacity: 0.95;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .mindmap-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 20px;
          border-bottom: 1px solid #e0e0e0;
          background-color: #fafafa;
          flex-wrap: wrap;
          gap: 10px;
        }

        .tabs {
          display: flex;
          gap: 8px;
        }

        .tab-btn {
          padding: 8px 16px;
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .tab-btn:hover {
          border-color: #667eea;
          color: #667eea;
        }

        .tab-btn.active {
          background-color: #667eea;
          color: white;
          border-color: #667eea;
        }

        .toggle-raw-btn {
          padding: 8px 16px;
          background-color: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .toggle-raw-btn:hover {
          background-color: #e0e0e0;
        }

        .mindmap-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          background-color: #ffffff;
        }

        .tree-view {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 20px;
          max-width: 1200px;
        }

        .tree-root h3 {
          margin-top: 0;
          color: #333;
          font-size: 16px;
          border-bottom: 2px solid #667eea;
          padding-bottom: 10px;
        }

        .tree-controls {
          display: flex;
          gap: 10px;
          margin-bottom: 15px;
        }

        .tree-control-btn {
          padding: 6px 12px;
          background-color: #667eea;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: background-color 0.2s ease;
        }

        .tree-control-btn:hover {
          background-color: #5a67d8;
        }

        .tree-node {
          margin: 8px 0;
        }

        .node-content {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          background-color: #ffffff;
          border-radius: 6px;
          border: 1px solid #eee;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .node-content:hover {
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          transform: translateX(2px);
        }

        .node-content.selected {
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
          transform: translateX(4px);
          border-left-width: 6px;
          font-weight: bold;
        }

        .expand-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          padding: 0;
          margin-right: 8px;
          background-color: transparent;
          border: none;
          cursor: pointer;
          font-size: 12px;
          transition: transform 0.2s ease;
          color: #666;
        }

        .expand-btn:hover {
          color: #333;
        }

        .expand-btn.expanded {
          transform: rotate(90deg);
        }

        .no-children-spacer {
          display: inline-block;
          width: 24px;
          margin-right: 8px;
        }

        .node-label {
          font-weight: 500;
          color: #333;
          font-size: 14px;
        }

        .node-children {
          margin-top: 4px;
        }

        .details-view {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 20px;
          max-width: 1200px;
        }

        .details-view h3 {
          margin-top: 0;
          color: #333;
          font-size: 16px;
          border-bottom: 2px solid #667eea;
          padding-bottom: 10px;
        }

        .sentence-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .sentence-item {
          background-color: white;
          border-left: 4px solid #667eea;
          padding: 15px;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .sentence-number {
          display: inline-block;
          background-color: #667eea;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 8px;
        }

        .sentence-text {
          display: block;
          margin: 8px 0 12px 0;
          color: #333;
          line-height: 1.6;
          font-size: 14px;
        }

        .topics-hierarchy {
          margin-top: 10px;
          font-size: 13px;
        }

        .topics-hierarchy strong {
          color: #667eea;
        }

        .topics-hierarchy ul {
          margin: 8px 0 0 0;
          padding-left: 20px;
          list-style: none;
        }

        .topic-hierarchy {
          color: #555;
          padding: 4px 0;
          margin: 4px 0;
          border-left: 2px solid #764ba2;
          padding-left: 12px;
          font-family: 'Courier New', monospace;
          font-size: 13px;
        }

        .no-topics {
          color: #999;
          font-style: italic;
          font-size: 13px;
        }

        .raw-data {
          background-color: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 15px;
          overflow-x: auto;
          font-size: 12px;
          line-height: 1.5;
          color: #333;
          max-height: 500px;
          overflow-y: auto;
        }

        .raw-data-full {
          background-color: #f5f5f5;
          padding: 15px;
          overflow-x: auto;
          font-size: 12px;
          line-height: 1.5;
          color: #333;
          border-radius: 6px;
          margin: 0;
        }

        .raw-data-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .raw-data-modal {
          background-color: white;
          border-radius: 8px;
          width: 90%;
          max-width: 900px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
          background-color: #f9f9f9;
        }

        .modal-header h3 {
          margin: 0;
          color: #333;
          font-size: 18px;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 28px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-close:hover {
          color: #333;
        }

        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .placeholder {
          text-align: center;
          padding: 60px 40px;
          border: 2px dashed #ddd;
          border-radius: 8px;
          background-color: #f9f9f9;
          max-width: 600px;
          margin: 40px auto;
        }

        .placeholder-icon {
          font-size: 64px;
          margin-bottom: 20px;
        }

        .placeholder h2 {
          color: #333;
          margin: 10px 0;
          font-size: 24px;
        }

        .placeholder p {
          color: #666;
          margin: 10px 0;
          font-size: 16px;
        }

        .topic-sentences-panel {
          background-color: #f0f8ff;
          border-radius: 8px;
          padding: 20px;
          margin-top: 20px;
          max-width: 1200px;
          border: 2px solid #667eea;
          position: relative;
        }

        .topic-sentences-panel h3 {
          margin-top: 0;
          color: #333;
          font-size: 18px;
          border-bottom: 2px solid #667eea;
          padding-bottom: 10px;
          margin-bottom: 15px;
        }

        .close-panel-btn {
          position: absolute;
          top: 15px;
          right: 15px;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s ease;
        }

        .close-panel-btn:hover {
          background-color: #e0e0e0;
          color: #333;
        }

        .topic-sentences-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
          max-height: 400px;
          overflow-y: auto;
        }

        .topic-sentence-item {
          background-color: white;
          border-left: 4px solid #667eea;
          padding: 15px;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .sentence-topics {
          margin-top: 10px;
          font-size: 13px;
        }

        .sentence-topics strong {
          color: #667eea;
        }

        .sentence-topics ul {
          margin: 8px 0 0 0;
          padding-left: 20px;
          list-style: none;
        }

        .no-sentences {
          text-align: center;
          color: #999;
          font-style: italic;
          padding: 40px;
          font-size: 16px;
        }

        @media (max-width: 768px) {
          .mindmap-header {
            padding: 15px;
          }

          .mindmap-header h1 {
            font-size: 22px;
          }

          .mindmap-stats {
            flex-direction: column;
            gap: 8px;
          }

          .mindmap-controls {
            flex-direction: column;
            align-items: flex-start;
          }

          .tabs {
            width: 100%;
            flex-wrap: wrap;
          }

          .tree-node {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

export default MindmapResults;
