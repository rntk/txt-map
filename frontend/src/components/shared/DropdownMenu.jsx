import React, { useState, useEffect, useRef } from 'react';

function DropdownMenu({ buttonContent, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        className="action-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', background: isOpen ? '#e0e0e0' : undefined, color: isOpen ? '#333' : undefined }}
      >
        {buttonContent}
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          padding: '8px',
          zIndex: 'var(--z-dropdown)',
          minWidth: '200px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          color: '#333',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default DropdownMenu;
