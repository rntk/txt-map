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

export const collectScopedSentences = (segmentTopics, allSentences) => {
  const sentenceCount = allSentences?.length || 0;
  if (sentenceCount === 0) return [];

  const rawIndices = [];
  segmentTopics.forEach((topic) => {
    (topic.sentences || []).forEach((idx) => {
      const num = Number(idx);
      if (Number.isInteger(num)) rawIndices.push(num);
    });
  });

  if (rawIndices.length === 0) return [];

  const resolveByMode = (assumeZeroBased) => {
    const texts = [];
    const seen = new Set();
    rawIndices.forEach((idx) => {
      const zeroBasedIdx = assumeZeroBased ? idx : idx - 1;
      if (zeroBasedIdx < 0 || zeroBasedIdx >= sentenceCount) return;
      if (seen.has(zeroBasedIdx)) return;
      seen.add(zeroBasedIdx);
      const sentence = allSentences[zeroBasedIdx];
      if (sentence) texts.push(sentence);
    });
    return texts;
  };

  const oneBased = resolveByMode(false);
  return oneBased.length > 0 ? oneBased : resolveByMode(true);
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
