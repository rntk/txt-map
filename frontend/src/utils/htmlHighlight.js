import { sanitizeHTML } from "./sanitize";

export function isInAnyRange(start, end, ranges) {
  return ranges.some((r) => start < r.end && end > r.start);
}

/**
 * Normalize a word for comparison by removing punctuation and lowercasing
 * @param {string} word
 * @returns {string}
 */
function normalizeWordForMatch(word) {
  if (!word || typeof word !== "string") return "";
  // Remove punctuation and normalize whitespace, but keep letters, numbers, and internal hyphens/apostrophes
  return word
    .replace(/[^\p{L}\p{N}\-']/gu, "") // Remove all non-letter, non-number, non-hyphen, non-apostrophe chars
    .toLowerCase()
    .trim();
}

/**
 * Split a marker span text into normalized words for token-based matching.
 * @param {string} text
 * @returns {string[]}
 */
function extractNormalizedWords(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  return text
    .split(/\s+/)
    .map((word) => normalizeWordForMatch(word))
    .filter(Boolean);
}

/**
 * Build topic-specific marker word data for highlighting
 * Each entry contains the topic's ranges and its marker words
 * @param {Array} articleTopics - Topics with marker_spans and ranges
 * @param {Array} selectedTopics - Currently selected topics
 * @param {{ name: string }|null} hoveredTopic - Hovered topic
 * @returns {Array<{ranges: Array<{start: number, end: number}>, markerWords: Set<string>}>} - Topic-specific marker data
 */
export function buildTopicMarkerData(
  articleTopics,
  selectedTopics,
  hoveredTopic,
) {
  const topicMarkerData = [];

  if (!Array.isArray(articleTopics) || articleTopics.length === 0) {
    return topicMarkerData;
  }

  // Determine which topics should have their markers highlighted
  const topicNamesToHighlight = new Set();

  if (Array.isArray(selectedTopics)) {
    selectedTopics.forEach((t) => {
      if (t?.name) topicNamesToHighlight.add(t.name);
    });
  }

  if (hoveredTopic?.name) {
    topicNamesToHighlight.add(hoveredTopic.name);
  }

  if (topicNamesToHighlight.size === 0) {
    return topicMarkerData;
  }

  // Extract marker words and ranges from matching topics
  articleTopics.forEach((topic) => {
    if (!topicNamesToHighlight.has(topic.name)) {
      return;
    }

    const markerSpans = topic.marker_spans;
    if (!Array.isArray(markerSpans) || markerSpans.length === 0) {
      return;
    }

    const markerWords = new Set();
    markerSpans.forEach((span) => {
      if (span?.text) {
        extractNormalizedWords(span.text).forEach((word) => {
          markerWords.add(word);
        });
      }
    });

    if (markerWords.size > 0) {
      // Get the topic's ranges - use the processed ranges from useTextPageData
      const ranges = Array.isArray(topic.ranges) ? topic.ranges : [];
      topicMarkerData.push({
        ranges,
        markerWords,
      });
    }
  });

  return topicMarkerData;
}

/**
 * @param {string} htmlWord
 * @param {number} wordStart
 * @param {number} articleIndex
 * @param {object} [options]
 * @param {Array<{start: number, end: number}>} [options.highlightRanges]
 * @param {Array<{start: number, end: number}>} [options.fadeRanges]
 * @param {Array<{start: number, end: number}>} [options.summaryHighlightRanges]
 * @param {Array<{start: number, end: number}>} [options.allTopicRanges]
 * @param {Array<{start: number, end: number, cssClass: string}>} [options.coloredRanges]
 * @param {Array<{start: number, end: number}>} [options.interactiveRanges]
 * @param {string} [options.interactiveClassName]
 * @param {Array<{start: number, end: number}>} [options.dimmedRanges]
 * @param {string} [options.dimmedClassName]
 * @param {string[]} [options.highlightWords]
 * @param {Array<{ranges: Array<{start: number, end: number}>, markerWords: Set<string>}>} [options.topicMarkerData]
 */
export function wrapWord(htmlWord, wordStart, articleIndex, options = {}) {
  const {
    highlightRanges = [],
    fadeRanges = [],
    summaryHighlightRanges = [],
    allTopicRanges = [],
    coloredRanges = [],
    interactiveRanges = [],
    interactiveClassName = "",
    dimmedRanges = [],
    dimmedClassName = "",
    highlightWords = [],
    topicMarkerData = null,
  } = options;
  const wordEnd = wordStart + htmlWord.length;

  const classes = ["word-token"];
  let isSummaryWord = false;

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

  // Marker word highlighting (from topic_marker_summaries) - topic-specific
  if (Array.isArray(topicMarkerData) && topicMarkerData.length > 0) {
    const normalizedWord = normalizeWordForMatch(htmlWord);
    if (normalizedWord.length > 0) {
      // Check if word matches a marker word AND is within that topic's ranges
      for (const topicData of topicMarkerData) {
        if (
          topicData.markerWords.has(normalizedWord) &&
          isInAnyRange(wordStart, wordEnd, topicData.ranges)
        ) {
          isSummaryWord = true;
          break;
        }
      }
    }
  }

  // Fallback: also check using character ranges for backward compatibility
  if (
    !isSummaryWord &&
    isInAnyRange(wordStart, wordEnd, summaryHighlightRanges)
  ) {
    isSummaryWord = true;
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
    classes.includes("word-highlight") ||
    isSummaryWord
  ) {
    if (isSummaryWord) {
      classes.push("reading-article__summary-word-highlight");
    }
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
 * @param {object} [options]
 * @param {Array<{start: number, end: number}>} [options.highlightRanges]
 * @param {Array<{start: number, end: number}>} [options.fadeRanges]
 * @param {Array<{start: number, end: number}>} [options.summaryHighlightRanges]
 * @param {Array<{start: number, end: number, cssClass: string}>} [options.coloredRanges]
 * @param {Array<{start: number, end: number}>} [options.interactiveRanges]
 * @param {string} [options.interactiveClassName]
 * @param {Array<{start: number, end: number}>} [options.dimmedRanges]
 * @param {string} [options.dimmedClassName]
 * @param {string[]} [options.highlightWords]
 * @param {Array<{ranges: Array<{start: number, end: number}>, markerWords: Set<string>}>} [options.topicMarkerData]
 */
export function buildHighlightedRawHtml(rawHtml, articleTopics, articleIndex, options = {}) {
  const {
    highlightRanges = [],
    fadeRanges = [],
    summaryHighlightRanges = [],
    coloredRanges = [],
    interactiveRanges = [],
    interactiveClassName = "",
    dimmedRanges = [],
    dimmedClassName = "",
    highlightWords = [],
    topicMarkerData = null,
  } = options;

  if (!rawHtml) return "";
  const safeSummaryHighlightRanges = Array.isArray(summaryHighlightRanges)
    ? summaryHighlightRanges
    : [];
  const safeHighlightWords = Array.isArray(highlightWords)
    ? highlightWords
    : [];
  const safeTopicMarkerData = Array.isArray(topicMarkerData)
    ? topicMarkerData
    : null;

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
    safeSummaryHighlightRanges.length === 0 &&
    safeHighlightWords.length === 0 &&
    (!safeTopicMarkerData || safeTopicMarkerData.length === 0)
  ) {
    return sanitizeHTML(rawHtml);
  }

  const wordRanges = {
    highlightRanges,
    fadeRanges,
    summaryHighlightRanges: safeSummaryHighlightRanges,
    allTopicRanges,
    coloredRanges,
    interactiveRanges,
    interactiveClassName,
    dimmedRanges,
    dimmedClassName,
    highlightWords: safeHighlightWords,
    topicMarkerData: safeTopicMarkerData,
  };

  let result = "";
  let inTag = false;
  let wordBuffer = "";
  let wordStart = -1;

  for (let i = 0; i < rawHtml.length; i++) {
    const ch = rawHtml[i];

    if (inTag) {
      if (ch === ">") {
        inTag = false;
      }
      result += ch;
    } else if (ch === "<") {
      if (wordBuffer) {
        result += wrapWord(wordBuffer, wordStart, articleIndex, wordRanges);
        wordBuffer = "";
        wordStart = -1;
      }
      inTag = true;
      result += ch;
    } else {
      if (/\s/.test(ch)) {
        if (wordBuffer) {
          result += wrapWord(wordBuffer, wordStart, articleIndex, wordRanges);
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
    result += wrapWord(wordBuffer, wordStart, articleIndex, wordRanges);
  }

  return sanitizeHTML(result);
}
