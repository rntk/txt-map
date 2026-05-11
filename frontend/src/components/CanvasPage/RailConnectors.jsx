import React from "react";
import { getStickyCardTop } from "./stickyCards";

/**
 * Predeclared class-name sets per rail. Keeping these as a static lookup
 * (rather than interpolating `name` into class strings) means an unknown
 * `name` value fails loudly instead of producing arbitrary class names.
 */
const RAIL_CLASSES = {
  summary: {
    connectors: "canvas-summary-connectors",
    anchor: "canvas-summary-anchor",
    connector: "canvas-summary-connector",
    bulb: "canvas-summary-bulb",
  },
  insights: {
    connectors: "canvas-insights-connectors",
    anchor: "canvas-insights-anchor",
    connector: "canvas-insights-connector",
    bulb: "canvas-insights-bulb",
  },
  "tag-topics": {
    connectors: "canvas-tag-topics-connectors",
    anchor: "canvas-tag-topics-anchor",
    connector: "canvas-tag-topics-connector",
    bulb: "canvas-tag-topics-bulb",
  },
};

const activeCls = (base, isActive) => (isActive ? `${base} is-active` : base);

/**
 * Renders the SVG anchor/line/bulb connectors for a rail aligned to article
 * sentence ranges. Used by CanvasSummaryRail, CanvasInsightsRail, and
 * CanvasTagTopicsRail.
 *
 * @param {{
 *   name: "summary" | "insights" | "tag-topics",
 *   cards: Array<{key: string, cardY: number, cardHeight: number, startY: number, endY: number}>,
 *   articleHeight: number,
 *   anchorX: number,
 *   bulbX: number,
 *   viewportTop: number,
 *   scale: number,
 *   activeKey: string | null,
 * }} props
 */
export default function RailConnectors({
  name,
  cards,
  articleHeight,
  anchorX,
  bulbX,
  viewportTop,
  scale,
  activeKey,
}) {
  if (!cards || cards.length === 0) return null;

  const classes = RAIL_CLASSES[name];
  if (!classes) return null;

  const svgHeight = Math.max(
    articleHeight,
    cards[cards.length - 1].cardY + 100,
  );

  return (
    <svg className={classes.connectors} style={{ height: svgHeight }}>
      {cards.map((card) => {
        const effectiveTop = getStickyCardTop(card, viewportTop, scale);
        const connectorY = effectiveTop + card.cardHeight / 2;
        const isActive = activeKey === card.key;
        return (
          <g key={card.key}>
            <circle
              cx={anchorX}
              cy={connectorY}
              r={3}
              className={activeCls(classes.anchor, isActive)}
            />
            <line
              x1={anchorX}
              y1={connectorY}
              x2={bulbX}
              y2={connectorY}
              className={activeCls(classes.connector, isActive)}
            />
            <circle
              cx={bulbX}
              cy={connectorY}
              r={4}
              className={activeCls(classes.bulb, isActive)}
            />
          </g>
        );
      })}
    </svg>
  );
}
