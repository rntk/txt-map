import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { useContainerSize } from "./useContainerSize";
import React from "react";
import { render } from "@testing-library/react";

describe("useContainerSize", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns default dimensions when no ref is attached and does not create ResizeObserver", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();

    function MockResizeObserver(_cb) {
      this.observe = observe;
      this.disconnect = disconnect;
    }

    global.ResizeObserver = MockResizeObserver;

    let capturedWidth;
    let capturedHeight;

    function TestComponent() {
      const { containerWidth, containerHeight } = useContainerSize(800, 600);
      capturedWidth = containerWidth;
      capturedHeight = containerHeight;
      return React.createElement("div", null, "content");
    }

    render(React.createElement(TestComponent));
    expect(capturedWidth).toBe(800);
    expect(capturedHeight).toBe(600);
    expect(observe).not.toHaveBeenCalled();
  });

  it("observes element exactly once and disconnects on unmount", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();

    function MockResizeObserver(_cb) {
      this.observe = observe;
      this.disconnect = disconnect;
    }

    global.ResizeObserver = MockResizeObserver;

    function TestComponent() {
      const { containerRef } = useContainerSize();
      return React.createElement("div", { ref: containerRef }, "content");
    }

    const { unmount } = render(React.createElement(TestComponent));
    expect(observe).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("updates dimensions from ResizeObserver when width and height are positive", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let roCallback = null;

    function MockResizeObserver(cb) {
      this.observe = observe;
      this.disconnect = disconnect;
      roCallback = cb;
    }

    global.ResizeObserver = MockResizeObserver;

    let capturedWidth = null;
    let capturedHeight = null;

    function TestComponent() {
      const { containerRef, containerWidth, containerHeight } =
        useContainerSize(400, 300);
      capturedWidth = containerWidth;
      capturedHeight = containerHeight;
      return React.createElement("div", { ref: containerRef }, "content");
    }

    const { unmount } = render(React.createElement(TestComponent));

    expect(observe).toHaveBeenCalledTimes(1);

    act(() => {
      roCallback([{ contentRect: { width: 500, height: 400 } }]);
      vi.advanceTimersByTime(150);
    });

    expect(capturedWidth).toBe(500);
    expect(capturedHeight).toBe(400);

    act(() => {
      roCallback([{ contentRect: { width: 0, height: 400 } }]);
      vi.advanceTimersByTime(150);
    });

    expect(capturedWidth).toBe(500);
    expect(capturedHeight).toBe(400);

    act(() => {
      roCallback([{ contentRect: { width: 600, height: 0 } }]);
      vi.advanceTimersByTime(150);
    });

    expect(capturedWidth).toBe(600);
    expect(capturedHeight).toBe(400);

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
