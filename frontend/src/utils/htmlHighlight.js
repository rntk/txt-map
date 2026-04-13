import { sanitizeHTML } from "./sanitize";

export function isInAnyRange(start, end, ranges) {
  return ranges.some((r) => start < r.end && end > r.start);
}

/**
 * @param {string} htmlWord
 * @param {number} wordStart
 * @param {number} articleIndex
 * @param {Array<{start: number, end: number}>} highlightRanges
 * @param {Array<{start: number, end: number}>} fadeRanges
 * @param {Array<{start: number, end: number}>} allTopicRanges
 * @param {Array<{start: number, end: number, cssClass: string}>} [coloredRanges]
 * @param {Array<{start: number, end: number}>} [interactiveRanges]
 * @param {string} [interactiveClassName]
 * @param {Array<{start: number, end: number}>} [dimmedRanges]
 * @param {string} [dimmedClassName]
 * @param {string[]} [highlightWords]
 */
export function wrapWord(
  htmlWord,
  wordStart,
  articleIndex,
  highlightRanges,
  fadeRanges,
  allTopicRanges,
  coloredRanges = [],
  interactiveRanges = [],
  interactiveClassName = "",
  dimmedRanges = [],
  dimmedClassName = "",
  highlightWords = [],
) {
  const wordEnd = wordStart + htmlWord.length;

  const classes = ["word-token"];

  // Word-based highlighting (URL param)
  if (Array.isArray(highlightWords) && highlightWords.length > 0) {
    const cleanWord = htmlWord.replace(/[^a-zA-ZÀ-ÿ0-9]/g, "").toLowerCase();
    if (
      cleanWord.length > 0 &&
      highlightWords.some((w) => w.toLowerCase() === cleanWord)
    ) {
      classes.push("word-highlight");
    }
  }

  if (coloredRanges.length > 0) {
    const matchingColored = coloredRanges.find(
      (r) => wordStart < r.end && wordEnd > r.start,
    );
    if (matchingColored) {
      classes.push(matchingColored.cssClass);
      return `<span class="${classes.join(" ")}" data-article-index="${articleIndex}" data-char-start="${wordStart}" data-char-end="${wordEnd}">${htmlWord}</span>`;
    }
  }

  if (
    isInAnyRange(wordStart, wordEnd, allTopicRanges) ||
    classes.includes("word-highlight")
  ) {
    if (isInAnyRange(wordStart, wordEnd, highlightRanges)) {
      classes.push("highlighted");
    } else if (isInAnyRange(wordStart, wordEnd, fadeRanges)) {
      classes.push("faded");
    }
    if (
      interactiveClassName &&
      isInAnyRange(wordStart, wordEnd, interactiveRanges)
    ) {
      classes.push(interactiveClassName);
    }
    if (dimmedClassName && isInAnyRange(wordStart, wordEnd, dimmedRanges)) {
      classes.push(dimmedClassName);
    }

    return `<span class="${classes.join(" ")}" data-article-index="${articleIndex}" data-char-start="${wordStart}" data-char-end="${wordEnd}">${htmlWord}</span>`;
  }

  return htmlWord;
}

/**
 * @param {string} rawHtml
 * @param {Array} articleTopics
 * @param {number} articleIndex
 * @param {Array<{start: number, end: number}>} highlightRanges
 * @param {Array<{start: number, end: number}>} fadeRanges
 * @param {Array<{start: number, end: number, color: string}>} [coloredRanges]
 * @param {Array<{start: number, end: number}>} [interactiveRanges]
 * @param {string} [interactiveClassName]
 * @param {Array<{start: number, end: number}>} [dimmedRanges]
 * @param {string} [dimmedClassName]
 * @param {string[]} [highlightWords]
 */
export function buildHighlightedRawHtml(
  rawHtml,
  articleTopics,
  articleIndex,
  highlightRanges,
  fadeRanges,
  coloredRanges = [],
  interactiveRanges = [],
  interactiveClassName = "",
  dimmedRanges = [],
  dimmedClassName = "",
  highlightWords = [],
) {
  if (!rawHtml) return "";

  const safeTopics = Array.isArray(articleTopics) ? articleTopics : [];
  const allTopicRanges = [];
  safeTopics.forEach((topic) => {
    (Array.isArray(topic.ranges) ? topic.ranges : []).forEach((range) => {
      const s = Number(range.start);
      const e = Number(range.end);
      if (Number.isFinite(s) && Number.isFinite(e)) {
        allTopicRanges.push({ start: s, end: e });
      }
    });
  });

  if (
    allTopicRanges.length === 0 &&
    coloredRanges.length === 0 &&
    highlightWords.length === 0
  ) {
    return sanitizeHTML(rawHtml);
  }

  let result = "";
  let inTag = false;
  let inQuote = false;
  let quoteChar = "";
  let wordBuffer = "";
  let wordStart = -1;

  for (let i = 0; i < rawHtml.length; i++) {
    const ch = rawHtml[i];

    if (inTag) {
      if (inQuote) {
        if (ch === quoteChar) inQuote = false;
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === ">") {
        inTag = false;
      }
      result += ch;
    } else if (ch === "<") {
      if (wordBuffer) {
        result += wrapWord(
          wordBuffer,
          wordStart,
          articleIndex,
          highlightRanges,
          fadeRanges,
          allTopicRanges,
          coloredRanges,
          interactiveRanges,
          interactiveClassName,
          dimmedRanges,
          dimmedClassName,
          highlightWords,
        );
        wordBuffer = "";
        wordStart = -1;
      }
      inTag = true;
      result += ch;
    } else {
      if (/\s/.test(ch)) {
        if (wordBuffer) {
          result += wrapWord(
            wordBuffer,
            wordStart,
            articleIndex,
            highlightRanges,
            fadeRanges,
            allTopicRanges,
            coloredRanges,
            interactiveRanges,
            interactiveClassName,
            dimmedRanges,
            dimmedClassName,
            highlightWords,
          );
          wordBuffer = "";
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
    result += wrapWord(
      wordBuffer,
      wordStart,
      articleIndex,
      highlightRanges,
      fadeRanges,
      allTopicRanges,
      coloredRanges,
      interactiveRanges,
      interactiveClassName,
      dimmedRanges,
      dimmedClassName,
      highlightWords,
    );
  }

  return sanitizeHTML(result);
}
