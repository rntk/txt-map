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

  it("defaults the tile metadata switcher to Key Phrases", () => {
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
      within(tile).getByText("Key Phrases", {
        selector: ".topic-index-view__tile-meta-title",
      }),
    ).toBeInTheDocument();
    // Key phrase pills should be rendered in the keyphrases container
    expect(
      tile.querySelector(".topic-index-view__tile-keyphrases"),
    ).toBeInTheDocument();
  });

  it("switches tile metadata independently per tile", () => {
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
    // Advance first tile to Tags (next after Key Phrases, with no subtopics)
    fireEvent.click(
      within(firstTile).getByRole("button", {
        name: "Show next Tags for Alpha > Markets",
      }),
    );

    expect(within(firstTile).getByText("Tags")).toBeInTheDocument();
    // Second tile stays at Key Phrases
    expect(
      within(secondTile).getByText("Key Phrases", {
        selector: ".topic-index-view__tile-meta-title",
      }),
    ).toBeInTheDocument();
  });

  it("rotates metadata categories with next and previous buttons", () => {
    setArticleContext({
      submission: {
        results: {
          subtopics: [
            {
              parent_topic: "Alpha > Markets",
              name: "Open",
              sentences: [1],
            },
          ],
        },
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

    // Order: key_phrases (0) -> subtopics (1) -> tags (2)
    const tile = getTiles()[0];
    fireEvent.click(
      within(tile).getByRole("button", {
        name: "Show next Subtopics for Alpha > Markets",
      }),
    );
    expect(within(tile).getByText("Subtopics")).toBeInTheDocument();
    expect(within(tile).getByText("Open")).toBeInTheDocument();

    fireEvent.click(
      within(tile).getByRole("button", {
        name: "Show next Tags for Alpha > Markets",
      }),
    );
    expect(within(tile).getByText("Tags")).toBeInTheDocument();

    fireEvent.click(
      within(tile).getByRole("button", {
        name: "Show previous Subtopics for Alpha > Markets",
      }),
    );
    expect(within(tile).getByText("Subtopics")).toBeInTheDocument();

    fireEvent.click(
      within(tile).getByRole("button", {
        name: "Show previous Key Phrases for Alpha > Markets",
      }),
    );
    expect(within(tile).getByText("Key Phrases")).toBeInTheDocument();
  });

  it("advances metadata when the content block is clicked", () => {
    renderTopicIndex({
      safeTopics: [
        {
          name: "Alpha > Markets",
          sentences: [1, 2],
        },
      ],
    });

    // With no subtopics, categories are: key_phrases -> tags
    const tile = getTiles()[0];
    expect(within(tile).getByText("Key Phrases")).toBeInTheDocument();
    fireEvent.click(tile.querySelector(".topic-index-view__tile-meta-content"));
    expect(within(tile).getByText("Tags")).toBeInTheDocument();
  });

  it("skips removed metadata categories and cycles key_phrases > subtopics > tags", () => {
    setArticleContext({
      submission: {
        results: {
          subtopics: [
            {
              parent_topic: "Alpha > Markets",
              name: "Open",
              sentences: [1, 2],
            },
          ],
          // clusters and topic_model are no longer shown in tiles
          clusters: [
            {
              cluster_id: 0,
              keywords: ["stocks", "trading"],
              sentence_indices: [1, 2],
            },
          ],
          topic_model: {
            latent_topics: [{ id: 4, keywords: ["macro", "rates"], weight: 0.42 }],
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

    // Categories: key_phrases (0) -> subtopics (1) -> tags (2)
    const tile = getTiles()[0];
    expect(within(tile).getByText("Key Phrases")).toBeInTheDocument();

    const nextButton = within(tile).getByRole("button", {
      name: "Show next Subtopics for Alpha > Markets",
    });
    fireEvent.click(nextButton);
    expect(within(tile).getByText("Subtopics")).toBeInTheDocument();
    expect(within(tile).getByText("Open")).toBeInTheDocument();

    fireEvent.click(
      within(tile).getByRole("button", {
        name: "Show next Tags for Alpha > Markets",
      }),
    );
    expect(within(tile).getByText("Tags")).toBeInTheDocument();

    // Latent Topics and Clusters are no longer in the tile cycle
    expect(within(tile).queryByText("Latent Topics")).not.toBeInTheDocument();
    expect(within(tile).queryByText("Clusters")).not.toBeInTheDocument();
  });

  it("shows switch buttons when key_phrases and tags are both available", () => {
    renderTopicIndex({
      safeTopics: [
        {
          name: "Alpha > Markets",
          sentences: [1, 2],
        },
      ],
    });

    const tile = getTiles()[0];
    // Key Phrases is the default
    expect(within(tile).getByText("Key Phrases")).toBeInTheDocument();
    // Switch buttons are present since both key_phrases and tags are available
    expect(
      within(tile).getByRole("button", {
        name: "Show next Tags for Alpha > Markets",
      }),
    ).toBeInTheDocument();
  });
});
