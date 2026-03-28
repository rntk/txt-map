import React, { useMemo } from 'react';

/**
 * @typedef {Object} WordTreeToken
 * @property {string} text
 * @property {string} normalized
 *
 * @typedef {Object} WordTreeEntry
 * @property {string} id
 * @property {number} sentenceIndex
 * @property {number} sentenceNumber
 * @property {string} sentenceText
 * @property {string} matchText
 * @property {WordTreeToken[]} leftTokens
 * @property {WordTreeToken[]} rightTokens
 * @property {boolean} isRead
 *
 * @typedef {Object} WordTreeProps
 * @property {WordTreeEntry[]} entries
 * @property {string} pivotLabel
 */

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} sentence
 * @returns {string}
 */
export function sentenceToPlainText(sentence) {
  const raw = String(sentence || '');

  if (typeof document === 'undefined') {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const template = document.createElement('template');
  template.innerHTML = raw;
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} text
 * @returns {WordTreeToken[]}
 */
export function tokenizeWordTreeText(text) {
  const source = String(text || '');
  if (!source.trim()) {
    return [];
  }

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    return Array.from(segmenter.segment(source))
      .filter((part) => part.isWordLike)
      .map((part) => ({
        text: part.segment,
        normalized: part.segment.toLocaleLowerCase(),
      }))
      .filter((part) => part.normalized.length > 0);
  }

  const matches = source.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
  return matches.map((token) => ({
    text: token,
    normalized: token.toLocaleLowerCase(),
  }));
}

/**
 * @param {string} target
 * @returns {RegExp|null}
 */
export function buildWordTreeMatchRegex(target) {
  const normalizedTarget = String(target || '').trim();
  if (!normalizedTarget) {
    return null;
  }

  const pattern = normalizedTarget
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join('\\s+');

  return new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, 'giu');
}

/**
 * @param {string[]} sentences
 * @param {string} target
 * @param {Set<number>|number[]} [readSentenceIndices]
 * @returns {WordTreeEntry[]}
 */
export function buildWordTreeEntries(sentences, target, readSentenceIndices = new Set()) {
  const safeSentences = Array.isArray(sentences) ? sentences : [];
  const regex = buildWordTreeMatchRegex(target);
  const readSentenceIndexSet = readSentenceIndices instanceof Set
    ? readSentenceIndices
    : new Set(readSentenceIndices || []);

  if (!regex) {
    return [];
  }

  /** @type {WordTreeEntry[]} */
  const entries = [];

  safeSentences.forEach((sentence, sentenceIndex) => {
    const sentenceText = sentenceToPlainText(sentence);
    if (!sentenceText) {
      return;
    }

    regex.lastIndex = 0;
    let match = regex.exec(sentenceText);
    let occurrenceIndex = 0;

    while (match) {
      const matchText = match[0];
      const matchStart = match.index;
      const matchEnd = matchStart + matchText.length;
      const leftText = sentenceText.slice(0, matchStart).trim();
      const rightText = sentenceText.slice(matchEnd).trim();

      entries.push({
        id: `${sentenceIndex}-${matchStart}-${occurrenceIndex}`,
        sentenceIndex,
        sentenceNumber: sentenceIndex + 1,
        sentenceText,
        matchText,
        leftTokens: tokenizeWordTreeText(leftText),
        rightTokens: tokenizeWordTreeText(rightText),
        isRead: readSentenceIndexSet.has(sentenceIndex + 1),
      });

      occurrenceIndex += 1;
      match = regex.exec(sentenceText);
    }
  });

  return entries.sort((entryA, entryB) => {
    const leftA = entryA.leftTokens.map((token) => token.normalized).reverse().join('\u0000');
    const leftB = entryB.leftTokens.map((token) => token.normalized).reverse().join('\u0000');
    if (leftA !== leftB) {
      return leftA.localeCompare(leftB);
    }

    const rightA = entryA.rightTokens.map((token) => token.normalized).join('\u0000');
    const rightB = entryB.rightTokens.map((token) => token.normalized).join('\u0000');
    if (rightA !== rightB) {
      return rightA.localeCompare(rightB);
    }

    if (entryA.sentenceIndex !== entryB.sentenceIndex) {
      return entryA.sentenceIndex - entryB.sentenceIndex;
    }

    return entryA.id.localeCompare(entryB.id);
  });
}

/**
 * @param {WordTreeEntry[]} entries
 * @param {'left'|'right'} side
 * @returns {number}
 */
function getMaxDepth(entries, side) {
  return entries.reduce((maxDepth, entry) => {
    const tokens = side === 'left' ? entry.leftTokens : entry.rightTokens;
    return Math.max(maxDepth, tokens.length);
  }, 0);
}

/**
 * @param {WordTreeEntry|null} entryA
 * @param {WordTreeEntry|null} entryB
 * @param {'left'|'right'} side
 * @param {number} depth
 * @returns {boolean}
 */
function sharesBranch(entryA, entryB, side, depth) {
  if (!entryA || !entryB) {
    return false;
  }

  const pathA = side === 'left'
    ? entryA.leftTokens.map((token) => token.normalized).reverse()
    : entryA.rightTokens.map((token) => token.normalized);
  const pathB = side === 'left'
    ? entryB.leftTokens.map((token) => token.normalized).reverse()
    : entryB.rightTokens.map((token) => token.normalized);

  if (!pathA[depth] || !pathB[depth]) {
    return false;
  }

  for (let index = 0; index <= depth; index += 1) {
    if (pathA[index] !== pathB[index]) {
      return false;
    }
  }

  return true;
}

/**
 * @param {WordTreeEntry} entry
 * @param {'left'|'right'} side
 * @param {number} maxDepth
 * @returns {(WordTreeToken|null)[]}
 */
function buildDisplayColumns(entry, side, maxDepth) {
  const nearestFirstTokens = side === 'left'
    ? [...entry.leftTokens].reverse()
    : entry.rightTokens;
  const columns = new Array(maxDepth).fill(null);

  nearestFirstTokens.forEach((token, depth) => {
    const columnIndex = side === 'left' ? maxDepth - 1 - depth : depth;
    columns[columnIndex] = token;
  });

  return columns;
}

/**
 * @param {WordTreeProps} props
 * @returns {React.ReactElement}
 */
export default function WordTree({ entries, pivotLabel }) {
  const safeEntries = useMemo(
    () => (Array.isArray(entries) ? entries : []),
    [entries]
  );
  const leftDepth = useMemo(() => getMaxDepth(safeEntries, 'left'), [safeEntries]);
  const rightDepth = useMemo(() => getMaxDepth(safeEntries, 'right'), [safeEntries]);

  if (safeEntries.length === 0) {
    return (
      <div className="word-tree word-tree--empty">
        <p className="word-page-no-occurrences">No occurrences of this word were found in the article.</p>
      </div>
    );
  }

  return (
    <section className="word-tree" aria-label={`Context tree for ${pivotLabel}`}>
      <div className="word-tree__legend">
        <span className="word-tree__legend-chip">Read</span>
        <span>Dimmed rows belong to already read sentences.</span>
      </div>
      <div className="word-tree__viewport">
        <div className="word-tree__rows">
          {safeEntries.map((entry, entryIndex) => {
            const previousEntry = entryIndex > 0 ? safeEntries[entryIndex - 1] : null;
            const nextEntry = entryIndex < safeEntries.length - 1 ? safeEntries[entryIndex + 1] : null;
            const leftColumns = buildDisplayColumns(entry, 'left', leftDepth);
            const rightColumns = buildDisplayColumns(entry, 'right', rightDepth);
            const leftNearestFirst = entry.leftTokens.map((token) => token.normalized).reverse();
            const rightNearestFirst = entry.rightTokens.map((token) => token.normalized);

            return (
              <div
                key={entry.id}
                className={`word-tree__row${entry.isRead ? ' word-tree__row--read' : ''}`}
                title={`Sentence ${entry.sentenceNumber}: ${entry.sentenceText}`}
              >
                <div className="word-tree__branch word-tree__branch--left" aria-hidden="true">
                  {leftColumns.map((token, columnIndex) => {
                    if (!token) {
                      return <div key={`left-${entry.id}-${columnIndex}`} className="word-tree__cell word-tree__cell--empty" />;
                    }

                    const depth = leftDepth - 1 - columnIndex;
                    const sharedPrev = depth >= 0 && depth < leftNearestFirst.length
                      ? sharesBranch(entry, previousEntry, 'left', depth)
                      : false;
                    const sharedNext = depth >= 0 && depth < leftNearestFirst.length
                      ? sharesBranch(entry, nextEntry, 'left', depth)
                      : false;

                    return (
                      <div
                        key={`left-${entry.id}-${columnIndex}`}
                        className={`word-tree__cell word-tree__cell--left word-tree__cell--filled${sharedPrev ? ' word-tree__cell--merge-prev' : ''}${sharedNext ? ' word-tree__cell--merge-next' : ''}`}
                      >
                        <span className="word-tree__token">{token.text}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="word-tree__pivot-wrap">
                  <span className="word-tree__pivot">{entry.matchText || pivotLabel}</span>
                </div>

                <div className="word-tree__branch word-tree__branch--right" aria-hidden="true">
                  {rightColumns.map((token, columnIndex) => {
                    if (!token) {
                      return <div key={`right-${entry.id}-${columnIndex}`} className="word-tree__cell word-tree__cell--empty" />;
                    }

                    const depth = columnIndex;
                    const sharedPrev = depth < rightNearestFirst.length
                      ? sharesBranch(entry, previousEntry, 'right', depth)
                      : false;
                    const sharedNext = depth < rightNearestFirst.length
                      ? sharesBranch(entry, nextEntry, 'right', depth)
                      : false;

                    return (
                      <div
                        key={`right-${entry.id}-${columnIndex}`}
                        className={`word-tree__cell word-tree__cell--right word-tree__cell--filled${sharedPrev ? ' word-tree__cell--merge-prev' : ''}${sharedNext ? ' word-tree__cell--merge-next' : ''}`}
                      >
                        <span className="word-tree__token">{token.text}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="word-tree__meta">
                  <span className="word-tree__sentence-number">Sentence {entry.sentenceNumber}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
