import React from "react";
import DataChart from "../annotations/charts/DataChart";

export default function DataTrendMarkup({ segment, sentences: _sentences }) {
  const { values = [], unit } = segment.data || {};
  if (values.length === 0) return null;

  // Build extraction shape expected by DataChart / DataBarChart
  const extraction = {
    values: values.map((v) => ({
      key: v.label || v.key || "",
      value: v.value || "",
    })),
    visualization: {
      chart_type: "bar",
      config: unit ? { unit } : {},
    },
    label: null,
  };

  return (
    <div className="markup-segment markup-data-trend">
      <div className="markup-data-trend__chart-wrapper">
        <DataChart
          extraction={extraction}
          width={320}
          height={Math.max(160, values.length * 32 + 40)}
        />
      </div>
      {unit && <div className="markup-data-trend__unit">Unit: {unit}</div>}
    </div>
  );
}
