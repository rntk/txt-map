import React from 'react';
import './WordSelectionPopup.css';

/**
 * @typedef {Object} WordSelectionPopupProps
 * @property {{ word: string, position: { x: number, y: number } }|null} selectionData
 * @property {string} submissionId
 */
function WordSelectionPopup({ selectionData, submissionId }) {
  if (!selectionData) return null;

  return (
    <div
      className="word-selection-popup"
      style={{
        '--word-selection-popup-left': `${selectionData.position.x}px`,
        '--word-selection-popup-top': `${selectionData.position.y}px`,
      }}
    >
      <button
        className="word-selection-popup__button"
        onClick={(e) => {
          e.stopPropagation();
          window.location.href = `/page/word/${submissionId}/${encodeURIComponent(selectionData.word)}`;
        }}
      >
        Explore Word: &ldquo;{selectionData.word}&rdquo;
      </button>
    </div>
  );
}

export default WordSelectionPopup;
