import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CanvasPage from "./CanvasPage";

describe("CanvasPage highlight focusing", () => {
  const originalFetch = global.fetch;
  const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    window.history.pushState({}, "", "/page/canvas/article-1");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
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
