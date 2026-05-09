import { describe, expect, it } from "vitest";
import {
  buildMindmapHierarchy,
  buildPrefixTreeHierarchy,
} from "./hierarchyBuilders";

describe("buildMindmapHierarchy", () => {
  it("returns null for null input", () => {
    expect(buildMindmapHierarchy(null)).toBeNull();
  });

  it("returns null for empty object", () => {
    expect(buildMindmapHierarchy({})).toBeNull();
  });

  it("builds a single root node", () => {
    const data = { Topic: { sentences: [1, 2], children: {} } };
    const result = buildMindmapHierarchy(data);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Topic");
    expect(result[0].sentences).toEqual([1, 2]);
    expect(result[0].path).toBe("Topic");
    expect(result[0].children).toEqual([]);
  });

  it("builds nested children", () => {
    const data = {
      Root: {
        sentences: [1],
        children: {
          Child: {
            sentences: [2, 3],
            children: {
              Grandchild: { sentences: [4], children: {} },
            },
          },
        },
      },
    };
    const result = buildMindmapHierarchy(data);
    expect(result).toHaveLength(1);
    const root = result[0];
    expect(root.name).toBe("Root");
    expect(root.children).toHaveLength(1);
    const child = root.children[0];
    expect(child.name).toBe("Child");
    expect(child.path).toBe("Root/Child");
    expect(child.children).toHaveLength(1);
    expect(child.children[0].name).toBe("Grandchild");
    expect(child.children[0].path).toBe("Root/Child/Grandchild");
  });

  it("defaults sentences to empty array when missing", () => {
    const data = { A: { children: {} } };
    const result = buildMindmapHierarchy(data);
    expect(result[0].sentences).toEqual([]);
  });

  it("defaults children to empty object when missing", () => {
    const data = { A: { sentences: [] } };
    const result = buildMindmapHierarchy(data);
    expect(result[0].children).toEqual([]);
  });

  it("handles multiple roots", () => {
    const data = {
      Alpha: { sentences: [1], children: {} },
      Beta: { sentences: [2], children: {} },
    };
    const result = buildMindmapHierarchy(data);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name).sort()).toEqual(["Alpha", "Beta"]);
  });
});

describe("buildPrefixTreeHierarchy", () => {
  it("returns null for null input", () => {
    expect(buildPrefixTreeHierarchy(null)).toBeNull();
  });

  it("returns null for empty object", () => {
    expect(buildPrefixTreeHierarchy({})).toBeNull();
  });

  it("builds a single root node", () => {
    const data = {
      t: { fullWord: "test", count: 5, sentences: [1], children: {} },
    };
    const result = buildPrefixTreeHierarchy(data);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("t");
    expect(result[0].fullWord).toBe("test");
    expect(result[0].count).toBe(5);
    expect(result[0].sentences).toEqual([1]);
    expect(result[0].path).toBe("t");
  });

  it("builds nested children", () => {
    const data = {
      a: {
        count: 0,
        sentences: [],
        children: {
          b: {
            fullWord: "ab",
            count: 3,
            sentences: [2],
            children: {},
          },
        },
      },
    };
    const result = buildPrefixTreeHierarchy(data);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("a");
    expect(result[0].fullWord).toBe("a");
    expect(result[0].children).toHaveLength(1);
    const child = result[0].children[0];
    expect(child.name).toBe("b");
    expect(child.fullWord).toBe("ab");
    expect(child.path).toBe("a/b");
    expect(child.count).toBe(3);
  });

  it("defaults count to 0 when missing", () => {
    const data = { x: { sentences: [], children: {} } };
    const result = buildPrefixTreeHierarchy(data);
    expect(result[0].count).toBe(0);
  });

  it("defaults sentences to empty array when missing", () => {
    const data = { x: { count: 1, children: {} } };
    const result = buildPrefixTreeHierarchy(data);
    expect(result[0].sentences).toEqual([]);
  });

  it("uses label as fullWord fallback", () => {
    const data = { k: { count: 1, sentences: [], children: {} } };
    const result = buildPrefixTreeHierarchy(data);
    expect(result[0].fullWord).toBe("k");
  });

  it("handles multiple root nodes", () => {
    const data = {
      a: { count: 1, sentences: [1], children: {} },
      b: { count: 2, sentences: [2], children: {} },
    };
    const result = buildPrefixTreeHierarchy(data);
    expect(result).toHaveLength(2);
  });
});
