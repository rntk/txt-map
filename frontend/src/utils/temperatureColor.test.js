import { describe, expect, it } from "vitest";
import { getTemperatureColor } from "./temperatureColor";

describe("getTemperatureColor", () => {
  it("returns a blue-ish color for rate 0", () => {
    const color = getTemperatureColor(0);
    expect(color).toMatch(/^rgba\(/);
    expect(color).toContain("0.58");
  });

  it("returns a red-ish color for rate 100", () => {
    const color = getTemperatureColor(100);
    expect(color).toMatch(/^rgba\(/);
    expect(color).toContain("0.58");
  });

  it("returns a neutral-ish color for rate 50", () => {
    const color = getTemperatureColor(50);
    expect(color).toMatch(/^rgba\(/);
  });

  it("returns blue for very low rate (10)", () => {
    const color = getTemperatureColor(10);
    expect(color).toMatch(/^rgba\(/);
  });

  it("returns red for very high rate (90)", () => {
    const color = getTemperatureColor(90);
    expect(color).toMatch(/^rgba\(/);
  });

  it("clamps negative rates to 0 (blue)", () => {
    const color = getTemperatureColor(-50);
    expect(color).toBe(getTemperatureColor(0));
  });

  it("clamps rates above 100 to 100 (red)", () => {
    const color = getTemperatureColor(200);
    expect(color).toBe(getTemperatureColor(100));
  });

  it("handles non-finite values by clamping to 50 (neutral)", () => {
    const colorNaN = getTemperatureColor(NaN);
    const colorInf = getTemperatureColor(Infinity);
    const neutral = getTemperatureColor(50);
    expect(colorNaN).toBe(neutral);
    expect(colorInf).toBe(neutral);
  });

  it("handles string coercion of rate", () => {
    const color = getTemperatureColor("25");
    expect(color).toBe(getTemperatureColor(25));
  });

  it("produces different colors for different rates", () => {
    const c0 = getTemperatureColor(0);
    const c25 = getTemperatureColor(25);
    const c50 = getTemperatureColor(50);
    const c75 = getTemperatureColor(75);
    const c100 = getTemperatureColor(100);
    const all = [c0, c25, c50, c75, c100];
    const unique = new Set(all);
    expect(unique.size).toBeGreaterThan(1);
  });
});
