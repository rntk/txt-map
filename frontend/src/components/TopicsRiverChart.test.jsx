import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TopicsRiverChart from "./TopicsRiverChart";

describe("TopicsRiverChart", () => {
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

  it("renders the shared level switcher and updates selection", () => {
    render(<TopicsRiverChart topics={topics} sentences={sentences} />);

    expect(screen.getByText("Level:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "L0" }),
    ).toHaveClass("active");

    fireEvent.click(
      screen.getByRole("button", { name: "L1" }),
    );

    expect(
      screen.getByRole("button", { name: "L1" }),
    ).toHaveClass("active");
  });
});
