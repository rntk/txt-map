import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTopicNavigation } from "./useTopicNavigation";

describe("useTopicNavigation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  function makeHook(overrides = {}) {
    const defaults = {
      activeTab: "raw_text",
      rawText: "Hello world. This is a test. Another sentence here.",
      safeTopics: [],
      groupedByTopics: false,
      selectedTopics: [],
      topicSummaryParaMap: {},
      setHighlightedGroupedTopic: vi.fn(),
    };
    return renderHook(() => useTopicNavigation({ ...defaults, ...overrides }));
  }

  it("scrolls to markup topic blocks by canonical topic name on the markup tab", () => {
    const topicName = 'Technology>"Microsoft">AI Copilot';
    const block = document.createElement("div");
    block.className = "markup-topic-block";
    block.setAttribute("data-topic-name", topicName);
    document.body.appendChild(block);

    const { result } = makeHook({
      activeTab: "markup",
      safeTopics: [
        {
          name: topicName,
          ranges: [{ start: 10, end: 20, sentence_start: 1, sentence_end: 1 }],
        },
      ],
    });

    result.current.navigateTopicSentence({ name: topicName }, "focus");

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("scrolls to article tokens by canonical topic name on the article tab", () => {
    const topicName = 'Technology>"Microsoft">AI Copilot';
    const token = document.createElement("span");
    token.setAttribute("data-topic-names", `${topicName}\nOtherTopic`);
    document.body.appendChild(token);

    const { result } = makeHook({
      activeTab: "article",
      safeTopics: [
        {
          name: topicName,
          ranges: [{ start: 10, end: 20, sentence_start: 1, sentence_end: 1 }],
        },
      ],
    });

    result.current.navigateTopicSentence({ name: topicName }, "focus");

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("does nothing when topic has no matching safe topic", () => {
    const { result } = makeHook({
      safeTopics: [],
    });

    result.current.navigateTopicSentence({ name: "missing" }, "focus");
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing when topic has no name", () => {
    const { result } = makeHook({
      safeTopics: [{ name: "Test", ranges: [] }],
    });

    result.current.navigateTopicSentence({}, "focus");
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing when topic is null", () => {
    const { result } = makeHook();
    result.current.navigateTopicSentence(null, "focus");
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("navigates using sentence indices when no ranges available", () => {
    const topicName = "TestTopic";
    const span = document.createElement("span");
    span.setAttribute("data-article-index", "0");
    span.setAttribute("data-sentence-index", "2");
    span.textContent = "content";
    document.body.appendChild(span);

    const { result } = makeHook({
      activeTab: "raw_text",
      safeTopics: [
        {
          name: topicName,
          ranges: [],
          sentences: [3],
        },
      ],
    });

    result.current.navigateTopicSentence({ name: topicName }, "focus");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  describe("groupedByTopics mode", () => {
    it("scrolls to grouped-topic element on focus", () => {
      const section = document.createElement("div");
      section.id = "grouped-topic-TestTopic";
      document.body.appendChild(section);

      const { result } = makeHook({
        groupedByTopics: true,
        selectedTopics: [{ name: "TestTopic" }],
      });

      result.current.navigateTopicSentence({ name: "TestTopic" }, "focus");
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it("navigates to next grouped topic section", () => {
      const section1 = document.createElement("div");
      section1.id = "grouped-topic-TopicA";
      const section2 = document.createElement("div");
      section2.id = "grouped-topic-TopicB";
      document.body.appendChild(section1);
      document.body.appendChild(section2);

      const setHighlight = vi.fn();
      const { result } = makeHook({
        groupedByTopics: true,
        selectedTopics: [],
        setHighlightedGroupedTopic: setHighlight,
      });

      result.current.navigateTopicSentence({ name: "TopicA" }, "next");
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  describe("topic_summary_timeline mode", () => {
    it("scrolls to summary paragraph on focus", () => {
      const para = document.createElement("div");
      para.id = "summary-para-0";
      document.body.appendChild(para);

      const { result } = makeHook({
        activeTab: "topic_summary_timeline",
        topicSummaryParaMap: { TopicA: [0, 3] },
      });

      result.current.navigateTopicSentence({ name: "TopicA" }, "focus");
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it("does nothing when topic has no summary paragraphs", () => {
      const { result } = makeHook({
        activeTab: "topic_summary_timeline",
        topicSummaryParaMap: { TopicA: [] },
      });

      result.current.navigateTopicSentence({ name: "TopicA" }, "focus");
      expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    it("does nothing when no topicSummaryParaMap entry", () => {
      const { result } = makeHook({
        activeTab: "topic_summary_timeline",
        topicSummaryParaMap: {},
      });

      result.current.navigateTopicSentence({ name: "TopicA" }, "focus");
      expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  it("navigates using char-based anchors on raw_text tab", () => {
    const span = document.createElement("span");
    span.setAttribute("data-article-index", "0");
    span.setAttribute("data-char-start", "5");
    span.textContent = "world";
    document.body.appendChild(span);

    const { result } = makeHook({
      activeTab: "raw_text",
      rawText: "Hello world",
      safeTopics: [
        {
          name: "TestTopic",
          ranges: [{ start: 5, end: 10, sentence_start: 1 }],
        },
      ],
    });

    result.current.navigateTopicSentence({ name: "TestTopic" }, "focus");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
