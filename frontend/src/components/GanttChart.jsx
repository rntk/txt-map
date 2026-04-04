import React, { useEffect, useRef, useMemo, useState } from "react";
import * as d3 from "d3";
import TopicSentencesModal from "./shared/TopicSentencesModal";
import TopicLevelSwitcher from "./shared/TopicLevelSwitcher";
import { buildScopedChartData } from "../utils/topicHierarchy";
import { useTopicLevel } from "../hooks/useTopicLevel";
import { getTopicHighlightColor } from "../utils/topicColorUtils";
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
  const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(topics);
  const [selectedTopicForModal, setSelectedTopicForModal] = useState(null);

  const scopedData = useMemo(() => {
    const data = buildScopedChartData(topics, sentences, [], selectedLevel);
    return data.map((d) => ({
      ...d,
      sentences: d.sentenceIndices,
    }));
  }, [topics, sentences, selectedLevel]);

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

  useEffect(() => {
    if (
      !effectiveLength ||
      !scopedData ||
      scopedData.length === 0 ||
      !svgRef.current
    )
      return;

    const container = containerRef.current || svgRef.current.parentElement;
    const containerWidth = container.clientWidth || 800;

    d3.select(svgRef.current).selectAll("*").remove();

    const rowHeight = 25;
    const width = Math.max(containerWidth, 600);
    const margin = { top: 30, right: 30, bottom: 50, left: 150 };
    const height = scopedData.length * rowHeight + margin.top + margin.bottom;

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

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
      .style("cursor", "pointer")
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
          setSelectedTopicForModal({
            name: d.topicObj.fullPath || d.topicObj.name,
            displayName: d.topicObj.displayName || d.topicObj.name,
            fullPath: d.topicObj.fullPath || d.topicObj.name,
            sentenceIndices: d.topicObj.sentences,
          });
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
      .call(d3.axisLeft(y).tickSize(0))
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
          setSelectedTopicForModal({
            name: topicObj.fullPath || topicObj.name,
            displayName: topicObj.displayName || topicObj.name,
            fullPath: topicObj.fullPath || topicObj.name,
            sentenceIndices: topicObj.sentences,
          });
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
      <TopicLevelSwitcher
        className="gantt-chart__level-switcher"
        selectedLevel={selectedLevel}
        maxLevel={maxLevel}
        onChange={setSelectedLevel}
      />

      <div className="gantt-chart__canvas chart-scroll-area">
        <svg
          ref={svgRef}
          className="gantt-chart__svg chart-svg chart-svg--full-width"
        ></svg>
      </div>

      {selectedTopicForModal && (
        <TopicSentencesModal
          topic={selectedTopicForModal}
          sentences={sentences}
          onClose={() => setSelectedTopicForModal(null)}
          onShowInArticle={onShowInArticle}
          readTopics={readTopics}
          onToggleRead={onToggleRead}
          markup={markup}
        />
      )}
    </div>
  );
};

export default GanttChart;
