import { describe, it, expect } from "vitest";
import { buildDiffRows } from "./diffRowBuilder";

describe("buildDiffRows", () => {
  it("returns empty array for null/undefined input", () => {
    expect(buildDiffRows(null)).toEqual([]);
    expect(buildDiffRows(undefined)).toEqual([]);
    expect(buildDiffRows({})).toEqual([]);
  });

  it("returns empty array when diff object is missing", () => {
    expect(buildDiffRows({ diff: null })).toEqual([]);
  });

  it("returns empty array for an empty diff with no lists", () => {
    const result = buildDiffRows({ diff: {} });
    expect(result).toEqual([]);
  });

  it("handles matched pairs from matches_left_to_right", () => {
    const diffState = {
      diff: {
        matches_left_to_right: [
          {
            left_sentence_index: 0,
            left_topic: "TopicA",
            left_text: "Hello",
            right_sentence_index: 0,
            right_topic: "TopicB",
            right_text: "Hi",
            similarity: 0.9,
          },
        ],
      },
    };

    const rows = buildDiffRows(diffState);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("match");
    expect(rows[0].hasLeft).toBe(true);
    expect(rows[0].hasRight).toBe(true);
    expect(rows[0].similarity).toBe(0.9);
    expect(rows[0].leftText).toBe("Hello");
    expect(rows[0].rightText).toBe("Hi");
    expect(rows[0].leftSentenceIndex).toBe(0);
    expect(rows[0].rightSentenceIndex).toBe(0);
  });

  it("handles unmatched left sentences (additions only from left)", () => {
    const diffState = {
      diff: {
        unmatched_left: [
          {
            left_sentence_index: 0,
            left_topic: "TopicA",
            left_text: "Only on left",
            right_sentence_index: null,
            right_text: null,
            similarity: null,
          },
        ],
      },
    };

    const rows = buildDiffRows(diffState);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("unmatched-left");
    expect(rows[0].hasLeft).toBe(true);
    expect(rows[0].hasRight).toBe(false);
    expect(rows[0].leftText).toBe("Only on left");
    expect(rows[0].rightText).toBeNull();
    expect(rows[0].similarity).toBe(0);
  });

  it("handles unmatched right sentences (deletions from left perspective)", () => {
    const diffState = {
      diff: {
        unmatched_right: [
          {
            left_sentence_index: null,
            left_text: null,
            right_sentence_index: 1,
            right_topic: "TopicB",
            right_text: "Only on right",
            similarity: null,
          },
        ],
      },
    };

    const rows = buildDiffRows(diffState);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("unmatched-right");
    expect(rows[0].hasLeft).toBe(false);
    expect(rows[0].hasRight).toBe(true);
    expect(rows[0].rightText).toBe("Only on right");
    expect(rows[0].leftText).toBeNull();
    expect(rows[0].similarity).toBe(0);
  });

  it("deduplicates edges and keeps the one with higher similarity", () => {
    const diffState = {
      diff: {
        matches_left_to_right: [
          {
            left_sentence_index: 0,
            left_text: "Left",
            right_sentence_index: 0,
            right_text: "Right",
            similarity: 0.5,
          },
        ],
        matches_right_to_left: [
          {
            left_sentence_index: 0,
            left_text: "Left",
            right_sentence_index: 0,
            right_text: "Right",
            similarity: 0.8,
          },
        ],
      },
    };

    const rows = buildDiffRows(diffState);
    // Should deduplicate — only one row for index pair (0, 0)
    expect(rows).toHaveLength(1);
    expect(rows[0].similarity).toBe(0.8);
  });

  it("each row has an id field with the format row-N", () => {
    const diffState = {
      diff: {
        unmatched_left: [
          {
            left_sentence_index: 0,
            left_text: "A",
            right_sentence_index: null,
            similarity: null,
          },
          {
            left_sentence_index: 1,
            left_text: "B",
            right_sentence_index: null,
            similarity: null,
          },
        ],
      },
    };

    const rows = buildDiffRows(diffState);
    expect(rows[0].id).toBe("row-0");
    expect(rows[1].id).toBe("row-1");
  });

  it("rows are sorted by left sentence index then right sentence index", () => {
    const diffState = {
      diff: {
        matches_left_to_right: [
          {
            left_sentence_index: 2,
            left_text: "C",
            right_sentence_index: 0,
            right_text: "c",
            similarity: 0.7,
          },
          {
            left_sentence_index: 0,
            left_text: "A",
            right_sentence_index: 1,
            right_text: "a",
            similarity: 0.9,
          },
        ],
      },
    };

    const rows = buildDiffRows(diffState);
    expect(rows[0].leftSentenceIndex).toBe(0);
    expect(rows[1].leftSentenceIndex).toBe(2);
  });

  it("nearestRight and nearestLeft exclude the paired match", () => {
    // Two edges: left-0 -> right-0 (paired), left-0 -> right-1 (alternate)
    const diffState = {
      diff: {
        matches_left_to_right: [
          {
            left_sentence_index: 0,
            left_text: "L0",
            right_sentence_index: 0,
            right_text: "R0",
            similarity: 0.9,
          },
          {
            left_sentence_index: 0,
            left_text: "L0",
            right_sentence_index: 1,
            right_text: "R1",
            similarity: 0.5,
          },
        ],
        unmatched_right: [
          {
            left_sentence_index: null,
            right_sentence_index: 1,
            right_text: "R1",
            similarity: null,
          },
        ],
      },
    };

    const rows = buildDiffRows(diffState);
    const matchRow = rows.find((r) => r.kind === "match");
    // nearestRight should not contain the paired right index
    expect(
      matchRow.nearestRight.every((r) => r.right_sentence_index !== 0),
    ).toBe(true);
  });

  it("handles edges with zero similarity — they are not added as edges", () => {
    // similarity === 0 should not create an edge (condition: similarity > 0)
    const diffState = {
      diff: {
        matches_left_to_right: [
          {
            left_sentence_index: 0,
            left_text: "A",
            right_sentence_index: 0,
            right_text: "B",
            similarity: 0,
          },
        ],
      },
    };

    const rows = buildDiffRows(diffState);
    // Nodes are registered but no edge, so they appear as separate unmatched rows
    expect(rows.every((r) => r.kind !== "match")).toBe(true);
  });
});
