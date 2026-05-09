import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTextSelection } from "./useTextSelection";

describe("useTextSelection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initialises with null selectionData", () => {
    const { result } = renderHook(() => useTextSelection());
    expect(result.current.selectionData).toBeNull();
  });

  it("clears selection on mousedown", () => {
    const mockRange = {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 30,
        height: 10,
      }),
    };

    const mockSelection = {
      toString: () => "hello",
      rangeCount: 1,
      getRangeAt: () => mockRange,
    };

    vi.stubGlobal("getSelection", () => mockSelection);

    const { result } = renderHook(() => useTextSelection());

    // First set selection via mouseup
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.selectionData).not.toBeNull();

    // Then clear via mousedown (also covers clearTimeout branch)
    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(result.current.selectionData).toBeNull();

    vi.unstubAllGlobals();
  });

  it("cancels pending timeout on mouseup when another mouseup is triggered", () => {
    const mockRange = {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 30,
        height: 10,
      }),
    };

    const mockSelection = {
      toString: () => "hello",
      rangeCount: 1,
      getRangeAt: () => mockRange,
    };

    vi.stubGlobal("getSelection", () => mockSelection);

    const { result } = renderHook(() => useTextSelection());

    // Trigger mouseup to start timeout
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    // Trigger another mouseup before timeout fires - this should clear the pending timeout
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.selectionData).toEqual({
      word: "hello",
      position: { x: 25, y: 12 },
    });

    vi.unstubAllGlobals();
  });

  it("sets selectionData on mouseup with a single word selection", () => {
    const mockRange = {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 30,
        height: 10,
      }),
    };

    const mockSelection = {
      toString: () => "hello",
      rangeCount: 1,
      getRangeAt: () => mockRange,
    };

    vi.stubGlobal("getSelection", () => mockSelection);

    const { result } = renderHook(() => useTextSelection());

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.selectionData).toEqual({
      word: "hello",
      position: { x: 25, y: 12 },
    });

    vi.unstubAllGlobals();
  });

  it("does not set selectionData for multi-word selection", () => {
    const mockSelection = {
      toString: () => "hello world",
      rangeCount: 1,
    };

    vi.stubGlobal("getSelection", () => mockSelection);

    const { result } = renderHook(() => useTextSelection());

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.selectionData).toBeNull();

    vi.unstubAllGlobals();
  });

  it("does not set selectionData for single-character selection", () => {
    const mockSelection = {
      toString: () => "a",
      rangeCount: 1,
    };

    vi.stubGlobal("getSelection", () => mockSelection);

    const { result } = renderHook(() => useTextSelection());

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.selectionData).toBeNull();

    vi.unstubAllGlobals();
  });

  it("clears selection on selectionchange when selection is empty", () => {
    const mockRange = {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 30,
        height: 10,
      }),
    };

    const mockSelectionWithText = {
      toString: () => "hello",
      rangeCount: 1,
      getRangeAt: () => mockRange,
    };

    const mockSelectionEmpty = {
      toString: () => "",
      rangeCount: 0,
    };

    vi.stubGlobal("getSelection", () => mockSelectionWithText);

    const { result } = renderHook(() => useTextSelection());

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.selectionData).not.toBeNull();

    vi.stubGlobal("getSelection", () => mockSelectionEmpty);

    act(() => {
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    });

    expect(result.current.selectionData).toBeNull();

    vi.unstubAllGlobals();
  });

  it("clearSelection removes selection data and clears browser selection", () => {
    const mockRange = {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 30,
        height: 10,
      }),
    };

    const mockSelection = {
      toString: () => "hello",
      rangeCount: 1,
      getRangeAt: () => mockRange,
      removeAllRanges: vi.fn(),
    };

    vi.stubGlobal("getSelection", () => mockSelection);

    const { result } = renderHook(() => useTextSelection());

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.selectionData).not.toBeNull();

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectionData).toBeNull();
    expect(mockSelection.removeAllRanges).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
