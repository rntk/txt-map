import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TextListPage from "./TextListPage";

describe("TextListPage layout", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        submissions: [
          {
            submission_id: "sub-123",
            overall_status: "completed",
            created_at: "2026-03-18T10:00:00Z",
            updated_at: "2026-03-19T10:00:00Z",
            source_url: "https://example.com/story",
            text_characters: 1200,
            sentence_count: 42,
            topic_count: 7,
          },
        ],
      }),
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders the page stack root and table wrapper without the legacy app class", async () => {
    const { container } = render(<TextListPage />);

    await screen.findByText("sub-123");

    const root = container.firstElementChild;
    const tableWrapper = container.querySelector(".text-list-table-wrapper");

    expect(root).toHaveClass("page-stack");
    expect(root).toHaveClass("text-list-page");
    expect(root).not.toHaveClass("app");
    expect(tableWrapper).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/submissions?limit=100");
    });
  });

  it("renders a link for the submission ID", async () => {
    render(<TextListPage />);

    const link = await screen.findByRole("link", { name: "sub-123" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveClass("text-list-id-link");
    expect(link).toHaveAttribute("href", "/page/text/sub-123");
  });
});
