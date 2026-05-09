import { describe, expect, it } from "vitest";
import {
  buildTopicMarkerData,
  isInAnyRange,
  wrapWord,
  buildHighlightedRawHtml,
} from "./htmlHighlight";

describe("htmlHighlight", () => {
  describe("isInAnyRange", () => {
    it("returns true when word overlaps a range", () => {
      expect(isInAnyRange(2, 5, [{ start: 0, end: 4 }])).toBe(true);
    });

    it("returns false when word is before all ranges", () => {
      expect(isInAnyRange(0, 2, [{ start: 3, end: 6 }])).toBe(false);
    });

    it("returns false when word is after all ranges", () => {
      expect(isInAnyRange(7, 9, [{ start: 3, end: 6 }])).toBe(false);
    });

    it("returns true when word exactly matches a range", () => {
      expect(isInAnyRange(3, 6, [{ start: 3, end: 6 }])).toBe(true);
    });

    it("returns true when word is inside a range", () => {
      expect(isInAnyRange(4, 5, [{ start: 3, end: 6 }])).toBe(true);
    });

    it("checks multiple ranges", () => {
      expect(
        isInAnyRange(10, 12, [
          { start: 0, end: 3 },
          { start: 9, end: 15 },
        ]),
      ).toBe(true);
    });
  });

  describe("buildTopicMarkerData", () => {
    it("returns empty array when no topics are selected or hovered", () => {
      const articleTopics = [
        {
          name: "Topic1",
          ranges: [{ start: 0, end: 10 }],
          marker_spans: [{ text: "word1" }],
        },
      ];

      const result = buildTopicMarkerData(articleTopics, [], null);
      expect(result).toEqual([]);
    });

    it("returns marker data for selected topics only", () => {
      const articleTopics = [
        {
          name: "Topic1",
          ranges: [{ start: 0, end: 10 }],
          marker_spans: [{ text: "word1" }, { text: "word2" }],
        },
        {
          name: "Topic2",
          ranges: [{ start: 20, end: 30 }],
          marker_spans: [{ text: "word3" }],
        },
      ];

      const result = buildTopicMarkerData(
        articleTopics,
        [{ name: "Topic1" }],
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0].ranges).toEqual([{ start: 0, end: 10 }]);
      expect(result[0].markerWords.has("word1")).toBe(true);
      expect(result[0].markerWords.has("word2")).toBe(true);
      expect(result[0].markerWords.has("word3")).toBe(false);
    });

    it("returns marker data for hovered topic", () => {
      const articleTopics = [
        {
          name: "Topic1",
          ranges: [{ start: 0, end: 10 }],
          marker_spans: [{ text: "word1" }],
        },
      ];

      const result = buildTopicMarkerData(articleTopics, [], {
        name: "Topic1",
      });

      expect(result).toHaveLength(1);
      expect(result[0].markerWords.has("word1")).toBe(true);
    });

    it("normalizes marker words by removing punctuation", () => {
      const articleTopics = [
        {
          name: "Topic1",
          ranges: [{ start: 0, end: 10 }],
          marker_spans: [
            { text: "AGI»." },
            { text: "word!" },
            { text: "test" },
          ],
        },
      ];

      const result = buildTopicMarkerData(
        articleTopics,
        [{ name: "Topic1" }],
        null,
      );

      expect(result[0].markerWords.has("agi")).toBe(true);
      expect(result[0].markerWords.has("word")).toBe(true);
      expect(result[0].markerWords.has("test")).toBe(true);
    });

    it("splits multi-word marker spans into individual normalized words", () => {
      const articleTopics = [
        {
          name: "Topic1",
          ranges: [{ start: 0, end: 20 }],
          marker_spans: [{ text: "Alpha beta" }, { text: "gamma." }],
        },
      ];

      const result = buildTopicMarkerData(
        articleTopics,
        [{ name: "Topic1" }],
        null,
      );

      expect(result[0].markerWords.has("alpha")).toBe(true);
      expect(result[0].markerWords.has("beta")).toBe(true);
      expect(result[0].markerWords.has("gamma")).toBe(true);
      expect(result[0].markerWords.has("alpha beta")).toBe(false);
    });

    it("returns data for multiple selected topics", () => {
      const articleTopics = [
        {
          name: "Topic1",
          ranges: [{ start: 0, end: 10 }],
          marker_spans: [{ text: "word1" }],
        },
        {
          name: "Topic2",
          ranges: [{ start: 20, end: 30 }],
          marker_spans: [{ text: "word2" }],
        },
      ];

      const result = buildTopicMarkerData(
        articleTopics,
        [{ name: "Topic1" }, { name: "Topic2" }],
        null,
      );

      expect(result).toHaveLength(2);
      expect(result[0].markerWords.has("word1")).toBe(true);
      expect(result[1].markerWords.has("word2")).toBe(true);
    });

    it("skips topics without marker_spans", () => {
      const articleTopics = [
        {
          name: "Topic1",
          ranges: [{ start: 0, end: 10 }],
          marker_spans: [],
        },
      ];

      const result = buildTopicMarkerData(
        articleTopics,
        [{ name: "Topic1" }],
        null,
      );
      expect(result).toEqual([]);
    });
  });

  describe("wrapWord", () => {
    const noRanges = [];

    it("returns plain word when not in any range", () => {
      expect(
        wrapWord("hello", 0, 0, noRanges, noRanges, noRanges, noRanges),
      ).toBe("hello");
    });

    it("wraps word in span when in a topic range", () => {
      const topicRanges = [{ start: 0, end: 5 }];
      const result = wrapWord(
        "hello",
        0,
        0,
        noRanges,
        noRanges,
        noRanges,
        topicRanges,
      );
      expect(result).toContain('<span class="word-token"');
      expect(result).toContain("hello");
    });

    it("adds 'highlighted' class when in highlightRanges", () => {
      const highlight = [{ start: 0, end: 5 }];
      const topicRanges = [{ start: 0, end: 5 }];
      const result = wrapWord(
        "hello",
        0,
        0,
        highlight,
        noRanges,
        noRanges,
        topicRanges,
      );
      expect(result).toContain("highlighted");
    });

    it("adds 'faded' class when in fadeRanges but not highlightRanges", () => {
      const fade = [{ start: 0, end: 5 }];
      const topicRanges = [{ start: 0, end: 5 }];
      const result = wrapWord(
        "hello",
        0,
        0,
        noRanges,
        fade,
        noRanges,
        topicRanges,
      );
      expect(result).toContain("faded");
    });

    it("prefers highlighted over faded when in both", () => {
      const highlight = [{ start: 0, end: 5 }];
      const fade = [{ start: 0, end: 5 }];
      const topicRanges = [{ start: 0, end: 5 }];
      const result = wrapWord(
        "hello",
        0,
        0,
        highlight,
        fade,
        noRanges,
        topicRanges,
      );
      expect(result).toContain("highlighted");
      expect(result).not.toContain("faded");
    });

    it("adds word-highlight class for matching highlightWords", () => {
      const result = wrapWord(
        "hello",
        0,
        0,
        noRanges,
        noRanges,
        noRanges,
        noRanges,
        [],
        [],
        "",
        [],
        "",
        ["hello"],
      );
      expect(result).toContain("word-highlight");
    });

    it("highlights word case-insensitively via highlightWords", () => {
      const result = wrapWord(
        "Hello",
        0,
        0,
        noRanges,
        noRanges,
        noRanges,
        noRanges,
        [],
        [],
        "",
        [],
        "",
        ["hello"],
      );
      expect(result).toContain("word-highlight");
    });

    it("wraps word with colored range cssClass", () => {
      const coloredRanges = [{ start: 0, end: 5, cssClass: "color-red" }];
      const result = wrapWord(
        "hello",
        0,
        0,
        noRanges,
        noRanges,
        noRanges,
        noRanges,
        coloredRanges,
      );
      expect(result).toContain("color-red");
    });

    it("adds interactive class when in interactiveRanges", () => {
      const topicRanges = [{ start: 0, end: 5 }];
      const interactiveRanges = [{ start: 0, end: 5 }];
      const result = wrapWord(
        "hello",
        0,
        0,
        noRanges,
        noRanges,
        noRanges,
        topicRanges,
        [],
        interactiveRanges,
        "my-interactive",
      );
      expect(result).toContain("my-interactive");
    });

    it("adds dimmed class when in dimmedRanges", () => {
      const topicRanges = [{ start: 0, end: 5 }];
      const dimmedRanges = [{ start: 0, end: 5 }];
      const result = wrapWord(
        "hello",
        0,
        0,
        noRanges,
        noRanges,
        noRanges,
        topicRanges,
        [],
        [],
        "",
        dimmedRanges,
        "my-dimmed",
      );
      expect(result).toContain("my-dimmed");
    });

    it("includes data attributes in wrapped span", () => {
      const topicRanges = [{ start: 0, end: 5 }];
      const result = wrapWord(
        "hello",
        0,
        2,
        noRanges,
        noRanges,
        noRanges,
        topicRanges,
      );
      expect(result).toContain('data-article-index="2"');
      expect(result).toContain('data-char-start="0"');
      expect(result).toContain('data-char-end="5"');
    });

    it("adds summary highlight class via topicMarkerData", () => {
      const topicRanges = [{ start: 0, end: 5 }];
      const topicMarkerData = [
        {
          ranges: [{ start: 0, end: 5 }],
          markerWords: new Set(["hello"]),
        },
      ];
      const result = wrapWord(
        "hello",
        0,
        0,
        noRanges,
        noRanges,
        noRanges,
        topicRanges,
        [],
        [],
        "",
        [],
        "",
        [],
        topicMarkerData,
      );
      expect(result).toContain("reading-article__summary-word-highlight");
    });

    it("adds summary highlight class via summaryHighlightRanges", () => {
      const topicRanges = [{ start: 0, end: 5 }];
      const summaryRanges = [{ start: 0, end: 5 }];
      const result = wrapWord(
        "hello",
        0,
        0,
        noRanges,
        noRanges,
        summaryRanges,
        topicRanges,
      );
      expect(result).toContain("reading-article__summary-word-highlight");
    });
  });

  describe("buildHighlightedRawHtml", () => {
    it("returns empty string for null input", () => {
      expect(buildHighlightedRawHtml(null, [], 0, [], [])).toBe("");
    });

    it("returns empty string for undefined input", () => {
      expect(buildHighlightedRawHtml(undefined, [], 0, [], [])).toBe("");
    });

    it("returns sanitized HTML when no ranges or highlights are provided", () => {
      const result = buildHighlightedRawHtml("hello world", [], 0, [], []);
      expect(result).toBe("hello world");
    });

    it("wraps words that fall within topic ranges", () => {
      const topics = [{ ranges: [{ start: 0, end: 5 }] }];
      const result = buildHighlightedRawHtml("hello world", topics, 0, [], []);
      expect(result).toContain("word-token");
    });

    it("preserves HTML tags in the output", () => {
      const topics = [{ ranges: [{ start: 0, end: 5 }] }];
      const result = buildHighlightedRawHtml(
        "<b>hello</b> world",
        topics,
        0,
        [],
        [],
      );
      expect(result).toContain("<b>");
      expect(result).toContain("</b>");
    });

    it("wraps words based on highlight ranges", () => {
      const topics = [{ ranges: [{ start: 0, end: 11 }] }];
      const highlight = [{ start: 6, end: 11 }];
      const result = buildHighlightedRawHtml(
        "hello world",
        topics,
        0,
        highlight,
        [],
      );
      expect(result).toContain("highlighted");
    });

    it("handles colored ranges", () => {
      const coloredRanges = [{ start: 0, end: 5, cssClass: "my-color" }];
      const result = buildHighlightedRawHtml(
        "hello world",
        [],
        0,
        [],
        [],
        [],
        coloredRanges,
      );
      expect(result).toContain("my-color");
    });

    it("handles highlightWords parameter", () => {
      const result = buildHighlightedRawHtml(
        "hello world",
        [],
        0,
        [],
        [],
        [],
        [],
        [],
        "",
        [],
        "",
        ["hello"],
      );
      expect(result).toContain("word-highlight");
    });
  });
});
