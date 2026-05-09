import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSubmission } from "./useSubmission";

describe("useSubmission", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
    global.navigator.sendBeacon = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function waitForHookState(result, predicate) {
    // Allow any pending promises to resolve
    await vi.advanceTimersByTimeAsync(0);
    let attempts = 0;
    while (!predicate(result.current) && attempts < 50) {
      await vi.advanceTimersByTimeAsync(10);
      attempts++;
    }
    return result.current;
  }

  it("fetches submission on mount", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "sub-1",
        status: { tasks: {}, overall_status: "pending" },
      }),
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    expect(result.current.loading).toBe(true);

    await waitForHookState(result, (state) => state.loading === false);

    expect(result.current.submission).toEqual({
      id: "sub-1",
      status: { tasks: {}, overall_status: "pending" },
    });
    expect(result.current.error).toBeNull();
  });

  it("sets error when fetch fails", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    expect(result.current.error).toBe("Submission not found");
    expect(result.current.submission).toBeNull();
  });

  it("sets error when fetch throws", async () => {
    global.fetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    expect(result.current.error).toBe("Network error");
  });

  it("initializes readTopics from submission data", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "sub-1",
        read_topics: ["TopicA", "TopicB"],
        status: { tasks: {}, overall_status: "completed" },
      }),
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    expect(result.current.readTopics).toEqual(new Set(["TopicA", "TopicB"]));
  });

  it("polls status and refetches on completion", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub-1",
          status: { tasks: {}, overall_status: "pending" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tasks: {},
          overall_status: "completed",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub-1",
          read_topics: [],
          status: { tasks: {}, overall_status: "completed" },
        }),
      });

    renderHook(() => useSubmission("sub-1"));

    await vi.advanceTimersByTimeAsync(0);

    // Advance polling interval
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(0);

    // Should have called initial fetch, status poll, and refetch
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/submission/sub-1/status",
    );
  });

  it("stops polling when overall status is completed", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub-1",
          status: { tasks: {}, overall_status: "pending" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tasks: {},
          overall_status: "completed",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub-1",
          read_topics: [],
          status: { tasks: {}, overall_status: "completed" },
        }),
      });

    renderHook(() => useSubmission("sub-1"));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(0);

    // Advance another polling cycle
    await vi.advanceTimersByTimeAsync(3000);

    // Should not poll again after completed (initial + status + refetch = 3)
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("calls sendBeacon on unmount when there are pending changes", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sub-1",
        read_topics: [],
        status: { tasks: {}, overall_status: "completed" },
      }),
    });

    const { result, unmount } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    act(() => {
      result.current.setReadTopics(new Set(["TopicA"]));
    });

    // Unmount before the 500ms debounce fires so pendingSaveRef is still set
    unmount();

    expect(global.navigator.sendBeacon).toHaveBeenCalledWith(
      "/api/submission/sub-1/read-topics",
      expect.any(Blob),
    );
  });

  it("persists read topics after debounce", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sub-1",
        read_topics: [],
        status: { tasks: {}, overall_status: "completed" },
      }),
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    act(() => {
      result.current.setReadTopics(new Set(["TopicA"]));
    });

    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/submission/sub-1/read-topics",
      expect.anything(),
    );

    await vi.advanceTimersByTimeAsync(500);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/submission/sub-1/read-topics",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ read_topics: ["TopicA"] }),
      }),
    );
  });

  it("toggles read state for a selection", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sub-1",
        read_topics: [],
        status: { tasks: {}, overall_status: "completed" },
      }),
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    act(() => {
      result.current.toggleRead({ name: "TopicA", canonicalName: "TopicA" });
    });

    expect(result.current.readTopics).toEqual(new Set(["TopicA"]));

    act(() => {
      result.current.toggleRead({ name: "TopicA", canonicalName: "TopicA" });
    });

    expect(result.current.readTopics).toEqual(new Set([]));
  });

  it("toggles read all", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sub-1",
        read_topics: [],
        status: { tasks: {}, overall_status: "completed" },
      }),
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    act(() => {
      result.current.toggleReadAll(["TopicA", "TopicB"]);
    });

    expect(result.current.readTopics).toEqual(new Set(["TopicA", "TopicB"]));

    act(() => {
      result.current.toggleReadAll(["TopicA", "TopicB"]);
    });

    expect(result.current.readTopics).toEqual(new Set([]));
  });

  it("fetches similar words", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sub-1",
        read_topics: [],
        status: { tasks: {}, overall_status: "completed" },
      }),
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ similar_words: ["word1", "word2"] }),
    });

    const words = await result.current.getSimilarWords("test");

    expect(words).toEqual(["word1", "word2"]);
  });

  it("returns empty array when similar words fetch fails", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sub-1",
        read_topics: [],
        status: { tasks: {}, overall_status: "completed" },
      }),
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const words = await result.current.getSimilarWords("test");

    expect(words).toEqual([]);
  });

  it("handles polling errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub-1",
          status: { tasks: {}, overall_status: "pending" },
        }),
      })
      .mockRejectedValueOnce(new Error("Poll failed"));

    renderHook(() => useSubmission("sub-1"));

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Error polling status:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("setSelectionReadState does nothing for empty topic names", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sub-1",
        read_topics: [],
        status: { tasks: {}, overall_status: "completed" },
      }),
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    act(() => {
      result.current.setSelectionReadState({}, true);
    });

    expect(result.current.readTopics).toEqual(new Set());
  });

  it("toggleRead does nothing for empty topic names", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "sub-1",
        read_topics: [],
        status: { tasks: {}, overall_status: "completed" },
      }),
    });

    const { result } = renderHook(() => useSubmission("sub-1"));

    await waitForHookState(result, (state) => state.loading === false);

    act(() => {
      result.current.toggleRead({});
    });

    expect(result.current.readTopics).toEqual(new Set());
  });
});
