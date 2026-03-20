import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to detect and handle single-word text selection in the browser.
 * Returns an object with { word, position: { x, y } } if a word is selected, otherwise null.
 */
export function useTextSelection() {
  const [selectionData, setSelectionData] = useState(null);

  const handleMouseUp = useCallback((e) => {
    // We defer slightly to allow the browser to complete the selection
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString();

      // Check if text is precisely one word (allowing hyphens/apostrophes)
      // and not spanning multiple paragraphs or having spaces inside (except trailing/leading).
      const singleWordPattern = /^\s*([a-zA-ZÀ-ÿ0-9\-']+)\s*$/;
      const match = text.match(singleWordPattern);

      if (match && match[1].length > 1) {
        const word = match[1];
        
        // Get coordinates of the selection
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          // Position the tooltip slighty above the selection
          setSelectionData({
            word,
            position: {
              x: rect.left + rect.width / 2,
              y: rect.top - 8 // slightly above the text
            }
          });
          return;
        }
      }

      // If empty or invalid selection, or user clicked away
      if (!text.trim() || !match) {
        setSelectionData(null);
      }
    }, 10);
  }, []);

  const handleSelectionChange = useCallback(() => {
    // Clear selection if it is visibly removed by the user
    const selection = window.getSelection();
    if (!selection || !selection.toString().trim()) {
      setSelectionData(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleMouseUp, handleSelectionChange]);

  const clearSelection = useCallback(() => {
    setSelectionData(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return { selectionData, clearSelection };
}
