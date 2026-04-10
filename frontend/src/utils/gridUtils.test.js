import {
  buildHierarchy,
  buildTopicTagCloud,
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
});
