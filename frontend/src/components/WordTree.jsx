import React, { useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';

/**
 * @typedef {Object} WordTreeToken
 * @property {string} text
 * @property {string} normalized
 *
 * @typedef {Object} WordTreeEntry
 * @property {string} id
 * @property {number} sentenceIndex
 * @property {number} sentenceNumber
 * @property {string} sentenceText
 * @property {string} matchText
 * @property {WordTreeToken[]} leftTokens
 * @property {WordTreeToken[]} rightTokens
 * @property {boolean} isRead
 *
 * @typedef {Object} WordTreeProps
 * @property {WordTreeEntry[]} entries
 * @property {string} pivotLabel
 */

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} sentence
 * @returns {string}
 */
export function sentenceToPlainText(sentence) {
  const raw = String(sentence || '');

  if (typeof document === 'undefined') {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const template = document.createElement('template');
  template.innerHTML = raw;
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} text
 * @returns {WordTreeToken[]}
 */
export function tokenizeWordTreeText(text) {
  const source = String(text || '');
  if (!source.trim()) {
    return [];
  }

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    return Array.from(segmenter.segment(source))
      .filter((part) => part.isWordLike)
      .map((part) => ({
        text: part.segment,
        normalized: part.segment.toLocaleLowerCase(),
      }))
      .filter((part) => part.normalized.length > 0);
  }

  const matches = source.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
  return matches.map((token) => ({
    text: token,
    normalized: token.toLocaleLowerCase(),
  }));
}

/**
 * @param {string} target
 * @returns {RegExp|null}
 */
export function buildWordTreeMatchRegex(target) {
  const normalizedTarget = String(target || '').trim();
  if (!normalizedTarget) {
    return null;
  }

  const pattern = normalizedTarget
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join('\\s+');

  return new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, 'giu');
}

/**
 * @param {string[]} sentences
 * @param {string} target
 * @param {Set<number>|number[]} [readSentenceIndices]
 * @returns {WordTreeEntry[]}
 */
export function buildWordTreeEntries(sentences, target, readSentenceIndices = new Set()) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  const regex = buildWordTreeMatchRegex(target);
  const readSentenceIndexSet = readSentenceIndices instanceof Set
    ? readSentenceIndices
    : new Set(readSentenceIndices || []);

  if (!regex) {
    return [];
  }

  /** @type {WordTreeEntry[]} */
  const entries = [];

  safeSentences.forEach((sentence, sentenceIndex) => {
    const sentenceText = sentenceToPlainText(sentence);
    if (!sentenceText) {
      return;
    }

    regex.lastIndex = 0;
    let match = regex.exec(sentenceText);
    let occurrenceIndex = 0;

    while (match) {
      const matchText = match[0];
      const matchStart = match.index;
      const matchEnd = matchStart + matchText.length;
      const leftText = sentenceText.slice(0, matchStart).trim();
      const rightText = sentenceText.slice(matchEnd).trim();

      entries.push({
        id: `${sentenceIndex}-${matchStart}-${occurrenceIndex}`,
        sentenceIndex,
        sentenceNumber: sentenceIndex + 1,
        sentenceText,
        matchText,
        leftTokens: tokenizeWordTreeText(leftText),
        rightTokens: tokenizeWordTreeText(rightText),
        isRead: readSentenceIndexSet.has(sentenceIndex + 1),
      });

      occurrenceIndex += 1;
      match = regex.exec(sentenceText);
    }
  });

  return entries;
}

/**
 * @typedef {Object} TrieNode
 * @property {string} name
 * @property {Map<string, TrieNode>} children
 * @property {number} count
 */

/**
 * @param {WordTreeEntry[]} entries
 * @param {"left"|"right"} side
 * @returns {TrieNode}
 */
function buildTrie(entries, side) {
  const root = { name: "", children: new Map(), count: entries.length };

  entries.forEach((entry) => {
    let current = root;
    const tokens = side === "left"
      ? [...entry.leftTokens].reverse()
      : entry.rightTokens;

    tokens.forEach((token) => {
      const key = token.normalized;
      if (!current.children.has(key)) {
        current.children.set(key, { name: token.text, children: new Map(), count: 0 });
      }
      current = current.children.get(key);
      current.count++;
    });
  });

  return root;
}

/**
 * @param {TrieNode} node
 * @returns {Object}
 */
function trieToHierarchy(node) {
  return {
    name: node.name,
    count: node.count,
    children: Array.from(node.children.values()).map(trieToHierarchy)
  };
}

// ── Layout constants ───────────────────────────────────────────────────────────
const FONT_MIN = 10;
const FONT_MAX = 28;
const H_GAP = 8;            // horizontal gap between words (px)
const V_GAP = 3;            // vertical gap between sibling branches (px)
const LINE_HEIGHT_FACTOR = 1.5;
const PADDING = 20;
const FONT_FAMILY = 'sans-serif';
const MAX_DEPTH = 12;       // truncate very deep branches

// ── Text measurement ───────────────────────────────────────────────────────────

let _canvasCtx = null;

function getMeasureCtx() {
  if (_canvasCtx) return _canvasCtx;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    _canvasCtx = canvas.getContext('2d');
  }
  return _canvasCtx;
}

/**
 * Measure text width at a given font size.
 * Falls back to character-count estimate when canvas is unavailable (jsdom/SSR).
 * @param {string} text
 * @param {number} fontSize
 * @returns {number}
 */
function measureTextWidth(text, fontSize) {
  const ctx = getMeasureCtx();
  if (ctx) {
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    return ctx.measureText(text).width;
  }
  return text.length * fontSize * 0.6;
}

// ── Layout algorithm ───────────────────────────────────────────────────────────

function findMaxCount(node) {
  let max = node.count || 0;
  (node.children || []).forEach(child => {
    max = Math.max(max, findMaxCount(child));
  });
  return max;
}

function computeFontSize(count, maxCount) {
  if (maxCount <= 0) return FONT_MIN;
  return FONT_MIN + Math.sqrt(count / maxCount) * (FONT_MAX - FONT_MIN);
}

/** Annotate each node with fontSize, textWidth, lineHeight (mutates). */
function annotateNode(node, maxCount, depth) {
  node.fontSize = computeFontSize(node.count, maxCount);
  node.textWidth = measureTextWidth(node.name, node.fontSize);
  node.lineHeight = node.fontSize * LINE_HEIGHT_FACTOR;
  node._depth = depth;

  const children = depth < MAX_DEPTH ? (node.children || []) : [];
  node._visibleChildren = children;
  children.forEach(child => annotateNode(child, maxCount, depth + 1));
}

/** Bottom-up pass: compute subtreeHeight for each node. */
function computeSubtreeHeight(node) {
  const children = node._visibleChildren || [];
  if (children.length === 0) {
    node.subtreeHeight = node.lineHeight;
    return node.subtreeHeight;
  }
  const total = children.reduce((s, c) => s + computeSubtreeHeight(c), 0);
  node.subtreeHeight = total + (children.length - 1) * V_GAP;
  return node.subtreeHeight;
}

/**
 * Top-down pass: assign (x, y) positions relative to pivot at (0, 0).
 * For "right": child.x = parent.x + parent.textWidth + H_GAP  (x = left edge)
 * For "left":  child.x = parent.x - H_GAP - child.textWidth   (x = left edge)
 */
function assignPositions(node, x, y, parent, direction) {
  node.x = x;
  node.y = y;
  node.parent = parent;
  node.direction = direction;

  const children = node._visibleChildren || [];
  if (children.length === 0) return;

  let yOffset = y - node.subtreeHeight / 2;
  children.forEach(child => {
    const childY = yOffset + child.subtreeHeight / 2;
    const childX = direction === 'right'
      ? x + node.textWidth + H_GAP
      : x - H_GAP - child.textWidth;
    assignPositions(child, childX, childY, node, direction);
    yOffset += child.subtreeHeight + V_GAP;
  });
}

/** Flatten tree into array (pre-order). */
function flattenTree(node, result = []) {
  result.push(node);
  (node._visibleChildren || []).forEach(child => flattenTree(child, result));
  return result;
}

/**
 * Compute layout for one side (left or right) relative to pivot at (0, 0).
 * Returns a flat array of annotated+positioned nodes (not including the pivot itself).
 */
function computeOneSideLayout(hierarchy, pivotTextWidth, direction) {
  const children = hierarchy.children || [];
  if (children.length === 0) return [];

  const maxCount = Math.max(findMaxCount(hierarchy), 1);

  // Virtual root standing in for the pivot
  const pivotRoot = {
    name: '__pivot__',
    textWidth: pivotTextWidth,
    fontSize: FONT_MAX,
    lineHeight: FONT_MAX * LINE_HEIGHT_FACTOR,
    _visibleChildren: children,
    _depth: 0,
  };

  children.forEach(child => annotateNode(child, maxCount, 1));

  const totalH = children.reduce((s, c) => s + computeSubtreeHeight(c), 0);
  pivotRoot.subtreeHeight = totalH + Math.max(0, children.length - 1) * V_GAP;

  // Pivot is at (0, 0); assign positions from there
  assignPositions(pivotRoot, 0, 0, null, direction);

  // Return only the real nodes (not the virtual root)
  const nodes = [];
  children.forEach(c => flattenTree(c, nodes));
  return nodes;
}

// ── React component ────────────────────────────────────────────────────────────

/**
 * @param {WordTreeProps} props
 * @returns {React.ReactElement}
 */
export default function WordTree({ entries, pivotLabel }) {
  const svgRef = useRef(null);

  const safeEntries = useMemo(
    () => (Array.isArray(entries) ? entries : []),
    [entries]
  );

  useEffect(() => {
    if (!svgRef.current || safeEntries.length === 0) return;

    const pivotFontSize = FONT_MAX;
    const pivotTextWidth = measureTextWidth(pivotLabel, pivotFontSize);
    const pivotLineHeight = pivotFontSize * LINE_HEIGHT_FACTOR;

    // Build both tries
    const rightTrie = buildTrie(safeEntries, 'right');
    const leftTrie  = buildTrie(safeEntries, 'left');

    // Compute positioned nodes for each side (relative to pivot at 0,0)
    const rightNodes = computeOneSideLayout(trieToHierarchy(rightTrie), pivotTextWidth, 'right');
    const leftNodes  = computeOneSideLayout(trieToHierarchy(leftTrie),  pivotTextWidth, 'left');
    const allSideNodes = [...rightNodes, ...leftNodes];

    // ── Compute SVG bounds ─────────────────────────────────────────────────────
    const xs    = allSideNodes.map(n => n.x);
    const xEnds = allSideNodes.map(n => n.x + n.textWidth);
    const ys    = allSideNodes.map(n => n.y);

    const minX = xs.length    > 0 ? Math.min(0, ...xs)             : 0;
    const maxX = xEnds.length > 0 ? Math.max(pivotTextWidth, ...xEnds) : pivotTextWidth;
    const minY = ys.length    > 0 ? Math.min(-pivotLineHeight / 2, ...ys.map((_, i) => allSideNodes[i].y - allSideNodes[i].lineHeight / 2)) : -pivotLineHeight / 2;
    const maxY = ys.length    > 0 ? Math.max( pivotLineHeight / 2, ...ys.map((_, i) => allSideNodes[i].y + allSideNodes[i].lineHeight / 2)) :  pivotLineHeight / 2;

    const offsetX = PADDING - minX;
    const offsetY = PADDING - minY;
    const svgWidth  = maxX - minX + PADDING * 2;
    const svgHeight = maxY - minY + PADDING * 2;

    // Pivot in SVG coordinates
    const pivotSvgX = offsetX;
    const pivotSvgY = offsetY;

    // Apply offset to all side nodes
    allSideNodes.forEach(n => {
      n.x += offsetX;
      n.y += offsetY;
    });

    // ── Compute connector data ─────────────────────────────────────────────────
    // Draw connector only when the node's parent has 2+ siblings (branching).
    const connectors = allSideNodes
      .filter(n => n.parent && (n.parent._visibleChildren || []).length > 1)
      .map(n => {
        const dir = n.direction;
        const isPivotParent = n.parent.name === '__pivot__';

        // Parent edge toward the gap (after offset)
        let x1, y1;
        if (isPivotParent) {
          x1 = dir === 'right' ? pivotSvgX + pivotTextWidth : pivotSvgX;
          y1 = pivotSvgY;
        } else {
          x1 = dir === 'right' ? n.parent.x + n.parent.textWidth : n.parent.x;
          y1 = n.parent.y;
        }

        // Child edge toward the gap (after offset)
        const x2 = dir === 'right' ? n.x : n.x + n.textWidth;
        const y2 = n.y;

        return { x1, y1, x2, y2, count: n.count };
      });

    // ── Render ─────────────────────────────────────────────────────────────────
    const svg = d3.select(svgRef.current)
      .attr('width', svgWidth)
      .attr('height', svgHeight)
      .html('');

    // Connectors
    svg.append('g')
      .attr('class', 'word-tree-graph__links')
      .selectAll('path')
      .data(connectors)
      .enter()
      .append('path')
      .attr('class', 'word-tree-graph__link')
      .attr('d', d => {
        const midX = (d.x1 + d.x2) / 2;
        return `M${d.x1},${d.y1} C${midX},${d.y1} ${midX},${d.y2} ${d.x2},${d.y2}`;
      })
      .attr('stroke-width', d => Math.max(0.8, Math.min(3, d.count * 0.4)));

    // Color scale (shared across both sides)
    const maxCount = Math.max(...allSideNodes.map(n => n.count || 0), 1);
    const colorScale = d3.scaleLinear()
      .domain([0, maxCount])
      .range(['#aaa', '#222'])
      .clamp(true);

    // Pivot node descriptor (for unified data array)
    const pivotDescriptor = {
      name: pivotLabel,
      x: pivotSvgX,
      y: pivotSvgY,
      fontSize: pivotFontSize,
      textWidth: pivotTextWidth,
      count: rightTrie.count,
      _isPivot: true,
    };

    // Text nodes
    svg.append('g')
      .attr('class', 'word-tree-graph__nodes')
      .selectAll('text')
      .data([pivotDescriptor, ...allSideNodes])
      .enter()
      .append('text')
      .attr('class', d => d._isPivot
        ? 'word-tree-graph__pivot-text'
        : 'word-tree-graph__node-text')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'start')
      .attr('font-size', d => d.fontSize)
      .attr('fill', d => d._isPivot ? '#222' : colorScale(d.count))
      .text(d => d.name);

  }, [safeEntries, pivotLabel]);

  if (safeEntries.length === 0) {
    return (
      <div className="word-tree word-tree--empty">
        <p className="word-page-no-occurrences">No occurrences of this word were found.</p>
      </div>
    );
  }

  return (
    <div className="word-tree-graph-container">
      <svg ref={svgRef}></svg>
    </div>
  );
}
