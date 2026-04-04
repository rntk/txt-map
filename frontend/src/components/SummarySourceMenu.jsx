import React, { useEffect, useRef, useState } from "react";
import "./SummarySourceMenu.css";

/**
 * @typedef {Object} SummarySourceMenuMatch
 * @property {{ name?: string }} topic
 * @property {number} score
 * @property {number[]} sentenceIndices
 *
 * @typedef {Object} SummarySourceMenuProps
 * @property {SummarySourceMenuMatch[]} matches
 * @property {(topic: { name?: string }, sentenceIndices: number[]) => void} onSelect
 * @property {() => void} onClose
 * @property {number} x
 * @property {number} y
 */

/**
 * Position the source picker menu at the requested point and keep it in view.
 *
 * @param {SummarySourceMenuProps} props
 * @returns {React.ReactElement | null}
 */
function SummarySourceMenu({ matches, onSelect, onClose, x, y }) {
  const menuRef = useRef(null);
  const [adjustedPos, setAdjustedPos] = useState({ left: x, top: y });

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const handleMouseDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;

    let left = x;
    let top = y;

    if (left + rect.width + MARGIN > vw) {
      left = vw - rect.width - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;
    if (top + rect.height + MARGIN > vh) {
      top = vh - rect.height - MARGIN;
    }
    if (top < MARGIN) top = MARGIN;

    setAdjustedPos({ left, top });
  }, [x, y, matches]);

  if (!matches || matches.length === 0) return null;

  return (
    <div
      className="summary-source-menu"
      ref={menuRef}
      style={{
        "--summary-source-menu-left": `${adjustedPos.left}px`,
        "--summary-source-menu-top": `${adjustedPos.top}px`,
      }}
      role="menu"
    >
      <div className="summary-source-menu__title">Select topic:</div>
      <div className="summary-source-menu__items">
        {matches.map(({ topic, score, sentenceIndices }, i) => (
          <button
            key={i}
            className="summary-source-menu__item"
            role="menuitem"
            onClick={() => onSelect(topic, sentenceIndices)}
          >
            <span className="summary-source-menu__topic-name">
              {topic.name}
            </span>
            <span className="summary-source-menu__score">
              {Math.round(score * 100)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SummarySourceMenu;
