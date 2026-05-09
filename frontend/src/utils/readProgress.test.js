import { describe, expect, it } from "vitest";
import { calculateReadPercentage } from "./readProgress";

describe("calculateReadPercentage", () => {
  it("returns 0 for null input", () => {
    expect(calculateReadPercentage(null)).toBe(0);
  });

  it("returns 0 for undefined input", () => {
    expect(calculateReadPercentage(undefined)).toBe(0);
  });

  it("returns 0 when total_count is 0", () => {
    expect(calculateReadPercentage({ read_count: 5, total_count: 0 })).toBe(0);
  });

  it("returns 0 when total_count is negative", () => {
    expect(calculateReadPercentage({ read_count: 5, total_count: -10 })).toBe(
      0,
    );
  });

  it("returns 0 for zero reads", () => {
    expect(calculateReadPercentage({ read_count: 0, total_count: 10 })).toBe(0);
  });

  it("calculates partial read percentage", () => {
    expect(
      calculateReadPercentage({ read_count: 3, total_count: 10 }),
    ).toBeCloseTo(30, 10);
  });

  it("returns 100 for fully read", () => {
    expect(calculateReadPercentage({ read_count: 10, total_count: 10 })).toBe(
      100,
    );
  });

  it("handles floating-point division", () => {
    expect(
      calculateReadPercentage({ read_count: 1, total_count: 3 }),
    ).toBeCloseTo(33.333, 2);
  });
});
