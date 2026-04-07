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

    const noteButton = await waitFor(() =>
      document.querySelector(
        'button[data-topic-name="Science > Biology > Genetics"]',
      ),
    );

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

    const noteButton = await waitFor(() =>
      document.querySelector('button[data-topic-name="Science"]'),
    );

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
});
