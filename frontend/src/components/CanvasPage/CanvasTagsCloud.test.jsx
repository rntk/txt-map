import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CanvasTagsCloud from "./CanvasTagsCloud";

/**
 * @param {Partial<React.ComponentProps<typeof CanvasTagsCloud>>} props
 * @returns {ReturnType<typeof render>}
 */
function renderCloud(props = {}) {
  return render(
    <CanvasTagsCloud
      articleText="Alpha alpha beta beta gamma gamma"
      articleHeight={600}
      onWordHoverChange={vi.fn()}
      onWordsComputed={vi.fn()}
      {...props}
    />,
  );
}

describe("CanvasTagsCloud", () => {
  it("renders all article words by frequency in the main cloud", () => {
    renderCloud();

    expect(screen.getByRole("button", { name: "alpha" })).toHaveAttribute(
      "title",
      "alpha: 2",
    );
    expect(screen.getByRole("button", { name: "beta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gamma" })).toBeInTheDocument();
  });

  it("renders ranked tags as a separate block, filtering scores below 50", () => {
    renderCloud({
      topicTagRankings: {
        Topic: [
          { tag: "alpha", score: 80 },
          { tag: "beta", score: 49 },
          { tag: "gamma", score: 10 },
        ],
      },
    });

    expect(screen.getByText("Scored tags")).toBeInTheDocument();

    const rankedBlock = screen.getByText("Scored tags").parentElement;
    expect(rankedBlock).not.toBeNull();
    const ranked = within(/** @type {HTMLElement} */ (rankedBlock));

    expect(ranked.getByRole("button", { name: /alpha\s*80/ })).toHaveAttribute(
      "title",
      "alpha: score 80",
    );
    expect(ranked.queryByRole("button", { name: /beta/ })).toBeNull();
    expect(ranked.queryByRole("button", { name: /gamma/ })).toBeNull();

    expect(screen.getByRole("button", { name: "beta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gamma" })).toBeInTheDocument();
  });

  it("omits the scored tags block when no rankings are provided", () => {
    renderCloud();
    expect(screen.queryByText("Scored tags")).not.toBeInTheDocument();
  });
});
