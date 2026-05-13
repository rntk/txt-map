import { describe, expect, it } from "vitest";
import { buildTopicTagsEntries } from "./useTopicTagsLayout";

describe("buildTopicTagsEntries", () => {
  it("keeps scored tags at 80 or higher and aligns them by topic range", () => {
    const entries = buildTopicTagsEntries({
      submissionTopics: [
        { name: "Parent>Topic A", sentences: [1, 2] },
        { name: "Topic B", fullPath: "Parent>Topic B", sentences: [3] },
      ],
      topicTagRankings: {
        "Parent>Topic A": [
          { tag: "Alpha", score: 79 },
          { tag: "Beta", score: 80 },
          { tag: "Gamma", score: 95 },
        ],
        "Parent>Topic B": [{ tag: "Delta", score: 88 }],
      },
      sentenceOffsets: [0, 12, 26],
      submissionSentences: ["First text.", "Second text.", "Third text."],
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      key: "Parent>Topic A",
      topicName: "Topic A",
      sentenceStart: 1,
      sentenceEnd: 2,
      charStart: 0,
      charEnd: 24,
      visibleTagCount: 3,
      tags: [
        { tag: "gamma", score: 95 },
        { tag: "beta", score: 80 },
        { tag: "alpha", score: 79 },
      ],
    });
    expect(entries[1].tags).toEqual([{ tag: "delta", score: 88 }]);
  });
});
