import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import '../styles/App.css';

// Context for disclosure level
const DisclosureContext = createContext(2);

// Node type icons
const NODE_TYPE_ICONS = {
  concept: '💡',
  entity: '🏢',
  action: '⚡',
  example: '📌',
  attribute: '🎨',
  relationship: '🔗'
};

// Node type colors
const NODE_TYPE_COLORS = {
  concept: '#4ECDC4',
  entity: '#FF6B6B',
  action: '#FFA07A',
  example: '#98D8C8',
  attribute: '#BB8FCE',
  relationship: '#45B7D1'
};

// Recursive component to render tree nodes with importance filtering
function TreeNode({ nodeKey, nodeData, level = 0, expandMode, onTopicClick, selectedTopic, disclosureLevel }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Extract metadata from nodeData
  let children = {};
  let importance = 3;
  let nodeType = 'concept';
  let hasChildren = false;
  
  if (typeof nodeData === 'object' && nodeData !== null) {
    children = nodeData.children || {};
    importance = nodeData.importance || 3;
    nodeType = nodeData.type || 'concept';
    hasChildren = Object.keys(children).length > 0;
  } else {
    // Legacy format - just an empty object
    hasChildren = Object.keys(nodeData || {}).length > 0;
    children = nodeData || {};
  }

  // Don't render if below current disclosure level
  // Disclosure level 4 = show all, 1 = show only importance 5
  const minImportance = 6 - disclosureLevel; // Level 1->5, 2->4, 3->3, 4->1
  const shouldRender = importance >= minImportance;

  // React hooks must be called unconditionally
  useEffect(() => {
    if (shouldRender && expandMode === 'all') {
      setIsExpanded(true);
    } else if (shouldRender && expandMode === 'none') {
      setIsExpanded(false);
    }
  }, [expandMode, shouldRender]);

  // Return null after all hooks are called
  if (!shouldRender) {
    return null;
  }

  // Visual weight based on importance
  const fontSize = 13 + (importance - 1) * 1.5; // 13px to 19px
  const opacity = 0.5 + (importance / 10); // 0.6 to 1.0
  const fontWeight = importance >= 4 ? '600' : importance >= 3 ? '500' : '400';
  
  // Color based on node type
  const typeColor = NODE_TYPE_COLORS[nodeType] || NODE_TYPE_COLORS.concept;
  
  // Border thickness based on importance
  const borderLeftWidth = importance >= 4 ? '6px' : importance >= 3 ? '4px' : '3px';

  return (
    <div className="tree-node" style={{ marginLeft: `${level * 24}px`, opacity: opacity }}>
      <div
        className={`node-content ${selectedTopic === nodeKey ? 'selected' : ''}`}
        style={{
          backgroundColor: `${typeColor}20`, // 20% opacity
          borderLeft: `${borderLeftWidth} solid ${typeColor}`,
          fontSize: `${fontSize}px`,
          fontWeight: fontWeight,
        }}
        onClick={() => onTopicClick && onTopicClick(nodeKey)}
        title={`${nodeKey} (Importance: ${importance}/5, Type: ${nodeType})`}
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
        <span className="node-type-icon">{NODE_TYPE_ICONS[nodeType]}</span>
        <span className="node-label">{nodeKey}</span>
        <span className={`importance-badge importance-${importance}`} title={`Importance: ${importance}/5`}>
          {'★'.repeat(importance)}
        </span>
      </div>

      {isExpanded && hasChildren && (
        <div className="node-children">
          {Object.entries(children).map(([childKey, childData]) => (
            <TreeNode
              key={childKey}
              nodeKey={childKey}
              nodeData={childData}
              level={level + 1}
              expandMode={expandMode}
              onTopicClick={onTopicClick}
              selectedTopic={selectedTopic}
              disclosureLevel={disclosureLevel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MindmapResults({ mindmapData, insidesData }) {
  const [showRawData, setShowRawData] = useState(false);
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' | 'list' | 'details' | 'relationships'
  const [expandMode, setExpandMode] = useState('default'); // 'default', 'all', 'none'
  const [disclosureLevel, setDisclosureLevel] = useState(2); // 1=Critical only, 2=Important+, 3=Relevant+, 4=All
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [expandedContexts, setExpandedContexts] = useState({});
  const [selectedNodeType, setSelectedNodeType] = useState('all');
  const [showRelationships, setShowRelationships] = useState(true);
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
  
  // Get metadata
  const metadata = mindmapData.mindmap_metadata || {};
  const allNodes = metadata.all_nodes || [];
  const relationships = metadata.cross_topic_relationships || [];
  const importanceDistribution = metadata.importance_distribution || {};
  const typeDistribution = metadata.type_distribution || {};

  // Count total unique topics
  const countTopics = (obj) => {
    if (!obj || typeof obj !== 'object') return 0;
    let count = 0;
    for (const [key, value] of Object.entries(obj)) {
      count++;
      if (typeof value === 'object' && value !== null && value.children) {
        count += countTopics(value.children);
      } else if (typeof value === 'object' && value !== null) {
        count += countTopics(value);
      }
    }
    return count;
  };

  const totalTopics = countTopics(structure);

  // Get visible nodes based on disclosure level
  const getVisibleNodes = () => {
    const minImportance = 6 - disclosureLevel;
    return allNodes.filter(node => node.importance >= minImportance);
  };

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

  // Function to check if a node is an "inside"
  const isInsideNode = (nodeKey) => {
    if (!insidesData || !Array.isArray(insidesData)) return false;
    const nodeLower = nodeKey.toLowerCase();
    return insidesData.some(inside => {
      if (!inside.is_inside) return false;
      const insideText = inside.text.toLowerCase();
      // Check if node is a substring of inside text or vice versa
      return insideText.includes(nodeLower) || nodeLower.includes(insideText.split(' ').slice(0, 2).join(' '));
    });
  };

  // Function to get context sentences
  const getContext = (index, count = 3) => {
    if (!mindmapData.sentences) return { prev: [], next: [] };

    const arrayIndex = index - 1;

    const prev = [];
    const next = [];

    for (let i = count; i > 0; i--) {
      if (arrayIndex - i >= 0) {
        prev.push({
          index: index - i,
          text: mindmapData.sentences[arrayIndex - i]
        });
      }
    }

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

  // Disclosure level labels
  const disclosureLabels = {
    1: 'Critical Only',
    2: 'Important+',
    3: 'Relevant+',
    4: 'Show All'
  };

  return (
    <DisclosureContext.Provider value={disclosureLevel}>
      <div className="mindmap-results-container">
        <div className="mindmap-results-header">
          <h2>🧠 Mindmap Analysis</h2>
          <div className="mindmap-stats">
            <span className="stat-item">📊 {sentenceCount} sentences analyzed</span>
            <span className="stat-item">🏷️ {mindmapResults.length} topic hierarchies</span>
            <span className="stat-item">🌳 {totalTopics} total unique topics</span>
            {metadata.node_count && (
              <span className="stat-item">📈 {metadata.node_count} nodes extracted</span>
            )}
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
              className={`tab-btn ${activeTab === 'relationships' ? 'active' : ''}`}
              onClick={() => setActiveTab('relationships')}
            >
              🔗 Relations ({relationships.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
              onClick={() => setActiveTab('stats')}
            >
              📊 Stats
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

        {/* Progressive Disclosure Controls */}
        <div className="disclosure-controls">
          <div className="disclosure-section">
            <label className="disclosure-label">
              <span>🎯 Detail Level:</span>
              <input
                type="range"
                min="1"
                max="4"
                value={disclosureLevel}
                onChange={(e) => setDisclosureLevel(parseInt(e.target.value))}
                className="disclosure-slider"
              />
              <span className="disclosure-value">{disclosureLabels[disclosureLevel]}</span>
            </label>
            <span className="disclosure-count">
              ({getVisibleNodes().length} of {allNodes.length} nodes visible)
            </span>
          </div>
        </div>

        <div className="mindmap-results-content" ref={mindmapContentRef}>
          {activeTab === 'tree' && (
            <div className="mindmap-body">
              <div className="mindmap-left">
                <div className="tree-view">
                  {Object.keys(structure).length > 0 ? (
                    <>
                      <h3>Topic Hierarchy
                        <span className="legend-toggle" title="Show/Hide Legend">
                          <details className="legend-details">
                            <summary>📖 Legend</summary>
                            <div className="legend-content">
                              <div className="legend-section">
                                <strong>Node Types:</strong>
                                {Object.entries(NODE_TYPE_ICONS).map(([type, icon]) => (
                                  <span key={type} className="legend-item">
                                    {icon} {type}
                                  </span>
                                ))}
                              </div>
                              <div className="legend-section">
                                <strong>Importance:</strong>
                                <span className="legend-item">★★★★★ Critical</span>
                                <span className="legend-item">★★★★☆ Important</span>
                                <span className="legend-item">★★★☆☆ Relevant</span>
                                <span className="legend-item">★★☆☆☆ Minor</span>
                                <span className="legend-item">★☆☆☆☆ Incidental</span>
                              </div>
                            </div>
                          </details>
                        </span>
                      </h3>
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
                              nodeKey={topicKey}
                              nodeData={topicData}
                              level={0}
                              expandMode={expandMode}
                              onTopicClick={setSelectedTopic}
                              selectedTopic={selectedTopic}
                              disclosureLevel={disclosureLevel}
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
                                        {result.topic_metadata && result.topic_metadata[topicIdx] && (
                                          <span className="topic-meta-badge">
                                            {NODE_TYPE_ICONS[result.topic_metadata[topicIdx].type]}
                                            {'★'.repeat(result.topic_metadata[topicIdx].importance)}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

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
                                {result.topic_metadata && result.topic_metadata[topicIdx] && (
                                  <span className="topic-meta-inline">
                                    {' '}{NODE_TYPE_ICONS[result.topic_metadata[topicIdx].type]}
                                    <span className={`importance-dots importance-${result.topic_metadata[topicIdx].importance}`}>
                                      {'●'.repeat(result.topic_metadata[topicIdx].importance)}
                                    </span>
                                  </span>
                                )}
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

          {activeTab === 'relationships' && (
            <div className="details-view relationships-view">
              <h3>🔗 Cross-Topic Relationships</h3>
              {relationships.length > 0 ? (
                <div className="relationships-list">
                  {relationships.map((rel, idx) => (
                    <div key={idx} className="relationship-item">
                      <div className="relationship-nodes">
                        <span className="relationship-source">{rel.source}</span>
                        <span className={`relationship-arrow relationship-${rel.relationship}`}>
                          → {rel.relationship.replace(/_/g, ' ')} →
                        </span>
                        <span className="relationship-target">{rel.target}</span>
                      </div>
                      {rel.description && (
                        <div className="relationship-description">{rel.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mindmap-placeholder">
                  <div className="placeholder-icon">🔗</div>
                  <h2>No Relationships Found</h2>
                  <p>No cross-topic connections were identified.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="details-view stats-view">
              <h3>📊 Mindmap Statistics</h3>
              
              <div className="stats-grid">
                <div className="stats-card">
                  <h4>Importance Distribution</h4>
                  <div className="stats-bars">
                    {[5, 4, 3, 2, 1].map(level => (
                      <div key={level} className="stat-bar-row">
                        <span className="stat-label">{'★'.repeat(level)}</span>
                        <div className="stat-bar-container">
                          <div 
                            className={`stat-bar importance-${level}`}
                            style={{ 
                              width: `${(importanceDistribution[String(level)] || 0) / (metadata.node_count || 1) * 100}%` 
                            }}
                          />
                        </div>
                        <span className="stat-count">{importanceDistribution[String(level)] || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stats-card">
                  <h4>Node Types</h4>
                  <div className="stats-type-grid">
                    {Object.entries(typeDistribution).map(([type, count]) => (
                      <div key={type} className="stats-type-item">
                        <span className="stats-type-icon">{NODE_TYPE_ICONS[type]}</span>
                        <span className="stats-type-name">{type}</span>
                        <span className="stats-type-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stats-card">
                  <h4>Overview</h4>
                  <div className="stats-overview">
                    <div className="overview-item">
                      <span className="overview-label">Total Nodes:</span>
                      <span className="overview-value">{metadata.node_count || 0}</span>
                    </div>
                    <div className="overview-item">
                      <span className="overview-label">Topic Mindmaps:</span>
                      <span className="overview-value">{Object.keys(structure).length}</span>
                    </div>
                    <div className="overview-item">
                      <span className="overview-label">Cross-Topic Relations:</span>
                      <span className="overview-value">{relationships.length}</span>
                    </div>
                    <div className="overview-item">
                      <span className="overview-label">Sentences Analyzed:</span>
                      <span className="overview-value">{sentenceCount}</span>
                    </div>
                  </div>
                </div>
              </div>
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
    </DisclosureContext.Provider>
  );
}

export default MindmapResults;
