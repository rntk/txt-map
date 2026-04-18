import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MarkupRenderer from "./MarkupRenderer";

describe("MarkupRenderer", () => {
  it("renders stored HTML markup", () => {
    const { container } = render(
      <MarkupRenderer html="<h2>Heading</h2><p><strong>Bold</strong> text.</p>" />,
    );

    expect(
      screen.getByRole("heading", { name: "Heading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(container).toHaveTextContent("HeadingBold text.");
  });

  it("sanitizes dangerous HTML before rendering", () => {
    render(
      <MarkupRenderer
        html={
          '<p>Hello</p><script>alert(1)</script><a href="javascript:alert(1)">Unsafe</a>'
        }
      />,
    );

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByText("Unsafe")).toBeInTheDocument();
    expect(screen.getByText("Unsafe")).not.toHaveAttribute("href");
  });

  it("renders nothing for empty html", () => {
    const { container } = render(<MarkupRenderer html="" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("leaves markup untouched when highlightWords is undefined", () => {
    const { container } = render(
      <MarkupRenderer html="<p>The quick brown fox.</p>" />,
    );

    expect(container.querySelector(".word-highlight")).toBeNull();
  });

  it("leaves markup untouched when highlightWords is an empty array", () => {
    const { container } = render(
      <MarkupRenderer html="<p>The quick brown fox.</p>" highlightWords={[]} />,
    );

    expect(container.querySelector(".word-highlight")).toBeNull();
  });

  it("wraps matching words with .word-highlight class", () => {
    const { container } = render(
      <MarkupRenderer
        html="<p>The quick brown fox.</p>"
        highlightWords={["quick"]}
      />,
    );

    const highlighted = container.querySelectorAll(".word-highlight");
    expect(highlighted.length).toBe(1);
    expect(highlighted[0].textContent).toBe("quick");
  });

  it("matches words case-insensitively and with surrounding punctuation", () => {
    const { container } = render(
      <MarkupRenderer
        html="<p>Quick! The QUICK, quick fox.</p>"
        highlightWords={["quick"]}
      />,
    );

    const highlighted = container.querySelectorAll(".word-highlight");
    expect(highlighted.length).toBe(3);
  });

  it("supports multiple highlight words", () => {
    const { container } = render(
      <MarkupRenderer
        html="<p>The quick brown fox jumps.</p>"
        highlightWords={["quick", "fox"]}
      />,
    );

    const highlighted = Array.from(
      container.querySelectorAll(".word-highlight"),
    ).map((el) => el.textContent);
    expect(highlighted).toEqual(expect.arrayContaining(["quick", "fox"]));
    expect(highlighted.length).toBe(2);
  });
});
