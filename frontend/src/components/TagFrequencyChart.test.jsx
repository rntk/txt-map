import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import TagFrequencyChart from "./TagFrequencyChart";

describe("TagFrequencyChart", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async (url) => {
      const normalizedUrl = String(url);
      if (
        normalizedUrl.includes("path=Science") &&
        normalizedUrl.includes("path=Physics")
      ) {
        return {
          ok: true,
          json: async () => ({
            scope_path: ["Science", "Physics"],
            sentence_count: 2,
            rows: [
              {
                word: "model",
                frequency: 3,
                topics: [
                  {
                    label: "Quantum",
                    full_path: "Science>Physics>Quantum",
                    frequency: 2,
                  },
                ],
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          scope_path: [],
          sentence_count: 4,
          rows: [
            {
              word: "model",
              frequency: 5,
              topics: [
                { label: "Science", full_path: "Science", frequency: 4 },
                { label: "Arts", full_path: "Arts", frequency: 3 },
                { label: "History", full_path: "History", frequency: 2 },
              ],
            },
            {
              word: "signal",
              frequency: 2,
              topics: [],
            },
          ],
        }),
      };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders fetched rows with word links and topic preview buttons", async () => {
    render(<TagFrequencyChart submissionId="sub-123" />);

    expect(await screen.findByText("4 sentences in scope")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "model" })).toHaveAttribute(
      "href",
      "/page/word/sub-123/model",
    );
    expect(screen.getByRole("button", { name: "Science" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arts" })).toBeInTheDocument();
    expect(screen.getByText("No topic")).toBeInTheDocument();
    expect(
      screen.getByTestId("tag-frequency-chart-scroll"),
    ).toBeInTheDocument();
  });

  it("shows the hidden topics popover and drills into a selected topic", async () => {
    render(<TagFrequencyChart submissionId="sub-123" />);

    await screen.findByRole("link", { name: "model" });

    fireEvent.click(
      screen.getByRole("button", { name: "Show all topics for model" }),
    );

    const popover = screen.getByRole("dialog");
    expect(within(popover).getByText("Topics for model")).toBeInTheDocument();
    fireEvent.click(within(popover).getByRole("button", { name: /Science/ }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/submission/sub-123/tag-frequency?path=Science",
      );
    });
  });

  it("updates breadcrumbs and scope when drilling deeper", async () => {
    global.fetch = vi.fn(async (url) => {
      const normalizedUrl = String(url);
      if (
        normalizedUrl.includes("path=Science") &&
        normalizedUrl.includes("path=Physics")
      ) {
        return {
          ok: true,
          json: async () => ({
            scope_path: ["Science", "Physics"],
            sentence_count: 2,
            rows: [
              {
                word: "model",
                frequency: 3,
                topics: [
                  {
                    label: "Quantum",
                    full_path: "Science>Physics>Quantum",
                    frequency: 2,
                  },
                ],
              },
            ],
          }),
        };
      }
      if (normalizedUrl.includes("path=Science")) {
        return {
          ok: true,
          json: async () => ({
            scope_path: ["Science"],
            sentence_count: 3,
            rows: [
              {
                word: "model",
                frequency: 4,
                topics: [
                  {
                    label: "Physics",
                    full_path: "Science>Physics",
                    frequency: 3,
                  },
                ],
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          scope_path: [],
          sentence_count: 4,
          rows: [
            {
              word: "model",
              frequency: 5,
              topics: [
                { label: "Science", full_path: "Science", frequency: 4 },
              ],
            },
          ],
        }),
      };
    });

    render(<TagFrequencyChart submissionId="sub-123" />);

    await screen.findByRole("link", { name: "model" });
    fireEvent.click(screen.getByRole("button", { name: "Science" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Science" })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Physics" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Physics" })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Science" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/submission/sub-123/tag-frequency?path=Science",
      );
    });
  });
});
