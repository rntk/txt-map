import React from "react";
import { getItemIndex, getTextByIndex } from "./markupUtils";
import HighlightedText from "../shared/HighlightedText";

/**
 * Generates a consistent avatar initial from a speaker name
 * @param {string} name - Speaker name
 * @returns {string} - First letter or fallback
 */
function getAvatarInitial(name) {
  if (!name || typeof name !== "string") return "?";
  return name.trim().charAt(0).toUpperCase();
}

/**
 * Generates a consistent color for a speaker based on their name
 * Uses HSL to create visually distinct but harmonious colors
 * @param {string} name - Speaker name
 * @returns {string} - CSS gradient string
 */
function getSpeakerColor(name) {
  if (!name || typeof name !== "string") {
    return "linear-gradient(135deg, #1976d2, #0d47a1)";
  }
  // Generate hue from name hash (0-360)
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  // Use consistent saturation and lightness for harmony
  return `linear-gradient(135deg, hsl(${hue}, 70%, 45%), hsl(${hue}, 70%, 35%))`;
}

/**
 * DialogMarkup - Displays conversation between speakers
 * Features avatars, color-coded bubbles, and accessibility attributes
 */
/**
 * @typedef {Object} DialogMarkupProps
 * @property {{ data?: { speakers?: Array<{ name?: string, lines?: Array<{ text?: string, position_index?: number, sentence_index?: number }> }> } }} segment
 * @property {string[]} sentences
 */

/**
 * @param {DialogMarkupProps} props
 * @returns {React.ReactElement | null}
 */
export default function DialogMarkup({ segment, sentences }) {
  const speakers = segment.data?.speakers || [];
  if (speakers.length === 0) return null;

  // Build a flat ordered list of lines sorted by sentence_index
  const allLines = [];
  speakers.forEach((speaker, speakerIdx) => {
    (speaker.lines || []).forEach((line) => {
      allLines.push({
        speakerIdx,
        name: speaker.name || `Speaker ${speakerIdx + 1}`,
        ...line,
      });
    });
  });
  allLines.sort((a, b) => (getItemIndex(a) ?? 0) - (getItemIndex(b) ?? 0));

  // Get unique speakers for aria-label
  const uniqueSpeakerNames = [
    ...new Set(speakers.map((s) => s.name).filter(Boolean)),
  ];
  const dialogLabel =
    uniqueSpeakerNames.length > 0
      ? `Conversation between ${uniqueSpeakerNames.join(" and ")}`
      : "Conversation";

  return (
    <div
      className="markup-segment markup-dialog"
      role="region"
      aria-label={dialogLabel}
    >
      {allLines.map((line, i) => {
        const side = line.speakerIdx % 2 === 0 ? "even" : "odd";
        const text =
          line.text || getTextByIndex(sentences, getItemIndex(line)) || "";
        const speakerName = line.name || "Unknown";
        const avatarInitial = getAvatarInitial(speakerName);
        const avatarColor = getSpeakerColor(speakerName);

        return (
          <div
            key={i}
            className={`markup-dialog__line markup-dialog__line--${side}`}
            role="listitem"
          >
            <span className="markup-dialog__speaker">
              <span
                className="markup-dialog__speaker-avatar"
                style={{ "--markup-dialog-avatar-background": avatarColor }}
                aria-hidden="true"
              >
                {avatarInitial}
              </span>
              <HighlightedText text={speakerName} />
            </span>
            <div
              className={`markup-dialog__bubble markup-dialog__bubble--${side}`}
              role="text"
            >
              <HighlightedText text={text} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
