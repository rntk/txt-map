import React, { useRef, useEffect, useMemo } from "react";
import * as d3 from "d3";
import { BASE_COLORS } from "../../../utils/chartConstants";

const MARGIN = { top: 10, right: 16, bottom: 28, left: 130 };
const MARKER_COLOR = "#7ba3cc";
const GANTT_COLORS = BASE_COLORS;
const ROW_HEIGHT = 28;
const MIN_HEIGHT = 80;

/**
 * DataTimelineChart — renders both timeline (event markers) and gantt (range bars).
 *
 * For timeline: events are points on an axis, positioned by `date` or sequentially by index.
 * For gantt: each value is a horizontal bar from `start` to `end` (or uses `date` as a point).
 *
 * Values without parseable dates are placed sequentially.
 */
export default function DataTimelineChart({ extraction, width = 340 }) {
  const svgRef = useRef(null);

  const { values = [], visualization, label } = extraction || {};
  const chartType = visualization?.chart_type || "timeline"; // 'timeline' or 'gantt'
  const _config = visualization?.config || {};

  // Build chart items — try to parse dates, fall back to sequential positions
  const items = useMemo(() => {
    return values.map((v, i) => {
      const startStr = v.start || v.date || null;
      const endStr = v.end || null;
      const startDate = startStr ? new Date(startStr) : null;
      const endDate = endStr ? new Date(endStr) : null;
      return {
        index: i,
        key: v.key || v.date || v.start || String(i + 1),
        value: v.value || "",
        startDate: startDate && !isNaN(startDate) ? startDate : null,
        endDate: endDate && !isNaN(endDate) ? endDate : null,
        startRaw: v.start || v.date || null,
        endRaw: v.end || null,
      };
    });
  }, [values]);

  const hasDates = items.some((d) => d.startDate !== null);
  const isGantt = chartType === "gantt";

  // Dynamic height based on number of rows
  const height = Math.max(
    MIN_HEIGHT,
    items.length * ROW_HEIGHT + MARGIN.top + MARGIN.bottom + 10,
  );

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    if (!items.length) return;

    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = height - MARGIN.top - MARGIN.bottom;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // Build x scale — date-based if we have dates, otherwise positional (index-based)
    let xScale;
    if (hasDates) {
      const allDates = items.flatMap((d) =>
        [d.startDate, d.endDate].filter(Boolean),
      );
      const [minDate, maxDate] = d3.extent(allDates);
      // Add some padding
      const pad = (maxDate - minDate) * 0.05 || 24 * 3600 * 1000;
      xScale = d3
        .scaleTime()
        .domain([new Date(minDate - pad), new Date(maxDate + pad)])
        .range([0, innerWidth]);
    } else {
      // Sequential: use indices
      xScale = d3
        .scaleLinear()
        .domain([-0.5, items.length - 0.5])
        .range([0, innerWidth]);
    }

    // y: one row per item
    const yBand = d3
      .scaleBand()
      .domain(items.map((d, i) => i))
      .range([0, innerHeight])
      .padding(0.3);

    // Horizontal grid lines
    items.forEach((_, i) => {
      g.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", yBand(i) + yBand.bandwidth() / 2)
        .attr("y2", yBand(i) + yBand.bandwidth() / 2)
        .attr("stroke", "#f0f0f0")
        .attr("stroke-width", 1);
    });

    if (isGantt) {
      // Gantt: bars from start to end (or full width if no range)
      items.forEach((d, i) => {
        const y = yBand(i);
        const bh = yBand.bandwidth();
        const fill = GANTT_COLORS[i % GANTT_COLORS.length];

        let x1, x2;
        if (hasDates && d.startDate) {
          x1 = xScale(d.startDate);
          x2 = d.endDate ? xScale(d.endDate) : x1 + 8;
        } else {
          // Sequential: each bar spans from index - 0.4 to index + 0.4
          x1 = xScale(i - 0.3);
          x2 = xScale(i + 0.3);
        }
        const barWidth = Math.max(x2 - x1, 4);

        g.append("rect")
          .attr("x", x1)
          .attr("y", y)
          .attr("width", barWidth)
          .attr("height", bh)
          .attr("fill", fill)
          .attr("rx", 3)
          .attr("opacity", 0.85);

        // Label inside or after bar
        const textX = x1 + barWidth + 4;
        if (textX + 10 < innerWidth) {
          g.append("text")
            .attr("x", textX)
            .attr("y", y + bh / 2)
            .attr("dy", "0.35em")
            .attr("font-size", 10)
            .attr("fill", "#555")
            .text(
              d.value ||
                (d.startRaw && d.endRaw ? `${d.startRaw} – ${d.endRaw}` : ""),
            );
        }
      });
    } else {
      // Timeline: diamond/circle markers on a horizontal line
      const lineY = innerHeight / 2;

      // Axis line
      g.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", lineY)
        .attr("y2", lineY)
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1.5);

      items.forEach((d, i) => {
        const cx = hasDates && d.startDate ? xScale(d.startDate) : xScale(i);

        const row = i % 2 === 0 ? lineY - 28 : lineY + 12;

        // Connector
        g.append("line")
          .attr("x1", cx)
          .attr("x2", cx)
          .attr("y1", lineY)
          .attr("y2", row + (i % 2 === 0 ? 16 : 0))
          .attr("stroke", "#ccc")
          .attr("stroke-width", 1);

        // Marker
        g.append("circle")
          .attr("cx", cx)
          .attr("cy", lineY)
          .attr("r", 5)
          .attr("fill", MARKER_COLOR);

        // Event label
        const textAnchor =
          cx < 30 ? "start" : cx > innerWidth - 30 ? "end" : "middle";
        const labelY = i % 2 === 0 ? row : row + 14;

        g.append("text")
          .attr("x", cx)
          .attr("y", labelY)
          .attr("text-anchor", textAnchor)
          .attr("font-size", 10)
          .attr("fill", "#444")
          .text(() => {
            const txt = d.key;
            return txt.length > 16 ? txt.slice(0, 14) + "…" : txt;
          });

        if (d.value && d.value !== d.key) {
          g.append("text")
            .attr("x", cx)
            .attr("y", labelY + 12)
            .attr("text-anchor", textAnchor)
            .attr("font-size", 9)
            .attr("fill", "#888")
            .text(() => {
              const txt = d.value;
              return txt.length > 14 ? txt.slice(0, 12) + "…" : txt;
            });
        }
      });
    }

    // X axis
    const xAxisG = g
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        hasDates
          ? d3.axisBottom(xScale).ticks(4)
          : d3
              .axisBottom(xScale)
              .ticks(items.length)
              .tickFormat((i) => {
                const item = items[Math.round(i)];
                return item ? item.startRaw || item.key || "" : "";
              }),
      );
    xAxisG.select(".domain").attr("stroke", "#ccc");
    xAxisG.selectAll("line").attr("stroke", "#ccc");
    xAxisG.selectAll("text").attr("font-size", 9).attr("fill", "#888");

    // Y axis — key labels (for gantt)
    if (isGantt) {
      const yAxis = g.append("g").call(
        d3
          .axisLeft(yBand)
          .tickFormat((i) => {
            const item = items[i];
            if (!item) return "";
            const txt = item.key;
            return txt.length > 16 ? txt.slice(0, 14) + "…" : txt;
          })
          .tickSize(0)
          .tickPadding(6),
      );
      yAxis.select(".domain").remove();
      yAxis.selectAll("text").attr("font-size", 11).attr("fill", "#444");
    }
  }, [items, isGantt, hasDates, width, height]);

  if (!items.length) return null;

  return (
    <div className="dc-chart dc-chart--timeline">
      {label && <div className="dc-chart__label">{label}</div>}
      <svg ref={svgRef} />
    </div>
  );
}
