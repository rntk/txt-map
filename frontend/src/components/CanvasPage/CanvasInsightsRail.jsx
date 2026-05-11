import React from "react";
import { getStickyCardTop } from "./stickyCards";
import RailConnectors from "./RailConnectors";

/**
 * Renders SVG connector lines and floating insight cards on the LEFT side of
 * the article, aligned with their source sentences.
 * @param {{
 *   insightsLayout: {
 *     cards: Array<{
 *       key: string,
 *       name: string,
 *       topicNames: string[],
 *       sourceSentences: string[],
 *       midY: number,
 *       cardY: number,
 *       cardHeight: number,
 *       startY: number,
 *       endY: number,
 *     }>,
 *     articleLeft?: number,
 *     articleHeight?: number,
 *   },
 *   activeInsightKey: string | null,
 *   onCardEnter: (key: string) => void,
 *   onCardLeave: (key: string) => void,
 *   onCardClick: (key: string) => void,
 *   translate: {x: number, y: number},
 *   scale: number,
 *   isAnimating: boolean,
 * }} props
 */
export default function CanvasInsightsRail({
  insightsLayout,
  activeInsightKey,
  onCardEnter,
  onCardLeave,
  onCardClick,
  translate,
  scale,
  isAnimating,
}) {
  const { cards, articleLeft = 0, articleHeight = 0 } = insightsLayout;

  if (!cards || cards.length === 0) return null;

  const viewportTop = -translate.y / scale;

  return (
    <>
      <RailConnectors
        name="insights"
        cards={cards}
        articleHeight={articleHeight}
        anchorX={articleLeft}
        bulbX={articleLeft - 80}
        viewportTop={viewportTop}
        scale={scale}
        activeKey={activeInsightKey}
      />
      <div className="canvas-insights-rail">
        {cards.map((card) => {
          const effectiveTop = getStickyCardTop(card, viewportTop, scale);
          const isActive = activeInsightKey === card.key;
          const preview =
            card.sourceSentences[0] ||
            card.topicNames.map((n) => n.split(">").pop().trim()).join(", ") ||
            "";
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
              onClick={() => onCardClick(card.key)}
              title={card.name}
            >
              <div className="canvas-summary-card-topic">{card.name}</div>
              <div className="canvas-summary-card-text">{preview}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
