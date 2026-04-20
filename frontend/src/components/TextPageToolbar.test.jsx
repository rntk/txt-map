import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import TextPageToolbar from "./TextPageToolbar";

describe("TextPageToolbar", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(""),
      }),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("shows the marker summary action in the menu", () => {
    render(
      <TextPageToolbar
        submissionId="sub-1"
        status={{ overall: "completed", tasks: {} }}
        onRefresh={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /menu/i }));

    expect(
      screen.getByRole("button", { name: "Marker Summary" }),
    ).toBeInTheDocument();
  });

  it("queues topic recalculation with marker summary included", async () => {
    const onRefresh = vi.fn();
    render(
      <TextPageToolbar
        submissionId="sub-1"
        status={{ overall: "completed", tasks: {} }}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    fireEvent.click(screen.getByRole("button", { name: "Topics" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/submission/sub-1/refresh",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tasks: [
              "split_topic_generation",
              "subtopics_generation",
              "summarization",
              "mindmap",
              "insights_generation",
              "topic_marker_summary_generation",
              "topic_temperature_generation",
            ],
          }),
        }),
      );
    });
    expect(onRefresh).toHaveBeenCalled();
  });
});
