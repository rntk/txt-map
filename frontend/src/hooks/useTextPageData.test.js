import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTextPageData } from "./useTextPageData";

describe("useTextPageData", () => {
  it("maps topic marker summaries into article character ranges", () => {
    const submission = {
      text_content: "Alpha Beta Gamma",
      results: {
        sentences: ["Alpha Beta Gamma"],
        topics: [
          {
            name: "Topic1",
            sentences: [1],
            ranges: [{ start: 6, end: 10, sentence_start: 1, sentence_end: 1 }],
          },
        ],
        topic_summaries: {},
        topic_marker_summaries: {
          Topic1: {
            ranges: [
              {
                range_index: 1,
                sentence_start: 1,
                sentence_end: 1,
                marker_spans: [{ start_word: 2, end_word: 2, text: "Beta" }],
                summary_text: "Beta",
              },
            ],
          },
        },
      },
    };

    const { result } = renderHook(() =>
      useTextPageData(submission, [{ name: "Topic1" }], null, new Set()),
    );

    expect(result.current.allTopics[0].summaryHighlightRanges).toEqual([
      { start: 6, end: 10 },
    ]);
  });
});
