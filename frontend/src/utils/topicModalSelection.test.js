import { describe, expect, it } from "vitest";
import {
  getTopicSelectionCanonicalTopicNames,
  resolveCanonicalTopics,
  buildTopicModalSelection,
  buildModalSelectionFromTopic,
  buildModalSelectionFromTopicGroup,
  buildModalSelectionFromSummarySource,
  buildModalSelectionFromKeyword,
} from "./topicModalSelection";

describe("getTopicSelectionCanonicalTopicNames", () => {
  it("returns empty array for null selection", () => {
    expect(getTopicSelectionCanonicalTopicNames(null)).toEqual([]);
  });

  it("returns canonicalTopicNames when available", () => {
    const sel = { canonicalTopicNames: ["A", "B"] };
    expect(getTopicSelectionCanonicalTopicNames(sel)).toEqual(["A", "B"]);
  });

  it("deduplicates and trims names", () => {
    const sel = { canonicalTopicNames: [" A ", "B", " A"] };
    expect(getTopicSelectionCanonicalTopicNames(sel)).toEqual(["A", "B"]);
  });

  it("filters empty names from canonicalTopicNames", () => {
    const sel = { canonicalTopicNames: ["A", "", "  ", "B"] };
    expect(getTopicSelectionCanonicalTopicNames(sel)).toEqual(["A", "B"]);
  });

  it("falls back to primaryTopicName", () => {
    const sel = { primaryTopicName: "Topic1" };
    expect(getTopicSelectionCanonicalTopicNames(sel)).toEqual(["Topic1"]);
  });

  it("falls back to fullPath when primaryTopicName is empty", () => {
    const sel = { fullPath: "A>B" };
    expect(getTopicSelectionCanonicalTopicNames(sel)).toEqual(["A>B"]);
  });

  it("falls back to name when fullPath is empty", () => {
    const sel = { name: "MyTopic" };
    expect(getTopicSelectionCanonicalTopicNames(sel)).toEqual(["MyTopic"]);
  });

  it("returns empty array when all fallbacks are empty", () => {
    expect(getTopicSelectionCanonicalTopicNames({})).toEqual([]);
  });
});

describe("resolveCanonicalTopics", () => {
  const allTopics = [
    { name: "Alpha", sentences: [1, 2] },
    { name: "Beta", sentences: [3] },
  ];

  it("resolves matching topics by name", () => {
    const sel = { canonicalTopicNames: ["Alpha"] };
    const result = resolveCanonicalTopics(sel, allTopics);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alpha");
  });

  it("returns empty array when no topics match", () => {
    const sel = { canonicalTopicNames: ["Gamma"] };
    expect(resolveCanonicalTopics(sel, allTopics)).toEqual([]);
  });

  it("handles non-array allTopics", () => {
    const sel = { canonicalTopicNames: ["Alpha"] };
    expect(resolveCanonicalTopics(sel, null)).toEqual([]);
  });
});

describe("buildTopicModalSelection", () => {
  it("returns null for null selection", () => {
    expect(buildTopicModalSelection(null)).toBeNull();
  });

  it("returns null for undefined selection", () => {
    expect(buildTopicModalSelection(undefined)).toBeNull();
  });

  it("builds selection with kind 'topic' for single canonical topic", () => {
    const allTopics = [{ name: "T1", sentences: [1] }];
    const sel = { canonicalTopicNames: ["T1"], name: "T1" };
    const result = buildTopicModalSelection(sel, allTopics);
    expect(result.kind).toBe("topic");
  });

  it("builds selection with kind 'topic_group' for multiple canonical topics", () => {
    const allTopics = [
      { name: "T1", sentences: [1] },
      { name: "T2", sentences: [2] },
    ];
    const sel = { canonicalTopicNames: ["T1", "T2"] };
    const result = buildTopicModalSelection(sel, allTopics);
    expect(result.kind).toBe("topic_group");
  });

  it("builds selection with kind 'keyword' when no canonical topics", () => {
    const sel = {};
    const result = buildTopicModalSelection(sel, []);
    expect(result.kind).toBe("keyword");
  });

  it("preserves sentenceIndices from selection when present", () => {
    const sel = { sentenceIndices: [1, 3, 5] };
    const result = buildTopicModalSelection(sel, []);
    expect(result.sentenceIndices).toEqual([1, 3, 5]);
  });

  it("deduplicates and sorts sentenceIndices", () => {
    const sel = { sentenceIndices: [5, 3, 3, 1] };
    const result = buildTopicModalSelection(sel, []);
    expect(result.sentenceIndices).toEqual([1, 3, 5]);
  });

  it("defaults displayName to 'Source Sentences' when all fallbacks are empty", () => {
    const sel = {};
    const result = buildTopicModalSelection(sel, []);
    expect(result.displayName).toBe("Source Sentences");
  });
});

describe("buildModalSelectionFromTopic", () => {
  it("returns a selection with kind 'topic'", () => {
    const result = buildModalSelectionFromTopic({
      name: "T1",
      fullPath: "T1",
      sentenceIndices: [1, 2],
    });
    expect(result.kind).toBe("topic");
    expect(result.name).toBe("T1");
    expect(result.sentenceIndices).toEqual([1, 2]);
  });

  it("deduplicates sentence indices", () => {
    const result = buildModalSelectionFromTopic({
      sentenceIndices: [2, 1, 2],
    });
    expect(result.sentenceIndices).toEqual([1, 2]);
  });

  it("sets primaryTopicName from fullPath fallback", () => {
    const result = buildModalSelectionFromTopic({
      fullPath: "A>B",
    });
    expect(result.primaryTopicName).toBe("A>B");
  });

  it("uses sentences as fallback for sentenceIndices", () => {
    const result = buildModalSelectionFromTopic({
      sentences: [3, 1],
    });
    expect(result.sentenceIndices).toEqual([1, 3]);
  });

  it("filters non-positive sentence indices", () => {
    const result = buildModalSelectionFromTopic({
      sentenceIndices: [1, 0, -1, 3],
    });
    expect(result.sentenceIndices).toEqual([1, 3]);
  });
});

describe("buildModalSelectionFromTopicGroup", () => {
  it("returns null for empty topics array", () => {
    expect(buildModalSelectionFromTopicGroup([])).toBeNull();
  });

  it("returns null for non-array input", () => {
    expect(buildModalSelectionFromTopicGroup(null)).toBeNull();
  });

  it("combines sentences from all topics", () => {
    const topics = [
      { name: "A", sentences: [1, 2] },
      { name: "B", sentences: [3] },
    ];
    const result = buildModalSelectionFromTopicGroup(topics);
    expect(result.kind).toBe("topic_group");
    expect(result.sentenceIndices).toEqual([1, 2, 3]);
    expect(result.canonicalTopicNames).toEqual(["A", "B"]);
  });

  it("generates group label with topic count", () => {
    const topics = [
      { name: "Alpha Beta", sentences: [1] },
      { name: "Gamma", sentences: [2] },
    ];
    const result = buildModalSelectionFromTopicGroup(topics);
    expect(result.name).toContain("2 topics");
    expect(result.name).toContain("Alpha");
  });

  it("sets primaryTopicName to first topic name", () => {
    const topics = [
      { name: "First", sentences: [1] },
      { name: "Second", sentences: [2] },
    ];
    const result = buildModalSelectionFromTopicGroup(topics);
    expect(result.primaryTopicName).toBe("First");
  });

  it("passes sentences to _sentences", () => {
    const topics = [{ name: "A", sentences: [1] }];
    const sentences = ["s1"];
    const result = buildModalSelectionFromTopicGroup(topics, sentences);
    expect(result._sentences).toEqual(["s1"]);
  });
});

describe("buildModalSelectionFromSummarySource", () => {
  it("builds selection with kind 'summary_source'", () => {
    const result = buildModalSelectionFromSummarySource({
      topicName: "Climate",
      sentenceIndices: [1, 2],
    });
    expect(result.kind).toBe("summary_source");
    expect(result.displayName).toBe("Climate");
    expect(result.sentenceIndices).toEqual([1, 2]);
    expect(result.canonicalTopicNames).toEqual(["Climate"]);
  });

  it("defaults displayName to 'Source Sentences' when no topicName", () => {
    const result = buildModalSelectionFromSummarySource({});
    expect(result.displayName).toBe("Source Sentences");
  });

  it("passes summarySentence to _summarySentence", () => {
    const result = buildModalSelectionFromSummarySource({
      summarySentence: "This is a summary.",
    });
    expect(result._summarySentence).toBe("This is a summary.");
  });
});

describe("buildModalSelectionFromKeyword", () => {
  it("builds selection with kind 'keyword'", () => {
    const result = buildModalSelectionFromKeyword("test", [1, 2]);
    expect(result.kind).toBe("keyword");
    expect(result.displayName).toBe("test");
    expect(result.sentenceIndices).toEqual([1, 2]);
  });

  it("defaults displayName to 'Keyword' for empty input", () => {
    const result = buildModalSelectionFromKeyword("", []);
    expect(result.displayName).toBe("Keyword");
  });

  it("passes sentences to _sentences", () => {
    const result = buildModalSelectionFromKeyword("k", [1], ["s1"]);
    expect(result._sentences).toEqual(["s1"]);
  });

  it("has empty canonicalTopicNames and null primaryTopicName", () => {
    const result = buildModalSelectionFromKeyword("k", [1]);
    expect(result.canonicalTopicNames).toEqual([]);
    expect(result.primaryTopicName).toBeNull();
  });
});
