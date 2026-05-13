import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MainPage from "./MainPage";

vi.mock("./GlobalReadProgress", () => ({
  default: () => <div data-testid="global-read-progress" />,
}));

describe("MainPage paste text submission", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("keeps submit disabled until pasted text is present", () => {
    render(<MainPage />);

    const submitButton = screen.getByRole("button", { name: "Submit" });

    expect(screen.getByLabelText("Text to submit")).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });

  it("submits pasted text through the upload endpoint as a text file", async () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    render(<MainPage />);

    fireEvent.change(screen.getByLabelText("Text to submit"), {
      target: { value: "Copied article text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [url, options] = global.fetch.mock.calls[0];
    const body = options.body;
    const file = body.get("file");

    expect(url).toBe("/api/upload");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(body).toBeInstanceOf(FormData);
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("pasted-text.txt");
    expect(file.type).toBe("text/plain");
    await expect(file.text()).resolves.toBe("Copied article text");
    expect(body.get("embed_images")).toBe("false");
  });
});
