import { useState, useEffect, useRef } from 'react';

export function useContainerSize(defaultSize = 600) {
    const containerRef = useRef(null);
    const [containerSize, setContainerSize] = useState(defaultSize);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let resizeTimer;
        const ro = new ResizeObserver(entries => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const w = entries[0].contentRect.width;
                if (w > 0) setContainerSize(w);
            }, 150);
        });
        ro.observe(el);
        return () => {
            clearTimeout(resizeTimer);
            ro.disconnect();
        };
    }, []);

    return { containerRef, containerSize };
}
