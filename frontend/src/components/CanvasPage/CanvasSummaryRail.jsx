import React from "react";
import { getStickyCardTop } from "./stickyCards";
import RailConnectors from "./RailConnectors";

/**
 * Renders the SVG connector lines and floating summary cards for the summary rail.
 * @param {{
 *   summaryLayout: {
 *     cards: Array<{key: string, midY: number, cardY: number, cardHeight: number, startY: number, endY: number, topicName: string, summaryText: string}>,
 *     articleRight?: number,
 *     articleHeight?: number,
 *   },
 *   activeSummaryKey: string | null,
 *   onCardEnter: (key: string) => void,
 *   onCardLeave: (key: string) => void,
 *   translate: {x: number, y: number},
 *   scale: number,
 *   isAnimating: boolean,
 * }} props
 */
export default function CanvasSummaryRail({
  summaryLayout,
  activeSummaryKey,
  onCardEnter,
  onCardLeave,
  translate,
  scale,
  isAnimating,
}) {
  const { cards, articleRight = 0, articleHeight = 0 } = summaryLayout;

  if (!cards || cards.length === 0) return null;

  const viewportTop = -translate.y / scale;

  return (
    <>
      <RailConnectors
        name="summary"
        cards={cards}
        articleHeight={articleHeight}
        anchorX={articleRight}
        bulbX={articleRight + 80}
        viewportTop={viewportTop}
        scale={scale}
        activeKey={activeSummaryKey}
      />
      <div className="canvas-summary-rail">
        {cards.map((card) => {
          const effectiveTop = getStickyCardTop(card, viewportTop, scale);
          return (
            <div
              key={card.key}
              className={`canvas-summary-card${activeSummaryKey === card.key ? " is-active" : ""}`}
              style={{
                top: `${effectiveTop}px`,
                height: `${card.cardHeight}px`,
                transition: isAnimating ? "top 320ms ease" : undefined,
              }}
              onMouseEnter={() => onCardEnter(card.key)}
              onMouseLeave={() => onCardLeave(card.key)}
              title={card.topicName}
            >
              <div className="canvas-summary-card-topic">{card.topicName}</div>
              <div className="canvas-summary-card-text">{card.summaryText}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
