import {
  buildHierarchy,
  buildTopicTagCloud,
  buildTopicKeyPhrases,
  segmentIsLeaf,
  truncateWithEllipsis,
  getFirstScopedSentence,
  collectScopedSentences,
  buildArticleTfIdfIndex,
  buildTopTags,
  normalizeTagToken,
  isMeaningfulTagToken,
  collectTopicSentenceIndices,
  tokenizeSentence,
  COMMON_STOP_WORDS,
} from "./gridUtils";

const topics = [
  { name: "Science", sentences: [1, 2] },
  { name: "Science>Biology", sentences: [1] },
  { name: "Science>Physics", sentences: [2] },
  { name: "Art", sentences: [3] },
];

describe("buildHierarchy", () => {
  test("returns all top-level segments at root", () => {
    const hierarchy = buildHierarchy(topics, []);
    expect(hierarchy.has("Science")).toBe(true);
    expect(hierarchy.has("Art")).toBe(true);
  });

  test("returns children of a given path", () => {
    const hierarchy = buildHierarchy(topics, ["Science"]);
    expect(hierarchy.has("Biology")).toBe(true);
    expect(hierarchy.has("Physics")).toBe(true);
  });

  test("accumulates sentence counts", () => {
    const hierarchy = buildHierarchy(topics, []);
    const science = hierarchy.get("Science");
    expect(science.sentenceCount).toBeGreaterThan(0);
  });
});

describe("segmentIsLeaf", () => {
  test("returns true for a leaf segment", () => {
    expect(segmentIsLeaf(topics, ["Science"], "Biology")).toBe(true);
  });

  test("returns false for an intermediate segment", () => {
    expect(segmentIsLeaf(topics, [], "Science")).toBe(false);
  });

  test("returns false for unknown segment", () => {
    expect(segmentIsLeaf(topics, [], "Unknown")).toBe(false);
  });
});

describe("truncateWithEllipsis", () => {
  test("returns empty string for falsy input", () => {
    expect(truncateWithEllipsis(null, 50)).toBe("");
    expect(truncateWithEllipsis("", 50)).toBe("");
  });

  test("returns unchanged text when within limit", () => {
    expect(truncateWithEllipsis("hello", 10)).toBe("hello");
  });

  test("truncates long text with ellipsis", () => {
    const result = truncateWithEllipsis("hello world foo bar", 10);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(13); // 10 chars + '...'
  });

  test("normalizes extra whitespace", () => {
    expect(truncateWithEllipsis("hello   world", 20)).toBe("hello world");
  });
});

describe("collectScopedSentences", () => {
  const sentences = ["First sentence.", "Second sentence.", "Third sentence."];

  test("returns empty array when no sentences", () => {
    expect(collectScopedSentences([], [])).toEqual([]);
    expect(collectScopedSentences([{ sentences: [1] }], [])).toEqual([]);
  });

  test("resolves 1-based sentence indices", () => {
    const segmentTopics = [{ sentences: [1, 2] }];
    const result = collectScopedSentences(segmentTopics, sentences);
    expect(result).toContain("First sentence.");
    expect(result).toContain("Second sentence.");
  });

  test("deduplicates sentence indices", () => {
    const segmentTopics = [{ sentences: [1] }, { sentences: [1] }];
    const result = collectScopedSentences(segmentTopics, sentences);
    expect(result).toHaveLength(1);
  });
});

describe("getFirstScopedSentence", () => {
  const sentences = ["Alpha.", "Beta.", "Gamma."];

  test("returns first sentence for given topics", () => {
    const result = getFirstScopedSentence([{ sentences: [2] }], sentences);
    expect(result).toBe("Beta.");
  });

  test("returns empty string when no sentences match", () => {
    expect(getFirstScopedSentence([], sentences)).toBe("");
    expect(getFirstScopedSentence([{ sentences: [] }], sentences)).toBe("");
  });
});

describe("COMMON_STOP_WORDS", () => {
  test("contains expected stop words", () => {
    expect(COMMON_STOP_WORDS.has("the")).toBe(true);
    expect(COMMON_STOP_WORDS.has("and")).toBe(true);
    expect(COMMON_STOP_WORDS.has("is")).toBe(true);
  });

  test("does not contain content words", () => {
    expect(COMMON_STOP_WORDS.has("science")).toBe(false);
    expect(COMMON_STOP_WORDS.has("biology")).toBe(false);
  });
});

describe("buildTopicTagCloud", () => {
  test("ignores html entity fragments and keeps meaningful words", () => {
    const sentences = [
      "Alpha&nbsp;Beta keeps showing up.",
      "nbsp; should never become a tag.",
      "&amp; encoded values should decode to ampersands.",
      "Beta appears again with Alpha.",
    ];
    const topic = { name: "Science", sentences: [1, 2, 3, 4] };

    const tags = buildTopicTagCloud(
      topic,
      buildArticleTfIdfIndex(sentences),
      8,
    );
    const labels = tags.map((tag) => tag.label);

    expect(labels).toContain("alpha");
    expect(labels).toContain("beta");
    expect(labels).not.toContain("nbsp");
    expect(labels).not.toContain("amp");
  });

  test("returns only unigrams even when index contains bigrams", () => {
    const sentences = [
      "Machine learning drives modern artificial intelligence.",
      "Machine learning is widely used today.",
      "Other topics appear here.",
    ];
    const topic = { name: "ML", sentences: [1, 2] };
    const tags = buildTopicTagCloud(
      topic,
      buildArticleTfIdfIndex(sentences),
      10,
    );
    const labels = tags.map((tag) => tag.label);

    labels.forEach((label) => {
      expect(label).not.toContain(" ");
    });
  });
});

describe("buildArticleTfIdfIndex bigrams", () => {
  test("includes bigrams in sentenceTokens", () => {
    const sentences = [
      "Machine learning drives results.",
      "Other sentence here.",
    ];
    const index = buildArticleTfIdfIndex(sentences);

    const hasBigram = index.sentenceTokens[0].some((token) =>
      token.includes(" "),
    );
    expect(hasBigram).toBe(true);
  });

  test("bigrams appear in documentFrequencies", () => {
    const sentences = [
      "Machine learning drives results.",
      "Machine learning is everywhere.",
    ];
    const index = buildArticleTfIdfIndex(sentences);

    expect(index.documentFrequencies.has("machine learning")).toBe(true);
    expect(index.documentFrequencies.get("machine learning")).toBe(2);
  });

  test("does not produce bigrams from single-token sentences", () => {
    const sentences = ["Hello.", "World."];
    const index = buildArticleTfIdfIndex(sentences);

    const allTokens = index.sentenceTokens.flat();
    const bigrams = allTokens.filter((t) => t.includes(" "));
    expect(bigrams).toHaveLength(0);
  });
});

describe("buildTopicKeyPhrases", () => {
  const sentences = [
    "Machine learning algorithms process large datasets efficiently.",
    "Deep learning neural networks require significant computational power.",
    "Machine learning models generalize from training data.",
    "Unrelated topic about cooking recipes.",
  ];
  const topic = { name: "ML", sentences: [1, 2, 3] };

  test("returns phrases and representativeSentence", () => {
    const result = buildTopicKeyPhrases(
      topic,
      buildArticleTfIdfIndex(sentences),
      sentences,
    );

    expect(result).toHaveProperty("phrases");
    expect(result).toHaveProperty("representativeSentence");
    expect(Array.isArray(result.phrases)).toBe(true);
    expect(typeof result.representativeSentence).toBe("string");
  });

  test("includes bigrams in phrases", () => {
    const result = buildTopicKeyPhrases(
      topic,
      buildArticleTfIdfIndex(sentences),
      sentences,
    );
    const hasBigram = result.phrases.some((p) => p.isBigram);
    expect(hasBigram).toBe(true);
  });

  test("does not include a unigram that is part of a selected bigram", () => {
    const result = buildTopicKeyPhrases(
      topic,
      buildArticleTfIdfIndex(sentences),
      sentences,
      10,
    );
    const labels = result.phrases.map((p) => p.label);
    const bigramLabels = result.phrases
      .filter((p) => p.isBigram)
      .map((p) => p.label);

    bigramLabels.forEach((bigram) => {
      const parts = bigram.split(" ");
      parts.forEach((part) => {
        expect(labels).not.toContain(part);
      });
    });
  });

  test("returns empty result for topic with no matching sentences", () => {
    const emptyTopic = { name: "Empty", sentences: [] };
    const result = buildTopicKeyPhrases(
      emptyTopic,
      buildArticleTfIdfIndex(sentences),
      sentences,
    );

    expect(result.phrases).toHaveLength(0);
    expect(result.representativeSentence).toBe("");
  });

  test("handles single-sentence topic gracefully", () => {
    const singleTopic = { name: "Single", sentences: [4] };
    const result = buildTopicKeyPhrases(
      singleTopic,
      buildArticleTfIdfIndex(sentences),
      sentences,
    );

    expect(result.phrases.length).toBeGreaterThan(0);
    expect(result.representativeSentence).toBe(sentences[3]);
  });

  test("truncates long representative sentences to 120 chars with ellipsis", () => {
    const longSentences = [
      "This is a very long sentence that exceeds one hundred and twenty characters in total length and should be truncated properly by the function.",
      "Short sentence.",
    ];
    const longTopic = { name: "Long", sentences: [1] };
    const result = buildTopicKeyPhrases(
      longTopic,
      buildArticleTfIdfIndex(longSentences),
      longSentences,
    );

    expect(result.representativeSentence.length).toBeLessThanOrEqual(121);
    expect(result.representativeSentence.endsWith("…")).toBe(true);
  });

  test("each phrase has a valid sizeClass", () => {
    const result = buildTopicKeyPhrases(
      topic,
      buildArticleTfIdfIndex(sentences),
      sentences,
    );
    const validSizes = new Set(["sm", "md", "lg", "xl"]);
    result.phrases.forEach((phrase) => {
      expect(validSizes.has(phrase.sizeClass)).toBe(true);
    });
  });
});

describe("normalizeTagToken", () => {
  it("lowercases the word", () => {
    expect(normalizeTagToken("Hello")).toBe("hello");
  });

  it("trims leading/trailing hyphens and apostrophes", () => {
    expect(normalizeTagToken("'hello-")).toBe("hello");
  });

  it("removes leading & and trailing ;", () => {
    expect(normalizeTagToken("&amp;")).toBe("amp");
  });

  it("trims whitespace", () => {
    expect(normalizeTagToken("  word  ")).toBe("word");
  });

  it("returns empty string for null", () => {
    expect(normalizeTagToken(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeTagToken(undefined)).toBe("");
  });
});

describe("isMeaningfulTagToken", () => {
  it("returns false for empty string", () => {
    expect(isMeaningfulTagToken("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isMeaningfulTagToken(null)).toBe(false);
  });

  it("returns false for stop words", () => {
    expect(isMeaningfulTagToken("the")).toBe(false);
    expect(isMeaningfulTagToken("and")).toBe(false);
  });

  it("returns false for HTML entity fragments", () => {
    expect(isMeaningfulTagToken("nbsp")).toBe(false);
    expect(isMeaningfulTagToken("amp")).toBe(false);
    expect(isMeaningfulTagToken("lt")).toBe(false);
  });

  it("returns false for pure numbers", () => {
    expect(isMeaningfulTagToken("123")).toBe(false);
  });

  it("returns false for short ASCII tokens (< 3 chars)", () => {
    expect(isMeaningfulTagToken("ab")).toBe(false);
  });

  it("returns true for meaningful words of 3+ chars", () => {
    expect(isMeaningfulTagToken("science")).toBe(true);
    expect(isMeaningfulTagToken("machine")).toBe(true);
  });

  it("returns true for 2-char non-ASCII tokens", () => {
    expect(isMeaningfulTagToken("日本")).toBe(true);
  });
});

describe("collectTopicSentenceIndices", () => {
  const sentences = ["s0", "s1", "s2", "s3", "s4"];

  it("returns empty array for null sentences", () => {
    expect(collectTopicSentenceIndices({}, null)).toEqual([]);
  });

  it("returns empty array for empty sentences", () => {
    expect(collectTopicSentenceIndices({}, [])).toEqual([]);
  });

  it("resolves 1-based sentence indices", () => {
    const topic = { sentences: [1, 3] };
    expect(collectTopicSentenceIndices(topic, sentences)).toEqual([0, 2]);
  });

  it("resolves from ranges with 1-based indices", () => {
    const topic = {
      ranges: [{ sentence_start: 1, sentence_end: 3 }],
    };
    expect(collectTopicSentenceIndices(topic, sentences)).toEqual([0, 1, 2]);
  });

  it("falls back to 0-based when 1-based yields no results", () => {
    const topic = { sentences: [0] };
    expect(collectTopicSentenceIndices(topic, sentences)).toEqual([0]);
  });

  it("deduplicates indices", () => {
    const topic = { sentences: [1, 1, 2] };
    expect(collectTopicSentenceIndices(topic, sentences)).toEqual([0, 1]);
  });

  it("ignores out-of-range indices", () => {
    const topic = { sentences: [1, 100] };
    expect(collectTopicSentenceIndices(topic, sentences)).toEqual([0]);
  });

  it("ignores non-integer values", () => {
    const topic = { sentences: [1.5, 2] };
    expect(collectTopicSentenceIndices(topic, sentences)).toEqual([1]);
  });

  it("returns sorted indices", () => {
    const topic = { sentences: [3, 1] };
    expect(collectTopicSentenceIndices(topic, sentences)).toEqual([0, 2]);
  });

  it("handles topic without sentences or ranges", () => {
    expect(collectTopicSentenceIndices({}, sentences)).toEqual([]);
  });
});

describe("tokenizeSentence", () => {
  it("tokenizes a simple sentence", () => {
    const tokens = tokenizeSentence("Hello world");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
  });

  it("returns empty array for empty string", () => {
    expect(tokenizeSentence("")).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(tokenizeSentence(null)).toEqual([]);
  });

  it("handles HTML entities", () => {
    const tokens = tokenizeSentence("hello&nbsp;world");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
  });
});

describe("buildTopTags", () => {
  const sentences = [
    "Machine learning algorithms are powerful.",
    "Machine learning is widely adopted.",
    "Deep learning networks are complex.",
  ];

  it("returns tags sorted by frequency", () => {
    const segmentTopics = [{ sentences: [1, 2, 3] }];
    const tags = buildTopTags(segmentTopics, sentences);
    expect(tags.length).toBeGreaterThan(0);
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i - 1].count).toBeGreaterThanOrEqual(tags[i].count);
    }
  });

  it("returns tags with label, count, and fontSize", () => {
    const segmentTopics = [{ sentences: [1, 2] }];
    const tags = buildTopTags(segmentTopics, sentences);
    tags.forEach((tag) => {
      expect(tag).toHaveProperty("label");
      expect(tag).toHaveProperty("count");
      expect(tag).toHaveProperty("fontSize");
    });
  });

  it("assigns font sizes between 11 and 22", () => {
    const segmentTopics = [{ sentences: [1, 2, 3] }];
    const tags = buildTopTags(segmentTopics, sentences);
    tags.forEach((tag) => {
      expect(tag.fontSize).toBeGreaterThanOrEqual(11);
      expect(tag.fontSize).toBeLessThanOrEqual(22);
    });
  });

  it("excludes stop words", () => {
    const segmentTopics = [{ sentences: [1, 2, 3] }];
    const tags = buildTopTags(segmentTopics, sentences);
    const labels = tags.map((t) => t.label.toLowerCase());
    expect(labels).not.toContain("are");
    expect(labels).not.toContain("is");
  });

  it("returns empty array for no sentences", () => {
    expect(buildTopTags([{ sentences: [] }], [])).toEqual([]);
  });

  it("returns empty array for empty topics", () => {
    expect(buildTopTags([], sentences)).toEqual([]);
  });

  it("respects the limit parameter", () => {
    const segmentTopics = [{ sentences: [1, 2, 3] }];
    const tags = buildTopTags(segmentTopics, sentences, 2);
    expect(tags.length).toBeLessThanOrEqual(2);
  });
});

describe("buildHierarchy exact sentence counts", () => {
  it("accumulates exact sentence counts for matching topics", () => {
    const localTopics = [
      { name: "A", sentences: [1, 2] },
      { name: "A>B", sentences: [3] },
      { name: "A>C", sentences: [4, 5] },
    ];
    const rootHierarchy = buildHierarchy(localTopics, []);
    expect(rootHierarchy.get("A").sentenceCount).toBe(5);

    const childHierarchy = buildHierarchy(localTopics, ["A"]);
    expect(childHierarchy.get("B").sentenceCount).toBe(1);
    expect(childHierarchy.get("C").sentenceCount).toBe(2);
  });

  it("filters topics by prefix", () => {
    const localTopics = [
      { name: "Alpha>Beta", sentences: [1] },
      { name: "Gamma>Delta", sentences: [2] },
    ];
    const hierarchy = buildHierarchy(localTopics, ["Alpha"]);
    expect(hierarchy.has("Beta")).toBe(true);
    expect(hierarchy.has("Gamma")).toBe(false);
  });
});

describe("buildArticleTfIdfIndex edge cases", () => {
  it("handles empty array input", () => {
    const index = buildArticleTfIdfIndex([]);
    expect(index.sentenceTokens).toEqual([]);
    expect(index.totalSentenceCount).toBe(1);
  });

  it("handles null input", () => {
    const index = buildArticleTfIdfIndex(null);
    expect(index.sentenceTokens).toEqual([]);
  });

  it("computes documentFrequencies correctly", () => {
    const index = buildArticleTfIdfIndex(["hello world", "hello again"]);
    expect(index.documentFrequencies.get("hello")).toBe(2);
    expect(index.documentFrequencies.get("world")).toBe(1);
  });
});
