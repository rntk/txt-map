import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import '../styles/App.css';

function HierarchicalTree({
  data,
  onNodeSelect,
  onClosePanel,
  selectedPanels,
  sentences,
  expandMode
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const gRef = useRef(null);
  const zoomBehaviorRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const [expandState, setExpandState] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Convert data to D3 hierarchy format
  const hierarchyData = useMemo(() => {
    if (!data || Object.keys(data).length === 0) return null;

    const roots = [];

    Object.entries(data).forEach(([topicKey, topicData]) => {
      const buildChildren = (nodeData, parentPath = '', key = '') => {
        const children = nodeData.children || {};
        const currentPath = parentPath ? `${parentPath}/${key}` : key;
        return Object.entries(children).map(([childKey, childData]) => ({
          name: childKey,
          sentences: childData.sentences || [],
          children: buildChildren(childData, currentPath, childKey),
          path: `${currentPath}/${childKey}`
        }));
      };

      roots.push({
        name: topicKey,
        sentences: topicData.sentences || [],
        children: buildChildren(topicData, '', topicKey),
        path: topicKey
      });
    });

    return roots;
  }, [data]);

  // Handle expandMode changes
  useEffect(() => {
    if (!hierarchyData || expandMode === 'default') return;

    if (expandMode === 'all') {
      setExpandState({});
    } else if (expandMode === 'none') {
      const collapsed = {};
      const traverse = (node) => {
        if (node.path && node.children && node.children.length > 0) {
          collapsed[node.path] = true;
          node.children.forEach(traverse);
        }
      };
      hierarchyData.forEach(traverse);
      setExpandState(collapsed);
    }
  }, [expandMode, hierarchyData]); // Added hierarchyData dependency

  const toggleNode = (nodePath) => {
    setExpandState(prev => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  };

  const buildTree = (node) => {
    if (!node) return null;

    const result = { ...node };
    const isCollapsed = node.path ? expandState[node.path] : false;

    if (result.children && result.children.length > 0) {
      result._children = result.children;
      if (isCollapsed) {
        result.children = null;
      } else {
        result.children = result.children.map(child => buildTree(child));
      }
    }

    return result;
  };

  // Dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const updateDimensions = () => {
      setDimensions({
        width: Math.max(1200, containerRef.current.clientWidth),
        height: Math.max(800, containerRef.current.clientHeight)
      });
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []); // Only setup once

  // Initialize SVG Structure
  useEffect(() => {
    if (!svgRef.current || isInitialized) return;

    const svg = d3.select(svgRef.current);
    // Clear in case of hot reload
    svg.selectAll('*').remove();

    const margin = { top: 100, right: 200, bottom: 100, left: 200 };

    // Group for zoom/pan
    const g = svg.append('g').attr('class', 'tree-content');
    gRef.current = g;

    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    zoomBehaviorRef.current = zoom;

    svg.call(zoom);

    // Create groups
    g.append('g').attr('class', 'tree-links').attr('transform', `translate(${margin.left},${margin.top})`);
    g.append('g').attr('class', 'tree-nodes').attr('transform', `translate(${margin.left},${margin.top})`);

    // Zoom controls
    const zoomGroup = svg.append('g').attr('class', 'zoom-controls');
    
    // Create Zoom UI elements
    zoomGroup.append('circle')
      .attr('r', 40)
      .attr('fill', 'rgba(255, 255, 255, 0.9)')
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 1);

    zoomGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-10')
      .attr('fill', '#6b7280')
      .style('font-size', '10px')
      .text('Zoom');

    // Zoom In
    const zoomInBtn = zoomGroup.append('g')
      .attr('class', 'zoom-btn')
      .attr('transform', 'translate(-10, 5)')
      .on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1.3));
    
    zoomInBtn.append('circle').attr('r', 14).attr('fill', '#3b82f6').attr('stroke', '#2563eb');
    zoomInBtn.append('text').attr('text-anchor', 'middle').attr('dy', '4').attr('fill', 'white')
      .style('font-size', '16px').style('font-weight', 'bold').text('+');

    // Zoom Out
    const zoomOutBtn = zoomGroup.append('g')
      .attr('class', 'zoom-btn')
      .attr('transform', 'translate(10, 5)')
      .on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 0.7));

    zoomOutBtn.append('circle').attr('r', 14).attr('fill', '#3b82f6').attr('stroke', '#2563eb');
    zoomOutBtn.append('text').attr('text-anchor', 'middle').attr('dy', '4').attr('fill', 'white')
      .style('font-size', '16px').style('font-weight', 'bold').text('−');

    // Reset
    const resetBtn = zoomGroup.append('g')
      .attr('class', 'zoom-btn')
      .attr('transform', 'translate(0, 30)')
      .on('click', () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity));

    resetBtn.append('circle').attr('r', 12).attr('fill', '#6b7280').attr('stroke', '#4b5563');
    resetBtn.append('text').attr('text-anchor', 'middle').attr('dy', '4').attr('fill', 'white')
      .style('font-size', '10px').text('Reset');

    setIsInitialized(true);
  }, []); // Run once on mount

  // Update Dimensions and Zoom Control Position
  useEffect(() => {
    if (!svgRef.current || !isInitialized) return;
    const svg = d3.select(svgRef.current);
    svg.select('.zoom-controls')
       .attr('transform', `translate(${dimensions.width - 60}, 20)`);
  }, [dimensions, isInitialized]);

  // Main Render Loop (Data Updates)
  useEffect(() => {
    if (!hierarchyData || !isInitialized || !gRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = gRef.current;
    const gNodes = g.select('.tree-nodes');
    const gLinks = g.select('.tree-links');
    
    // Use stored references or logic to determine position
    // Since 'source' is tricky in a full reactive update without tracking individual node state,
    // we will just center updates around their current position or parent.
    // For expanding nodes, D3's enter selection is key.
    
    const margin = { top: 100, right: 200, bottom: 100, left: 200 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    // Layout
    const treeLayout = d3.tree()
      .size([height * 60, width * 5])
      .separation((a, b) => {
        const siblingSpacing = 150;
        const cousinSpacing = 220;
        return (a.parent === b.parent ? siblingSpacing : cousinSpacing);
      });

    const updateGraph = () => {
      const duration = 300;
      
      const processedRoots = hierarchyData.map(root => buildTree(root));
      const rootData = { name: '__virtual_root__', children: processedRoots };
      const root = d3.hierarchy(rootData);

      root.descendants().forEach((node, i) => {
        node.id = i; 
        node._name = node.data.name;
        node._sentences = node.data.sentences;
        node._path = node.data.path;
      });

      treeLayout(root);

      const nodes = root.descendants().filter(d => d.data.name !== '__virtual_root__');
      const links = root.links().filter(d => d.source.data.name !== '__virtual_root__');

      // --- Nodes ---
      const nodeSelection = gNodes.selectAll('.tree-node-group')
        .data(nodes, d => d._path); // Key by path to maintain object constancy

      const nodeEnter = nodeSelection.enter()
        .append('g')
        .attr('class', 'tree-node-group')
        .attr('transform', d => {
             // Try to find parent's position for smooth enter
             // Since we don't strictly track 'source', we default to new position or parent
             // Ideally we'd look up the parent in the old DOM.
             // For now, simple transition from current place if possible or parent
             return `translate(${d.y},${d.x})`; 
        })
        .on('click', (event, d) => {
          event.stopPropagation();
          if (onNodeSelect) onNodeSelect(d._name, d._sentences, d._path);
        });

      nodeEnter.append('circle')
        .attr('class', 'tree-node-circle')
        .attr('r', 1e-6)
        .attr('fill', d => d.depth === 1 ? '#ef4444' : (d.data._children ? '#3b82f6' : '#14b8a6'));

      nodeEnter.append('text')
        .attr('class', 'tree-node-label')
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .text(d => d._name)
        .style('fill-opacity', 1e-6);

      nodeEnter.append('text')
          .attr('class', 'tree-node-count')
          .attr('dy', '1.5em')
          .attr('x', 0)
          .attr('text-anchor', 'middle')
          .attr('fill', '#6b7280')
          .style('font-size', '10px')
          .text(d => d._sentences && d._sentences.length > 0 ? `(${d._sentences.length})` : '')
          .style('fill-opacity', 1e-6);

      // Toggle btn
      const toggleGroup = nodeEnter.append('g')
        .attr('class', 'node-toggle-btn')
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          const path = d._path || d.data.path;
          if (path) toggleNode(path);
          if (onNodeSelect) onNodeSelect(d._name, d._sentences, d._path);
        });

      toggleGroup.append('circle')
        .attr('class', 'toggle-btn-bg')
        .attr('r', 0)
        .attr('cx', 20)
        .attr('fill', '#f9fafb')
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 1.5);
      
      toggleGroup.append('text')
        .attr('class', 'toggle-btn-icon')
        .attr('text-anchor', 'middle')
        .attr('x', 20)
        .attr('dy', '0.38em')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('');

      // UPDATE (Smooth transition to new positions)
      const nodeUpdate = nodeEnter.merge(nodeSelection);
      
      nodeUpdate.transition().duration(duration)
        .attr('transform', d => `translate(${d.y},${d.x})`);

      nodeUpdate.select('.tree-node-circle')
        .attr('class', d => {
             const classes = ['tree-node-circle'];
             if (selectedPanels.some((panel) => panel.path === d._path)) classes.push('selected');
             if (!d.data._children) classes.push('leaf');
             if (d.depth === 1) classes.push('root');
             return classes.join(' ');
        })
        .transition().duration(duration)
        .attr('r', d => d.depth === 1 ? 14 : (d.data._children ? 10 : 7))
        .attr('fill', d => {
          if (d.depth === 1) return '#ef4444';
          if (d.data._children) return '#3b82f6';
          return '#14b8a6';
        });

      nodeUpdate.select('.tree-node-label')
        .attr('dy', d => d.data._children ? '-1.8em' : '0.35em')
        .style('font-size', d => d.depth === 1 ? '16px' : (d.depth === 2 ? '13px' : '11px'))
        .style('font-weight', d => d.data._children ? '600' : '400')
        .transition().duration(duration)
        .style('fill-opacity', 1);

      nodeUpdate.select('.tree-node-count')
        .attr('dy', d => d.data._children ? '1.5em' : '0.35em')
        .transition().duration(duration)
        .style('fill-opacity', 1);

      // Update toggle button
      nodeUpdate.select('.toggle-btn-bg')
        .attr('r', d => d.data._children ? 9 : 0)
        .attr('cx', d => d.depth === 1 ? 26 : 20);
        
      nodeUpdate.select('.toggle-btn-icon')
        .attr('x', d => d.depth === 1 ? 26 : 20)
        .text(d => !d.data._children ? '' : (d.data.children ? '−' : '+'));

      // EXIT
      const nodeExit = nodeSelection.exit().transition().duration(duration)
        .attr('transform', function(d) { return d3.select(this).attr('transform'); }) // Stay in place while fading or move to parent?
        .style('opacity', 0)
        .remove();

      // --- Links ---
      const diagonal = (s, t) => {
        return `M ${s.y} ${s.x}
                C ${(s.y + t.y) / 2} ${s.x},
                  ${(s.y + t.y) / 2} ${t.x},
                  ${t.y} ${t.x}`;
      };

      const linkSelection = gLinks.selectAll('.tree-link')
        .data(links, d => d.target._path);

      const linkEnter = linkSelection.enter().append('path')
        .attr('class', 'tree-link')
        .attr('fill', 'none')
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', '2px')
        .attr('stroke-opacity', 0.6)
        .attr('d', d => {
            const o = { x: d.source.x, y: d.source.y };
            return diagonal(o, o);
        });

      linkEnter.merge(linkSelection).transition().duration(duration)
        .attr('d', d => diagonal(d.source, d.target));

      linkSelection.exit().transition().duration(duration)
        .attr('d', d => {
          const o = { x: d.source.x, y: d.source.y }; // Collapse to source
          return diagonal(o, o);
        })
        .remove();

      // --- Selected Panels Connections ---
      gLinks.selectAll('.selected-topic-link').remove();
      gNodes.selectAll('.selected-topic-panel').remove();
      
      selectedPanels.forEach((panelData, panelIndex) => {
         // Re-find the node in current layout
         const selectedTreeNode = nodes.find((node) => node._path === panelData.path);
         if (!selectedTreeNode) return;

         const panelWidth = 390;
         const panelHeight = panelData.sentenceIndices && panelData.sentenceIndices.length > 0 ? 320 : 180;
         const rightX = selectedTreeNode.y + 120;
         const leftX = selectedTreeNode.y - panelWidth - 120;
         const stackShift = (panelIndex % 3) * 28;
         const panelX = panelIndex % 2 === 0 ? rightX : leftX;
         const panelY = selectedTreeNode.x - panelHeight / 2 + stackShift;
         const connectorTargetX = panelX > selectedTreeNode.y ? panelX : panelX + panelWidth;

         gLinks.append('path')
            .attr('class', 'selected-topic-link')
            .attr('d', `M ${selectedTreeNode.y} ${selectedTreeNode.x}
              C ${(selectedTreeNode.y + connectorTargetX) / 2} ${selectedTreeNode.x},
                ${(selectedTreeNode.y + connectorTargetX) / 2} ${panelY + panelHeight / 2},
                ${connectorTargetX} ${panelY + panelHeight / 2}`)
            .attr('fill', 'none')
            .attr('stroke', '#667eea')
            .attr('stroke-width', 3)
            .attr('stroke-opacity', 0.8)
            .attr('stroke-dasharray', '8,6');

         const panel = gNodes.append('g').attr('class', 'selected-topic-panel');
         
         const panelObject = panel.append('foreignObject')
            .attr('x', panelX)
            .attr('y', panelY)
            .attr('width', panelWidth)
            .attr('height', panelHeight)
            .on('mousedown wheel touchstart', (e) => e.stopPropagation());

         const panelHtml = panelObject.append('xhtml:div')
            .attr('class', 'topic-sentences-panel topic-sentences-panel-inline');

         panelHtml.append('h3').text(`"${panelData.name}"`);

         panelHtml.append('button')
            .attr('class', 'close-panel-btn')
            .text('×')
            .on('click', (e) => {
               e.preventDefault(); e.stopPropagation();
               if (onClosePanel) onClosePanel(panelData.path);
            });

         const list = panelHtml.append('div').attr('class', 'topic-sentences-list');
         if (panelData.sentenceIndices && panelData.sentenceIndices.length > 0) {
            panelData.sentenceIndices.forEach((idx) => {
               const text = sentences[idx - 1];
               if (!text) return;
               const item = list.append('div').attr('class', 'topic-sentence-item');
               const content = item.append('div').attr('class', 'sentence-main-content');
               content.append('div').attr('class', 'sentence-number').text(`Sentence ${idx}`);
               content.append('div').attr('class', 'sentence-text').text(text);
            });
         } else {
            list.append('div').attr('class', 'no-sentences').text('No sentences for this topic.');
         }
      });
    };

    updateGraph();
    
    // We could track previous positions if we wanted smooth transition from parent
    // but for now, simple ID matching in D3 handles it well enough for expanding.

  }, [hierarchyData, expandState, selectedPanels, isInitialized, dimensions, onNodeSelect, onClosePanel, sentences]);

  // Initial Centering Logic
  // Only center when the dataset actually changes (e.g. new file loaded), not on every expand
  useEffect(() => {
     if (!hierarchyData || !isInitialized || !gRef.current || !zoomBehaviorRef.current) return;
     
     // small timeout to allow rendering to settle
     const timeout = setTimeout(() => {
        const svg = d3.select(svgRef.current);
        const g = gRef.current;
        const bounds = g.node().getBBox();
        const fullWidth = bounds.width;
        const fullHeight = bounds.height;
        
        if (fullWidth && fullHeight) {
           const initialScale = Math.min(
             (dimensions.width - 100) / fullWidth,
             (dimensions.height - 100) / fullHeight,
             0.5
           );

           const tx = (dimensions.width - fullWidth * initialScale) / 2 - bounds.x * initialScale;
           const ty = (dimensions.height - fullHeight * initialScale) / 2 - bounds.y * initialScale;

           svg.transition().duration(750)
              .call(zoomBehaviorRef.current.transform, 
                    d3.zoomIdentity.translate(tx, ty).scale(initialScale));
        }
     }, 300);
     return () => clearTimeout(timeout);
  }, [hierarchyData, isInitialized]); // Removed dimensions/expandState from here so it doesn't reset on those

  if (!hierarchyData) {
    return <div className="tree-visualization-empty"><p>No hierarchy data available</p></div>;
  }

  return (
    <div className="hierarchical-tree-container" ref={containerRef}>
      <div className="tree-legend">
        <div className="legend-item"><span className="legend-dot root"></span><span>Root Topic</span></div>
        <div className="legend-item"><span className="legend-dot internal"></span><span>Category</span></div>
        <div className="legend-item"><span className="legend-dot leaf"></span><span>Leaf Node</span></div>
      </div>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="hierarchical-tree-svg" />
    </div>
  );
}

function MindmapResults({ mindmapData }) {
  const [expandMode, setExpandMode] = useState('default');
  const [selectedPanels, setSelectedPanels] = useState([]);

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

  const handleNodeClick = (name, sentenceIndices, path) => {
    if (!path) return;
    setSelectedPanels((prev) => {
      const existingIndex = prev.findIndex((panel) => panel.path === path);
      const nextPanel = { path, name, sentenceIndices: sentenceIndices || [] };
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = nextPanel;
        return updated;
      }
      return [...prev, nextPanel];
    });
  };

  const closePanel = (path) => {
    setSelectedPanels((prev) => prev.filter((panel) => panel.path !== path));
  };

  return (
    <div className="mindmap-results-container">
      <div className="mindmap-body">
        <div className="mindmap-left">
          <div className="hierarchical-tree-wrapper">
            {Object.keys(structure).length > 0 ? (
              <>
                <div className="tree-controls">
                  <button className="tree-control-btn" onClick={() => setExpandMode('none')}>Fold All</button>
                  <button className="tree-control-btn" onClick={() => setExpandMode('all')}>Unfold All</button>
                </div>
                <HierarchicalTree
                  data={structure}
                  onNodeSelect={handleNodeClick}
                  onClosePanel={closePanel}
                  selectedPanels={selectedPanels}
                  sentences={sentences}
                  expandMode={expandMode}
                />
              </>
            ) : (
              <div className="mindmap-placeholder">
                <h2>No Topics Found</h2>
                <p>The analysis didn't identify any topic hierarchies.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MindmapResults;
