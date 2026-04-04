import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TopicsVennChart from "./TopicsVennChart";

// Mock d3 because it doesn't work well in jsdom/vitest environment for simulations
vi.mock("d3", async () => {
  const actual = await vi.importActual("d3");
  const mockForce = {
    id: vi.fn().mockReturnThis(),
    distance: vi.fn().mockReturnThis(),
    strength: vi.fn().mockReturnThis(),
  };
  const mockSim = {
    force: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    tick: vi.fn().mockReturnThis(),
    nodes: vi.fn().mockReturnThis(),
  };
  return {
    ...actual,
    forceSimulation: vi.fn(() => mockSim),
    forceLink: vi.fn(() => mockForce),
    forceManyBody: vi.fn(() => mockForce),
    forceCenter: vi.fn(() => mockForce),
    scaleOrdinal: vi.fn(() => () => "#000000"),
  };
});

describe("TopicsVennChart", () => {
  const topicsNoOverlap = [
    { name: "Science", sentences: [1] },
    { name: "Science>Physics", sentences: [1] },
    { name: "Arts", sentences: [2] },
    { name: "Arts>Music", sentences: [2] },
  ];

  const topicsWithOverlap = [
    { name: "Science", sentences: [1] },
    { name: "Science>Research", sentences: [1] },
    { name: "Arts", sentences: [2] },
    { name: "Arts>Research", sentences: [2] },
  ];

  it("renders empty state when no topics are provided", () => {
    render(<TopicsVennChart topics={[]} />);
    expect(
      screen.getByText("No topics available at this level."),
    ).toBeInTheDocument();
  });

  it('renders "no overlaps" message when topics exist but do not overlap', () => {
    render(<TopicsVennChart topics={topicsNoOverlap} />);
    expect(
      screen.getByText("No overlapping topics found at this level."),
    ).toBeInTheDocument();
    // Should NOT render any SVG circles from VennComponentGroup
    expect(document.querySelector(".venn-chart__svg")).toBeNull();
  });

  it("renders VennComponentGroup when topics overlap", () => {
    render(<TopicsVennChart topics={topicsWithOverlap} />);

    // The description should show overlaps count
    expect(screen.getByText(/Total overlaps: 1/)).toBeInTheDocument();

    // Should render the SVG
    // Note: Since we mocked d3 heavily, we just check if the component is rendered
    expect(document.querySelector(".venn-chart__svg")).not.toBeNull();

    // It should NOT show the "no overlaps" message
    expect(
      screen.queryByText("No overlapping topics found at this level."),
    ).toBeNull();
  });
});
