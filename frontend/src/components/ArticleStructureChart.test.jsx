import React from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ArticleStructureChart, {
  buildScopedChartData,
  getScopedMaxLevel,
} from "./ArticleStructureChart";

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {
      this.callback([{ contentRect: { width: 800 } }]);
    }

    unobserve() {}

    disconnect() {}
  };
});

describe("ArticleStructureChart scope helpers", () => {
  const topics = [
    { name: "Science", sentences: [1, 2] },
    { name: "Science>Physics", sentences: [3, 4] },
    { name: "Science>Physics>Quantum", sentences: [5] },
    { name: "Science>Biology", sentences: [6] },
    { name: "Arts>Music", sentences: [7] },
  ];

  const sentences = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];

  it("computes max depth relative to the current scope", () => {
    expect(getScopedMaxLevel(topics, [])).toBe(2);
    expect(getScopedMaxLevel(topics, ["Science"])).toBe(1);
    expect(getScopedMaxLevel(topics, ["Science", "Physics"])).toBe(0);
  });

  it("builds chart data only for descendants within the current scope", () => {
    const rootData = buildScopedChartData(topics, sentences, [], 0);
    expect(rootData.map((item) => item.displayName)).toEqual([
      "Science",
      "Arts",
    ]);

    const scienceLevelZero = buildScopedChartData(
      topics,
      sentences,
      ["Science"],
      0,
    );
    expect(scienceLevelZero.map((item) => item.displayName)).toEqual([
      "Physics",
      "Biology",
    ]);

    const scienceLevelOne = buildScopedChartData(
      topics,
      sentences,
      ["Science"],
      1,
    );
    expect(scienceLevelOne.map((item) => item.displayName)).toEqual([
      "Quantum",
    ]);
    expect(scienceLevelOne[0].fullPath).toBe("Science>Physics>Quantum");
  });
});

describe("ArticleStructureChart component", () => {
  const topics = [
    { name: "Science", sentences: [1, 2] },
    { name: "Science>Physics", sentences: [3, 4] },
    { name: "Science>Physics>Quantum", sentences: [5] },
    { name: "Science>Biology", sentences: [6] },
    { name: "Arts>Music", sentences: [7] },
  ];

  const sentences = [
    "Sentence one.",
    "Sentence two.",
    "Sentence three.",
    "Sentence four.",
    "Sentence five.",
    "Sentence six.",
    "Sentence seven.",
  ];

  it("renders root scope controls and root-level topics", () => {
    render(<ArticleStructureChart topics={topics} sentences={sentences} />);

    expect(screen.getByText("Level:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "L0" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "L1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Showing all topics at relative level 0 (Main Topics)."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Topics" })).toBeDisabled();
    expect(screen.getAllByText("Science").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Arts").length).toBeGreaterThan(0);
  });

  it("drills into a branch from a deeper level and resets to level 0", () => {
    render(<ArticleStructureChart topics={topics} sentences={sentences} />);

    fireEvent.click(
      screen.getByRole("button", { name: "L1" }),
    );
    fireEvent.click(
      screen.getByTestId("article-structure-block-science-physics"),
    );

    expect(
      screen.getByText("Inside Physics at relative level 0 (Main Topics)."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Physics" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "L0" }),
    ).toHaveClass("active");
    expect(screen.getAllByText("Quantum").length).toBeGreaterThan(0);
    expect(
      screen.queryByTestId("article-structure-block-arts-music"),
    ).not.toBeInTheDocument();
  });

  it("preserves the selected relative level when navigating back through breadcrumbs", () => {
    render(<ArticleStructureChart topics={topics} sentences={sentences} />);

    fireEvent.click(screen.getByTestId("article-structure-block-science"));
    fireEvent.click(
      screen.getByRole("button", { name: "L1" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "All Topics" }));

    expect(
      screen.getByText("Showing all topics at relative level 1 (Subtopics)."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "L1" }),
    ).toHaveClass("active");
    expect(screen.getAllByText("Music").length).toBeGreaterThan(0);
  });

  it("does not drill into a leaf topic", () => {
    render(<ArticleStructureChart topics={topics} sentences={sentences} />);

    fireEvent.click(screen.getByTestId("article-structure-block-science"));
    fireEvent.click(
      screen.getByTestId("article-structure-block-science-biology"),
    );

    expect(
      screen.getByText("Inside Science at relative level 0 (Main Topics)."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Science" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Biology" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Physics").length).toBeGreaterThan(0);
  });
});
