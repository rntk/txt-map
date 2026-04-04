import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import ExtractionBadgeBar from "./ExtractionBadgeBar";

const makeExtraction = (type, label, sourceSentences) => ({
  type,
  label,
  source_sentences: sourceSentences,
  values: [],
});

const extractions = [
  makeExtraction("statistic", "Revenue figures", [1, 2]),
  makeExtraction("trend", "Growth over time", [3]),
  makeExtraction("comparison", "Year on year", [5]),
];

const topicSentences = [1, 2, 3];

describe("ExtractionBadgeBar", () => {
  it("renders badges for extractions matching topic sentences", () => {
    render(
      <ExtractionBadgeBar
        extractions={extractions}
        topicSentences={topicSentences}
      />,
    );
    expect(screen.getByText("Statistic")).toBeInTheDocument();
    expect(screen.getByText("Trend")).toBeInTheDocument();
    // sentence 5 not in topicSentences, so Comparison should not appear
    expect(screen.queryByText("Comparison")).not.toBeInTheDocument();
  });

  it("renders nothing when no extractions match", () => {
    const { container } = render(
      <ExtractionBadgeBar
        extractions={extractions}
        topicSentences={[10, 11]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onExtractionHoverStart on mouse enter", () => {
    const onHoverStart = vi.fn();
    render(
      <ExtractionBadgeBar
        extractions={extractions}
        topicSentences={topicSentences}
        onExtractionHoverStart={onHoverStart}
      />,
    );
    fireEvent.mouseEnter(screen.getByText("Statistic"));
    expect(onHoverStart).toHaveBeenCalledTimes(1);
  });

  it("calls onExtractionToggle on click", () => {
    const onToggle = vi.fn();
    render(
      <ExtractionBadgeBar
        extractions={extractions}
        topicSentences={topicSentences}
        onExtractionToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByText("Trend"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("uses label as tooltip title", () => {
    render(
      <ExtractionBadgeBar
        extractions={extractions}
        topicSentences={topicSentences}
      />,
    );
    expect(screen.getByTitle("Revenue figures")).toBeInTheDocument();
  });

  it("applies active class when badge key matches activeExtractionKey", () => {
    // Key format: label__sourceSentences__values
    const ex = extractions[0];
    const key = `${ex.label}__${ex.source_sentences.join(",")}__`;
    render(
      <ExtractionBadgeBar
        extractions={extractions}
        topicSentences={topicSentences}
        activeExtractionKey={key}
      />,
    );
    const badge = screen.getByTitle("Revenue figures");
    expect(badge.className).toContain("rg-extraction__activator--active");
  });

  it("renders null when extractions is empty", () => {
    const { container } = render(
      <ExtractionBadgeBar extractions={[]} topicSentences={topicSentences} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
