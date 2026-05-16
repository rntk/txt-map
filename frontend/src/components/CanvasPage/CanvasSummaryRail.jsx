import React from "react";
import { getRailCardPlacements } from "./stickyCards";
import RailConnectors from "./RailConnectors";
import { getZoomAdjustedSummaryRailWidth } from "./utils";

const SUMMARY_RAIL_LANE_GAP = 12;

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
 *   onCardClick?: (card: {key: string, topicName: string}) => void,
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
  onCardClick,
  translate,
  scale,
  isAnimating,
}) {
  const { cards, articleRight = 0, articleHeight = 0 } = summaryLayout;

  if (!cards || cards.length === 0) return null;

  const viewportTop = -translate.y / scale;
  const placedCards = getRailCardPlacements(cards, viewportTop, scale);
  const cardWidth = getZoomAdjustedSummaryRailWidth(scale);
  const connectorCards = placedCards.map((card) => {
    const laneOffset = card.lane * (cardWidth + SUMMARY_RAIL_LANE_GAP);
    return {
      ...card,
      connectorBulbX: articleRight + 80 + laneOffset,
    };
  });

  return (
    <>
      <RailConnectors
        name="summary"
        cards={connectorCards}
        articleHeight={articleHeight}
        anchorX={articleRight}
        bulbX={articleRight + 80}
        viewportTop={viewportTop}
        scale={scale}
        activeKey={activeSummaryKey}
      />
      <div className="canvas-summary-rail">
        {placedCards.map((card) => {
          const laneOffset = card.lane * (cardWidth + SUMMARY_RAIL_LANE_GAP);
          return (
            <div
              key={card.key}
              className={`canvas-summary-card${activeSummaryKey === card.key ? " is-active" : ""}`}
              style={{
                top: `${card.effectiveTop}px`,
                right: laneOffset ? `-${laneOffset}px` : undefined,
                height: `${card.cardHeight}px`,
                transition: isAnimating
                  ? "top 320ms ease, right 320ms ease"
                  : undefined,
              }}
              onMouseEnter={() => onCardEnter(card.key)}
              onMouseLeave={() => onCardLeave(card.key)}
              onClick={onCardClick ? () => onCardClick(card) : undefined}
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
