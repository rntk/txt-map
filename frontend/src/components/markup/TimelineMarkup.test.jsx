import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TimelineMarkup from "./TimelineMarkup";

describe("TimelineMarkup", () => {
  it("prefers event descriptions and falls back to sentence text", () => {
    render(
      <TimelineMarkup
        segment={{
          data: {
            events: [
              {
                position_index: 1,
                date: "2026-02-08",
                description: "Launch day",
              },
              {
                position_index: 2,
                date: "2026-02-09",
              },
            ],
          },
        }}
        sentences={["Ignored sentence text.", "Fallback event summary."]}
      />,
    );

    // Check that the timeline region is rendered
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(timeline).toBeInTheDocument();

    // Check that events are rendered with descriptions
    expect(timeline).toHaveTextContent("Launch day");
    expect(timeline).toHaveTextContent("Fallback event summary.");

    // Check that dates are rendered
    const dates = screen.getAllByRole("time");
    expect(dates).toHaveLength(2);
    expect(dates[0]).toHaveAttribute("datetime", "2026-02-08");
    expect(dates[1]).toHaveAttribute("datetime", "2026-02-09");
  });

  it("renders events in chronological order by position_index", () => {
    render(
      <TimelineMarkup
        segment={{
          data: {
            events: [
              {
                position_index: 3,
                date: "2026-02-10",
                description: "Third event",
              },
              {
                position_index: 1,
                date: "2026-02-08",
                description: "First event",
              },
              {
                position_index: 2,
                date: "2026-02-09",
                description: "Second event",
              },
            ],
          },
        }}
        sentences={[]}
      />,
    );

    const timeline = screen.getByRole("region", { name: "Timeline" });
    const events = screen.getAllByRole("listitem");

    expect(events).toHaveLength(3);
    expect(timeline).toHaveTextContent("First event");
    expect(timeline).toHaveTextContent("Second event");
    expect(timeline).toHaveTextContent("Third event");
  });

  it("handles events without dates", () => {
    render(
      <TimelineMarkup
        segment={{
          data: {
            events: [
              {
                position_index: 1,
                description: "Event without date",
              },
            ],
          },
        }}
        sentences={[]}
      />,
    );

    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(timeline).toHaveTextContent("Event without date");

    // No time elements should be rendered
    const dates = screen.queryAllByRole("time");
    expect(dates).toHaveLength(0);
  });

  it("returns null when no events are provided", () => {
    const { container } = render(
      <TimelineMarkup segment={{ data: { events: [] } }} sentences={[]} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
