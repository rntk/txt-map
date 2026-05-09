import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CanvasTagTopicsRail from "./CanvasTagTopicsRail";

const noop = vi.fn();

function renderRail(cardOverrides = {}, layoutOverrides = {}) {
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
        ...layoutOverrides,
      }}
      activeTopicKey={null}
      onCardEnter={noop}
      onCardLeave={noop}
      onCardClick={noop}
      onMoveToTagsCloud={noop}
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

  it("shows the move to tags cloud button", () => {
    renderRail();

    expect(
      screen.getByRole("button", { name: "move to tags cloud" }),
    ).toBeInTheDocument();
  });

  it("shows the move to tags cloud button without matching topic cards", () => {
    renderRail({}, { cards: [] });

    expect(
      screen.getByRole("button", { name: "move to tags cloud" }),
    ).toBeInTheDocument();
  });

  it("keeps the move to tags cloud button in the current viewport", () => {
    render(
      <CanvasTagTopicsRail
        tagTopicsLayout={{
          articleRight: 100,
          articleHeight: 2000,
          cards: [],
        }}
        activeTopicKey={null}
        onCardEnter={noop}
        onCardLeave={noop}
        onCardClick={noop}
        onMoveToTagsCloud={noop}
        translate={{ x: 0, y: -900 }}
        scale={1}
        isAnimating={false}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "move to tags cloud" })
        .style.getPropertyValue("top"),
    ).toBe("912px");
  });
});
