import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTooltip } from "./useTooltip";

describe("useTooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initialises with tooltip null", () => {
    const { result } = renderHook(() => useTooltip());
    expect(result.current.tooltip).toBeNull();
  });

  it("showTooltip sets tooltip state immediately", () => {
    const { result } = renderHook(() => useTooltip());
    const topics = [{ topic: "Science", rangeCount: 2 }];

    act(() => {
      result.current.showTooltip(topics, 100, 200);
    });

    expect(result.current.tooltip).toEqual({
      x: 100,
      y: 200,
      topics,
      meta: null,
    });
  });

  it("showTooltip sets tooltip with meta", () => {
    const { result } = renderHook(() => useTooltip());
    const topics = [{ topic: "Art", rangeCount: 1 }];
    const meta = { sentenceIdx: 2, totalSentences: 10, word: "hello" };

    act(() => {
      result.current.showTooltip(topics, 50, 80, meta);
    });

    expect(result.current.tooltip).toEqual({ x: 50, y: 80, topics, meta });
  });

  it("showTooltip does nothing when disabled", () => {
    const { result } = renderHook(() => useTooltip(false));

    act(() => {
      result.current.showTooltip([{ topic: "Physics" }], 50, 60);
    });

    expect(result.current.tooltip).toBeNull();
  });

  it("showTooltip replaces an existing tooltip immediately", () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: "A" }], 1, 2);
    });
    act(() => {
      result.current.showTooltip([{ topic: "B" }], 3, 4);
    });

    expect(result.current.tooltip).toEqual({
      x: 3,
      y: 4,
      topics: [{ topic: "B" }],
      meta: null,
    });
  });

  it("hideTooltip immediately sets tooltip to null", () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: "History" }], 5, 6);
    });
    act(() => {
      result.current.hideTooltip();
    });

    expect(result.current.tooltip).toBeNull();
  });

  it("hideTooltip clears lastTargetRef", () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.lastTargetRef.current = document.createElement("span");
      result.current.hideTooltip();
    });

    expect(result.current.lastTargetRef.current).toBeNull();
  });

  it("hides an already visible tooltip when the hook is disabled", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useTooltip(enabled),
      {
        initialProps: { enabled: true },
      },
    );

    act(() => {
      result.current.showTooltip([{ topic: "X" }], 0, 0);
    });
    expect(result.current.tooltip).not.toBeNull();

    rerender({ enabled: false });

    expect(result.current.tooltip).toBeNull();
  });
});
