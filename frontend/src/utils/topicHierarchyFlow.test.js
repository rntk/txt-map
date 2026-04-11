import { buildTopicHierarchyFlowData } from "./topicHierarchyFlow";

describe("buildTopicHierarchyFlowData", () => {
  test("places leaf topics on the left and top-level topics on the right", () => {
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

  test("aggregates hierarchy node weights from descendant leaf topics", () => {
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

  test("creates weighted links from leaves to deepest segments and between ancestors", () => {
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
});
