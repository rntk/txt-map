import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CanvasPage from "./CanvasPage";

/**
 * Opens the chat panel if it's closed (chat is now hidden by default).
 */
function openChatPanel() {
  const chatToggleBtn = document.querySelector(
    '.canvas-read-toggle[title="Show chat panel"]',
  );
  if (chatToggleBtn) {
    fireEvent.click(chatToggleBtn);
  }
}

/**
 * @param {Node} before
 * @param {Node} target
 * @param {Node} after
 */
function expectNodeBetween(before, target, after) {
  expect(
    Boolean(
      before.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBe(true);
  expect(
    Boolean(
      target.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBe(true);
}

function createDeferred() {
  /** @type {(value: unknown) => void} */
  let resolve = () => {};
  /** @type {(reason?: unknown) => void} */
  let reject = () => {};
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("CanvasPage highlight focusing", () => {
  const originalFetch = global.fetch;
  const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const originalRangeGetBoundingClientRect =
    Range.prototype.getBoundingClientRect;

  beforeEach(() => {
    window.history.pushState({}, "", "/page/canvas/article-1");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    if (originalRangeGetBoundingClientRect) {
      Range.prototype.getBoundingClientRect =
        originalRangeGetBoundingClientRect;
    } else {
      delete Range.prototype.getBoundingClientRect;
    }
    vi.restoreAllMocks();
  });

  it("centers and zooms to the selected highlight event", async () => {
    const articleText = `Alpha ${"x".repeat(54)}Target`;
    let eventsFetched = false;

    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({ text: articleText }),
        };
      }

      if (url === "/api/canvas/article-1/chats") {
        return {
          ok: true,
          json: async () => ({
            chats: [
              {
                chat_id: "chat-1",
                article_id: "article-1",
                title: "Existing chat",
                created_at: "2026-04-30T00:00:00Z",
                updated_at: "2026-04-30T00:00:00Z",
                message_count: 1,
                event_count: 2,
              },
            ],
          }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/chats/chat-1/events")) {
        if (eventsFetched) {
          return { ok: true, json: async () => ({ events: [] }) };
        }

        eventsFetched = true;
        return {
          ok: true,
          json: async () => ({
            events: [
              {
                event_type: "highlight_span",
                data: { start: 0, end: 5, label: "first" },
              },
              {
                event_type: "highlight_span",
                data: { start: 60, end: 66, label: "second" },
              },
            ],
          }),
        };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    HTMLElement.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        if (this.classList.contains("canvas-area")) {
          return makeRect({ left: 0, top: 0, width: 1000, height: 800 });
        }

        if (this.classList.contains("canvas-viewport")) {
          return makeRect({ left: 40, top: 40, width: 752, height: 400 });
        }

        if (this.classList.contains("canvas-highlight")) {
          const start = Number(this.getAttribute("data-char-start"));
          return start === 0
            ? makeRect({ left: 80, top: 100, width: 50, height: 20 })
            : makeRect({ left: 140, top: 540, width: 80, height: 20 });
        }

        return makeRect({ left: 0, top: 0, width: 0, height: 0 });
      };

    const { container } = render(<CanvasPage />);

    openChatPanel();

    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    await screen.findByRole("button", { name: "2. second" });

    const viewport = container.querySelector(".canvas-viewport");
    await waitFor(() => {
      expect(viewport.style.getPropertyValue("--canvas-scale")).toBe("1.4");
      expect(viewport.style.getPropertyValue("--canvas-translate-x")).not.toBe(
        "40px",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "1. first" }));

    await waitFor(() => {
      expect(viewport.style.getPropertyValue("--canvas-scale")).toBe("1.4");
      expect(viewport.style.getPropertyValue("--canvas-translate-x")).toBe(
        "435px",
      );
      expect(viewport.style.getPropertyValue("--canvas-translate-y")).toBe(
        "330px",
      );
    });
  });

  it("zooms around the cursor position on wheel", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({ text: "Alpha beta gamma." }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    HTMLElement.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        if (this.classList.contains("canvas-area")) {
          return makeRect({ left: 0, top: 0, width: 1000, height: 800 });
        }

        return makeRect({ left: 0, top: 0, width: 0, height: 0 });
      };

    const { container } = render(<CanvasPage />);

    await screen.findByText("Alpha beta gamma.");

    const area = container.querySelector(".canvas-area");
    const viewport = container.querySelector(".canvas-viewport");
    fireEvent.wheel(area, { deltaY: -100, clientX: 300, clientY: 200 });

    await waitFor(() => {
      expect(viewport.style.getPropertyValue("--canvas-scale")).toBe("1.1");
      expect(viewport.style.getPropertyValue("--canvas-translate-x")).toBe(
        "14px",
      );
      expect(viewport.style.getPropertyValue("--canvas-translate-y")).toBe(
        "24px",
      );
    });
  });

  it("moves to the rendered article bottom on End at the current scale", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({ text: "Alpha beta gamma." }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    HTMLElement.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        if (this.classList.contains("canvas-area")) {
          return makeRect({ left: 0, top: 0, width: 1000, height: 800 });
        }

        if (this.classList.contains("canvas-viewport")) {
          return makeRect({ left: 40, top: 40, width: 752, height: 2200 });
        }

        if (this.classList.contains("canvas-article-text")) {
          const currentScale = Number(
            document
              .querySelector(".canvas-viewport")
              ?.style.getPropertyValue("--canvas-scale") || 1,
          );
          return makeRect({
            left: 40,
            top: 40,
            width: 752 * currentScale,
            height: 2000 * currentScale,
          });
        }

        return makeRect({ left: 0, top: 0, width: 0, height: 0 });
      };

    const { container } = render(<CanvasPage />);

    await screen.findByText("Alpha beta gamma.");

    const viewport = container.querySelector(".canvas-viewport");
    const area = container.querySelector(".canvas-area");
    fireEvent.wheel(area, { deltaY: -100, clientX: 300, clientY: 200 });

    await waitFor(() => {
      expect(viewport.style.getPropertyValue("--canvas-scale")).toBe("1.1");
    });

    fireEvent.keyDown(window, { key: "End" });

    await waitFor(() => {
      expect(viewport.style.getPropertyValue("--canvas-translate-y")).toBe(
        "-1440px",
      );
    });
  });

  it("renders images from the original article html", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({
            text: "Alpha\nBeta gamma.",
            sentences: ["Alpha", "Beta gamma."],
            source_url: "https://example.com/articles/story.html",
          }),
        };
      }

      if (url === "/api/submission/article-1") {
        return {
          ok: true,
          json: async () => ({
            html_content:
              '<article><p>Alpha</p><img src="/media/chart.png" alt="Article chart" /><p>Beta gamma.</p></article>',
            source_url: "https://example.com/articles/story.html",
          }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    render(<CanvasPage />);

    const image = await screen.findByAltText("Article chart");
    expect(image).toHaveAttribute("src", "https://example.com/media/chart.png");
    const imageBlock = image.closest(".canvas-article-image");
    const alpha = document.querySelector('[data-char-start="0"]');
    const beta = document.querySelector('[data-char-start="6"]');
    expectNodeBetween(alpha, imageBlock, beta);
  });

  it("uses following article text when image prefix text does not match", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({
            text: "Alpha\nBeta gamma.",
            sentences: ["Alpha", "Beta gamma."],
            source_url: "https://example.com/articles/story.html",
          }),
        };
      }

      if (url === "/api/submission/article-1") {
        return {
          ok: true,
          json: async () => ({
            html_content:
              '<article><p>Navigation text not in article.</p><img src="/media/chart.png" alt="Article chart" /><p>Beta gamma.</p></article>',
            source_url: "https://example.com/articles/story.html",
          }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    render(<CanvasPage />);

    const image = await screen.findByAltText("Article chart");
    const imageBlock = image.closest(".canvas-article-image");
    const alpha = document.querySelector('[data-char-start="0"]');
    const beta = document.querySelector('[data-char-start="6"]');
    expectNodeBetween(alpha, imageBlock, beta);
  });

  it("ignores stale submission image fetches after article navigation", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const firstSubmission = createDeferred();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({
            text: "First article.",
            source_url: "https://example.com/first.html",
          }),
        };
      }

      if (url === "/api/submission/article-1") {
        return firstSubmission.promise;
      }

      if (url === "/api/canvas/article-2/article") {
        return {
          ok: true,
          json: async () => ({
            text: "Second article.",
            html_content:
              '<article><p>Second article.</p><img src="/new.png" alt="New image" /></article>',
            source_url: "https://example.com/second.html",
          }),
        };
      }

      if (String(url).startsWith("/api/canvas/")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const { rerender } = render(<CanvasPage />);
    await screen.findByText("First article.");

    window.history.pushState({}, "", "/page/canvas/article-2");
    rerender(<CanvasPage />);
    await screen.findByText("Second article.");

    firstSubmission.resolve({
      ok: true,
      json: async () => ({
        html_content:
          '<article><p>First article.</p><img src="/old.png" alt="Old image" /></article>',
        source_url: "https://example.com/first.html",
      }),
    });

    expect(await screen.findByAltText("New image")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByAltText("Old image")).not.toBeInTheDocument();
    });
  });

  it("renders boundary images before the page splitter", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({
            text: "Alpha\nBeta",
            sentences: ["Alpha", "Beta"],
            pages: [
              { page_number: 1, start: 0, end: 6 },
              { page_number: 2, start: 6, end: 10 },
            ],
            source_url: "https://example.com/articles/story.html",
          }),
        };
      }

      if (url === "/api/submission/article-1") {
        return {
          ok: true,
          json: async () => ({
            html_content:
              '<article><p>Navigation text not in article.</p><img src="/media/chart.png" alt="Article chart" /><p>Beta</p></article>',
            source_url: "https://example.com/articles/story.html",
          }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    render(<CanvasPage />);

    const image = await screen.findByAltText("Article chart");
    const imageBlock = image.closest(".canvas-article-image");
    const splitter = screen
      .getByText("Page 2")
      .closest(".canvas-page-splitter");
    const beta = document.querySelector('[data-char-start="6"]');
    expectNodeBetween(imageBlock, splitter, beta);
  });

  it("counter-scales topic hierarchy titles and cards when zooming out", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({
            text: "Alpha beta gamma.",
            sentences: ["Alpha beta gamma."],
            topics: [
              {
                name: "Very Long Main Topic Title For Zoomed Out Canvas",
                sentences: [1],
              },
            ],
          }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    HTMLElement.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        if (this.classList.contains("canvas-area")) {
          return makeRect({ left: 0, top: 0, width: 1000, height: 800 });
        }

        return makeRect({ left: 0, top: 0, width: 0, height: 0 });
      };

    const { container } = render(<CanvasPage />);

    await screen.findByText("Alpha beta gamma.");

    const area = container.querySelector(".canvas-area");
    const viewport = container.querySelector(".canvas-viewport");
    fireEvent.wheel(area, { deltaY: 100, clientX: 300, clientY: 200 });

    await waitFor(() => {
      expect(viewport.style.getPropertyValue("--canvas-scale")).toBe("0.9");
      expect(
        parseFloat(
          viewport.style.getPropertyValue("--canvas-topic-title-font-size"),
        ),
      ).toBeCloseTo(13.333, 3);
    });

    Range.prototype.getBoundingClientRect = vi.fn(() =>
      makeRect({ left: 40, top: 100, width: 600, height: 40 }),
    );

    fireEvent.click(screen.getByTitle("Show topic hierarchy"));

    const hierarchy = await screen.findByLabelText("Topic hierarchy");
    const topicCard = await screen.findByRole("button", {
      name: /Very Long Main Topic Title/,
    });

    await waitFor(() => {
      expect(
        parseFloat(hierarchy.style.getPropertyValue("--topic-card-width")),
      ).toBeCloseTo(211.111, 3);
      expect(
        parseFloat(
          topicCard.style.getPropertyValue("--topic-card-title-font-size"),
        ),
      ).toBeCloseTo(5.602, 3);
    });

    fireEvent.click(topicCard);

    await waitFor(() => {
      expect(viewport.style.getPropertyValue("--canvas-scale")).toBe("1.4");
      expect(
        parseFloat(viewport.style.getPropertyValue("--canvas-translate-x")),
      ).toBeCloseTo(-28.889, 3);
      expect(
        parseFloat(viewport.style.getPropertyValue("--canvas-translate-y")),
      ).toBeCloseTo(213.333, 3);
    });
  });

  it("renders interleaved top-level topic cards in article order", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({
            text: "Politics opens. Law follows. Politics returns.",
            sentences: ["Politics opens.", "Law follows.", "Politics returns."],
            topics: [
              { name: "Politics", sentences: [1, 3] },
              { name: "Law", sentences: [2] },
            ],
          }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    HTMLElement.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        if (this.classList.contains("canvas-area")) {
          return makeRect({ left: 0, top: 0, width: 1000, height: 800 });
        }

        return makeRect({ left: 0, top: 0, width: 0, height: 0 });
      };

    render(<CanvasPage />);

    await screen.findByText("Politics opens.");

    Range.prototype.getBoundingClientRect = vi
      .fn()
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 100, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 110, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 112, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 122, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 124, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 134, width: 300, height: 8 }),
      );

    fireEvent.click(screen.getByTitle("Show topic hierarchy"));

    await screen.findByRole("button", { name: /Law/ });

    await waitFor(() => {
      const politicsCards = screen.getAllByRole("button", {
        name: /Politics/,
      });
      const lawCard = screen.getByRole("button", { name: /Law/ });

      expect(politicsCards).toHaveLength(2);
      expect(politicsCards[0]).toHaveAttribute(
        "title",
        expect.stringContaining("sentences 1-1"),
      );
      expect(lawCard).toHaveAttribute(
        "title",
        expect.stringContaining("sentences 2-2"),
      );
      expect(politicsCards[1]).toHaveAttribute(
        "title",
        expect.stringContaining("sentences 3-3"),
      );

      const firstPoliticsTop = parseFloat(
        politicsCards[0].style.getPropertyValue("--topic-card-top"),
      );
      const firstPoliticsHeight = parseFloat(
        politicsCards[0].style.getPropertyValue("--topic-card-height"),
      );
      const lawTop = parseFloat(
        lawCard.style.getPropertyValue("--topic-card-top"),
      );
      const lawHeight = parseFloat(
        lawCard.style.getPropertyValue("--topic-card-height"),
      );
      const secondPoliticsTop = parseFloat(
        politicsCards[1].style.getPropertyValue("--topic-card-top"),
      );

      expect(firstPoliticsTop).toBeCloseTo(100, 3);
      expect(lawTop).toBeCloseTo(112, 3);
      expect(secondPoliticsTop).toBeCloseTo(124, 3);
      expect(firstPoliticsHeight).toBeGreaterThanOrEqual(32);
      expect(lawHeight).toBeGreaterThanOrEqual(32);
    });
  });

  it("renders interleaved topic hierarchy cards in summary view order", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({
            text: "Politics opens. Law follows. Politics returns.",
            sentences: ["Politics opens.", "Law follows.", "Politics returns."],
            topics: [
              { name: "Politics>Campaign", sentences: [1] },
              { name: "Law>Courts", sentences: [2] },
              { name: "Politics>Election", sentences: [3] },
            ],
            topic_summary_index: {
              "Politics>Campaign": {
                level: 2,
                text: "Campaign summary.",
                source_sentences: [1],
              },
              "Law>Courts": {
                level: 2,
                text: "Courts summary.",
                source_sentences: [2],
              },
              "Politics>Election": {
                level: 2,
                text: "Election summary.",
                source_sentences: [3],
              },
            },
          }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    HTMLElement.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        if (this.classList.contains("canvas-area")) {
          return makeRect({ left: 0, top: 0, width: 1000, height: 800 });
        }

        if (this.classList.contains("canvas-summary-view__card")) {
          const cardTops = {
            "Politics>Campaign": 100,
            "Law>Courts": 112,
            "Politics>Election": 124,
          };
          return makeRect({
            left: 0,
            top: cardTops[this.getAttribute("title")] ?? 0,
            width: 720,
            height: 8,
          });
        }

        return makeRect({ left: 0, top: 0, width: 0, height: 0 });
      };

    render(<CanvasPage />);

    await screen.findByText("Politics opens.");

    fireEvent.click(screen.getByTitle("Show summary view (per topic level)"));
    fireEvent.click(await screen.findByRole("button", { name: "L1" }));

    await screen.findByText("Campaign summary.");

    await waitFor(() => {
      const politicsCards = screen.getAllByRole("button", {
        name: /Politics/,
      });
      const campaignCard = screen.getByRole("button", { name: /Campaign/ });
      const lawCard = screen.getByRole("button", { name: /Law/ });
      const courtsCard = screen.getByRole("button", { name: /Courts/ });
      const electionCard = screen.getByRole("button", { name: /Election/ });

      expect(politicsCards).toHaveLength(2);
      expect(
        parseFloat(politicsCards[0].style.getPropertyValue("--topic-card-top")),
      ).toBeCloseTo(100, 3);
      expect(
        parseFloat(lawCard.style.getPropertyValue("--topic-card-top")),
      ).toBeCloseTo(112, 3);
      expect(
        parseFloat(politicsCards[1].style.getPropertyValue("--topic-card-top")),
      ).toBeCloseTo(124, 3);
      expect(
        parseFloat(campaignCard.style.getPropertyValue("--topic-card-top")),
      ).toBeCloseTo(100, 3);
      expect(
        parseFloat(courtsCard.style.getPropertyValue("--topic-card-top")),
      ).toBeCloseTo(112, 3);
      expect(
        parseFloat(electionCard.style.getPropertyValue("--topic-card-top")),
      ).toBeCloseTo(124, 3);
    });
  });

  it("renders interleaved sub-level topic cards in article order", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({
            text: "Tech opens. Media covers. Tech returns.",
            sentences: ["Tech opens.", "Media covers.", "Tech returns."],
            topics: [
              { name: "Technology>Evaluation>AgentPerf", sentences: [1] },
              { name: "Media>News>Article", sentences: [2] },
              { name: "Technology>Evaluation>DeepSeek", sentences: [3] },
            ],
          }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    HTMLElement.prototype.getBoundingClientRect =
      function getBoundingClientRect() {
        if (this.classList.contains("canvas-area")) {
          return makeRect({ left: 0, top: 0, width: 1000, height: 800 });
        }

        return makeRect({ left: 0, top: 0, width: 0, height: 0 });
      };

    render(<CanvasPage />);

    await screen.findByText("Tech opens.");

    // 24 getBoundingClientRect calls total:
    // - 6 for the initial L0 render when the hierarchy panel opens
    // - 18 for the L2 render after clicking "L2" (3 levels × 3 rows × 2 calls)
    Range.prototype.getBoundingClientRect = vi
      .fn()
      // ── Initial L0 render: 3 rows × 2 calls ─────────────────────────────
      // Technology(s1), Media(s2), Technology(s3) — positions consumed but
      // not asserted; just need valid rects so cards don't silently drop
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 100, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 100, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 112, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 112, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 124, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 124, width: 300, height: 8 }),
      )
      // ── L2 full render: 3 levels × 3 rows × 2 calls ─────────────────────
      // L0 Technology row 1 (s1)
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 100, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 100, width: 300, height: 8 }),
      )
      // L0 Media (s2)
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 112, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 112, width: 300, height: 8 }),
      )
      // L0 Technology row 2 (s3)
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 124, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 124, width: 300, height: 8 }),
      )
      // L1 Technology>Evaluation row 1 (s1)
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 100, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 100, width: 300, height: 8 }),
      )
      // L1 Media>News (s2)
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 112, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 112, width: 300, height: 8 }),
      )
      // L1 Technology>Evaluation row 2 (s3)
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 124, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 124, width: 300, height: 8 }),
      )
      // L2 AgentPerf (s1)
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 100, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 100, width: 300, height: 8 }),
      )
      // L2 Article (s2)
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 112, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 112, width: 300, height: 8 }),
      )
      // L2 DeepSeek (s3) — previously absent due to the page-offset/rangeAtOffset bug
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 124, width: 300, height: 8 }),
      )
      .mockReturnValueOnce(
        makeRect({ left: 40, top: 124, width: 300, height: 8 }),
      );

    fireEvent.click(screen.getByTitle("Show topic hierarchy"));
    fireEvent.click(await screen.findByRole("button", { name: "L2" }));

    await screen.findByRole("button", { name: /AgentPerf/ });

    await waitFor(() => {
      const evalCards = screen.getAllByRole("button", { name: /Evaluation/ });
      const newsCard = screen.getByRole("button", { name: /News/ });
      const agentPerfCard = screen.getByRole("button", { name: /AgentPerf/ });
      const articleCard = screen.getByRole("button", { name: /Article/ });
      const deepSeekCard = screen.getByRole("button", { name: /DeepSeek/ });

      // Both Technology>Evaluation rows must render (interleaved with Media>News)
      expect(evalCards).toHaveLength(2);

      // DeepSeek at sentence 3 must be present
      expect(deepSeekCard).toBeInTheDocument();

      const agentPerfTop = parseFloat(
        agentPerfCard.style.getPropertyValue("--topic-card-top"),
      );
      const articleTop = parseFloat(
        articleCard.style.getPropertyValue("--topic-card-top"),
      );
      const deepSeekTop = parseFloat(
        deepSeekCard.style.getPropertyValue("--topic-card-top"),
      );

      // Order: AgentPerf (s1) < Article (s2) < DeepSeek (s3)
      expect(agentPerfTop).toBeCloseTo(100, 3);
      expect(articleTop).toBeCloseTo(112, 3);
      expect(deepSeekTop).toBeCloseTo(124, 3);
      expect(agentPerfTop).toBeLessThan(articleTop);
      expect(articleTop).toBeLessThan(deepSeekTop);
    });
  });

  it("polls for a delayed chat response", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url, options) => {
      if (url === "/api/canvas/article-1/article") {
        return {
          ok: true,
          json: async () => ({ text: "Alpha beta." }),
        };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      if (url === "/api/canvas/article-1/chat" && options?.method === "POST") {
        return jsonResponse({ request_id: "request-1", status: "pending" });
      }

      if (url === "/api/canvas/article-1/chat/request-1") {
        return jsonResponse({ status: "completed", reply: "Delayed reply." });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    render(<CanvasPage />);

    openChatPanel();

    fireEvent.change(screen.getByPlaceholderText("Ask about this article…"), {
      target: { value: "What happened?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Delayed reply.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/canvas/article-1/chat/request-1",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("shows a generic error when the chat job fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn(async (url, options) => {
      if (url === "/api/canvas/article-1/article") {
        return { ok: true, json: async () => ({ text: "Alpha beta." }) };
      }

      if (String(url).startsWith("/api/canvas/article-1/events")) {
        return { ok: true, json: async () => ({ events: [] }) };
      }

      if (url === "/api/canvas/article-1/chat" && options?.method === "POST") {
        return jsonResponse({ request_id: "request-1", status: "pending" });
      }

      if (url === "/api/canvas/article-1/chat/request-1") {
        return jsonResponse({ status: "failed", error: "boom" });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    render(<CanvasPage />);

    openChatPanel();

    fireEvent.change(screen.getByPlaceholderText("Ask about this article…"), {
      target: { value: "What happened?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Failed to get a response."),
    ).toBeInTheDocument();
  });
});

/**
 * @param {{left: number, top: number, width: number, height: number}} rect
 * @returns {DOMRect}
 */
function makeRect({ left, top, width, height }) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

/**
 * @param {unknown} body
 * @param {{ ok?: boolean, status?: number }} [init]
 */
function jsonResponse(body, init = {}) {
  const text = JSON.stringify(body);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}
