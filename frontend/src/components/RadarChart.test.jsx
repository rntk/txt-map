import React from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import RadarChart from "./RadarChart";

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

describe("RadarChart", () => {
  const topics = [
    { name: "Science", sentences: [1, 2] },
    { name: "Science>Physics", sentences: [3, 4] },
    { name: "Arts>Music", sentences: [5] },
  ];

  const sentences = [
    "Sentence one.",
    "Sentence two.",
    "Sentence three.",
    "Sentence four.",
    "Sentence five.",
  ];

  it("renders the shared level switcher and updates the active level", () => {
    render(<RadarChart topics={topics} sentences={sentences} />);

    expect(screen.getByText("Topic Level:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Level 0 (Main Topics)" }),
    ).toHaveClass("active");

    fireEvent.click(
      screen.getByRole("button", { name: "Level 1 (Subtopics)" }),
    );

    expect(
      screen.getByRole("button", { name: "Level 1 (Subtopics)" }),
    ).toHaveClass("active");
  });
});
