/**
 * @param {number} value
 * @returns {number}
 */
function clampRate(value) {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.max(0, Math.min(100, value));
}

/**
 * @param {number} start
 * @param {number} end
 * @param {number} amount
 * @returns {number}
 */
function interpolate(start, end, amount) {
  return Math.round(start + (end - start) * amount);
}

/**
 * Return a blue -> neutral -> red color for a topic temperature rate.
 *
 * @param {number} rate
 * @returns {string}
 */
export function getTemperatureColor(rate) {
  const normalized = clampRate(Number(rate)) / 100;
  const blue = { r: 73, g: 126, b: 220 };
  const neutral = { r: 226, g: 229, b: 235 };
  const red = { r: 220, g: 79, b: 73 };
  const start = normalized <= 0.5 ? blue : neutral;
  const end = normalized <= 0.5 ? neutral : red;
  const amount = normalized <= 0.5 ? normalized * 2 : (normalized - 0.5) * 2;

  return `rgba(${interpolate(start.r, end.r, amount)}, ${interpolate(
    start.g,
    end.g,
    amount,
  )}, ${interpolate(start.b, end.b, amount)}, 0.58)`;
}
