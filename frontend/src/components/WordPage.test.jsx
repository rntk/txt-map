import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import WordPage from "./WordPage";

const mockUseSubmission = vi.fn();
const mockTextDisplay = vi.fn();
const mockCircularPackingChart = vi.fn();
const mockTreemapChart = vi.fn();
const mockWordTree = vi.fn();
const mockGetSimilarWords = vi.fn();

vi.mock("../hooks/useSubmission", () => ({
  useSubmission: (...args) => mockUseSubmission(...args),
}));

vi.mock("./TextDisplay", () => ({
  default: (props) => {
    mockTextDisplay(props);
    return <div data-testid="text-display">{props.sentences.join(" ")}</div>;
  },
}));

vi.mock("./CircularPackingChart", () => ({
  default: (props) => {
    mockCircularPackingChart(props);
    return <div data-testid="circular-packing-chart">Circles panel</div>;
  },
}));

vi.mock("./TreemapChart", () => ({
  default: (props) => {
    mockTreemapChart(props);
    return <div data-testid="treemap-chart">Treemap panel</div>;
  },
}));

vi.mock("./WordTree", () => ({
  __esModule: true,
  buildWordTreeEntries: (sentences, word) => {
    const safeSentences = Array.isArray(sentences) ? sentences : [];
    const normalizedWord = String(word || "").toLowerCase();
    return safeSentences
      .map((sentence, index) => ({
        sentence,
        index,
      }))
      .filter(({ sentence }) => sentence.toLowerCase().includes(normalizedWord))
      .map(({ sentence, index }) => ({
        id: `${index}-0-0`,
        sentenceIndex: index,
        sentenceNumber: index + 1,
        sentenceText: sentence,
        matchText: word,
        leftTokens: [],
        rightTokens: [],
        isRead: false,
      }));
  },
  default: (props) => {
    mockWordTree(props);
    return <div data-testid="word-tree">Tree panel</div>;
  },
}));

vi.mock("./TopicsTagCloud", () => ({
  default: () => <div data-testid="topics-tag-cloud">Tags Cloud panel</div>,
}));

vi.mock("./SummaryTimeline", () => ({
  default: () => <div data-testid="summary-timeline">Summaries panel</div>,
}));

vi.mock("./shared/TopicSentencesModal", () => ({
  default: () => <div data-testid="topic-sentences-modal" />,
}));

vi.mock("../utils/summaryTimeline", () => ({
  buildSummaryTimelineItems: () => [],
}));

describe("WordPage header layout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mockTextDisplay.mockClear();
    mockCircularPackingChart.mockClear();
    mockTreemapChart.mockClear();
    mockWordTree.mockClear();
    mockGetSimilarWords.mockReset();
    mockGetSimilarWords.mockImplementation(() => new Promise(() => {}));
    mockUseSubmission.mockReturnValue({
      submission: {
        status: {
          overall: "completed",
          tasks: {
            summarization: { status: "completed" },
          },
        },
        results: {
          sentences: ["Alpha beta gamma", "Another beta sentence"],
          topics: [
            {
              name: "Topic 1",
              sentences: [1],
              ranges: [
                {
                  start: 0,
                  end: 16,
                  sentence_start: 1,
                  sentence_end: 1,
                },
              ],
            },
          ],
          topic_marker_summaries: {
            "Topic 1": {
              ranges: [
                {
                  range_index: 1,
                  sentence_start: 1,
                  sentence_end: 1,
                  marker_spans: [
                    { start_word: 1, end_word: 2, text: "Alpha beta" },
                  ],
                  summary_text: "Alpha beta",
                },
              ],
            },
          },
          markup: {
            "Topic 1": {
              positions: [
                {
                  index: 1,
                  text: "Alpha beta gamma",
                  source_sentence_index: 1,
                },
              ],
              segments: [
                {
                  type: "plain",
                  position_indices: [1],
                  data: {},
                },
              ],
            },
          },
          topic_summaries: {
            "Topic 1": "Summary text",
          },
          summary: [],
          summary_mappings: [],
        },
      },
      loading: false,
      error: null,
      readTopics: new Set(),
      toggleRead: vi.fn(),
      getSimilarWords: mockGetSimilarWords,
    });

    window.history.pushState({}, "", "/page/word/sub-123/beta");
  });

  it("renders the tabs in the Back to Article header row and removes status refresh controls", () => {
    render(<WordPage />);

    expect(
      screen.getByRole("button", { name: /Back to Article/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sentences matching:")).toBeInTheDocument();
    const headerTabs = within(document.querySelector(".word-page-tab-bar"));
    expect(
      headerTabs.getByRole("button", { name: "Sentences" }),
    ).toBeInTheDocument();
    expect(
      headerTabs.getByRole("button", { name: "Tree" }),
    ).toBeInTheDocument();
    expect(
      headerTabs.getByRole("button", { name: "Topics (Circles)" }),
    ).toBeInTheDocument();
    expect(
      headerTabs.getByRole("button", { name: "Summaries" }),
    ).toBeInTheDocument();
    expect(
      headerTabs.getByRole("button", { name: "Tags Cloud" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Show tooltips")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Refresh/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/summarization/i)).not.toBeInTheDocument();
  });

  it("switches visible content when a different tab is selected", () => {
    render(<WordPage />);

    expect(screen.getByText("Sentences matching:")).toBeInTheDocument();
    expect(screen.getAllByTestId("text-display")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getByTestId("word-tree")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Topics (Circles)" }));
    expect(screen.getByTestId("circular-packing-chart")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Topics (Treemap)" }));
    expect(screen.getByTestId("treemap-chart")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Summaries" }));
    expect(screen.getByTestId("summary-timeline")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tags Cloud" }));
    expect(screen.getByTestId("topics-tag-cloud")).toBeInTheDocument();
  });

  it("passes tooltipEnabled and submissionId to TextDisplay", () => {
    render(<WordPage />);

    expect(mockTextDisplay).toHaveBeenCalled();
    const initialProps = mockTextDisplay.mock.calls[0][0];
    expect(initialProps.tooltipEnabled).toBe(true);
    expect(initialProps.submissionId).toBe("sub-123");

    fireEvent.click(screen.getByLabelText("Show tooltips"));

    const latestProps = mockTextDisplay.mock.calls.at(-1)[0];
    expect(latestProps.tooltipEnabled).toBe(false);
    expect(latestProps.submissionId).toBe("sub-123");
  });

  it("renders a summary keyword toggle on the sentences tab", () => {
    render(<WordPage />);

    const toggle = screen.getByLabelText("Highlight summary keywords");
    expect(toggle).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it("requests a refreshed word-context analysis when Analyze is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "pending",
          total: 1,
          completed: 0,
          highlights: {},
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WordPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Analyze word context" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/submission/sub-123/word-context-highlights",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ word: "beta", refresh: true }),
        }),
      );
    });
  });

  it("passes wordHighlightRanges to TextDisplay showing matched word positions", () => {
    render(<WordPage />);

    // With grouped sentences, word highlights are always shown
    const firstCallProps = mockTextDisplay.mock.calls[0][0];
    expect(firstCallProps.summaryHighlightRanges).toBeDefined();
    // The word "beta" appears in "Alpha beta gamma" at position 6-10
    expect(firstCallProps.summaryHighlightRanges).toContainEqual({
      start: 6,
      end: 10,
    });
    // The full range text should be displayed (for Topic 1 range 1-1, this is sentence 1)
    expect(firstCallProps.rawText).toBe("Alpha beta gamma");
    expect(firstCallProps.sentences).toEqual(["Alpha beta gamma"]);
  });

  it("shows all sentences in a range even if only some contain the matched word", () => {
    // Update mock to have a range spanning multiple sentences
    mockUseSubmission.mockReturnValue({
      submission: {
        status: {
          overall: "completed",
          tasks: {
            summarization: { status: "completed" },
          },
        },
        results: {
          sentences: ["First sentence", "Alpha beta gamma", "Last sentence"],
          topics: [
            {
              name: "Topic 1",
              sentences: [1, 2, 3],
              ranges: [
                {
                  start: 0,
                  end: 50,
                  sentence_start: 1,
                  sentence_end: 3,
                },
              ],
            },
          ],
          topic_marker_summaries: {},
          markup: {},
          topic_summaries: {},
          summary: [],
          summary_mappings: [],
        },
      },
      loading: false,
      error: null,
      readTopics: new Set(),
      toggleRead: vi.fn(),
      getSimilarWords: mockGetSimilarWords,
    });

    render(<WordPage />);

    // Should show all 3 sentences in the range, combined
    const callWithFullRange = mockTextDisplay.mock.calls.find(
      ([props]) => props.rawText?.includes("First sentence"),
    );
    expect(callWithFullRange).toBeDefined();
    const props = callWithFullRange[0];
    // All sentences in range 1-3 should be displayed
    expect(props.rawText).toBe(
      "First sentence Alpha beta gamma Last sentence",
    );
    expect(props.sentences).toEqual([
      "First sentence",
      "Alpha beta gamma",
      "Last sentence",
    ]);
    // Word highlight should be at "beta" position in combined text
    // "First sentence" = 13 chars + space = 14, "Alpha " = 5 chars + space = 6
    // So beta starts at position 21
    expect(props.summaryHighlightRanges).toContainEqual({
      start: 21,
      end: 25,
    });
  });

  it("groups consecutive topic sentences into one range when enrichedTopics has per-sentence ranges", () => {
    // Simulates real data: backend stored topic with multi-sentence range,
    // but useTextPageData.safeTopics expanded sentence_spans into per-sentence
    // ranges. The raw submission.results.topics still carries the full range
    // info (either via topic.ranges with sentence_start/end or topic.sentences),
    // which we must use to group sentences on the Sentences tab.
    mockUseSubmission.mockReturnValue({
      submission: {
        status: {
          overall: "completed",
          tasks: { summarization: { status: "completed" } },
        },
        results: {
          sentences: ["Intro line", "Alpha beta gamma", "Tail line"],
          topics: [
            {
              name: "Topic 1",
              sentences: [1, 2, 3],
              sentence_spans: [
                { sentence: 1, start: 0, end: 10 },
                { sentence: 2, start: 11, end: 27 },
                { sentence: 3, start: 28, end: 37 },
              ],
            },
          ],
          topic_marker_summaries: {},
          markup: {},
          topic_summaries: {},
          summary: [],
          summary_mappings: [],
        },
      },
      loading: false,
      error: null,
      readTopics: new Set(),
      toggleRead: vi.fn(),
      getSimilarWords: mockGetSimilarWords,
    });

    render(<WordPage />);

    const fullRangeCall = mockTextDisplay.mock.calls.find(
      ([props]) => props.rawText === "Intro line Alpha beta gamma Tail line",
    );
    expect(fullRangeCall).toBeDefined();
    const props = fullRangeCall[0];
    expect(props.sentences).toEqual([
      "Intro line",
      "Alpha beta gamma",
      "Tail line",
    ]);
    // "Intro line " (11) + "Alpha " (6) = 17 → "beta" at 17-21
    expect(props.summaryHighlightRanges).toContainEqual({
      start: 17,
      end: 21,
    });
  });

  it("forwards markup to modal-capable chart tabs", () => {
    render(<WordPage />);

    fireEvent.click(screen.getByRole("button", { name: "Topics (Circles)" }));
    expect(mockCircularPackingChart).toHaveBeenCalledWith(
      expect.objectContaining({
        markup: expect.objectContaining({
          "Topic 1": expect.any(Object),
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Topics (Treemap)" }));
    expect(mockTreemapChart).toHaveBeenCalledWith(
      expect.objectContaining({
        markup: expect.objectContaining({
          "Topic 1": expect.any(Object),
        }),
      }),
    );
  });

  it("navigates back to TextPage when a chart requests Show in article", () => {
    const originalLocation = window.location;
    const mockLocation = {
      _href: "http://localhost/page/word/sub-123/beta",
      pathname: "/page/word/sub-123/beta",
      search: "",
      get href() {
        return this._href;
      },
      set href(value) {
        this._href = value;
        const nextUrl = new URL(value, "http://localhost");
        this.pathname = nextUrl.pathname;
        this.search = nextUrl.search;
      },
    };

    Object.defineProperty(window, "location", {
      configurable: true,
      value: mockLocation,
    });

    try {
      render(<WordPage />);

      fireEvent.click(screen.getByRole("button", { name: "Topics (Circles)" }));

      const chartProps = mockCircularPackingChart.mock.calls.at(-1)[0];
      chartProps.onShowInArticle({ fullPath: "Topic 1" });

      expect(window.location.pathname).toBe("/page/text/sub-123");
      expect(window.location.search).toBe("?topic=Topic%201");
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it("marks tree entries as read when their sentence belongs to a read topic", () => {
    mockUseSubmission.mockReturnValue({
      submission: {
        results: {
          sentences: ["Alpha beta gamma", "Another beta sentence"],
          topics: [
            {
              name: "Topic 1",
              sentences: [2],
            },
          ],
          topic_summaries: {},
          summary: [],
          summary_mappings: [],
        },
      },
      loading: false,
      error: null,
      readTopics: new Set(["Topic 1"]),
      toggleRead: vi.fn(),
      getSimilarWords: mockGetSimilarWords,
    });

    render(<WordPage />);

    fireEvent.click(screen.getByRole("button", { name: "Tree" }));

    expect(mockWordTree).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({
            sentenceNumber: 2,
            isRead: true,
          }),
        ]),
      }),
    );
  });
});
