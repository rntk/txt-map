import React from 'react';
import { getItemIndex, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

/**
 * TimelineMarkup - Displays chronological events with visual timeline
 * Features vertical line, dot markers, and date badges
 */
export default function TimelineMarkup({ segment, sentences }) {
  const { events = [] } = segment.data || {};
  if (events.length === 0) return null;

  // Sort events by sentence index to maintain chronological order
  const sortedEvents = [...events].sort((a, b) => {
    const idxA = getItemIndex(a) ?? 0;
    const idxB = getItemIndex(b) ?? 0;
    return idxA - idxB;
  });

  return (
    <div
      className="markup-segment markup-timeline"
      role="region"
      aria-label="Timeline"
    >
      <div className="markup-timeline__container">
        <div className="markup-timeline__line" aria-hidden="true" />
        {sortedEvents.map((event, index) => {
          const text = event.description || getTextByIndex(sentences, getItemIndex(event)) || '';
          const date = event.date || '';

          return (
            <div
              key={index}
              className="markup-timeline__event"
              role="listitem"
            >
              <div className="markup-timeline__dot" aria-hidden="true" />
              {date && (
                <time className="markup-timeline__date" dateTime={date}>
                  {date}
                </time>
              )}
              <div className="markup-timeline__content">
                <HighlightedText text={text} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
