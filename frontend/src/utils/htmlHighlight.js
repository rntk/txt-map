import { sanitizeHTML } from "./sanitize";

export function isInAnyRange(start, end, ranges) {
  return ranges.some((r) => start < r.end && end > r.start);
}

function buildTokenSpan(token, classes) {
  const { htmlWord, articleIndex, wordStart, wordEnd } = token;
  return `<span class="${classes.join(" ")}" data-article-index="${articleIndex}" data-char-start="${wordStart}" data-char-end="${wordEnd}">${htmlWord}</span>`;
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

function getTopicNamesToHighlight(selectedTopics, hoveredTopic) {
  const topicNamesToHighlight = new Set();

  if (Array.isArray(selectedTopics)) {
    selectedTopics.forEach((topic) => {
      if (topic?.name) {
        topicNamesToHighlight.add(topic.name);
      }
    });
  }

  if (hoveredTopic?.name) {
    topicNamesToHighlight.add(hoveredTopic.name);
  }

  return topicNamesToHighlight;
}

function getMarkerWords(markerSpans) {
  const markerWords = new Set();

  markerSpans.forEach((span) => {
    if (span?.text) {
      extractNormalizedWords(span.text).forEach((word) => {
        markerWords.add(word);
      });
    }
  });

  return markerWords;
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
  if (!Array.isArray(articleTopics) || articleTopics.length === 0) {
    return [];
  }

  const topicNamesToHighlight = getTopicNamesToHighlight(
    selectedTopics,
    hoveredTopic,
  );

  if (topicNamesToHighlight.size === 0) {
    return [];
  }

  return articleTopics.reduce((topicMarkerData, topic) => {
    if (!topicNamesToHighlight.has(topic.name)) {
      return topicMarkerData;
    }

    const markerSpans = topic.marker_spans;
    if (!Array.isArray(markerSpans) || markerSpans.length === 0) {
      return topicMarkerData;
    }

    const markerWords = getMarkerWords(markerSpans);

    if (markerWords.size > 0) {
      const ranges = Array.isArray(topic.ranges) ? topic.ranges : [];
      topicMarkerData.push({
        ranges,
        markerWords,
      });
    }

    return topicMarkerData;
  }, []);
}

function hasWordHighlight(htmlWord, highlightWords) {
  if (!Array.isArray(highlightWords) || highlightWords.length === 0) {
    return false;
  }

  const cleanWord = htmlWord.replace(/[^a-zA-ZÀ-ÿ0-9]/g, "").toLowerCase();
  return (
    cleanWord.length > 0 &&
    highlightWords.some((word) => word.toLowerCase() === cleanWord)
  );
}

function isTopicSummaryWord(wordStart, wordEnd, htmlWord, options) {
  const { topicMarkerData, summaryHighlightRanges } = options;
  const normalizedWord = normalizeWordForMatch(htmlWord);
  const hasMarkerMatch =
    normalizedWord.length > 0 &&
    Array.isArray(topicMarkerData) &&
    topicMarkerData.some(
      (topicData) =>
        topicData.markerWords.has(normalizedWord) &&
        isInAnyRange(wordStart, wordEnd, topicData.ranges),
    );

  return (
    hasMarkerMatch ||
    isInAnyRange(wordStart, wordEnd, summaryHighlightRanges || [])
  );
}

function getMatchingColoredClass(wordStart, wordEnd, coloredRanges) {
  if (!Array.isArray(coloredRanges) || coloredRanges.length === 0) {
    return null;
  }

  const matchingColoredRange = coloredRanges.find((range) =>
    isInAnyRange(wordStart, wordEnd, [range]),
  );
  return matchingColoredRange?.cssClass || null;
}

function getToneClass(wordStart, wordEnd, options) {
  const { highlightRanges = [], fadeRanges = [] } = options;

  if (isInAnyRange(wordStart, wordEnd, highlightRanges)) {
    return "highlighted";
  }

  if (isInAnyRange(wordStart, wordEnd, fadeRanges)) {
    return "faded";
  }

  return null;
}

function getOptionalRangeClasses(wordStart, wordEnd, options) {
  return [
    {
      className: options.interactiveClassName,
      ranges: options.interactiveRanges,
    },
    {
      className: options.dimmedClassName,
      ranges: options.dimmedRanges,
    },
  ]
    .filter(
      (entry) =>
        entry.className && isInAnyRange(wordStart, wordEnd, entry.ranges || []),
    )
    .map((entry) => entry.className);
}

function shouldWrapWord(token, options, classes, isSummaryWord) {
  const { wordStart, wordEnd } = token;
  return (
    isInAnyRange(wordStart, wordEnd, options.allTopicRanges || []) ||
    classes.includes("word-highlight") ||
    isSummaryWord
  );
}

function getAllTopicRanges(articleTopics) {
  return (Array.isArray(articleTopics) ? articleTopics : []).flatMap((topic) =>
    (Array.isArray(topic.ranges) ? topic.ranges : [])
      .map((range) => ({
        start: Number(range.start),
        end: Number(range.end),
      }))
      .filter(
        (range) => Number.isFinite(range.start) && Number.isFinite(range.end),
      ),
  );
}

function getArrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function getArrayOrNull(value) {
  return Array.isArray(value) ? value : null;
}

function normalizeHighlightOptions(articleTopics, options) {
  return {
    highlightRanges: getArrayOrEmpty(options.highlightRanges),
    fadeRanges: getArrayOrEmpty(options.fadeRanges),
    summaryHighlightRanges: getArrayOrEmpty(options.summaryHighlightRanges),
    allTopicRanges:
      getArrayOrEmpty(options.allTopicRanges).length > 0
        ? getArrayOrEmpty(options.allTopicRanges)
        : getAllTopicRanges(articleTopics),
    coloredRanges: getArrayOrEmpty(options.coloredRanges),
    interactiveRanges: getArrayOrEmpty(options.interactiveRanges),
    interactiveClassName: options.interactiveClassName || "",
    dimmedRanges: getArrayOrEmpty(options.dimmedRanges),
    dimmedClassName: options.dimmedClassName || "",
    highlightWords: getArrayOrEmpty(options.highlightWords),
    topicMarkerData: getArrayOrNull(options.topicMarkerData),
  };
}

function hasRenderableHighlights(options) {
  return !(
    options.allTopicRanges.length === 0 &&
    options.coloredRanges.length === 0 &&
    options.summaryHighlightRanges.length === 0 &&
    options.highlightWords.length === 0 &&
    (!options.topicMarkerData || options.topicMarkerData.length === 0)
  );
}

function flushWordBuffer(state, articleIndex, options) {
  if (!state.wordBuffer) {
    return { ...state, wordBuffer: "", wordStart: -1 };
  }

  return {
    ...state,
    result:
      state.result +
      wrapWord(state.wordBuffer, state.wordStart, articleIndex, options),
    wordBuffer: "",
    wordStart: -1,
  };
}

function tokenizeAndWrapHtml(rawHtml, articleIndex, options) {
  let state = {
    result: "",
    wordBuffer: "",
    wordStart: -1,
  };
  let inTag = false;

  for (let i = 0; i < rawHtml.length; i += 1) {
    const ch = rawHtml[i];

    if (inTag) {
      if (ch === ">") {
        inTag = false;
      }
      state.result += ch;
      continue;
    }

    if (ch === "<") {
      state = flushWordBuffer(state, articleIndex, options);
      inTag = true;
      state.result += ch;
      continue;
    }

    if (/\s/.test(ch)) {
      state = flushWordBuffer(state, articleIndex, options);
      state.result += ch;
      continue;
    }

    if (state.wordStart === -1) {
      state.wordStart = i;
    }
    state.wordBuffer += ch;
  }

  return flushWordBuffer(state, articleIndex, options).result;
}

function buildBaseClasses(token, highlightWords) {
  const classes = ["word-token"];
  if (hasWordHighlight(token.htmlWord, highlightWords)) {
    classes.push("word-highlight");
  }
  return classes;
}

function addSupplementalClasses(classes, token, options, isSummaryWord) {
  const toneClass = getToneClass(token.wordStart, token.wordEnd, options);
  if (isSummaryWord) {
    classes.push("reading-article__summary-word-highlight");
  }
  if (toneClass) {
    classes.push(toneClass);
  }

  classes.push(
    ...getOptionalRangeClasses(token.wordStart, token.wordEnd, options),
  );
}

function buildWrappedWordMarkup(token, options, classes, isSummaryWord) {
  const coloredClassName = getMatchingColoredClass(
    token.wordStart,
    token.wordEnd,
    options.coloredRanges,
  );
  if (coloredClassName) {
    return buildTokenSpan(token, [...classes, coloredClassName]);
  }

  if (!shouldWrapWord(token, options, classes, isSummaryWord)) {
    return token.htmlWord;
  }

  addSupplementalClasses(classes, token, options, isSummaryWord);
  return buildTokenSpan(token, classes);
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
  const wordEnd = wordStart + htmlWord.length;
  const token = { htmlWord, articleIndex, wordStart, wordEnd };
  const normalizedOptions = normalizeHighlightOptions([], options);
  const classes = buildBaseClasses(token, normalizedOptions.highlightWords);
  const isSummaryWord = isTopicSummaryWord(
    wordStart,
    wordEnd,
    htmlWord,
    normalizedOptions,
  );

  return buildWrappedWordMarkup(
    token,
    normalizedOptions,
    classes,
    isSummaryWord,
  );
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
export function buildHighlightedRawHtml(
  rawHtml,
  articleTopics,
  articleIndex,
  options = {},
) {
  if (!rawHtml) {
    return "";
  }

  const normalizedOptions = normalizeHighlightOptions(articleTopics, options);
  if (!hasRenderableHighlights(normalizedOptions)) {
    return sanitizeHTML(rawHtml);
  }

  return sanitizeHTML(
    tokenizeAndWrapHtml(rawHtml, articleIndex, normalizedOptions),
  );
}
