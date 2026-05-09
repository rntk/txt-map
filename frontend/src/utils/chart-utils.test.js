import { describe, expect, it } from "vitest";
import {
  calculateBins,
  smoothBins,
  estimateCharacterCounts,
} from "./chart-utils";

describe("calculateBins", () => {
  it("creates the requested number of bins", () => {
    const items = [{ name: "A", sentences: [1, 2, 3] }];
    const bins = calculateBins(5, items, 1, 6);
    expect(bins).toHaveLength(5);
  });

  it("counts sentences that fall within each bin range", () => {
    const items = [{ name: "A", sentences: [1, 2, 3, 4, 5] }];
    const bins = calculateBins(5, items, 1, 6);
    expect(bins[0].A).toBe(1);
    expect(bins[4].A).toBe(1);
  });

  it("uses start-exclusive end-inclusive semantics (s >= start && s < end)", () => {
    const items = [{ name: "X", sentences: [2, 4] }];
    const bins = calculateBins(2, items, 1, 5);
    expect(bins[0].rangeStart).toBe(1);
    expect(bins[0].rangeEnd).toBe(3);
    expect(bins[0].X).toBe(1);
    expect(bins[1].X).toBe(1);
  });

  it("uses custom nameKey when provided", () => {
    const items = [{ label: "Z", sentences: [1] }];
    const bins = calculateBins(3, items, 1, 4, "label");
    expect(bins[0].Z).toBe(1);
  });

  it("returns 0 count for bins with no matching sentences", () => {
    const items = [{ name: "A", sentences: [10] }];
    const bins = calculateBins(3, items, 1, 4);
    bins.forEach((bin) => {
      expect(bin.A).toBe(0);
    });
  });
});

describe("smoothBins", () => {
  it("applies smoothing to non-zero values", () => {
    const items = [{ name: "A", sentences: [] }];
    const bins = [
      { x: 0, rangeStart: 0, rangeEnd: 3, A: 0 },
      { x: 1, rangeStart: 3, rangeEnd: 6, A: 10 },
      { x: 2, rangeStart: 6, rangeEnd: 9, A: 0 },
    ];
    const smoothed = smoothBins(bins, items);
    expect(smoothed[1].A).toBeCloseTo(6, 0);
  });

  it("fills zero bins with fraction of neighbors", () => {
    const items = [{ name: "A", sentences: [] }];
    const bins = [
      { x: 0, rangeStart: 0, rangeEnd: 3, A: 5 },
      { x: 1, rangeStart: 3, rangeEnd: 6, A: 0 },
      { x: 2, rangeStart: 6, rangeEnd: 9, A: 5 },
    ];
    const smoothed = smoothBins(bins, items);
    expect(smoothed[1].A).toBeCloseTo(5 * 0.3, 5);
  });

  it("handles single-element bins array", () => {
    const items = [{ name: "A", sentences: [] }];
    const bins = [{ x: 0, rangeStart: 0, rangeEnd: 5, A: 3 }];
    const smoothed = smoothBins(bins, items);
    expect(smoothed).toHaveLength(1);
    expect(smoothed[0].A).toBeCloseTo(3 * 0.6 + 3 * 0.2 + 3 * 0.2, 5);
  });
});

describe("estimateCharacterCounts", () => {
  it("multiplies sentence count by avgCharsPerSentence", () => {
    const items = [{ name: "A", sentences: [1], avgCharsPerSentence: 50 }];
    const bins = [{ x: 0, rangeStart: 0, rangeEnd: 5, A: 3 }];
    const result = estimateCharacterCounts(bins, items);
    expect(result[0].A).toBe(150);
  });

  it("uses totalChars / sentences.length as fallback", () => {
    const items = [{ name: "A", sentences: [1, 2], totalChars: 200 }];
    const bins = [{ x: 0, rangeStart: 0, rangeEnd: 5, A: 2 }];
    const result = estimateCharacterCounts(bins, items);
    expect(result[0].A).toBe(200);
  });

  it("defaults to 100 chars per sentence when no info available", () => {
    const items = [{ name: "A", sentences: [1] }];
    const bins = [{ x: 0, rangeStart: 0, rangeEnd: 5, A: 1 }];
    const result = estimateCharacterCounts(bins, items);
    expect(result[0].A).toBe(100);
  });

  it("preserves non-item bin properties", () => {
    const items = [{ name: "A", sentences: [1], avgCharsPerSentence: 50 }];
    const bins = [{ x: 0, rangeStart: 0, rangeEnd: 5, A: 1 }];
    const result = estimateCharacterCounts(bins, items);
    expect(result[0].x).toBe(0);
    expect(result[0].rangeStart).toBe(0);
  });
});
