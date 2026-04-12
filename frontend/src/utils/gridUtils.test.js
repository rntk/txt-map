import {
  buildHierarchy,
  buildTopicTagCloud,
  buildTopicKeyPhrases,
  segmentIsLeaf,
  truncateWithEllipsis,
  getFirstScopedSentence,
  collectScopedSentences,
  buildArticleTfIdfIndex,
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
    const tags = buildTopicTagCloud(topic, buildArticleTfIdfIndex(sentences), 10);
    const labels = tags.map((tag) => tag.label);

    labels.forEach((label) => {
      expect(label).not.toContain(" ");
    });
  });
});

describe("buildArticleTfIdfIndex bigrams", () => {
  test("includes bigrams in sentenceTokens", () => {
    const sentences = ["Machine learning drives results.", "Other sentence here."];
    const index = buildArticleTfIdfIndex(sentences);

    const hasBigram = index.sentenceTokens[0].some((token) =>
      token.includes(" "),
    );
    expect(hasBigram).toBe(true);
  });

  test("bigrams appear in documentFrequencies", () => {
    const sentences = ["Machine learning drives results.", "Machine learning is everywhere."];
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
