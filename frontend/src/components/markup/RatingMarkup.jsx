import React from "react";
import HighlightedText from "../shared/HighlightedText";

/**
 * Parses a score string and extracts numeric value and max
 * Supports formats like "8/10", "4/5", "A+", "7.5"
 * @param {string} score - Score string
 * @returns {object} - Parsed score info
 */
function parseScore(score) {
  if (!score || typeof score !== "string") {
    return { value: 0, max: 10, display: score || "" };
  }

  // Try to match patterns like "8/10", "4/5", "7.5/10"
  const match = score.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/);
  if (match) {
    return {
      value: parseFloat(match[1]),
      max: parseInt(match[2], 10),
      display: match[1],
    };
  }

  // Try to extract just a number
  const numMatch = score.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const value = parseFloat(numMatch[1]);
    return {
      value,
      max: value <= 5 ? 5 : 10,
      display: score,
    };
  }

  return { value: 0, max: 10, display: score };
}

/**
 * Generates star rating visualization
 * @param {number} value - Current score value
 * @param {number} max - Maximum score
 * @returns {Array} - Array of star states
 */
function generateStars(value, max) {
  // Normalize to 5-star scale
  const normalizedValue = (value / max) * 5;
  const fullStars = Math.floor(normalizedValue);
  const hasHalfStar = normalizedValue % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  const stars = [];
  for (let i = 0; i < fullStars; i++) {
    stars.push("full");
  }
  if (hasHalfStar) {
    stars.push("half");
  }
  for (let i = 0; i < emptyStars; i++) {
    stars.push("empty");
  }
  return stars;
}

/**
 * RatingMarkup - Displays scored evaluation with visualization
 * Features score badge, star rating, and accessibility attributes
 */
export default function RatingMarkup({ segment }) {
  const { score, label, verdict } = segment.data || {};
  if (!score) return null;

  const parsed = parseScore(score);
  const stars = generateStars(parsed.value, parsed.max);

  return (
    <div
      className="markup-segment markup-rating"
      role="region"
      aria-label={`Rating: ${parsed.display} out of ${parsed.max}`}
    >
      <div className="markup-rating__score-badge">
        <span className="markup-rating__score" aria-hidden="true">
          {parsed.display}
        </span>
        <span className="markup-rating__score-max" aria-hidden="true">
          /{parsed.max}
        </span>
      </div>
      <div className="markup-rating__body">
        {label && (
          <div className="markup-rating__label">
            <HighlightedText text={label} />
          </div>
        )}
        {verdict && (
          <div className="markup-rating__verdict">
            <HighlightedText text={verdict} />
          </div>
        )}
        <div
          className="markup-rating__stars"
          role="img"
          aria-label={`${parsed.display} out of ${parsed.max} stars`}
        >
          {stars.map((star, i) => (
            <span
              key={i}
              className={`markup-rating__star ${star === "empty" ? "markup-rating__star--empty" : ""}`}
              aria-hidden="true"
            >
              {star === "full" ? "★" : star === "half" ? "½" : "☆"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
