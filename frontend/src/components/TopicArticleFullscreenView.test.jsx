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
  default: ({
    sentences,
    activeInsightSentenceIndices = [],
    interactiveSentenceIndices = [],
    interactiveHighlightClassName = "",
    dimmedSentenceIndices = [],
    dimmedHighlightClassName = "",
  }) => {
    const highlightedSet = new Set(activeInsightSentenceIndices);
    const interactiveSet = new Set(interactiveSentenceIndices);
    const dimmedSet = new Set(dimmedSentenceIndices);
    return (
      <div className="text-content reading-article__content">
        {sentences.map((sentence, index) => (
          <span
            key={index}
            id={`sentence-0-${index}`}
            data-article-index="0"
            data-sentence-index={index}
            className={`reading-article__sentence${highlightedSet.has(index + 1) ? " highlighted" : ""}`}
          >
            {interactiveSet.has(index + 1) ? (
              <span
                className={`word-token ${interactiveHighlightClassName}${dimmedSet.has(index + 1) ? ` ${dimmedHighlightClassName}` : ""}`}
                data-sentence-index={index}
              >
                {sentence}
              </span>
            ) : (
              sentence
            )}
          </span>
        ))}
      </div>
    );
  },
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

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getBoundingClientRect() {
      if (this.classList?.contains("topic-article-view__article")) {
        return {
          top: 0,
          bottom: 1600,
          left: 0,
          right: 600,
          width: 600,
          height: 1600,
        };
      }

      if (this.classList?.contains("topic-article-view__scroll")) {
        return {
          top: 0,
          bottom: 640,
          left: 0,
          right: 900,
          width: 900,
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

  it("renders overlay titles without the top-level topic and keeps visible top-level areas sticky on the left", async () => {
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
    const overlayButton = queryTopicButtons("Science > Biology > Genetics")[0];

    expect(overlayButton).toBeInTheDocument();
    expect(overlayButton.textContent).not.toContain(">");
    expect(
      within(overlayButton).queryByText("Science"),
    ).not.toBeInTheDocument();
    expect(within(overlayButton).getByText("Biology")).toBeInTheDocument();
    expect(within(overlayButton).getByText("Genetics")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("Current topic areas")).toHaveTextContent(
        "Science",
      );
    });

    const scrollRegion = screen.getByRole("region", {
      name: "Synced article scroll area",
    });
    scrollRegion.scrollTop = 330;
    fireEvent.scroll(scrollRegion);

    await waitFor(() => {
      expect(screen.getByLabelText("Current topic areas")).toHaveTextContent(
        "Business",
      );
    });
  });

  it("estimates overlay heights from topic depth", () => {
    expect(estimateTopicNoteHeight(["Biology"])).toBe(76);
    expect(estimateTopicNoteHeight(["Biology", "Genetics", "DNA"])).toBe(112);
  });

  it("renders one overlay per explicit range and one accent per segment", async () => {
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

  it("reveals only the clicked segment and restores the overlay when the source range is clicked", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            sentences: buildSentences(6),
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1, 5],
                ranges: [
                  { sentence_start: 1, sentence_end: 1, start: 0, end: 10 },
                  { sentence_start: 5, sentence_end: 5, start: 20, end: 30 },
                ],
              },
            ],
          },
        ]}
      />,
    );

    const firstSegment = "Science > Biology > Genetics::0";
    const secondSegment = "Science > Biology > Genetics::1";

    await waitFor(() => {
      expect(
        queryTopicButtonBySegment("Science > Biology > Genetics", firstSegment),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      queryTopicButtonBySegment("Science > Biology > Genetics", firstSegment),
    );

    await waitFor(() => {
      expect(
        queryTopicButtonBySegment("Science > Biology > Genetics", firstSegment),
      ).not.toBeInTheDocument();
    });
    expect(
      queryTopicButtonBySegment("Science > Biology > Genetics", secondSegment),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".topic-article-view__revealed-token"),
    ).toBeInTheDocument();
    expect(document.getElementById("sentence-0-0")).toHaveClass("highlighted");
    expect(document.getElementById("sentence-0-4")).not.toHaveClass(
      "highlighted",
    );

    fireEvent.click(
      document.querySelector(".topic-article-view__revealed-token"),
    );

    await waitFor(() => {
      expect(
        queryTopicButtonBySegment("Science > Biology > Genetics", firstSegment),
      ).toBeInTheDocument();
    });
    expect(document.getElementById("sentence-0-0")).not.toHaveClass(
      "highlighted",
    );
  });

  it("assigns separate overlay lanes to overlapping topic ranges", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            sentences: buildSentences(4),
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1, 2],
                ranges: [
                  { sentence_start: 1, sentence_end: 2, start: 0, end: 10 },
                ],
              },
              {
                name: "Science > Biology > DNA",
                sentences: [2, 3],
                ranges: [
                  { sentence_start: 2, sentence_end: 3, start: 11, end: 20 },
                ],
              },
            ],
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(1);
      expect(queryTopicButtons("Science > Biology > DNA")).toHaveLength(1);
    });

    const anchors = Array.from(
      document.querySelectorAll(".topic-article-view__overlay-anchor"),
    );
    const laneValues = anchors.map((element) =>
      element.style.getPropertyValue("--topic-overlay-lane"),
    );

    expect(new Set(laneValues).size).toBeGreaterThan(1);
  });

  it("renders read topics with the read-state overlay treatment and dims revealed read source text", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        readTopics={new Set(["Science"])}
        articles={[
          {
            ...defaultProps.articles[0],
            sentences: buildSentences(3),
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1],
                ranges: [],
              },
            ],
            topic_summaries: {
              "Science > Biology > Genetics": "Read topic summary.",
            },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(1);
    });

    const overlayAnchor = document.querySelector(
      ".topic-article-view__overlay-anchor",
    );
    expect(overlayAnchor).toHaveClass(
      "topic-article-view__overlay-anchor--read",
    );

    fireEvent.click(queryTopicButtons("Science > Biology > Genetics")[0]);

    await waitFor(() => {
      expect(
        document.querySelector(".topic-article-view__revealed-token--read"),
      ).toBeInTheDocument();
    });
  });

  it("shows the summary card for the hovered overlay and keeps read controls there", async () => {
    const onToggleRead = vi.fn();

    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        onToggleRead={onToggleRead}
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

    const summaryCard = await screen.findByLabelText(
      "Summary for Science > Biology > Genetics",
    );
    expect(summaryCard).toHaveTextContent(
      "A short explanation of the genetics topic.",
    );
    expect(
      within(summaryCard).getByRole("button", { name: "Show source" }),
    ).toBeInTheDocument();
    const readButton = within(summaryCard).getByRole("button", {
      name: "Mark as read",
    });

    fireEvent.click(readButton);

    expect(onToggleRead).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "topic",
        name: "Science > Biology > Genetics",
        displayName: "Science > Biology > Genetics",
        canonicalTopicNames: ["Science > Biology > Genetics"],
        sentenceIndices: [1],
      }),
    );
  });

  it("renders a topic-specific tf-idf tag cloud in the topic note", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        articles={[
          {
            ...defaultProps.articles[0],
            sentences: [
              "Report genome genome crispr findings.",
              "Report genome cell editing results.",
              "Report market stocks rally today.",
              "Report market bonds shift today.",
            ],
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1, 2],
                ranges: [],
              },
              {
                name: "Business > Markets > Equities",
                sentences: [3, 4],
                ranges: [],
              },
            ],
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(1);
      expect(queryTopicButtons("Business > Markets > Equities")).toHaveLength(
        1,
      );
    });

    const geneticsButton = queryTopicButtons("Science > Biology > Genetics")[0];
    const marketsButton = queryTopicButtons("Business > Markets > Equities")[0];

    expect(within(geneticsButton).getByText("genome")).toBeInTheDocument();
    expect(within(geneticsButton).getByText("crispr")).toBeInTheDocument();
    expect(
      within(geneticsButton).queryByText("market"),
    ).not.toBeInTheDocument();
    expect(
      within(geneticsButton).queryByText("report"),
    ).not.toBeInTheDocument();

    expect(within(marketsButton).getByText("market")).toBeInTheDocument();
    expect(within(marketsButton).getByText("stocks")).toBeInTheDocument();
    expect(within(marketsButton).queryByText("genome")).not.toBeInTheDocument();
  });

  it("renders mark unread for read topics in the summary card", async () => {
    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        readTopics={new Set(["Science"])}
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
              "Science > Biology > Genetics": "Read state lives in the card.",
            },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(1);
    });
    fireEvent.mouseEnter(queryTopicButtons("Science > Biology > Genetics")[0]);

    const summaryCard = await screen.findByLabelText(
      "Summary for Science > Biology > Genetics",
    );
    expect(
      within(summaryCard).getByRole("button", { name: "Mark unread" }),
    ).toBeInTheDocument();
  });

  it("confirms before marking a multi-range topic as read from the summary card", async () => {
    const onToggleRead = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderAndTriggerLayout(
      <TopicArticleFullscreenView
        {...defaultProps}
        onToggleRead={onToggleRead}
        articles={[
          {
            ...defaultProps.articles[0],
            sentences: buildSentences(6),
            topics: [
              {
                name: "Science > Biology > Genetics",
                sentences: [1, 5],
                ranges: [
                  { sentence_start: 1, sentence_end: 1, start: 0, end: 10 },
                  { sentence_start: 5, sentence_end: 5, start: 20, end: 30 },
                ],
              },
            ],
            topic_summaries: {
              "Science > Biology > Genetics": "Confirm first.",
            },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(queryTopicButtons("Science > Biology > Genetics")).toHaveLength(2);
    });
    fireEvent.mouseEnter(queryTopicButtons("Science > Biology > Genetics")[0]);

    const summaryCard = await screen.findByLabelText(
      "Summary for Science > Biology > Genetics",
    );
    fireEvent.click(
      within(summaryCard).getByRole("button", { name: "Mark as read" }),
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      '"Science > Biology > Genetics" has 2 separate ranges. Some may not be visible on screen. Mark as read?',
    );
    expect(onToggleRead).not.toHaveBeenCalled();
  });
});
