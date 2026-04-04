import { describe, it, expect } from "vitest";
import { bagOfWordsScore, matchSummaryToTopics } from "./summaryMatcher";

describe("bagOfWordsScore", () => {
  it("returns 0 for empty query", () => {
    expect(bagOfWordsScore("", "some candidate text")).toBe(0);
  });

  it("returns 0 for query with only stopwords", () => {
    expect(bagOfWordsScore("the and or", "the and or")).toBe(0);
  });

  it("returns 1 when all query tokens appear in candidate", () => {
    expect(
      bagOfWordsScore(
        "machine learning models",
        "deep machine learning models are popular",
      ),
    ).toBe(1);
  });

  it("returns partial score when some query tokens match", () => {
    const score = bagOfWordsScore(
      "machine learning algorithms",
      "machine learning is great",
    );
    // "machine" and "learning" match, "algorithms" does not → 2/3
    expect(score).toBeCloseTo(2 / 3);
  });

  it("is case-insensitive", () => {
    expect(bagOfWordsScore("Machine Learning", "machine learning")).toBe(1);
  });

  it("filters words of 2 chars or fewer", () => {
    // 'ai' is 2 chars → filtered; only 'neural' counts
    expect(bagOfWordsScore("ai neural", "neural networks")).toBe(1);
  });

  it("returns 0 when no tokens overlap", () => {
    expect(bagOfWordsScore("quantum computing", "ancient history")).toBe(0);
  });
});

describe("matchSummaryToTopics", () => {
  const sentences = [
    "Machine learning models are trained on large datasets.", // 1
    "Climate change affects global temperatures.", // 2
    "Neural networks can recognize images.", // 3
  ];

  const topics = [
    { name: "Technology > ML", sentences: [1, 3] },
    { name: "Environment", sentences: [2] },
  ];

  it("returns matching topics sorted by score descending", () => {
    const results = matchSummaryToTopics(
      "machine learning neural networks used for image recognition",
      topics,
      sentences,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].topic.name).toBe("Technology > ML");
    expect(results[0].score).toBeGreaterThanOrEqual(0.15);
  });

  it("includes sentence indices for matched sentences", () => {
    const results = matchSummaryToTopics(
      "machine learning large datasets training",
      topics,
      sentences,
    );
    const mlResult = results.find((r) => r.topic.name === "Technology > ML");
    expect(mlResult).toBeDefined();
    expect(mlResult.sentenceIndices).toContain(1);
  });

  it("returns empty array when no topics match", () => {
    const results = matchSummaryToTopics(
      "completely unrelated text about cooking recipes",
      topics,
      sentences,
    );
    expect(results).toEqual([]);
  });

  it("returns empty array for empty topics", () => {
    const results = matchSummaryToTopics("machine learning", [], sentences);
    expect(results).toEqual([]);
  });

  it("returns empty array for empty sentences", () => {
    const results = matchSummaryToTopics("machine learning", topics, []);
    expect(results).toEqual([]);
  });

  it("handles null/undefined inputs gracefully", () => {
    expect(matchSummaryToTopics(null, null, null)).toEqual([]);
    expect(matchSummaryToTopics("text", null, null)).toEqual([]);
  });

  it("accepts a custom matcherFn", () => {
    const alwaysMatch = () => 1.0;
    const results = matchSummaryToTopics(
      "anything",
      topics,
      sentences,
      alwaysMatch,
    );
    expect(results.length).toBe(2);
    expect(results.every((r) => r.score === 1.0)).toBe(true);
  });

  it("does not include topics below the score threshold", () => {
    // neverMatch returns 0 for everything
    const neverMatch = () => 0;
    const results = matchSummaryToTopics(
      "machine learning",
      topics,
      sentences,
      neverMatch,
    );
    expect(results).toEqual([]);
  });
});
