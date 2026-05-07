/** Screen-pixel margin from the viewport top when a card is sticky. */
const STICKY_MARGIN_SCREEN_PX = 20;

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
