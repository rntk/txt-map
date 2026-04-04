import React from "react";
import DataBarChart from "./DataBarChart";
import DataLineChart from "./DataLineChart";
import DataTimelineChart from "./DataTimelineChart";
import { getChartType } from "../../../utils/dataChartUtils";
import "./DataChart.css";

/**
 * DataChart — router component that delegates to the appropriate chart sub-component
 * based on visualization.chart_type (or inferred type for legacy extractions).
 *
 * @param {{ extraction: object, width?: number, height?: number }} props
 */
export default function DataChart({ extraction, width, height }) {
  const chartType = getChartType(extraction);

  switch (chartType) {
    case "bar":
      return (
        <DataBarChart extraction={extraction} width={width} height={height} />
      );
    case "line":
      return (
        <DataLineChart extraction={extraction} width={width} height={height} />
      );
    case "timeline":
    case "gantt":
      return (
        <DataTimelineChart
          extraction={extraction}
          width={width}
          height={height}
        />
      );
    default:
      return null;
  }
}
