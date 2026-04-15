import { describe, expect, it } from "vitest";
import {
  buildOrderedTopicEntries,
  buildRadialFlowLayoutItems,
} from "./RadialFlowChart";

describe("RadialFlowChart layout", () => {
  it("keeps adjacent circles separated by the configured gap", () => {
    const items = buildRadialFlowLayoutItems(
      [
        {
          entryId: "hyperagents::1::0",
          fullPath: "Technology>AI>Hyperagents",
          groupPath: "Technology>AI>Hyperagents",
          totalChars: 9900,
        },
        {
          entryId: "ai::6::1",
          fullPath: "Technology>AI",
          groupPath: "Technology>AI",
          totalChars: 9900,
        },
        {
          entryId: "agents::8::2",
          fullPath: "Technology>AI>Agents",
          groupPath: "Technology>AI>Agents",
          totalChars: 1200,
        },
      ],
      480,
      [],
    );

    items.slice(1).forEach((item, index) => {
      const previousItem = items[index];
      const visibleGap =
        item.yCenter - item.r - (previousItem.yCenter + previousItem.r);

      expect(visibleGap).toBeCloseTo(20);
      expect(visibleGap).toBeGreaterThanOrEqual(20);
    });
  });

  it("preserves duplicate topic paths as separate render rows", () => {
    const items = buildRadialFlowLayoutItems(
      [
        {
          entryId: "hyperagents::1::0",
          fullPath: "Technology>AI>Hyperagents",
          groupPath: "Technology>AI>Hyperagents",
          totalChars: 2500,
        },
        {
          entryId: "hyperagents::12::1",
          fullPath: "Technology>AI>Hyperagents",
          groupPath: "Technology>AI>Hyperagents",
          totalChars: 2500,
        },
      ],
      480,
      [],
    );

    expect(items).toHaveLength(2);
    expect(items[0].entryId).not.toBe(items[1].entryId);
    expect(items[0].fullPath).toBe(items[1].fullPath);
  });
});

describe("RadialFlowChart entries", () => {
  it("adds the next-level topic to duplicate parent titles when there are multiple subtopics", () => {
    const entries = buildOrderedTopicEntries(
      [
        { name: "Technology>Web", sentences: [1] },
        { name: "Technology>AI", sentences: [2] },
      ],
      ["Web sentence.", "AI sentence."],
      [],
      0,
    );

    expect(entries.map((entry) => entry.displayName)).toEqual([
      "Technology > Web",
      "Technology > AI",
    ]);
  });

  it("keeps the parent title when it has only one subtopic", () => {
    const entries = buildOrderedTopicEntries(
      [
        { name: "Technology>Web>React", sentences: [1] },
        { name: "Technology>Web>CSS", sentences: [2] },
      ],
      ["React sentence.", "CSS sentence."],
      [],
      0,
    );

    expect(entries.map((entry) => entry.displayName)).toEqual([
      "Technology",
      "Technology",
    ]);
  });
});
