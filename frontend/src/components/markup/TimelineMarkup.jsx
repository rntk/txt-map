import React from 'react';
import DataTimelineChart from '../annotations/charts/DataTimelineChart';

export default function TimelineMarkup({ segment, sentences: _sentences }) {
  const { events = [] } = segment.data || {};
  if (events.length === 0) return null;

  // Build extraction shape expected by DataTimelineChart
  const extraction = {
    values: events.map(ev => ({
      key: ev.date || ev.description || '',
      date: ev.date || null,
      value: ev.description || '',
    })),
    visualization: {
      chart_type: 'timeline',
      config: {},
    },
    label: null,
  };

  return (
    <div className="markup-segment markup-timeline">
      <DataTimelineChart extraction={extraction} width={320} />
    </div>
  );
}
