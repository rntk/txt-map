import { describe, expect, it } from "vitest";
import { getStickyCardTop } from "./stickyCards";

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
