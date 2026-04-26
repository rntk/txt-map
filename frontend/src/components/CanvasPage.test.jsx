import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CanvasPage from "./CanvasPage";

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

      if (String(url).startsWith("/api/canvas/article-1/events")) {
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
