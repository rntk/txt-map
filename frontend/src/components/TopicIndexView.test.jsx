import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const mockUseArticle = vi.fn();

vi.mock("../contexts/ArticleContext", () => ({
  useArticle: () => mockUseArticle(),
}));

import TopicIndexView from "./TopicIndexView";

vi.mock("./FullScreenGraph", () => ({
  default: ({ children, title }) => (
    <div data-testid="fullscreen-graph">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const defaultProps = {
  articles: [
    {
      sentences: [
        "Alpha markets opened higher.",
        "Beta research changed direction.",
        "Gamma results stayed stable.",
        "Delta policy shifted quickly.",
        "Epsilon reporting continued.",
        "Zeta inventory was constrained.",
        "Eta analysts revised estimates.",
        "Theta demand remained elevated.",
      ],
    },
  ],
  safeTopics: [],
  readTopics: new Set(),
  onToggleRead: vi.fn(),
  onClose: vi.fn(),
};

const defaultArticleContextValue = {
  submission: {
    results: {
      topic_summaries: {},
      subtopics: [],
      clusters: [],
      topic_model: {},
    },
  },
  topicSummaries: {},
  markup: {},
};

afterEach(() => {
  vi.restoreAllMocks();
  mockUseArticle.mockReturnValue(defaultArticleContextValue);
});

function renderTopicIndex(overrides = {}) {
  return render(<TopicIndexView {...defaultProps} {...overrides} />);
}

function setArticleContext(overrides = {}) {
  mockUseArticle.mockReturnValue({
    ...defaultArticleContextValue,
    ...overrides,
    submission: {
      ...defaultArticleContextValue.submission,
      ...(overrides.submission || {}),
      results: {
        ...defaultArticleContextValue.submission.results,
        ...(overrides.submission?.results || {}),
      },
    },
    topicSummaries: {
      ...defaultArticleContextValue.topicSummaries,
      ...(overrides.topicSummaries || {}),
    },
  });
}

function getTiles() {
  return Array.from(document.querySelectorAll(".topic-index-view__tile"));
}

beforeEach(() => {
  mockUseArticle.mockReturnValue(defaultArticleContextValue);
});

describe("TopicIndexView", () => {
  it("renders one tile per explicit separated range", () => {
    renderTopicIndex({
      safeTopics: [
        {
          name: "Science > Biology > Genetics",
          sentences: [1, 2, 4, 5],
          ranges: [
            { sentence_start: 1, sentence_end: 2, start: 0, end: 10 },
            { sentence_start: 4, sentence_end: 5, start: 20, end: 30 },
          ],
        },
      ],
    });

    const tiles = getTiles();

    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAttribute(
      "data-topic-segment-key",
      "Science > Biology > Genetics::0",
    );
    expect(tiles[1]).toHaveAttribute(
      "data-topic-segment-key",
      "Science > Biology > Genetics::1",
    );
    expect(screen.getAllByText("2 sentences")).toHaveLength(2);
  });

  it("orders flattened tiles by article sentence position", () => {
    renderTopicIndex({
      safeTopics: [
        {
          name: "Later > Range",
          sentences: [6],
          ranges: [{ sentence_start: 6, sentence_end: 6, start: 50, end: 60 }],
        },
        {
          name: "Earlier > Range",
          sentences: [2],
          ranges: [{ sentence_start: 2, sentence_end: 2, start: 10, end: 20 }],
        },
        {
          name: "Middle > Range",
          sentences: [4],
          ranges: [{ sentence_start: 4, sentence_end: 4, start: 30, end: 40 }],
        },
      ],
    });

    expect(
      getTiles().map((tile) => tile.getAttribute("data-topic-name")),
    ).toEqual(["Earlier > Range", "Middle > Range", "Later > Range"]);
  });

  it("scales tile height with the range character count and caps long ranges", () => {
    renderTopicIndex({
      articles: [
        {
          sentences: [
            "Short.",
            "This sentence is intentionally much longer than the short sentence.",
            "A".repeat(600),
          ],
        },
      ],
      safeTopics: [
        {
          name: "Short > Range",
          sentences: [1],
          ranges: [{ sentence_start: 1, sentence_end: 1, start: 0, end: 10 }],
        },
        {
          name: "Long > Range",
          sentences: [2],
          ranges: [{ sentence_start: 2, sentence_end: 2, start: 20, end: 50 }],
        },
        {
          name: "Capped > Range",
          sentences: [3],
          ranges: [{ sentence_start: 3, sentence_end: 3, start: 0, end: 200 }],
        },
      ],
    });

    const tilesByName = new Map(
      getTiles().map((tile) => [tile.getAttribute("data-topic-name"), tile]),
    );
    const shortHeight = parseFloat(
      getComputedStyle(tilesByName.get("Short > Range")).getPropertyValue(
        "--topic-row-height",
      ),
    );
    const longHeight = parseFloat(
      getComputedStyle(tilesByName.get("Long > Range")).getPropertyValue(
        "--topic-row-height",
      ),
    );

    expect(tilesByName.get("Short > Range")).toHaveAttribute(
      "data-topic-range-chars",
      "6",
    );
    expect(tilesByName.get("Long > Range")).toHaveAttribute(
      "data-topic-range-chars",
      "67",
    );
    expect(longHeight).toBeGreaterThan(shortHeight);
    expect(
      getComputedStyle(tilesByName.get("Capped > Range")).getPropertyValue(
        "--topic-row-height",
      ),
    ).toBe("180px");
  });

  it("keeps multi-range read confirmation at the topic level", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onToggleRead = vi.fn();
    renderTopicIndex({
      safeTopics: [
        {
          name: "Science > Biology > Genetics",
          sentences: [1, 5],
          ranges: [
            { sentence_start: 1, sentence_end: 1, start: 0, end: 10 },
            { sentence_start: 5, sentence_end: 5, start: 20, end: 30 },
          ],
        },
      ],
      onToggleRead,
    });

    fireEvent.click(
      within(getTiles()[0]).getByRole("button", { name: "Mark as read" }),
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      '"Science > Biology > Genetics" has 2 separate ranges. Some may not be visible on screen. Mark as read?',
    );
    expect(onToggleRead).not.toHaveBeenCalled();
  });

  it("defaults the tile metadata switcher to tags", () => {
    renderTopicIndex({
      submissionId: "submission-1",
      safeTopics: [
        {
          name: "Alpha > Markets",
          sentences: [1, 2],
        },
      ],
    });

    const tile = getTiles()[0];
    expect(
      within(tile).getByText("Tags", {
        selector: ".topic-index-view__tile-meta-title",
      }),
    ).toBeInTheDocument();
    expect(
      within(tile).getByRole("link", { name: /markets/i }),
    ).toHaveAttribute("href", "/page/word/submission-1/markets");
  });

  it("switches tile metadata independently per tile", () => {
    setArticleContext({
      submission: {
        results: {
          topic_summaries: {
            "Alpha > Markets": "Markets summary text.",
            "Beta > Research": "Research summary text.",
          },
        },
      },
      topicSummaries: {
        "Alpha > Markets": "Markets summary text.",
        "Beta > Research": "Research summary text.",
      },
    });

    renderTopicIndex({
      safeTopics: [
        {
          name: "Alpha > Markets",
          sentences: [1, 2],
        },
        {
          name: "Beta > Research",
          sentences: [3, 4],
        },
      ],
    });

    const [firstTile, secondTile] = getTiles();
    fireEvent.click(
      within(firstTile).getByRole("button", {
        name: "Show next Summary for Alpha > Markets",
      }),
    );

    expect(within(firstTile).getByText("Summary")).toBeInTheDocument();
    expect(
      within(firstTile).getByText("Markets summary text."),
    ).toBeInTheDocument();
    expect(within(secondTile).getByText("Tags")).toBeInTheDocument();
  });

  it("rotates metadata categories with next and previous buttons", () => {
    setArticleContext({
      submission: {
        results: {
          topic_summaries: {
            "Alpha > Markets": "Markets summary text.",
          },
          subtopics: [
            {
              parent_topic: "Alpha > Markets",
              name: "Open",
              sentences: [1],
            },
          ],
        },
      },
      topicSummaries: {
        "Alpha > Markets": "Markets summary text.",
      },
    });

    renderTopicIndex({
      safeTopics: [
        {
          name: "Alpha > Markets",
          sentences: [1, 2],
        },
      ],
    });

    const tile = getTiles()[0];
    fireEvent.click(
      within(tile).getByRole("button", {
        name: "Show next Summary for Alpha > Markets",
      }),
    );
    expect(within(tile).getByText("Summary")).toBeInTheDocument();

    fireEvent.click(
      within(tile).getByRole("button", {
        name: "Show next Subtopics for Alpha > Markets",
      }),
    );
    expect(within(tile).getByText("Subtopics")).toBeInTheDocument();
    expect(within(tile).getByText("Open")).toBeInTheDocument();

    fireEvent.click(
      within(tile).getByRole("button", {
        name: "Show previous Summary for Alpha > Markets",
      }),
    );
    expect(within(tile).getByText("Summary")).toBeInTheDocument();
  });

  it("advances metadata when the content block is clicked", () => {
    setArticleContext({
      submission: {
        results: {
          topic_summaries: {
            "Alpha > Markets": "Markets summary text.",
          },
        },
      },
      topicSummaries: {
        "Alpha > Markets": "Markets summary text.",
      },
    });

    renderTopicIndex({
      safeTopics: [
        {
          name: "Alpha > Markets",
          sentences: [1, 2],
        },
      ],
    });

    const tile = getTiles()[0];
    fireEvent.click(tile.querySelector(".topic-index-view__tile-meta-content"));
    expect(within(tile).getByText("Summary")).toBeInTheDocument();
  });

  it("skips empty metadata categories and renders compact topic-analysis content", () => {
    setArticleContext({
      submission: {
        results: {
          topic_summaries: {
            "Alpha > Markets": "Markets summary text.",
          },
          subtopics: [
            {
              parent_topic: "Alpha > Markets",
              name: "Open",
              sentences: [1, 2],
            },
          ],
          clusters: [
            {
              cluster_id: 0,
              keywords: ["stocks", "trading", "futures"],
              sentence_indices: [1, 2],
            },
          ],
          topic_model: {
            latent_topics: [
              {
                id: 4,
                keywords: ["macro", "rates", "policy"],
                weight: 0.42,
              },
            ],
            topic_mapping: [
              {
                topic_name: "Alpha > Markets",
                latent_topic_ids: [4],
                scores: [0.61],
              },
            ],
          },
        },
      },
      topicSummaries: {
        "Alpha > Markets": "Markets summary text.",
      },
    });

    renderTopicIndex({
      submissionId: "submission-2",
      safeTopics: [
        {
          name: "Alpha > Markets",
          sentences: [1, 2],
        },
      ],
    });

    const tile = getTiles()[0];
    const nextButton = within(tile).getByRole("button", {
      name: "Show next Summary for Alpha > Markets",
    });

    fireEvent.click(nextButton);
    expect(within(tile).getByText("Summary")).toBeInTheDocument();

    fireEvent.click(nextButton);
    expect(within(tile).getByText("Subtopics")).toBeInTheDocument();

    fireEvent.click(nextButton);
    expect(within(tile).getByText("Latent Topics")).toBeInTheDocument();
    expect(within(tile).getByRole("link", { name: /macro/i })).toHaveAttribute(
      "href",
      "/page/word/submission-2/macro",
    );

    fireEvent.click(nextButton);
    expect(within(tile).getByText("Clusters")).toBeInTheDocument();
    expect(within(tile).getByText(/Cluster 1/)).toBeInTheDocument();

    fireEvent.click(nextButton);
    expect(within(tile).getByText("Tags")).toBeInTheDocument();
  });

  it("does not render switch buttons when only one metadata category is available", () => {
    renderTopicIndex({
      safeTopics: [
        {
          name: "Alpha > Markets",
          sentences: [1, 2],
        },
      ],
    });

    const tile = getTiles()[0];
    expect(within(tile).getByText("Tags")).toBeInTheDocument();
    expect(
      within(tile).queryByRole("button", {
        name: "Show next Summary for Alpha > Markets",
      }),
    ).not.toBeInTheDocument();
  });
});
