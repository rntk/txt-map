import React from 'react';
import { getItemIndex, getTextByIndex } from './markupUtils';

const STYLE_TAG = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  highlight: 'mark',
};

function applyHighlights(text, highlights) {
  if (!highlights || highlights.length === 0) return text;

  // Build a list of non-overlapping ranges to wrap, sorted by position
  const ranges = [];
  for (const { phrase, style } of highlights) {
    if (!phrase) continue;
    const idx = text.indexOf(phrase);
    if (idx === -1) continue;
    ranges.push({ start: idx, end: idx + phrase.length, phrase, style });
  }
  ranges.sort((a, b) => a.start - b.start);

  // Remove overlapping ranges (keep first)
  const clean = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start >= cursor) {
      clean.push(r);
      cursor = r.end;
    }
  }

  if (clean.length === 0) return text;

  // Build React node array
  const parts = [];
  let pos = 0;
  clean.forEach(({ start, end, phrase, style }, i) => {
    if (pos < start) parts.push(text.slice(pos, start));
    const Tag = STYLE_TAG[style] || 'strong';
    parts.push(<Tag key={i} className={`markup-emphasis__${style}`}>{phrase}</Tag>);
    pos = end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return parts;
}

export default function EmphasisMarkup({ segment, sentences }) {
  const { items = [] } = segment.data || {};
  const sorted = items.slice().sort((a, b) => (getItemIndex(a) ?? 0) - (getItemIndex(b) ?? 0));

  return (
    <div className="markup-segment markup-emphasis">
      {sorted.map((item, i) => {
        const itemIndex = getItemIndex(item);
        const rawText = getTextByIndex(sentences, itemIndex) || item.text || '';
        const content = applyHighlights(rawText, item.highlights);
        return (
          <div key={i} className="markup-emphasis__sentence">
            <span className="markup-plain__num">{itemIndex}.</span>
            <span className="markup-emphasis__text">{content}</span>
          </div>
        );
      })}
    </div>
  );
}
