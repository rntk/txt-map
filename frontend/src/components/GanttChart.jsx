import React, { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import TopicLevelSwitcher from "./shared/TopicLevelSwitcher";
import Breadcrumbs from "./shared/Breadcrumbs";
import { buildScopedChartData, hasDeeperChildren } from "../utils/topicHierarchy";
import { useTopicLevel } from "../hooks/useTopicLevel";
import { useScopeNavigation } from "../hooks/useScopeNavigation";
import { getTopicHighlightColor } from "../utils/topicColorUtils";
import { buildModalSelectionFromTopic } from "../utils/topicModalSelection";
import "./TopicsBarChart.css";

/**
 * @param {Object} props
 * @param {Array<Object>} props.topics
 * @param {Array<string>} [props.sentences]
 * @param {number} [props.articleLength]
 * @param {Function} [props.onShowInArticle]
 * @param {Set<string>|Array<string>} [props.readTopics]
 * @param {Function} [props.onToggleRead]
 * @param {Object} [props.markup]
 */
const GanttChart = ({
  topics,
  sentences = [],
  articleLength,
  onShowInArticle,
  readTopics,
  onToggleRead,
  markup,
}) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [activeTopic, setActiveTopic] = useState(null);
  const { scopePath, navigateTo, drillInto } = useScopeNavigation();
  const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(topics, scopePath);
  const [selectedTopicForModal, setSelectedTopicForModal] = useState(null);

  const scopedData = useMemo(() => {
    const data = buildScopedChartData(topics, sentences, scopePath, selectedLevel);
    return data.map((d) => ({
      ...d,
      sentences: d.sentenceIndices,
    }));
  }, [topics, sentences, scopePath, selectedLevel]);

  const effectiveLength = useMemo(() => {
    if (!topics || topics.length === 0) return 0;
    let maxSentenceIndex = 0;
    topics.forEach((topic) => {
      if (topic.sentences && topic.sentences.length > 0) {
        const max = Math.max(...topic.sentences);
        if (max > maxSentenceIndex) maxSentenceIndex = max;
      }
    });
    const validArticleLength =
      typeof articleLength === "number" && articleLength > 0
        ? articleLength
        : Infinity;
    return Math.min(maxSentenceIndex + 5, validArticleLength);
  }, [topics, articleLength]);

  const chartData = useMemo(() => {
    const data = [];
    scopedData.forEach((topic, i) => {
      const sorted = [...(topic.sentences || [])].sort((a, b) => a - b);
      if (sorted.length === 0) return;

      let currentStart = sorted[0];
      let currentEnd = sorted[0];

      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] === currentEnd + 1 || sorted[j] === currentEnd) {
          currentEnd = sorted[j];
        } else {
          data.push({
            topic: topic.name,
            topicObj: topic,
            start: currentStart,
            end: currentEnd + 1, // +1 for width
            yIndex: i,
          });
          currentStart = sorted[j];
          currentEnd = sorted[j];
        }
      }
      data.push({
        topic: topic.name,
        topicObj: topic,
        start: currentStart,
        end: currentEnd + 1,
        yIndex: i,
      });
    });
    return data;
  }, [scopedData]);

  const handleTopicClick = (topicObj) => {
    if (hasDeeperChildren(topics, topicObj.fullPath)) {
      drillInto(topicObj.fullPath);
      setSelectedLevel(0);
    } else {
      setSelectedTopicForModal(buildModalSelectionFromTopic(topicObj));
    }
  };

  useEffect(() => {
    if (
      !effectiveLength ||
      !scopedData ||
      scopedData.length === 0 ||
      !svgRef.current
    )
      return;

    const canvasEl = svgRef.current.parentElement;
    const containerWidth = canvasEl ? canvasEl.clientWidth || 800 : 800;

    d3.select(svgRef.current).selectAll("*").remove();

    const rowHeight = 25;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = "11px sans-serif";

    const maxLabelPixelWidth = scopedData.reduce((max, d) => {
      const text = d.displayName || d.name || "";
      const width = context.measureText(text).width;
      return Math.max(max, width);
    }, 0);

    const leftMargin = Math.max(150, maxLabelPixelWidth + 30);
    const minWidthForSentences = Math.max(effectiveLength * 8, 600);
    const width = Math.max(
      containerWidth,
      minWidthForSentences + leftMargin + 30,
      600,
    );
    const margin = { top: 30, right: 30, bottom: 50, left: leftMargin };
    const height = scopedData.length * rowHeight + margin.top + margin.bottom;

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, effectiveLength])
      .range([0, innerWidth]);
    const y = d3
      .scaleBand()
      .domain(scopedData.map((d) => d.name))
      .range([0, innerHeight])
      .padding(0.2);

    const tooltip = d3
      .select("body")
      .selectAll(".gantt-tooltip")
      .data([0])
      .join("div")
      .attr("class", "gantt-tooltip chart-tooltip")
      .style("opacity", 0)
      .style("position", "absolute")
      .style("background", "white")
      .style("border", "1px solid #ddd")
      .style("padding", "8px")
      .style("border-radius", "4px")
      .style("pointer-events", "none")
      .style("font-size", "12px");

    // Row highlight backgrounds (rendered before bars so bars appear on top)
    const rowHighlights = g
      .selectAll(".gantt-row-highlight")
      .data(scopedData)
      .enter()
      .append("rect")
      .attr("class", "gantt-row-highlight")
      .attr("x", -margin.left)
      .attr("y", (d) => y(d.name))
      .attr("width", width)
      .attr("height", y.bandwidth())
      .attr("fill", "transparent");

    // Invisible full-width row overlay for hover detection
    g.selectAll(".gantt-row-overlay")
      .data(scopedData)
      .enter()
      .append("rect")
      .attr("class", "gantt-row-overlay")
      .attr("x", -margin.left)
      .attr("y", (d) => y(d.name))
      .attr("width", width)
      .attr("height", y.bandwidth())
      .attr("fill", "transparent")
      .attr("cursor", "default")
      .on("mouseover", function (event, d) {
        setActiveTopic(d.name);
        rowHighlights
          .filter((rd) => rd.name === d.name)
          .attr("fill", "rgba(0,0,0,0.07)");
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.displayName || d.name}</strong>`)
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mouseout", function (event, d) {
        setActiveTopic(null);
        rowHighlights
          .filter((rd) => rd.name === d.name)
          .attr("fill", "transparent");
        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        handleTopicClick(d);
      });

    g.selectAll(".gantt-bar")
      .data(chartData)
      .enter()
      .append("rect")
      .attr("class", "gantt-bar")
      .attr("x", (d) => x(d.start))
      .attr("y", (d) => y(d.topic))
      .attr("width", (d) => Math.max(2, x(d.end) - x(d.start)))
      .attr("height", y.bandwidth())
      .style("fill", (d) => getTopicHighlightColor(d.topic) || "#4CAF50")
      .style("opacity", (d) =>
        activeTopic && activeTopic !== d.topic ? 0.3 : 0.8,
      )
      .style("cursor", (d) => (hasDeeperChildren(topics, d.topicObj.fullPath) ? "zoom-in" : "pointer"))
      .on("mouseover", function (event, d) {
        setActiveTopic(d.topic);
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.topic}</strong><br/>Sentences: ${d.start} - ${d.end - 1}`,
          )
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 28 + "px");
        d3.select(this)
          .style("opacity", 1)
          .style("stroke", "#333")
          .style("stroke-width", 1);
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mouseout", function () {
        setActiveTopic(null);
        tooltip.style("opacity", 0);
        d3.select(this)
          .style("opacity", (d) =>
            activeTopic && activeTopic !== d.topic ? 0.3 : 0.8,
          )
          .style("stroke", "none");
      })
      .on("click", function (event, d) {
        if (d.topicObj) {
          handleTopicClick(d.topicObj);
        }
      });

    // X Axis
    const xAxisScale = d3
      .scaleLinear()
      .domain([0, effectiveLength])
      .range([0, innerWidth]);
    g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xAxisScale)
          .ticks(Math.min(10, Math.floor(innerWidth / 80)))
          .tickFormat((d) => `${Math.round(d)}`),
      );

    g.append("text")
      .attr("class", "x-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 40)
      .style("text-anchor", "middle")
      .style("font-size", "12px")
      .style("fill", "#666")
      .text("Sentence Index");

    // Y Axis
    g.append("g")
      .attr("class", "y-axis")
      .call(
        d3
          .axisLeft(y)
          .tickSize(0)
          .tickFormat((d) => {
            const topicObj = scopedData.find((t) => t.name === d);
            return topicObj
              ? topicObj.displayName || topicObj.name
              : String(d || "");
          }),
      )
      .selectAll("text")
      .style("font-size", "11px")
      .style("fill", "#333")
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        setActiveTopic(d);
      })
      .on("mouseout", function () {
        setActiveTopic(null);
      })
      .on("click", function (event, d) {
        const topicObj = scopedData.find((t) => t.name === d);
        if (topicObj) {
          handleTopicClick(topicObj);
        }
      });

    return () => {
      d3.select("body").selectAll(".gantt-tooltip").remove();
    };
  }, [effectiveLength, scopedData, chartData, activeTopic]);

  return (
    <div
      ref={containerRef}
      className="gantt-chart chart-surface chart-surface--river"
    >
      <div className="gantt-chart__controls">
        <Breadcrumbs scopePath={scopePath} onNavigate={navigateTo} />
        <TopicLevelSwitcher
          className="gantt-chart__level-switcher"
          selectedLevel={selectedLevel}
          maxLevel={maxLevel}
          onChange={setSelectedLevel}
        />
      </div>

      <div className="gantt-chart__canvas chart-scroll-area">
        <svg ref={svgRef} className="gantt-chart__svg chart-svg"></svg>
      </div>

      {selectedTopicForModal && (
        <TopicSentencesModal
          topic={selectedTopicForModal}
          sentences={sentences}
          onClose={() => setSelectedTopicForModal(null)}
          onShowInArticle={onShowInArticle}
          allTopics={topics}
          readTopics={readTopics}
          onToggleRead={onToggleRead}
          markup={markup}
        />
      )}
    </div>
  );
};

export default GanttChart;
