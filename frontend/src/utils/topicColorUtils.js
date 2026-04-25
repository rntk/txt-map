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
 * Returns the top-level (root) segment of a topic path.
 * @param {string} topicName
 * @returns {string}
 */
function getRootTopicName(topicName) {
  const parts = String(topicName || "")
    .split(">")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[0] || "";
}

/**
 * Returns the depth of a topic path (0 for root, 1 for direct child, etc.).
 * @param {string} topicName
 * @returns {number}
 */
function getTopicDepth(topicName) {
  const parts = String(topicName || "")
    .split(">")
    .map((p) => p.trim())
    .filter(Boolean);
  return Math.max(0, parts.length - 1);
}

/**
 * Returns a muted pastel background color for a hierarchy node.
 * All descendants of the same root topic share the same hue;
 * saturation and lightness shift by depth to create a gradient effect.
 *
 * @param {string} topicName
 * @param {number} [depth] - Depth override; defaults to depth inferred from path.
 * @returns {string} CSS hsl color string
 */
export function getHierarchyTopicHighlightColor(topicName, depth) {
  const rootName = getRootTopicName(topicName);
  const hue = hashString(rootName) % 360;
  const d = depth !== undefined ? depth : getTopicDepth(topicName);
  const saturation = Math.max(25, 55 - d * 7);
  const lightness = Math.min(94, 78 + d * 4);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Returns a muted accent color for a hierarchy node.
 * All descendants of the same root topic share the same hue;
 * saturation and lightness shift by depth to create a gradient effect.
 *
 * @param {string} topicName
 * @param {number} [depth] - Depth override; defaults to depth inferred from path.
 * @returns {string} CSS hsl color string
 */
export function getHierarchyTopicAccentColor(topicName, depth) {
  const rootName = getRootTopicName(topicName);
  const hue = hashString(rootName) % 360;
  const d = depth !== undefined ? depth : getTopicDepth(topicName);
  const saturation = Math.max(30, 60 - d * 6);
  const lightness = Math.min(62, 38 + d * 6);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
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
