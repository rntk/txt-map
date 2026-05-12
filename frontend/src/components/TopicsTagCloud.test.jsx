import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TopicsTagCloud from "./TopicsTagCloud";

describe("TopicsTagCloud", () => {
  it("renders the shared breadcrumb chrome and clickable cloud words", async () => {
    render(
      <TopicsTagCloud
        submissionId="submission-1"
        topics={[{ name: "Alpha>Beta", sentences: [1, 2] }]}
        sentences={[
          "The theta function computes theta values.",
          "Another theta example with theta.",
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "All Topics" })).toHaveClass(
      "topics-tag-cloud__breadcrumb--current",
    );

    const topicWord = await screen.findByText("Alpha");
    expect(topicWord).toHaveClass("topics-tag-cloud__word--clickable");
    expect(topicWord).toHaveClass("topics-tag-cloud__word--text");

    const sentenceWord = await screen.findByText("theta");
    expect(sentenceWord).toHaveClass("topics-tag-cloud__word--clickable");
    expect(sentenceWord.style.getPropertyValue("--word-font-size")).not.toBe(
      "",
    );
  });
});
