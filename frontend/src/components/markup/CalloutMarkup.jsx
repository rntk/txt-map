import React from 'react';
import { getSegmentIndices, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

const LEVEL_CONFIG = {
  warning: {
    label: 'Warning',
    icon: '⚠',
    ariaLabel: 'Warning notice',
  },
  tip: {
    label: 'Tip',
    icon: '💡',
    ariaLabel: 'Helpful tip',
  },
  note: {
    label: 'Note',
    icon: 'ℹ',
    ariaLabel: 'Information note',
  },
  important: {
    label: 'Important',
    icon: '❗',
    ariaLabel: 'Important notice',
  },
};

/**
 * CalloutMarkup - Displays callout boxes with different severity levels
 * Supports warning, tip, note, and important levels with icons and accessibility attributes
 */
export default function CalloutMarkup({ segment, sentences }) {
  const level = segment.data?.level || 'note';
  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.note;
  const indices = getSegmentIndices(segment);

  return (
    <div
      className={`markup-segment markup-callout markup-callout--${level}`}
      role="note"
      aria-label={config.ariaLabel}
    >
      <div className="markup-callout__label">
        <span className="markup-callout__icon" aria-hidden="true">
          {config.icon}
        </span>
        {config.label}
      </div>
      {indices.map((idx, i) => (
        <div key={i} className="markup-callout__text">
          <HighlightedText text={getTextByIndex(sentences, idx)} />
        </div>
      ))}
    </div>
  );
}
