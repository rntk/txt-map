import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGlobalChartData } from "./useGlobalChartData";

describe("useGlobalChartData", () => {
  const topics = [
    { name: "Science", totalSentences: 3 },
    { name: "Science>Physics", totalSentences: 2 },
    { name: "Arts", totalSentences: 1 },
  ];

  it("returns empty results for empty topics", () => {
    const { result } = renderHook(() => useGlobalChartData([], null));
    expect(result.current.chartTopics).toEqual([]);
    expect(result.current.chartSentences).toEqual([]);
    expect(result.current.allTopics).toEqual([]);
    expect(result.current.mindmapData).toEqual({
      topic_mindmaps: {},
      sentences: [],
    });
  });

  it("assigns contiguous 1-based synthetic indices per topic", () => {
    const { result } = renderHook(() => useGlobalChartData(topics, null));
    const { chartTopics } = result.current;
    expect(chartTopics[0].sentences).toEqual([1, 2, 3]); // Science: 0+1..0+3
    expect(chartTopics[1].sentences).toEqual([4, 5]); // Science>Physics: 3+1..3+2
    expect(chartTopics[2].sentences).toEqual([6]); // Arts: 5+1
  });

  it("builds chartSentences using topic name placeholders when no real sentences", () => {
    const { result } = renderHook(() => useGlobalChartData(topics, null));
    const { chartSentences } = result.current;
    expect(chartSentences).toHaveLength(6);
    expect(chartSentences.slice(0, 3)).toEqual([
      "Science",
      "Science",
      "Science",
    ]);
    expect(chartSentences.slice(3, 5)).toEqual([
      "Science>Physics",
      "Science>Physics",
    ]);
    expect(chartSentences[5]).toBe("Arts");
  });

  it("uses real sentences when sentencesByTopic is provided", () => {
    const sentencesByTopic = {
      Science: ["s1", "s2", "s3"],
      "Science>Physics": ["p1", "p2"],
      Arts: ["a1"],
    };
    const { result } = renderHook(() =>
      useGlobalChartData(topics, sentencesByTopic),
    );
    const { chartSentences } = result.current;
    expect(chartSentences).toEqual(["s1", "s2", "s3", "p1", "p2", "a1"]);
  });

  it("falls back to topic name when real sentences are shorter than totalSentences", () => {
    const sentencesByTopic = {
      Science: ["s1"], // only 1, but totalSentences is 3
      "Science>Physics": ["p1", "p2"],
      Arts: ["a1"],
    };
    const { result } = renderHook(() =>
      useGlobalChartData(topics, sentencesByTopic),
    );
    const { chartSentences } = result.current;
    expect(chartSentences[0]).toBe("s1");
    expect(chartSentences[1]).toBe("Science"); // fallback
    expect(chartSentences[2]).toBe("Science"); // fallback
  });

  it("enriches allTopics with totalSentences and empty summary", () => {
    const { result } = renderHook(() => useGlobalChartData(topics, null));
    const { allTopics } = result.current;
    expect(allTopics[0].totalSentences).toBe(3);
    expect(allTopics[0].summary).toBe("");
    expect(allTopics[1].totalSentences).toBe(2);
    expect(allTopics[2].totalSentences).toBe(1);
  });

  describe("mindmapData", () => {
    it("puts single-part topic sentences on the root node", () => {
      const { result } = renderHook(() => useGlobalChartData(topics, null));
      const { topic_mindmaps } = result.current.mindmapData;
      expect(topic_mindmaps["Science"].sentences).toEqual([1, 2, 3]);
      expect(topic_mindmaps["Arts"].sentences).toEqual([6]);
    });

    it("nests multi-part topic names into children via > separator", () => {
      const { result } = renderHook(() => useGlobalChartData(topics, null));
      const { topic_mindmaps } = result.current.mindmapData;
      expect(topic_mindmaps["Science"].children["Physics"].sentences).toEqual([
        4, 5,
      ]);
    });

    it("passes chartSentences as the sentences array in mindmapData", () => {
      const { result } = renderHook(() => useGlobalChartData(topics, null));
      expect(result.current.mindmapData.sentences).toBe(
        result.current.chartSentences,
      );
    });

    it("handles deeply nested topics (3 levels)", () => {
      const deep = [{ name: "A>B>C", totalSentences: 2 }];
      const { result } = renderHook(() => useGlobalChartData(deep, null));
      const { topic_mindmaps } = result.current.mindmapData;
      expect(topic_mindmaps["A"].children["B"].children["C"].sentences).toEqual(
        [1, 2],
      );
    });
  });
});
