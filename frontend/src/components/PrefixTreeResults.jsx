import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import '../styles/App.css';

function HierarchicalTree({
  data,
  onNodeSelect,
  onClosePanel,
  selectedPanels,
  allSentences,
  expandMode
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const gRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const [expandState, setExpandState] = useState({});
  const [zoomTransform, setZoomTransform] = useState(null);

  // Convert prefix tree data to D3 hierarchy format (multiple roots, no single root)
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

  // Handle expandMode changes (Fold All / Unfold All)
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
  }, [expandMode]);

  // Toggle a single node expand/collapse using its data path
  const toggleNode = (nodePath) => {
    setExpandState(prev => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  };

  // Build the tree with collapse support using data paths (not numeric indices)
  const buildTree = (node) => {
    if (!node) return null;

    const result = { ...node };
    const isCollapsed = node.path ? expandState[node.path] : false;

    if (result.children && result.children.length > 0) {
      result._children = result.children; // always preserve original children
      if (isCollapsed) {
        result.children = null;
      } else {
        result.children = result.children.map(child => buildTree(child));
      }
    }

    return result;
  };

  useEffect(() => {
    if (!containerRef.current || !hierarchyData) return;

    const container = containerRef.current;
    const updateDimensions = () => {
      setDimensions({
        width: Math.max(1200, container.clientWidth),
        height: Math.max(800, container.clientHeight)
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [hierarchyData]);

  useEffect(() => {
    if (!svgRef.current || !hierarchyData) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 100, right: 200, bottom: 100, left: 200 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    // Create a group for zoom/pan
    const g = svg.append('g')
      .attr('class', 'tree-content');

    gRef.current = g;

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setZoomTransform(event.transform);
      });

    svg.call(zoom);

    // Create tree layout with spacing
    const treeLayout = d3.tree()
      .size([height * 80, width * 5])
      .separation((a, b) => {
        const siblingSpacing = 200;
        const cousinSpacing = 300;
        return (a.parent === b.parent ? siblingSpacing : cousinSpacing);
      });

    // Create groups for links and nodes within the zoomable group
    const gLinks = g.append('g')
      .attr('class', 'tree-links')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const gNodes = g.append('g')
      .attr('class', 'tree-nodes')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add zoom controls
    const zoomGroup = svg.append('g')
      .attr('class', 'zoom-controls')
      .attr('transform', `translate(${dimensions.width - 60}, 20)`);

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

    const zoomInBtn = zoomGroup.append('g')
      .attr('class', 'zoom-btn')
      .attr('transform', 'translate(-10, 5)')
      .on('click', () => {
        svg.transition().duration(300).call(zoom.scaleBy, 1.3);
      });

    zoomInBtn.append('circle')
      .attr('r', 14)
      .attr('fill', '#3b82f6')
      .attr('stroke', '#2563eb');

    zoomInBtn.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '4')
      .attr('fill', 'white')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text('+');

    const zoomOutBtn = zoomGroup.append('g')
      .attr('class', 'zoom-btn')
      .attr('transform', 'translate(10, 5)')
      .on('click', () => {
        svg.transition().duration(300).call(zoom.scaleBy, 0.7);
      });

    zoomOutBtn.append('circle')
      .attr('r', 14)
      .attr('fill', '#3b82f6')
      .attr('stroke', '#2563eb');

    zoomOutBtn.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '4')
      .attr('fill', 'white')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text('−');

    const resetBtn = zoomGroup.append('g')
      .attr('class', 'zoom-btn')
      .attr('transform', 'translate(0, 30)')
      .on('click', () => {
        svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
      });

    resetBtn.append('circle')
      .attr('r', 12)
      .attr('fill', '#6b7280')
      .attr('stroke', '#4b5563');

    resetBtn.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '4')
      .attr('fill', 'white')
      .style('font-size', '10px')
      .text('Reset');

    // Function to update the tree visualization
    const update = (source) => {
      const duration = 300;

      // Build processed tree with current expand state
      const processedRoots = hierarchyData.map(root => buildTree(root));
      const rootData = { name: '__virtual_root__', children: processedRoots };
      const root = d3.hierarchy(rootData);

      root.descendants().forEach((node, i) => {
        node.id = i;
        node._name = node.data.name;
        node._fullWord = node.data.fullWord;
        node._count = node.data.count;
        node._sentences = node.data.sentences;
        node._path = node.data.path;
      });

      // Compute the new tree layout
      treeLayout(root);

      // Get nodes and links (exclude virtual root from display)
      const nodes = root.descendants().filter(d => d.data.name !== '__virtual_root__');
      const links = root.links().filter(d => d.source.data.name !== '__virtual_root__');

      // Update nodes
      const nodeSelection = gNodes.selectAll('.tree-node-group')
        .data(nodes, d => d.id);

      // Enter new nodes — clicking the main group selects the node
      const nodeEnter = nodeSelection.enter()
        .append('g')
        .attr('class', 'tree-node-group')
        .attr('transform', d => `translate(${source.x0 || 0},${source.y0 || 0})`)
        .on('click', (event, d) => {
          event.stopPropagation();
          if (onNodeSelect) {
            onNodeSelect(
              { count: d._count, sentences: d._sentences || [] },
              d._name,
              d._path
            );
          }
        });

      // Add circle for node
      nodeEnter.append('circle')
        .attr('class', d => {
          const classes = ['tree-node-circle'];
          if (selectedPanels.some((panel) => panel.path === d._path)) classes.push('selected');
          if (!d.data._children) classes.push('leaf');
          if (d.depth === 1) classes.push('root');
          return classes.join(' ');
        })
        .attr('r', 1e-6)
        .transition()
        .duration(duration)
        .attr('r', d => {
          if (d.depth === 1) return 14;
          return d.data._children ? 10 : 7;
        })
        .attr('fill', d => {
          if (d.depth === 1) return '#ef4444';
          if (d.data._children) return '#3b82f6';
          return '#14b8a6';
        });

      // Add label for nodes
      nodeEnter.append('text')
        .attr('class', 'tree-node-label')
        .attr('dy', d => d.data._children ? '-1.8em' : '0.35em')
        .attr('x', 0)
        .attr('text-anchor', 'middle')
        .attr('fill', '#1f2937')
        .style('font-size', d => {
          if (d.depth === 1) return '16px';
          if (d.depth === 2) return '13px';
          return '11px';
        })
        .style('font-weight', d => d.data._children ? '600' : '400')
        .text(d => d._name)
        .style('fill-opacity', 1e-6)
        .transition()
        .duration(duration)
        .style('fill-opacity', 1);

      // Add full word tooltip (as smaller text below)
      nodeEnter.append('text')
        .attr('class', 'tree-node-fullword')
        .attr('dy', d => d.data._children ? '-0.3em' : '1.4em')
        .attr('x', 0)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9ca3af')
        .style('font-size', '9px')
        .style('font-style', 'italic')
        .text(d => d.depth > 1 ? d._fullWord : '')
        .style('fill-opacity', 0)
        .transition()
        .duration(duration)
        .style('fill-opacity', 0.7);

      // Add count badge
      nodeEnter.append('text')
        .attr('class', 'tree-node-count')
        .attr('dy', d => d.data._children ? '1.5em' : '0.35em')
        .attr('x', 0)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6b7280')
        .style('font-size', '10px')
        .text(d => d._count > 0 ? `(${d._count})` : '')
        .style('fill-opacity', 1e-6)
        .transition()
        .duration(duration)
        .style('fill-opacity', 1);

      // Add toggle button (+ / −) for nodes that have children
      // Placed to the right of the node circle, in the direction of children
      const toggleGroup = nodeEnter.append('g')
        .attr('class', 'node-toggle-btn')
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          const path = d._path || d.data.path;
          if (path) toggleNode(path);
          if (onNodeSelect) {
            onNodeSelect(
              { count: d._count, sentences: d._sentences || [] },
              d._name,
              d._path
            );
          }
        });

      toggleGroup.append('circle')
        .attr('class', 'toggle-btn-bg')
        .attr('r', d => d.data._children ? 9 : 0)
        .attr('cx', d => d.depth === 1 ? 26 : 20)
        .attr('fill', '#f9fafb')
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', 1.5);

      toggleGroup.append('text')
        .attr('class', 'toggle-btn-icon')
        .attr('text-anchor', 'middle')
        .attr('x', d => d.depth === 1 ? 26 : 20)
        .attr('dy', '0.38em')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .attr('fill', '#374151')
        .style('user-select', 'none')
        .text(d => {
          if (!d.data._children) return '';
          return d.data.children ? '−' : '+';
        });

      // Update existing nodes
      const nodeUpdate = nodeEnter.merge(nodeSelection);
      nodeUpdate.transition()
        .duration(duration)
        .attr('transform', d => `translate(${d.y},${d.x})`);

      // Update circle classes
      nodeUpdate.select('.tree-node-circle')
        .attr('class', d => {
          const classes = ['tree-node-circle'];
          if (selectedPanels.some((panel) => panel.path === d._path)) classes.push('selected');
          if (!d.data._children) classes.push('leaf');
          if (d.depth === 1) classes.push('root');
          return classes.join(' ');
        });

      // Update toggle button icon text
      nodeUpdate.select('.toggle-btn-icon')
        .text(d => {
          if (!d.data._children) return '';
          return d.data.children ? '−' : '+';
        });

      // Exit old nodes
      const nodeExit = nodeSelection.exit()
        .transition()
        .duration(duration)
        .attr('transform', d => `translate(${source.y},${source.x})`)
        .remove();

      nodeExit.select('circle')
        .attr('r', 1e-6);

      nodeExit.select('text')
        .style('fill-opacity', 1e-6);

      // Update links
      const linkSelection = gLinks.selectAll('.tree-link')
        .data(links, d => d.target.id);

      // Enter new links
      const linkEnter = linkSelection.enter()
        .append('path')
        .attr('class', 'tree-link')
        .attr('d', d => {
          const o = { x: source.x0 || 0, y: source.y0 || 0 };
          return diagonal(o, o);
        })
        .attr('fill', 'none')
        .attr('stroke', '#9ca3af')
        .attr('stroke-width', '2px')
        .attr('stroke-opacity', 0.6);

      // Update existing links
      const linkUpdate = linkEnter.merge(linkSelection);
      linkUpdate.transition()
        .duration(duration)
        .attr('d', d => diagonal(d.source, d.target));

      // Exit old links
      linkSelection.exit()
        .transition()
        .duration(duration)
        .attr('d', d => {
          const o = { x: source.x, y: source.y };
          return diagonal(o, o);
        })
        .remove();

      gLinks.selectAll('.selected-topic-link').remove();
      gNodes.selectAll('.selected-topic-panel').remove();

      selectedPanels.forEach((panelData, panelIndex) => {
        const selectedTreeNode = nodes.find((node) => node._path === panelData.path);
        if (!selectedTreeNode) return;

          const panelWidth = 390;
          const panelHeight = panelData.count > 0 ? 320 : 180;
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

          const panel = gNodes.append('g')
            .attr('class', 'selected-topic-panel');

          const panelObject = panel.append('foreignObject')
            .attr('x', panelX)
            .attr('y', panelY)
            .attr('width', panelWidth)
            .attr('height', panelHeight)
            .on('mousedown wheel touchstart', (event) => event.stopPropagation());

          const panelHtml = panelObject.append('xhtml:div')
            .attr('class', 'topic-sentences-panel topic-sentences-panel-inline')
            .on('mousedown wheel touchstart', (event) => event.stopPropagation());

          panelHtml.append('h3').text(`"${panelData.label}"`);

          panelHtml.append('button')
            .attr('class', 'close-panel-btn')
            .attr('title', 'Clear selection')
            .text('×')
            .on('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
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
            list.append('div')
              .attr('class', 'no-sentences')
              .text('Intermediate prefix - select a child node to see sentences.');
          }
      });

      // Store old positions for transitions
      nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    };

    // Diagonal path generator for curved links
    const diagonal = (source, target) => {
      return `M ${source.y} ${source.x}
              C ${(source.y + target.y) / 2} ${source.x},
                ${(source.y + target.y) / 2} ${target.x},
                ${target.y} ${target.x}`;
    };

    // Initial render
    update({ x0: height / 2, y0: 0 });

    // Center the tree initially
    setTimeout(() => {
      const bounds = g.node().getBBox();
      const fullWidth = bounds.width;
      const fullHeight = bounds.height;

      if (fullWidth && fullHeight) {
        const initialScale = Math.min(
          (dimensions.width - 100) / fullWidth,
          (dimensions.height - 100) / fullHeight,
          0.5
        );

        const initialTranslateX = (dimensions.width - fullWidth * initialScale) / 2 - bounds.x * initialScale;
        const initialTranslateY = (dimensions.height - fullHeight * initialScale) / 2 - bounds.y * initialScale;

        svg.call(zoom.transform, d3.zoomIdentity.translate(initialTranslateX, initialTranslateY).scale(initialScale));
      }
    }, 100);
  }, [
    hierarchyData,
    dimensions,
    selectedPanels,
    allSentences,
    onClosePanel,
    expandState,
    expandMode
  ]);

  if (!hierarchyData) {
    return (
      <div className="tree-visualization-empty">
        <p>No hierarchy data available</p>
      </div>
    );
  }

  return (
    <div className="hierarchical-tree-container" ref={containerRef}>
      <div className="tree-legend">
        <div className="legend-item">
          <span className="legend-dot root"></span>
          <span>Root</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot internal"></span>
          <span>Prefix</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot leaf"></span>
          <span>Complete Word</span>
        </div>
      </div>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="hierarchical-tree-svg"
      />
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
    const count = nodeData?.count || 0;
    const nodeSentences = nodeData?.sentences || [];
    setSelectedPanels((prev) => {
      const existingIndex = prev.findIndex((panel) => panel.path === path);
      const nextPanel = { path, label, count, sentences: nodeSentences };
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
                <HierarchicalTree
                  data={treeData}
                  onNodeSelect={handleNodeClick}
                  onClosePanel={closePanel}
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
