import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CanvasTopicTagsRail from "./CanvasTopicTagsRail";

const noop = vi.fn();

function renderRail(scale = 1) {
  return render(
    <CanvasTopicTagsRail
      topicTagsLayout={{
        articleRight: 100,
        articleHeight: 260,
        cards: [
          {
            key: "topic-a",
            topicName: "Topic A",
            fullPath: "Parent>Topic A",
            sentenceNumbers: [1, 2],
            sentenceStart: 1,
            sentenceEnd: 2,
            tags: [
              { tag: "alpha", score: 99 },
              { tag: "beta", score: 95 },
              { tag: "gamma", score: 91 },
              { tag: "delta", score: 89 },
              { tag: "epsilon", score: 85 },
            ],
            cardY: 20,
            cardHeight: 150,
            startY: 10,
            endY: 180,
          },
        ],
      }}
      activeTopicKey={null}
      onCardEnter={noop}
      onCardLeave={noop}
      onCardClick={noop}
      onLoadMore={noop}
      translate={{ x: 0, y: 0 }}
      scale={scale}
      isAnimating={false}
    />,
  );
}

describe("CanvasTopicTagsRail", () => {
  it("shows initial scored tags and loads more tags for the topic", () => {
    renderRail();

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("epsilon")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show more (1)" }));

    expect(noop).toHaveBeenCalledWith("topic-a", 5);
  });

  it("scales tag typography with canvas zoom", () => {
    const { container, rerender } = renderRail(0.5);
    const rail = container.querySelector(".canvas-topic-tags-rail");

    expect(rail.style.left).toBe("183px");
    expect(rail.style.getPropertyValue("--canvas-topic-tags-rail-width")).toBe(
      "640px",
    );
    expect(
      rail.style.getPropertyValue("--canvas-topic-tags-name-font-size"),
    ).toBe("20px");
    expect(
      rail.style.getPropertyValue("--canvas-topic-tags-meta-font-size"),
    ).toBe("18px");
    expect(
      rail.style.getPropertyValue("--canvas-topic-tags-tag-font-size"),
    ).toBe("20px");

    rerender(
      <CanvasTopicTagsRail
        topicTagsLayout={{
          articleRight: 100,
          articleHeight: 260,
          cards: [
            {
              key: "topic-a",
              topicName: "Topic A",
              fullPath: "Parent>Topic A",
              sentenceNumbers: [1, 2],
              sentenceStart: 1,
              sentenceEnd: 2,
              tags: [
                { tag: "alpha", score: 99 },
                { tag: "beta", score: 95 },
                { tag: "gamma", score: 91 },
                { tag: "delta", score: 89 },
                { tag: "epsilon", score: 85 },
              ],
              cardY: 20,
              cardHeight: 150,
              startY: 10,
              endY: 180,
            },
          ],
        }}
        activeTopicKey={null}
        onCardEnter={noop}
        onCardLeave={noop}
        onCardClick={noop}
        onLoadMore={noop}
        translate={{ x: 0, y: 0 }}
        scale={2}
        isAnimating={false}
      />,
    );

    expect(rail.style.left).toBe("183px");
    expect(rail.style.getPropertyValue("--canvas-topic-tags-rail-width")).toBe(
      "320px",
    );
    expect(
      rail.style.getPropertyValue("--canvas-topic-tags-name-font-size"),
    ).toBe("10px");
    expect(
      rail.style.getPropertyValue("--canvas-topic-tags-meta-font-size"),
    ).toBe("9px");
    expect(
      rail.style.getPropertyValue("--canvas-topic-tags-tag-font-size"),
    ).toBe("10px");
  });
});
