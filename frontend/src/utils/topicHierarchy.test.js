import { describe, expect, it } from "vitest";
import {
  getTopicParts,
  getParentTopicPath,
  isWithinScope,
  getScopeLabel,
  getLevelLabel,
  sanitizePathForTestId,
  hasDeeperChildren,
  getDirectChildLabels,
  getScopedMaxLevel,
  buildScopedHierarchy,
  buildScopedChartData,
  buildScopedGanttRows,
} from "./topicHierarchy";

describe("getTopicParts", () => {
  it("splits a > delimited path", () => {
    expect(getTopicParts("A > B > C")).toEqual(["A", "B", "C"]);
  });

  it("returns a single-element array for a root topic", () => {
    expect(getTopicParts("Root")).toEqual(["Root"]);
  });

  it("trims whitespace from parts", () => {
    expect(getTopicParts(" A >  B ")).toEqual(["A", "B"]);
  });

  it("filters empty segments", () => {
    expect(getTopicParts("A >> B")).toEqual(["A", "B"]);
  });

  it("handles object with name property", () => {
    expect(getTopicParts({ name: "A > B" })).toEqual(["A", "B"]);
  });

  it("returns empty array for null/undefined", () => {
    expect(getTopicParts(null)).toEqual([]);
    expect(getTopicParts(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(getTopicParts("")).toEqual([]);
  });
});

describe("getParentTopicPath", () => {
  it("returns parent path for nested topic", () => {
    expect(getParentTopicPath("A > B > C")).toBe("A>B");
  });

  it("returns empty string for root topic", () => {
    expect(getParentTopicPath("Root")).toBe("");
  });
});

describe("isWithinScope", () => {
  it("returns true when scope is empty", () => {
    expect(isWithinScope(["A", "B"], [])).toBe(true);
  });

  it("returns true when parts match scope prefix", () => {
    expect(isWithinScope(["A", "B", "C"], ["A", "B"])).toBe(true);
  });

  it("returns false when parts are shorter than scope", () => {
    expect(isWithinScope(["A"], ["A", "B"])).toBe(false);
  });

  it("returns false when parts do not match scope", () => {
    expect(isWithinScope(["A", "X"], ["A", "B"])).toBe(false);
  });
});

describe("getScopeLabel", () => {
  it("returns 'All Topics' for empty scope", () => {
    expect(getScopeLabel([])).toBe("All Topics");
  });

  it("returns last segment of scope path", () => {
    expect(getScopeLabel(["A", "B"])).toBe("B");
  });
});

describe("getLevelLabel", () => {
  it("returns 'Main Topics' for level 0", () => {
    expect(getLevelLabel(0)).toBe("Main Topics");
  });

  it("returns 'Subtopics' for level 1", () => {
    expect(getLevelLabel(1)).toBe("Subtopics");
  });

  it("returns 'Depth N' for level N >= 2", () => {
    expect(getLevelLabel(2)).toBe("Depth 2");
    expect(getLevelLabel(5)).toBe("Depth 5");
  });
});

describe("sanitizePathForTestId", () => {
  it("replaces non-alphanumeric characters with dashes", () => {
    expect(sanitizePathForTestId("A > B > C")).toBe("a-b-c");
  });

  it("strips leading and trailing dashes", () => {
    expect(sanitizePathForTestId("> A >")).toBe("a");
  });

  it("lowercases the result", () => {
    expect(sanitizePathForTestId("MyTopic")).toBe("mytopic");
  });

  it("returns 'root' for empty input", () => {
    expect(sanitizePathForTestId("")).toBe("root");
    expect(sanitizePathForTestId(null)).toBe("root");
  });
});

describe("hasDeeperChildren", () => {
  const topics = ["A", "A>B", "A>B>C", "X"];

  it("returns true when deeper children exist", () => {
    expect(hasDeeperChildren(topics, "A")).toBe(true);
  });

  it("returns false when no deeper children", () => {
    expect(hasDeeperChildren(topics, "A>B>C")).toBe(false);
  });

  it("returns false for unknown topic", () => {
    expect(hasDeeperChildren(topics, "Z")).toBe(false);
  });

  it("handles null topics array", () => {
    expect(hasDeeperChildren(null, "A")).toBe(false);
  });
});

describe("getDirectChildLabels", () => {
  const topics = ["A", "A>B", "A>B>C", "A>D", "X"];

  it("returns direct child labels sorted", () => {
    expect(getDirectChildLabels(topics, "A")).toEqual(["B", "D"]);
  });

  it("returns empty array for leaf topic", () => {
    expect(getDirectChildLabels(topics, "A>B>C")).toEqual([]);
  });

  it("handles null topics", () => {
    expect(getDirectChildLabels(null, "A")).toEqual([]);
  });
});

describe("getScopedMaxLevel", () => {
  const topics = ["A", "A>B", "A>B>C", "A>B>C>D"];

  it("returns max depth relative to scope", () => {
    expect(getScopedMaxLevel(topics, ["A"])).toBe(2);
  });

  it("returns 0 when no deeper levels exist", () => {
    expect(getScopedMaxLevel(topics, ["A", "B", "C", "D"])).toBe(0);
  });

  it("returns full depth for empty scope", () => {
    expect(getScopedMaxLevel(topics, [])).toBe(3);
  });

  it("handles non-array topics", () => {
    expect(getScopedMaxLevel(null, [])).toBe(0);
  });
});

describe("buildScopedHierarchy", () => {
  it("returns an empty root for empty topics", () => {
    const result = buildScopedHierarchy([]);
    expect(result.name).toBe("root");
    expect(result.children).toEqual([]);
  });

  it("builds a simple hierarchy", () => {
    const topics = [
      { name: "A", sentences: [1, 2] },
      { name: "A>B", sentences: [3] },
    ];
    const result = buildScopedHierarchy(topics);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].name).toBe("A");
    expect(result.children[0].children).toHaveLength(1);
    expect(result.children[0].children[0].name).toBe("B");
  });

  it("sets value to sentence count for leaf nodes", () => {
    const topics = [{ name: "A", sentences: [1, 2, 3] }];
    const result = buildScopedHierarchy(topics);
    expect(result.children[0].value).toBe(3);
  });

  it("sets value to 1 when sentences is missing", () => {
    const topics = [{ name: "A" }];
    const result = buildScopedHierarchy(topics);
    expect(result.children[0].value).toBe(1);
  });

  it("sets value to Math.max(1, length) for leaf nodes", () => {
    const topics = [{ name: "A", sentences: [] }];
    const result = buildScopedHierarchy(topics);
    expect(result.children[0].value).toBe(1);
  });

  it("filters topics outside the scope", () => {
    const topics = [
      { name: "A", sentences: [1] },
      { name: "B", sentences: [2] },
    ];
    const result = buildScopedHierarchy(topics, ["A"]);
    expect(result.children).toHaveLength(0);
  });

  it("uses selectedLevel to control visible depth", () => {
    const topics = [
      { name: "A>B", sentences: [1] },
      { name: "A>B>C", sentences: [2] },
    ];
    const result = buildScopedHierarchy(topics, ["A"], 0);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].name).toBe("B");
  });
});

describe("buildScopedChartData", () => {
  it("returns empty array for empty topics", () => {
    expect(buildScopedChartData([])).toEqual([]);
  });

  it("returns empty array for null topics", () => {
    expect(buildScopedChartData(null)).toEqual([]);
  });

  it("builds chart data with sentence counts", () => {
    const topics = [
      { name: "A>B", sentences: [1, 2, 3] },
      { name: "A>C", sentences: [4, 5] },
    ];
    const sentences = ["", "s1", "s2", "s3", "s4", "s5"];
    const result = buildScopedChartData(topics, sentences, ["A"], 0);
    expect(result).toHaveLength(2);
  });

  it("computes totalChars from sentence lengths", () => {
    const topics = [{ name: "Root", sentences: [1, 2] }];
    const sentences = ["hello", "world"];
    const result = buildScopedChartData(topics, sentences);
    expect(result).toHaveLength(1);
    expect(result[0].totalChars).toBe(5 + 5);
  });

  it("uses fallbackChars when no sentence text is provided", () => {
    const topics = [{ name: "Root", sentences: [], totalChars: 500 }];
    const result = buildScopedChartData(topics, []);
    expect(result[0].totalChars).toBe(500);
  });

  it("sorts results by firstSentence", () => {
    const topics = [
      { name: "B", sentences: [5] },
      { name: "A", sentences: [1] },
    ];
    const result = buildScopedChartData(topics);
    expect(result[0].displayName).toBe("A");
    expect(result[1].displayName).toBe("B");
  });

  it("filters out items with zero sentences and zero chars", () => {
    const topics = [
      { name: "Empty", sentences: [] },
      { name: "Has", sentences: [1] },
    ];
    const result = buildScopedChartData(topics);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("Has");
  });
});

describe("buildScopedGanttRows", () => {
  it("returns empty rows and bands for empty topics", () => {
    const result = buildScopedGanttRows([]);
    expect(result.rows).toEqual([]);
    expect(result.parentBands).toEqual([]);
  });

  it("returns rows with no parent bands at root level", () => {
    const topics = [
      { name: "A", sentences: [1, 2] },
      { name: "B", sentences: [3] },
    ];
    const result = buildScopedGanttRows(topics);
    expect(result.rows).toHaveLength(2);
    expect(result.parentBands).toEqual([]);
  });

  it("creates parent bands for nested topics", () => {
    const topics = [
      { name: "A>B", sentences: [1, 2] },
      { name: "A>C", sentences: [3, 4] },
    ];
    const result = buildScopedGanttRows(topics, [], [], 0);
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
