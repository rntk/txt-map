import React from "react";
import { render } from "@testing-library/react";
import { formatDate, similarityClass, highlightText } from "./diffUtils.jsx";

describe("formatDate", () => {
  test("returns empty string for falsy input", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
  });

  test("returns string representation for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  test("formats a valid ISO date string", () => {
    const result = formatDate("2024-01-15T12:00:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("similarityClass", () => {
  test("returns diff-sim-high for >= 70%", () => {
    expect(similarityClass(0.7)).toBe("diff-sim-high");
    expect(similarityClass(1.0)).toBe("diff-sim-high");
  });

  test("returns diff-sim-mid for 25%-69%", () => {
    expect(similarityClass(0.25)).toBe("diff-sim-mid");
    expect(similarityClass(0.5)).toBe("diff-sim-mid");
    expect(similarityClass(0.69)).toBe("diff-sim-mid");
  });

  test("returns diff-sim-low for < 25%", () => {
    expect(similarityClass(0)).toBe("diff-sim-low");
    expect(similarityClass(0.1)).toBe("diff-sim-low");
    expect(similarityClass(null)).toBe("diff-sim-low");
  });
});

describe("highlightText", () => {
  test("returns raw text when query is empty", () => {
    expect(highlightText("hello world", "")).toBe("hello world");
    expect(highlightText("hello world", null)).toBe("hello world");
  });

  test("returns raw text when query not found", () => {
    expect(highlightText("hello world", "xyz")).toBe("hello world");
  });

  test("returns JSX with mark element when query found", () => {
    const { container } = render(<>{highlightText("hello world", "world")}</>);
    const mark = container.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe("world");
  });

  test("is case-insensitive", () => {
    const { container } = render(<>{highlightText("Hello World", "hello")}</>);
    const mark = container.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe("Hello");
  });

  test("handles falsy text gracefully", () => {
    expect(highlightText(null, "x")).toBe("");
    expect(highlightText(undefined, "x")).toBe("");
  });
});
