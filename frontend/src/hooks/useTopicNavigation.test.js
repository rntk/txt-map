import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTopicNavigation } from "./useTopicNavigation";

describe("useTopicNavigation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("scrolls to markup topic blocks by canonical topic name on the markup tab", () => {
    const topicName = "Technology>Microsoft>AI Copilot";
    const block = document.createElement("div");
    block.className = "markup-topic-block";
    block.setAttribute("data-topic-name", topicName);
    document.body.appendChild(block);

    const { result } = renderHook(() =>
      useTopicNavigation({
        activeTab: "markup",
        rawText: "",
        safeTopics: [
          {
            name: topicName,
            ranges: [
              { start: 10, end: 20, sentence_start: 1, sentence_end: 1 },
            ],
          },
        ],
        groupedByTopics: false,
        selectedTopics: [],
        topicSummaryParaMap: {},
        setHighlightedGroupedTopic: vi.fn(),
      }),
    );

    result.current.navigateTopicSentence({ name: topicName }, "focus");

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("scrolls to article tokens by canonical topic name on the article tab", () => {
    const topicName = "Technology>Microsoft>AI Copilot";
    const token = document.createElement("span");
    token.setAttribute("data-topic-names", `${topicName}\nOtherTopic`);
    document.body.appendChild(token);

    const { result } = renderHook(() =>
      useTopicNavigation({
        activeTab: "article",
        rawText: "",
        safeTopics: [
          {
            name: topicName,
            ranges: [
              { start: 10, end: 20, sentence_start: 1, sentence_end: 1 },
            ],
          },
        ],
        groupedByTopics: false,
        selectedTopics: [],
        topicSummaryParaMap: {},
        setHighlightedGroupedTopic: vi.fn(),
      }),
    );

    result.current.navigateTopicSentence({ name: topicName }, "focus");

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });
});
