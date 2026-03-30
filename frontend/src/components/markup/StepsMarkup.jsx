import React from 'react';
import { getItemIndex, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

/**
 * StepsMarkup - Displays procedural steps with visual connector
 * Features dashed connector line, step numbers, and accessibility attributes
 */
export default function StepsMarkup({ segment, sentences }) {
  const items = (segment.data?.items || [])
    .slice()
    .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));

  if (items.length === 0) return null;

  return (
    <div
      className="markup-segment markup-steps"
      role="list"
      aria-label="Procedure steps"
    >
      {items.map((item, index) => {
        const text = item.text || getTextByIndex(sentences, getItemIndex(item)) || '';
        const stepNumber = item.step_number ?? index + 1;
        const isLast = index === items.length - 1;
        const isFirst = index === 0;

        // Determine step state for styling
        let stepState = '';
        if (isFirst) stepState = 'active';
        // Could be extended to support 'completed' state based on user interaction

        return (
          <div
            key={index}
            className={`markup-steps__item ${stepState ? `markup-steps__item--${stepState}` : ''}`}
            role="listitem"
            aria-posinset={stepNumber}
            aria-setsize={items.length}
          >
            <span
              className="markup-steps__number"
              aria-label={`Step ${stepNumber}`}
            >
              {stepNumber}
            </span>
            {!isLast && <div className="markup-steps__connector" aria-hidden="true" />}
            <span className="markup-steps__text">
              <HighlightedText text={text} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
