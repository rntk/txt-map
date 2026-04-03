import React, { useMemo } from 'react';

/**
 * @typedef {Object} ArticleMinimapSentenceState
 * @property {boolean} [isActive]
 * @property {string|null} [color]
 */

/**
 * @typedef {Object} ArticleMinimapProps
 * @property {string[]} sentences
 * @property {Array<ArticleMinimapSentenceState|null|undefined>} [sentenceStates]
 * @property {(sentenceIndex: number) => void} [onSentenceClick]
 */

/**
 * @param {ArticleMinimapProps} props
 */
function ArticleMinimap({ sentences, sentenceStates = [], onSentenceClick }) {
  const safeSentences = useMemo(
    () => (Array.isArray(sentences) ? sentences : []),
    [sentences]
  );
  const safeSentenceStates = useMemo(
    () => (Array.isArray(sentenceStates) ? sentenceStates : []),
    [sentenceStates]
  );

  const maxLen = useMemo(
    () => Math.max(...safeSentences.map(sentence => sentence.length), 1),
    [safeSentences]
  );

  const minimapRows = useMemo(() => {
    return safeSentences.flatMap((sentence, sentenceIdx) => {
      const baseWidth = Math.round(52 + (sentence.length / maxLen) * 44);
      const lineCount = Math.max(2, Math.min(8, Math.ceil(sentence.length / 24)));
      const paragraphBreak = sentenceIdx > 0 && sentenceIdx % 6 === 0;
      const sentenceState = safeSentenceStates[sentenceIdx] || null;
      const isActive = Boolean(sentenceState?.isActive || sentenceState?.color);
      const color = typeof sentenceState?.color === 'string' ? sentenceState.color : null;

      return Array.from({ length: lineCount }, (_, lineIdx) => {
        const tailDrop = lineIdx === lineCount - 1 ? 16 : 0;
        const steppedDrop = lineIdx * 5;
        const rhythmOffset = ((sentenceIdx + lineIdx) % 3) * 2;
        const widthPct = Math.max(30, Math.min(98, baseWidth - steppedDrop - tailDrop + rhythmOffset));
        return {
          key: `${sentenceIdx}-${lineIdx}`,
          sentenceIndex: sentenceIdx,
          paragraphBreak: paragraphBreak && lineIdx === 0,
          widthPct,
          isActive,
          color,
          isContinuation: lineIdx > 0,
        };
      });
    });
  }, [safeSentences, maxLen, safeSentenceStates]);

  return (
    <div className="grid-view-minimap">
      {minimapRows.map((row) => {
        const highlightClass = row.isActive
          ? (row.isContinuation ? ' grid-view-minimap-bar--active-soft' : ' grid-view-minimap-bar--active')
          : '';
        const isInteractive = typeof onSentenceClick === 'function';
        const rowStyle = {
          '--minimap-bar-width': `${row.widthPct}%`,
          ...(row.color ? { '--minimap-bar-color': row.color } : {}),
        };
        return (
          <div
            key={row.key}
            className={`grid-view-minimap-row${row.paragraphBreak ? ' grid-view-minimap-row--break' : ''}`}
          >
            {isInteractive ? (
              <button
                type="button"
                className="grid-view-minimap-button"
                onClick={() => onSentenceClick(row.sentenceIndex)}
                aria-label={`Scroll to sentence ${row.sentenceIndex + 1}`}
                title={`Scroll to sentence ${row.sentenceIndex + 1}`}
              >
                <div
                  className={`grid-view-minimap-bar${highlightClass}`}
                  style={rowStyle}
                />
              </button>
            ) : (
              <div
                className={`grid-view-minimap-bar${highlightClass}`}
                style={rowStyle}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ArticleMinimap;
