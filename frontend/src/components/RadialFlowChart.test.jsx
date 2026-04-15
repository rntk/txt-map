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
  it("collapses adjacent sibling subtopics into one parent entry", () => {
    const entries = buildOrderedTopicEntries(
      [
        { name: "Technology>Web", sentences: [1] },
        { name: "Technology>AI", sentences: [2] },
      ],
      ["Web sentence.", "AI sentence."],
      [],
      0,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      fullPath: "Technology",
      groupPath: "Technology",
      displayName: "Technology",
      sentenceCount: 2,
      sentenceIndices: [1, 2],
      canonicalTopicNames: ["Technology>Web", "Technology>AI"],
    });
    expect(entries[0].totalChars).toBe(
      "Web sentence.".length + "AI sentence.".length,
    );
  });

  it("keeps same-parent subtopics separate when another topic sits between them", () => {
    const entries = buildOrderedTopicEntries(
      [
        { name: "Technology>Web", sentences: [1] },
        { name: "Business>Markets", sentences: [2] },
        { name: "Technology>AI", sentences: [3] },
      ],
      ["Web sentence.", "Markets sentence.", "AI sentence."],
      [],
      0,
    );

    expect(entries.map((entry) => entry.displayName)).toEqual([
      "Technology",
      "Business",
      "Technology",
    ]);
    expect(entries.map((entry) => entry.canonicalTopicNames)).toEqual([
      ["Technology>Web"],
      ["Business>Markets"],
      ["Technology>AI"],
    ]);
  });
});
