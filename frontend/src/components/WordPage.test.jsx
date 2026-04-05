import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import WordPage from "./WordPage";

const mockUseSubmission = vi.fn();
const mockTextDisplay = vi.fn();
const mockCircularPackingChart = vi.fn();
const mockTreemapChart = vi.fn();
const mockWordTree = vi.fn();

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
  beforeEach(() => {
    mockTextDisplay.mockClear();
    mockCircularPackingChart.mockClear();
    mockTreemapChart.mockClear();
    mockWordTree.mockClear();
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
            },
          ],
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
    });

    window.history.pushState({}, "", "/page/word/sub-123/beta");
  });

  it("renders the tabs in the Back to Article header row and removes status refresh controls", () => {
    render(<WordPage />);

    expect(
      screen.getByRole("button", { name: /Back to Article/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sentences matching:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sentences" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tree" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Topics (Circles)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Summaries" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tags Cloud" }),
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
