import { describe, expect, it } from "vitest";
import { getTemperatureColor } from "./temperatureColor";

function parseRgba(str) {
  const m = str.match(
    /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/,
  );
  if (!m) throw new Error(`Not a valid rgba string: ${str}`);
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: Number(m[4]),
  };
}

describe("getTemperatureColor", () => {
  it("returns exact blue rgba(73, 126, 220, 0.58) for rate 0", () => {
    const c = parseRgba(getTemperatureColor(0));
    expect(c).toEqual({ r: 73, g: 126, b: 220, a: 0.58 });
  });

  it("returns exact red rgba(220, 79, 73, 0.58) for rate 100", () => {
    const c = parseRgba(getTemperatureColor(100));
    expect(c).toEqual({ r: 220, g: 79, b: 73, a: 0.58 });
  });

  it("returns exact neutral rgba(226, 229, 235, 0.58) for rate 50", () => {
    const c = parseRgba(getTemperatureColor(50));
    expect(c).toEqual({ r: 226, g: 229, b: 235, a: 0.58 });
  });

  it("interpolates blue-to-neutral at rate 25 (halfway through lower range)", () => {
    const c = parseRgba(getTemperatureColor(25));
    expect(c.r).toBe(Math.round(73 + (226 - 73) * 0.5));
    expect(c.g).toBe(Math.round(126 + (229 - 126) * 0.5));
    expect(c.b).toBe(Math.round(220 + (235 - 220) * 0.5));
    expect(c.a).toBe(0.58);
  });

  it("interpolates neutral-to-red at rate 75 (halfway through upper range)", () => {
    const c = parseRgba(getTemperatureColor(75));
    expect(c.r).toBe(Math.round(226 + (220 - 226) * 0.5));
    expect(c.g).toBe(Math.round(229 + (79 - 229) * 0.5));
    expect(c.b).toBe(Math.round(235 + (73 - 235) * 0.5));
    expect(c.a).toBe(0.58);
  });

  it("uses blue branch for normalized < 0.5 (rate 49)", () => {
    const c49 = parseRgba(getTemperatureColor(49));
    const c0 = parseRgba(getTemperatureColor(0));
    expect(c49.r).toBeGreaterThan(c0.r);
    expect(c49.r).toBeLessThan(226);
  });

  it("uses red branch for normalized > 0.5 (rate 51)", () => {
    const c51 = parseRgba(getTemperatureColor(51));
    expect(c51.g).toBeLessThan(229);
    expect(c51.b).toBeLessThan(235);
  });

  it("clamps negative rates to 0 producing exact blue", () => {
    expect(getTemperatureColor(-50)).toBe(getTemperatureColor(0));
  });

  it("clamps rates above 100 to 100 producing exact red", () => {
    expect(getTemperatureColor(200)).toBe(getTemperatureColor(100));
  });

  it("handles non-finite values by clamping to 50 (neutral)", () => {
    const neutral = getTemperatureColor(50);
    expect(getTemperatureColor(NaN)).toBe(neutral);
    expect(getTemperatureColor(Infinity)).toBe(neutral);
    expect(getTemperatureColor(-Infinity)).toBe(neutral);
  });

  it("handles string coercion of rate", () => {
    expect(getTemperatureColor("25")).toBe(getTemperatureColor(25));
  });

  it("produces different colors for different rates", () => {
    const rates = [0, 25, 50, 75, 100];
    const colors = rates.map(getTemperatureColor);
    expect(new Set(colors).size).toBe(rates.length);
  });

  it("rate 10 produces an interpolated value between blue and neutral", () => {
    const c = parseRgba(getTemperatureColor(10));
    expect(c.r).toBe(Math.round(73 + (226 - 73) * 0.2));
    expect(c.g).toBe(Math.round(126 + (229 - 126) * 0.2));
    expect(c.b).toBe(Math.round(220 + (235 - 220) * 0.2));
    expect(c.a).toBe(0.58);
  });

  it("rate 90 produces an interpolated value between neutral and red", () => {
    const c = parseRgba(getTemperatureColor(90));
    expect(c.r).toBe(Math.round(226 + (220 - 226) * 0.8));
    expect(c.g).toBe(Math.round(229 + (79 - 229) * 0.8));
    expect(c.b).toBe(Math.round(235 + (73 - 235) * 0.8));
    expect(c.a).toBe(0.58);
  });
});
