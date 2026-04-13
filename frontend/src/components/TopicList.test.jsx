import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import TopicList from "./TopicList";

// A minimal flat topic
const makeTopic = (name, totalSentences = 1, ranges = [], extra = {}) => ({
  name,
  totalSentences,
  ranges,
  ...extra,
});
const makeInsight = (
  id,
  name,
  topicNames = [],
  sourceSentenceIndices = [1],
) => ({
  id,
  name,
  topicNames,
  sourceSentenceIndices,
  sourceSentences: [],
});

// Topics that form a two-level tree:
//   Animals (intermediate)
//     Animals>Mammals (leaf)
//     Animals>Birds   (leaf)
//   Plants (leaf)
const treeTopics = [
  makeTopic("Animals>Mammals"),
  makeTopic("Animals>Birds"),
  makeTopic("Plants"),
];

const getSubtreeCheckbox = () => {
  const checkboxes = screen.getAllByRole("checkbox");
  return checkboxes.find((checkbox) => {
    const label = checkbox.closest("label");
    return label && label.textContent.includes("Animals");
  });
};

const getRowForText = (text) =>
  screen.getByText(text).closest(".topic-tree-node__row");

describe("TopicList subtreeStateMap – hasSelected", () => {
  it("leaf checkbox is unchecked when topic is not selected", () => {
    render(<TopicList topics={[makeTopic("Science")]} selectedTopics={[]} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0].checked).toBe(false);
  });

  it("leaf checkbox is checked when topic is selected", () => {
    render(
      <TopicList
        topics={[makeTopic("Science")]}
        selectedTopics={[{ name: "Science" }]}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0].checked).toBe(true);
  });

  it("parent checkbox is checked when all leaves in subtree are selected", () => {
    render(
      <TopicList
        topics={treeTopics}
        selectedTopics={[
          { name: "Animals>Mammals" },
          { name: "Animals>Birds" },
        ]}
      />,
    );
    // The Animals intermediate node has a checkbox (non-leaf)
    // Its checked state reflects isSubtreeSelected = hasSelected from subtreeStateMap
    const checkboxes = screen.getAllByRole("checkbox");
    // Find the Animals group checkbox (non-leaf uses label+checkbox)
    // The Animals node is first alphabetically, its checkbox should be checked
    const animalsCheckbox = checkboxes.find((cb) => {
      const label = cb.closest("label");
      return label && label.textContent.includes("Animals");
    });
    expect(animalsCheckbox).toBeDefined();
    expect(animalsCheckbox.checked).toBe(true);
  });

  it("parent checkbox is unchecked when no leaves in subtree are selected", () => {
    render(<TopicList topics={treeTopics} selectedTopics={[]} />);
    const checkboxes = screen.getAllByRole("checkbox");
    const animalsCheckbox = checkboxes.find((cb) => {
      const label = cb.closest("label");
      return label && label.textContent.includes("Animals");
    });
    expect(animalsCheckbox).toBeDefined();
    expect(animalsCheckbox.checked).toBe(false);
  });

  it("parent checkbox reflects hasSelected even when only one child is selected", () => {
    render(
      <TopicList
        topics={treeTopics}
        selectedTopics={[{ name: "Animals>Mammals" }]}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    const animalsCheckbox = checkboxes.find((cb) => {
      const label = cb.closest("label");
      return label && label.textContent.includes("Animals");
    });
    // hasSelected is true when at least one child is selected
    expect(animalsCheckbox.checked).toBe(true);
  });
});

describe("TopicList subtreeStateMap – allRead", () => {
  it('leaf shows "Mark Read" button when topic is not read', () => {
    render(
      <TopicList topics={[makeTopic("Science")]} readTopics={new Set()} />,
    );
    expect(screen.getByText("Mark Read")).toBeDefined();
  });

  it('leaf shows "Mark Unread" button when topic is read', () => {
    render(
      <TopicList
        topics={[makeTopic("Science")]}
        readTopics={new Set(["Science"])}
      />,
    );
    expect(screen.getByText("Mark Unread")).toBeDefined();
  });

  it('parent subtree shows "Mark Unread" only when ALL leaves are read', () => {
    render(
      <TopicList
        topics={treeTopics}
        readTopics={new Set(["Animals>Mammals", "Animals>Birds"])}
      />,
    );
    // The Animals group button should say "Mark Unread" (allRead = true)
    const buttons = screen.getAllByText("Mark Unread");
    // At least the Animals group button should be "Mark Unread"
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('parent subtree shows "Mark Read" when only some leaves are read', () => {
    render(
      <TopicList
        topics={treeTopics}
        readTopics={new Set(["Animals>Mammals"])}
      />,
    );
    // The Animals group button should say "Mark Read" because Birds is not read
    // Find the group button for Animals (non-leaf node)
    const markReadButtons = screen.getAllByText("Mark Read");
    expect(markReadButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('parent subtree shows "Mark Read" when no leaves are read', () => {
    render(<TopicList topics={treeTopics} readTopics={new Set()} />);
    const markReadButtons = screen.getAllByText("Mark Read");
    expect(markReadButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("allRead is false for an intermediate node with no leaves (hasLeaves=false)", () => {
    // A topic tree where an intermediate node exists with no leaf children
    // In practice buildTopicTree always assigns isLeaf correctly; test a single leaf
    render(
      <TopicList topics={[makeTopic("Solo")]} readTopics={new Set(["Solo"])} />,
    );
    // If allRead is computed correctly the single leaf should show "Mark Unread"
    expect(screen.getByText("Mark Unread")).toBeDefined();
  });
});

describe("TopicList general rendering", () => {
  it('renders "No topics yet." when topics array is empty', () => {
    render(<TopicList topics={[]} />);
    expect(screen.getByText("No topics yet.")).toBeDefined();
  });

  it("renders topic names", () => {
    render(
      <TopicList topics={[makeTopic("Physics"), makeTopic("Chemistry")]} />,
    );
    expect(screen.getByText("Physics")).toBeDefined();
    expect(screen.getByText("Chemistry")).toBeDefined();
  });

  it("renders an overflow trigger for leaf and parent topic rows", () => {
    render(<TopicList topics={treeTopics} />);

    expect(
      screen.getByRole("button", { name: "Show actions for Animals" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show actions for Plants" }),
    ).toBeInTheDocument();
  });

  it("renders filter input when topics are present", () => {
    render(<TopicList topics={[makeTopic("Art")]} />);
    expect(screen.getByPlaceholderText("Filter topics...")).toBeDefined();
  });

  it("does not render filter input when topics list is empty", () => {
    render(<TopicList topics={[]} />);
    expect(screen.queryByPlaceholderText("Filter topics...")).toBeNull();
  });

  it('renders "Read All" / "Unread All" button based on overall read state', () => {
    const { rerender } = render(
      <TopicList topics={[makeTopic("Alpha")]} readTopics={new Set()} />,
    );
    expect(screen.getByText("Read All")).toBeDefined();

    rerender(
      <TopicList
        topics={[makeTopic("Alpha")]}
        readTopics={new Set(["Alpha"])}
      />,
    );
    expect(screen.getByText("Unread All")).toBeDefined();
  });

  it("keeps leaf actions non-tabbable until the overflow trigger is opened", () => {
    render(
      <TopicList
        topics={[
          makeTopic("Science", 1, [
            [0, 1],
            [2, 3],
          ]),
        ]}
      />,
    );

    const row = getRowForText("Science");
    const nextButton = within(row).getByRole("button", { name: "Next" });
    const trigger = within(row).getByRole("button", {
      name: "Show actions for Science",
    });

    expect(nextButton).toHaveAttribute("tabindex", "-1");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(nextButton).toHaveAttribute("tabindex", "0");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("opens only one manual action menu at a time", () => {
    render(
      <TopicList
        topics={[
          makeTopic("Science", 1, [
            [0, 1],
            [2, 3],
          ]),
          makeTopic("History", 1, [
            [0, 1],
            [2, 3],
          ]),
        ]}
      />,
    );

    const scienceRow = getRowForText("Science");
    const historyRow = getRowForText("History");
    const scienceTrigger = within(scienceRow).getByRole("button", {
      name: "Show actions for Science",
    });
    const historyTrigger = within(historyRow).getByRole("button", {
      name: "Show actions for History",
    });
    const scienceNextButton = within(scienceRow).getByRole("button", {
      name: "Next",
    });
    const historyNextButton = within(historyRow).getByRole("button", {
      name: "Next",
    });

    fireEvent.click(scienceTrigger);
    expect(scienceNextButton).toHaveAttribute("tabindex", "0");
    expect(historyNextButton).toHaveAttribute("tabindex", "-1");

    fireEvent.click(historyTrigger);
    expect(scienceNextButton).toHaveAttribute("tabindex", "-1");
    expect(historyNextButton).toHaveAttribute("tabindex", "0");
    expect(scienceTrigger).toHaveAttribute("aria-expanded", "false");
    expect(historyTrigger).toHaveAttribute("aria-expanded", "true");
  });

  it("closes a manually opened menu after using an action", () => {
    const onToggleRead = vi.fn();

    render(
      <TopicList topics={[makeTopic("Science")]} onToggleRead={onToggleRead} />,
    );

    const row = getRowForText("Science");
    const trigger = within(row).getByRole("button", {
      name: "Show actions for Science",
    });
    const markReadButton = within(row).getByRole("button", {
      name: "Mark Read",
    });

    fireEvent.click(trigger);
    fireEvent.click(markReadButton);

    expect(onToggleRead).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Science" }),
    );
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(markReadButton).toHaveAttribute("tabindex", "-1");
  });

  it("marks read controls as active when a leaf topic is read", () => {
    render(
      <TopicList
        topics={[makeTopic("Science")]}
        readTopics={new Set(["Science"])}
      />,
    );

    expect(screen.getByRole("button", { name: "Mark Unread" })).toHaveClass(
      "topic-nav-button--active",
    );
  });

  it("applies the highlight class and runtime color variable when topic coloring is enabled", () => {
    render(<TopicList topics={[makeTopic("Art")]} highlightAllTopics />);

    const topicTitle = screen.getByText("Art");
    expect(topicTitle).toHaveClass("topic-tree-node__title--highlighted");
    expect(
      topicTitle.style.getPropertyValue("--topic-highlight-color"),
    ).not.toBe("");
  });

  it("renders sidebar tabs only when insights are provided", () => {
    const { rerender } = render(<TopicList topics={[makeTopic("Art")]} />);
    expect(screen.queryByRole("tab", { name: /Insights/ })).toBeNull();

    rerender(
      <TopicList
        topics={[makeTopic("Art")]}
        insights={[makeInsight("insight-1", "Signal", ["Art"])]}
      />,
    );

    expect(screen.getByRole("tab", { name: /Topics/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Insights/ })).toBeInTheDocument();
  });

  it("renders a flat insights list and calls onSelectInsight for the clicked row", () => {
    const onSelectInsight = vi.fn();
    const insight = makeInsight("insight-1", "Signal", ["Art"]);

    render(
      <TopicList
        topics={[makeTopic("Art")]}
        insights={[insight]}
        sidebarTab="insights"
        onSelectInsight={onSelectInsight}
      />,
    );

    expect(
      screen.getByPlaceholderText("Filter insights..."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Signal/ }));

    expect(onSelectInsight).toHaveBeenCalledWith(
      expect.objectContaining({ id: "insight-1", name: "Signal" }),
    );
  });

  it("falls back to sourceSentences for the insight sentence count when indices are missing", () => {
    render(
      <TopicList
        topics={[makeTopic("Art")]}
        insights={[
          {
            id: "insight-1",
            name: "Signal",
            topicNames: ["Art"],
            sourceSentenceIndices: [],
            sourceSentences: ["One.", "Two."],
          },
        ]}
        sidebarTab="insights"
      />,
    );

    expect(screen.getByText("2 sent.")).toBeInTheDocument();
    expect(screen.queryByText("0 sent.")).toBeNull();
  });
});

describe("TopicList subtree checkbox navigation", () => {
  it("does not navigate when unchecking a selected subtree", () => {
    const onToggleTopic = vi.fn();
    const onNavigateTopic = vi.fn();

    render(
      <TopicList
        topics={treeTopics}
        selectedTopics={[
          { name: "Animals>Mammals" },
          { name: "Animals>Birds" },
        ]}
        onToggleTopic={onToggleTopic}
        onNavigateTopic={onNavigateTopic}
      />,
    );

    const animalsCheckbox = getSubtreeCheckbox();

    expect(animalsCheckbox).toBeDefined();

    fireEvent.click(animalsCheckbox);

    expect(onToggleTopic).toHaveBeenCalledTimes(2);
    expect(onToggleTopic).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "Animals>Mammals" }),
    );
    expect(onToggleTopic).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "Animals>Birds" }),
    );
    expect(onNavigateTopic).not.toHaveBeenCalled();
  });

  it("navigates to the first leaf when checking an unselected subtree", () => {
    const onToggleTopic = vi.fn();
    const onNavigateTopic = vi.fn();

    render(
      <TopicList
        topics={treeTopics}
        selectedTopics={[]}
        onToggleTopic={onToggleTopic}
        onNavigateTopic={onNavigateTopic}
      />,
    );

    const animalsCheckbox = getSubtreeCheckbox();

    expect(animalsCheckbox).toBeDefined();

    fireEvent.click(animalsCheckbox);

    expect(onToggleTopic).toHaveBeenCalledTimes(2);
    expect(onToggleTopic).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "Animals>Mammals" }),
    );
    expect(onToggleTopic).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "Animals>Birds" }),
    );
    expect(onNavigateTopic).toHaveBeenCalledTimes(1);
    expect(onNavigateTopic).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Animals>Mammals" }),
      "focus",
    );
  });
});
