export const COMMON_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "hers",
  "him",
  "his",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "ours",
  "she",
  "so",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "they",
  "this",
  "those",
  "to",
  "too",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your",
  "yours",
]);

export const buildHierarchy = (topics, path) => {
  const prefix = path.length > 0 ? path.join(">") + ">" : "";
  const matching = topics.filter(
    (t) => path.length === 0 || t.name.startsWith(prefix),
  );
  const nextSegments = new Map();
  matching.forEach((topic) => {
    const rest =
      path.length === 0 ? topic.name : topic.name.slice(prefix.length);
    const segment = rest.split(">")[0]?.trim();
    if (!segment) return;
    if (!nextSegments.has(segment)) {
      nextSegments.set(segment, { topics: [], sentenceCount: 0 });
    }
    const entry = nextSegments.get(segment);
    entry.topics.push(topic);
    entry.sentenceCount += topic.sentences?.length || 0;
  });
  return nextSegments;
};

export const segmentIsLeaf = (topics, currentPath, segment) => {
  const fullPath =
    currentPath.length > 0 ? [...currentPath, segment].join(">") : segment;
  const exactMatch = topics.some((t) => t.name === fullPath);
  const hasChildren = topics.some((t) => t.name.startsWith(fullPath + ">"));
  return exactMatch && !hasChildren;
};

export const tokenizeSentence = (sentence) => {
  const text = String(sentence || "").toLowerCase();
  if (!text) return [];

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return Array.from(segmenter.segment(text))
      .filter((part) => part.isWordLike)
      .map((part) => part.segment.replace(/^['-]+|['-]+$/g, ""))
      .filter(Boolean);
  }

  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
};

export const normalizeTagToken = (word) =>
  String(word || "")
    .toLowerCase()
    .replace(/^['-]+|['-]+$/g, "")
    .trim();

export const isMeaningfulTagToken = (token) => {
  if (!token) return false;
  if (COMMON_STOP_WORDS.has(token)) return false;
  if (/^\d+$/u.test(token)) return false;

  const isAsciiToken = /^[a-z0-9]+$/i.test(token);
  if (isAsciiToken && token.length < 3) return false;

  return token.length >= 2;
};

/**
 * @param {Object} topic
 * @param {Array<string>} allSentences
 * @returns {number[]}
 */
export const collectTopicSentenceIndices = (topic, allSentences) => {
  const sentenceCount = allSentences?.length || 0;
  if (sentenceCount === 0) return [];

  const seen = new Set();
  const ranges = Array.isArray(topic?.ranges) ? topic.ranges : [];

  const resolveIndices = (assumeZeroBased) => {
    /** @type {number[]} */
    const indices = [];

    if (ranges.length > 0) {
      ranges.forEach((range) => {
        const startValue = Number(range?.sentence_start);
        const endValue = Number(range?.sentence_end);
        if (!Number.isInteger(startValue) || !Number.isInteger(endValue)) {
          return;
        }
        const startIndex = assumeZeroBased ? startValue : startValue - 1;
        const endIndex = assumeZeroBased ? endValue : endValue - 1;
        for (
          let sentenceIndex = startIndex;
          sentenceIndex <= endIndex;
          sentenceIndex += 1
        ) {
          if (sentenceIndex < 0 || sentenceIndex >= sentenceCount) {
            continue;
          }
          if (seen.has(sentenceIndex)) {
            continue;
          }
          seen.add(sentenceIndex);
          indices.push(sentenceIndex);
        }
      });
      return indices;
    }

    (topic?.sentences || []).forEach((idx) => {
      const value = Number(idx);
      if (!Number.isInteger(value)) return;
      const sentenceIndex = assumeZeroBased ? value : value - 1;
      if (sentenceIndex < 0 || sentenceIndex >= sentenceCount) return;
      if (seen.has(sentenceIndex)) return;
      seen.add(sentenceIndex);
      indices.push(sentenceIndex);
    });

    return indices;
  };

  const oneBasedIndices = resolveIndices(false);
  if (oneBasedIndices.length > 0) {
    return oneBasedIndices.sort((left, right) => left - right);
  }

  seen.clear();
  return resolveIndices(true).sort((left, right) => left - right);
};

export const collectScopedSentences = (segmentTopics, allSentences) => {
  const sentenceCount = allSentences?.length || 0;
  if (sentenceCount === 0) return [];

  const indices = new Set();
  segmentTopics.forEach((topic) => {
    collectTopicSentenceIndices(topic, allSentences).forEach(
      (sentenceIndex) => {
        indices.add(sentenceIndex);
      },
    );
  });

  return Array.from(indices)
    .sort((left, right) => left - right)
    .map((sentenceIndex) => allSentences[sentenceIndex])
    .filter(Boolean);
};

/**
 * @param {Array<string>} allSentences
 * @returns {{
 *   sentenceTokens: string[][],
 *   documentFrequencies: Map<string, number>,
 *   totalSentenceCount: number,
 * }}
 */
export const buildArticleTfIdfIndex = (allSentences) => {
  const sentenceTokens = (Array.isArray(allSentences) ? allSentences : []).map(
    (sentence) => {
      const normalizedTokens = tokenizeSentence(sentence)
        .map(normalizeTagToken)
        .filter(Boolean);
      const meaningfulTokens = normalizedTokens.filter(isMeaningfulTagToken);

      return meaningfulTokens.length > 0 ? meaningfulTokens : normalizedTokens;
    },
  );
  const documentFrequencies = new Map();

  sentenceTokens.forEach((tokens) => {
    new Set(tokens).forEach((token) => {
      documentFrequencies.set(token, (documentFrequencies.get(token) || 0) + 1);
    });
  });

  return {
    sentenceTokens,
    documentFrequencies,
    totalSentenceCount: Math.max(sentenceTokens.length, 1),
  };
};

const topicTagSizeClassForScore = (score, minScore, maxScore) => {
  if (maxScore <= minScore) {
    return "md";
  }

  const ratio = (score - minScore) / (maxScore - minScore);
  if (ratio >= 0.78) return "xl";
  if (ratio >= 0.52) return "lg";
  if (ratio >= 0.26) return "md";
  return "sm";
};

/**
 * @param {Object} topic
 * @param {{
 *   sentenceTokens: string[][],
 *   documentFrequencies: Map<string, number>,
 *   totalSentenceCount: number,
 * }} articleTfIdfIndex
 * @param {number} [limit]
 * @returns {Array<{ label: string, count: number, score: number, sizeClass: string }>}
 */
export const buildTopicTagCloud = (topic, articleTfIdfIndex, limit = 6) => {
  if (!topic || !articleTfIdfIndex) {
    return [];
  }

  const { sentenceTokens, documentFrequencies, totalSentenceCount } =
    articleTfIdfIndex;
  const topicSentenceIndices = collectTopicSentenceIndices(
    topic,
    sentenceTokens,
  );
  if (topicSentenceIndices.length === 0) {
    return [];
  }

  const termFrequencies = new Map();
  const topicCoverage = new Map();

  topicSentenceIndices.forEach((sentenceIndex) => {
    const tokens = sentenceTokens[sentenceIndex] || [];
    const uniqueTokens = new Set();

    tokens.forEach((token) => {
      termFrequencies.set(token, (termFrequencies.get(token) || 0) + 1);
      uniqueTokens.add(token);
    });

    uniqueTokens.forEach((token) => {
      topicCoverage.set(token, (topicCoverage.get(token) || 0) + 1);
    });
  });

  const rankedTags = Array.from(termFrequencies.entries())
    .map(([label, count]) => {
      const documentFrequency = documentFrequencies.get(label) || 1;
      const idf =
        Math.log((1 + totalSentenceCount) / (1 + documentFrequency)) + 1;

      return {
        label,
        count,
        score: count * idf,
        idf,
        coverage: topicCoverage.get(label) || 0,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.coverage - left.coverage ||
        right.count - left.count ||
        left.label.localeCompare(right.label),
    );

  const meaningfulRankedTags = rankedTags.filter((tag) => tag.idf >= 1.15);
  const chosenTags =
    meaningfulRankedTags.length > 0 ? meaningfulRankedTags : rankedTags;
  const topTags = chosenTags.slice(0, limit);

  if (topTags.length === 0) {
    return [];
  }

  const scores = topTags.map((tag) => tag.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  return topTags.map((tag) => ({
    label: tag.label,
    count: tag.count,
    score: tag.score,
    sizeClass: topicTagSizeClassForScore(tag.score, minScore, maxScore),
  }));
};

export const buildTopTags = (segmentTopics, allSentences, limit = 20) => {
  const frequencies = new Map();
  const scopedSentences = collectScopedSentences(segmentTopics, allSentences);

  scopedSentences.forEach((sentence) => {
    const words = tokenizeSentence(sentence);
    words.forEach((word) => {
      const normalized = word.replace(/^'+|'+$/g, "");
      const isAsciiToken = /^[a-z0-9]+$/i.test(normalized);
      if (isAsciiToken && normalized.length < 2) return;
      if (COMMON_STOP_WORDS.has(normalized)) return;
      frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
    });
  });

  if (frequencies.size === 0 && scopedSentences.length > 0) {
    scopedSentences.forEach((sentence) => {
      tokenizeSentence(sentence).forEach((word) => {
        const normalized = word.replace(/^'+|'+$/g, "");
        if (!normalized) return;
        frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
      });
    });
  }

  const topTags = Array.from(frequencies.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);

  if (topTags.length === 0) return [];

  const minFrequency = topTags[topTags.length - 1][1];
  const maxFrequency = topTags[0][1];
  const minFontSize = 11;
  const maxFontSize = 22;

  return topTags.map(([label, count]) => {
    const ratio =
      maxFrequency === minFrequency
        ? 0.5
        : (count - minFrequency) / (maxFrequency - minFrequency);
    const fontSize = minFontSize + ratio * (maxFontSize - minFontSize);
    return { label, count, fontSize };
  });
};

export const truncateWithEllipsis = (text, maxChars) => {
  if (!text) return "";
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars).trimEnd() + "...";
};

export const getFirstScopedSentence = (segmentTopics, sentences) => {
  const scopedSentences = collectScopedSentences(segmentTopics, sentences);
  return scopedSentences[0] || "";
};
