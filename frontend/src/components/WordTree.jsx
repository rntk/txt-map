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
const H_GAP = 8;           // horizontal gap between words (px)
const V_GAP = 3;           // vertical gap between sibling branches (px)
const LINE_HEIGHT_FACTOR = 1.5;
const LEFT_PADDING = 16;
const TOP_PADDING = 20;
const FONT_FAMILY = 'sans-serif';
const MAX_DEPTH = 12;      // truncate very deep branches

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

/**
 * Find the maximum count in the hierarchy tree.
 * @param {Object} node
 * @returns {number}
 */
function findMaxCount(node) {
  let max = node.count || 0;
  (node.children || []).forEach(child => {
    max = Math.max(max, findMaxCount(child));
  });
  return max;
}

/**
 * Compute font size from count and maxCount.
 * @param {number} count
 * @param {number} maxCount
 * @returns {number}
 */
function computeFontSize(count, maxCount) {
  if (maxCount <= 0) return FONT_MIN;
  const factor = Math.sqrt(count / maxCount);
  return FONT_MIN + factor * (FONT_MAX - FONT_MIN);
}

/**
 * Annotate each node with fontSize, textWidth, lineHeight (mutates node objects).
 * @param {Object} node
 * @param {number} maxCount
 * @param {number} depth
 */
function annotateNode(node, maxCount, depth) {
  node.fontSize = computeFontSize(node.count, maxCount);
  node.textWidth = measureTextWidth(node.name, node.fontSize);
  node.lineHeight = node.fontSize * LINE_HEIGHT_FACTOR;
  node._depth = depth;

  const children = depth < MAX_DEPTH ? (node.children || []) : [];
  node._visibleChildren = children;
  children.forEach(child => annotateNode(child, maxCount, depth + 1));
}

/**
 * Bottom-up pass: compute subtreeHeight for each node.
 * @param {Object} node
 * @returns {number}
 */
function computeSubtreeHeight(node) {
  const children = node._visibleChildren || [];
  if (children.length === 0) {
    node.subtreeHeight = node.lineHeight;
    return node.subtreeHeight;
  }
  const totalChildHeight = children.reduce((sum, child) => sum + computeSubtreeHeight(child), 0);
  const gaps = (children.length - 1) * V_GAP;
  node.subtreeHeight = totalChildHeight + gaps;
  return node.subtreeHeight;
}

/**
 * Top-down pass: assign (x, y) to each node.
 * @param {Object} node
 * @param {number} x
 * @param {number} y  — vertical center of this node's band
 * @param {Object|null} parent
 */
function assignPositions(node, x, y, parent) {
  node.x = x;
  node.y = y;
  node.parent = parent;

  const children = node._visibleChildren || [];
  if (children.length === 0) return;

  const childX = x + node.textWidth + H_GAP;
  let yOffset = y - node.subtreeHeight / 2;

  children.forEach(child => {
    const childY = yOffset + child.subtreeHeight / 2;
    assignPositions(child, childX, childY, node);
    yOffset += child.subtreeHeight + V_GAP;
  });
}

/**
 * Flatten positioned tree into an array of nodes (for D3 data binding).
 * @param {Object} node
 * @param {Array} result
 * @returns {Array}
 */
function flattenTree(node, result = []) {
  result.push(node);
  (node._visibleChildren || []).forEach(child => flattenTree(child, result));
  return result;
}

/**
 * Compute the full text-flow layout.
 * @param {Object} hierarchy   — output of trieToHierarchy
 * @param {string} pivotLabel
 * @returns {{ nodes: Object[], width: number, height: number }}
 */
function computeLayout(hierarchy, pivotLabel) {
  const maxCount = Math.max(findMaxCount(hierarchy), 1);

  // Annotate root (the virtual root whose name="" represents the pivot)
  // We treat the pivot word as a pseudo-root node
  const root = {
    name: pivotLabel,
    count: hierarchy.count,
    children: hierarchy.children,
    _visibleChildren: hierarchy.children || [],
  };
  root.fontSize = FONT_MAX;
  root.textWidth = measureTextWidth(pivotLabel, root.fontSize);
  root.lineHeight = root.fontSize * LINE_HEIGHT_FACTOR;
  root._depth = 0;

  // Annotate children
  (root._visibleChildren || []).forEach(child => annotateNode(child, maxCount, 1));

  // Bottom-up
  computeSubtreeHeight(root);

  // Top-down — start at center vertically
  const totalHeight = root.subtreeHeight + TOP_PADDING * 2;
  assignPositions(root, LEFT_PADDING, totalHeight / 2, null);

  // Shift all y values so none are negative
  const allNodes = flattenTree(root);
  const minY = Math.min(...allNodes.map(n => n.y - n.lineHeight / 2));
  const shift = minY < TOP_PADDING ? TOP_PADDING - minY : 0;
  allNodes.forEach(n => { n.y += shift; });

  const maxX = Math.max(...allNodes.map(n => n.x + n.textWidth));
  const maxY = Math.max(...allNodes.map(n => n.y + n.lineHeight / 2));

  return {
    nodes: allNodes,
    width: maxX + LEFT_PADDING,
    height: maxY + TOP_PADDING,
  };
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

    // Build suffix trie (text flows right from pivot)
    const rightTrie = buildTrie(safeEntries, "right");
    const hierarchy = trieToHierarchy(rightTrie);

    const { nodes, width, height } = computeLayout(hierarchy, pivotLabel);

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .html("");

    // ── Draw connectors (only when parent has 2+ children) ───────────────────
    const connectorNodes = nodes.filter(n => n.parent && (n.parent._visibleChildren || []).length > 1);

    svg.append("g")
      .attr("class", "word-tree-graph__links")
      .selectAll("path")
      .data(connectorNodes)
      .enter()
      .append("path")
      .attr("class", "word-tree-graph__link")
      .attr("d", d => {
        const px = d.parent.x + d.parent.textWidth;
        const py = d.parent.y;
        const cx = d.x;
        const cy = d.y;
        const midX = (px + cx) / 2;
        return `M${px},${py} C${midX},${py} ${midX},${cy} ${cx},${cy}`;
      })
      .attr("stroke-width", d => Math.max(0.8, Math.min(3, d.count * 0.4)));

    // ── Compute fill color scale ─────────────────────────────────────────────
    const maxCount = Math.max(...nodes.map(n => n.count || 0), 1);
    const colorScale = d3.scaleLinear()
      .domain([0, maxCount])
      .range(["#aaa", "#222"])
      .clamp(true);

    // ── Draw text nodes ──────────────────────────────────────────────────────
    svg.append("g")
      .attr("class", "word-tree-graph__nodes")
      .selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .attr("class", d => d.parent === null
        ? "word-tree-graph__pivot-text"
        : "word-tree-graph__node-text")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("dominant-baseline", "central")
      .attr("text-anchor", "start")
      .attr("font-size", d => d.fontSize)
      .attr("fill", d => d.parent === null ? "#222" : colorScale(d.count))
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
