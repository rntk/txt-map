import React, { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';

const PALETTE = [
  '#7ba3cc', '#e8a87c', '#85bb65', '#c9a0dc',
  '#d4a5a5', '#a0c4a9', '#cfb997', '#9db4c0',
  '#c2b280', '#b5c7d3', '#d4a76a', '#a5b8d0',
  '#c4d4a0', '#d0b4c8', '#b3cfa0', '#c8b8a0',
];

const CHAR_ASPECT = 0.58; // approximate width/height ratio per character

function buildHierarchy(topics) {
  const root = { name: 'root', children: [] };
  const nodeMap = new Map();
  nodeMap.set('', root);

  const safe = Array.isArray(topics) ? topics : [];

  const sorted = [...safe].sort((a, b) =>
    a.name.split('>').length - b.name.split('>').length
  );

  sorted.forEach(topic => {
    const parts = topic.name.split('>').map(p => p.trim());
    let path = '';

    for (let i = 0; i < parts.length; i++) {
      const parentPath = path;
      path = path ? `${path}>${parts[i]}` : parts[i];

      if (!nodeMap.has(path)) {
        const isLeaf = i === parts.length - 1;
        const node = {
          name: parts[i],
          fullPath: path,
          value: isLeaf ? Math.max(1, topic.sentences ? topic.sentences.length : 1) : 0,
          children: [],
          topic: isLeaf ? topic : null,
        };
        nodeMap.set(path, node);
        const parent = nodeMap.get(parentPath);
        if (parent) parent.children.push(node);
      }
    }
  });

  return root;
}

// Wrap label into lines that fit within maxWidth pixels at given fontSize
function wrapLines(label, maxWidth, fontSize) {
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_ASPECT)));
  const words = label.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > maxCharsPerLine
        ? word.slice(0, maxCharsPerLine - 1) + '…'
        : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Render word-wrapped text with a white halo using two passes (back + front)
function renderLabel(g, d, x, y, fontSize, fontWeight, textColor, lines) {
  const lineHeight = fontSize * 1.25;
  const totalH = lines.length * lineHeight;
  const baseY = y - totalH / 2 + lineHeight * 0.8;

  // White halo pass
  const halo = g.append('text')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')
    .style('font-size', `${fontSize}px`)
    .style('font-weight', fontWeight)
    .style('stroke', 'white')
    .style('stroke-width', '3px')
    .style('stroke-linejoin', 'round')
    .style('fill', 'none')
    .style('paint-order', 'stroke');

  lines.forEach((line, i) => {
    halo.append('tspan')
      .attr('x', x)
      .attr('y', baseY + i * lineHeight)
      .text(line);
  });

  // Foreground text pass
  const front = g.append('text')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')
    .style('font-size', `${fontSize}px`)
    .style('font-weight', fontWeight)
    .style('fill', textColor);

  lines.forEach((line, i) => {
    front.append('tspan')
      .attr('x', x)
      .attr('y', baseY + i * lineHeight)
      .text(line);
  });
}

export default function CircularPackingChart({ topics }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomRef = useRef(null);

  const hierarchyData = useMemo(() => buildHierarchy(topics), [topics]);

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(350)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth || 800;
    const size = Math.min(containerWidth, 900);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg
      .attr('width', size)
      .attr('height', size)
      .attr('viewBox', `0 0 ${size} ${size}`)
      .style('cursor', 'grab');

    const root = d3.hierarchy(hierarchyData)
      .sum(d => d.value || 0)
      .sort((a, b) => b.value - a.value);

    d3.pack().size([size, size]).padding(5)(root);

    // When a parent has exactly one child, d3.pack makes the child nearly fill
    // the parent. Shrink the child to 72% of parent radius and scale its entire
    // subtree by the same factor so descendants still fit inside.
    function scaleSubtree(node, pivotX, pivotY, scale) {
      node.x = pivotX + (node.x - pivotX) * scale;
      node.y = pivotY + (node.y - pivotY) * scale;
      node.r *= scale;
      if (node.children) {
        // Keep the same pivot for all descendants — this is a uniform scale
        // centred at (pivotX, pivotY), so every point in the subtree must use
        // the same origin, not each parent's individual old position.
        node.children.forEach(c => scaleSubtree(c, pivotX, pivotY, scale));
      }
    }

    function applySingleChildShrink(node) {
      if (!node.children) return;
      if (node.children.length === 1) {
        const child = node.children[0];
        const scale = (node.r * 0.72) / child.r;
        if (scale < 1) scaleSubtree(child, node.x, node.y, scale);
      }
      node.children.forEach(c => applySingleChildShrink(c));
    }

    applySingleChildShrink(root);

    // Color helpers
    const topLevelNames = (hierarchyData.children || []).map(c => c.name);
    const colorScale = d3.scaleOrdinal().domain(topLevelNames).range(PALETTE);

    const getColor = (d) => {
      let node = d;
      while (node.depth > 1) node = node.parent;
      if (node.depth === 0) return '#eee';
      const base = colorScale(node.data.name);
      const t = Math.min(0.85, (d.depth - 1) * 0.22);
      return d3.interpolate(base, '#ffffff')(t);
    };

    const g = svg.append('g');
    const nodes = root.descendants().filter(d => d.depth > 0);
    const isLeaf = d => !d.children || d.children.length === 0;

    // Draw circles
    const circles = g.selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', d => d.r)
      .attr('fill', d => getColor(d))
      .attr('stroke', d => {
        const c = d3.color(getColor(d));
        return c ? c.darker(0.5).toString() : '#aaa';
      })
      .attr('stroke-width', d => d.depth === 1 ? 2 : 0.8)
      .style('opacity', 0.92)
      .style('cursor', 'pointer');

    // Tooltip
    const tooltip = d3.select(containerRef.current)
      .append('div')
      .style('position', 'absolute')
      .style('background', 'rgba(0,0,0,0.78)')
      .style('color', 'white')
      .style('padding', '6px 10px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 100)
      .style('max-width', '240px')
      .style('white-space', 'pre-wrap');

    circles
      .on('mouseover', (event, d) => {
        const sentCount = d.data.topic
          ? (d.data.topic.sentences ? d.data.topic.sentences.length : 0)
          : d.value;
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.data.fullPath || d.data.name}</strong><br/>${sentCount} sentence${sentCount !== 1 ? 's' : ''}`);
      })
      .on('mousemove', (event) => {
        const rect = containerRef.current.getBoundingClientRect();
        tooltip
          .style('left', `${event.clientX - rect.left + 14}px`)
          .style('top', `${event.clientY - rect.top - 12}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    // Labels
    nodes.forEach(d => {
      const leaf = isLeaf(d);

      if (leaf) {
        // Leaf: centered, word-wrapped, only if circle is large enough
        const MIN_R = 16;
        if (d.r < MIN_R) return;

        const availWidth = d.r * 1.7; // usable chord width for text
        const fontSize = Math.min(13, Math.max(8, d.r * 0.38));
        const lines = wrapLines(d.data.name, availWidth, fontSize);
        const lineHeight = fontSize * 1.25;
        const totalH = lines.length * lineHeight;

        // Only render if wrapped text fits vertically too
        if (totalH > d.r * 1.8) return;

        renderLabel(g, d, d.x, d.y, fontSize, '500', '#222', lines);

      } else {
        // Branch: label pinned to top-inside edge, single line, smaller font
        const MIN_R_BRANCH = 30;
        if (d.r < MIN_R_BRANCH) return;

        const fontSize = Math.min(13, Math.max(8, d.r * 0.18));
        const availWidth = d.r * 1.6;
        const maxChars = Math.floor(availWidth / (fontSize * CHAR_ASPECT));
        const label = d.data.name.length > maxChars
          ? d.data.name.slice(0, maxChars - 1) + '…'
          : d.data.name;

        // Position: top inside the circle, just below the stroke
        const labelY = d.y - d.r + fontSize + 5;

        renderLabel(g, d, d.x, labelY, fontSize, '700', '#333', [label]);
      }
    });

    // Zoom & pan
    const zoom = d3.zoom()
      .scaleExtent([0.5, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        svg.style('cursor', event.transform.k > 1 ? 'grabbing' : 'grab');
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    // Suppress zoom on double-click (avoid accidental zoom-in)
    svg.on('dblclick.zoom', null);

    return () => {
      tooltip.remove();
    };
  }, [hierarchyData]);

  if (!topics || topics.length === 0) {
    return <p style={{ color: '#666', fontStyle: 'italic' }}>No topics available.</p>;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <button
        onClick={resetZoom}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          padding: '4px 10px', fontSize: '12px',
          border: '1px solid #ccc', borderRadius: '4px',
          background: 'rgba(255,255,255,0.88)', cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}
        title="Reset zoom"
      >
        Reset zoom
      </button>
      <svg ref={svgRef} style={{ display: 'block', margin: '0 auto' }} />
    </div>
  );
}
