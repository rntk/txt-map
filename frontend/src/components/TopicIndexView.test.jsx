import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

afterEach(() => {
  vi.restoreAllMocks();
});

function renderTopicIndex(overrides = {}) {
  return render(<TopicIndexView {...defaultProps} {...overrides} />);
}

function getTiles() {
  return Array.from(document.querySelectorAll(".topic-index-view__tile"));
}

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
});
