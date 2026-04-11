import React, { useMemo, useState } from "react";
import * as d3 from "d3";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import { buildTopicHierarchyFlowData } from "../utils/topicHierarchyFlow";
import "./TopicHierarchyFlowChart.css";

const CHART_WIDTH = 1200;
const COLUMN_GAP = 180;
const NODE_WIDTH = 22;
const NODE_GAP = 18;
const TOP_PADDING = 72;
const BOTTOM_PADDING = 40;
const LEFT_PADDING = 280;
const RIGHT_PADDING = 72;
const MIN_NODE_HEIGHT = 16;
const HEADER_HEIGHT = 26;
const COLOR_RANGE = [
  "#d28a3b",
  "#6ea39a",
  "#7e95bf",
  "#bd6f86",
  "#b4a24d",
  "#8f79b7",
  "#4d8c7a",
  "#c77d4c",
  "#758e5d",
  "#9a6d68",
];

/**
 * @typedef {Object} TopicHierarchyFlowChartProps
 * @property {Array<{ name?: string, sentences?: number[], sentenceIndices?: number[], ranges?: Array<unknown> }>} topics
 * @property {string[]} [sentences]
 * @property {(topic: unknown) => void} [onShowInArticle]
 * @property {Set<string> | string[]} [readTopics]
 * @property {(topic: unknown) => void} [onToggleRead]
 * @property {unknown} [markup]
 */

/**
 * @param {string} value
 * @param {number} limit
 * @returns {string}
 */
function truncateLabel(value, limit) {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(1, limit - 1))}…`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatCount(value) {
  return `${value.toLocaleString()} sentence${value === 1 ? "" : "s"}`;
}

/**
 * @param {{
 *   fullPath: string,
 *   label: string,
 *   sentenceIndices: number[],
 *   canonicalTopicNames: string[],
 *   ranges: Array<unknown>,
 * }} item
 * @returns {import("../utils/topicModalSelection").TopicModalSelection}
 */
function buildSelection(item) {
  return {
    kind: item.canonicalTopicNames.length > 1 ? "topic_group" : "topic",
    name: item.fullPath,
    displayName: item.label,
    fullPath: item.fullPath,
    sentenceIndices: item.sentenceIndices,
    ranges: item.ranges,
    canonicalTopicNames: item.canonicalTopicNames,
    primaryTopicName: item.canonicalTopicNames[0] || item.fullPath,
  };
}

/**
 * @param {TopicHierarchyFlowChartProps} props
 * @returns {React.ReactElement}
 */
function TopicHierarchyFlowChart({
  topics,
  sentences = [],
  onShowInArticle,
  readTopics,
  onToggleRead,
  markup,
}) {
  const [modalTopic, setModalTopic] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const flowData = useMemo(() => buildTopicHierarchyFlowData(topics), [topics]);

  const colorScale = useMemo(() => {
    const keys = [...new Set(flowData.nodes.map((node) => node.colorKey))];
    return d3.scaleOrdinal(keys, COLOR_RANGE);
  }, [flowData.nodes]);

  const layout = useMemo(() => {
    if (flowData.columns.length === 0) {
      return {
        width: CHART_WIDTH,
        height: 420,
        columns: [],
        links: [],
      };
    }

    const chartColumns = flowData.columns.length;
    const width = Math.max(
      CHART_WIDTH,
      LEFT_PADDING +
        RIGHT_PADDING +
        (chartColumns - 1) * COLUMN_GAP +
        NODE_WIDTH,
    );

    const maxColumnWeight = Math.max(
      ...flowData.columns.map((column) =>
        column.nodes.reduce((sum, node) => sum + node.weight, 0),
      ),
    );
    const maxNodeCount = Math.max(
      ...flowData.columns.map((column) => column.nodes.length),
    );
    const chartHeight = Math.max(
      520,
      flowData.nodes.length * 26,
      maxNodeCount * 44 + TOP_PADDING + BOTTOM_PADDING,
      maxColumnWeight * 18 + TOP_PADDING + BOTTOM_PADDING,
    );
    const usableHeight = chartHeight - TOP_PADDING - BOTTOM_PADDING;
    const gapBudget = Math.max(0, maxNodeCount - 1) * NODE_GAP;
    const flowScale =
      maxColumnWeight > 0
        ? Math.max(4, (usableHeight - gapBudget) / maxColumnWeight)
        : 10;

    const nodes = flowData.columns.flatMap((column) => {
      let currentY = TOP_PADDING;
      return column.nodes.map((node) => {
        const x = LEFT_PADDING + column.index * COLUMN_GAP;
        const flowHeight = node.weight * flowScale;
        const height = Math.max(MIN_NODE_HEIGHT, flowHeight);
        const layoutNode = {
          ...node,
          x,
          y: currentY,
          width: NODE_WIDTH,
          height,
          flowHeight,
          contentTop: currentY + Math.max(0, (height - flowHeight) / 2),
        };
        currentY += height + NODE_GAP;
        return layoutNode;
      });
    });

    /** @type {Map<string, typeof nodes[number]>} */
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    const links = flowData.links.map((link) => ({
      ...link,
      thickness: Math.max(2, link.weight * flowScale),
    }));

    const outgoingByNode = new Map();
    const incomingByNode = new Map();
    links.forEach((link) => {
      if (!outgoingByNode.has(link.sourceId)) {
        outgoingByNode.set(link.sourceId, []);
      }
      if (!incomingByNode.has(link.targetId)) {
        incomingByNode.set(link.targetId, []);
      }
      outgoingByNode.get(link.sourceId).push(link);
      incomingByNode.get(link.targetId).push(link);
    });

    nodes.forEach((node) => {
      const incoming = incomingByNode.get(node.id) || [];
      incoming.sort((left, right) => left.order - right.order);
      let offset = node.contentTop;
      incoming.forEach((link) => {
        link.targetY0 = offset;
        link.targetY1 = offset + link.thickness;
        offset += link.thickness;
      });

      const outgoing = outgoingByNode.get(node.id) || [];
      outgoing.sort((left, right) => left.order - right.order);
      offset = node.contentTop;
      outgoing.forEach((link) => {
        link.sourceY0 = offset;
        link.sourceY1 = offset + link.thickness;
        offset += link.thickness;
      });
    });

    const positionedLinks = links.map((link) => {
      const sourceNode = nodeMap.get(link.sourceId);
      const targetNode = nodeMap.get(link.targetId);
      if (!sourceNode || !targetNode) {
        return null;
      }

      const x0 = sourceNode.x + sourceNode.width;
      const x1 = targetNode.x;
      const curve = Math.max(36, (x1 - x0) * 0.42);
      const path = [
        `M ${x0} ${link.sourceY0}`,
        `C ${x0 + curve} ${link.sourceY0}, ${x1 - curve} ${link.targetY0}, ${x1} ${link.targetY0}`,
        `L ${x1} ${link.targetY1}`,
        `C ${x1 - curve} ${link.targetY1}, ${x0 + curve} ${link.sourceY1}, ${x0} ${link.sourceY1}`,
        "Z",
      ].join(" ");

      return {
        ...link,
        path,
        sourceNode,
        targetNode,
      };
    });

    return {
      width,
      height: chartHeight,
      columns: flowData.columns,
      nodes,
      links: positionedLinks.filter(Boolean),
    };
  }, [flowData.columns, flowData.links, flowData.nodes.length]);

  if (!topics || topics.length === 0) {
    return (
      <div className="topic-hierarchy-flow-chart chart-empty-state chart-empty-state--panel">
        No topic hierarchy available.
      </div>
    );
  }

  return (
    <>
      <div className="topic-hierarchy-flow-chart chart-surface">
        <div className="topic-hierarchy-flow-chart__header">
          <h2 className="topic-hierarchy-flow-chart__title">
            Topic Hierarchy Flow
          </h2>
          <p className="topic-hierarchy-flow-chart__subtitle">
            Leaf topics are shown on the left, top-level topics on the right,
            and ribbons trace how each topic rolls up through the hierarchy.
          </p>
        </div>

        <div className="topic-hierarchy-flow-chart__canvas">
          <svg
            className="topic-hierarchy-flow-chart__svg"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-label="Topic hierarchy flow chart"
            role="img"
          >
            {layout.columns.map((column) => {
              const x = LEFT_PADDING + column.index * COLUMN_GAP;
              return (
                <g key={column.index}>
                  <text
                    className="topic-hierarchy-flow-chart__column-label"
                    x={x + NODE_WIDTH / 2}
                    y={HEADER_HEIGHT}
                    textAnchor="middle"
                  >
                    {column.label}
                  </text>
                  <line
                    className="topic-hierarchy-flow-chart__column-rule"
                    x1={x + NODE_WIDTH / 2}
                    y1={TOP_PADDING - 24}
                    x2={x + NODE_WIDTH / 2}
                    y2={layout.height - BOTTOM_PADDING + 8}
                  />
                </g>
              );
            })}

            {layout.links.map((link) => {
              const isActive = activeId === link.id;
              return (
                <path
                  key={link.id}
                  className={`topic-hierarchy-flow-chart__link${isActive ? " topic-hierarchy-flow-chart__link--active" : ""}`}
                  d={link.path}
                  fill={colorScale(link.colorKey)}
                  fillOpacity={isActive ? 0.64 : 0.32}
                  stroke={colorScale(link.colorKey)}
                  strokeOpacity={isActive ? 0.7 : 0.18}
                  strokeWidth="1"
                  onMouseEnter={() => setActiveId(link.id)}
                  onMouseLeave={() => setActiveId(null)}
                  onClick={() =>
                    setModalTopic(
                      buildSelection({
                        fullPath: `${link.sourceNode.label} → ${link.targetNode.label}`,
                        label: `${link.sourceNode.label} → ${link.targetNode.label}`,
                        sentenceIndices: link.sentenceIndices,
                        canonicalTopicNames: link.canonicalTopicNames,
                        ranges: link.ranges,
                      }),
                    )
                  }
                >
                  <title>
                    {`${link.sourceNode.label} → ${link.targetNode.label}\n${formatCount(link.sentenceIndices.length || link.weight)}`}
                  </title>
                </path>
              );
            })}

            {layout.nodes.map((node) => {
              const fill = colorScale(node.colorKey);
              const isLeaf = node.type === "leaf";
              const isActive = activeId === node.id;
              return (
                <g
                  key={node.id}
                  className="topic-hierarchy-flow-chart__node"
                  onMouseEnter={() => setActiveId(node.id)}
                  onMouseLeave={() => setActiveId(null)}
                  onClick={() =>
                    setModalTopic(
                      buildSelection({
                        fullPath: node.fullPath,
                        label: node.label,
                        sentenceIndices: node.sentenceIndices,
                        canonicalTopicNames: node.canonicalTopicNames,
                        ranges: node.ranges,
                      }),
                    )
                  }
                >
                  <rect
                    className={`topic-hierarchy-flow-chart__node-rect${isActive ? " topic-hierarchy-flow-chart__node-rect--active" : ""}`}
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx="6"
                    fill={fill}
                    fillOpacity={isLeaf ? 0.88 : 0.76}
                    stroke={fill}
                    strokeOpacity={0.92}
                    strokeWidth={isActive ? 2 : 1}
                  />
                  <text
                    className={`topic-hierarchy-flow-chart__label${isLeaf ? " topic-hierarchy-flow-chart__label--leaf" : ""}`}
                    x={isLeaf ? node.x - 12 : node.x + node.width + 12}
                    y={node.y + node.height / 2}
                    textAnchor={isLeaf ? "end" : "start"}
                  >
                    {truncateLabel(
                      isLeaf
                        ? node.fullPath.split(">").pop() || node.label
                        : node.label,
                      isLeaf ? 34 : 22,
                    )}
                  </text>
                  <title>
                    {`${node.fullPath}\n${formatCount(node.sentenceIndices.length || node.weight)}`}
                  </title>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {modalTopic && (
        <TopicSentencesModal
          topic={modalTopic}
          sentences={sentences}
          onClose={() => setModalTopic(null)}
          onShowInArticle={onShowInArticle}
          markup={markup}
          allTopics={topics}
          readTopics={readTopics}
          onToggleRead={onToggleRead}
        />
      )}
    </>
  );
}

export default TopicHierarchyFlowChart;
