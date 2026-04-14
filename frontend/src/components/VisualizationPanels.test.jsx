import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import VisualizationPanels from "./VisualizationPanels";

vi.mock("./FullScreenGraph", () => ({
  default: ({ children, title }) => (
    <div data-testid="fullscreen-graph">
      <div>{title}</div>
      {children}
    </div>
  ),
}));

vi.mock("./TopicsRiverChart", () => ({
  default: () => <div data-testid="topics-river-chart" />,
}));
vi.mock("./SubtopicsRiverChart", () => ({
  default: () => <div data-testid="subtopics-river-chart" />,
}));
vi.mock("./MarimekkoChartTab", () => ({
  default: () => <div data-testid="marimekko-chart-tab" />,
}));
vi.mock("./MindmapResults", () => ({
  default: () => <div data-testid="mindmap-results" />,
}));
vi.mock("./PrefixTreeResults", () => ({
  default: () => <div data-testid="prefix-tree-results" />,
}));
vi.mock("./TopicsTagCloud", () => ({
  default: () => <div data-testid="topics-tag-cloud" />,
}));
vi.mock("./TagFrequencyChart", () => ({
  default: ({ submissionId }) => (
    <div data-testid="tag-frequency-chart">submission {submissionId}</div>
  ),
}));
vi.mock("./CircularPackingChart", () => ({
  default: () => <div data-testid="circular-packing-chart" />,
}));
vi.mock("./GanttChart", () => ({
  default: () => <div data-testid="gantt-chart" />,
}));
vi.mock("./GridView", () => ({
  default: () => <div data-testid="grid-view" />,
}));
vi.mock("./TopicsBarChart", () => ({
  default: () => <div data-testid="topics-bar-chart" />,
}));
vi.mock("./RadarChart", () => ({
  default: () => <div data-testid="radar-chart" />,
}));
vi.mock("./ArticleStructureChart", () => ({
  default: () => <div data-testid="article-structure-chart" />,
}));
vi.mock("./TreemapChart", () => ({
  default: () => <div data-testid="treemap-chart" />,
}));
vi.mock("./TopicsVennChart", () => ({
  default: () => <div data-testid="topics-venn-chart" />,
}));
vi.mock("./TopicHierarchyFlowChart", () => ({
  default: () => <div data-testid="topic-hierarchy-flow-chart" />,
}));
vi.mock("./ArticleBigramHeatmapView", () => ({
  default: () => <div data-testid="article-bigram-heatmap-view" />,
}));

describe("VisualizationPanels", () => {
  it("renders the tag frequency fullscreen panel", () => {
    render(
      <VisualizationPanels
        fullscreenGraph="tag_frequency"
        onClose={vi.fn()}
        safeTopics={[]}
        safeSentences={[]}
        results={{}}
        submissionId="sub-123"
        allTopics={[]}
      />,
    );

    expect(screen.getByTestId("fullscreen-graph")).toBeInTheDocument();
    expect(screen.getByText("Tag Frequency")).toBeInTheDocument();
    expect(screen.getByTestId("tag-frequency-chart")).toHaveTextContent(
      "submission sub-123",
    );
  });
});
