import { describe, expect, it } from "vitest";
import {
  buildTopicHierarchyFlowData,
  getTopicHierarchyFlowWeight,
} from "./topicHierarchyFlow";

describe("getTopicHierarchyFlowWeight", () => {
  it("returns sentence count when sentences are present", () => {
    expect(getTopicHierarchyFlowWeight({ sentences: [1, 2, 3] })).toBe(3);
  });

  it("returns 1 for a single sentence", () => {
    expect(getTopicHierarchyFlowWeight({ sentences: [5] })).toBe(1);
  });

  it("uses sentenceIndices when sentences is absent", () => {
    expect(getTopicHierarchyFlowWeight({ sentenceIndices: [1, 2] })).toBe(2);
  });

  it("prefers sentenceIndices over sentences", () => {
    expect(
      getTopicHierarchyFlowWeight({
        sentenceIndices: [1],
        sentences: [1, 2, 3],
      }),
    ).toBe(1);
  });

  it("falls back to totalSentences when no indices", () => {
    expect(getTopicHierarchyFlowWeight({ totalSentences: 7 })).toBe(7);
  });

  it("returns FALLBACK_WEIGHT of 1 when nothing is available", () => {
    expect(getTopicHierarchyFlowWeight({})).toBe(1);
  });

  it("returns FALLBACK_WEIGHT for null input", () => {
    expect(getTopicHierarchyFlowWeight(null)).toBe(1);
  });

  it("ignores zero totalSentences", () => {
    expect(getTopicHierarchyFlowWeight({ totalSentences: 0 })).toBe(1);
  });

  it("ignores negative totalSentences", () => {
    expect(getTopicHierarchyFlowWeight({ totalSentences: -5 })).toBe(1);
  });

  it("ignores NaN totalSentences", () => {
    expect(getTopicHierarchyFlowWeight({ totalSentences: NaN })).toBe(1);
  });

  it("filters non-positive sentence indices", () => {
    expect(getTopicHierarchyFlowWeight({ sentences: [0, -1, 1, 2] })).toBe(2);
  });

  it("deduplicates sentence indices", () => {
    expect(getTopicHierarchyFlowWeight({ sentences: [1, 1, 2] })).toBe(2);
  });

  it("sorts sentence indices", () => {
    const result = getTopicHierarchyFlowWeight({ sentences: [3, 1, 2] });
    expect(result).toBe(3);
  });
});

describe("buildTopicHierarchyFlowData", () => {
  it("returns empty result for null topics", () => {
    const result = buildTopicHierarchyFlowData(null);
    expect(result).toEqual({
      maxDepth: 0,
      columns: [],
      nodes: [],
      links: [],
    });
  });

  it("returns empty result for empty array", () => {
    const result = buildTopicHierarchyFlowData([]);
    expect(result.maxDepth).toBe(0);
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("filters topics without a name", () => {
    const result = buildTopicHierarchyFlowData([
      { name: "", sentences: [1] },
      { name: "   ", sentences: [2] },
      { sentences: [3] },
    ]);
    expect(result.nodes).toEqual([]);
  });

  it("places leaf topics on the left and top-level topics on the right", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "Science>Physics>Quantum", sentences: [1, 2] },
      { name: "Science>Biology", sentences: [3] },
      { name: "Arts", sentences: [4] },
    ]);

    expect(flow.maxDepth).toBe(3);
    expect(flow.columns).toHaveLength(4);
    expect(flow.columns[0].label).toBe("Leaf Topics");
    expect(flow.columns[3].label).toBe("Top-Level Topics");

    expect(flow.columns[0].nodes.map((node) => node.fullPath)).toEqual([
      "Arts",
      "Science>Biology",
      "Science>Physics>Quantum",
    ]);

    expect(flow.columns[3].nodes.map((node) => node.fullPath)).toEqual([
      "Arts",
      "Science",
    ]);
  });

  it("labels intermediate columns as 'Subtopics'", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "A>B>C>D", sentences: [1] },
    ]);
    expect(flow.columns[1].label).toBe("Subtopics");
    expect(flow.columns[2].label).toBe("Subtopics");
  });

  it("labels columns correctly for depth-1 hierarchy", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "Topic", sentences: [1] },
    ]);
    expect(flow.maxDepth).toBe(1);
    expect(flow.columns).toHaveLength(2);
    expect(flow.columns[0].label).toBe("Leaf Topics");
    expect(flow.columns[1].label).toBe("Top-Level Topics");
  });

  it("aggregates hierarchy node weights from descendant leaf topics", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "Science>Physics>Quantum", sentences: [1, 2] },
      { name: "Science>Physics>Relativity", sentences: [3] },
    ]);

    const physicsNode = flow.nodes.find(
      (node) => node.id === "hierarchy:Science>Physics",
    );
    expect(physicsNode?.weight).toBe(3);
    expect(physicsNode?.canonicalTopicNames).toEqual([
      "Science>Physics>Quantum",
      "Science>Physics>Relativity",
    ]);
  });

  it("creates weighted links from leaves to deepest segments and between ancestors", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "Science>Physics>Quantum", sentences: [1, 2] },
    ]);

    const leafToDeepest = flow.links.find(
      (link) =>
        link.sourceId === "leaf:Science>Physics>Quantum" &&
        link.targetId === "hierarchy:Science>Physics>Quantum",
    );
    const deepestToParent = flow.links.find(
      (link) =>
        link.sourceId === "hierarchy:Science>Physics>Quantum" &&
        link.targetId === "hierarchy:Science>Physics",
    );

    expect(leafToDeepest?.weight).toBe(2);
    expect(deepestToParent?.weight).toBe(2);
  });

  it("assigns correct column numbers based on maxDepth", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "A>B>C", sentences: [1] },
    ]);
    const leafNode = flow.nodes.find((n) => n.type === "leaf");
    expect(leafNode?.column).toBe(0);

    const rootHierarchy = flow.nodes.find((n) => n.id === "hierarchy:A");
    expect(rootHierarchy?.column).toBe(3);
  });

  it("sets node type to 'leaf' for leaf nodes and 'hierarchy' for hierarchy nodes", () => {
    const flow = buildTopicHierarchyFlowData([{ name: "A>B", sentences: [1] }]);
    const leafNode = flow.nodes.find((n) => n.type === "leaf");
    const hierNode = flow.nodes.find((n) => n.type === "hierarchy");
    expect(leafNode?.fullPath).toBe("A>B");
    expect(hierNode).toBeDefined();
  });

  it("aggregates sentence indices on hierarchy nodes", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "A>B", sentences: [1, 2] },
      { name: "A>C", sentences: [3] },
    ]);
    const rootA = flow.nodes.find((n) => n.id === "hierarchy:A");
    expect(rootA?.sentenceIndices).toEqual([1, 2, 3]);
  });

  it("uses colorKey from root topic segment", () => {
    const flow = buildTopicHierarchyFlowData([{ name: "X>Y", sentences: [1] }]);
    const leaf = flow.nodes.find((n) => n.type === "leaf");
    expect(leaf?.colorKey).toBe("X");
  });

  it("computes order as average of topic indices", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "A>B", sentences: [1] },
      { name: "A>C", sentences: [2] },
    ]);
    const hierA = flow.nodes.find((n) => n.id === "hierarchy:A");
    expect(hierA?.order).toBeCloseTo(0.5, 5);
  });

  it("creates links between consecutive hierarchy levels", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "A>B>C", sentences: [1] },
    ]);
    const bcLink = flow.links.find(
      (l) => l.sourceId === "hierarchy:A>B>C" && l.targetId === "hierarchy:A>B",
    );
    const abLink = flow.links.find(
      (l) => l.sourceId === "hierarchy:A>B" && l.targetId === "hierarchy:A",
    );
    expect(bcLink).toBeDefined();
    expect(abLink).toBeDefined();
  });

  it("handles topics with ranges property", () => {
    const flow = buildTopicHierarchyFlowData([
      {
        name: "A>B",
        sentences: [1],
        ranges: [{ sentence_start: 0, sentence_end: 1 }],
      },
    ]);
    const leaf = flow.nodes.find((n) => n.type === "leaf");
    expect(leaf?.ranges).toEqual([{ sentence_start: 0, sentence_end: 1 }]);
  });

  it("uses totalSentences as weight fallback when no sentence indices", () => {
    const flow = buildTopicHierarchyFlowData([
      { name: "A>B", totalSentences: 5 },
    ]);
    const leaf = flow.nodes.find((n) => n.type === "leaf");
    expect(leaf?.weight).toBe(5);
  });
});
