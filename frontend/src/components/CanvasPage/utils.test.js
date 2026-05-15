import { describe, expect, it, vi } from "vitest";
import {
  clampCanvasScale,
  getZoomAdjustedFontSize,
  getZoomAdjustedTopicTitleFontSize,
  getZoomAdjustedTopicCardWidth,
  getTopicTitleFontSize,
  getCursorAnchoredTranslate,
  sleep,
  readJsonSafe,
  buildSegments,
  buildSegmentsWithPages,
  eventToHighlights,
  eventLabel,
  getTopicDisplayName,
  getTopicSentenceNumbers,
  getTopicTextRange,
  getTopicSentenceTextRanges,
  splitTopicHierarchyRowsForArticleOrder,
  getMatchingSummaryCardsForHierarchyRow,
  splitTopicHierarchyRowsForSummaryOrder,
} from "./utils";

describe("clampCanvasScale", () => {
  it("clamps to MAX_CANVAS_SCALE", () => {
    expect(clampCanvasScale(10)).toBe(4);
  });

  it("clamps to MIN_CANVAS_SCALE", () => {
    expect(clampCanvasScale(0.01)).toBe(0.2);
  });

  it("passes through in-range values", () => {
    expect(clampCanvasScale(1)).toBe(1);
    expect(clampCanvasScale(2)).toBe(2);
  });
});

describe("getZoomAdjustedTopicTitleFontSize", () => {
  it("scales up at zoomed-out levels", () => {
    const atHalf = getZoomAdjustedTopicTitleFontSize(0.5);
    const atOne = getZoomAdjustedTopicTitleFontSize(1);
    expect(atHalf).toBeGreaterThan(atOne);
  });

  it("does not scale below 1x at zoomed-in levels", () => {
    const atTwo = getZoomAdjustedTopicTitleFontSize(2);
    const atOne = getZoomAdjustedTopicTitleFontSize(1);
    expect(atTwo).toBe(atOne);
  });

  it("handles falsy scale by defaulting to 1", () => {
    expect(getZoomAdjustedTopicTitleFontSize(0)).toBe(
      getZoomAdjustedTopicTitleFontSize(1),
    );
    expect(getZoomAdjustedTopicTitleFontSize(null)).toBe(
      getZoomAdjustedTopicTitleFontSize(1),
    );
  });
});

describe("getZoomAdjustedFontSize", () => {
  it("scales a base font size up at zoomed-out levels", () => {
    expect(getZoomAdjustedFontSize(0.5, 10)).toBe(20);
  });

  it("does not scale a base font size below 1x at zoomed-in levels", () => {
    expect(getZoomAdjustedFontSize(2, 10)).toBe(10);
  });
});

describe("getZoomAdjustedTopicCardWidth", () => {
  it("scales up at zoomed-out levels", () => {
    const atHalf = getZoomAdjustedTopicCardWidth(0.5);
    const atOne = getZoomAdjustedTopicCardWidth(1);
    expect(atHalf).toBeGreaterThan(atOne);
  });
});

describe("getTopicTitleFontSize", () => {
  it("returns at least 1 for very small heights", () => {
    const size = getTopicTitleFontSize({ scale: 1, height: 1 });
    expect(size).toBeGreaterThanOrEqual(1);
  });

  it("returns capped fontSize for reasonable heights", () => {
    const size = getTopicTitleFontSize({ scale: 1, height: 100 });
    expect(size).toBeGreaterThan(0);
  });
});

describe("getCursorAnchoredTranslate", () => {
  it("shifts translate to keep cursor anchored", () => {
    const result = getCursorAnchoredTranslate({
      cursor: { x: 100, y: 200 },
      translate: { x: 50, y: 50 },
      currentScale: 1,
      nextScale: 2,
    });
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(-100);
  });

  it("identity when scales are equal", () => {
    const result = getCursorAnchoredTranslate({
      cursor: { x: 100, y: 200 },
      translate: { x: 50, y: 50 },
      currentScale: 1,
      nextScale: 1,
    });
    expect(result).toEqual({ x: 50, y: 50 });
  });
});

describe("sleep", () => {
  it("resolves after the specified ms", async () => {
    vi.useFakeTimers();
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await promise;
    vi.useRealTimers();
  });

  it("rejects immediately if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(1000, controller.signal)).rejects.toThrow();
  });
});

describe("readJsonSafe", () => {
  it("parses valid JSON", async () => {
    const response = new Response('{"key": "value"}');
    const result = await readJsonSafe(response);
    expect(result).toEqual({ key: "value" });
  });

  it("returns empty object for empty body", async () => {
    const response = new Response("");
    const result = await readJsonSafe(response);
    expect(result).toEqual({});
  });

  it("returns empty object for invalid JSON", async () => {
    const response = new Response("not json");
    const result = await readJsonSafe(response);
    expect(result).toEqual({});
  });
});

describe("buildSegments", () => {
  it("returns single segment when no highlights", () => {
    const segments = buildSegments("hello world", []);
    expect(segments).toEqual([
      {
        text: "hello world",
        start: 0,
        end: 11,
        highlighted: false,
        read: false,
      },
    ]);
  });

  it("splits text at highlight boundaries", () => {
    const segments = buildSegments("hello world", [{ start: 0, end: 5 }]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual(
      expect.objectContaining({
        text: "hello",
        start: 0,
        end: 5,
        highlighted: true,
      }),
    );
    expect(segments[1]).toEqual(
      expect.objectContaining({
        text: " world",
        start: 5,
        end: 11,
        highlighted: false,
      }),
    );
  });

  it("marks read ranges", () => {
    const segments = buildSegments("hello world", [], {
      readRanges: [{ start: 0, end: 5 }],
    });
    expect(segments[0].read).toBe(true);
    expect(segments[1].read).toBe(false);
  });

  it("applies temperature colors", () => {
    const segments = buildSegments("hello world", [], {
      temperatureHighlights: [{ start: 0, end: 5, color: "red" }],
    });
    expect(segments[0].temperatureColor).toBe("red");
    expect(segments[1].temperatureColor).toBeUndefined();
  });

  it("carries highlight labels", () => {
    const segments = buildSegments("hello", [{ start: 0, end: 5, label: "topic" }]);
    expect(segments[0].label).toBe("topic");
  });

  it("splits at sentence boundaries", () => {
    const segments = buildSegments("hello world", [], { sentenceBoundaries: [5] });
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe("hello");
    expect(segments[1].text).toBe(" world");
  });
});

describe("buildSegmentsWithPages", () => {
  it("delegates to buildSegments when no pages", () => {
    const result = buildSegmentsWithPages("hello", [], []);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("segment");
    expect(result[0].text).toBe("hello");
  });

  it("splits across pages with page-splitters", () => {
    const result = buildSegmentsWithPages(
      "hello world",
      [],
      [
        { page_number: 1, start: 0, end: 5 },
        { page_number: 2, start: 5, end: 11 },
      ],
    );
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("segment");
    expect(result[0].text).toBe("hello");
    expect(result[1].type).toBe("page-splitter");
    expect(result[1].page_number).toBe(2);
    expect(result[2].type).toBe("segment");
    expect(result[2].text).toBe(" world");
  });
});

describe("eventToHighlights", () => {
  it("returns empty for null event", () => {
    expect(eventToHighlights(null)).toEqual([]);
  });

  it("returns highlight for highlight_span event", () => {
    const result = eventToHighlights({
      event_type: "highlight_span",
      data: { start: 10, end: 20, label: "test" },
    });
    expect(result).toEqual([{ start: 10, end: 20, label: "test" }]);
  });

  it("returns empty for non-highlight event types", () => {
    expect(eventToHighlights({ event_type: "other" })).toEqual([]);
  });

  it("returns empty when start/end are missing", () => {
    expect(
      eventToHighlights({ event_type: "highlight_span", data: {} }),
    ).toEqual([]);
  });
});

describe("eventLabel", () => {
  it("returns index-based label for null event", () => {
    expect(eventLabel(null, 2)).toBe("#3");
  });

  it("returns labeled highlight for highlight_span with label", () => {
    expect(
      eventLabel(
        { event_type: "highlight_span", data: { label: "my topic" } },
        0,
      ),
    ).toBe("1. my topic");
  });

  it("returns unlabeled highlight", () => {
    expect(eventLabel({ event_type: "highlight_span", data: {} }, 1)).toBe(
      "2. highlight",
    );
  });

  it("returns generic label for other event types", () => {
    expect(eventLabel({ event_type: "annotation" }, 0)).toBe("1. annotation");
  });
});

describe("getTopicDisplayName", () => {
  it("returns displayName if present", () => {
    expect(getTopicDisplayName({ displayName: "My Topic" })).toBe("My Topic");
  });

  it("derives name from fullPath", () => {
    expect(getTopicDisplayName({ fullPath: "Parent>Child" })).toBe("Child");
  });

  it("falls back to name", () => {
    expect(getTopicDisplayName({ name: "Topic" })).toBe("Topic");
  });

  it("returns empty string for empty input", () => {
    expect(getTopicDisplayName({})).toBe("");
  });
});

describe("getTopicSentenceNumbers", () => {
  it("returns sentenceIndices when available", () => {
    expect(getTopicSentenceNumbers({ sentenceIndices: [1, 3, 5] })).toEqual([
      1, 3, 5,
    ]);
  });

  it("falls back to sentences", () => {
    expect(getTopicSentenceNumbers({ sentences: [2, 4] })).toEqual([2, 4]);
  });

  it("filters non-positive and non-integer values", () => {
    expect(
      getTopicSentenceNumbers({ sentences: [0, -1, 2.5, 3, "bad"] }),
    ).toEqual([3]);
  });

  it("returns empty array for null topic", () => {
    expect(getTopicSentenceNumbers(null)).toEqual([]);
  });
});

describe("getTopicTextRange", () => {
  const offsets = [0, 10, 25, 40];
  const sentences = ["Hello.", "World.", "Test.", "End."];

  it("returns range for valid topic", () => {
    const result = getTopicTextRange({ sentences: [1, 3] }, offsets, sentences);
    expect(result).toEqual({ charStart: 0, charEnd: 30 });
  });

  it("returns null for no sentences", () => {
    expect(getTopicTextRange({ sentences: [] }, offsets, sentences)).toBeNull();
  });

  it("returns null for out-of-range sentence numbers", () => {
    expect(
      getTopicTextRange({ sentences: [10] }, offsets, sentences),
    ).toBeNull();
  });
});

describe("getTopicSentenceTextRanges", () => {
  const offsets = [0, 10, 25];
  const sentences = ["Hello.", "World.", "Test."];

  it("returns individual ranges per sentence", () => {
    const result = getTopicSentenceTextRanges(
      { sentences: [1, 3] },
      offsets,
      sentences,
    );
    expect(result).toEqual([
      { charStart: 0, charEnd: 6 },
      { charStart: 25, charEnd: 30 },
    ]);
  });

  it("returns empty array for no sentences", () => {
    expect(
      getTopicSentenceTextRanges({ sentences: [] }, offsets, sentences),
    ).toEqual([]);
  });
});

describe("splitTopicHierarchyRowsForArticleOrder", () => {
  it("splits contiguous runs", () => {
    const rows = [{ fullPath: "A>B", sentences: [1, 2, 3, 5, 6] }];
    const result = splitTopicHierarchyRowsForArticleOrder(rows);
    expect(result).toHaveLength(2);
    expect(result[0].occurrenceKey).toBe("A>B:0");
    expect(result[1].occurrenceKey).toBe("A>B:1");
  });

  it("keeps single-sentence topics as one row", () => {
    const rows = [{ fullPath: "A", sentences: [3] }];
    const result = splitTopicHierarchyRowsForArticleOrder(rows);
    expect(result).toHaveLength(1);
  });

  it("sorts by sentence order", () => {
    const rows = [
      { fullPath: "B", sentences: [5] },
      { fullPath: "A", sentences: [1] },
    ];
    const result = splitTopicHierarchyRowsForArticleOrder(rows);
    expect(result[0].fullPath).toBe("A");
    expect(result[1].fullPath).toBe("B");
  });
});

describe("getMatchingSummaryCardsForHierarchyRow", () => {
  const cards = [{ path: "A>B" }, { path: "A>C" }, { path: "A>B>D" }];

  it("uses summaryCardPaths when present", () => {
    const row = { fullPath: "A", summaryCardPaths: ["A>B", "A>C"] };
    const result = getMatchingSummaryCardsForHierarchyRow(row, cards);
    expect(result).toHaveLength(2);
  });

  it("matches by path prefix when no summaryCardPaths", () => {
    const row = { fullPath: "A>B" };
    const result = getMatchingSummaryCardsForHierarchyRow(row, cards);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

describe("splitTopicHierarchyRowsForSummaryOrder", () => {
  it("returns single row when one matching card", () => {
    const rows = [{ fullPath: "A", sentences: [1] }];
    const cards = [{ path: "A" }];
    const result = splitTopicHierarchyRowsForSummaryOrder(rows, cards);
    expect(result).toHaveLength(1);
    expect(result[0].occurrenceKey).toBe("A:summary:0");
  });

  it("splits into contiguous runs", () => {
    const rows = [{ fullPath: "A", sentences: [1] }];
    const cards = [{ path: "A" }, { path: "B" }, { path: "A" }];
    const result = splitTopicHierarchyRowsForSummaryOrder(rows, cards);
    expect(result).toHaveLength(2);
  });
});
