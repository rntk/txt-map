import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import '../styles/App.css';

function HierarchicalTree({
  data,
  onNodeSelect,
  onClosePanel,
  onPanelDrag,
  selectedPanels,
  allSentences,
  expandMode
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const gRef = useRef(null);
  const zoomBehaviorRef = useRef(null);
  const lastToggledNodeRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const [expandState, setExpandState] = useState({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Convert prefix tree data to D3 hierarchy format
  const hierarchyData = useMemo(() => {
    if (!data || Object.keys(data).length === 0) return null;

    const roots = [];

    const buildNode = (label, nodeData, parentPath = '') => {
      const fullWord = nodeData.fullWord || label;
      const currentPath = parentPath ? `${parentPath}/${label}` : label;
      return {
        name: label,
        fullWord: fullWord,
        count: nodeData.count || 0,
        sentences: nodeData.sentences || [],
        path: currentPath,
        children: Object.entries(nodeData.children || {}).map(([childLabel, childData]) =>
          buildNode(childLabel, childData, currentPath)
        )
      };
    };

    Object.entries(data).forEach(([label, nodeData]) => {
      roots.push(buildNode(label, nodeData, ''));
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
  }, [expandMode, hierarchyData]);

  const toggleNode = (nodePath) => {
    setExpandState(prev => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
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
  }, []);

  // Initialize SVG Structure
  useEffect(() => {
    if (!svgRef.current || isInitialized) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear on init

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

    zoomGroup.append('circle').attr('r', 40).attr('fill', 'rgba(255, 255, 255, 0.9)').attr('stroke', '#d1d5db').attr('stroke-width', 1);
    zoomGroup.append('text').attr('text-anchor', 'middle').attr('dy', '-10').attr('fill', '#6b7280').style('font-size', '10px').text('Zoom');

    const zoomInBtn = zoomGroup.append('g').attr('class', 'zoom-btn').attr('transform', 'translate(-10, 5)')
      .on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1.3));
    zoomInBtn.append('circle').attr('r', 14).attr('fill', '#3b82f6').attr('stroke', '#2563eb');
    zoomInBtn.append('text').attr('text-anchor', 'middle').attr('dy', '4').attr('fill', 'white').style('font-size', '16px').style('font-weight', 'bold').text('+');

    const zoomOutBtn = zoomGroup.append('g').attr('class', 'zoom-btn').attr('transform', 'translate(10, 5)')
      .on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 0.7));
    zoomOutBtn.append('circle').attr('r', 14).attr('fill', '#3b82f6').attr('stroke', '#2563eb');
    zoomOutBtn.append('text').attr('text-anchor', 'middle').attr('dy', '4').attr('fill', 'white').style('font-size', '16px').style('font-weight', 'bold').text('−');

    const resetBtn = zoomGroup.append('g').attr('class', 'zoom-btn').attr('transform', 'translate(0, 30)')
      .on('click', () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity));
    resetBtn.append('circle').attr('r', 12).attr('fill', '#6b7280').attr('stroke', '#4b5563');
    resetBtn.append('text').attr('text-anchor', 'middle').attr('dy', '4').attr('fill', 'white').style('font-size', '10px').text('Reset');

    setIsInitialized(true);
  }, []);

  // Update Dimensions
  useEffect(() => {
    if (!svgRef.current || !isInitialized) return;
    d3.select(svgRef.current).select('.zoom-controls')
      .attr('transform', `translate(${dimensions.width - 60}, 20)`);
  }, [dimensions, isInitialized]);

  // Main Render Loop
  useEffect(() => {
    if (!hierarchyData || !isInitialized || !gRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = gRef.current;
    const gNodes = g.select('.tree-nodes');
    const gLinks = g.select('.tree-links');

    // Default margin
    const margin = { top: 100, right: 200, bottom: 100, left: 200 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const treeLayout = d3.tree()
      .nodeSize([50, 300])
      .separation((a, b) => {
        return (a.parent === b.parent ? 1 : 1.2);
      });

    const updateGraph = () => {
      const duration = 300;

      const rootData = { name: '__virtual_root__', children: hierarchyData };
      const root = d3.hierarchy(rootData);

      root.descendants().forEach((node, i) => {
        node.id = i;
        node._name = node.data.name;
        node._fullWord = node.data.fullWord;
        node._count = node.data.count;
        node._sentences = node.data.sentences;
        node._path = node.data.path || (node.data.name === '__virtual_root__' ? '' : node.data.name);
      });

      treeLayout(root);

      root.each(node => {
        if (node.depth === 0) {
          node._isVisible = true;
        } else {
          const parentCollapsed = node.parent && expandState[node.parent._path];
          node._isVisible = node.parent._isVisible && !parentCollapsed;
        }
      });

      const nodes = root.descendants().filter(d => d.data.name !== '__virtual_root__' && d._isVisible);
      const links = root.links().filter(d => d.source.data.name !== '__virtual_root__' && d.target._isVisible);

      // --- Nodes ---
      const nodeSelection = gNodes.selectAll('.tree-node-group').data(nodes, d => d._path);

      const nodeEnter = nodeSelection.enter().append('g')
        .attr('class', 'tree-node-group')
        .attr('transform', d => `translate(${d.y},${d.x})`)
        .on('click', (event, d) => {
          event.stopPropagation();
          if (onNodeSelect) {
            onNodeSelect({ count: d._count, sentences: d._sentences || [] }, d._name, d._path);
          }
        });

      nodeEnter.append('title')
        .text(d => d._path ? d._path.split('/').join('') : d._name);

      nodeEnter.append('circle')
        .attr('class', 'tree-node-circle')
        .attr('r', 1e-6)
        .attr('fill', d => {
          if (d.depth === 1) return '#ef4444';
          if (d.children) return '#3b82f6';
          return '#14b8a6';
        });

      const label = nodeEnter.append('text').attr('class', 'tree-node-label').attr('dy', '-1.8em').attr('text-anchor', 'middle')
        .style('fill-opacity', 1e-6);

      label.append('tspan').attr('class', 'tree-node-name').text(d => d._name);

      label.append('tspan').attr('class', 'tree-node-count').attr('dx', '0.5em')
        .attr('fill', '#6b7280').style('font-size', '0.85em').text(d => d._count > 0 ? `(${d._count})` : '');

      nodeEnter.append('text').attr('class', 'tree-node-fullword').attr('dy', '-0.3em').attr('text-anchor', 'middle')
        .style('font-size', '9px').style('font-style', 'italic').text(d => d.depth > 1 ? d._fullWord : '')
        .style('fill-opacity', 0);

      const toggleGroup = nodeEnter.append('g').attr('class', 'node-toggle-btn').style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          const path = d._path || d.data.path;
          if (path) toggleNode(path);
        });

      toggleGroup.append('circle').attr('class', 'toggle-btn-bg').attr('r', 0).attr('cx', 20)
        .attr('fill', '#f9fafb').attr('stroke', '#9ca3af').attr('stroke-width', 1.5);

      toggleGroup.append('text').attr('class', 'toggle-btn-icon').attr('text-anchor', 'middle').attr('x', 20)
        .attr('dy', '0.38em').style('font-size', '14px').style('font-weight', 'bold').text('');

      // UPDATE
      const nodeUpdate = nodeEnter.merge(nodeSelection);
      nodeUpdate.transition().duration(duration).attr('transform', d => `translate(${d.y},${d.x})`);

      nodeUpdate.select('.tree-node-circle')
        .attr('class', d => {
          const classes = ['tree-node-circle'];
          if (selectedPanels.some((panel) => panel.path === d._path)) classes.push('selected');
          if (!d.children) classes.push('leaf');
          if (d.depth === 1) classes.push('root');
          return classes.join(' ');
        })
        .transition().duration(duration)
        .attr('r', d => d.depth === 1 ? 14 : (d.children ? 10 : 7))
        .attr('fill', d => {
          if (d.depth === 1) return '#ef4444';
          if (d.children) return '#3b82f6';
          return '#14b8a6';
        });

      nodeUpdate.select('.tree-node-label')
        .attr('dy', '-1.8em')
        .style('font-size', d => d.depth === 1 ? '16px' : (d.depth === 2 ? '13px' : '11px'))
        .style('font-weight', d => d.children ? '600' : '400')
        .transition().duration(duration).style('fill-opacity', 1);

      nodeUpdate.select('.tree-node-fullword')
        .attr('dy', '-0.3em')
        .transition().duration(duration).style('fill-opacity', 0.7);

      nodeUpdate.select('.toggle-btn-bg').attr('r', d => d.children ? 9 : 0)
        .attr('cx', d => d.depth === 1 ? 26 : 20);

      nodeUpdate.select('.toggle-btn-icon').attr('x', d => d.depth === 1 ? 26 : 20)
        .text(d => !d.children ? '' : (expandState[d._path] ? '+' : '−'));

      // EXIT
      const nodeExit = nodeSelection.exit().transition().duration(duration)
        .attr('transform', function (d) { return d3.select(this).attr('transform'); })
        .style('opacity', 0)
        .remove();

      // --- Links ---
      const diagonal = (s, t) => {
        return `M ${s.y} ${s.x}
                C ${(s.y + t.y) / 2} ${s.x},
                  ${(s.y + t.y) / 2} ${t.x},
                  ${t.y} ${t.x}`;
      };

      const linkSelection = gLinks.selectAll('.tree-link').data(links, d => d.target._path);

      const linkEnter = linkSelection.enter().append('path')
        .attr('class', 'tree-link').attr('fill', 'none').attr('stroke', '#9ca3af')
        .attr('stroke-width', '2px').attr('stroke-opacity', 0.6)
        .attr('d', d => {
          const o = { x: d.source.x, y: d.source.y };
          return diagonal(o, o);
        });

      linkEnter.merge(linkSelection).transition().duration(duration).attr('d', d => diagonal(d.source, d.target));
      linkSelection.exit().transition().duration(duration).attr('d', d => {
        const o = { x: d.source.x, y: d.source.y };
        return diagonal(o, o);
      }).remove();

      // --- Selected Panels Connections ---
      gLinks.selectAll('.selected-topic-link').remove();
      gNodes.selectAll('.selected-topic-panel').remove();

      selectedPanels.forEach((panelData, panelIndex) => {
        const selectedTreeNode = nodes.find((node) => node._path === panelData.path);
        if (!selectedTreeNode) return;

        const panelWidth = 390;
        const panelHeight = panelData.count > 0 ? 320 : 180;

        // Default positions
        const rightX = selectedTreeNode.y + 120;
        const leftX = selectedTreeNode.y - panelWidth - 120;
        const stackShift = (panelIndex % 3) * 28;
        const defaultX = panelIndex % 2 === 0 ? rightX : leftX;
        const defaultY = selectedTreeNode.x - panelHeight / 2 + stackShift;

        // Use stored position if available
        let currentX = panelData.x !== undefined ? panelData.x : defaultX;
        let currentY = panelData.y !== undefined ? panelData.y : defaultY;

        const connectorTargetX = currentX > selectedTreeNode.y ? currentX : currentX + panelWidth;

        // Function to update connector path during drag
        const updateConnector = (x, y) => {
          const targetX = x > selectedTreeNode.y ? x : x + panelWidth;
          const newPath = `M ${selectedTreeNode.y} ${selectedTreeNode.x}
              C ${(selectedTreeNode.y + targetX) / 2} ${selectedTreeNode.x},
                ${(selectedTreeNode.y + targetX) / 2} ${y + panelHeight / 2},
                ${targetX} ${y + panelHeight / 2}`;
          link.attr('d', newPath);
        };

        const link = gLinks.append('path').attr('class', 'selected-topic-link')
          .attr('d', `M ${selectedTreeNode.y} ${selectedTreeNode.x}
              C ${(selectedTreeNode.y + connectorTargetX) / 2} ${selectedTreeNode.x},
                ${(selectedTreeNode.y + connectorTargetX) / 2} ${currentY + panelHeight / 2},
                ${connectorTargetX} ${currentY + panelHeight / 2}`)
          .attr('fill', 'none').attr('stroke', '#667eea').attr('stroke-width', 3)
          .attr('stroke-opacity', 0.8).attr('stroke-dasharray', '8,6');

        const panel = gNodes.append('g').attr('class', 'selected-topic-panel');

        // Drag behavior
        const drag = d3.drag()
          .subject(() => ({ x: currentX, y: currentY }))
          .filter((event) => {
            return event.target.tagName.toLowerCase() === 'h3';
          })
          .on('start', function () {
            d3.select(this).raise();
            d3.select(this).select('h3').style('cursor', 'grabbing');
          })
          .on('drag', function (event) {
            const newX = event.x;
            const newY = event.y;
            d3.select(this).attr('x', newX).attr('y', newY);
            updateConnector(newX, newY);
            currentX = newX;
            currentY = newY;
          })
          .on('end', function (event) {
            d3.select(this).select('h3').style('cursor', 'grab');
            if (onPanelDrag) onPanelDrag(panelData.path, event.x, event.y);
          });

        const panelObject = panel.append('foreignObject').attr('x', currentX).attr('y', currentY)
          .attr('width', panelWidth).attr('height', panelHeight)
          .call(drag);

        panelObject.on('wheel', (e) => e.stopPropagation());
        panelObject.on('mousedown', (e) => {
          if (e.target.tagName.toLowerCase() !== 'h3') {
            e.stopPropagation();
          }
        });

        const panelHtml = panelObject.append('xhtml:div').attr('class', 'topic-sentences-panel topic-sentences-panel-inline');

        panelHtml.append('h3')
          .text(`"${panelData.label}"`)
          .style('cursor', 'grab')
          .style('user-select', 'none');

        panelHtml.append('button').attr('class', 'close-panel-btn').text('×')
          .on('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (onClosePanel) onClosePanel(panelData.path);
          });

        const list = panelHtml.append('div').attr('class', 'topic-sentences-list');
        if (panelData.count > 0) {
          panelData.sentences.forEach((idx) => {
            const text = allSentences[idx - 1];
            if (!text) return;
            const item = list.append('div').attr('class', 'topic-sentence-item');
            const content = item.append('div').attr('class', 'sentence-main-content');
            content.append('div').attr('class', 'sentence-number').text(`Sentence ${idx}`);
            content.append('div').attr('class', 'sentence-text').text(text);
          });
        } else {
          list.append('div').attr('class', 'no-sentences').text('Intermediate prefix - select a child node to see sentences.');
        }
      });
    };

    updateGraph();

  }, [hierarchyData, expandState, selectedPanels, isInitialized, dimensions, onNodeSelect, onClosePanel, allSentences, onPanelDrag]);

  // Initial Centering Logic
  useEffect(() => {
    if (!hierarchyData || !isInitialized || !gRef.current || !zoomBehaviorRef.current) return;

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
          .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(initialScale));
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [hierarchyData, isInitialized]);

  if (!hierarchyData) {
    return <div className="tree-visualization-empty"><p>No hierarchy data available</p></div>;
  }

  return (
    <div className="hierarchical-tree-container" ref={containerRef}>
      <div className="tree-legend">
        <div className="legend-item"><span className="legend-dot root"></span><span>Root</span></div>
        <div className="legend-item"><span className="legend-dot internal"></span><span>Prefix</span></div>
        <div className="legend-item"><span className="legend-dot leaf"></span><span>Complete Word</span></div>
      </div>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="hierarchical-tree-svg" />
    </div>
  );
}

function PrefixTreeResults({ treeData, sentences }) {
  const [expandMode, setExpandMode] = useState('default');
  const [selectedPanels, setSelectedPanels] = useState([]);

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

  const handleNodeClick = (nodeData, label, path) => {
    if (!path) return;
    setSelectedPanels((prev) => {
      const existingIndex = prev.findIndex((panel) => panel.path === path);
      if (existingIndex >= 0) {
        // Toggle OFF
        const updated = [...prev];
        updated.splice(existingIndex, 1);
        return updated;
      }
      // Toggle ON
      const count = nodeData?.count || 0;
      const nodeSentences = nodeData?.sentences || [];
      const nextPanel = { path, label, count, sentences: nodeSentences };
      return [...prev, nextPanel];
    });
  };

  const handlePanelDrag = (path, x, y) => {
    setSelectedPanels((prev) => {
      const index = prev.findIndex((p) => p.path === path);
      if (index === -1) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], x, y };
      return updated;
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
            {Object.keys(treeData).length > 0 ? (
              <>
                <div className="tree-controls">
                  <button className="tree-control-btn" onClick={() => setExpandMode('none')}>Fold All</button>
                  <button className="tree-control-btn" onClick={() => setExpandMode('all')}>Unfold All</button>
                </div>
                <HierarchicalTree
                  data={treeData}
                  onNodeSelect={handleNodeClick}
                  onClosePanel={closePanel}
                  onPanelDrag={handlePanelDrag}
                  selectedPanels={selectedPanels}
                  allSentences={sentences}
                  expandMode={expandMode}
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
}

export default PrefixTreeResults;
