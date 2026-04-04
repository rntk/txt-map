import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CircularPackingChart, {
  buildScopedHierarchy,
} from "./CircularPackingChart";

describe("CircularPackingChart hierarchy helpers", () => {
  const topics = [
    { name: "Science", sentences: [1, 2, 3] },
    { name: "Science>Physics", sentences: [4, 5] },
    { name: "Science>Physics>Quantum", sentences: [6] },
    { name: "Science>Biology", sentences: [7, 8] },
    { name: "Arts>Music", sentences: [9] },
  ];

  it("builds the full hierarchy at level 0 with empty scope", () => {
    const hierarchy = buildScopedHierarchy(topics, [], 0);

    expect(hierarchy.children.map((child) => child.name)).toEqual([
      "Science",
      "Arts",
    ]);
    expect(hierarchy.children[0].children.map((child) => child.name)).toEqual([
      "Physics",
      "Biology",
    ]);
  });

  it("re-roots the hierarchy from the selected level with empty scope", () => {
    const hierarchy = buildScopedHierarchy(topics, [], 1);

    expect(hierarchy.children.map((child) => child.name)).toEqual([
      "Physics",
      "Biology",
      "Music",
    ]);
    expect(hierarchy.children[0].fullPath).toBe("Science>Physics");
    expect(hierarchy.children[0].children.map((child) => child.name)).toEqual([
      "Quantum",
    ]);
  });

  it("drops branches that do not reach the selected level", () => {
    const hierarchy = buildScopedHierarchy(topics, [], 2);

    expect(hierarchy.children.map((child) => child.name)).toEqual(["Quantum"]);
  });

  it("builds hierarchy correctly when scoped to a specific path", () => {
    const hierarchy = buildScopedHierarchy(topics, ["Science"], 0);

    expect(hierarchy.children.map((child) => child.name)).toEqual([
      "Physics",
      "Biology",
    ]);
    expect(hierarchy.children[0].children.map((child) => child.name)).toEqual([
      "Quantum",
    ]);
  });

  it("builds hierarchy correctly when scoped with selected level", () => {
    const hierarchy = buildScopedHierarchy(topics, ["Science"], 1);

    expect(hierarchy.children.map((child) => child.name)).toEqual(["Quantum"]);
  });
});

describe("CircularPackingChart component", () => {
  const topics = [
    { name: "Science", sentences: [1, 2, 3] },
    { name: "Science>Physics", sentences: [4, 5] },
    { name: "Science>Physics>Quantum", sentences: [6] },
  ];

  it("renders the level selector and default subtitle", () => {
    render(<CircularPackingChart topics={topics} />);

    expect(screen.getByText("Topic Level:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Level 0 (Main Topics)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Level 1 (Subtopics)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Showing all topics at relative level 0 (Main Topics). Circle size reflects sentence count.",
      ),
    ).toBeInTheDocument();
  });

  it("updates the subtitle when the selected level changes", () => {
    render(<CircularPackingChart topics={topics} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Level 1 (Subtopics)" }),
    );

    expect(
      screen.getByText(
        "Showing all topics at relative level 1 (Subtopics). Circle size reflects sentence count.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the empty-state copy when there are no topics", () => {
    render(<CircularPackingChart topics={[]} />);

    expect(screen.getByText("No topics available.")).toBeInTheDocument();
  });
});
