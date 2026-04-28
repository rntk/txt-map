import React from "react";

/** Screen-pixel margin from the viewport top when a card is sticky. */
const STICKY_MARGIN_SCREEN_PX = 20;

/**
 * Computes the effective top position for a card, applying sticky-within-bounds
 * behaviour: the card follows the viewport top while the panned view is inside
 * the card's sentence range, so it stays on screen during long-text navigation.
 *
 * @param {{ cardY: number, cardHeight: number, startY: number, endY: number }} card
 * @param {number} viewportTop - Viewport top in article coordinates (-translateY / scale).
 * @param {number} scale - Current canvas scale.
 * @returns {number}
 */
function getStickyTop(card, viewportTop, scale) {
  const marginInArticle = STICKY_MARGIN_SCREEN_PX / scale;
  const desired = viewportTop + marginInArticle;
  // Upper bound: the card must not slide past the bottom of its sentence range.
  const maxTop = Math.max(card.cardY, card.endY - card.cardHeight);
  // Lower bound: never float higher than the card's natural layout position.
  return Math.min(Math.max(card.cardY, desired), maxTop);
}

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
 * }} props
 */
export default function CanvasSummaryRail({
  summaryLayout,
  activeSummaryKey,
  onCardEnter,
  onCardLeave,
  translate,
  scale,
}) {
  const { cards, articleRight = 0, articleHeight = 0 } = summaryLayout;

  if (!cards || cards.length === 0) return null;

  const svgHeight = Math.max(
    articleHeight,
    cards.length > 0 ? cards[cards.length - 1].cardY + 100 : 0,
  );

  const viewportTop = -translate.y / scale;

  return (
    <>
      <svg className="canvas-summary-connectors" style={{ height: svgHeight }}>
        {cards.map((card) => {
          const effectiveTop = getStickyTop(card, viewportTop, scale);
          const connectorY = effectiveTop + card.cardHeight / 2;
          const x1 = articleRight;
          const x2 = articleRight + 80;
          const isActive = activeSummaryKey === card.key;
          return (
            <g key={card.key}>
              <circle
                cx={x1}
                cy={connectorY}
                r={3}
                className={`canvas-summary-anchor${isActive ? " is-active" : ""}`}
              />
              <line
                x1={x1}
                y1={connectorY}
                x2={x2}
                y2={connectorY}
                className={`canvas-summary-connector${isActive ? " is-active" : ""}`}
              />
              <circle
                cx={x2}
                cy={connectorY}
                r={4}
                className={`canvas-summary-bulb${isActive ? " is-active" : ""}`}
              />
            </g>
          );
        })}
      </svg>
      <div className="canvas-summary-rail">
        {cards.map((card) => {
          const effectiveTop = getStickyTop(card, viewportTop, scale);
          return (
            <div
              key={card.key}
              className={`canvas-summary-card${activeSummaryKey === card.key ? " is-active" : ""}`}
              style={{
                top: `${effectiveTop}px`,
                height: `${card.cardHeight}px`,
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
