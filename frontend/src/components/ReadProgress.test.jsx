import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ReadProgress from "./ReadProgress";

describe("ReadProgress", () => {
  it("renders the percentage text correctly", () => {
    render(<ReadProgress percentage={68} />);
    expect(screen.getByText("68%")).toBeDefined();
  });

  it("renders the label when provided", () => {
    render(<ReadProgress percentage={50} label="Success" />);
    expect(screen.getByText("Success")).toBeDefined();
  });

  it("clamps percentage between 0 and 100", () => {
    const { rerender } = render(<ReadProgress percentage={-10} />);
    expect(screen.getByText("0%")).toBeDefined();

    rerender(<ReadProgress percentage={150} />);
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("renders segments (lines) for the gauge", () => {
    const { container } = render(<ReadProgress percentage={50} />);
    const lines = container.querySelectorAll("line");
    // We defined linesCount = 40 in the component
    expect(lines.length).toBe(40);
  });

  it("shows tooltip hint when provided", () => {
    const { container } = render(
      <ReadProgress percentage={50} label="My Label" hint="My Hint" />,
    );
    const div = container.querySelector("div");
    expect(div.getAttribute("title")).toBe("My Hint");
  });

  it("uses label as tooltip when hint is missing", () => {
    const { container } = render(
      <ReadProgress percentage={50} label="My Label" />,
    );
    const div = container.querySelector("div");
    expect(div.getAttribute("title")).toBe("My Label");
  });
});
