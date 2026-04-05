import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import TextPage from "./TextPage";
import { buildSummaryTimelineItems } from "../utils/summaryTimeline";
import { matchSummaryToTopics } from "../utils/summaryMatcher";

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
vi.mock("./FullScreenGraph", () => ({
  default: ({ children }) => (
    <div data-testid="fullscreen-graph">{children}</div>
  ),
}));
vi.mock("./TopicsTagCloud", () => ({
  default: () => <div data-testid="topics-tag-cloud" />,
}));
vi.mock("./CircularPackingChart", () => ({
  default: () => <div data-testid="circular-packing-chart" />,
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
vi.mock("../utils/summaryTimeline", () => ({
  buildSummaryTimelineItems: vi.fn(() => []),
}));

vi.mock("../utils/summaryMatcher", () => ({
  matchSummaryToTopics: vi.fn(() => []),
}));

describe("TextPage raw text navigation", () => {
  const mockSubmission = {
    source_url: "http://example.com",
    text_content: "Alpha Beta Gamma",
    html_content: "",
    status: {
      overall: "completed",
      tasks: {},
    },
    results: {
      sentences: ["Alpha Beta Gamma"],
      topics: [
        {
          name: "Topic1",
          sentences: [1],
          ranges: [{ start: 6, end: 10, sentence_start: 1, sentence_end: 1 }],
        },
      ],
      markup: {
        Topic1: {
          positions: [
            {
              index: 1,
              text: "Alpha Beta Gamma",
              source_sentence_index: 1,
            },
          ],
          segments: [
            {
              type: "quote",
              position_indices: [1],
              data: {
                attribution: "Test",
                position_indices: [1],
              },
            },
          ],
        },
      },
      topic_summaries: {},
      article_summary: {
        text: "Brief article summary",
        bullets: ["Important detail one", "Important detail two"],
      },
      paragraph_map: null,
      summary: ["Topic 1 summary paragraph"],
      summary_mappings: [
        {
          summary_index: 0,
          source_sentences: [1],
          summary_sentence: "Topic 1 summary paragraph",
        },
      ],
      insights: [
        {
          name: "Important connection",
          topics: ["Topic1"],
          source_sentence_indices: [1],
          ranges: [{ start: 0, end: 0 }],
        },
      ],
    },
  };

  const originalFetch = global.fetch;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    window.history.pushState({}, "", "/page/text/test-submission-id");
    vi.mocked(buildSummaryTimelineItems).mockReturnValue([]);
    vi.mocked(matchSummaryToTopics).mockReturnValue([]);

    if (typeof navigator.sendBeacon === "undefined") {
      navigator.sendBeacon = vi.fn();
    }

    // Create portal target for TextPageToolbar
    const portalTarget = document.createElement("div");
    portalTarget.id = "global-menu-portal-target";
    document.body.appendChild(portalTarget);

    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/submission/test-submission-id/status")) {
        return {
          ok: true,
          json: async () => ({ overall_status: "completed", tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => mockSubmission,
      };
    });

    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;

    // Clean up portal target
    const portalTarget = document.getElementById("global-menu-portal-target");
    if (portalTarget) {
      portalTarget.remove();
    }
  });

  it("renders highlighted raw text and focuses a raw-text anchor from the topic list", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByRole("button", { name: "Raw Text" }));

    // Need to select the topic to make its range highlighted
    // Use getAllByRole since there may be multiple checkboxes (e.g. "Grouped by topics" toggle)
    const topicCheckbox = screen
      .getAllByRole("checkbox")
      .find((el) => el.closest("li") !== null);
    fireEvent.click(topicCheckbox);

    await waitFor(() => {
      expect(document.querySelector(".raw-text-token")).toBeInTheDocument();
    });

    const betaToken = screen.getByText("Beta");
    expect(betaToken).toBeInTheDocument();
    expect(betaToken).toHaveClass("raw-text-token");
    expect(betaToken).toHaveClass("highlighted");

    fireEvent.click(screen.getByText("Topic1"));

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("applies faded styling in raw text for read topics that are not selected", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByRole("button", { name: "Raw Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark Read" }));

    await waitFor(() => {
      expect(document.querySelector(".raw-text-token")).toBeInTheDocument();
    });

    const betaToken = await screen.findByText("Beta");
    expect(betaToken).toHaveClass("raw-text-token");
    expect(betaToken).toHaveClass("faded");
    expect(betaToken).not.toHaveClass("highlighted");
  });

  it("renders the article summary tab with summary text and bullets", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByRole("button", { name: "Summary" }));

    expect(screen.getByText("Brief article summary")).toBeInTheDocument();
    expect(screen.getByText(/Important detail one/)).toBeInTheDocument();
    expect(screen.getByText(/Important detail two/)).toBeInTheDocument();
    expect(screen.queryByText("Grouped by topics")).not.toBeInTheDocument();
    expect(screen.queryByText("Show tooltips")).not.toBeInTheDocument();
    expect(screen.queryByText("Show minimap")).not.toBeInTheDocument();
  });

  it("renders and hides the minimap based on the article header toggle and grouped mode", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");

    const minimapToggle = screen.getByLabelText("Show minimap");
    fireEvent.click(minimapToggle);

    expect(screen.getByLabelText("Article minimap panel")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Grouped by topics"));

    expect(
      screen.queryByLabelText("Article minimap panel"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Show minimap")).toBeChecked();

    fireEvent.click(screen.getByLabelText("Grouped by topics"));

    expect(screen.getByLabelText("Article minimap panel")).toBeInTheDocument();
  });

  it("shows the minimap toggle on raw text and markup tabs", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByRole("button", { name: "Raw Text" }));
    expect(screen.getByLabelText("Show minimap")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Markup" }));
    expect(screen.getByLabelText("Show minimap")).toBeInTheDocument();
  });

  it("applies topic colors to minimap bars for selected topics", async () => {
    const { container } = render(<TextPage />);

    await screen.findByText("Source:");

    const topicCheckbox = screen
      .getAllByRole("checkbox")
      .find((el) => el.closest("li") !== null);
    fireEvent.click(topicCheckbox);
    fireEvent.click(screen.getByLabelText("Show minimap"));

    const activeBar = container.querySelector(".grid-view-minimap-bar--active");
    expect(activeBar).toBeInTheDocument();
    expect(activeBar.style.getPropertyValue("--minimap-bar-color")).not.toBe(
      "",
    );
  });

  it("scrolls the article when a minimap row is clicked", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByLabelText("Show minimap"));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Scroll to sentence 1" })[0],
    );

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("returns to the article tab before scrolling when a minimap row is clicked from raw text", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByRole("button", { name: "Raw Text" }));
    fireEvent.click(screen.getByLabelText("Show minimap"));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Scroll to sentence 1" })[0],
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Article" })).toHaveClass(
        "article-tab-header__tab--active",
      );
    });
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("scrolls raw-html article content when a minimap row is clicked", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/submission/test-submission-id/status")) {
        return {
          ok: true,
          json: async () => ({ overall_status: "completed", tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          html_content: "<div><p>Alpha Beta Gamma</p></div>",
        }),
      };
    });

    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByLabelText("Show minimap"));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Scroll to sentence 1" })[0],
    );

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("shows no [source] links when matchSummaryToTopics returns no matches", async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([]);

    render(<TextPage />);
    await screen.findByText("Source:");
    fireEvent.click(screen.getByRole("button", { name: "Summary" }));

    expect(screen.queryAllByText("[source]")).toHaveLength(0);
  });

  it("shows [source] links on bullets when matches exist", async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([
      {
        topic: { name: "Topic1", sentences: [1] },
        score: 0.8,
        sentenceIndices: [1],
      },
    ]);

    render(<TextPage />);
    await screen.findByText("Source:");
    fireEvent.click(screen.getByRole("button", { name: "Summary" }));

    const sourceLinks = screen.getAllByText("[source]");
    // Two bullets + summary text all get [source] links
    expect(sourceLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("highlights summary bullets with a semantic class when the topic is selected", async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([
      {
        topic: { name: "Topic1", sentences: [1] },
        score: 0.8,
        sentenceIndices: [1],
      },
    ]);

    render(<TextPage />);
    await screen.findByText("Source:");

    const topicCheckbox = screen
      .getAllByRole("checkbox")
      .find((el) => el.closest("li") !== null);
    fireEvent.click(topicCheckbox);

    fireEvent.click(screen.getByRole("button", { name: "Summary" }));

    const highlightedBullet = screen
      .getByText("Important detail one")
      .closest("li");
    expect(highlightedBullet).toHaveClass(
      "reading-summary__bullet--highlighted",
    );
  });

  it("opens topic menu when [source] is clicked on a bullet", async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([
      {
        topic: { name: "Topic1", sentences: [1] },
        score: 0.8,
        sentenceIndices: [1],
      },
    ]);

    render(<TextPage />);
    await screen.findByText("Source:");
    fireEvent.click(screen.getByRole("button", { name: "Summary" }));

    const sourceLinks = screen.getAllByText("[source]");
    fireEvent.click(sourceLinks[0]);

    expect(screen.getByText("Select topic:")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Topic1/ }),
    ).toBeInTheDocument();
  });

  it("opens TopicSentencesModal when a topic is selected from the menu", async () => {
    vi.mocked(matchSummaryToTopics).mockReturnValue([
      {
        topic: { name: "Topic1", sentences: [1] },
        score: 0.8,
        sentenceIndices: [1],
      },
    ]);

    render(<TextPage />);
    await screen.findByText("Source:");
    fireEvent.click(screen.getByRole("button", { name: "Summary" }));

    const sourceLinks = screen.getAllByText("[source]");
    fireEvent.click(sourceLinks[0]);

    fireEvent.click(screen.getByRole("menuitem", { name: /Topic1/ }));

    // Menu should close and modal should open
    expect(screen.queryByText("Select topic:")).not.toBeInTheDocument();
    expect(
      document.querySelector(".topic-sentences-modal__header h3"),
    ).toHaveTextContent("Topic1");
    expect(screen.getByRole("button", { name: "Enriched" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Enriched" })).toHaveClass(
      "topic-sentences-modal__tab--active",
    );
  });

  it("renders the read progress gauge", async () => {
    render(<TextPage />);
    await screen.findByText("Source:");

    // Initial progress should be 0%
    expect(screen.getByText("0%")).toBeInTheDocument();

    // Mark Topic1 as read
    fireEvent.click(screen.getByRole("button", { name: "Mark Read" }));

    // Topic1 has [1] sentence, total 1 sentence. So 100%.
    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
  });

  it("renders the fullscreen insights view with titles and source sentences", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");

    // Open the View dropdown and click on Insights
    fireEvent.click(screen.getByRole("button", { name: /View/ }));
    fireEvent.click(screen.getByRole("button", { name: /Insights/ }));

    expect(screen.getByText("Important connection")).toBeInTheDocument();
    expect(screen.getAllByText("Alpha Beta Gamma").length).toBeGreaterThan(0);
  });

  it("renders the sidebar insights tab and highlights insight sentences when clicked", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByRole("tab", { name: /Insights/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Important connection/i }),
    );

    await waitFor(() => {
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
    expect(screen.getByText("Important connection")).toBeInTheDocument();
    expect(
      screen
        .getByText("Alpha Beta Gamma")
        .closest(".reading-article__sentence"),
    ).toHaveClass("reading-article__sentence--insight-active");
  });

  it("colors only insight-linked topics from the sidebar insights pane", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/submission/test-submission-id/status")) {
        return {
          ok: true,
          json: async () => ({ overall_status: "completed", tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          text_content: "Alpha Beta Gamma Delta",
          results: {
            ...mockSubmission.results,
            sentences: ["Alpha Beta Gamma Delta"],
            topics: [
              {
                name: "Topic1",
                sentences: [1],
                ranges: [
                  { start: 6, end: 10, sentence_start: 1, sentence_end: 1 },
                ],
              },
              {
                name: "Topic2",
                sentences: [1],
                ranges: [
                  { start: 17, end: 22, sentence_start: 1, sentence_end: 1 },
                ],
              },
            ],
            insights: [
              {
                name: "Important connection",
                topics: ["Topic1"],
                source_sentence_indices: [1],
              },
            ],
          },
        }),
      };
    });

    const { container } = render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByRole("tab", { name: /Insights/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Color Insight Topics" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Raw Text" }));

    await waitFor(() => {
      expect(container.querySelectorAll(".raw-text-token")).toHaveLength(1);
    });

    expect(container.querySelector(".raw-text-token")).toHaveTextContent(
      "Beta",
    );
  });

  it("scrolls to insights that only provide source_sentences without source_sentence_indices", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/submission/test-submission-id/status")) {
        return {
          ok: true,
          json: async () => ({ overall_status: "completed", tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          results: {
            ...mockSubmission.results,
            sentences: [
              "First sentence.",
              "Second sentence.",
              "Third sentence.",
            ],
            topics: [
              {
                name: "Topic1",
                sentences: [3],
                ranges: [
                  { start: 0, end: 0, sentence_start: 3, sentence_end: 3 },
                ],
              },
            ],
            insights: [
              {
                name: "Later insight",
                source_sentences: ["Third sentence."],
              },
            ],
          },
        }),
      };
    });

    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByRole("tab", { name: /Insights/ }));
    fireEvent.click(screen.getByRole("button", { name: /Later insight/i }));

    await waitFor(() => {
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
    expect(
      screen.getByText("Third sentence.").closest(".reading-article__sentence"),
    ).toHaveClass("reading-article__sentence--insight-active");
  });

  it("falls back to raw-html text matching for insight scrolling when no sentence span anchor exists", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/submission/test-submission-id/status")) {
        return {
          ok: true,
          json: async () => ({ overall_status: "completed", tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          html_content:
            "<p>Intro.</p><p>Later sentence inside raw html.</p><p>Outro.</p>",
          results: {
            ...mockSubmission.results,
            sentences: ["Intro.", "Later sentence inside raw html.", "Outro."],
            topics: [],
            insights: [
              {
                name: "Later insight",
                source_sentences: ["Later sentence inside raw html."],
              },
            ],
          },
        }),
      };
    });

    render(<TextPage />);

    await screen.findByText("Source:");

    fireEvent.click(screen.getByRole("tab", { name: /Insights/ }));
    fireEvent.click(screen.getByRole("button", { name: /Later insight/i }));

    await waitFor(() => {
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it("shows sidebar insights in article order based on resolved sentence positions", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/submission/test-submission-id/status")) {
        return {
          ok: true,
          json: async () => ({ overall_status: "completed", tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          results: {
            ...mockSubmission.results,
            sentences: [
              "First sentence.",
              "Second sentence.",
              "Third sentence.",
            ],
            topics: [],
            insights: [
              {
                name: "Third insight",
                source_sentences: ["Third sentence."],
              },
              {
                name: "First insight",
                source_sentences: ["First sentence."],
              },
              {
                name: "Second insight",
                source_sentences: ["Second sentence."],
              },
            ],
          },
        }),
      };
    });

    render(<TextPage />);

    await screen.findByText("Source:");
    fireEvent.click(screen.getByRole("tab", { name: /Insights/ }));

    const insightTitles = Array.from(
      document.querySelectorAll(".topic-nav-insight__title"),
    );

    expect(insightTitles.map((element) => element.textContent)).toEqual([
      "First insight",
      "Second insight",
      "Third insight",
    ]);
  });

  it("orders and scrolls insights when source_sentences only partially match canonical article sentences", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/submission/test-submission-id/status")) {
        return {
          ok: true,
          json: async () => ({ overall_status: "completed", tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          results: {
            ...mockSubmission.results,
            sentences: [
              "First sentence has a long canonical form for matching.",
              "Second sentence has another long canonical form for matching.",
              "Third sentence has a long canonical form for matching.",
            ],
            topics: [
              {
                name: "Topic1",
                sentences: [3],
                ranges: [
                  { start: 0, end: 0, sentence_start: 3, sentence_end: 3 },
                ],
              },
            ],
            insights: [
              {
                name: "Third insight",
                source_sentences: ["Third sentence has a long canonical form"],
              },
              {
                name: "Second insight",
                source_sentences: [
                  "Second sentence has another long canonical form",
                ],
              },
            ],
          },
        }),
      };
    });

    render(<TextPage />);

    await screen.findByText("Source:");
    fireEvent.click(screen.getByRole("tab", { name: /Insights/ }));

    const insightTitles = Array.from(
      document.querySelectorAll(".topic-nav-insight__title"),
    );
    expect(insightTitles.map((element) => element.textContent)).toEqual([
      "Second insight",
      "Third insight",
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Third insight/i }));

    await waitFor(() => {
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it("renders the Markup tab in article order without duplicating the original source sentence", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/submission/test-submission-id/status")) {
        return {
          ok: true,
          json: async () => ({ overall_status: "completed", tasks: {} }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          ...mockSubmission,
          html_content:
            "<p>Intro.</p><p><strong>Beta one.</strong> Beta two.</p><p>Outro.</p>",
          results: {
            ...mockSubmission.results,
            sentences: ["Intro.", "Beta one. Beta two.", "Outro."],
            topics: [
              {
                name: "Topic1",
                sentences: [2],
                ranges: [
                  { start: 0, end: 0, sentence_start: 2, sentence_end: 2 },
                ],
              },
            ],
            markup: {
              Topic1: {
                positions: [
                  {
                    index: 1,
                    text: "Beta one.",
                    source_sentence_index: 2,
                  },
                  {
                    index: 2,
                    text: "Beta two.",
                    source_sentence_index: 2,
                  },
                ],
                segments: [
                  {
                    type: "quote",
                    position_indices: [1],
                    data: {
                      attribution: "Ada",
                      position_indices: [1],
                    },
                  },
                ],
              },
            },
          },
        }),
      };
    });

    const { container } = render(<TextPage />);

    await screen.findByText("Source:");
    fireEvent.click(screen.getByRole("button", { name: "Markup" }));

    expect(screen.getByText("Intro.")).toBeInTheDocument();
    expect(screen.getByText("Beta one.")).toBeInTheDocument();
    expect(screen.getByText("Beta two.")).toBeInTheDocument();
    expect(screen.getByText("Outro.")).toBeInTheDocument();
    expect(screen.queryByText("Beta one. Beta two.")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".markup-quote")).toHaveLength(1);
  });

  it("keeps the Markup tab visible even when grouped-by-topics was enabled earlier", async () => {
    const { container } = render(<TextPage />);

    await screen.findByText("Source:");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Grouped by topics" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Markup" }));

    expect(
      screen.queryByLabelText("Grouped by topics"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Show tooltips")).toBeInTheDocument();
    expect(container.querySelector(".markup-quote")).toBeInTheDocument();
  });

  it("shows a topic tooltip when markup text is clicked", async () => {
    render(<TextPage />);

    await screen.findByText("Source:");
    fireEvent.click(screen.getByRole("button", { name: "Markup" }));
    fireEvent.click(screen.getByText("Alpha Beta Gamma"));

    const tooltip = await waitFor(() =>
      document.querySelector(".text-topic-tooltip"),
    );
    expect(tooltip).toBeInTheDocument();
    expect(within(tooltip).getByText("Topic1")).toBeInTheDocument();
    expect(
      within(tooltip).getByRole("button", { name: "Mark Read" }),
    ).toBeInTheDocument();
    expect(
      within(tooltip).getByRole("button", { name: "View sentences" }),
    ).toBeInTheDocument();
  });

  it("opens topic summaries from the article tooltip without selecting the topic", async () => {
    vi.mocked(buildSummaryTimelineItems).mockReturnValue([
      {
        index: 0,
        summaryText: "Topic 1 summary paragraph",
        mapping: mockSubmission.results.summary_mappings[0],
        topLevelLabel: "Topic1",
        subtopicLabel: "Topic1",
        showSectionLabel: true,
        topicColor: null,
        topicName: "Topic1",
      },
    ]);

    render(<TextPage />);

    await screen.findByText("Source:");

    const topicCheckbox = screen
      .getAllByRole("checkbox")
      .find((element) => element.closest("li") !== null);
    expect(topicCheckbox).not.toBeChecked();

    fireEvent.click(screen.getByText("Alpha Beta Gamma"));

    const tooltip = await waitFor(() =>
      document.querySelector(".text-topic-tooltip"),
    );
    fireEvent.click(
      within(tooltip).getByRole("button", { name: "Topic Summaries" }),
    );

    expect(
      await screen.findByText("Topic 1 summary paragraph"),
    ).toBeInTheDocument();
    expect(document.getElementById("summary-para-0")).toHaveClass(
      "summary-paragraph-highlighted",
    );
    expect(topicCheckbox).not.toBeChecked();
  });

  it("opens topic summaries from the markup tooltip and highlights the current topic", async () => {
    vi.mocked(buildSummaryTimelineItems).mockReturnValue([
      {
        index: 0,
        summaryText: "Topic 1 summary paragraph",
        mapping: mockSubmission.results.summary_mappings[0],
        topLevelLabel: "Topic1",
        subtopicLabel: "Topic1",
        showSectionLabel: true,
        topicColor: null,
        topicName: "Topic1",
      },
    ]);

    render(<TextPage />);

    await screen.findByText("Source:");
    fireEvent.click(screen.getByRole("button", { name: "Markup" }));
    fireEvent.click(screen.getByText("Alpha Beta Gamma"));

    const tooltip = await waitFor(() =>
      document.querySelector(".text-topic-tooltip"),
    );
    fireEvent.click(
      within(tooltip).getByRole("button", { name: "Topic Summaries" }),
    );

    expect(
      await screen.findByText("Topic 1 summary paragraph"),
    ).toBeInTheDocument();
    expect(document.getElementById("summary-para-0")).toHaveClass(
      "summary-paragraph-highlighted",
    );
  });
});
