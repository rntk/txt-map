import { useState, useEffect, useRef } from "react";

export function useContainerSize(defaultWidth = 600, defaultHeight = 400) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(defaultWidth);
  const [containerHeight, setContainerHeight] = useState(defaultHeight);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let resizeTimer;
    const ro = new ResizeObserver((entries) => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const { width, height } = entries[0].contentRect;
        if (width > 0) setContainerWidth(width);
        if (height > 0) setContainerHeight(height);
      }, 150);
    });
    ro.observe(el);
    return () => {
      clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, []);

  return { containerRef, containerWidth, containerHeight };
}
