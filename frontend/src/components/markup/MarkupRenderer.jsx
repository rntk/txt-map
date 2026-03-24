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
import ParagraphMarkup from './ParagraphMarkup';
import TitleMarkup from './TitleMarkup';
import StepsMarkup from './StepsMarkup';
import TableMarkup from './TableMarkup';
import QuestionAnswerMarkup from './QuestionAnswerMarkup';
import CalloutMarkup from './CalloutMarkup';
import KeyValueMarkup from './KeyValueMarkup';
import { getSegmentIndices } from './markupUtils';

export default function MarkupRenderer({ segments, sentences }) {
  const segmentList = Array.isArray(segments) ? segments : [];
  const totalIndices = Array.isArray(sentences) ? sentences.length : 0;

  if (segmentList.length === 0 && totalIndices === 0) return null;

  const segmentsWithStart = segmentList.map((segment) => ({
    segment,
    indices: getSegmentIndices(segment),
  })).sort((left, right) => {
    const leftStart = left.indices[0] ?? Number.MAX_SAFE_INTEGER;
    const rightStart = right.indices[0] ?? Number.MAX_SAFE_INTEGER;
    return leftStart - rightStart;
  });

  const coveredIndices = new Set(
    segmentsWithStart.flatMap((item) => item.indices)
  );
  const renderedSegments = [];
  let pendingPlainIndices = [];

  for (let idx = 1; idx <= totalIndices; idx += 1) {
    if (!coveredIndices.has(idx)) {
      pendingPlainIndices.push(idx);
      continue;
    }

    if (pendingPlainIndices.length > 0) {
      renderedSegments.push({
        type: 'plain',
        position_indices: pendingPlainIndices,
        data: {},
      });
      pendingPlainIndices = [];
    }

    while (segmentsWithStart.length > 0) {
      const { segment, indices } = segmentsWithStart[0];
      if (indices[0] !== idx) break;
      renderedSegments.push(segment);
      segmentsWithStart.shift();
    }
  }

  if (pendingPlainIndices.length > 0) {
    renderedSegments.push({
      type: 'plain',
      position_indices: pendingPlainIndices,
      data: {},
    });
  }

  while (segmentsWithStart.length > 0) {
    renderedSegments.push(segmentsWithStart.shift().segment);
  }

  return (
    <>
      {renderedSegments.map((segment, i) => {
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
          case 'paragraph':
            return <ParagraphMarkup key={i} segment={segment} sentences={sentences} />;
          case 'title':
            return <TitleMarkup key={i} segment={segment} sentences={sentences} />;
          case 'steps':
            return <StepsMarkup key={i} segment={segment} sentences={sentences} />;
          case 'table':
            return <TableMarkup key={i} segment={segment} sentences={sentences} />;
          case 'question_answer':
            return <QuestionAnswerMarkup key={i} segment={segment} sentences={sentences} />;
          case 'callout':
            return <CalloutMarkup key={i} segment={segment} sentences={sentences} />;
          case 'key_value':
            return <KeyValueMarkup key={i} segment={segment} sentences={sentences} />;
          default:
            return <PlainMarkup key={i} segment={segment} sentences={sentences} />;
        }
      })}
    </>
  );
}
