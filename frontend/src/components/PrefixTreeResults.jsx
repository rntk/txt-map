import React, { useState, useRef, useMemo, useCallback } from 'react';
import FullScreenGraph from './FullScreenGraph';
import HierarchicalTree, { buildPrefixTreeHierarchy } from './shared/HierarchicalTree';
import '../styles/App.css';

function PrefixTreeResults({ treeData, sentences, fullscreen = false, onCloseFullscreen }) {
  const [expandMode, setExpandMode] = useState('default');
  const [foldDepth, setFoldDepth] = useState(null);
  const foldDepthRef = useRef(0);
  const [selectedPanels, setSelectedPanels] = useState([]);

  const handleLegendClick = (depth) => {
    foldDepthRef.current += 1;
    setFoldDepth(prev => {
      const wasCollapsed = prev && prev.depth === depth && prev.collapse;
      return { depth, key: foldDepthRef.current, collapse: !wasCollapsed };
    });
  };

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

  const hierarchyData = useMemo(() => buildPrefixTreeHierarchy(treeData), [treeData]);

  const handleNodeClick = useCallback((name, sentenceIndices, path) => {
    if (!path) return;
    setSelectedPanels((prev) => {
      const existingIndex = prev.findIndex((panel) => panel.path === path);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated.splice(existingIndex, 1);
        return updated;
      }
      const nextPanel = { path, name, sentenceIndices: sentenceIndices || [] };
      return [...prev, nextPanel];
    });
  }, []);

  const handlePanelDrag = useCallback((path, x, y) => {
    setSelectedPanels((prev) => {
      const index = prev.findIndex((p) => p.path === path);
      if (index === -1) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], x, y };
      return updated;
    });
  }, []);

  const closePanel = useCallback((path) => {
    setSelectedPanels((prev) => prev.filter((panel) => panel.path !== path));
  }, []);

  const handleClose = () => {
    if (onCloseFullscreen) {
      onCloseFullscreen();
    }
  };

  const graphContent = (
    <div className="mindmap-results-container">
      <div className="mindmap-body">
        <div className="mindmap-left">
          <div className="hierarchical-tree-wrapper">
            {Object.keys(treeData).length > 0 ? (
              <>
                <HierarchicalTree
                  hierarchyData={hierarchyData}
                  onNodeSelect={handleNodeClick}
                  onClosePanel={closePanel}
                  onPanelDrag={handlePanelDrag}
                  selectedPanels={selectedPanels}
                  sentences={sentences}
                  expandMode={expandMode}
                  foldDepth={foldDepth}
                  nodeSpacing={300}
                  emptyPanelMessage="Intermediate prefix - select a child node to see sentences."
                />
              </>
            ) : (
              <div className="mindmap-placeholder">
                <h2>No Data Found</h2>
                <p>The prefix tree analysis has not completed yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <FullScreenGraph
        onClose={handleClose}
        title="🌳 Prefix Tree"
        toolbar={
          <>
            <div className="toolbar-legend">
              <div className="legend-item" onClick={() => handleLegendClick(1)} style={{cursor:'pointer'}} title="Toggle Root level fold"><span className="legend-dot root"></span><span>Root</span></div>
              <div className="legend-item" onClick={() => handleLegendClick(2)} style={{cursor:'pointer'}} title="Toggle Prefix level fold"><span className="legend-dot internal"></span><span>Prefix</span></div>
              <div className="legend-item" onClick={() => handleLegendClick(3)} style={{cursor:'pointer'}} title="Toggle Word level fold"><span className="legend-dot leaf"></span><span>Word</span></div>
            </div>
            <div className="tree-controls">
              <button className="tree-control-btn" onClick={() => setExpandMode('none')}>Fold All</button>
              <button className="tree-control-btn" onClick={() => setExpandMode('all')}>Unfold All</button>
            </div>
          </>
        }
      >
        {graphContent}
      </FullScreenGraph>
    );
  }

  return graphContent;
}

export default PrefixTreeResults;
