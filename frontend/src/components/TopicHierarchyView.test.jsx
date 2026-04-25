import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import TopicHierarchyView from "./TopicHierarchyView";

function makeDenseTopics(count) {
  return Array.from({ length: count }, (_, index) => ({
    name: `Root>Child ${index + 1}`,
    sentences: [index + 1],
  }));
}

describe("TopicHierarchyView", () => {
  test("renders every child by default instead of hiding overflow", () => {
    render(<TopicHierarchyView topics={makeDenseTopics(12)} />);

    expect(screen.getByText("Child 12")).toBeInTheDocument();
    expect(screen.queryByText(/more topics/i)).not.toBeInTheDocument();
  });

  test("shows a more indicator when overview children exceed the limit", () => {
    const onDrilldownPath = vi.fn();

    render(
      <TopicHierarchyView
        topics={makeDenseTopics(8)}
        childLimit={3}
        rootLimit={10}
        onDrilldownPath={onDrilldownPath}
      />,
    );

    expect(screen.getByText("5 more topics")).toBeInTheDocument();

    fireEvent.click(screen.getByText("5 more topics"));
    expect(onDrilldownPath).toHaveBeenCalledWith("Root");
  });

  test("clicking a parent branch opens drilldown instead of hiding descendants", () => {
    const onDrilldownPath = vi.fn();
    const onSelectPath = vi.fn();

    render(
      <TopicHierarchyView
        topics={makeDenseTopics(2)}
        onSelectPath={onSelectPath}
        onDrilldownPath={onDrilldownPath}
      />,
    );

    fireEvent.click(screen.getByText("Root"));

    expect(onDrilldownPath).toHaveBeenCalledWith("Root");
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  test("clicking a leaf meta button opens topic meta without selecting the leaf", () => {
    const onOpenTopicMeta = vi.fn();
    const onSelectPath = vi.fn();
    const topic = { name: "Root>Child 1", sentences: [1] };

    render(
      <TopicHierarchyView
        topics={[topic]}
        onOpenTopicMeta={onOpenTopicMeta}
        onSelectPath={onSelectPath}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show topics meta for Root>Child 1",
      }),
    );

    expect(onOpenTopicMeta).toHaveBeenCalledWith(topic);
    expect(onSelectPath).not.toHaveBeenCalled();
  });

  test("clicking a leaf meta button again closes topic meta", () => {
    const onOpenTopicMeta = vi.fn();
    const onCloseTopicMeta = vi.fn();
    const topic = { name: "Root>Child 1", sentences: [1] };

    render(
      <TopicHierarchyView
        topics={[topic]}
        activeMetaTopicName="Root>Child 1"
        onOpenTopicMeta={onOpenTopicMeta}
        onCloseTopicMeta={onCloseTopicMeta}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show topics meta for Root>Child 1",
      }),
    );

    expect(onCloseTopicMeta).toHaveBeenCalled();
    expect(onOpenTopicMeta).not.toHaveBeenCalled();
  });

  test("sizes parent rows to their rendered descendant count", () => {
    const { container } = render(
      <TopicHierarchyView topics={makeDenseTopics(4)} />,
    );

    const rootNode = container.querySelector(".th-node");

    expect(rootNode?.style.getPropertyValue("--th-row-span")).toBe("4");
  });

  test("scopes drilldown rendering to descendants of the selected branch", () => {
    render(
      <TopicHierarchyView
        topics={[
          { name: "Root>Visible", sentences: [1] },
          { name: "Other>Hidden", sentences: [2] },
        ]}
        scopePath={["Root"]}
        drilldownMode
        childLimit={0}
        rootLimit={0}
      />,
    );

    expect(screen.getByText("Visible")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });
});
