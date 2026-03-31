import React from 'react';

/**
 * @typedef {Object} WordSelectionPopupProps
 * @property {{ word: string, position: { x: number, y: number } }|null} selectionData
 * @property {string} submissionId
 */
function WordSelectionPopup({ selectionData, submissionId }) {
  if (!selectionData) return null;

  return (
    <div style={{
      position: 'fixed',
      left: selectionData.position.x,
      top: selectionData.position.y,
      transform: 'translate(-50%, -100%)',
      zIndex: 1000,
      background: '#1976d2',
      padding: '4px 8px',
      borderRadius: '4px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
    }}>
      <button
        style={{ color: '#fff', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
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
