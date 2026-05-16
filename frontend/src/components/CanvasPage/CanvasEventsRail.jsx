import React from "react";
import { getStickyCardTop } from "./stickyCards";
import RailConnectors from "./RailConnectors";

/**
 * Renders SVG connector lines and floating event cards on the RIGHT side of
 * the article, aligned with each timeline event's highlight span.
 * @param {{
 *   eventsLayout: {
 *     cards: Array<{
 *       key: string,
 *       eventIndex: number,
 *       name: string,
 *       preview: string,
 *       midY: number,
 *       cardY: number,
 *       cardHeight: number,
 *       startY: number,
 *       endY: number,
 *     }>,
 *     articleRight?: number,
 *     articleHeight?: number,
 *   },
 *   selectedIndex: number,
 *   activeEventKey: string | null,
 *   onCardEnter: (key: string) => void,
 *   onCardLeave: (key: string) => void,
 *   onCardClick: (eventIndex: number) => void,
 *   translate: {x: number, y: number},
 *   scale: number,
 *   isAnimating: boolean,
 * }} props
 */
export default function CanvasEventsRail({
  eventsLayout,
  selectedIndex,
  activeEventKey,
  onCardEnter,
  onCardLeave,
  onCardClick,
  translate,
  scale,
  isAnimating,
}) {
  const { cards, articleRight = 0, articleHeight = 0 } = eventsLayout;

  if (!cards || cards.length === 0) return null;

  const viewportTop = -translate.y / scale;
  const connectorActiveKey =
    activeEventKey ||
    cards.find((card) => card.eventIndex === selectedIndex)?.key ||
    null;

  return (
    <>
      <RailConnectors
        name="events"
        cards={cards}
        articleHeight={articleHeight}
        anchorX={articleRight}
        bulbX={articleRight + 80}
        viewportTop={viewportTop}
        scale={scale}
        activeKey={connectorActiveKey}
      />
      <div className="canvas-events-rail">
        {cards.map((card) => {
          const effectiveTop = getStickyCardTop(card, viewportTop, scale);
          const isActive =
            activeEventKey === card.key || card.eventIndex === selectedIndex;
          return (
            <div
              key={card.key}
              className={`canvas-summary-card${isActive ? " is-active" : ""}`}
              style={{
                top: `${effectiveTop}px`,
                height: `${card.cardHeight}px`,
                transition: isAnimating ? "top 320ms ease" : undefined,
              }}
              onMouseEnter={() => onCardEnter(card.key)}
              onMouseLeave={() => onCardLeave(card.key)}
              onClick={() => onCardClick(card.eventIndex)}
              title={card.name}
            >
              <div className="canvas-summary-card-topic">{card.name}</div>
              <div className="canvas-summary-card-text">{card.preview}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
