import React from "react";
import DataChart from "./DataChart";
import { getChartType } from "../../../utils/dataChartUtils";

/**
 * DataChartOverview — renders all data extractions matching a given chart type.
 * Used when Pass 1 recommended_charts includes DataBarChart / DataLineChart / DataTimelineChart.
 * The component receives all dataExtractions and filters to those matching its chartType.
 *
 * @param {{ dataExtractions?: object[], chartType?: string }} props
 */
export default function DataChartOverview({ dataExtractions = [], chartType }) {
  if (!chartType) return null;

  const matching = dataExtractions.filter(
    (ex) => getChartType(ex) === chartType,
  );

  if (!matching.length) return null;

  return (
    <div className="dc-overview">
      {matching.map((ex, i) => (
        <DataChart key={i} extraction={ex} />
      ))}
    </div>
  );
}
