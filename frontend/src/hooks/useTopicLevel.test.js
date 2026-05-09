import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTopicLevel } from "./useTopicLevel";

describe("useTopicLevel", () => {
  it("returns maxLevel 0 and selectedLevel 0 for empty topics", () => {
    const { result } = renderHook(() => useTopicLevel([], []));
    expect(result.current.maxLevel).toBe(0);
    expect(result.current.selectedLevel).toBe(0);
  });

  it("adjusts selectedLevel down when maxLevel decreases", () => {
    const { result, rerender } = renderHook(
      ({ topics }) => useTopicLevel(topics, []),
      {
        initialProps: {
          topics: [{ name: "A" }, { name: "A>B" }, { name: "A>B>C" }],
        },
      },
    );

    expect(result.current.maxLevel).toBe(2);
    expect(result.current.selectedLevel).toBe(0);

    act(() => {
      result.current.setSelectedLevel(2);
    });

    rerender({
      topics: [{ name: "A" }],
    });

    expect(result.current.maxLevel).toBe(0);
    expect(result.current.selectedLevel).toBe(0);
  });
});
