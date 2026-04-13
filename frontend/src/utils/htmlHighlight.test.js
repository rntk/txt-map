import { describe, expect, it } from "vitest";
import { buildTopicMarkerData } from "./htmlHighlight";

describe("htmlHighlight", () => {
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

      const result = buildTopicMarkerData(articleTopics, [{ name: "Topic1" }], null);

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

      const result = buildTopicMarkerData(articleTopics, [], { name: "Topic1" });

      expect(result).toHaveLength(1);
      expect(result[0].markerWords.has("word1")).toBe(true);
    });

    it("normalizes marker words by removing punctuation", () => {
      const articleTopics = [
        {
          name: "Topic1",
          ranges: [{ start: 0, end: 10 }],
          marker_spans: [{ text: 'AGI».' }, { text: "word!" }, { text: "test" }],
        },
      ];

      const result = buildTopicMarkerData(articleTopics, [{ name: "Topic1" }], null);

      expect(result[0].markerWords.has("agi")).toBe(true);
      expect(result[0].markerWords.has("word")).toBe(true);
      expect(result[0].markerWords.has("test")).toBe(true);
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

      const result = buildTopicMarkerData(articleTopics, [{ name: "Topic1" }], null);
      expect(result).toEqual([]);
    });
  });
});
