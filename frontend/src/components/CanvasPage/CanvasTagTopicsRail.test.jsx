import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CanvasTagTopicsRail from "./CanvasTagTopicsRail";

const noop = vi.fn();

function renderRail(cardOverrides = {}) {
  return render(
    <CanvasTagTopicsRail
      tagTopicsLayout={{
        articleRight: 100,
        articleHeight: 200,
        cards: [
          {
            key: "topic:1",
            topicName: "Topic",
            fullPath: "Parent>Topic",
            sentences: [1],
            preview: "Original sentence text that matched the selected tag.",
            summaryText: "Concise topic summary from generated summaries.",
            cardY: 20,
            cardHeight: 92,
            ...cardOverrides,
          },
        ],
      }}
      activeTopicKey={null}
      onCardEnter={noop}
      onCardLeave={noop}
      onCardClick={noop}
      translate={{ x: 0, y: 0 }}
      scale={1}
      isAnimating={false}
    />,
  );
}

describe("CanvasTagTopicsRail", () => {
  it("renders the topic summary instead of the matched sentence preview", () => {
    renderRail();

    expect(
      screen.getByText("Concise topic summary from generated summaries."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Original sentence text that matched the selected tag.",
      ),
    ).not.toBeInTheDocument();
  });

  it("falls back to the matched sentence preview when no summary is available", () => {
    renderRail({ summaryText: "" });

    expect(
      screen.getByText("Original sentence text that matched the selected tag."),
    ).toBeInTheDocument();
  });
});
