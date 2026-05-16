import React from "react";
import { getRailCardPlacements } from "./stickyCards";
import RailConnectors from "./RailConnectors";

const TAG_TOPICS_CARD_WIDTH = 280;
const TAG_TOPICS_RAIL_LANE_GAP = 12;

/**
 * Renders topic cards for sentences containing the selected tag.
 * @param {{
 *   tagTopicsLayout: {
 *     cards: Array<{
 *       key: string,
 *       topicName: string,
 *       fullPath: string,
 *       sentences: number[],
 *       preview: string,
 *       summaryText?: string,
 *       cardY: number,
 *       cardHeight: number,
 *       startY: number,
 *       endY: number,
 *     }>,
 *     articleRight?: number,
 *     articleHeight?: number,
 *   },
 *   activeTopicKey: string | null,
 *   onCardEnter: (key: string) => void,
 *   onCardLeave: (key: string) => void,
 *   onCardClick: (key: string) => void,
 *   onMoveToTagsCloud?: () => void,
 *   onPrevHighlight?: () => void,
 *   onNextHighlight?: () => void,
 *   translate: {x: number, y: number},
 *   scale: number,
 *   isAnimating: boolean,
 * }} props
 */
export default function CanvasTagTopicsRail({
  tagTopicsLayout,
  activeTopicKey,
  onCardEnter,
  onCardLeave,
  onCardClick,
  onMoveToTagsCloud,
  onPrevHighlight,
  onNextHighlight,
  translate,
  scale,
  isAnimating,
}) {
  const { cards = [], articleRight = 0, articleHeight = 0 } = tagTopicsLayout;

  if (cards.length === 0 && !onMoveToTagsCloud) return null;

  const viewportTop = -translate.y / scale;
  const returnButtonTop = Math.max(0, viewportTop + 12 / scale);
  const placedCards = getRailCardPlacements(cards, viewportTop, scale);
  const connectorCards = placedCards.map((card) => {
    const laneOffset =
      card.lane * (TAG_TOPICS_CARD_WIDTH + TAG_TOPICS_RAIL_LANE_GAP);
    return {
      ...card,
      connectorBulbX: articleRight + 80 + laneOffset,
    };
  });

  return (
    <>
      <RailConnectors
        name="tag-topics"
        cards={connectorCards}
        articleHeight={articleHeight}
        anchorX={articleRight}
        bulbX={articleRight + 80}
        viewportTop={viewportTop}
        scale={scale}
        activeKey={activeTopicKey}
      />
      <div
        className="canvas-tag-topics-rail"
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      >
        {onMoveToTagsCloud && (
          <button
            type="button"
            className="canvas-tag-topics-return"
            style={{
              top: `${returnButtonTop}px`,
              transition: isAnimating ? "top 320ms ease" : undefined,
            }}
            onClick={onMoveToTagsCloud}
          >
            move to tags cloud
          </button>
        )}
        {(onPrevHighlight || onNextHighlight) && cards.length > 0 && (
          <div
            className="canvas-tag-topics-nav"
            style={{
              top: `${returnButtonTop + 40}px`,
              transition: isAnimating ? "top 320ms ease" : undefined,
            }}
          >
            <button
              type="button"
              className="canvas-tag-topics-nav__button"
              onClick={onPrevHighlight}
              disabled={!onPrevHighlight}
              aria-label="Previous highlight"
              title="Previous highlight"
            >
              ↑
            </button>
            <button
              type="button"
              className="canvas-tag-topics-nav__button"
              onClick={onNextHighlight}
              disabled={!onNextHighlight}
              aria-label="Next highlight"
              title="Next highlight"
            >
              ↓
            </button>
          </div>
        )}
        {placedCards.map((card) => {
          const laneOffset =
            card.lane * (TAG_TOPICS_CARD_WIDTH + TAG_TOPICS_RAIL_LANE_GAP);
          const isActive = activeTopicKey === card.key;
          const summaryText = card.summaryText || card.preview;

          return (
            <button
              key={card.key}
              type="button"
              className={`canvas-tag-topic-card${isActive ? " is-active" : ""}`}
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
              onClick={() => onCardClick(card.key)}
              title={card.fullPath}
            >
              <span className="canvas-tag-topic-card__name">
                {card.topicName}
              </span>
              <span className="canvas-tag-topic-card__preview">
                {summaryText}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
