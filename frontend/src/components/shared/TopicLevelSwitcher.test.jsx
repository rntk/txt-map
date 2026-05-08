import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TopicLevelSwitcher from "./TopicLevelSwitcher";

describe("TopicLevelSwitcher", () => {
  it("renders level buttons and marks the selected level active", () => {
    const onChange = vi.fn();

    render(
      <TopicLevelSwitcher selectedLevel={1} maxLevel={2} onChange={onChange} />,
    );

    expect(screen.getByText("Level:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "L0" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "L1" }),
    ).toHaveClass("active");
    expect(
      screen.getByRole("button", { name: "L2" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "L2" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
