import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import TopicLevelSwitcher from './shared/TopicLevelSwitcher';
import TopicSentencesModal from './shared/TopicSentencesModal';
import {
  getTopicParts,
  isWithinScope,
  getScopedMaxLevel,
  getScopeLabel,
  getLevelLabel,
  hasDeeperChildren
} from '../utils/topicHierarchy';

const PALETTE = [
  '#7ba3cc', '#e8a87c', '#85bb65', '#c9a0dc',
  '#d4a5a5', '#a0c4a9', '#cfb997', '#9db4c0',
  '#c2b280', '#b5c7d3', '#d4a76a', '#a5b8d0',
  '#c4d4a0', '#d0b4c8', '#b3cfa0', '#c8b8a0',
];

const CHAR_ASPECT = 0.58; // approximate width/height ratio per character
const PACK_PADDING = 1;
const PACK_AREA_RATIO = 0.7;
const CIRCLE_ENLARGE_FACTOR = 1.6;

export function buildScopedHierarchy(topics, scopePath = [], selectedLevel = 0) {
  const root = { name: 'root', fullPath: '', children: [] };
  const nodeMap = new Map();
  nodeMap.set('', root);

  const safeTopics = Array.isArray(topics) ? topics : [];
  const safeLevel = Math.max(0, selectedLevel);
  const absoluteDepth = scopePath.length + safeLevel;

  const sorted = [...safeTopics].sort((a, b) => getTopicParts(a).length - getTopicParts(b).length);

  sorted.forEach((topic) => {
    const parts = getTopicParts(topic);
    if (!isWithinScope(parts, scopePath) || parts.length <= absoluteDepth) {
      return;
    }

    const visibleParts = parts.slice(absoluteDepth);

    for (let i = 0; i < visibleParts.length; i += 1) {
      const segment = visibleParts[i];
      const originalParts = parts.slice(0, absoluteDepth + i + 1);
      const pathKey = originalParts.join('>');
      const parentPath = i === 0 ? '' : parts.slice(0, absoluteDepth + i).join('>');

      if (!nodeMap.has(pathKey)) {
        const isLeaf = i === visibleParts.length - 1;
        const node = {
          name: segment,
          fullPath: pathKey,
          value: isLeaf ? Math.max(1, Array.isArray(topic.sentences) ? topic.sentences.length : 1) : 0,
          children: [],
          topic: isLeaf ? topic : null,
        };
        nodeMap.set(pathKey, node);
        const parent = nodeMap.get(parentPath);
        if (parent) {
          parent.children.push(node);
        }
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
        ? `${word.slice(0, maxCharsPerLine - 1)}…`
        : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Render word-wrapped text with a white halo using two passes (back + front)
function renderLabel(g, x, y, fontSize, fontWeight, textColor, lines) {
  const lineHeight = fontSize * 1.25;
  const totalH = lines.length * lineHeight;
  const baseY = y - totalH / 2 + lineHeight * 0.8;

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

  lines.forEach((line, index) => {
    halo.append('tspan')
      .attr('x', x)
      .attr('y', baseY + index * lineHeight)
      .text(line);
  });

  const front = g.append('text')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')
    .style('font-size', `${fontSize}px`)
    .style('font-weight', fontWeight)
    .style('fill', textColor);

  lines.forEach((line, index) => {
    front.append('tspan')
      .attr('x', x)
      .attr('y', baseY + index * lineHeight)
      .text(line);
  });
}

function Breadcrumbs({ scopePath, onNavigate }) {
  return (
    <div className="article-structure-breadcrumbs" style={{ marginBottom: '10px' }}>
      <button
        type="button"
        className={`article-structure-breadcrumb-link${scopePath.length === 0 ? ' current' : ''}`}
        onClick={() => onNavigate([])}
        disabled={scopePath.length === 0}
      >
        All Topics
      </button>
      {scopePath.map((segment, index) => {
        const isCurrent = index === scopePath.length - 1;
        return (
          <React.Fragment key={`${segment}-${index}`}>
            <span className="article-structure-breadcrumb-separator">&gt;</span>
            <button
              type="button"
              className={`article-structure-breadcrumb-link${isCurrent ? ' current' : ''}`}
              onClick={() => onNavigate(scopePath.slice(0, index + 1))}
              disabled={isCurrent}
            >
              {segment}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}


export default function CircularPackingChart({ topics, sentences = [] }) {
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [scopePath, setScopePath] = useState([]);
  const [modalTopic, setModalTopic] = useState(null);

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomRef = useRef(null);

  const maxLevel = useMemo(() => getScopedMaxLevel(topics, scopePath), [topics, scopePath]);

  const hierarchyData = useMemo(
    () => buildScopedHierarchy(topics, scopePath, selectedLevel),
    [topics, scopePath, selectedLevel]
  );

  const hasHierarchyData = (hierarchyData.children || []).length > 0;

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(350)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  };

  useEffect(() => {
    if (selectedLevel > maxLevel) {
      setSelectedLevel(maxLevel);
    }
  }, [selectedLevel, maxLevel]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !hasHierarchyData) return undefined;

    const containerWidth = containerRef.current.clientWidth || 800;
    const size = Math.max(320, containerWidth);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg
      .attr('width', size)
      .attr('height', size)
      .attr('viewBox', `0 0 ${size} ${size}`)
      .style('cursor', 'grab');

    const root = d3.hierarchy(hierarchyData)
      .sum((d) => d.value || 0)
      .sort((a, b) => b.value - a.value);

    function translateSubtree(node, dx, dy) {
      node.x += dx;
      node.y += dy;
      if (node.children) {
        node.children.forEach((child) => translateSubtree(child, dx, dy));
      }
    }

    function scaleSubtree(node, pivotX, pivotY, scale) {
      node.x = pivotX + (node.x - pivotX) * scale;
      node.y = pivotY + (node.y - pivotY) * scale;
      node.r *= scale;
      if (node.children) {
        node.children.forEach((child) => scaleSubtree(child, pivotX, pivotY, scale));
      }
    }

    function applySingleChildShrink(node) {
      if (!node.children) return;
      if (node.children.length === 1) {
        const child = node.children[0];
        const scale = (node.r * 0.72) / child.r;
        if (scale < 1) scaleSubtree(child, node.x, node.y, scale);
      }
      node.children.forEach((child) => applySingleChildShrink(child));
    }

    const packSize = size * PACK_AREA_RATIO;
    const packOffset = (size - packSize) / 2;
    d3.pack().size([packSize, packSize]).padding(PACK_PADDING)(root);
    translateSubtree(root, packOffset, packOffset);

    applySingleChildShrink(root);
    scaleSubtree(root, size / 2, size / 2, CIRCLE_ENLARGE_FACTOR);

    const topLevelNames = (hierarchyData.children || []).map((child) => child.name);
    const colorScale = d3.scaleOrdinal().domain(topLevelNames).range(PALETTE);

    const getColor = (nodeDatum) => {
      let node = nodeDatum;
      while (node.depth > 1) node = node.parent;
      if (node.depth === 0) return '#eee';
      const base = colorScale(node.data.name);
      const t = Math.min(0.85, (nodeDatum.depth - 1) * 0.22);
      return d3.interpolate(base, '#ffffff')(t);
    };

    const g = svg.append('g');
    const nodes = root.descendants().filter((node) => node.depth > 0);
    const isLeaf = (node) => !node.children || node.children.length === 0;

    const circles = g.selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('cx', (node) => node.x)
      .attr('cy', (node) => node.y)
      .attr('r', (node) => node.r)
      .attr('fill', (node) => getColor(node))
      .attr('stroke', (node) => {
        const color = d3.color(getColor(node));
        return color ? color.darker(0.5).toString() : '#aaa';
      })
      .attr('stroke-width', (node) => (node.depth === 1 ? 2 : 0.8))
      .style('opacity', 0.92)
      .style('cursor', 'pointer');

    circles.append('title').text((node) => node.data.fullPath || node.data.name);

    const tooltip = d3.select(containerRef.current)
      .append('div')
      .attr('class', 'circular-packing-tooltip')
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
      .on('mouseover', (event, node) => {
        const sentenceCount = node.data.topic
          ? (Array.isArray(node.data.topic.sentences) ? node.data.topic.sentences.length : 0)
          : node.value;
        tooltip
          .style('opacity', 1)
          .html(`<strong>${node.data.fullPath || node.data.name}</strong><br/>${sentenceCount} sentence${sentenceCount !== 1 ? 's' : ''}`);
      })
      .on('mousemove', (event) => {
        const rect = containerRef.current.getBoundingClientRect();
        tooltip
          .style('left', `${event.clientX - rect.left + 14}px`)
          .style('top', `${event.clientY - rect.top - 12}px`);
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    circles
      .on('click', (event, node) => {
        event.stopPropagation();
        const isDrillable = hasDeeperChildren(topics, node.data.fullPath);
        if (isDrillable) {
          setScopePath(getTopicParts(node.data.fullPath));
          setSelectedLevel(0);
        } else {
          const topicData = node.data.topic;
          if (topicData) {
            setModalTopic({
              displayName: node.data.name,
              fullPath: node.data.fullPath,
              sentenceIndices: Array.isArray(topicData.sentences) ? topicData.sentences : []
            });
          }
        }
      });

    nodes.forEach((node) => {
      if (isLeaf(node)) {
        if (node.r < 16) return;

        const availWidth = node.r * 1.7;
        const fontSize = Math.min(13, Math.max(8, node.r * 0.38));
        const lines = wrapLines(node.data.name, availWidth, fontSize);
        const lineHeight = fontSize * 1.25;
        const totalH = lines.length * lineHeight;

        if (totalH > node.r * 1.8) return;

        renderLabel(g, node.x, node.y, fontSize, '500', '#222', lines);
        return;
      }

      if (node.r < 30) return;

      const fontSize = Math.min(13, Math.max(8, node.r * 0.18));
      const availWidth = node.r * 1.6;
      const maxChars = Math.floor(availWidth / (fontSize * CHAR_ASPECT));
      const label = node.data.name.length > maxChars
        ? `${node.data.name.slice(0, maxChars - 1)}…`
        : node.data.name;
      const labelY = node.y - node.r + fontSize + 5;

      renderLabel(g, node.x, labelY, fontSize, '700', '#333', [label]);
    });

    const zoom = d3.zoom()
      .scaleExtent([0.5, 8])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        svg.style('cursor', event.transform.k > 1 ? 'grabbing' : 'grab');
      });

    zoomRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity);
    svg.on('dblclick.zoom', null);

    return () => {
      tooltip.remove();
      svg.selectAll('*').remove();
    };
  }, [hierarchyData, hasHierarchyData, topics]);

  const scopeLabel = getScopeLabel(scopePath);

  const subtitle = scopePath.length === 0
    ? `Showing all topics at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}). Circle size reflects sentence count.`
    : `Inside ${scopeLabel} at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}). Circle size reflects sentence count.`;

  if (!topics || topics.length === 0) {
    return <p style={{ color: '#666', fontStyle: 'italic' }}>No topics available.</p>;
  }

  return (
    <div ref={containerRef} className="circular-packing-chart">
      <Breadcrumbs scopePath={scopePath} onNavigate={(path) => {
        setScopePath(path);
        setSelectedLevel(0);
      }} />

      <TopicLevelSwitcher
        className="circular-packing-level-switcher"
        selectedLevel={selectedLevel}
        maxLevel={maxLevel}
        onChange={(level) => {
          setSelectedLevel(level);
          if (level !== selectedLevel) {
            zoomRef.current = null;
          }
        }}
      />

      <p className="circular-packing-subtitle">
        {subtitle}
      </p>

      {!hasHierarchyData ? (
        <div className="circular-packing-body">
          <p className="circular-packing-no-data">
            {`No topics available inside ${scopeLabel} at relative level ${selectedLevel}. Try a different level.`}
          </p>
        </div>
      ) : (
        <div className="circular-packing-body">
          <button
            type="button"
            onClick={resetZoom}
            className="circular-packing-reset-btn"
            title="Reset zoom"
          >
            Reset zoom
          </button>
          <svg ref={svgRef} className="circular-packing-svg" style={{ display: 'block', margin: '0 auto' }} />
        </div>
      )}

      {modalTopic && (
        <TopicSentencesModal
          topic={modalTopic}
          sentences={sentences}
          onClose={() => setModalTopic(null)}
        />
      )}
    </div>
  );
}
