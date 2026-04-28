import React from "react";

/**
 * Renders the SVG connector lines and floating summary cards for the summary rail.
 * @param {{
 *   summaryLayout: {
 *     cards: Array<{key: string, midY: number, cardY: number, cardHeight: number, topicName: string, summaryText: string}>,
 *     articleRight?: number,
 *     articleHeight?: number,
 *   },
 *   activeSummaryKey: string | null,
 *   onCardEnter: (key: string) => void,
 *   onCardLeave: (key: string) => void,
 * }} props
 */
export default function CanvasSummaryRail({
  summaryLayout,
  activeSummaryKey,
  onCardEnter,
  onCardLeave,
}) {
  const { cards, articleRight = 0, articleHeight = 0 } = summaryLayout;

  if (!cards || cards.length === 0) return null;

  const svgHeight = Math.max(
    articleHeight,
    cards.length > 0 ? cards[cards.length - 1].cardY + 100 : 0,
  );

  return (
    <>
      <svg className="canvas-summary-connectors" style={{ height: svgHeight }}>
        {cards.map((card) => {
          const x1 = articleRight;
          const y1 = card.midY;
          const x2 = articleRight + 80;
          const y2 = card.cardY + card.cardHeight / 2;
          const cx1 = x1 + 30;
          const cx2 = x2 - 30;
          const isActive = activeSummaryKey === card.key;
          return (
            <g key={card.key}>
              <circle
                cx={x1}
                cy={y1}
                r={3}
                className={`canvas-summary-anchor${isActive ? " is-active" : ""}`}
              />
              <path
                d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                className={`canvas-summary-connector${isActive ? " is-active" : ""}`}
              />
              <circle
                cx={x2}
                cy={y2}
                r={4}
                className={`canvas-summary-bulb${isActive ? " is-active" : ""}`}
              />
            </g>
          );
        })}
      </svg>
      <div className="canvas-summary-rail">
        {cards.map((card) => (
          <div
            key={card.key}
            className={`canvas-summary-card${activeSummaryKey === card.key ? " is-active" : ""}`}
            style={{ top: `${card.cardY}px`, height: `${card.cardHeight}px` }}
            onMouseEnter={() => onCardEnter(card.key)}
            onMouseLeave={() => onCardLeave(card.key)}
            title={card.topicName}
          >
            <div className="canvas-summary-card-topic">{card.topicName}</div>
            <div className="canvas-summary-card-text">{card.summaryText}</div>
          </div>
        ))}
      </div>
    </>
  );
}
