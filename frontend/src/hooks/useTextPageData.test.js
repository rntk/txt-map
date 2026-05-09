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

  it("extracts marker_spans from topic_marker_summaries for word-based highlighting", () => {
    const submission = {
      text_content: "Alpha Beta Gamma Delta",
      results: {
        sentences: ["Alpha Beta Gamma Delta"],
        topics: [
          {
            name: "Topic1",
            sentences: [1],
            ranges: [{ start: 0, end: 22, sentence_start: 1, sentence_end: 1 }],
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
                marker_spans: [
                  { start_word: 2, end_word: 2, text: "Beta" },
                  { start_word: 4, end_word: 4, text: "Delta" },
                ],
                summary_text: "Beta Delta",
              },
            ],
          },
        },
      },
    };

    const { result } = renderHook(() =>
      useTextPageData(submission, [{ name: "Topic1" }], null, new Set()),
    );

    // Should extract marker_spans from topic_marker_summaries
    expect(result.current.allTopics[0].marker_spans).toEqual([
      { start_word: 2, end_word: 2, text: "Beta" },
      { start_word: 4, end_word: 4, text: "Delta" },
    ]);
  });

  it("handles topics without topic_marker_summaries gracefully", () => {
    const submission = {
      text_content: "Alpha Beta Gamma",
      results: {
        sentences: ["Alpha Beta Gamma"],
        topics: [
          {
            name: "Topic1",
            sentences: [1],
            ranges: [{ start: 0, end: 16, sentence_start: 1, sentence_end: 1 }],
          },
        ],
        topic_summaries: {},
        // No topic_marker_summaries
      },
    };

    const { result } = renderHook(() =>
      useTextPageData(submission, [{ name: "Topic1" }], null, new Set()),
    );

    // Should have empty marker_spans array
    expect(result.current.allTopics[0].marker_spans).toEqual([]);
  });

  it("resolves topic source range by sentence_start/sentence_end when range_index is invalid", () => {
    const submission = {
      text_content: "Alpha Beta Gamma",
      results: {
        sentences: ["Alpha Beta Gamma"],
        topics: [
          {
            name: "Topic1",
            sentences: [1],
            ranges: [
              { start: 0, end: 5, sentence_start: 1, sentence_end: 1 },
              { start: 6, end: 10, sentence_start: 1, sentence_end: 1 },
            ],
          },
        ],
        topic_summaries: {},
        topic_marker_summaries: {
          Topic1: {
            ranges: [
              {
                range_index: 99,
                sentence_start: 1,
                sentence_end: 1,
                marker_spans: [{ start_word: 1, end_word: 1, text: "Alpha" }],
                summary_text: "Alpha",
              },
            ],
          },
        },
      },
    };

    const { result } = renderHook(() =>
      useTextPageData(submission, [{ name: "Topic1" }], null, new Set()),
    );

    // Should still resolve by sentence_start/sentence_end match
    expect(result.current.allTopics[0].summaryHighlightRanges).toEqual([
      { start: 0, end: 5 },
    ]);
  });

  it("returns empty highlight ranges when marker_spans are invalid", () => {
    const submission = {
      text_content: "Alpha Beta Gamma",
      results: {
        sentences: ["Alpha Beta Gamma"],
        topics: [
          {
            name: "Topic1",
            sentences: [1],
            ranges: [{ start: 0, end: 16, sentence_start: 1, sentence_end: 1 }],
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
                marker_spans: [
                  { start_word: 99, end_word: 99, text: "Invalid" },
                ],
                summary_text: "Invalid",
              },
            ],
          },
        },
      },
    };

    const { result } = renderHook(() =>
      useTextPageData(submission, [{ name: "Topic1" }], null, new Set()),
    );

    // Invalid marker_spans (out of range) should result in empty ranges
    expect(result.current.allTopics[0].summaryHighlightRanges).toEqual([]);
  });

  it("sorts insightNavItems by index when firstSentenceIndex is equal", () => {
    const submission = {
      text_content: "Alpha Beta Gamma Delta",
      results: {
        sentences: ["Alpha Beta Gamma Delta"],
        topics: [
          {
            name: "Topic1",
            sentences: [1],
            ranges: [{ start: 0, end: 22, sentence_start: 1, sentence_end: 1 }],
          },
        ],
        topic_summaries: {},
        insights: [
          {
            name: "Insight B",
            source_sentence_indices: [1],
          },
          {
            name: "Insight A",
            source_sentence_indices: [1],
          },
        ],
      },
    };

    const { result } = renderHook(() =>
      useTextPageData(submission, [{ name: "Topic1" }], null, new Set()),
    );

    expect(result.current.insightNavItems[0].name).toBe("Insight B");
    expect(result.current.insightNavItems[1].name).toBe("Insight A");
  });
});
