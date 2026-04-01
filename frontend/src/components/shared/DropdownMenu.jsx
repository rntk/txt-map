import React, { useEffect, useRef, useState } from 'react';
import './sharedControls.css';

/**
 * @typedef {Object} DropdownMenuProps
 * @property {React.ReactNode} buttonContent
 * @property {React.ReactNode} children
 */

/**
 * @param {DropdownMenuProps} props
 */
function DropdownMenu({ buttonContent, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="shared-control-dropdown">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`shared-control-trigger${isOpen ? ' shared-control-trigger--active' : ''}`}
      >
        {buttonContent}
      </button>
      {isOpen && (
        <div className="shared-control-popover shared-control-popover--menu" role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

export default DropdownMenu;
