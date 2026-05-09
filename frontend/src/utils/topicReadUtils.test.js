import { describe, expect, it } from "vitest";
import {
  toReadTopicsSet,
  isExactTopicRead,
  isTopicRead,
  isTopicSelectionRead,
  setTopicNamesReadState,
} from "./topicReadUtils";

describe("toReadTopicsSet", () => {
  it("returns an empty Set for null", () => {
    expect(toReadTopicsSet(null)).toEqual(new Set());
  });

  it("returns an empty Set for undefined", () => {
    expect(toReadTopicsSet(undefined)).toEqual(new Set());
  });

  it("returns the same Set when given a Set", () => {
    const s = new Set(["A"]);
    expect(toReadTopicsSet(s)).toBe(s);
  });

  it("converts an array to a Set", () => {
    expect(toReadTopicsSet(["A", "B"])).toEqual(new Set(["A", "B"]));
  });
});

describe("isExactTopicRead", () => {
  const readTopics = new Set(["A", "A>B"]);

  it("returns true when exact topic is read", () => {
    expect(isExactTopicRead("A", readTopics)).toBe(true);
  });

  it("returns true when ancestor topic is read", () => {
    expect(isExactTopicRead("A>B>C", readTopics)).toBe(true);
  });

  it("returns false when topic is not read", () => {
    expect(isExactTopicRead("X", readTopics)).toBe(false);
  });

  it("returns false for null topic name", () => {
    expect(isExactTopicRead(null, readTopics)).toBe(false);
  });

  it("returns false for empty readTopics", () => {
    expect(isExactTopicRead("A", new Set())).toBe(false);
  });
});

describe("isTopicRead", () => {
  it("returns false for null topic name", () => {
    expect(isTopicRead(null, new Set())).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isTopicRead("", new Set([""]))).toBe(false);
  });

  it("returns true for directly read topic", () => {
    expect(isTopicRead("A", new Set(["A"]))).toBe(true);
  });

  it("returns true when parent topic is read", () => {
    expect(isTopicRead("A>B>C", new Set(["A"]))).toBe(true);
  });

  it("returns true when intermediate ancestor is read", () => {
    expect(isTopicRead("A>B>C", new Set(["A>B"]))).toBe(true);
  });

  it("returns false for unrelated topic", () => {
    expect(isTopicRead("X>Y", new Set(["A"]))).toBe(false);
  });

  it("handles array readTopics input", () => {
    expect(isTopicRead("A", ["A"])).toBe(true);
  });

  it("handles null readTopics input", () => {
    expect(isTopicRead("A", null)).toBe(false);
  });
});

describe("isTopicSelectionRead", () => {
  it("returns false for null selection", () => {
    expect(isTopicSelectionRead(null, new Set())).toBe(false);
  });

  it("returns false for selection with no canonical names", () => {
    expect(isTopicSelectionRead({}, new Set())).toBe(false);
  });

  it("returns true when all topics in selection are read", () => {
    const sel = { canonicalTopicNames: ["A", "A>B"] };
    expect(isTopicSelectionRead(sel, new Set(["A"]))).toBe(true);
  });

  it("returns false when any topic is not read", () => {
    const sel = { canonicalTopicNames: ["A", "X"] };
    expect(isTopicSelectionRead(sel, new Set(["A"]))).toBe(false);
  });
});

describe("setTopicNamesReadState", () => {
  it("adds topics when shouldRead is true", () => {
    const result = setTopicNamesReadState(new Set(), ["A", "B"], true);
    expect(result.has("A")).toBe(true);
    expect(result.has("B")).toBe(true);
  });

  it("removes topics when shouldRead is false", () => {
    const result = setTopicNamesReadState(
      new Set(["A", "B", "C"]),
      ["B"],
      false,
    );
    expect(result.has("A")).toBe(true);
    expect(result.has("B")).toBe(false);
    expect(result.has("C")).toBe(true);
  });

  it("preserves existing read topics when adding", () => {
    const result = setTopicNamesReadState(new Set(["X"]), ["Y"], true);
    expect(result.has("X")).toBe(true);
    expect(result.has("Y")).toBe(true);
  });

  it("skips empty or whitespace-only names", () => {
    const result = setTopicNamesReadState(new Set(), ["A", "", "  "], true);
    expect(result.has("A")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("handles array input for readTopics", () => {
    const result = setTopicNamesReadState(["X"], ["Y"], true);
    expect(result.has("X")).toBe(true);
    expect(result.has("Y")).toBe(true);
  });

  it("trims topic names", () => {
    const result = setTopicNamesReadState(new Set(), ["  A  "], true);
    expect(result.has("A")).toBe(true);
  });
});
