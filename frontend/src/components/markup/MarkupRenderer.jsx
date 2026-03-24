import React from 'react';
import './markup.css';
import PlainMarkup from './PlainMarkup';
import DialogMarkup from './DialogMarkup';
import ComparisonMarkup from './ComparisonMarkup';
import ListMarkup from './ListMarkup';
import DataTrendMarkup from './DataTrendMarkup';
import TimelineMarkup from './TimelineMarkup';
import DefinitionMarkup from './DefinitionMarkup';
import QuoteMarkup from './QuoteMarkup';
import CodeMarkup from './CodeMarkup';
import EmphasisMarkup from './EmphasisMarkup';

export default function MarkupRenderer({ segments, sentences }) {
  if (!segments || segments.length === 0) return null;

  return (
    <>
      {segments.map((segment, i) => {
        switch (segment.type) {
          case 'dialog':
            return <DialogMarkup key={i} segment={segment} sentences={sentences} />;
          case 'comparison':
            return <ComparisonMarkup key={i} segment={segment} sentences={sentences} />;
          case 'list':
            return <ListMarkup key={i} segment={segment} sentences={sentences} />;
          case 'data_trend':
            return <DataTrendMarkup key={i} segment={segment} sentences={sentences} />;
          case 'timeline':
            return <TimelineMarkup key={i} segment={segment} sentences={sentences} />;
          case 'definition':
            return <DefinitionMarkup key={i} segment={segment} sentences={sentences} />;
          case 'quote':
            return <QuoteMarkup key={i} segment={segment} sentences={sentences} />;
          case 'code':
            return <CodeMarkup key={i} segment={segment} sentences={sentences} />;
          case 'emphasis':
            return <EmphasisMarkup key={i} segment={segment} sentences={sentences} />;
          default:
            return <PlainMarkup key={i} segment={segment} sentences={sentences} />;
        }
      })}
    </>
  );
}
