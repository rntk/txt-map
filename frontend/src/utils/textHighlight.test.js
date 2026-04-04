import {
  normalizeCharRange,
  buildTopicStateRanges,
  buildRawTextSegments,
} from "./textHighlight";

describe("normalizeCharRange", () => {
  test("returns clamped range for valid input", () => {
    expect(normalizeCharRange({ start: 2, end: 8 }, 100)).toEqual({
      start: 2,
      end: 8,
    });
  });

  test("clamps start below 0", () => {
    expect(normalizeCharRange({ start: -5, end: 8 }, 100)).toEqual({
      start: 0,
      end: 8,
    });
  });

  test("clamps end above textLength", () => {
    expect(normalizeCharRange({ start: 90, end: 150 }, 100)).toEqual({
      start: 90,
      end: 100,
    });
  });

  test("returns null when end <= start after clamping", () => {
    expect(normalizeCharRange({ start: 10, end: 5 }, 100)).toBeNull();
  });

  test("returns null for non-finite values", () => {
    expect(normalizeCharRange({ start: "a", end: 8 }, 100)).toBeNull();
    expect(normalizeCharRange({ start: NaN, end: 8 }, 100)).toBeNull();
    expect(normalizeCharRange({}, 100)).toBeNull();
  });
});

describe("buildTopicStateRanges", () => {
  const topics = [
    { name: "A", ranges: [{ start: 0, end: 5 }] },
    { name: "B", ranges: [{ start: 10, end: 20 }] },
    { name: "C", ranges: [{ start: 30, end: 40 }] },
  ];

  test("selected topic goes into highlightRanges", () => {
    const { highlightRanges, fadeRanges } = buildTopicStateRanges(
      topics,
      [{ name: "A" }],
      null,
      new Set(),
      100,
    );
    expect(highlightRanges).toEqual([{ start: 0, end: 5 }]);
    expect(fadeRanges).toHaveLength(0);
  });

  test("hovered topic goes into highlightRanges", () => {
    const { highlightRanges } = buildTopicStateRanges(
      topics,
      [],
      { name: "B" },
      new Set(),
      100,
    );
    expect(highlightRanges).toEqual([{ start: 10, end: 20 }]);
  });

  test("read topic goes into fadeRanges", () => {
    const { highlightRanges, fadeRanges } = buildTopicStateRanges(
      topics,
      [],
      null,
      new Set(["C"]),
      100,
    );
    expect(fadeRanges).toEqual([{ start: 30, end: 40 }]);
    expect(highlightRanges).toHaveLength(0);
  });

  test("selected takes priority over read", () => {
    const { highlightRanges, fadeRanges } = buildTopicStateRanges(
      topics,
      [{ name: "A" }],
      null,
      new Set(["A"]),
      100,
    );
    expect(highlightRanges).toHaveLength(1);
    expect(fadeRanges).toHaveLength(0);
  });

  test("topics with no ranges are skipped", () => {
    const topicsNoRanges = [{ name: "X", ranges: [] }];
    const { highlightRanges, fadeRanges } = buildTopicStateRanges(
      topicsNoRanges,
      [{ name: "X" }],
      null,
      new Set(),
      100,
    );
    expect(highlightRanges).toHaveLength(0);
    expect(fadeRanges).toHaveLength(0);
  });

  test("handles array readTopics (non-Set)", () => {
    const { fadeRanges } = buildTopicStateRanges(topics, [], null, ["C"], 100);
    expect(fadeRanges).toEqual([{ start: 30, end: 40 }]);
  });
});

describe("buildRawTextSegments", () => {
  test("returns empty array for empty rawText", () => {
    expect(buildRawTextSegments("", [], [])).toEqual([]);
    expect(buildRawTextSegments(null, [], [])).toEqual([]);
  });

  test("returns single plain segment when no ranges", () => {
    const segments = buildRawTextSegments("hello world", [], []);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ text: "hello world", state: null });
  });

  test("splits text into highlighted and plain segments", () => {
    const segments = buildRawTextSegments(
      "hello world",
      [{ start: 0, end: 5 }],
      [],
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ text: "hello", state: "highlighted" });
    expect(segments[1]).toMatchObject({ text: " world", state: null });
  });

  test("faded segment", () => {
    const segments = buildRawTextSegments(
      "hello world",
      [],
      [{ start: 6, end: 11 }],
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ text: "hello ", state: null });
    expect(segments[1]).toMatchObject({ text: "world", state: "faded" });
  });

  test("merges adjacent segments of same state", () => {
    // Two adjacent highlight ranges should merge
    const segments = buildRawTextSegments(
      "abcde",
      [
        { start: 0, end: 2 },
        { start: 2, end: 5 },
      ],
      [],
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ text: "abcde", state: "highlighted" });
  });
});
