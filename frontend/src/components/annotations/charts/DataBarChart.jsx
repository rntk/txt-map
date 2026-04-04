import React, { useRef, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { parseNumericValue } from "../../../utils/dataChartUtils";

const MARGIN = { top: 10, right: 60, bottom: 28, left: 120 };
const BAR_COLOR = "#7ba3cc";

/**
 * DataBarChart — horizontal bar chart for numeric comparison extractions.
 * Values are verbatim strings from article text; we parse them to get numeric magnitudes
 * while displaying the original text as labels.
 */
export default function DataBarChart({
  extraction,
  width = 340,
  height = 180,
}) {
  const svgRef = useRef(null);

  const { values = [], visualization, label } = extraction || {};
  const config = visualization?.config || {};
  const configUnit = config.unit;
  const configXLabel = config.x_label;

  const chartData = useMemo(() => {
    return values
      .map((v) => {
        const parsed = parseNumericValue(v.value);
        return {
          key: v.key || "",
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

    if (!chartData.length) return;

    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = height - MARGIN.top - MARGIN.bottom;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const xMax = d3.max(chartData, (d) => d.numeric);
    const xScale = d3
      .scaleLinear()
      .domain([0, xMax])
      .range([0, innerWidth])
      .nice();

    const yScale = d3
      .scaleBand()
      .domain(chartData.map((d) => d.key))
      .range([0, innerHeight])
      .padding(0.25);

    // Bars
    g.selectAll("rect")
      .data(chartData)
      .join("rect")
      .attr("y", (d) => yScale(d.key))
      .attr("height", yScale.bandwidth())
      .attr("x", 0)
      .attr("width", (d) => xScale(d.numeric))
      .attr("fill", BAR_COLOR)
      .attr("rx", 3);

    // Value labels on right side of bar
    g.selectAll(".val-label")
      .data(chartData)
      .join("text")
      .attr("class", "val-label")
      .attr("x", (d) => xScale(d.numeric) + 5)
      .attr("y", (d) => yScale(d.key) + yScale.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("font-size", 11)
      .attr("fill", "#555")
      .text((d) => d.rawValue);

    // Y axis — key labels
    const yAxis = g
      .append("g")
      .call(d3.axisLeft(yScale).tickSize(0).tickPadding(6));
    yAxis.select(".domain").remove();
    yAxis
      .selectAll("text")
      .attr("font-size", 11)
      .attr("fill", "#444")
      .each(function () {
        // Truncate long labels
        const el = d3.select(this);
        const text = el.text();
        if (text.length > 18) el.text(text.slice(0, 16) + "…");
      });

    // X axis — minimal, just ticks
    const xAxisG = g
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(4)
          .tickFormat((v) => {
            if (v >= 1e9) return `${v / 1e9}B`;
            if (v >= 1e6) return `${v / 1e6}M`;
            if (v >= 1e3) return `${v / 1e3}K`;
            return v;
          }),
      );
    xAxisG.select(".domain").remove();
    xAxisG.selectAll("line").attr("stroke", "#ddd");
    xAxisG.selectAll("text").attr("font-size", 10).attr("fill", "#888");

    // X axis label
    if (configXLabel || configUnit) {
      g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 22)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#999")
        .text(configXLabel || configUnit);
    }
  }, [chartData, width, height, configXLabel, configUnit]);

  if (!chartData.length) return null;

  return (
    <div className="dc-chart dc-chart--bar">
      {label && <div className="dc-chart__label">{label}</div>}
      <svg ref={svgRef} />
    </div>
  );
}
