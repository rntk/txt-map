import React from "react";
import { getRailCardPlacements } from "./stickyCards";
import RailConnectors from "./RailConnectors";
import { getZoomAdjustedFontSize } from "./utils";
import {
  DEFAULT_TOPIC_TAG_VISIBLE_COUNT,
  TOPIC_TAGS_PER_LOAD,
} from "./useTopicTagsLayout";

const TOPIC_TAGS_RAIL_LANE_GAP = 12;

/**
 * @param {{
 *   topicTagsLayout: {
 *     cards: Array<{
 *       key: string,
 *       topicName: string,
 *       fullPath: string,
 *       sentenceNumbers: number[],
 *       sentenceStart: number,
 *       sentenceEnd: number,
 *       tags: Array<{tag: string, score: number}>,
 *       visibleTagCount: number,
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
 *   onLoadMore: (key: string, nextCount: number) => void,
 *   translate: {x: number, y: number},
 *   scale: number,
 *   isAnimating: boolean,
 * }} props
 */
export default function CanvasTopicTagsRail({
  topicTagsLayout,
  activeTopicKey,
  onCardEnter,
  onCardLeave,
  onCardClick,
  onLoadMore,
  translate,
  scale,
  isAnimating,
}) {
  const { cards = [], articleRight = 0, articleHeight = 0 } = topicTagsLayout;
  const railLeft = articleRight + 83;
  const railWidth = getZoomAdjustedFontSize(scale, 320);
  const nameFontSize = getZoomAdjustedFontSize(scale, 10);
  const metaFontSize = getZoomAdjustedFontSize(scale, 9);
  const tagFontSize = getZoomAdjustedFontSize(scale, 10);

  if (!cards || cards.length === 0) return null;

  const viewportTop = -translate.y / scale;
  const placedCards = getRailCardPlacements(cards, viewportTop, scale);
  const connectorCards = placedCards.map((card) => {
    const laneOffset = card.lane * (railWidth + TOPIC_TAGS_RAIL_LANE_GAP);
    return {
      ...card,
      connectorBulbX: articleRight + 80 + laneOffset,
    };
  });

  const handleLoadMore = (event, card) => {
    event.preventDefault();
    event.stopPropagation();
    const current = card.visibleTagCount || DEFAULT_TOPIC_TAG_VISIBLE_COUNT;
    onLoadMore(
      card.key,
      Math.min(card.tags.length, current + TOPIC_TAGS_PER_LOAD),
    );
  };

  return (
    <>
      <RailConnectors
        name="topic-tags"
        cards={connectorCards}
        articleHeight={articleHeight}
        anchorX={articleRight}
        bulbX={articleRight + 80}
        viewportTop={viewportTop}
        scale={scale}
        activeKey={activeTopicKey}
      />
      <div
        className="canvas-topic-tags-rail"
        style={{
          left: `${railLeft}px`,
          "--canvas-topic-tags-rail-width": `${railWidth}px`,
          "--canvas-topic-tags-name-font-size": `${nameFontSize}px`,
          "--canvas-topic-tags-meta-font-size": `${metaFontSize}px`,
          "--canvas-topic-tags-tag-font-size": `${tagFontSize}px`,
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      >
        {placedCards.map((card) => {
          const laneOffset = card.lane * (railWidth + TOPIC_TAGS_RAIL_LANE_GAP);
          const visibleCount =
            card.visibleTagCount || DEFAULT_TOPIC_TAG_VISIBLE_COUNT;
          const visibleTags = card.tags.slice(0, visibleCount);
          const hiddenCount = Math.max(
            0,
            card.tags.length - visibleTags.length,
          );
          const isActive = activeTopicKey === card.key;
          return (
            <div
              key={card.key}
              role="button"
              tabIndex={0}
              className={`canvas-topic-tags-card${isActive ? " is-active" : ""}`}
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
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onCardClick(card.key);
              }}
              title={card.fullPath}
            >
              <span className="canvas-topic-tags-card__name">
                {card.topicName}
              </span>
              <span className="canvas-topic-tags-card__tags">
                {visibleTags.map(({ tag, score }) => (
                  <span key={tag} className="canvas-topic-tags-card__tag">
                    <span className="canvas-topic-tags-card__tag-text">
                      {tag}
                    </span>
                    <span className="canvas-topic-tags-card__score">
                      {score}
                    </span>
                  </span>
                ))}
              </span>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  className="canvas-topic-tags-card__load-more"
                  onClick={(event) => handleLoadMore(event, card)}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  Show more ({hiddenCount})
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
