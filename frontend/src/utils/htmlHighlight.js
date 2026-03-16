import { sanitizeHTML } from './sanitize';

export function isInAnyRange(start, end, ranges) {
  return ranges.some(r => start < r.end && end > r.start);
}

export function wrapWord(htmlWord, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges) {
  const wordEnd = wordStart + htmlWord.length;

  if (!isInAnyRange(wordStart, wordEnd, allTopicRanges)) {
    return htmlWord;
  }

  const classes = ['word-token'];
  if (isInAnyRange(wordStart, wordEnd, highlightRanges)) {
    classes.push('highlighted');
  } else if (isInAnyRange(wordStart, wordEnd, fadeRanges)) {
    classes.push('faded');
  }

  return `<span class="${classes.join(' ')}" data-article-index="${articleIndex}" data-char-start="${wordStart}" data-char-end="${wordEnd}">${htmlWord}</span>`;
}

export function buildHighlightedRawHtml(rawHtml, articleTopics, articleIndex, highlightRanges, fadeRanges) {
  if (!rawHtml) return '';

  const safeTopics = Array.isArray(articleTopics) ? articleTopics : [];
  const allTopicRanges = [];
  safeTopics.forEach(topic => {
    (Array.isArray(topic.ranges) ? topic.ranges : []).forEach(range => {
      const s = Number(range.start);
      const e = Number(range.end);
      if (Number.isFinite(s) && Number.isFinite(e)) {
        allTopicRanges.push({ start: s, end: e });
      }
    });
  });

  if (allTopicRanges.length === 0) {
    return sanitizeHTML(rawHtml);
  }

  let result = '';
  let inTag = false;
  let inQuote = false;
  let quoteChar = '';
  let wordBuffer = '';
  let wordStart = -1;

  for (let i = 0; i < rawHtml.length; i++) {
    const ch = rawHtml[i];

    if (inTag) {
      if (inQuote) {
        if (ch === quoteChar) inQuote = false;
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === '>') {
        inTag = false;
      }
      result += ch;
    } else if (ch === '<') {
      if (wordBuffer) {
        result += wrapWord(wordBuffer, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges);
        wordBuffer = '';
        wordStart = -1;
      }
      inTag = true;
      result += ch;
    } else {
      if (/\s/.test(ch)) {
        if (wordBuffer) {
          result += wrapWord(wordBuffer, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges);
          wordBuffer = '';
          wordStart = -1;
        }
        result += ch;
      } else {
        if (wordStart === -1) wordStart = i;
        wordBuffer += ch;
      }
    }
  }

  if (wordBuffer) {
    result += wrapWord(wordBuffer, wordStart, articleIndex, highlightRanges, fadeRanges, allTopicRanges);
  }

  return sanitizeHTML(result);
}
