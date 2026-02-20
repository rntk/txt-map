import React, { useEffect } from 'react';
import '../styles/App.css';

function FullScreenGraph({ children, onClose, title, toolbar }) {
  // Disable body scroll when mounted
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalOverflowX = document.body.style.overflowX;
    document.body.style.overflow = 'hidden';
    document.body.style.overflowX = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overflowX = originalOverflowX;
    };
  }, []);

  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fullscreen-graph-overlay" onClick={onClose}>
      <div className="fullscreen-graph-container" onClick={(e) => e.stopPropagation()}>
        <div className="fullscreen-graph-header">
          <div className="header-left">
            <h2 className="fullscreen-graph-title">{title}</h2>
            {toolbar && <div className="header-toolbar">{toolbar}</div>}
          </div>
          <button className="fullscreen-graph-close" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </div>
        <div className="fullscreen-graph-content">
          {children}
        </div>
      </div>
    </div>
  );
}

export default FullScreenGraph;
