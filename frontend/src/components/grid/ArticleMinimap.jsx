import React, { useMemo } from 'react';

function ArticleMinimap({ sentences, highlightedIndices }) {
  const highlightSet = useMemo(() => new Set(highlightedIndices), [highlightedIndices]);

  const maxLen = useMemo(() => Math.max(...sentences.map(s => s.length), 1), [sentences]);

  const minimapRows = useMemo(() => {
    return sentences.flatMap((sentence, sentenceIdx) => {
      const baseWidth = Math.round(52 + (sentence.length / maxLen) * 44);
      const lineCount = Math.max(2, Math.min(8, Math.ceil(sentence.length / 24)));
      const paragraphBreak = sentenceIdx > 0 && sentenceIdx % 6 === 0;

      return Array.from({ length: lineCount }, (_, lineIdx) => {
        const tailDrop = lineIdx === lineCount - 1 ? 16 : 0;
        const steppedDrop = lineIdx * 5;
        const rhythmOffset = ((sentenceIdx + lineIdx) % 3) * 2;
        const widthPct = Math.max(30, Math.min(98, baseWidth - steppedDrop - tailDrop + rhythmOffset));
        return {
          key: `${sentenceIdx}-${lineIdx}`,
          paragraphBreak: paragraphBreak && lineIdx === 0,
          widthPct,
          isHighlight: highlightSet.has(sentenceIdx + 1),
          isContinuation: lineIdx > 0,
        };
      });
    });
  }, [sentences, maxLen, highlightSet]);

  return (
    <div className="grid-view-minimap">
      {minimapRows.map((row) => {
        const highlightClass = row.isHighlight
          ? (row.isContinuation ? ' grid-view-minimap-bar--highlight-soft' : ' grid-view-minimap-bar--highlight')
          : '';
        return (
          <div
            key={row.key}
            className={`grid-view-minimap-row${row.paragraphBreak ? ' grid-view-minimap-row--break' : ''}`}
          >
            <div
              className={`grid-view-minimap-bar${highlightClass}`}
              style={{ width: `${row.widthPct}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default ArticleMinimap;
