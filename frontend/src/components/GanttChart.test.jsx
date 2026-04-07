import React from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import GanttChart from "./GanttChart";
import { buildScopedGanttRows } from "../utils/topicHierarchy";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => ({
    font: "",
    measureText: (text) => ({ width: String(text || "").length * 9 }),
  });
});

describe("buildScopedGanttRows", () => {
  const topics = [
    { name: "Science", sentences: [1, 2, 11] },
    { name: "Science>Physics", sentences: [3, 4] },
    { name: "Science>Physics>Quantum", sentences: [9] },
    { name: "Science>Biology", sentences: [5] },
    { name: "Arts", sentences: [6, 12] },
    { name: "Arts>Music", sentences: [7] },
    { name: "Arts>Painting", sentences: [8] },
  ];

  it("groups rows by immediate parent and builds one parent band per group", () => {
    const { rows, parentBands } = buildScopedGanttRows(topics, [], [], 1);

    expect(rows.map((row) => row.displayName)).toEqual([
      "Physics",
      "Biology",
      "Music",
      "Painting",
    ]);
    expect(parentBands).toEqual([
      {
        displayName: "Science",
        end: 12,
        fullPath: "Science",
        rowEndIndex: 1,
        rowStartIndex: 0,
        start: 1,
      },
      {
        displayName: "Arts",
        end: 13,
        fullPath: "Arts",
        rowEndIndex: 3,
        rowStartIndex: 2,
        start: 6,
      },
    ]);
  });

  it("uses the scoped parent aggregate when rendering children inside a branch", () => {
    const { rows, parentBands } = buildScopedGanttRows(
      topics,
      [],
      ["Science"],
      0,
    );

    expect(rows.map((row) => row.displayName)).toEqual(["Physics", "Biology"]);
    expect(parentBands).toEqual([
      {
        displayName: "Science",
        end: 12,
        fullPath: "Science",
        rowEndIndex: 1,
        rowStartIndex: 0,
        start: 1,
      },
    ]);
  });
});

describe("GanttChart", () => {
  const topics = [
    { name: "Science", sentences: [1, 2, 11] },
    { name: "Science>Physics", sentences: [3, 4] },
    { name: "Science>Physics>Quantum", sentences: [9] },
    { name: "Science>Biology", sentences: [5] },
    { name: "Arts", sentences: [6, 12] },
    { name: "Arts>Music", sentences: [7] },
    { name: "Arts>Painting", sentences: [8] },
  ];

  const sentences = Array.from(
    { length: 12 },
    (_, index) => `Sentence ${index + 1}.`,
  );

  it("does not render parent bands for the root level", () => {
    const { container } = render(
      <GanttChart topics={topics} sentences={sentences} />,
    );

    expect(container.querySelectorAll(".gantt-parent-band")).toHaveLength(0);
  });

  it("renders parent bands for deeper levels and drills into child topics from bars", () => {
    const { container } = render(
      <GanttChart topics={topics} sentences={sentences} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "L1" }),
    );

    const parentBands = Array.from(
      container.querySelectorAll(".gantt-parent-band"),
    ).map((band) => band.getAttribute("data-parent-path"));
    expect(parentBands).toEqual(["Science", "Arts"]);

    const physicsBar = container.querySelector(
      '.gantt-bar[data-topic-path="Science>Physics"]',
    );
    expect(physicsBar).not.toBeNull();

    fireEvent.click(physicsBar);

    expect(screen.getByRole("button", { name: "Physics" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "L0" }),
    ).toHaveClass("active");
    expect(
      container.querySelectorAll(
        '.gantt-parent-band[data-parent-path="Science>Physics"]',
      ),
    ).toHaveLength(1);
  });
});
