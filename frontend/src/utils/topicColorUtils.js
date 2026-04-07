/**
 * Deterministic color utilities for per-topic highlighting.
 * The same topic name always produces the same color.
 */

/**
 * @param {string} value
 * @returns {number} Non-negative integer hash
 */
function hashString(value) {
  let hash = 0;
  const input = String(value || "");
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Returns a muted pastel background color for a topic name.
 * Color is deterministic — the same name always yields the same hue.
 *
 * @param {string} topicName
 * @returns {string} CSS hsl color string
 */
export function getTopicHighlightColor(topicName) {
  const hue = hashString(topicName) % 360;
  return `hsl(${hue}, 40%, 85%)`;
}

/**
 * Returns a stable muted accent color for topic markers and borders.
 *
 * @param {string} topicName
 * @returns {string} CSS hsl color string
 */
export function getTopicAccentColor(topicName) {
  const hue = hashString(topicName) % 360;
  return `hsl(${hue}, 42%, 46%)`;
}

/**
 * Returns a stable CSS class name for a topic's highlight color.
 * Safe to use as a CSS selector.
 *
 * @param {string} topicName
 * @returns {string}
 */
export function getTopicCSSClass(topicName) {
  return `tc-hl-${hashString(topicName)}`;
}
