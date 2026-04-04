/**
 * Utilities for data-driven chart rendering in the storytelling/annotations system.
 */

/**
 * Parse a verbatim value string from article text into a numeric representation.
 * Returns null if the string cannot be parsed as a number.
 *
 * @param {string} str - Raw value string, e.g. "$2.5 billion", "45%", "1,200"
 * @returns {{ raw: string, numeric: number, unit: string } | null}
 */
export function parseNumericValue(str) {
  if (!str || typeof str !== "string") return null;

  const raw = str.trim();
  if (!raw) return null;

  let unit = "";
  let working = raw;

  // Strip leading currency symbols
  if (working.startsWith("$")) {
    unit = "$";
    working = working.slice(1);
  } else if (working.startsWith("€")) {
    unit = "€";
    working = working.slice(1);
  } else if (working.startsWith("£")) {
    unit = "£";
    working = working.slice(1);
  }

  // Strip trailing percent
  if (working.endsWith("%")) {
    unit = "%";
    working = working.slice(0, -1);
  }

  // Strip commas used as thousands separators
  working = working.replace(/,/g, "");

  // Handle magnitude suffixes (case-insensitive)
  let multiplier = 1;
  const lower = working.toLowerCase();
  if (lower.endsWith(" billion") || lower.endsWith("b")) {
    multiplier = 1e9;
    working = lower.endsWith(" billion")
      ? working.slice(0, -" billion".length)
      : working.slice(0, -1);
  } else if (lower.endsWith(" million") || lower.endsWith("m")) {
    multiplier = 1e6;
    working = lower.endsWith(" million")
      ? working.slice(0, -" million".length)
      : working.slice(0, -1);
  } else if (lower.endsWith(" trillion") || lower.endsWith("t")) {
    multiplier = 1e12;
    working = lower.endsWith(" trillion")
      ? working.slice(0, -" trillion".length)
      : working.slice(0, -1);
  } else if (lower.endsWith("k")) {
    multiplier = 1e3;
    working = working.slice(0, -1);
  }

  const numeric = parseFloat(working.trim());
  if (isNaN(numeric)) return null;

  return { raw, numeric: numeric * multiplier, unit };
}

const CHART_TYPE_FROM_DISPLAY = {
  chart_bar: "bar",
  table: "table",
  inline: "inline",
};

const CHART_TYPE_FROM_EXTRACTION_TYPE = {
  statistic: "inline",
  comparison: "bar",
  timeline_event: "timeline",
  ranking: "bar",
  trend: "line",
  proportion: "bar",
  process_flow: "gantt",
  overlap: "table",
};

/**
 * Infer a chart_type string for an extraction that lacks a visualization field.
 * Provides backward compatibility with old annotations.
 *
 * @param {{ type?: string, display_suggestion?: string, values?: Array }} extraction
 * @returns {string} chart_type
 */
export function inferChartType(extraction) {
  const { type, display_suggestion, values } = extraction || {};

  // If display_suggestion maps directly, use it
  if (display_suggestion && CHART_TYPE_FROM_DISPLAY[display_suggestion]) {
    const mapped = CHART_TYPE_FROM_DISPLAY[display_suggestion];
    // Only use bar if there are actually 2+ numeric values
    if (mapped === "bar") {
      const numericCount = (values || []).filter((v) =>
        parseNumericValue(v?.value),
      ).length;
      if (numericCount < 2) return "inline";
    }
    return mapped;
  }

  // Fall back to extraction type
  if (type && CHART_TYPE_FROM_EXTRACTION_TYPE[type]) {
    return CHART_TYPE_FROM_EXTRACTION_TYPE[type];
  }

  return "inline";
}

/**
 * Get the effective chart_type for an extraction, using visualization if present
 * or inferring from legacy fields otherwise.
 *
 * @param {object} extraction
 * @returns {string}
 */
export function getChartType(extraction) {
  const viz = extraction?.visualization;
  if (viz?.chart_type) return viz.chart_type;
  return inferChartType(extraction);
}

/** Chart types that render as actual visual charts (not table or inline text). */
export const VISUAL_CHART_TYPES = new Set(["bar", "line", "timeline", "gantt"]);

/**
 * Returns true if the extraction should be rendered as a visual chart.
 * @param {object} extraction
 * @returns {boolean}
 */
export function isVisualChart(extraction) {
  return VISUAL_CHART_TYPES.has(getChartType(extraction));
}
