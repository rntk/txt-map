import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTooltip } from './useTooltip';

describe('useTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initialises with tooltip null', () => {
    const { result } = renderHook(() => useTooltip());
    expect(result.current.tooltip).toBeNull();
  });

  it('showTooltip sets tooltip state', () => {
    const { result } = renderHook(() => useTooltip());
    const topics = [{ topic: 'Science', rangeCount: 2 }];

    act(() => {
      result.current.showTooltip(topics, 100, 200);
    });

    expect(result.current.tooltip).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.tooltip).toEqual({ x: 100, y: 200, topics, meta: null });
  });

  it('showTooltip does nothing when disabled', () => {
    const { result } = renderHook(() => useTooltip(false));

    act(() => {
      result.current.showTooltip([{ topic: 'Physics' }], 50, 60);
    });

    expect(result.current.tooltip).toBeNull();
  });

  it('scheduleHide hides tooltip after delay', () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: 'Art' }], 10, 20);
      vi.advanceTimersByTime(500);
    });
    expect(result.current.tooltip).not.toBeNull();

    act(() => {
      result.current.scheduleHide();
    });
    // Not hidden yet
    expect(result.current.tooltip).not.toBeNull();

    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.tooltip).toBeNull();
  });

  it('cancelHide prevents the scheduled hide', () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: 'Art' }], 10, 20);
      vi.advanceTimersByTime(500);
    });

    act(() => {
      result.current.scheduleHide();
      result.current.cancelHide();
    });

    act(() => {
      vi.runAllTimers();
    });

    // Tooltip should still be visible because hide was cancelled
    expect(result.current.tooltip).not.toBeNull();
  });

  it('showTooltip cancels a pending hide', () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: 'A' }], 1, 2);
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.scheduleHide();
    });
    // Move to a new target before timeout fires
    act(() => {
      result.current.showTooltip([{ topic: 'B' }], 3, 4);
    });
    act(() => {
      vi.runAllTimers();
    });

    // Tooltip should show the new target, not be hidden
    expect(result.current.tooltip).toEqual({ x: 3, y: 4, topics: [{ topic: 'B' }], meta: null });
  });

  it('scheduleHide cancels a pending show before the tooltip appears', () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: 'Art' }], 10, 20);
      result.current.scheduleHide();
      vi.runAllTimers();
    });

    expect(result.current.tooltip).toBeNull();
  });

  it('updates the pending tooltip position before it becomes visible', () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: 'Art' }], 10, 20, { word: 'first' });
      result.current.updateTooltipPosition(30, 40, { word: 'second' });
      vi.advanceTimersByTime(500);
    });

    expect(result.current.tooltip).toEqual({
      x: 30,
      y: 40,
      topics: [{ topic: 'Art' }],
      meta: { word: 'second' },
    });
  });

  it('updates the visible tooltip position immediately', () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: 'Art' }], 10, 20);
      vi.advanceTimersByTime(500);
      result.current.updateTooltipPosition(50, 60);
    });

    expect(result.current.tooltip).toEqual({
      x: 50,
      y: 60,
      topics: [{ topic: 'Art' }],
      meta: null,
    });
  });

  it('hideTooltip immediately sets tooltip to null', () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: 'History' }], 5, 6);
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.hideTooltip();
    });

    expect(result.current.tooltip).toBeNull();
  });

  it('hideTooltip clears lastTargetRef', () => {
    const { result } = renderHook(() => useTooltip());

    act(() => {
      result.current.lastTargetRef.current = document.createElement('span');
      result.current.hideTooltip();
    });

    expect(result.current.lastTargetRef.current).toBeNull();
  });

  it('cleans up pending timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() => useTooltip());

    act(() => {
      result.current.showTooltip([{ topic: 'X' }], 0, 0);
      result.current.scheduleHide();
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('hides an already visible tooltip when the hook is disabled', () => {
    const { result, rerender } = renderHook(({ enabled }) => useTooltip(enabled), {
      initialProps: { enabled: true },
    });

    act(() => {
      result.current.showTooltip([{ topic: 'X' }], 0, 0);
      vi.advanceTimersByTime(500);
    });
    expect(result.current.tooltip).not.toBeNull();

    rerender({ enabled: false });

    expect(result.current.tooltip).toBeNull();
  });
});
