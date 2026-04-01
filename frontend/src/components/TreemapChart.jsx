import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import TopicLevelSwitcher from './shared/TopicLevelSwitcher';
import TopicSentencesModal from './shared/TopicSentencesModal';
import Breadcrumbs from './shared/Breadcrumbs';
import { useTopicLevel } from '../hooks/useTopicLevel';
import { useScopeNavigation } from '../hooks/useScopeNavigation';
import {
  buildScopedHierarchy,
  getScopeLabel,
  getLevelLabel,
  hasDeeperChildren
} from '../utils/topicHierarchy';

const PALETTE = [
  '#f2b35d', '#8fd6f4', '#78d9b6', '#f27b8a',
  '#82b7f8', '#c1ccd8', '#ffd27f', '#b0d88d',
  '#d4b2f0', '#f4bf8d', '#9dc7c9', '#b4c1dc',
  '#c8d285', '#d0b8c7', '#adc8a1', '#cab7a0',
];

const CHAR_ASPECT = 0.58;
const TREEMAP_MIN_SIZE = 14;
const TREEMAP_INNER_PADDING = 4;
const TREEMAP_OUTER_PADDING = 6;
const TREEMAP_HEADER_HEIGHT = 28;
const TREEMAP_LABEL_PADDING_X = 8;
const TREEMAP_LABEL_PADDING_Y = 6;
const TREEMAP_MAX_HEIGHT = 720;

export { buildScopedHierarchy } from '../utils/topicHierarchy';

/**
 * @typedef {Object} TreemapChartProps
 * @property {Array<{ name?: string, sentences?: number[], fullPath?: string, displayName?: string, topic?: { sentences?: number[], ranges?: Array<unknown> } }>} topics
 * @property {string[]} [sentences]
 * @property {(topic: unknown) => void} [onShowInArticle]
 * @property {Set<string> | string[]} [readTopics]
 * @property {(topic: unknown) => void} [onToggleRead]
 * @property {unknown} [markup]
 */

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

function renderCenteredLabel(g, x, y, fontSize, fontWeight, textColor, lines) {
  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  const baseY = y - totalHeight / 2 + lineHeight * 0.8;

  const halo = g.append('text')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')
    .style('font-size', `${fontSize}px`)
    .style('font-weight', fontWeight)
    .style('stroke', 'white')
    .style('stroke-width', '2px')
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

function renderHeaderLabel(g, x, y, width, fontSize, textColor, label) {
  const maxChars = Math.max(1, Math.floor((width - TREEMAP_LABEL_PADDING_X * 2) / (fontSize * CHAR_ASPECT)));
  const displayLabel = label.length > maxChars
    ? `${label.slice(0, Math.max(1, maxChars - 1))}…`
    : label;

  const halo = g.append('text')
    .attr('x', x + TREEMAP_LABEL_PADDING_X)
    .attr('y', y + TREEMAP_LABEL_PADDING_Y + fontSize)
    .attr('text-anchor', 'start')
    .attr('pointer-events', 'none')
    .style('font-size', `${fontSize}px`)
    .style('font-weight', '700')
    .style('stroke', 'white')
    .style('stroke-width', '3px')
    .style('stroke-linejoin', 'round')
    .style('fill', 'none')
    .style('paint-order', 'stroke')
    .text(displayLabel);

  const front = g.append('text')
    .attr('x', x + TREEMAP_LABEL_PADDING_X)
    .attr('y', y + TREEMAP_LABEL_PADDING_Y + fontSize)
    .attr('text-anchor', 'start')
    .attr('pointer-events', 'none')
    .style('font-size', `${fontSize}px`)
    .style('font-weight', '700')
    .style('fill', textColor)
    .text(displayLabel);

  return { halo, front };
}

function getContrastingTextColor(backgroundColor) {
  const color = d3.color(backgroundColor);
  if (!color) return '#222';
  const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
  return luminance > 0.63 ? '#222' : '#fff';
}

function getTreemapFillColor(nodeDatum, colorScale) {
  let ancestor = nodeDatum;
  while (ancestor.depth > 1) ancestor = ancestor.parent;
  if (ancestor.depth === 0) return '#eee';

  const base = colorScale(ancestor.data.name);
  if (nodeDatum.depth === 1) return base;

  const tint = Math.min(0.82, 0.18 + (nodeDatum.depth - 2) * 0.16);
  return d3.interpolate(base, '#ffffff')(tint);
}

/**
 * @param {TreemapChartProps} props
 */
export default function TreemapChart({
  topics,
  sentences = [],
  onShowInArticle,
  readTopics,
  onToggleRead,
  markup,
}) {
  const { scopePath, navigateTo, drillInto } = useScopeNavigation();
  const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(topics, scopePath);
  const [modalTopic, setModalTopic] = useState(null);

  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const hierarchyData = useMemo(
    () => buildScopedHierarchy(topics, scopePath, selectedLevel),
    [topics, scopePath, selectedLevel]
  );

  const safeReadTopics = useMemo(
    () => (readTopics instanceof Set ? readTopics : new Set(readTopics || [])),
    [readTopics]
  );

  const hasHierarchyData = (hierarchyData.children || []).length > 0;

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !hasHierarchyData) return undefined;

    const containerWidth = containerRef.current.clientWidth || 800;
    const width = containerWidth;
    const height = Math.min(TREEMAP_MAX_HEIGHT, Math.max(360, Math.round(containerWidth * 0.8)));

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const root = d3.hierarchy(hierarchyData)
      .sum((datum) => datum.value || 0)
      .sort((a, b) => b.value - a.value);

    const topLevelNames = (hierarchyData.children || []).map((child) => child.name);
    const colorScale = d3.scaleOrdinal().domain(topLevelNames).range(PALETTE);

    d3.treemap()
      .tile(d3.treemapSquarify.ratio(1.15))
      .size([width, height])
      .paddingOuter(TREEMAP_OUTER_PADDING)
      .paddingInner(TREEMAP_INNER_PADDING)
      .paddingTop((node) => (node.depth > 0 && node.children ? TREEMAP_HEADER_HEIGHT : 0))(root);

    const g = svg.append('g');
    const nodes = root.descendants().filter((node) => node.depth > 0);

    // Add pattern definition for read status indicator (diagonal lines)
    const defs = svg.append('defs');
    const pattern = defs.append('pattern')
      .attr('id', 'read-pattern-treemap')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 8)
      .attr('height', 8)
      .attr('patternTransform', 'rotate(45)');
    
    pattern.append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', 8)
      .attr('stroke', 'rgba(0,0,0,0.12)')
      .attr('stroke-width', 2);

    d3.select(containerRef.current).selectAll('.treemap-tooltip').remove();
    const tooltip = d3.select(containerRef.current)
      .append('div')
      .attr('class', 'treemap-tooltip chart-tooltip')
      .style('opacity', 0);

    nodes.forEach((node) => {
      const rectWidth = Math.max(0, node.x1 - node.x0);
      const rectHeight = Math.max(0, node.y1 - node.y0);

      if (rectWidth < TREEMAP_MIN_SIZE || rectHeight < TREEMAP_MIN_SIZE) {
        return;
      }

      const isLeaf = !node.children || node.children.length === 0;
      const fillColor = getTreemapFillColor(node, colorScale);
      const fillStrokeColor = d3.color(fillColor)?.darker(node.depth === 1 ? 0.35 : 0.22)?.toString() || '#666';
      const sentenceCount = node.data.topic
        ? (Array.isArray(node.data.topic.sentences) ? node.data.topic.sentences.length : 0)
        : node.value;
      const isDrillable = hasDeeperChildren(topics, node.data.fullPath);
      const isInteractive = isDrillable || Boolean(node.data.topic);
      const group = g.append('g')
        .attr('class', isLeaf ? 'treemap-node treemap-node--leaf' : 'treemap-node treemap-node--group');

      const rect = group.append('rect')
        .attr('x', node.x0)
        .attr('y', node.y0)
        .attr('width', rectWidth)
        .attr('height', rectHeight)
        .attr('fill', fillColor)
        .attr('stroke', fillStrokeColor)
        .attr('stroke-width', node.depth === 1 ? 2 : 1.2)
        .attr('rx', 4)
          .attr('opacity', node.depth === 1 ? 0.98 : 0.95)
          .attr('class', `treemap-node__rect${isInteractive ? ' treemap-node__rect--interactive' : ''}`);

      rect.append('title').text(
        `${node.data.fullPath || node.data.name}\n${sentenceCount} sentence${sentenceCount !== 1 ? 's' : ''}`
      );

      rect
        .on('mouseover', (event) => {
          event.stopPropagation();
          d3.select(event.currentTarget)
            .attr('stroke', '#333')
            .attr('stroke-width', node.depth === 1 ? 2.6 : 2);

          tooltip
            .style('opacity', 1)
            .html(`<strong>${node.data.fullPath || node.data.name}</strong><br/>${sentenceCount} sentence${sentenceCount !== 1 ? 's' : ''}`);
        })
        .on('mousemove', (event) => {
          const bounds = containerRef.current.getBoundingClientRect();
          tooltip
            .style('left', `${event.clientX - bounds.left + 14}px`)
            .style('top', `${event.clientY - bounds.top - 12}px`);
        })
        .on('mouseout', (event) => {
          d3.select(event.currentTarget)
            .attr('stroke', fillStrokeColor)
            .attr('stroke-width', node.depth === 1 ? 2 : 1.2);

          tooltip.style('opacity', 0);
        })
        .on('click', (event) => {
          event.stopPropagation();

          if (isDrillable) {
            drillInto(node.data.fullPath);
            setSelectedLevel(0);
            return;
          }

          if (node.data.topic) {
            setModalTopic({
              name: node.data.fullPath,
              displayName: node.data.name,
              fullPath: node.data.fullPath,
              sentenceIndices: Array.isArray(node.data.topic.sentences) ? node.data.topic.sentences : [],
              ranges: Array.isArray(node.data.topic.ranges) ? node.data.topic.ranges : [],
            });
          }
        });

      if (isLeaf) {
        if (rectWidth < 40 || rectHeight < 24) {
          return;
        }

        // Add overlay pattern for read topics
        const topicFullPath = node.data.fullPath;
        if (topicFullPath && safeReadTopics.has(topicFullPath)) {
          group.append('rect')
            .attr('x', node.x0 + 1)
            .attr('y', node.y0 + 1)
            .attr('width', Math.max(0, rectWidth - 2))
            .attr('height', Math.max(0, rectHeight - 2))
            .attr('fill', 'url(#read-pattern-treemap)')
            .attr('pointer-events', 'none')
            .attr('rx', 3)
            .attr('opacity', 0.7);
        }

        const fontSize = Math.min(16, Math.max(9, Math.min(rectWidth * 0.12, rectHeight * 0.28)));
        const maxLines = Math.max(1, Math.floor((rectHeight - 8) / (fontSize * 1.2)));
        const lines = wrapLines(node.data.name, rectWidth - 10, fontSize).slice(0, maxLines);

        if (lines.length > 0) {
          renderCenteredLabel(
            group,
            node.x0 + rectWidth / 2,
            node.y0 + rectHeight / 2,
            fontSize,
            '600',
            getContrastingTextColor(fillColor),
            lines
          );
        }

        return;
      }

      if (rectWidth >= 88 && rectHeight >= TREEMAP_HEADER_HEIGHT + 10) {
        renderHeaderLabel(
          group,
          node.x0,
          node.y0,
          rectWidth,
          12,
          getContrastingTextColor(fillColor),
          node.data.name
        );
      }
    });

    return () => {
      tooltip.remove();
      svg.selectAll('*').remove();
    };
  }, [drillInto, hierarchyData, hasHierarchyData, setSelectedLevel, topics, safeReadTopics]);

  const scopeLabel = getScopeLabel(scopePath);

  const subtitle = scopePath.length === 0
    ? `Showing all topics at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}). Rectangle size reflects sentence count.`
    : `Inside ${scopeLabel} at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}). Rectangle size reflects sentence count.`;

  if (!topics || topics.length === 0) {
    return <p className="treemap-no-data treemap-no-data--standalone">No topics available.</p>;
  }

  return (
      <div ref={containerRef} className="treemap-chart chart-surface chart-surface--treemap">
      <Breadcrumbs scopePath={scopePath} onNavigate={(path) => {
        navigateTo(path);
        setSelectedLevel(0);
      }} />

      <TopicLevelSwitcher
        className="treemap-level-switcher"
        selectedLevel={selectedLevel}
        maxLevel={maxLevel}
        onChange={(level) => {
          setSelectedLevel(level);
        }}
      />

      <p className="treemap-subtitle chart-section__copy">
        {subtitle}
      </p>

      {!hasHierarchyData ? (
        <div className="treemap-body treemap-body--empty chart-surface__body">
          <p className="treemap-no-data chart-empty-state chart-empty-state--panel">
            {`No topics available inside ${scopeLabel} at relative level ${selectedLevel}. Try a different level.`}
          </p>
        </div>
      ) : (
        <div className="treemap-body chart-surface__body">
          <svg ref={svgRef} className="treemap-svg chart-svg" />
        </div>
      )}

      {modalTopic && (
        <TopicSentencesModal
          topic={modalTopic}
          sentences={sentences}
          onClose={() => setModalTopic(null)}
          onShowInArticle={onShowInArticle}
          readTopics={readTopics}
          onToggleRead={onToggleRead}
          markup={markup}
        />
      )}
    </div>
  );
}
