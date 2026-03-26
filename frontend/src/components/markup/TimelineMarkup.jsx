import React from 'react';
import DataTimelineChart from '../annotations/charts/DataTimelineChart';
import { getItemIndex, getTextByIndex } from './markupUtils';

export default function TimelineMarkup({ segment, sentences }) {
  const { events = [] } = segment.data || {};
  if (events.length === 0) return null;

  // Build extraction shape expected by DataTimelineChart
  const extraction = {
    values: events.map(ev => ({
      key: ev.description || getTextByIndex(sentences, getItemIndex(ev)) || ev.date || '',
      date: ev.date || null,
      value: ev.date && ev.description ? ev.date : '',
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
