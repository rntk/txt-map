/**
 * @typedef {Object} ExtractionValue
 * @property {string} [key]
 * @property {string} [value]
 */

/**
 * @typedef {Object} DataExtraction
 * @property {string} [label]
 * @property {number[]} [source_sentences]
 * @property {ExtractionValue[]} [values]
 * @property {string} [display_suggestion]
 */

/**
 * @typedef {Object} HighlightSegment
 * @property {number} start
 * @property {number} end
 * @property {string} text
 * @property {boolean} highlighted
 */

/**
 * @param {DataExtraction|null|undefined} extraction
 * @returns {string}
 */
export function buildExtractionKey(extraction) {
  if (!extraction || typeof extraction !== 'object') {
    return '';
  }

  const label = typeof extraction.label === 'string' ? extraction.label.trim() : '';
  const sourceSentences = Array.isArray(extraction.source_sentences)
    ? extraction.source_sentences.join(',')
    : '';
  const values = Array.isArray(extraction.values)
    ? extraction.values
        .map((item) => `${item?.key || ''}:${item?.value || ''}`)
        .join('|')
    : '';

  return `${label}__${sourceSentences}__${values}`;
}

/**
 * @param {DataExtraction|null|undefined} extraction
 * @returns {string[]}
 */
export function getExtractionValues(extraction) {
  return (Array.isArray(extraction?.values) ? extraction.values : [])
    .map((item) => (typeof item?.value === 'string' ? item.value.trim() : ''))
    .filter(Boolean);
}

/**
 * @param {DataExtraction|null|undefined} extraction
 * @param {number} sentenceIndex
 * @returns {boolean}
 */
export function extractionIncludesSentence(extraction, sentenceIndex) {
  return Array.isArray(extraction?.source_sentences) && extraction.source_sentences.includes(sentenceIndex);
}

/**
 * @param {string} text
 * @param {string} needle
 * @returns {{ start: number, end: number }[]}
 */
function findCaseInsensitiveRanges(text, needle) {
  if (!text || !needle) {
    return [];
  }

  const haystack = text.toLocaleLowerCase();
  const normalizedNeedle = needle.toLocaleLowerCase();
  const ranges = [];
  let searchStart = 0;

  while (searchStart < haystack.length) {
    const foundAt = haystack.indexOf(normalizedNeedle, searchStart);
    if (foundAt === -1) {
      break;
    }

    ranges.push({ start: foundAt, end: foundAt + normalizedNeedle.length });
    searchStart = foundAt + 1;
  }

  return ranges;
}

/**
 * @param {{ start: number, end: number }[]} ranges
 * @returns {{ start: number, end: number }[]}
 */
function mergeRanges(ranges) {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return a.end - b.end;
  });

  const merged = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = merged[merged.length - 1];
    if (current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }

  return merged;
}

/**
 * @param {string} sentence
 * @param {DataExtraction|null|undefined} extraction
 * @returns {HighlightSegment[]}
 */
export function buildExtractionTextSegments(sentence, extraction) {
  if (!sentence) {
    return [];
  }

  const ranges = mergeRanges(
    getExtractionValues(extraction).flatMap((value) => findCaseInsensitiveRanges(sentence, value))
  );

  if (ranges.length === 0) {
    return [{ start: 0, end: sentence.length, text: sentence, highlighted: false }];
  }

  const segments = [];
  let cursor = 0;

  ranges.forEach((range) => {
    if (range.start > cursor) {
      segments.push({
        start: cursor,
        end: range.start,
        text: sentence.slice(cursor, range.start),
        highlighted: false,
      });
    }

    segments.push({
      start: range.start,
      end: range.end,
      text: sentence.slice(range.start, range.end),
      highlighted: true,
    });
    cursor = range.end;
  });

  if (cursor < sentence.length) {
    segments.push({
      start: cursor,
      end: sentence.length,
      text: sentence.slice(cursor),
      highlighted: false,
    });
  }

  return segments;
}
