import { describe, expect, it } from "vitest";
import {
  parseNumericValue,
  inferChartType,
  getChartType,
  isVisualChart,
} from "./dataChartUtils";

describe("parseNumericValue", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseNumericValue(null)).toBeNull();
    expect(parseNumericValue(undefined)).toBeNull();
    expect(parseNumericValue("")).toBeNull();
    expect(parseNumericValue("  ")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parseNumericValue(42)).toBeNull();
  });

  it("parses a plain number", () => {
    const result = parseNumericValue("42");
    expect(result).toEqual({ raw: "42", numeric: 42, unit: "" });
  });

  it("parses a number with commas as thousands separators", () => {
    const result = parseNumericValue("1,200");
    expect(result).toEqual({ raw: "1,200", numeric: 1200, unit: "" });
  });

  it("parses a dollar amount", () => {
    const result = parseNumericValue("$500");
    expect(result).toEqual({ raw: "$500", numeric: 500, unit: "$" });
  });

  it("parses a euro amount", () => {
    const result = parseNumericValue("€300");
    expect(result).toEqual({ raw: "€300", numeric: 300, unit: "€" });
  });

  it("parses a pound amount", () => {
    const result = parseNumericValue("£99");
    expect(result).toEqual({ raw: "£99", numeric: 99, unit: "£" });
  });

  it("parses a percentage", () => {
    const result = parseNumericValue("45%");
    expect(result).toEqual({ raw: "45%", numeric: 45, unit: "%" });
  });

  it("parses a value with 'billion' suffix", () => {
    const result = parseNumericValue("2.5 billion");
    expect(result).toEqual({ raw: "2.5 billion", numeric: 2.5e9, unit: "" });
  });

  it("parses a value with 'b' suffix as billion", () => {
    const result = parseNumericValue("3b");
    expect(result).toEqual({ raw: "3b", numeric: 3e9, unit: "" });
  });

  it("parses a value with 'million' suffix", () => {
    const result = parseNumericValue("1.2 million");
    expect(result).toEqual({ raw: "1.2 million", numeric: 1.2e6, unit: "" });
  });

  it("parses a value with 'm' suffix as million", () => {
    const result = parseNumericValue("5m");
    expect(result).toEqual({ raw: "5m", numeric: 5e6, unit: "" });
  });

  it("parses a value with 'trillion' suffix", () => {
    const result = parseNumericValue("7 trillion");
    expect(result).toEqual({ raw: "7 trillion", numeric: 7e12, unit: "" });
  });

  it("parses a value with 't' suffix as trillion", () => {
    const result = parseNumericValue("2t");
    expect(result).toEqual({ raw: "2t", numeric: 2e12, unit: "" });
  });

  it("parses a value with 'k' suffix as thousand", () => {
    const result = parseNumericValue("150k");
    expect(result).toEqual({ raw: "150k", numeric: 150000, unit: "" });
  });

  it("parses $2.5 billion", () => {
    const result = parseNumericValue("$2.5 billion");
    expect(result).toEqual({ raw: "$2.5 billion", numeric: 2.5e9, unit: "$" });
  });

  it("returns null for non-numeric strings", () => {
    expect(parseNumericValue("hello")).toBeNull();
    expect(parseNumericValue("abc123")).toBeNull();
  });
});

describe("inferChartType", () => {
  it("returns 'table' for display_suggestion=table", () => {
    expect(inferChartType({ display_suggestion: "table" })).toBe("table");
  });

  it("returns 'inline' for display_suggestion=inline", () => {
    expect(inferChartType({ display_suggestion: "inline" })).toBe("inline");
  });

  it("returns 'bar' for display_suggestion=chart_bar with 2+ numeric values", () => {
    const extraction = {
      display_suggestion: "chart_bar",
      values: [{ value: "10" }, { value: "20" }],
    };
    expect(inferChartType(extraction)).toBe("bar");
  });

  it("returns 'inline' for display_suggestion=chart_bar with fewer than 2 numeric values", () => {
    const extraction = {
      display_suggestion: "chart_bar",
      values: [{ value: "hello" }],
    };
    expect(inferChartType(extraction)).toBe("inline");
  });

  it("falls back to extraction type mapping", () => {
    expect(inferChartType({ type: "statistic" })).toBe("inline");
    expect(inferChartType({ type: "comparison" })).toBe("bar");
    expect(inferChartType({ type: "timeline_event" })).toBe("timeline");
    expect(inferChartType({ type: "ranking" })).toBe("bar");
    expect(inferChartType({ type: "trend" })).toBe("line");
    expect(inferChartType({ type: "proportion" })).toBe("bar");
    expect(inferChartType({ type: "process_flow" })).toBe("gantt");
    expect(inferChartType({ type: "overlap" })).toBe("table");
  });

  it("returns 'inline' as default fallback", () => {
    expect(inferChartType({})).toBe("inline");
    expect(inferChartType(null)).toBe("inline");
    expect(inferChartType(undefined)).toBe("inline");
  });
});

describe("getChartType", () => {
  it("returns visualization.chart_type if present", () => {
    expect(getChartType({ visualization: { chart_type: "bar" } })).toBe("bar");
  });

  it("falls back to inferChartType when no visualization", () => {
    expect(getChartType({ type: "trend" })).toBe("line");
  });

  it("falls back when visualization has no chart_type", () => {
    expect(getChartType({ visualization: {} })).toBe("inline");
  });
});

describe("isVisualChart", () => {
  it("returns true for bar chart", () => {
    expect(isVisualChart({ visualization: { chart_type: "bar" } })).toBe(true);
  });

  it("returns true for line chart", () => {
    expect(isVisualChart({ visualization: { chart_type: "line" } })).toBe(true);
  });

  it("returns true for timeline chart", () => {
    expect(isVisualChart({ visualization: { chart_type: "timeline" } })).toBe(
      true,
    );
  });

  it("returns true for gantt chart", () => {
    expect(isVisualChart({ visualization: { chart_type: "gantt" } })).toBe(
      true,
    );
  });

  it("returns false for table", () => {
    expect(isVisualChart({ visualization: { chart_type: "table" } })).toBe(
      false,
    );
  });

  it("returns false for inline", () => {
    expect(isVisualChart({ visualization: { chart_type: "inline" } })).toBe(
      false,
    );
  });
});
