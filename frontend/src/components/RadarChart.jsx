import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import * as d3 from "d3";
import TopicLevelSwitcher from "./shared/TopicLevelSwitcher";
import "../styles/App.css";
import { getLevelLabel } from "../utils/topicHierarchy";
import { BASE_COLORS } from "../utils/chartConstants";
import { useTopicLevel } from "../hooks/useTopicLevel";
import { useContainerSize } from "../hooks/useContainerSize";

/**
 * RadarChart
 * - Displays topics on axes in a radar/spider chart
 * - Values are total character count of sentences belonging to each topic
 * - Level selector allows viewing different hierarchy levels (0 = top level, 1 = subtopics, etc.)
 */
/**
 * @typedef {Object} RadarChartProps
 * @property {Array<{ name?: string, displayName?: string, sentences?: number[], totalChars?: number }>} topics
 * @property {string[]} [sentences]
 */

/**
 * @param {RadarChartProps} props
 */
function RadarChart({ topics, sentences = [] }) {
  const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(topics);
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const { containerRef, containerWidth } = useContainerSize(600);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);

  // Parse topics and compute character counts per topic at selected level
  const chartData = useMemo(() => {
    if (!topics || topics.length === 0) return [];

    const levelMap = new Map();
    const hasSentenceText = Array.isArray(sentences) && sentences.length > 0;

    topics.forEach((topic) => {
      const parts = topic.name.split(">").map((p) => p.trim());
      const topicLevel = parts.length - 1; // 0-indexed level

      // Only include topics at or above the selected level
      if (topicLevel < selectedLevel) return;

      // Get the topic name at the selected level
      const topicAtLevel = parts.slice(0, selectedLevel + 1).join(">");
      const key = topicAtLevel;

      if (!levelMap.has(key)) {
        levelMap.set(key, {
          name: topicAtLevel,
          displayName: parts[selectedLevel],
          level: selectedLevel,
          sentenceIndices: new Set(),
          fallbackChars: 0,
        });
      }

      const entry = levelMap.get(key);

      // Collect sentence indices
      const topicSentenceIndices = Array.isArray(topic.sentences)
        ? topic.sentences
        : [];
      if (topicSentenceIndices.length > 0) {
        topicSentenceIndices.forEach((index) => {
          const oneBased = Number(index);
          if (Number.isInteger(oneBased) && oneBased > 0) {
            entry.sentenceIndices.add(oneBased);
          }
        });
      } else if (!hasSentenceText && Number.isFinite(topic.totalChars)) {
        entry.fallbackChars += topic.totalChars;
      }
    });

    // Compute total characters for each topic
    const getCharsFromSentenceIndices = (indices) => {
      let total = 0;
      indices.forEach((oneBased) => {
        const sentence = sentences[oneBased - 1];
        if (typeof sentence === "string") {
          total += sentence.length;
        }
      });
      return total;
    };

    const result = Array.from(levelMap.values())
      .map((entry) => {
        const totalChars = hasSentenceText
          ? getCharsFromSentenceIndices(entry.sentenceIndices)
          : entry.fallbackChars;

        return {
          name: entry.name,
          displayName: entry.displayName,
          level: entry.level,
          totalChars,
          sentenceCount: entry.sentenceIndices.size,
        };
      })
      .filter((d) => d.totalChars > 0)
      .sort((a, b) => b.totalChars - a.totalChars);

    return result;
  }, [topics, sentences, selectedLevel]);

  // Color scale for topics
  const colorScale = useMemo(() => {
    const colors = {};
    chartData.forEach((item, index) => {
      colors[item.name] = BASE_COLORS[index % BASE_COLORS.length];
    });
    return colors;
  }, [chartData]);

  // Compute total chars
  const resetZoom = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(350)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  }, []);

  const zoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomRef.current.scaleBy, 1.3);
  }, []);

  const zoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomRef.current.scaleBy, 0.7);
  }, []);

  // Draw the radar chart
  useEffect(() => {
    if (!svgRef.current || chartData.length === 0) return;

    const size = containerWidth;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = size;
    const height = size;
    const margin = 100;
    const radius = Math.min(width, height) / 2 - margin;

    svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // Zoomable group
    const g = svg
      .append("g")
      .attr("class", "radar-zoom-group")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const angleSlice = (Math.PI * 2) / chartData.length;

    // Scale for the radius
    const maxChars = Math.max(...chartData.map((d) => d.totalChars), 1);
    const rScale = d3.scaleLinear().domain([0, maxChars]).range([0, radius]);

    // Draw circular grid
    const levels = 5;
    for (let i = 1; i <= levels; i++) {
      const r = (radius / levels) * i;
      g.append("circle")
        .attr("r", r)
        .attr("fill", "none")
        .attr("stroke", "#ddd")
        .attr("stroke-width", "1px")
        .attr("opacity", "0.7");

      // Axis labels
      if (i === levels) {
        g.append("text")
          .attr("x", 0)
          .attr("y", -r - 8)
          .attr("text-anchor", "middle")
          .attr("font-size", "10px")
          .attr("fill", "#999")
          .text(
            `${Math.round((maxChars / levels) * i).toLocaleString()} chars`,
          );
      }
    }

    // Dynamic label offset: more topics → push labels further out
    const labelOffset = 40 + Math.max(0, (chartData.length - 8) * 3);

    // Draw axes and labels
    chartData.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      // Axis line
      g.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", x)
        .attr("y2", y)
        .attr("stroke", "#ccc")
        .attr("stroke-width", "1px");

      // Label
      const labelX = Math.cos(angle) * (radius + labelOffset);
      const labelY = Math.sin(angle) * (radius + labelOffset);

      const labelGroup = g
        .append("g")
        .attr("transform", `translate(${labelX}, ${labelY})`)
        .style("cursor", "pointer");

      // Add title element for native tooltip
      labelGroup.append("title").text(d.name);

      // Background for label
      const labelBg = labelGroup
        .append("rect")
        .attr("x", -50)
        .attr("y", -10)
        .attr("width", 100)
        .attr("height", 20)
        .attr("fill", "white")
        .attr("stroke", "#ddd")
        .attr("rx", 3)
        .attr("opacity", "0.9");

      const labelText = labelGroup
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .attr("fill", "#333")
        .text(
          d.displayName.length > 15
            ? d.displayName.slice(0, 14) + "…"
            : d.displayName,
        );

      // Highlight effect on hover
      labelGroup
        .on("mouseover", function () {
          labelBg.attr("fill", "#e3f2fd").attr("stroke", "#7ba3cc");
          labelText.attr("fill", "#1565c0");
        })
        .on("mouseout", function () {
          labelBg.attr("fill", "white").attr("stroke", "#ddd");
          labelText.attr("fill", "#333");
        });

      // Adjust label background width based on text
      try {
        const textLength = labelText.node().getComputedTextLength();
        labelBg.attr("x", -(textLength / 2) - 4).attr("width", textLength + 8);
      } catch {
        // Fallback if getComputedTextLength fails
      }
    });

    // Draw the radar area
    g.append("path")
      .datum(chartData)
      .attr(
        "d",
        d3
          .areaRadial()
          .curve(d3.curveLinearClosed)
          .innerRadius(0)
          .outerRadius((d) => rScale(d.totalChars))
          .startAngle((d, i) => angleSlice * i)
          .endAngle((d, i) => angleSlice * (i + 1)),
      )
      .attr("fill", "rgba(123, 163, 204, 0.5)")
      .attr("stroke", "#7ba3cc")
      .attr("stroke-width", "2px");

    // Create tooltip group (initially hidden)
    const tooltipGroup = g
      .append("g")
      .attr("class", "radar-chart-tooltip")
      .style("opacity", 0);

    // Draw points at each vertex
    chartData.forEach((d, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const r = rScale(d.totalChars);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      g.append("circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 5)
        .attr("fill", colorScale[d.name] || "#7ba3cc")
        .attr("stroke", "#fff")
        .attr("stroke-width", "2px")
        .style("cursor", "pointer")
        .on("mouseover", (event) => {
          setHoveredTopic(d);
          d3.select(event.currentTarget).attr("r", 8).attr("stroke", "#333");

          // Show tooltip near the vertex
          const tooltipX = x + 12;
          const tooltipY = y - 12;

          tooltipGroup.style("opacity", 1);

          // Tooltip background
          tooltipGroup.selectAll(".tooltip-bg").remove();
          tooltipGroup
            .append("rect")
            .attr("class", "tooltip-bg")
            .attr("x", tooltipX)
            .attr("y", tooltipY - 16)
            .attr("rx", 4)
            .attr("ry", 4)
            .attr("fill", "rgba(0, 0, 0, 0.85)")
            .attr("width", 200)
            .attr("height", 50);

          // Topic name
          tooltipGroup
            .append("text")
            .attr("x", tooltipX + 8)
            .attr("y", tooltipY - 2)
            .attr("fill", "#fff")
            .attr("font-size", "11px")
            .attr("font-weight", "600")
            .text(d.name);

          // Character count and sentence count
          tooltipGroup
            .append("text")
            .attr("x", tooltipX + 8)
            .attr("y", tooltipY + 14)
            .attr("fill", "#ccc")
            .attr("font-size", "10px")
            .text(
              `${d.totalChars.toLocaleString()} chars • ${d.sentenceCount} sentence${d.sentenceCount !== 1 ? "s" : ""}`,
            );
        })
        .on("mouseout", (event) => {
          setHoveredTopic(null);
          d3.select(event.currentTarget).attr("r", 5).attr("stroke", "#fff");

          // Hide tooltip
          tooltipGroup.style("opacity", 0);
          tooltipGroup.selectAll("*").remove();
        });
    });

    // Set up zoom
    const zoom = d3
      .zoom()
      .scaleExtent([0.5, 5])
      .on("zoom", (event) => {
        svg
          .select(".radar-zoom-group")
          .attr(
            "transform",
            `translate(${width / 2 + event.transform.x}, ${height / 2 + event.transform.y}) scale(${event.transform.k})`,
          );
      });

    zoomRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity);
    svg.on("dblclick.zoom", null);
  }, [chartData, colorScale, containerWidth]);

  if (!topics || topics.length === 0) {
    return (
      <div className="radar-chart-empty chart-empty-state chart-empty-state--panel">
        No topic data available.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="radar-chart chart-surface chart-surface--radar"
    >
      {/* Level Selector */}
      <TopicLevelSwitcher
        className="radar-chart-level-switcher"
        selectedLevel={selectedLevel}
        maxLevel={maxLevel}
        onChange={(level) => {
          setSelectedLevel(level);
          if (level !== selectedLevel) {
            zoomRef.current = null;
          }
        }}
        getOptionLabel={(level) => `Level ${level} (${getLevelLabel(level)})`}
      />

      {/* Chart */}
      <div className="radar-chart-body chart-surface__body">
        {chartData.length === 0 ? (
          <p className="radar-chart-no-data chart-empty-state chart-empty-state--panel">
            No data available at level {selectedLevel}. Try selecting a
            different level.
          </p>
        ) : (
          <div className="radar-chart-canvas-wrapper">
            <div className="radar-chart-zoom-controls">
              <button
                type="button"
                className="radar-chart-zoom-btn"
                onClick={zoomIn}
                title="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className="radar-chart-zoom-btn"
                onClick={zoomOut}
                title="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="radar-chart-zoom-btn"
                onClick={resetZoom}
                title="Reset zoom"
              >
                ⊙
              </button>
            </div>
            <svg ref={svgRef} className="radar-chart-svg" />
          </div>
        )}
      </div>

      {/* Legend */}
      {chartData.length > 0 && (
        <div className="radar-chart-legend chart-legend">
          {chartData.map((item) => (
            <div
              key={item.name}
              className={`radar-chart-legend-item chart-legend-item${hoveredTopic === item ? " hovered" : ""}`}
              onMouseEnter={() => setHoveredTopic(item)}
              onMouseLeave={() => setHoveredTopic(null)}
            >
              <div
                className="radar-chart-legend-color chart-legend-swatch chart-legend-swatch--square"
                style={{
                  "--chart-legend-swatch": colorScale[item.name] || "#7ba3cc",
                }}
              />
              <span className="radar-chart-legend-name">
                {item.displayName}
              </span>
              <span className="radar-chart-legend-value">
                ({item.totalChars.toLocaleString()} chars)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RadarChart;
