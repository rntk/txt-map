import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import TopicArticleFullscreenView, {
  estimateTopicNoteHeight,
} from "./TopicArticleFullscreenView";

vi.mock("./FullScreenGraph", () => ({
  default: ({ children, title }) => (
    <div data-testid="fullscreen-graph">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("./TextDisplay", () => ({
  default: ({ sentences }) => (
    <div>
      {sentences.map((sentence, index) => (
        <div key={index} id={`sentence-0-${index}`}>
          {sentence}
        </div>
      ))}
    </div>
  ),
}));

const defaultProps = {
  articles: [
    {
      sentences: ["First sentence.", "Second sentence.", "Third sentence."],
      topics: [],
      topic_summaries: {},
      paragraph_map: null,
      raw_html: "",
    },
  ],
  safeTopics: [],
  selectedTopics: [],
  hoveredTopic: null,
  readTopics: new Set(),
  onToggleRead: vi.fn(),
  onToggleTopic: vi.fn(),
  onNavigateTopic: vi.fn(),
  onShowSentences: vi.fn(),
  onOpenTopicSummaries: vi.fn(),
  tooltipEnabled: false,
  submissionId: "submission-1",
  activeInsightSentenceIndices: [],
  activeInsightRanges: [],
  coloredTopicNames: null,
  coloredHighlightMode: false,
  onClose: vi.fn(),
  setHoveredTopic: vi.fn(),
};

function buildSentences(count) {
  return Array.from({ length: count }, (_, index) => `Sentence ${index + 1}.`);
}

function queryTopicButtons(topicName) {
  return Array.from(
    document.querySelectorAll("button[data-topic-name]"),
  ).filter((element) => element.getAttribute("data-topic-name") === topicName);
}

function queryTopicButtonBySegment(topicName, segmentKey) {
  return (
    Array.from(
      document.querySelectorAll(
        "button[data-topic-name][data-topic-segment-key]",
      ),
    ).find(
      (element) =>
        element.getAttribute("data-topic-name") === topicName &&
        element.getAttribute("data-topic-segment-key") === segmentKey,
    ) || null
  );
}

function applyMockLayoutMetrics() {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      if (this.classList?.contains("topic-article-view__scroll")) {
        return 640;
      }
      return 0;
    },
  });

  HTMLElement.prototype.scrollTo = vi.fn(function scrollTo({ top }) {
    this.scrollTop = top;
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getBoundingClientRect() {
      if (this.classList?.contains("topic-article-view__article")) {
        return {
          top: 0,
          bottom: 640,
          left: 0,
          right: 600,
          width: 600,
          height: 640,
        };
      }

      if (this.classList?.contains("topic-article-view__scroll")) {
        return {
          top: 0,
          bottom: 640,
          left: 0,
          right: 800,
          width: 800,
          height: 640,
        };
      }

      const sentenceMatch = this.id?.match(/^sentence-0-(\d+)$/);
      if (sentenceMatch) {
        const index = Number(sentenceMatch[1]);
        const top = index * 160 + 40;
        return {
          top,
          bottom: top + 32,
          left: 0,
          right: 500,
          width: 500,
          height: 32,
        };
      }

      return {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
      };
    },
  );
}

describe("TopicArticleFullscreenView", () => {
  beforeEach(() => {
    applyMockLayoutMetrics();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderAndTriggerLayout(ui) {
    const result = render(ui);
    fireEvent(window, new Event("resize"));
    return result;
  }

  it("renders note titles without the top-level topic and keeps visible top-level areas sticky on the left", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1],
                ranges: [],
              },
              {
                name: "Science > Chemistry > Reactions",
                sentences: [2],
                ranges: [],
              },
              {
                name: "Business > Markets > Equities",
                sentences: [3],
                ranges: [],
              },
            ],
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(1);
    });
    const noteButton = queryTopicButtons("Science > Biology > Genetics")[0];

    expect(noteButton).toBeInTheDocument();
    expect(noteButton.textContent).not.toContain(">");
    expect(within(noteButton).queryByText("Science")).not.toBeInTheDocument();
    expect(within(noteButton).getByText("Biology")).toBeInTheDocument();
    expect(within(noteButton).getByText("Genetics")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("Current topic areas")).toHaveTextContent(
        "Science",
      );
    });

    const scrollRegion = screen.getByRole("region", {
      name: "Synced article scroll area",
    });
    scrollRegion.scrollTop = 170;
    fireEvent.scroll(scrollRegion);

    await waitFor(() => {
      expect(screen.getByLabelText("Current topic areas")).toHaveTextContent(
        "Science",
      );
      expect(screen.getByLabelText("Current topic areas")).toHaveTextContent(
        "Business",
      );
    });
    expect(
      document.querySelectorAll(".topic-article-view__current-area-label"),
    ).toHaveLength(2);

    scrollRegion.scrollTop = 360;
    fireEvent.scroll(scrollRegion);

    await waitFor(() => {
      const currentAreas = screen.getByLabelText("Current topic areas");
      expect(currentAreas).not.toHaveTextContent("Science");
      expect(currentAreas).toHaveTextContent("Business");
    });
  });

  it("falls back to the single topic name in both note and current-area labels", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            topics: [
              {
                name: "Science",
                sentences: [1],
                ranges: [],
              },
            ],
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science")).toHaveLength(1);
    });
    const noteButton = queryTopicButtons("Science")[0];

    expect(within(noteButton).getByText("Science")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Current topic areas")).toHaveTextContent(
        "Science",
      );
    });
  });

  it("estimates taller note cards for deeper topic paths", () => {
    expect(estimateTopicNoteHeight(["Biology"])).toBe(84);
    expect(estimateTopicNoteHeight(["Biology", "Genetics", "DNA"])).toBe(112);
  });

  it("renders one explicit-range note per visible range for the same topic", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            sentences: buildSentences(10),
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1, 2, 4, 5],
                ranges: [
                  { sentence_start: 1, sentence_end: 2, start: 0, end: 10 },
                  { sentence_start: 4, sentence_end: 5, start: 20, end: 30 },
                ],
              },
            ],
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(2);
    });
    expect(screen.getByText("Sentences 1-2")).toBeInTheDocument();
    expect(screen.getByText("Sentences 4-5")).toBeInTheDocument();
    expect(
      document.querySelectorAll(".topic-article-view__range-accent"),
    ).toHaveLength(2);
  });

  it("hides a topic note between separated explicit ranges and remounts it on the visible segment", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            sentences: buildSentences(10),
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1, 10],
                ranges: [
                  { sentence_start: 1, sentence_end: 1, start: 0, end: 10 },
                  { sentence_start: 10, sentence_end: 10, start: 20, end: 30 },
                ],
              },
            ],
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(
        queryTopicButtonBySegment(
          "Science > Biology > Genetics",
          "Science > Biology > Genetics::0",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Sentence 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Current topic areas")).toHaveTextContent(
      "Science",
    );

    const scrollRegion = screen.getByRole("region", {
      name: "Synced article scroll area",
    });

    scrollRegion.scrollTop = 200;
    fireEvent.scroll(scrollRegion);

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(0);
    });
    expect(
      screen.queryByLabelText("Current topic areas"),
    ).not.toBeInTheDocument();

    scrollRegion.scrollTop = 1280;
    fireEvent.scroll(scrollRegion);

    await waitFor(() => {
      expect(
        queryTopicButtonBySegment(
          "Science > Biology > Genetics",
          "Science > Biology > Genetics::1",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Sentence 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Current topic areas")).toHaveTextContent(
      "Science",
    );
  });

  it("splits non-consecutive sentence lists into separate visible note segments when ranges are absent", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            sentences: buildSentences(10),
            topics: [
              {
                name: "Business > Markets > Equities",
                sentences: [2, 3, 9, 10],
                ranges: [],
              },
            ],
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Business > Markets > Equities")).toHaveLength(
        1,
      );
    });
    expect(screen.getByText("Sentences 2-3")).toBeInTheDocument();

    const scrollRegion = screen.getByRole("region", {
      name: "Synced article scroll area",
    });

    scrollRegion.scrollTop = 450;
    fireEvent.scroll(scrollRegion);

    await waitFor(() => {
      expect(queryTopicButtons("Business > Markets > Equities")).toHaveLength(
        0,
      );
    });

    scrollRegion.scrollTop = 1280;
    fireEvent.scroll(scrollRegion);

    await waitFor(() => {
      expect(queryTopicButtons("Business > Markets > Equities")).toHaveLength(
        1,
      );
    });
    expect(screen.getByText("Sentences 9-10")).toBeInTheDocument();
  });

  it("shows a left-side summary card for the hovered topic note", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1],
                ranges: [],
              },
            ],
            topic_summaries: {
              "Science > Biology > Genetics":
                "A short explanation of the genetics topic.",
            },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(1);
    });

    fireEvent.mouseEnter(queryTopicButtons("Science > Biology > Genetics")[0]);

    await waitFor(() => {
      const summaryCard = screen.getByLabelText(
        "Summary for Science > Biology > Genetics",
      );
      expect(within(summaryCard).getByText("Summary")).toBeInTheDocument();
      expect(summaryCard).toHaveTextContent(
        "A short explanation of the genetics topic.",
      );
    });
  });

  it("keeps the summary card visible after click when the pointer leaves", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1],
                ranges: [],
              },
            ],
            topic_summaries: {
              "Science > Biology > Genetics":
                "Pinned summary text remains visible.",
            },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(1);
    });

    const noteButton = queryTopicButtons("Science > Biology > Genetics")[0];
    fireEvent.click(noteButton);
    fireEvent.mouseLeave(noteButton);

    await waitFor(() => {
      expect(
        screen.getByLabelText("Summary for Science > Biology > Genetics"),
      ).toHaveTextContent("Pinned summary text remains visible.");
    });
  });

  it("does not render a summary card when the topic has no summary", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1],
                ranges: [],
              },
            ],
            topic_summaries: {},
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(1);
    });

    fireEvent.mouseEnter(queryTopicButtons("Science > Biology > Genetics")[0]);

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Summary for Science > Biology > Genetics"),
      ).not.toBeInTheDocument();
    });
  });

  it("does not render a summary card from external hoveredTopic without note interaction", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        hoveredTopic={{ name: "Science > Biology > Genetics" }}
        articles={[
          {
            ...defaultProps.articles[0],
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1],
                ranges: [],
              },
            ],
            topic_summaries: {
              "Science > Biology > Genetics": "Should only show on note interaction.",
            },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(1);
    });

    expect(
      screen.queryByLabelText("Summary for Science > Biology > Genetics"),
    ).not.toBeInTheDocument();
  });
});
