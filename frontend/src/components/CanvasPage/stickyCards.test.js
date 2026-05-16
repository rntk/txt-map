import { describe, expect, it } from "vitest";
import { getRailCardPlacements, getStickyCardTop } from "./stickyCards";

describe("getStickyCardTop", () => {
  it("keeps a card at the start of its source range before the viewport reaches it", () => {
    const card = { cardY: 100, cardHeight: 40, startY: 80, endY: 240 };

    expect(getStickyCardTop(card, 40, 1)).toBe(80);
  });

  it("sticks a card below the viewport top while inside its source range", () => {
    const card = { cardY: 100, cardHeight: 40, startY: 80, endY: 240 };

    expect(getStickyCardTop(card, 120, 1)).toBe(140);
  });

  it("does not slide a card beyond the bottom of its source range", () => {
    const card = { cardY: 100, cardHeight: 40, startY: 80, endY: 240 };

    expect(getStickyCardTop(card, 220, 1)).toBe(200);
  });

  it("returns a packed card to the beginning of its source range when panning upward", () => {
    const card = { cardY: 160, cardHeight: 40, startY: 80, endY: 240 };

    expect(getStickyCardTop(card, 40, 1)).toBe(80);
  });
});

describe("getRailCardPlacements", () => {
  it("keeps non-overlapping sticky cards in the first lane", () => {
    const cards = [
      { key: "a", cardY: 0, cardHeight: 40, startY: 80, endY: 220 },
      { key: "b", cardY: 0, cardHeight: 40, startY: 150, endY: 300 },
    ];

    const placed = getRailCardPlacements(cards, 40, 1);

    expect(placed.map((card) => card.lane)).toEqual([0, 0]);
    expect(placed.map((card) => card.effectiveTop)).toEqual([80, 150]);
  });

  it("assigns overlapping sticky cards to separate horizontal lanes", () => {
    const cards = [
      { key: "a", cardY: 0, cardHeight: 80, startY: 80, endY: 240 },
      { key: "b", cardY: 0, cardHeight: 80, startY: 90, endY: 250 },
    ];

    const placed = getRailCardPlacements(cards, 100, 1);

    expect(placed.map((card) => card.lane)).toEqual([0, 1]);
    expect(placed.map((card) => card.effectiveTop)).toEqual([120, 120]);
    expect(placed.every((card) => card.laneCount === 2)).toBe(true);
  });

  it("pushes cards down when the lane limit is full", () => {
    const cards = [
      { key: "a", cardY: 0, cardHeight: 80, startY: 80, endY: 240 },
      { key: "b", cardY: 0, cardHeight: 80, startY: 90, endY: 250 },
    ];

    const placed = getRailCardPlacements(cards, 100, 1, {
      laneLimit: 1,
      gap: 10,
    });

    expect(placed.map((card) => card.lane)).toEqual([0, 0]);
    expect(placed.map((card) => card.effectiveTop)).toEqual([120, 210]);
  });
});
