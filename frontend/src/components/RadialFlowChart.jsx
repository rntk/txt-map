import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import * as d3 from "d3";
import "../styles/App.css";
import TopicLevelSwitcher from "./shared/TopicLevelSwitcher";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import {
  buildScopedChartData,
  getLevelLabel,
  getScopeLabel,
  getScopedMaxLevel,
  hasDeeperChildren,
  getTopicParts,
  isWithinScope,
} from "../utils/topicHierarchy";
import { BASE_COLORS } from "../utils/chartConstants";
import Breadcrumbs from "./shared/Breadcrumbs";
import { useTopicLevel } from "../hooks/useTopicLevel";
import { useScopeNavigation } from "../hooks/useScopeNavigation";
import { useContainerSize } from "../hooks/useContainerSize";
import { isTopicSelectionRead } from "../utils/topicReadUtils";
import { buildModalSelectionFromTopic } from "../utils/topicModalSelection";
import { useArticle } from "../contexts/ArticleContext";
import TooltipTopicName from "./shared/TooltipTopicName";
import "./RadialFlowChart.css";

export { buildScopedChartData, getScopedMaxLevel };

const MIN_RADIUS = 36;
const MAX_RADIUS = 140;
const GAP = 20;
const PADDING_TOP = 40;
const PADDING_BOTTOM = 40;
const PADDING_SIDE = 24;

/**
 * Like buildScopedChartData but WITHOUT aggregating same-name topics.
 * Each topic object becomes its own entry, so "Technology > AI" and
 * "Technology > Mobile" appear as two separate "Technology" circles,
 * each at its own position in the article.
 *
 * fullPath = actual topic.name (unique identifier)
 * groupPath = display-level path (used for color grouping and subtopic lookup)
 */
function buildOrderedTopicEntries(topics, sentences, scopePath, selectedLevel) {
  if (!Array.isArray(topics) || topics.length === 0) return [];

  const hasSentenceText = Array.isArray(sentences) && sentences.length > 0;
  const absoluteDepth = scopePath.length + selectedLevel + 1;
  const entries = [];

  topics.forEach((topic) => {
    const parts = getTopicParts(topic);
    if (!isWithinScope(parts, scopePath) || parts.length < absoluteDepth)
      return;

    const groupParts = parts.slice(0, absoluteDepth);
    const groupPath = groupParts.join(">");
    const displayName = groupParts[groupParts.length - 1] || groupPath;

    const rawIndices = Array.isArray(topic.sentences) ? topic.sentences : [];
    const sentenceIndices = rawIndices
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);

    let totalChars = 0;
    if (hasSentenceText) {
      sentenceIndices.forEach((n) => {
        const s = sentences[n - 1];
        if (typeof s === "string") totalChars += s.length;
      });
    } else {
      totalChars = Number.isFinite(topic.totalChars) ? topic.totalChars : 0;
    }

    if (totalChars === 0 && sentenceIndices.length === 0) return;

    const firstSentence =
      sentenceIndices.length > 0 ? Math.min(...sentenceIndices) : Infinity;
    const topicName =
      typeof topic.name === "string" && topic.name.trim()
        ? topic.name.trim()
        : groupPath;

    entries.push({
      fullPath: topicName,
      groupPath,
      displayName,
      totalChars,
      sentenceCount: sentenceIndices.length,
      sentenceIndices,
      ranges: Array.isArray(topic.ranges) ? topic.ranges : [],
      canonicalTopicNames: [topicName],
      firstSentence,
    });
  });

  return entries.sort((a, b) => a.firstSentence - b.firstSentence);
}

/**
 * @typedef {Object} RadialFlowChartProps
 * @property {Array<{ name?: string, fullPath?: string, displayName?: string, sentenceCount?: number, sentenceIndices?: number[], ranges?: Array<unknown> }>} topics
 * @property {string[]} [sentences]
 * @property {(topic: unknown) => void} [onShowInArticle]
 * @property {Set<string> | string[]} [readTopics]
 * @property {(topic: unknown) => void} [onToggleRead]
 * @property {unknown} [markup]
 */

/**
 * Build a D3 arc path for a semicircle (no hole).
 * side='right' → arc bulges right (flat edge on left at x=0)
 * side='left'  → arc bulges left  (flat edge on right at x=0)
 */
function makeSemiArcPath(outerR, side) {
  if (outerR <= 0) return "";
  const startAngle = side === "right" ? 0 : Math.PI;
  const endAngle = side === "right" ? Math.PI : 2 * Math.PI;
  return (
    d3
      .arc()
      .innerRadius(0)
      .outerRadius(outerR)
      .startAngle(startAngle)
      .endAngle(endAngle)() || ""
  );
}

/**
 * @param {RadialFlowChartProps} props
 */
function RadialFlowChart({
  topics: topicsProp,
  sentences: sentencesProp,
  onShowInArticle,
  readTopics: readTopicsProp,
  onToggleRead: onToggleReadProp,
  markup: markupProp,
}) {
  const article = useArticle();
  const topics = useMemo(
    () => topicsProp ?? article?.enrichedTopics ?? [],
    [topicsProp, article?.enrichedTopics],
  );
  const sentences = useMemo(
    () => sentencesProp ?? article?.sentences ?? [],
    [sentencesProp, article?.sentences],
  );
  const readTopics = useMemo(
    () => readTopicsProp ?? article?.readTopics ?? new Set(),
    [readTopicsProp, article?.readTopics],
  );
  const onToggleRead = onToggleReadProp ?? article?.toggleRead;
  const markup = markupProp ?? article?.markup;
  const { scopePath, navigateTo, drillInto } = useScopeNavigation();
  const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(
    topics,
    scopePath,
  );
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const tooltipRef = useRef(null);
  const { containerRef, containerWidth } = useContainerSize(700, 400);
  const [modalTopic, setModalTopic] = useState(null);

  useEffect(() => {
    setHoveredTopic(null);
    setTooltip(null);
  }, [scopePath, selectedLevel]);

  useEffect(() => {
    if (!tooltip || !tooltipRef.current) return;

    tooltipRef.current.style.setProperty(
      "--radial-flow-tooltip-left",
      `${tooltip.x + 14}px`,
    );
    tooltipRef.current.style.setProperty(
      "--radial-flow-tooltip-top",
      `${tooltip.y - 10}px`,
    );
  }, [tooltip]);

  const buildTopicSelection = useCallback(
    (topic) =>
      buildModalSelectionFromTopic({
        name: topic.fullPath,
        displayName: topic.displayName,
        fullPath: topic.fullPath,
        sentenceIndices: topic.sentenceIndices || [],
        ranges: Array.isArray(topic.ranges) ? topic.ranges : [],
        canonicalTopicNames: topic.canonicalTopicNames || [],
        primaryTopicName: topic.canonicalTopicNames?.[0] || topic.fullPath,
      }),
    [],
  );

  const handleShowTopicInArticle = useCallback(
    (topic) => {
      if (!onShowInArticle) return;
      onShowInArticle(buildTopicSelection(topic));
    },
    [buildTopicSelection, onShowInArticle],
  );

  const handleTopicLabelKeyDown = useCallback(
    (event, topic) => {
      if (event.key !== "Enter" && event.key !== " ") return;

      event.preventDefault();
      handleShowTopicInArticle(topic);
    },
    [handleShowTopicInArticle],
  );

  const safeReadTopics = useMemo(
    () => (readTopics instanceof Set ? readTopics : new Set(readTopics || [])),
    [readTopics],
  );

  // One entry per topic in article order — no aggregation by name
  const topLevelData = useMemo(
    () => buildOrderedTopicEntries(topics, sentences, scopePath, selectedLevel),
    [topics, sentences, scopePath, selectedLevel],
  );

  // Subtopics per entry: children of this topic's full path
  const subtopicMap = useMemo(() => {
    const map = new Map();
    topLevelData.forEach((item) => {
      const pathParts = getTopicParts(item.fullPath);
      const children = buildScopedChartData(topics, sentences, pathParts, 0);
      map.set(item.fullPath, children);
    });
    return map;
  }, [topLevelData, topics, sentences]);

  // Topics that share the same groupPath (e.g. both "Technology") get the same color
  const colorScale = useMemo(() => {
    const colors = {};
    const groupColorMap = {};
    let colorIdx = 0;
    topLevelData.forEach((item) => {
      if (!(item.groupPath in groupColorMap)) {
        groupColorMap[item.groupPath] =
          BASE_COLORS[colorIdx % BASE_COLORS.length];
        colorIdx++;
      }
      colors[item.fullPath] = groupColorMap[item.groupPath];
    });
    return colors;
  }, [topLevelData]);

  // Layout: place each topic as a half-circle, alternating sides, stacked vertically
  const layout = useMemo(() => {
    if (!topLevelData.length)
      return { items: [], totalHeight: PADDING_TOP + PADDING_BOTTOM };

    const maxChars = Math.max(...topLevelData.map((d) => d.totalChars), 1);
    const halfWidth = containerWidth / 2 - PADDING_SIDE;
    const clampedMax = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, halfWidth));

    let cumulativeY = PADDING_TOP;
    const items = topLevelData.map((topic, i) => {
      const r = Math.max(
        MIN_RADIUS,
        clampedMax * Math.sqrt(topic.totalChars / maxChars),
      );
      const yCenter = cumulativeY + r;
      cumulativeY = yCenter + r + GAP;
      const side = i % 2 === 0 ? "right" : "left";
      const isDrillable = hasDeeperChildren(topics, topic.fullPath);
      return { ...topic, r, yCenter, side, isDrillable, index: i };
    });

    return { items, totalHeight: cumulativeY - GAP + PADDING_BOTTOM };
  }, [topLevelData, containerWidth, topics]);

  const scopeLabel = getScopeLabel(scopePath);
  const subtitle =
    scopePath.length === 0
      ? `Showing all topics at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}).`
      : `Inside ${scopeLabel} at relative level ${selectedLevel} (${getLevelLabel(selectedLevel)}).`;

  const centerX = containerWidth / 2;
  const svgWidth = containerWidth;
  const svgHeight = layout.totalHeight;

  if (!topics || topics.length === 0) {
    return (
      <div className="chart-empty-state chart-empty-state--panel">
        No topic data available.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="radial-flow-chart chart-surface">
      <div className="radial-flow-chart__controls chart-surface__controls">
        <Breadcrumbs scopePath={scopePath} onNavigate={navigateTo} />
        <TopicLevelSwitcher
          selectedLevel={selectedLevel}
          maxLevel={maxLevel}
          onChange={setSelectedLevel}
        />
        <p className="radial-flow-chart__subtitle chart-section__copy">
          {subtitle}
        </p>
      </div>

      {topLevelData.length === 0 ? (
        <p className="chart-empty-state chart-empty-state--panel">
          No topics found inside {scopeLabel} at relative level {selectedLevel}.
          Try a different level or use the breadcrumbs.
        </p>
      ) : (
        <div className="radial-flow-chart__canvas">
          <svg
            className="radial-flow-chart__svg chart-svg"
            width={svgWidth}
            height={svgHeight}
          >
            {/* Center spine */}
            <line
              x1={centerX}
              y1={0}
              x2={centerX}
              y2={svgHeight}
              className="radial-flow-chart__spine"
            />

            {layout.items.map((item, idx) => {
              const subtopics = subtopicMap.get(item.fullPath) || [];
              // Sort by size descending so largest is drawn first (background layer)
              const sortedSubs = [...subtopics].sort(
                (a, b) => b.totalChars - a.totalChars,
              );
              const baseColor = colorScale[item.fullPath];
              const isRead = isTopicSelectionRead(item, safeReadTopics);
              const isHoveredParent = hoveredTopic === item.fullPath;

              // Connecting dashed line from bottom of this circle to top of next
              const nextItem = layout.items[idx + 1];
              const connectorY1 = item.yCenter + item.r;
              const connectorY2 = nextItem
                ? nextItem.yCenter - nextItem.r
                : null;

              // Label placement
              const labelX = item.side === "right" ? -10 : 10;
              const labelAnchor = item.side === "right" ? "end" : "start";

              const labelPath = item.groupPath || item.fullPath;
              const labelParts = getTopicParts(labelPath);
              const labelLeaf =
                labelParts[labelParts.length - 1] || item.displayName;
              const labelAncestors = labelParts.slice(0, -1);
              const shouldRenderLeafFirst = labelAnchor === "start";
              const isLabelLink = Boolean(onShowInArticle);

              return (
                <g key={item.fullPath}>
                  {/* Dashed connector to next item */}
                  {connectorY2 !== null && (
                    <line
                      x1={centerX}
                      y1={connectorY1}
                      x2={centerX}
                      y2={connectorY2}
                      className="radial-flow-chart__connector"
                    />
                  )}

                  {/* Half-circle group centered at junction point */}
                  <g transform={`translate(${centerX}, ${item.yCenter})`}>
                    {/* Background full half-circle (main topic) */}
                    <path
                      d={makeSemiArcPath(item.r, item.side)}
                      fill={baseColor}
                      opacity={isHoveredParent ? 0.35 : 0.18}
                      className={`radial-flow-chart__arc-bg${item.isDrillable ? " radial-flow-chart__arc-bg--drillable" : " radial-flow-chart__arc-bg--leaf"}`}
                      onClick={() => {
                        if (item.isDrillable) {
                          drillInto(item.fullPath);
                          setSelectedLevel(0);
                        } else {
                          setModalTopic(buildTopicSelection(item));
                        }
                      }}
                      onMouseEnter={(e) => {
                        setHoveredTopic(item.fullPath);
                        setTooltip({ x: e.clientX, y: e.clientY, data: item });
                      }}
                      onMouseMove={(e) =>
                        setTooltip((t) =>
                          t ? { ...t, x: e.clientX, y: e.clientY } : null,
                        )
                      }
                      onMouseLeave={() => {
                        setHoveredTopic(null);
                        setTooltip(null);
                      }}
                    />

                    {/* Subtopic concentric half-circles (largest → smallest) */}
                    {sortedSubs.map((st, j) => {
                      const stFraction =
                        item.totalChars > 0
                          ? st.totalChars / item.totalChars
                          : 0;
                      const stR = item.r * Math.sqrt(Math.min(stFraction, 1));
                      if (stR < 2) return null;

                      const stColor = BASE_COLORS[j % BASE_COLORS.length];
                      const isHoveredSub = hoveredTopic === st.fullPath;

                      return (
                        <path
                          key={st.fullPath}
                          d={makeSemiArcPath(stR, item.side)}
                          fill={stColor}
                          opacity={isHoveredSub ? 0.88 : 0.62}
                          className="radial-flow-chart__arc-sub"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalTopic(
                              buildModalSelectionFromTopic({
                                name: st.fullPath,
                                displayName: st.displayName,
                                fullPath: st.fullPath,
                                sentenceIndices: st.sentenceIndices || [],
                                ranges: Array.isArray(st.ranges)
                                  ? st.ranges
                                  : [],
                                canonicalTopicNames:
                                  st.canonicalTopicNames || [],
                                primaryTopicName:
                                  st.canonicalTopicNames?.[0] || st.fullPath,
                              }),
                            );
                          }}
                          onMouseEnter={(e) => {
                            setHoveredTopic(st.fullPath);
                            setTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              data: st,
                            });
                          }}
                          onMouseMove={(e) =>
                            setTooltip((t) =>
                              t ? { ...t, x: e.clientX, y: e.clientY } : null,
                            )
                          }
                          onMouseLeave={() => {
                            setHoveredTopic(null);
                            setTooltip(null);
                          }}
                        />
                      );
                    })}

                    {/* Read overlay hatch */}
                    {isRead && (
                      <path
                        d={makeSemiArcPath(item.r, item.side)}
                        fill="url(#radial-flow-read-pattern)"
                        opacity={0.5}
                        pointerEvents="none"
                      />
                    )}

                    {/* Topic label at the flat edge center */}
                    <text
                      x={labelX}
                      y={0}
                      textAnchor={labelAnchor}
                      dominantBaseline="middle"
                      className={`radial-flow-chart__label${isLabelLink ? " radial-flow-chart__label--link" : ""}`}
                      role={isLabelLink ? "link" : undefined}
                      tabIndex={isLabelLink ? 0 : undefined}
                      aria-label={
                        isLabelLink
                          ? `Show ${labelParts.join(" > ")} in article`
                          : undefined
                      }
                      onClick={
                        isLabelLink
                          ? () => handleShowTopicInArticle(item)
                          : undefined
                      }
                      onKeyDown={
                        isLabelLink
                          ? (event) => handleTopicLabelKeyDown(event, item)
                          : undefined
                      }
                    >
                      {shouldRenderLeafFirst ? (
                        <>
                          <tspan
                            className="radial-flow-chart__label-leaf"
                            fill={baseColor}
                          >
                            {labelLeaf}
                          </tspan>
                          {labelAncestors
                            .slice()
                            .reverse()
                            .map((part, i) => (
                              <React.Fragment key={i}>
                                <tspan className="radial-flow-chart__label-sep">
                                  {" ‹ "}
                                </tspan>
                                <tspan className="radial-flow-chart__label-ancestor">
                                  {part}
                                </tspan>
                              </React.Fragment>
                            ))}
                        </>
                      ) : (
                        <>
                          {labelAncestors.map((part, i) => (
                            <React.Fragment key={i}>
                              <tspan className="radial-flow-chart__label-ancestor">
                                {part}
                              </tspan>
                              <tspan className="radial-flow-chart__label-sep">
                                {" ›"}
                              </tspan>
                            </React.Fragment>
                          ))}
                          <tspan
                            className="radial-flow-chart__label-leaf"
                            fill={baseColor}
                          >
                            {labelAncestors.length > 0 ? " " : ""}
                            {labelLeaf}
                          </tspan>
                        </>
                      )}
                    </text>

                    {/* Char count annotation */}
                    <text
                      x={labelX}
                      y={22}
                      textAnchor={labelAnchor}
                      dominantBaseline="middle"
                      className="radial-flow-chart__count"
                    >
                      {item.totalChars >= 1000
                        ? `${(item.totalChars / 1000).toFixed(1)}k`
                        : item.totalChars}{" "}
                      chars
                    </text>
                  </g>
                </g>
              );
            })}

            <defs>
              <pattern
                id="radial-flow-read-pattern"
                patternUnits="userSpaceOnUse"
                width="8"
                height="8"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke="rgba(0,0,0,0.13)"
                  strokeWidth="2"
                />
              </pattern>
            </defs>
          </svg>
        </div>
      )}

      {topLevelData.length > 0 && (
        <div className="radial-flow-chart__legend chart-legend">
          {topLevelData.map((item) => {
            const colorIndex = BASE_COLORS.indexOf(colorScale[item.fullPath]);
            const swatchClassName =
              colorIndex >= 0
                ? ` radial-flow-chart__legend-swatch--color-${colorIndex}`
                : "";

            return (
              <div
                key={item.fullPath}
                className={`radial-flow-chart__legend-item chart-legend-item${hoveredTopic === item.fullPath ? " hovered" : ""}`}
                onMouseEnter={() => setHoveredTopic(item.fullPath)}
                onMouseLeave={() => setHoveredTopic(null)}
              >
                <div
                  className={`chart-legend-swatch chart-legend-swatch--square${swatchClassName}`}
                />
                <span>{item.displayName}</span>
                <span className="radial-flow-chart__legend-value">
                  ({item.totalChars.toLocaleString()} chars)
                </span>
              </div>
            );
          })}
        </div>
      )}

      {tooltip && (
        <div ref={tooltipRef} className="radial-flow-chart__tooltip">
          <div className="radial-flow-chart__tooltip-name">
            <TooltipTopicName name={tooltip.data.fullPath} />
          </div>
          <div className="radial-flow-chart__tooltip-stats">
            {tooltip.data.totalChars.toLocaleString()} chars &bull;{" "}
            {tooltip.data.sentenceCount} sentence
            {tooltip.data.sentenceCount !== 1 ? "s" : ""}
          </div>
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

export default RadialFlowChart;
