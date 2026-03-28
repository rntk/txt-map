import React from 'react';
import { getNestedIndices, getTextByIndex } from './markupUtils';
import HighlightedText from '../shared/HighlightedText';

/**
 * @typedef {Object} ParagraphGroup
 * @property {number[]} sentence_indices
 *
 * @typedef {Object} ParagraphMarkupProps
 * @property {{ data?: { paragraphs?: ParagraphGroup[] } }} segment
 * @property {string[]} [sentences]
 */

/**
 * @param {ParagraphMarkupProps} props
 * @returns {React.JSX.Element|null}
 */
export default function ParagraphMarkup({ segment, sentences }) {
  const paragraphGroups = Array.isArray(segment.data?.paragraphs)
    ? segment.data.paragraphs
    : [];

  const paragraphs = paragraphGroups
    .map((paragraph) => {
      const indices = Array.isArray(paragraph.sentence_indices)
        ? [...paragraph.sentence_indices].sort((a, b) => a - b)
        : getNestedIndices(paragraph, 'position_indices', 'sentence_indices');
      const text = indices
        .map((idx) => getTextByIndex(sentences, idx))
        .filter(Boolean)
        .join(' ')
        .trim();

      return text;
    })
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className="markup-segment markup-paragraph">
      {paragraphs.map((paragraphText, index) => (
        <p key={index} className="markup-paragraph__block">
          <HighlightedText text={paragraphText} />
        </p>
      ))}
    </div>
  );
}
