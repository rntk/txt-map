import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TextDisplay from "./TextDisplay";
import { getTopicAccentColor } from "../utils/topicColorUtils";

describe("TextDisplay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    sentences: ["First sentence.", "Second sentence.", "Third sentence."],
    selectedTopics: [],
    hoveredTopic: null,
    readTopics: new Set(),
    articleTopics: [],
    articleIndex: 0,
    paragraphMap: null,
    topicSummaries: {},
    onShowTopicSummary: null,
    rawHtml: null,
  };

  describe("Topic/read-unread highlighting behavior", () => {
    it("renders without any highlighting when no topics are selected or read", () => {
      render(<TextDisplay {...defaultProps} />);

      const sentences = screen.getAllByRole("generic");
      const sentenceDivs = sentences.filter((el) =>
        el.classList.contains("sentence-token"),
      );

      expect(sentenceDivs.length).toBe(3);
      sentenceDivs.forEach((div) => {
        expect(div).not.toHaveClass("highlighted");
        expect(div).not.toHaveClass("faded");
      });
    });

    it("highlights sentences belonging to selected topics", () => {
      const props = {
        ...defaultProps,
        selectedTopics: [{ name: "Topic1" }],
        articleTopics: [{ name: "Topic1", sentences: [1, 2], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");
      const sentence1 = document.getElementById("sentence-0-1");
      const sentence2 = document.getElementById("sentence-0-2");

      expect(sentence0).toHaveClass("highlighted");
      expect(sentence1).toHaveClass("highlighted");
      expect(sentence2).not.toHaveClass("highlighted");
    });

    it("fades sentences belonging to read topics", () => {
      const props = {
        ...defaultProps,
        readTopics: new Set(["Topic1"]),
        articleTopics: [{ name: "Topic1", sentences: [2, 3], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");
      const sentence1 = document.getElementById("sentence-0-1");
      const sentence2 = document.getElementById("sentence-0-2");

      expect(sentence0).not.toHaveClass("faded");
      expect(sentence1).toHaveClass("faded");
      expect(sentence2).toHaveClass("faded");
    });

    it("handles readTopics as an array instead of Set", () => {
      const props = {
        ...defaultProps,
        readTopics: ["Topic1"],
        articleTopics: [{ name: "Topic1", sentences: [1], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");
      expect(sentence0).toHaveClass("faded");
    });

    it("handles hoveredTopic to highlight sentences", () => {
      const props = {
        ...defaultProps,
        hoveredTopic: { name: "Topic2" },
        articleTopics: [{ name: "Topic2", sentences: [2], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");
      const sentence1 = document.getElementById("sentence-0-1");

      expect(sentence0).not.toHaveClass("highlighted");
      expect(sentence1).toHaveClass("highlighted");
    });

    it("renders sentence margin accents when topic range accents are enabled", () => {
      const props = {
        ...defaultProps,
        showTopicRangeAccents: true,
        articleTopics: [{ name: "Topic1", sentences: [2], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");
      const sentence1 = document.getElementById("sentence-0-1");

      expect(sentence0).not.toHaveClass(
        "reading-article__sentence--with-topic-accent",
      );
      expect(sentence1).toHaveClass(
        "reading-article__sentence--with-topic-accent",
      );
      expect(sentence1.style.getPropertyValue("--topic-range-accent")).toBe(
        getTopicAccentColor("Topic1"),
      );
    });

    it("stacks sentence margin accents when multiple topics share a sentence", () => {
      const props = {
        ...defaultProps,
        showTopicRangeAccents: true,
        articleTopics: [
          { name: "Topic1", sentences: [2], ranges: [] },
          { name: "Topic2", sentences: [2], ranges: [] },
        ],
      };

      render(<TextDisplay {...props} />);

      const sentence1 = document.getElementById("sentence-0-1");
      const accentValue = sentence1.style.getPropertyValue(
        "--topic-range-accent",
      );

      expect(sentence1).toHaveClass(
        "reading-article__sentence--with-topic-accent",
      );
      expect(accentValue).toContain("linear-gradient");
      expect(accentValue).toContain(getTopicAccentColor("Topic1"));
      expect(accentValue).toContain(getTopicAccentColor("Topic2"));
    });
  });

  describe("Highlighted vs faded precedence", () => {
    it("gives precedence to highlight over fade when topic is both selected and read", () => {
      const props = {
        ...defaultProps,
        selectedTopics: [{ name: "Topic1" }],
        readTopics: new Set(["Topic1"]),
        articleTopics: [{ name: "Topic1", sentences: [1], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");

      // Should be highlighted, not faded
      expect(sentence0).toHaveClass("highlighted");
      expect(sentence0).not.toHaveClass("faded");
    });

    it("gives precedence to highlight over fade when topic is hovered and read", () => {
      const props = {
        ...defaultProps,
        hoveredTopic: { name: "Topic1" },
        readTopics: new Set(["Topic1"]),
        articleTopics: [{ name: "Topic1", sentences: [1], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");

      expect(sentence0).toHaveClass("highlighted");
      expect(sentence0).not.toHaveClass("faded");
    });

    it("applies fade when another topic is selected but current topic is read", () => {
      const props = {
        ...defaultProps,
        selectedTopics: [{ name: "Topic1" }],
        readTopics: new Set(["Topic2"]),
        articleTopics: [
          { name: "Topic1", sentences: [1], ranges: [] },
          { name: "Topic2", sentences: [2], ranges: [] },
        ],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");
      const sentence1 = document.getElementById("sentence-0-1");

      expect(sentence0).toHaveClass("highlighted");
      expect(sentence1).toHaveClass("faded");
    });

    it("handles multiple topics with mixed highlight and fade states", () => {
      const props = {
        ...defaultProps,
        selectedTopics: [{ name: "Topic1" }],
        readTopics: new Set(["Topic2", "Topic3"]),
        articleTopics: [
          { name: "Topic1", sentences: [1], ranges: [] },
          { name: "Topic2", sentences: [2], ranges: [] },
          { name: "Topic3", sentences: [3], ranges: [] },
        ],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");
      const sentence1 = document.getElementById("sentence-0-1");
      const sentence2 = document.getElementById("sentence-0-2");

      expect(sentence0).toHaveClass("highlighted");
      expect(sentence0).not.toHaveClass("faded");

      expect(sentence1).not.toHaveClass("highlighted");
      expect(sentence1).toHaveClass("faded");

      expect(sentence2).not.toHaveClass("highlighted");
      expect(sentence2).toHaveClass("faded");
    });

    it("applies no special class when topic is neither selected nor read", () => {
      const props = {
        ...defaultProps,
        selectedTopics: [],
        readTopics: new Set(),
        articleTopics: [{ name: "Topic1", sentences: [1], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const sentence0 = document.getElementById("sentence-0-0");

      expect(sentence0).not.toHaveClass("highlighted");
      expect(sentence0).not.toHaveClass("faded");
    });
  });

  describe("rawHtml range wrapping behavior", () => {
    it("renders rawHtml with word-token spans when topic ranges are provided", () => {
      const rawHtml = "<p>Hello world test</p>";
      // Position breakdown: "<p>" is 3 chars, so:
      // "Hello" = positions 3-7, "world" = positions 9-13, "test" = positions 15-18
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 3, end: 19 }], // Covers all words (Hello, world, test)
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const textContent = document.querySelector(".text-content");
      const wordTokens = textContent.querySelectorAll(".word-token");

      // Exact assertions: 3 word tokens should be wrapped (Hello, world, test)
      // because the range covers all words
      expect(wordTokens.length).toBe(3);

      // Verify each token has proper data attributes
      wordTokens.forEach((token) => {
        expect(token).toHaveAttribute("data-article-index", "0");
        expect(token).toHaveAttribute("data-char-start");
        expect(token).toHaveAttribute("data-char-end");
      });

      // Verify token identities
      const tokenTexts = Array.from(wordTokens).map((t) => t.textContent);
      expect(tokenTexts).toEqual(["Hello", "world", "test"]);
    });

    it("wraps words outside topic ranges without span when not in any range", () => {
      const rawHtml = "<p>Hello world</p>";
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 100, end: 200 }], // Outside text range
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const textContent = document.querySelector(".text-content");
      const wordTokens = textContent.querySelectorAll(".word-token");

      // No words should be wrapped since range is outside text
      expect(wordTokens.length).toBe(0);
    });

    it("applies highlighted class to words in selected topic ranges", () => {
      const rawHtml = "<p>Hello world test</p>";
      // Position breakdown: "<p>" is 3 chars, so:
      // "Hello" = positions 3-7 (end at 8), "world" = positions 9-13 (end at 14), "test" = positions 15-18 (end at 19)
      const props = {
        ...defaultProps,
        rawHtml,
        selectedTopics: [{ name: "Topic1" }],
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 3, end: 8 }], // "Hello" at positions 3-7
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const highlightedTokens = document.querySelectorAll(
        ".word-token.highlighted",
      );
      const allWordTokens = document.querySelectorAll(".word-token");

      // Exact assertions: exactly 1 token should be highlighted
      // Only words within topic ranges get wrapped as .word-token
      expect(highlightedTokens.length).toBe(1);
      expect(allWordTokens.length).toBe(1);

      // Verify the exact token identity - "Hello" should be highlighted
      const highlightedToken = highlightedTokens[0];
      expect(highlightedToken.textContent).toBe("Hello");
      expect(highlightedToken.getAttribute("data-char-start")).toBe("3");
      expect(highlightedToken.getAttribute("data-char-end")).toBe("8");
    });

    it("applies faded class to words in read topic ranges", () => {
      const rawHtml = "<p>Hello world test</p>";
      // Position breakdown: "<p>" is 3 chars, so:
      // "Hello" = positions 3-7 (end at 8), "world" = positions 9-13 (end at 14), "test" = positions 15-18 (end at 19)
      const props = {
        ...defaultProps,
        rawHtml,
        readTopics: new Set(["Topic1"]),
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 3, end: 8 }], // "Hello" at positions 3-7
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const fadedTokens = document.querySelectorAll(".word-token.faded");
      const allWordTokens = document.querySelectorAll(".word-token");

      // Exact assertions: exactly 1 token should be faded
      // Only words within topic ranges get wrapped as .word-token
      expect(fadedTokens.length).toBe(1);
      expect(allWordTokens.length).toBe(1);

      // Verify the exact token identity - "Hello" should be faded
      const fadedToken = fadedTokens[0];
      expect(fadedToken.textContent).toBe("Hello");
      expect(fadedToken.getAttribute("data-char-start")).toBe("3");
      expect(fadedToken.getAttribute("data-char-end")).toBe("8");
    });

    it("does not apply faded class when topic is both read and selected (highlight precedence)", () => {
      const rawHtml = "<p>Hello world</p>";
      // Position breakdown: "<p>" is 3 chars, so:
      // "Hello" = positions 3-7 (end at 8), "world" = positions 9-13 (end at 14)
      const props = {
        ...defaultProps,
        rawHtml,
        selectedTopics: [{ name: "Topic1" }],
        readTopics: new Set(["Topic1"]),
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 3, end: 8 }], // "Hello"
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const highlightedTokens = document.querySelectorAll(
        ".word-token.highlighted",
      );
      const fadedTokens = document.querySelectorAll(".word-token.faded");
      const allWordTokens = document.querySelectorAll(".word-token");

      // Exact assertions
      // Only words within topic ranges get wrapped, so only "Hello" becomes a .word-token
      expect(highlightedTokens.length).toBe(1);
      expect(fadedTokens.length).toBe(0);
      expect(allWordTokens.length).toBe(1);

      // Verify the highlighted token is "Hello"
      expect(highlightedTokens[0].textContent).toBe("Hello");
    });

    it("handles multiple topic ranges with overlapping words", () => {
      const rawHtml = "<p>Hello world test content</p>";
      // Position breakdown: "<p>" is 3 chars, so:
      // "Hello" = positions 3-7 (end at 8), "world" = positions 9-13 (end at 14)
      // "test" = positions 15-18 (end at 19), "content" = positions 20-26 (end at 27)
      const props = {
        ...defaultProps,
        rawHtml,
        selectedTopics: [{ name: "Topic1" }],
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [
              { start: 3, end: 8 }, // "Hello"
              { start: 9, end: 14 }, // "world"
            ],
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const highlightedTokens = document.querySelectorAll(
        ".word-token.highlighted",
      );
      const fadedTokens = document.querySelectorAll(".word-token.faded");
      const allWordTokens = document.querySelectorAll(".word-token");

      // Exact assertions: exactly 2 tokens highlighted (those within ranges)
      expect(highlightedTokens.length).toBe(2);
      expect(fadedTokens.length).toBe(0);
      // Only words within topic ranges get wrapped as .word-token
      expect(allWordTokens.length).toBe(2);

      // Verify the exact token identities
      const highlightedTexts = Array.from(highlightedTokens).map(
        (t) => t.textContent,
      );
      expect(highlightedTexts).toContain("Hello");
      expect(highlightedTexts).toContain("world");

      // Verify data attributes
      expect(highlightedTokens[0].getAttribute("data-char-start")).toBe("3");
      expect(highlightedTokens[0].getAttribute("data-char-end")).toBe("8");
      expect(highlightedTokens[1].getAttribute("data-char-start")).toBe("9");
      expect(highlightedTokens[1].getAttribute("data-char-end")).toBe("14");
    });

    it("preserves HTML tags while wrapping text content", () => {
      const rawHtml = "<p>Hello <strong>world</strong> test</p>";
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 3, end: 8 }], // "Hello"
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const strongElement = document.querySelector("strong");
      expect(strongElement).toBeInTheDocument();
      expect(strongElement.textContent).toBe("world");
    });

    it("handles HTML with attributes in tags", () => {
      const rawHtml = '<p class="test" data-foo="bar">Hello world</p>';
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 3, end: 8 }],
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const pElement = document.querySelector("p.test");
      expect(pElement).toBeInTheDocument();
      expect(pElement).toHaveAttribute("data-foo", "bar");
    });

    it("handles empty rawHtml gracefully", () => {
      const props = {
        ...defaultProps,
        rawHtml: "",
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 0, end: 5 }],
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const textContent = document.querySelector(".text-content");
      expect(textContent).toBeInTheDocument();
    });

    it("handles rawHtml with no topic ranges", () => {
      const rawHtml = "<p>Hello world</p>";
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [],
      };

      render(<TextDisplay {...props} />);

      const textContent = document.querySelector(".text-content");
      expect(textContent.innerHTML).toContain("Hello world");
    });

    it("preserves white-space: pre in sanitized rawHtml content", () => {
      const rawHtml = '<div style="white-space: pre">line 1\n  line 2</div>';
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [],
      };

      render(<TextDisplay {...props} />);

      const preformattedBlock = document.querySelector(".text-content div");
      expect(preformattedBlock).toBeInTheDocument();
      expect(preformattedBlock).toHaveAttribute("style", "white-space: pre");
    });

    it("handles articleTopics without ranges property", () => {
      const rawHtml = "<p>Hello world</p>";
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [
          {
            name: "Topic1",
            sentences: [1],
            // No ranges property
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const textContent = document.querySelector(".text-content");
      expect(textContent).toBeInTheDocument();
    });

    it("handles invalid range values (non-numeric)", () => {
      const rawHtml = "<p>Hello world</p>";
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [
              { start: "invalid", end: 8 },
              { start: 3, end: null },
              { start: NaN, end: Infinity },
            ],
          },
        ],
      };

      render(<TextDisplay {...props} />);

      // Should not throw and should render content
      const textContent = document.querySelector(".text-content");
      expect(textContent).toBeInTheDocument();
      expect(textContent.textContent).toContain("Hello world");
    });

    it("handles articleTopics that is not an array", () => {
      const rawHtml = "<p>Hello world</p>";
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: null,
      };

      render(<TextDisplay {...props} />);

      const textContent = document.querySelector(".text-content");
      expect(textContent).toBeInTheDocument();
    });

    it("sanitizes potentially dangerous HTML in rawHtml", () => {
      const rawHtml = '<p>Hello <script>alert("xss")</script> world</p>';
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 0, end: 5 }],
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const scriptElement = document.querySelector("script");
      expect(scriptElement).not.toBeInTheDocument();
    });
  });

  describe("paragraphMap rendering", () => {
    it("groups sentences into paragraphs when paragraphMap is provided", () => {
      const props = {
        ...defaultProps,
        paragraphMap: { 0: 0, 1: 0, 2: 1 },
      };

      render(<TextDisplay {...props} />);

      const paragraphs = document.querySelectorAll(".article-paragraph");
      expect(paragraphs.length).toBe(2);
    });

    it("handles missing paragraphMap entries by defaulting to paragraph 0", () => {
      const props = {
        ...defaultProps,
        paragraphMap: { 1: 1, 2: 1 },
        // sentence 0 has no entry, should default to 0
      };

      render(<TextDisplay {...props} />);

      const paragraphs = document.querySelectorAll(".article-paragraph");
      expect(paragraphs.length).toBe(2);
    });
  });

  describe("topic summary buttons", () => {
    it("renders topic summary buttons for topics ending at specific sentences", () => {
      const mockOnShowTopicSummary = vi.fn();
      const props = {
        ...defaultProps,
        articleTopics: [{ name: "Topic1", sentences: [1, 2], ranges: [] }],
        topicSummaries: { Topic1: "Summary of topic 1" },
        onShowTopicSummary: mockOnShowTopicSummary,
      };

      render(<TextDisplay {...props} />);

      const summaryButton = screen.getByTitle("View summary for topic: Topic1");
      expect(summaryButton).toBeInTheDocument();
      expect(summaryButton.textContent).toContain("Topic1");
    });

    it("does not render summary buttons when onShowTopicSummary is not provided", () => {
      const props = {
        ...defaultProps,
        articleTopics: [{ name: "Topic1", sentences: [1], ranges: [] }],
        topicSummaries: { Topic1: "Summary" },
        onShowTopicSummary: null,
      };

      render(<TextDisplay {...props} />);

      const summaryButton = document.querySelector(".topic-summary-link");
      expect(summaryButton).not.toBeInTheDocument();
    });

    it("does not render summary buttons when topicSummaries is not provided", () => {
      const props = {
        ...defaultProps,
        articleTopics: [{ name: "Topic1", sentences: [1], ranges: [] }],
        topicSummaries: null,
        onShowTopicSummary: vi.fn(),
      };

      render(<TextDisplay {...props} />);

      const summaryButton = document.querySelector(".topic-summary-link");
      expect(summaryButton).not.toBeInTheDocument();
    });
  });

  describe("Tooltip word exploration link", () => {
    const originalCaretPositionFromPoint = document.caretPositionFromPoint;
    const originalCaretRangeFromPoint = document.caretRangeFromPoint;

    afterEach(() => {
      document.caretPositionFromPoint = originalCaretPositionFromPoint;
      document.caretRangeFromPoint = originalCaretRangeFromPoint;
    });

    it("shows a word-page link for a clicked word token immediately", () => {
      render(
        <TextDisplay
          {...defaultProps}
          rawHtml="<p>Hello world</p>"
          submissionId="sub-123"
          articleTopics={[
            {
              name: "Topic1",
              sentences: [],
              ranges: [{ start: 0, end: 11 }],
            },
          ]}
        />,
      );

      const wordToken = document.querySelector(".word-token");
      fireEvent.click(wordToken, { clientX: 10, clientY: 10 });

      const links = screen.getAllByRole("link", { name: /Explore/ });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute(
        "href",
        expect.stringContaining("/page/word/sub-123/"),
      );
    });

    it("shows a word-page link for sentence-level click targets using the cursor word", () => {
      render(
        <TextDisplay
          {...defaultProps}
          submissionId="sub-123"
          articleTopics={[{ name: "Topic1", sentences: [1], ranges: [] }]}
        />,
      );

      const sentenceToken = document.getElementById("sentence-0-0");
      const sentenceTextNode = sentenceToken.firstChild;
      document.caretPositionFromPoint = vi.fn(() => ({
        offsetNode: sentenceTextNode,
        offset: 2,
      }));
      document.caretRangeFromPoint = undefined;

      fireEvent.click(sentenceToken, { clientX: 20, clientY: 20 });

      expect(screen.getByRole("link", { name: /Explore/ })).toHaveAttribute(
        "href",
        expect.stringContaining("/page/word/sub-123/"),
      );
    });
  });

  describe("Tooltip click/tap behaviour", () => {
    it("shows tooltip immediately on token click (no delay)", () => {
      render(
        <TextDisplay
          {...defaultProps}
          articleTopics={[{ name: "Topic1", sentences: [1], ranges: [] }]}
        />,
      );

      const sentenceToken = document.getElementById("sentence-0-0");
      fireEvent.click(sentenceToken);

      expect(screen.getByText("Topic1")).toBeInTheDocument();
    });

    it("keeps the raw HTML content node stable when opening a tooltip", () => {
      render(
        <TextDisplay
          {...defaultProps}
          rawHtml="<p>Hello world</p>"
          articleTopics={[
            {
              name: "Topic1",
              sentences: [],
              ranges: [{ start: 0, end: 11 }],
            },
          ]}
        />,
      );

      const textContent = document.querySelector(".text-content");
      const wordToken = document.querySelector(".word-token");

      fireEvent.click(wordToken, { clientX: 10, clientY: 10 });

      expect(screen.getByText("Topic1")).toBeInTheDocument();
      expect(document.querySelector(".text-content")).toBe(textContent);
      expect(document.querySelector(".word-token")).toBe(wordToken);
    });

    it("keeps the sentence content node stable when opening a tooltip", () => {
      render(
        <TextDisplay
          {...defaultProps}
          articleTopics={[{ name: "Topic1", sentences: [1], ranges: [] }]}
        />,
      );

      const textContent = document.querySelector(".text-content");
      const sentenceToken = document.getElementById("sentence-0-0");

      fireEvent.click(sentenceToken, { clientX: 10, clientY: 10 });

      expect(screen.getByText("Topic1")).toBeInTheDocument();
      expect(document.querySelector(".text-content")).toBe(textContent);
      expect(document.getElementById("sentence-0-0")).toBe(sentenceToken);
    });

    it("does not show tooltip when tooltipEnabled is false", () => {
      render(
        <TextDisplay
          {...defaultProps}
          tooltipEnabled={false}
          articleTopics={[{ name: "Topic1", sentences: [1], ranges: [] }]}
        />,
      );

      const sentenceToken = document.getElementById("sentence-0-0");
      fireEvent.click(sentenceToken);

      expect(screen.queryByText("Topic1")).not.toBeInTheDocument();
    });

    it("does not show tooltip when sentence has no matching topics", () => {
      render(<TextDisplay {...defaultProps} articleTopics={[]} />);

      const sentenceToken = document.getElementById("sentence-0-0");
      fireEvent.click(sentenceToken);

      expect(
        document.querySelector(".text-topic-tooltip"),
      ).not.toBeInTheDocument();
    });

    it("toggles tooltip off when the same token is clicked twice", () => {
      render(
        <TextDisplay
          {...defaultProps}
          articleTopics={[{ name: "Topic1", sentences: [1], ranges: [] }]}
        />,
      );

      const sentenceToken = document.getElementById("sentence-0-0");
      fireEvent.click(sentenceToken);
      expect(screen.getByText("Topic1")).toBeInTheDocument();

      fireEvent.click(sentenceToken);
      expect(screen.queryByText("Topic1")).not.toBeInTheDocument();
    });

    it("hides tooltip on Escape key press", () => {
      render(
        <TextDisplay
          {...defaultProps}
          articleTopics={[{ name: "Topic1", sentences: [1], ranges: [] }]}
        />,
      );

      const sentenceToken = document.getElementById("sentence-0-0");
      fireEvent.click(sentenceToken);
      expect(screen.getByText("Topic1")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByText("Topic1")).not.toBeInTheDocument();
    });

    it('prevents default navigation and shows "Go to" button when a link is clicked', () => {
      render(
        <TextDisplay
          {...defaultProps}
          rawHtml='<p><a href="https://example.com">Example link</a></p>'
          articleTopics={[
            {
              name: "Topic1",
              sentences: [],
              ranges: [{ start: 0, end: 100 }],
            },
          ]}
        />,
      );

      // Find the link rendered in the text content
      const link = document.querySelector(".text-content a[href]");
      expect(link).toBeInTheDocument();

      fireEvent.click(link, { clientX: 10, clientY: 10 });

      expect(screen.getByRole("link", { name: /Go to:/ })).toBeInTheDocument();
    });

    it("opens topic summaries from the tooltip and closes it", () => {
      const handleOpenTopicSummaries = vi.fn();

      render(
        <TextDisplay
          {...defaultProps}
          articleTopics={[{ name: "Topic1", sentences: [1], ranges: [] }]}
          onOpenTopicSummaries={handleOpenTopicSummaries}
        />,
      );

      const sentenceToken = document.getElementById("sentence-0-0");
      fireEvent.click(sentenceToken);

      fireEvent.click(screen.getByRole("button", { name: "Topic Summaries" }));

      expect(handleOpenTopicSummaries).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Topic1" }),
      );
      expect(
        document.querySelector(".text-topic-tooltip"),
      ).not.toBeInTheDocument();
    });
  });

  describe("edge cases and defensive programming", () => {
    it("handles sentences that is not an array", () => {
      const props = {
        ...defaultProps,
        sentences: null,
      };

      render(<TextDisplay {...props} />);

      const textDisplay = document.querySelector(".text-display");
      expect(textDisplay).toBeInTheDocument();
    });

    it("handles selectedTopics that is not an array", () => {
      const props = {
        ...defaultProps,
        selectedTopics: null,
      };

      render(<TextDisplay {...props} />);

      const textDisplay = document.querySelector(".text-display");
      expect(textDisplay).toBeInTheDocument();
    });

    it("handles articleTopics entries with undefined sentences property gracefully", () => {
      // The component should gracefully handle missing/undefined sentences property
      // instead of crashing. This tests defensive programming resilience.
      const props = {
        ...defaultProps,
        selectedTopics: [{ name: "Topic1" }],
        articleTopics: [{ name: "Topic1", sentences: undefined, ranges: [] }],
      };

      // Should NOT throw - component should handle undefined sentences gracefully
      render(<TextDisplay {...props} />);

      const textDisplay = document.querySelector(".text-display");
      expect(textDisplay).toBeInTheDocument();
    });

    it("handles articleTopics with empty sentences array", () => {
      const props = {
        ...defaultProps,
        selectedTopics: [{ name: "Topic1" }],
        articleTopics: [{ name: "Topic1", sentences: [], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const textDisplay = document.querySelector(".text-display");
      expect(textDisplay).toBeInTheDocument();
    });

    it("handles ranges with negative start values", () => {
      const rawHtml = "<p>Hello world</p>";
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: -10, end: 8 }],
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const textContent = document.querySelector(".text-content");
      expect(textContent).toBeInTheDocument();
    });

    it("correctly handles HTML with nested tags and quotes", () => {
      const rawHtml =
        "<p data-test=\"value's\">Hello <span class='test\"value'>world</span></p>";
      const props = {
        ...defaultProps,
        rawHtml,
        articleTopics: [
          {
            name: "Topic1",
            sentences: [],
            ranges: [{ start: 3, end: 8 }],
          },
        ],
      };

      render(<TextDisplay {...props} />);

      const textContent = document.querySelector(".text-content");
      expect(textContent).toBeInTheDocument();
    });

    it("handles multiple articles with different articleIndex values", () => {
      const props = {
        ...defaultProps,
        articleIndex: 5,
        selectedTopics: [{ name: "Topic1" }],
        articleTopics: [{ name: "Topic1", sentences: [1], ranges: [] }],
      };

      render(<TextDisplay {...props} />);

      const sentence = document.getElementById("sentence-5-0");
      expect(sentence).toBeInTheDocument();
      expect(sentence).toHaveAttribute("data-article-index", "5");
    });
  });
});
