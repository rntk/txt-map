/** Screen-pixel margin from the viewport top when a card is sticky. */
const STICKY_MARGIN_SCREEN_PX = 20;
const DEFAULT_RAIL_CARD_GAP = 10;
const DEFAULT_RAIL_LANE_LIMIT = 4;

/**
 * Computes the effective top position for a card, applying sticky-within-bounds
 * behavior while the panned view is inside the card's sentence range.
 *
 * @param {{ cardY: number, cardHeight: number, startY: number, endY: number }} card
 * @param {number} viewportTop - Viewport top in article coordinates (-translateY / scale).
 * @param {number} scale - Current canvas scale.
 * @returns {number}
 */
export function getStickyCardTop(card, viewportTop, scale) {
  const marginInArticle = STICKY_MARGIN_SCREEN_PX / scale;
  const desired = viewportTop + marginInArticle;
  const minTop = card.startY;
  const maxTop = Math.max(minTop, card.endY - card.cardHeight);
  return Math.min(Math.max(minTop, desired), maxTop);
}

/**
 * Places cards into horizontal lanes when their sticky positions would overlap.
 * Lane 0 keeps the normal rail position; higher lanes are shifted horizontally
 * by the rendering component. If every lane is occupied, the card is pushed down
 * in the least occupied lane so it still cannot collide.
 *
 * @param {Array<{key: string, cardY: number, cardHeight: number, startY: number, endY: number}>} cards
 * @param {number} viewportTop
 * @param {number} scale
 * @param {{gap?: number, laneLimit?: number}} [options]
 * @returns {Array<{key: string, cardY: number, cardHeight: number, startY: number, endY: number, effectiveTop: number, lane: number, laneCount: number}>}
 */
export function getRailCardPlacements(cards, viewportTop, scale, options = {}) {
  const gap = options.gap ?? DEFAULT_RAIL_CARD_GAP;
  const laneLimit = Math.max(1, options.laneLimit ?? DEFAULT_RAIL_LANE_LIMIT);
  const laneBottoms = [];
  const placedByIndex = new Map();

  const sortedCards = cards
    .map((card, index) => ({
      card,
      index,
      top: getStickyCardTop(card, viewportTop, scale),
    }))
    .sort((left, right) => {
      if (left.top !== right.top) return left.top - right.top;
      return left.index - right.index;
    });

  for (const item of sortedCards) {
    let lane = laneBottoms.findIndex((bottom) => bottom + gap <= item.top);
    let top = item.top;

    if (lane === -1 && laneBottoms.length < laneLimit) {
      lane = laneBottoms.length;
    }

    if (lane === -1) {
      lane = laneBottoms.reduce(
        (bestLane, bottom, index) =>
          bottom < laneBottoms[bestLane] ? index : bestLane,
        0,
      );
      top = Math.max(top, laneBottoms[lane] + gap);
    }

    laneBottoms[lane] = top + item.card.cardHeight;
    placedByIndex.set(item.index, {
      ...item.card,
      effectiveTop: top,
      lane,
      laneCount: laneBottoms.length,
    });
  }

  const laneCount = Math.max(1, laneBottoms.length);
  return cards.map((_, index) => ({
    ...placedByIndex.get(index),
    laneCount,
  }));
}
