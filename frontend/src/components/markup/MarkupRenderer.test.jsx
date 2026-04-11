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
});
