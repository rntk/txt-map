import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

vi.mock("./components/TextPage", () => ({
  default: () => <div>Text Page</div>,
}));
vi.mock("./components/TaskControlPage", () => ({
  default: () => <div>Task Control</div>,
}));
vi.mock("./components/TextListPage", () => ({
  default: () => <div>Texts List</div>,
}));
vi.mock("./components/MainPage", () => ({
  default: () => <div>Main Page</div>,
}));
vi.mock("./components/DiffPage", () => ({
  default: () => <div>Diff Page</div>,
}));
vi.mock("./components/CachePage", () => ({
  default: () => <div>Cache Page</div>,
}));
vi.mock("./components/GlobalTopicsPage", () => ({
  default: () => <div>Global Topics</div>,
}));

describe("App LLM selector", () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    window.history.pushState({}, "", "/page/tasks");
    // Mock window.location.href setter
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, href: originalLocation.href },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  it("renders provider and model selectors from settings payload", async () => {
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/auth/verify") {
        return {
          ok: true,
          json: async () => ({ authenticated: true, is_superuser: false }),
        };
      }
      if (url === "/api/auth/config") {
        return {
          ok: true,
          json: async () => ({ enabled: false }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          llm_provider: "OpenAI",
          llm_model: "gpt-4o",
          llm_applies_on_next_task: true,
          llm_available_providers: [
            {
              key: "openai",
              name: "OpenAI",
              models: ["gpt-4o", "gpt-5-mini"],
              default_model: "gpt-4o",
            },
          ],
        }),
      };
    });

    render(<App />);

    expect(await screen.findByLabelText("LLM provider")).toHaveValue("OpenAI");
    expect(screen.getByLabelText("LLM model")).toHaveValue("gpt-4o");
    expect(screen.queryByText("Applies on next task")).not.toBeInTheDocument();
  });

  it("renders topbar controls without the legacy app shell header", async () => {
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/auth/verify") {
        return {
          ok: true,
          json: async () => ({ authenticated: true, is_superuser: false }),
        };
      }
      if (url === "/api/auth/config") {
        return {
          ok: true,
          json: async () => ({ enabled: false }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          llm_provider: "OpenAI",
          llm_model: "gpt-4o",
          llm_applies_on_next_task: true,
          llm_available_providers: [
            {
              key: "openai",
              name: "OpenAI",
              models: ["gpt-4o", "gpt-5-mini"],
              default_model: "gpt-4o",
            },
          ],
        }),
      };
    });

    const { container } = render(<App />);

    await screen.findByLabelText("LLM provider");

    expect(container.querySelector(".app-shell__header")).toBeNull();

    const topbar = container.querySelector(".app-shell__topbar");
    const portalTarget = container.querySelector("#global-menu-portal-target");

    expect(topbar).not.toBeNull();
    expect(portalTarget).not.toBeNull();
    expect(topbar?.contains(portalTarget)).toBe(true);
    expect(topbar?.contains(screen.getByLabelText("LLM provider"))).toBe(true);
  });

  it("switches model to provider default when provider changes", async () => {
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/auth/verify") {
        return {
          ok: true,
          json: async () => ({ authenticated: true, is_superuser: false }),
        };
      }
      if (url === "/api/auth/config") {
        return {
          ok: true,
          json: async () => ({ enabled: false }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          llm_provider: "OpenAI",
          llm_model: "gpt-5-mini",
          llm_applies_on_next_task: true,
          llm_available_providers: [
            {
              key: "openai",
              name: "OpenAI",
              models: ["gpt-4o", "gpt-5-mini"],
              default_model: "gpt-4o",
            },
            {
              key: "anthropic",
              name: "Anthropic",
              models: ["claude-sonnet-4-20250514"],
              default_model: "claude-sonnet-4-20250514",
            },
          ],
        }),
      };
    });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("LLM provider"), {
      target: { value: "Anthropic" },
    });

    expect(screen.getByLabelText("LLM model")).toHaveValue(
      "claude-sonnet-4-20250514",
    );
  });

  it("saves the selected provider and model", async () => {
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/auth/verify") {
        return {
          ok: true,
          json: async () => ({ authenticated: true, is_superuser: false }),
        };
      }
      if (url === "/api/auth/config") {
        return {
          ok: true,
          json: async () => ({ enabled: false }),
        };
      }
      if (url === "/api/settings") {
        return {
          ok: true,
          json: async () => ({
            llm_provider: "OpenAI",
            llm_model: "gpt-4o",
            llm_applies_on_next_task: true,
            llm_available_providers: [
              {
                key: "openai",
                name: "OpenAI",
                models: ["gpt-4o", "gpt-5-mini"],
                default_model: "gpt-4o",
              },
            ],
          }),
        };
      }
      if (url === "/api/settings/llm") {
        return {
          ok: true,
          json: async () => ({
            llm_provider: "OpenAI",
            llm_model: "gpt-5-mini",
            llm_applies_on_next_task: true,
            llm_available_providers: [
              {
                key: "openai",
                name: "OpenAI",
                models: ["gpt-4o", "gpt-5-mini"],
                default_model: "gpt-4o",
              },
            ],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("LLM model"), {
      target: { value: "gpt-5-mini" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/settings/llm",
        expect.objectContaining({
          method: "PUT",
        }),
      );
    });
  });

  it("shows an inline error hint when saving fails", async () => {
    global.fetch = vi.fn(async (url) => {
      if (url === "/api/auth/verify") {
        return {
          ok: true,
          json: async () => ({ authenticated: true, is_superuser: false }),
        };
      }
      if (url === "/api/auth/config") {
        return {
          ok: true,
          json: async () => ({ enabled: false }),
        };
      }
      if (url === "/api/settings") {
        return {
          ok: true,
          json: async () => ({
            llm_provider: "OpenAI",
            llm_model: "gpt-4o",
            llm_applies_on_next_task: true,
            llm_available_providers: [
              {
                key: "openai",
                name: "OpenAI",
                models: ["gpt-4o", "gpt-5-mini"],
                default_model: "gpt-4o",
              },
            ],
          }),
        };
      }
      if (url === "/api/settings/llm") {
        return {
          ok: false,
          json: async () => ({}),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("LLM model"), {
      target: { value: "gpt-5-mini" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("Save failed")).toBeInTheDocument();
  });
});
