import React, { useRef, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { parseNumericValue } from "../../../utils/dataChartUtils";

const MARGIN = { top: 16, right: 20, bottom: 36, left: 48 };
const LINE_COLOR = "#7ba3cc";
const DOT_COLOR = "#4a7fa8";

/**
 * DataLineChart — line/trend chart for sequential or time-series extractions.
 * Uses key as x-axis label and numeric value as y-axis.
 */
export default function DataLineChart({
  extraction,
  width = 340,
  height = 180,
}) {
  const svgRef = useRef(null);

  const { values = [], visualization, label } = extraction || {};
  const config = visualization?.config || {};
  const configUnit = config.unit;
  const configXLabel = config.x_label;
  const configYLabel = config.y_label;

  const chartData = useMemo(() => {
    return values
      .map((v, i) => {
        const parsed = parseNumericValue(v.value);
        return {
          index: i,
          key: v.date || v.key || String(i + 1),
          rawValue: v.value || "",
          numeric: parsed ? parsed.numeric : null,
          unit: parsed ? parsed.unit : configUnit || "",
        };
      })
      .filter((d) => d.numeric !== null);
  }, [values, configUnit]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    if (chartData.length < 2) return;

    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = height - MARGIN.top - MARGIN.bottom;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const xScale = d3
      .scalePoint()
      .domain(chartData.map((d) => d.key))
      .range([0, innerWidth])
      .padding(0.3);

    const yExtent = d3.extent(chartData, (d) => d.numeric);
    const yPad = (yExtent[1] - yExtent[0]) * 0.1 || yExtent[1] * 0.1 || 1;
    const yScale = d3
      .scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([innerHeight, 0])
      .nice();

    // Grid lines
    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(yScale).ticks(4).tickSize(-innerWidth).tickFormat(""))
      .call((gr) => gr.select(".domain").remove())
      .call((gr) => gr.selectAll("line").attr("stroke", "#eee"));

    // Line
    const line = d3
      .line()
      .x((d) => xScale(d.key))
      .y((d) => yScale(d.numeric))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(chartData)
      .attr("fill", "none")
      .attr("stroke", LINE_COLOR)
      .attr("stroke-width", 2)
      .attr("d", line);

    // Dots
    g.selectAll(".dot")
      .data(chartData)
      .join("circle")
      .attr("class", "dot")
      .attr("cx", (d) => xScale(d.key))
      .attr("cy", (d) => yScale(d.numeric))
      .attr("r", 4)
      .attr("fill", DOT_COLOR);

    // Value labels above dots (show for small datasets)
    if (chartData.length <= 8) {
      g.selectAll(".dot-label")
        .data(chartData)
        .join("text")
        .attr("class", "dot-label")
        .attr("x", (d) => xScale(d.key))
        .attr("y", (d) => yScale(d.numeric) - 8)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#555")
        .text((d) => d.rawValue);
    }

    // X axis
    const xAxisG = g
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickSize(3));
    xAxisG.select(".domain").attr("stroke", "#ccc");
    xAxisG.selectAll("line").attr("stroke", "#ccc");
    xAxisG
      .selectAll("text")
      .attr("font-size", 10)
      .attr("fill", "#666")
      .each(function () {
        const el = d3.select(this);
        const text = el.text();
        if (text.length > 10) el.text(text.slice(0, 9) + "…");
      });

    // X label
    if (configXLabel) {
      g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 30)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#999")
        .text(configXLabel);
    }

    // Y axis
    const yAxisG = g.append("g").call(
      d3
        .axisLeft(yScale)
        .ticks(4)
        .tickFormat((v) => {
          if (Math.abs(v) >= 1e9) return `${v / 1e9}B`;
          if (Math.abs(v) >= 1e6) return `${v / 1e6}M`;
          if (Math.abs(v) >= 1e3) return `${v / 1e3}K`;
          return v;
        }),
    );
    yAxisG.select(".domain").remove();
    yAxisG.selectAll("line").attr("stroke", "#ccc");
    yAxisG.selectAll("text").attr("font-size", 10).attr("fill", "#666");

    // Y label
    if (configYLabel || configUnit) {
      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -38)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#999")
        .text(configYLabel || configUnit);
    }
  }, [chartData, width, height, configXLabel, configYLabel, configUnit]);

  if (!chartData.length) return null;

  return (
    <div className="dc-chart dc-chart--line">
      {label && <div className="dc-chart__label">{label}</div>}
      <svg ref={svgRef} />
    </div>
  );
}
