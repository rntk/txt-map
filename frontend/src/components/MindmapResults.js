import React, { useState, useEffect, useRef } from 'react';
import '../styles/App.css';

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
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
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
  const [panelTop, setPanelTop] = useState(10);
  const [expandedContexts, setExpandedContexts] = useState({}); // State for expanded contexts
  const mindmapContentRef = useRef(null);

  if (!mindmapData) {
    return (
      <div className="mindmap-results-container">
        <div className="mindmap-placeholder">
          <div className="placeholder-icon">⚠️</div>
          <h2>No Data Available</h2>
          <p>Please analyze an article first.</p>
        </div>
      </div>
    );
  }

  const aggregatedMindmap = mindmapData.aggregated_mindmap || {};
  const structure = aggregatedMindmap.structure || mindmapData.topic_mindmaps || {};
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

  // Function to get context sentences
  const getContext = (index, count = 3) => {
    if (!mindmapData.sentences) return { prev: [], next: [] };

    // index is 1-based in result.sentence_index, but array is 0-based
    const arrayIndex = index - 1;

    const prev = [];
    const next = [];

    // Get previous sentences
    for (let i = count; i > 0; i--) {
      if (arrayIndex - i >= 0) {
        prev.push({
          index: index - i,
          text: mindmapData.sentences[arrayIndex - i]
        });
      }
    }

    // Get next sentences
    for (let i = 1; i <= count; i++) {
      if (arrayIndex + i < mindmapData.sentences.length) {
        next.push({
          index: index + i,
          text: mindmapData.sentences[arrayIndex + i]
        });
      }
    }

    return { prev, next };
  };

  const toggleContext = (index) => {
    setExpandedContexts(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  return (
    <div className="mindmap-results-container">
      <div className="mindmap-results-header">
        <h2>🧠 Mindmap Analysis</h2>
        <div className="mindmap-stats">
          <span className="stat-item">📊 {sentenceCount} sentences analyzed</span>
          <span className="stat-item">🏷️ {mindmapResults.length} topic hierarchies</span>
          <span className="stat-item">🌳 {totalTopics} total unique topics</span>
        </div>
      </div>

      <div className="mindmap-results-controls">
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

      <div className="mindmap-results-content" ref={mindmapContentRef}>
        {activeTab === 'tree' && (
          <div className="mindmap-body">
            <div className="mindmap-left">
              <div className="tree-view">
                {Object.keys(structure).length > 0 ? (
                  <>
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
                    <div className="tree-scroller">
                      <div className="tree-root">
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
                    </div>
                  </>
                ) : (
                  <div className="mindmap-placeholder">
                    <div className="placeholder-icon">📭</div>
                    <h2>No Topics Found</h2>
                    <p>The analysis didn't identify any topic hierarchies.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="mindmap-right">
              <div className="topic-sentences-panel">
                <h3>{selectedTopic ? `Sentences for topic: "${selectedTopic}"` : 'Topic Sentences'}</h3>
                {selectedTopic && (
                  <button
                    className="close-panel-btn"
                    onClick={() => setSelectedTopic(null)}
                    title="Clear selection"
                  >
                    ×
                  </button>
                )}
                <div className="topic-sentences-list">
                  {selectedTopic ? (
                    getSentencesForTopic(selectedTopic).length > 0 ? (
                      getSentencesForTopic(selectedTopic).map((result, idx) => (
                        <div key={idx} className={`topic-sentence-item ${expandedContexts[result.sentence_index] ? 'expanded-context' : ''}`}>
                          {/* Context Previous */}
                          {expandedContexts[result.sentence_index] && (
                            <div className="context-prev">
                              {getContext(result.sentence_index).prev.map(ctx => (
                                <div key={ctx.index} className="context-sentence prev">
                                  <span className="context-number">{ctx.index}</span> {ctx.text}
                                </div>
                              ))}
                              {getContext(result.sentence_index).prev.length === 0 && <div className="context-empty">No previous context</div>}
                            </div>
                          )}

                          <div className="sentence-main-content">
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

                          {/* Context Next */}
                          {expandedContexts[result.sentence_index] && (
                            <div className="context-next">
                              {getContext(result.sentence_index).next.map(ctx => (
                                <div key={ctx.index} className="context-sentence next">
                                  <span className="context-number">{ctx.index}</span> {ctx.text}
                                </div>
                              ))}
                              {getContext(result.sentence_index).next.length === 0 && <div className="context-empty">No next context</div>}
                            </div>
                          )}

                          <button
                            className="context-btn"
                            onClick={() => toggleContext(result.sentence_index)}
                          >
                            {expandedContexts[result.sentence_index] ? 'Hide Context' : 'Show Context'}
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="no-sentences">No sentences found for this topic.</div>
                    )
                  ) : (
                    <div className="no-sentences">Select a topic on the left to see related sentences.</div>
                  )}
                </div>
              </div>
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
              <div className="mindmap-placeholder">
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
          <div className="summary-modal-overlay" onClick={() => setShowRawData(false)}>
            <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
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
                <pre className="raw-data">
                  {JSON.stringify(mindmapData, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MindmapResults;
