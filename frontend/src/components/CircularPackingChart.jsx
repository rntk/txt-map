import React, { useRef, useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import TopicLevelSwitcher from "./shared/TopicLevelSwitcher";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import Breadcrumbs from "./shared/Breadcrumbs";
import { useTopicLevel } from "../hooks/useTopicLevel";
import { useScopeNavigation } from "../hooks/useScopeNavigation";
import {
  buildScopedHierarchy,
  getScopeLabel,
  getLevelLabel,
  hasDeeperChildren,
} from "../utils/topicHierarchy";
import { isTopicSelectionRead } from "../utils/topicReadUtils";

const PALETTE = [
  "#7ba3cc",
  "#e8a87c",
  "#85bb65",
  "#c9a0dc",
  "#d4a5a5",
  "#a0c4a9",
  "#cfb997",
  "#9db4c0",
  "#c2b280",
  "#b5c7d3",
  "#d4a76a",
  "#a5b8d0",
  "#c4d4a0",
  "#d0b4c8",
  "#b3cfa0",
  "#c8b8a0",
];

const CHAR_ASPECT = 0.58; // approximate width/height ratio per character
const PACK_PADDING = 1;
const PACK_AREA_RATIO = 0.7;
const CIRCLE_ENLARGE_FACTOR = 1.6;

export { buildScopedHierarchy } from "../utils/topicHierarchy";

/**
 * @typedef {Object} CircularPackingChartProps
 * @property {import('../utils/topicHierarchy').TopicHierarchyInput[]} topics
 * @property {string[]} [sentences]
 * @property {(topic: { fullPath?: string, displayName?: string }) => void} [onShowInArticle]
 * @property {Set<string> | string[]} [readTopics]
 * @property {(topic: unknown) => void} [onToggleRead]
 * @property {unknown} [markup]
 */

// Wrap label into lines that fit within maxWidth pixels at given fontSize
function wrapLines(label, maxWidth, fontSize) {
  const maxCharsPerLine = Math.max(
    1,
    Math.floor(maxWidth / (fontSize * CHAR_ASPECT)),
  );
  const words = label.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current =
        word.length > maxCharsPerLine
          ? `${word.slice(0, maxCharsPerLine - 1)}…`
          : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Render word-wrapped text with a white halo using two passes (back + front)
function renderLabel(g, x, y, style, lines) {
  const { fontSize, fontWeight, textColor } = style;
  const lineHeight = fontSize * 1.25;
  const totalH = lines.length * lineHeight;
  const baseY = y - totalH / 2 + lineHeight * 0.8;

  const halo = g
    .append("text")
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none")
    .style("font-size", `${fontSize}px`)
    .style("font-weight", fontWeight)
    .style("stroke", "white")
    .style("stroke-width", "3px")
    .style("stroke-linejoin", "round")
    .style("fill", "none")
    .style("paint-order", "stroke");

  lines.forEach((line, index) => {
    halo
      .append("tspan")
      .attr("x", x)
      .attr("y", baseY + index * lineHeight)
      .text(line);
  });

  const front = g
    .append("text")
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none")
    .style("font-size", `${fontSize}px`)
    .style("font-weight", fontWeight)
    .style("fill", textColor);

  lines.forEach((line, index) => {
    front
      .append("tspan")
      .attr("x", x)
      .attr("y", baseY + index * lineHeight)
      .text(line);
  });
}

/**
 * @param {CircularPackingChartProps} props
 */
export default function CircularPackingChart({
  topics,
  sentences = [],
  onShowInArticle,
  readTopics,
  onToggleRead,
  markup,
}) {
  const { scopePath, navigateTo, drillInto } = useScopeNavigation();
  const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(
    topics,
    scopePath,
  );
  const [modalTopic, setModalTopic] = useState(null);

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomRef = useRef(null);

  const hierarchyData = useMemo(
    () => buildScopedHierarchy(topics, scopePath, selectedLevel),
    [topics, scopePath, selectedLevel],
  );

  const safeReadTopics = useMemo(
    () => (readTopics instanceof Set ? readTopics : new Set(readTopics || [])),
    [readTopics],
  );

  const hasHierarchyData = (hierarchyData.children || []).length > 0;

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(350)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !hasHierarchyData)
      return undefined;

    const containerWidth = containerRef.current.clientWidth || 800;
    const size = Math.max(320, containerWidth);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg
      .attr("width", size)
      .attr("height", size)
      .attr("viewBox", `0 0 ${size} ${size}`)
      .attr("class", "circular-packing-svg chart-svg chart-svg--centered");

    const root = d3
      .hierarchy(hierarchyData)
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
        node.children.forEach((child) =>
          scaleSubtree(child, pivotX, pivotY, scale),
        );
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

    const topLevelNames = (hierarchyData.children || []).map(
      (child) => child.name,
    );
    const colorScale = d3.scaleOrdinal().domain(topLevelNames).range(PALETTE);

    const getColor = (nodeDatum) => {
      let node = nodeDatum;
      while (node.depth > 1) node = node.parent;
      if (node.depth === 0) return "#eee";
      const base = colorScale(node.data.name);
      const t = Math.min(0.85, (nodeDatum.depth - 1) * 0.22);
      return d3.interpolate(base, "#ffffff")(t);
    };

    const g = svg.append("g");
    const nodes = root.descendants().filter((node) => node.depth > 0);
    const isLeaf = (node) => !node.children || node.children.length === 0;

    // Add pattern definition for read status indicator (diagonal lines)
    const defs = svg.append("defs");
    const pattern = defs
      .append("pattern")
      .attr("id", "read-pattern-circular")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8)
      .attr("patternTransform", "rotate(45)");

    pattern
      .append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", 8)
      .attr("stroke", "rgba(0,0,0,0.12)")
      .attr("stroke-width", 2);

    const circles = g
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("cx", (node) => node.x)
      .attr("cy", (node) => node.y)
      .attr("r", (node) => node.r)
      .attr("fill", (node) => getColor(node))
      .attr("stroke", (node) => {
        const color = d3.color(getColor(node));
        return color ? color.darker(0.5).toString() : "#aaa";
      })
      .attr("stroke-width", (node) => (node.depth === 1 ? 2 : 0.8))
      .style("opacity", 0.92)
      .style("cursor", "pointer");

    circles
      .append("title")
      .text((node) => node.data.fullPath || node.data.name);

    const tooltip = d3
      .select(containerRef.current)
      .append("div")
      .attr("class", "circular-packing-tooltip chart-tooltip")
      .style("opacity", 0);

    circles
      .on("mouseover", (event, node) => {
        const sentenceCount = node.data.topic
          ? Array.isArray(node.data.topic.sentences)
            ? node.data.topic.sentences.length
            : 0
          : node.value;
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${node.data.fullPath || node.data.name}</strong><br/>${sentenceCount} sentence${sentenceCount !== 1 ? "s" : ""}`,
          );
      })
      .on("mousemove", (event) => {
        const rect = containerRef.current.getBoundingClientRect();
        tooltip
          .style("left", `${event.clientX - rect.left + 14}px`)
          .style("top", `${event.clientY - rect.top - 12}px`);
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    circles.on("click", (event, node) => {
      event.stopPropagation();
      const isDrillable = hasDeeperChildren(topics, node.data.fullPath);
      if (isDrillable) {
        drillInto(node.data.fullPath);
        setSelectedLevel(0);
      } else {
        const topicData = node.data.topic;
        if (topicData) {
          setModalTopic({
            name: node.data.fullPath,
            displayName: node.data.name,
            fullPath: node.data.fullPath,
            sentenceIndices: Array.isArray(topicData.sentences)
              ? topicData.sentences
              : [],
            ranges: Array.isArray(topicData.ranges) ? topicData.ranges : [],
          });
        }
      }
    });

    // Add overlay pattern for read topics
    nodes.forEach((node) => {
      if (!isLeaf(node)) return;
      if (!node.data.topic) return;

      const topicFullPath = node.data.fullPath;
      if (!topicFullPath) return;

      const isRead = isTopicSelectionRead(node.data.topic, safeReadTopics);
      if (!isRead) return;
      if (node.r < 8) return;

      g.append("circle")
        .attr("cx", node.x)
        .attr("cy", node.y)
        .attr("r", node.r - 1)
        .attr("fill", "url(#read-pattern-circular)")
        .attr("pointer-events", "none")
        .style("opacity", 0.7);
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

        renderLabel(
          g,
          node.x,
          node.y,
          { fontSize, fontWeight: "500", textColor: "#222" },
          lines,
        );
        return;
      }

      if (node.r < 30) return;

      const fontSize = Math.min(13, Math.max(8, node.r * 0.18));
      const availWidth = node.r * 1.6;
      const maxChars = Math.floor(availWidth / (fontSize * CHAR_ASPECT));
      const label =
        node.data.name.length > maxChars
          ? `${node.data.name.slice(0, maxChars - 1)}…`
          : node.data.name;
      const labelY = node.y - node.r + fontSize + 5;

      renderLabel(
        g,
        node.x,
        labelY,
        { fontSize, fontWeight: "700", textColor: "#333" },
        [label],
      );
    });

    const zoom = d3
      .zoom()
      .scaleExtent([0.5, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        svg.style("cursor", event.transform.k > 1 ? "grabbing" : "grab");
      });

    zoomRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity);
    svg.on("dblclick.zoom", null);

    return () => {
      tooltip.remove();
      svg.selectAll("*").remove();
    };
  }, [
    drillInto,
    hierarchyData,
    hasHierarchyData,
    setSelectedLevel,
    topics,
    safeReadTopics,
  ]);

  const scopeLabel = getScopeLabel(scopePath);

  const subtitle =
    scopePath.length === 0
      ? `Showing all topics at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}). Circle size reflects sentence count.`
      : `Inside ${scopeLabel} at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}). Circle size reflects sentence count.`;

  if (!topics || topics.length === 0) {
    return (
      <p className="chart-empty-state chart-empty-state--panel">
        No topics available.
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className="circular-packing-chart chart-surface chart-surface--circular"
    >
      <Breadcrumbs
        scopePath={scopePath}
        onNavigate={(path) => {
          navigateTo(path);
          setSelectedLevel(0);
        }}
      />

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

      <p className="circular-packing-subtitle chart-section__copy">
        {subtitle}
      </p>

      {!hasHierarchyData ? (
        <div className="circular-packing-body chart-surface__body">
          <p className="circular-packing-no-data chart-empty-state chart-empty-state--panel">
            {`No topics available inside ${scopeLabel} at relative level ${selectedLevel}. Try a different level.`}
          </p>
        </div>
      ) : (
        <div className="circular-packing-body chart-surface__body">
          <button
            type="button"
            onClick={resetZoom}
            className="circular-packing-reset-btn"
            title="Reset zoom"
          >
            Reset zoom
          </button>
          <svg
            ref={svgRef}
            className="circular-packing-svg chart-svg chart-svg--centered"
          />
        </div>
      )}

      {modalTopic && (
        <TopicSentencesModal
          topic={modalTopic}
          sentences={sentences}
          onClose={() => setModalTopic(null)}
          onShowInArticle={onShowInArticle}
          allTopics={topics}
          readTopics={readTopics}
          onToggleRead={onToggleRead}
          markup={markup}
        />
      )}
    </div>
  );
}
