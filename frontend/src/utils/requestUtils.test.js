import { describe, expect, it } from "vitest";
import {
  appendStringParam,
  appendPositiveIntegerParam,
  buildQueryString,
  readErrorMessage,
} from "./requestUtils";

describe("appendStringParam", () => {
  it("appends non-empty string values", () => {
    const params = new URLSearchParams();
    appendStringParam(params, "q", "hello");
    expect(params.get("q")).toBe("hello");
  });

  it("skips empty string values", () => {
    const params = new URLSearchParams();
    appendStringParam(params, "q", "");
    expect(params.has("q")).toBe(false);
  });

  it("trims values when trim option is set", () => {
    const params = new URLSearchParams();
    appendStringParam(params, "q", "  hello  ", { trim: true });
    expect(params.get("q")).toBe("hello");
  });

  it("skips whitespace-only values when trim is set", () => {
    const params = new URLSearchParams();
    appendStringParam(params, "q", "   ", { trim: true });
    expect(params.has("q")).toBe(false);
  });
});

describe("appendPositiveIntegerParam", () => {
  it("appends a positive integer", () => {
    const params = new URLSearchParams();
    appendPositiveIntegerParam(params, "page", 3);
    expect(params.get("page")).toBe("3");
  });

  it("appends a string positive integer", () => {
    const params = new URLSearchParams();
    appendPositiveIntegerParam(params, "page", "5");
    expect(params.get("page")).toBe("5");
  });

  it("skips zero", () => {
    const params = new URLSearchParams();
    appendPositiveIntegerParam(params, "page", 0);
    expect(params.has("page")).toBe(false);
  });

  it("skips negative numbers", () => {
    const params = new URLSearchParams();
    appendPositiveIntegerParam(params, "page", -1);
    expect(params.has("page")).toBe(false);
  });

  it("skips NaN", () => {
    const params = new URLSearchParams();
    appendPositiveIntegerParam(params, "page", NaN);
    expect(params.has("page")).toBe(false);
  });
});

describe("buildQueryString", () => {
  it("builds a query string from configured params", () => {
    const qs = buildQueryString((params) => {
      params.append("a", "1");
      params.append("b", "2");
    });
    expect(qs).toBe("a=1&b=2");
  });

  it("returns empty string for no params", () => {
    const qs = buildQueryString(() => {});
    expect(qs).toBe("");
  });
});

describe("readErrorMessage", () => {
  it("returns the response text when present", async () => {
    const response = new Response("Something went wrong");
    const msg = await readErrorMessage(response, "fallback");
    expect(msg).toBe("Something went wrong");
  });

  it("returns the fallback when response text is empty", async () => {
    const response = new Response("");
    const msg = await readErrorMessage(response, "fallback");
    expect(msg).toBe("fallback");
  });
});
