import { describe, expect, it } from "vitest";
import {
  getTopicHighlightColor,
  getTopicAccentColor,
  getHierarchyTopicHighlightColor,
  getHierarchyTopicAccentColor,
  getTopicCSSClass,
} from "./topicColorUtils";

describe("getTopicHighlightColor", () => {
  it("returns an hsl color string", () => {
    const result = getTopicHighlightColor("climate");
    expect(result).toMatch(/^hsl\(\d+, 40%, 85%\)$/);
  });

  it("is deterministic — same input produces same output", () => {
    expect(getTopicHighlightColor("economy")).toBe(
      getTopicHighlightColor("economy"),
    );
  });

  it("produces different colors for different topics", () => {
    expect(getTopicHighlightColor("alpha")).not.toBe(
      getTopicHighlightColor("beta"),
    );
  });
});

describe("getTopicAccentColor", () => {
  it("returns an hsl color string", () => {
    const result = getTopicAccentColor("climate");
    expect(result).toMatch(/^hsl\(\d+, 42%, 46%\)$/);
  });

  it("is deterministic", () => {
    expect(getTopicAccentColor("economy")).toBe(getTopicAccentColor("economy"));
  });

  it("shares the same hue as the highlight color", () => {
    const highlight = getTopicHighlightColor("test-topic");
    const accent = getTopicAccentColor("test-topic");
    const hueMatch = (s) => s.match(/hsl\((\d+)/);
    expect(hueMatch(highlight)[1]).toBe(hueMatch(accent)[1]);
  });
});

describe("getHierarchyTopicHighlightColor", () => {
  it("returns hsl color with root-level saturation and lightness", () => {
    const result = getHierarchyTopicHighlightColor("Root");
    expect(result).toMatch(/^hsl\(\d+, 55%, 78%\)$/);
  });

  it("reduces saturation at depth 1", () => {
    const result = getHierarchyTopicHighlightColor("Root>Child", 1);
    expect(result).toMatch(/^hsl\(\d+, 48%, 82%\)$/);
  });

  it("clamps saturation to minimum of 25", () => {
    const result = getHierarchyTopicHighlightColor("Root", 10);
    const match = result.match(/hsl\(\d+, (\d+)%,/);
    expect(Number(match[1])).toBe(25);
  });

  it("clamps lightness to maximum of 94", () => {
    const result = getHierarchyTopicHighlightColor("Root", 10);
    const match = result.match(/hsl\(\d+, \d+%, (\d+)%\)/);
    expect(Number(match[1])).toBeLessThanOrEqual(94);
  });

  it("uses root name for hue so siblings share color", () => {
    const c1 = getHierarchyTopicHighlightColor("Root>Child1");
    const c2 = getHierarchyTopicHighlightColor("Root>Child2");
    const hue = (s) => s.match(/hsl\((\d+)/)[1];
    expect(hue(c1)).toBe(hue(c2));
  });

  it("different roots produce different hues", () => {
    const c1 = getHierarchyTopicHighlightColor("Alpha");
    const c2 = getHierarchyTopicHighlightColor("Beta");
    expect(c1).not.toBe(c2);
  });
});

describe("getHierarchyTopicAccentColor", () => {
  it("returns hsl color with root-level saturation and lightness", () => {
    const result = getHierarchyTopicAccentColor("Root");
    expect(result).toMatch(/^hsl\(\d+, 60%, 38%\)$/);
  });

  it("reduces saturation and increases lightness at depth 1", () => {
    const result = getHierarchyTopicAccentColor("Root>Child", 1);
    expect(result).toMatch(/^hsl\(\d+, 54%, 44%\)$/);
  });

  it("clamps saturation to minimum of 30", () => {
    const result = getHierarchyTopicAccentColor("Root", 10);
    const match = result.match(/hsl\(\d+, (\d+)%,/);
    expect(Number(match[1])).toBeGreaterThanOrEqual(30);
  });

  it("clamps lightness to maximum of 62", () => {
    const result = getHierarchyTopicAccentColor("Root", 10);
    const match = result.match(/hsl\(\d+, \d+%, (\d+)%\)/);
    expect(Number(match[1])).toBeLessThanOrEqual(62);
  });
});

describe("getTopicCSSClass", () => {
  it("returns a string prefixed with tc-hl-", () => {
    const result = getTopicCSSClass("climate");
    expect(result).toMatch(/^tc-hl-\d+$/);
  });

  it("is deterministic", () => {
    expect(getTopicCSSClass("test")).toBe(getTopicCSSClass("test"));
  });

  it("produces different classes for different topics", () => {
    expect(getTopicCSSClass("a")).not.toBe(getTopicCSSClass("b"));
  });
});
