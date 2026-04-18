import React, { useMemo, useEffect, useRef } from "react";
import * as d3 from "d3";

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
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} sentence
 * @returns {string}
 */
export function sentenceToPlainText(sentence) {
  const raw = String(sentence || "");

  if (typeof document === "undefined") {
    return raw
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const template = document.createElement("template");
  template.innerHTML = raw;
  return (template.content.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * @param {string} text
 * @returns {WordTreeToken[]}
 */
export function tokenizeWordTreeText(text) {
  const source = String(text || "");
  if (!source.trim()) {
    return [];
  }

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
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
  const normalizedTarget = String(target || "").trim();
  if (!normalizedTarget) {
    return null;
  }

  const pattern = normalizedTarget
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join("\\s+");

  return new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, "giu");
}

/**
 * @param {string[]} sentences
 * @param {string} target
 * @param {Set<number>|number[]} [readSentenceIndices]
 * @returns {WordTreeEntry[]}
 */
export function buildWordTreeEntries(
  sentences,
  target,
  readSentenceIndices = new Set(),
) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  const regex = buildWordTreeMatchRegex(target);
  const readSentenceIndexSet =
    readSentenceIndices instanceof Set
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
 * @property {Set<number>} sentenceIndices
 */

/**
 * @param {WordTreeEntry[]} entries
 * @param {"left"|"right"} side
 * @returns {TrieNode}
 */
function buildTrie(entries, side) {
  const root = {
    name: "",
    children: new Map(),
    count: entries.length,
    sentenceIndices: new Set(),
  };

  entries.forEach((entry) => {
    root.sentenceIndices.add(entry.sentenceIndex);
    let current = root;
    const rawTokens =
      side === "left" ? [...entry.leftTokens].reverse() : entry.rightTokens;
    const tokens = rawTokens.slice(0, MAX_DEPTH);

    tokens.forEach((token) => {
      const key = token.normalized;
      if (!current.children.has(key)) {
        current.children.set(key, {
          name: token.text,
          children: new Map(),
          count: 0,
          sentenceIndices: new Set(),
        });
      }
      current = current.children.get(key);
      current.count++;
      current.sentenceIndices.add(entry.sentenceIndex);
    });
  });

  return root;
}

/**
 * @typedef {Object} HierarchyNode
 * @property {string} name
 * @property {number} count
 * @property {number[]} sentenceIndices
 * @property {HierarchyNode[]} children
 *
 * @param {TrieNode} node
 * @returns {HierarchyNode}
 */
function trieToHierarchy(node) {
  const root = {
    name: node.name,
    count: node.count,
    sentenceIndices: Array.from(node.sentenceIndices || []),
  };
  const visited = new WeakSet([node]);
  const stack = [{ source: node, target: root }];

  while (stack.length > 0) {
    const current = stack.pop();
    const childNodes = Array.from(current.source.children?.values() || []);
    current.target.children = new Array(childNodes.length);

    for (let index = childNodes.length - 1; index >= 0; index -= 1) {
      const child = childNodes[index];
      const childHierarchy = {
        name: child.name,
        count: child.count,
        sentenceIndices: Array.from(child.sentenceIndices || []),
        children: [],
      };

      current.target.children[index] = childHierarchy;

      if (visited.has(child)) {
        continue;
      }

      visited.add(child);
      stack.push({ source: child, target: childHierarchy });
    }
  }

  return root;
}

// ── Layout constants ───────────────────────────────────────────────────────────
const FONT_MIN = 13;
const FONT_MAX = 34;
const H_GAP = 16; // horizontal gap between words (px)
const V_GAP = 8; // vertical gap between sibling branches (px)
const LINE_HEIGHT_FACTOR = 1.6;
const PADDING = 24;
const FONT_FAMILY = "sans-serif";
const MAX_DEPTH = 12; // truncate very deep branches

// ── Highlight colors ───────────────────────────────────────────────────────────
const COLOR_HIGHLIGHT = "#d84315"; // active sentence path
const COLOR_DIM = "#d0d0d0"; // non-active nodes when something is highlighted
const COLOR_LINK_DIM = 0.08;
const COLOR_LINK_ACTIVE = 0.75;

// ── Text measurement ───────────────────────────────────────────────────────────

let _canvasCtx = null;

function getMeasureCtx() {
  if (_canvasCtx) return _canvasCtx;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    _canvasCtx = canvas.getContext("2d");
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
 * @param {HierarchyNode & Record<string, unknown>} node
 * @returns {HierarchyNode[]}
 */
function getNodeChildren(node) {
  return Array.isArray(node.children) ? node.children : [];
}

function findMaxCount(node) {
  let max = 0;
  const stack = [node];
  const visited = new WeakSet();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    max = Math.max(max, current.count || 0);
    const children = getNodeChildren(current);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

  return max;
}

function computeFontSize(count, maxCount) {
  if (maxCount <= 0) return FONT_MIN;
  return FONT_MIN + Math.sqrt(count / maxCount) * (FONT_MAX - FONT_MIN);
}

/** Annotate each node with fontSize, textWidth, lineHeight (mutates). */
function annotateNode(node, maxCount, depth) {
  const stack = [{ node, depth }];
  const visited = new WeakSet();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current?.node || visited.has(current.node)) {
      continue;
    }

    visited.add(current.node);
    current.node.fontSize = computeFontSize(current.node.count, maxCount);
    current.node.textWidth = measureTextWidth(
      current.node.name,
      current.node.fontSize,
    );
    current.node.lineHeight = current.node.fontSize * LINE_HEIGHT_FACTOR;
    current.node._depth = current.depth;

    const children =
      current.depth < MAX_DEPTH ? getNodeChildren(current.node) : [];
    current.node._visibleChildren = children;

    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: current.depth + 1 });
    }
  }
}

/** Bottom-up pass: compute subtreeHeight for each node. */
function computeSubtreeHeight(node) {
  const stack = [{ node, visited: false }];
  const seen = new WeakSet();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current?.node) {
      continue;
    }

    if (current.visited) {
      const children = current.node._visibleChildren || [];
      if (children.length === 0) {
        current.node.subtreeHeight = current.node.lineHeight;
      } else {
        const total = children.reduce(
          (sum, child) => sum + (child.subtreeHeight || child.lineHeight || 0),
          0,
        );
        current.node.subtreeHeight = total + (children.length - 1) * V_GAP;
      }
      continue;
    }

    if (seen.has(current.node)) {
      continue;
    }

    seen.add(current.node);
    stack.push({ node: current.node, visited: true });

    const children = current.node._visibleChildren || [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], visited: false });
    }
  }

  return node.subtreeHeight || node.lineHeight;
}

/**
 * Top-down pass: assign (x, y) positions relative to pivot at (0, 0).
 * For "right": child.x = parent.x + parent.textWidth + H_GAP  (x = left edge)
 * For "left":  child.x = parent.x - H_GAP - child.textWidth   (x = left edge)
 */
function assignPositions(node, x, y, parent, direction) {
  const stack = [{ node, x, y, parent }];
  const visited = new WeakSet();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current?.node || visited.has(current.node)) {
      continue;
    }

    visited.add(current.node);
    current.node.x = current.x;
    current.node.y = current.y;
    current.node.parent = current.parent;
    current.node.direction = direction;

    const children = current.node._visibleChildren || [];
    if (children.length === 0) {
      continue;
    }

    let yOffset = current.y - current.node.subtreeHeight / 2;
    const placements = [];

    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const childY = yOffset + child.subtreeHeight / 2;
      const childX =
        direction === "right"
          ? current.x + current.node.textWidth + H_GAP
          : current.x - H_GAP - child.textWidth;
      placements.push({
        node: child,
        x: childX,
        y: childY,
        parent: current.node,
      });
      yOffset += child.subtreeHeight + V_GAP;
    }

    for (let index = placements.length - 1; index >= 0; index -= 1) {
      stack.push(placements[index]);
    }
  }
}

/** Flatten tree into array (pre-order). */
function flattenTree(node, result = []) {
  const stack = [node];
  const visited = new WeakSet();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    result.push(current);

    const children = current._visibleChildren || [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

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
    name: "__pivot__",
    textWidth: pivotTextWidth,
    fontSize: FONT_MAX,
    lineHeight: FONT_MAX * LINE_HEIGHT_FACTOR,
    _visibleChildren: children,
    _depth: 0,
  };

  children.forEach((child) => annotateNode(child, maxCount, 1));

  const totalH = children.reduce((s, c) => s + computeSubtreeHeight(c), 0);
  pivotRoot.subtreeHeight = totalH + Math.max(0, children.length - 1) * V_GAP;

  // Pivot is at (0, 0); assign positions from there
  assignPositions(pivotRoot, 0, 0, null, direction);

  // Return only the real nodes (not the virtual root)
  const nodes = [];
  children.forEach((c) => flattenTree(c, nodes));
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
    [entries],
  );

  useEffect(() => {
    if (!svgRef.current || safeEntries.length === 0) return;

    const pivotFontSize = FONT_MAX;
    const pivotTextWidth = measureTextWidth(pivotLabel, pivotFontSize);
    const pivotLineHeight = pivotFontSize * LINE_HEIGHT_FACTOR;

    // Build both tries
    const rightTrie = buildTrie(safeEntries, "right");
    const leftTrie = buildTrie(safeEntries, "left");

    // Compute positioned nodes for each side (relative to pivot at 0,0)
    const rightNodes = computeOneSideLayout(
      trieToHierarchy(rightTrie),
      pivotTextWidth,
      "right",
    );
    const leftNodes = computeOneSideLayout(
      trieToHierarchy(leftTrie),
      pivotTextWidth,
      "left",
    );
    const allSideNodes = [...rightNodes, ...leftNodes];

    // ── Compute SVG bounds ─────────────────────────────────────────────────────
    const xs = allSideNodes.map((n) => n.x);
    const xEnds = allSideNodes.map((n) => n.x + n.textWidth);
    const ys = allSideNodes.map((n) => n.y);

    const minX = xs.length > 0 ? Math.min(0, ...xs) : 0;
    const maxX =
      xEnds.length > 0 ? Math.max(pivotTextWidth, ...xEnds) : pivotTextWidth;
    const minY =
      ys.length > 0
        ? Math.min(
            -pivotLineHeight / 2,
            ...ys.map(
              (_, i) => allSideNodes[i].y - allSideNodes[i].lineHeight / 2,
            ),
          )
        : -pivotLineHeight / 2;
    const maxY =
      ys.length > 0
        ? Math.max(
            pivotLineHeight / 2,
            ...ys.map(
              (_, i) => allSideNodes[i].y + allSideNodes[i].lineHeight / 2,
            ),
          )
        : pivotLineHeight / 2;

    const offsetX = PADDING - minX;
    const offsetY = PADDING - minY;
    const svgWidth = maxX - minX + PADDING * 2;
    const svgHeight = maxY - minY + PADDING * 2;

    // Pivot in SVG coordinates
    const pivotSvgX = offsetX;
    const pivotSvgY = offsetY;

    // Apply offset to all side nodes
    allSideNodes.forEach((n) => {
      n.x += offsetX;
      n.y += offsetY;
    });

    // ── Compute connector data ─────────────────────────────────────────────────
    // Draw connector only when the node's parent has 2+ siblings (branching).
    const connectors = allSideNodes
      .filter((n) => n.parent && (n.parent._visibleChildren || []).length > 1)
      .map((n) => {
        const dir = n.direction;
        const isPivotParent = n.parent.name === "__pivot__";

        // Parent edge toward the gap (after offset)
        let x1, y1;
        if (isPivotParent) {
          x1 = dir === "right" ? pivotSvgX + pivotTextWidth : pivotSvgX;
          y1 = pivotSvgY;
        } else {
          x1 = dir === "right" ? n.parent.x + n.parent.textWidth : n.parent.x;
          y1 = n.parent.y;
        }

        // Child edge toward the gap (after offset)
        const x2 = dir === "right" ? n.x : n.x + n.textWidth;
        const y2 = n.y;

        return { x1, y1, x2, y2, count: n.count, _node: n };
      });

    // ── Render ─────────────────────────────────────────────────────────────────
    const svg = d3
      .select(svgRef.current)
      .attr("width", svgWidth)
      .attr("height", svgHeight)
      .html("");

    // Connectors
    const linkSel = svg
      .append("g")
      .attr("class", "word-tree-graph__links")
      .selectAll("path")
      .data(connectors)
      .enter()
      .append("path")
      .attr("class", "word-tree-graph__link")
      .attr("d", (d) => {
        const midX = (d.x1 + d.x2) / 2;
        return `M${d.x1},${d.y1} C${midX},${d.y1} ${midX},${d.y2} ${d.x2},${d.y2}`;
      })
      .attr("stroke-width", (d) => Math.max(0.8, Math.min(3, d.count * 0.4)));

    // Color scale (shared across both sides)
    const maxCount = Math.max(...allSideNodes.map((n) => n.count || 0), 1);
    const colorScale = d3
      .scaleLinear()
      .domain([0, maxCount])
      .range(["#aaa", "#222"])
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

    const allTextData = [pivotDescriptor, ...allSideNodes];

    // Text nodes
    const textSel = svg
      .append("g")
      .attr("class", "word-tree-graph__nodes")
      .selectAll("text")
      .data(allTextData)
      .enter()
      .append("text")
      .attr("class", (d) =>
        d._isPivot
          ? "word-tree-graph__pivot-text"
          : "word-tree-graph__node-text",
      )
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y)
      .attr("dominant-baseline", "central")
      .attr("text-anchor", "start")
      .attr("font-size", (d) => d.fontSize)
      .attr("fill", (d) => (d._isPivot ? "#222" : colorScale(d.count)))
      .text((d) => d.name);

    // ── Interaction: hover/click highlights all nodes belonging to the same sentence ──
    // Each node carries sentenceIndices (the sentences that pass through it).
    // We find every node on both sides whose sentenceIndices overlaps with the
    // hovered/clicked node so the full sentence is visible across left and right.
    function sentenceNodes(node) {
      const targetSentences = new Set(node.sentenceIndices || []);
      const result = new Set();
      allSideNodes.forEach((n) => {
        if ((n.sentenceIndices || []).some((si) => targetSentences.has(si))) {
          result.add(n);
        }
      });
      return result;
    }

    let stickyChain = null; // node-reference set locked by click

    function applyHighlight(chain) {
      const active = chain !== null;
      textSel.attr("fill", (d) => {
        if (d._isPivot) return active ? COLOR_HIGHLIGHT : "#222";
        return active
          ? chain.has(d)
            ? COLOR_HIGHLIGHT
            : COLOR_DIM
          : colorScale(d.count);
      });
      linkSel
        .attr("stroke-opacity", (d) =>
          active
            ? chain.has(d._node)
              ? COLOR_LINK_ACTIVE
              : COLOR_LINK_DIM
            : 0.45,
        )
        .attr("stroke", (d) =>
          active && chain.has(d._node) ? COLOR_HIGHLIGHT : null,
        );
    }

    textSel
      .on("mouseover", function (event, d) {
        if (stickyChain || d._isPivot) return;
        applyHighlight(sentenceNodes(d));
      })
      .on("mouseout", function () {
        if (stickyChain) return;
        applyHighlight(null);
      })
      .on("click", function (event, d) {
        if (d._isPivot) return;
        event.stopPropagation();
        const newChain = sentenceNodes(d);
        // Toggle off if the same chain is already locked
        if (
          stickyChain &&
          stickyChain.size === newChain.size &&
          [...newChain].every((n) => stickyChain.has(n))
        ) {
          stickyChain = null;
          applyHighlight(null);
        } else {
          stickyChain = newChain;
          applyHighlight(stickyChain);
        }
      });

    // Click on SVG background clears sticky selection
    svg.on("click", function () {
      stickyChain = null;
      applyHighlight(null);
    });
  }, [safeEntries, pivotLabel]);

  if (safeEntries.length === 0) {
    return (
      <div className="word-tree word-tree--empty">
        <p className="word-page-no-occurrences">
          No occurrences of this word were found.
        </p>
      </div>
    );
  }

  return (
    <div className="word-tree-graph-container">
      <svg ref={svgRef}></svg>
    </div>
  );
}
