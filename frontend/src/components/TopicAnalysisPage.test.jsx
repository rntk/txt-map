import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TopicAnalysisPage from "./TopicAnalysisPage";

vi.mock("./TopicsTagCloud", () => ({
  WordCloudDisplay: ({ words }) => (
    <div data-testid="topic-tag-cloud">
      {words.map((entry) => entry.word).join(",")}
    </div>
  ),
}));

describe("TopicAnalysisPage", () => {
  const originalFetch = global.fetch;

  const topicAnalysisPayload = {
    source_url: "https://example.com/article",
    topics: [
      { name: "Alpha Topic", sentences: [1, 2] },
      { name: "Beta Topic", sentences: [3] },
    ],
    clusters: [
      {
        cluster_id: 0,
        keywords: ["alpha", "beta"],
        sentence_indices: [1],
      },
    ],
    sentences: [
      "Running cats sprint quickly.",
      "Cats keep running fast.",
      "Beta words only.",
    ],
    topic_model: {
      latent_topics: [],
      topic_mapping: [],
    },
    task_status: {
      split_topic_generation: "completed",
      clustering_generation: "completed",
      topic_modeling_generation: "completed",
    },
  };

  const alphaHeatmapPayload = {
    submission_id: "sub-123",
    scope: "topic",
    topic_name: "Alpha Topic",
    window_size: 3,
    normalization: "lemma",
    words: [
      {
        word: "run",
        frequency: 2,
        specificity_score: 2.5,
        outside_topic_frequency: 0,
      },
      {
        word: "cat",
        frequency: 2,
        specificity_score: 2.2,
        outside_topic_frequency: 0,
      },
      {
        word: "shared",
        frequency: 2,
        specificity_score: 0.8,
        outside_topic_frequency: 3,
      },
    ],
    col_words: [
      {
        word: "cat",
        frequency: 2,
        specificity_score: 2.2,
        outside_topic_frequency: 0,
      },
      {
        word: "run",
        frequency: 2,
        specificity_score: 2.5,
        outside_topic_frequency: 0,
      },
      {
        word: "shared",
        frequency: 2,
        specificity_score: 0.8,
        outside_topic_frequency: 3,
      },
    ],
    matrix: [
      [0, 2, 1],
      [2, 0, 1],
      [1, 1, 0],
    ],
    max_value: 2,
    default_visible_word_count: 2,
    total_word_count: 3,
  };

  const betaHeatmapPayload = {
    submission_id: "sub-123",
    scope: "topic",
    topic_name: "Beta Topic",
    window_size: 3,
    normalization: "lemma",
    words: [
      {
        word: "beta",
        frequency: 1,
        specificity_score: 1.4,
        outside_topic_frequency: 0,
      },
    ],
    col_words: [
      {
        word: "beta",
        frequency: 1,
        specificity_score: 1.4,
        outside_topic_frequency: 0,
      },
    ],
    matrix: [[0]],
    max_value: 0,
    default_visible_word_count: 2,
    total_word_count: 1,
  };

  beforeEach(() => {
    window.history.pushState({}, "", "/page/topic-analysis/sub-123");
    global.fetch = vi.fn(async (url) => {
      const normalizedUrl = String(url);
      if (normalizedUrl.includes("/api/submission/sub-123/topic-analysis?")) {
        throw new Error("Unexpected topic-analysis URL");
      }
      if (normalizedUrl.endsWith("/api/submission/sub-123/topic-analysis")) {
        return {
          ok: true,
          json: async () => topicAnalysisPayload,
        };
      }
      if (
        normalizedUrl.includes(
          "/api/submission/sub-123/topic-analysis/heatmap?topic_name=Alpha%20Topic",
        )
      ) {
        return {
          ok: true,
          json: async () => alphaHeatmapPayload,
        };
      }
      if (
        normalizedUrl.includes(
          "/api/submission/sub-123/topic-analysis/heatmap?topic_name=Beta%20Topic",
        )
      ) {
        return {
          ok: true,
          json: async () => betaHeatmapPayload,
        };
      }
      throw new Error(`Unhandled fetch: ${normalizedUrl}`);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders the heatmap with linked row and column headers and numeric cells", async () => {
    render(<TopicAnalysisPage />);

    await screen.findByRole("heading", {
      name: /Alpha Topic — Bigram Heatmap/i,
    });

    const runLinks = await screen.findAllByRole("link", { name: "run" });
    expect(runLinks).toHaveLength(2);
    expect(runLinks[0]).toHaveAttribute("href", "/page/word/sub-123/run");

    const catRowHeader = screen.getByRole("rowheader", { name: "cat" });
    expect(catRowHeader.querySelector("a")).toHaveAttribute(
      "href",
      "/page/word/sub-123/cat",
    );

    const heatmapRegion = screen.getByRole("region", {
      name: "Bigram heatmap",
    });
    expect(heatmapRegion).toBeInTheDocument();

    const highlightedCells = screen.getAllByText("2");
    expect(highlightedCells.length).toBeGreaterThan(0);
    expect(
      highlightedCells.some((cell) =>
        cell.closest("td")?.className.includes("heat-8"),
      ),
    ).toBe(true);
    expect(
      screen.getByRole("link", { name: /Highlight run cat in article/i }),
    ).toHaveAttribute("href", "/page/text/sub-123?words=run%2Ccat");
    expect(screen.queryAllByText("0").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /Show all 3 words/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "shared" }),
    ).not.toBeInTheDocument();
  });

  it("toggles between the default ranked subset and all ranked words", async () => {
    render(<TopicAnalysisPage />);

    await screen.findByRole("button", { name: /Show all 3 words/i });

    fireEvent.click(screen.getByRole("button", { name: /Show all 3 words/i }));

    const sharedLinks = await screen.findAllByRole("link", { name: "shared" });
    expect(sharedLinks).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Show top 2/i }),
    ).toBeInTheDocument();
  });

  it("refetches the heatmap when the selected topic changes", async () => {
    render(<TopicAnalysisPage />);

    await screen.findAllByRole("link", { name: "run" });

    fireEvent.click(screen.getByRole("button", { name: /Beta Topic/i }));

    await screen.findAllByRole("link", { name: "beta" });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/submission/sub-123/topic-analysis/heatmap?topic_name=Beta%20Topic",
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });
});
