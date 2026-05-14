import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampCanvasScale,
  getCursorAnchoredTranslate,
  getZoomAdjustedTopicTitleFontSize,
  WHEEL_ZOOM_IN_FACTOR,
  WHEEL_ZOOM_OUT_FACTOR,
} from "./utils";

/**
 * Hook that manages canvas transform (scale + translate) state,
 * drag/touch/pinch handling, wheel zoom, and keyboard navigation.
 * @param {{ contentRef?: React.RefObject<HTMLElement> }} [options]
 *   contentRef – used to calculate the accurate "bottom" position when
 *   navigating to the end of the canvas content.
 */
export function useCanvasTransform({ contentRef } = {}) {
  const [translate, setTranslate] = useState({ x: 40, y: 40 });
  const [scale, setScale] = useState(1);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const [isFocusingHighlight, setIsFocusingHighlight] = useState(false);

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const canvasWrapRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 40, y: 40 });
  const transformFrameRef = useRef(0);
  const pendingTransformRef = useRef(null);
  const userMovedCanvasRef = useRef(false);
  const smoothZoomTimerRef = useRef(null);
  const cleanupDragRef = useRef(null);

  // Touch / pinch state
  const isTouchDragging = useRef(false);
  const lastTouch = useRef({ x: 0, y: 0 });
  const touchDragStart = useRef({ x: 0, y: 0 });
  const touchHasMoved = useRef(false);
  const pinchState = useRef(null);

  useEffect(() => {
    return () => {
      if (transformFrameRef.current) {
        window.cancelAnimationFrame(transformFrameRef.current);
      }
      if (cleanupDragRef.current) {
        cleanupDragRef.current();
        cleanupDragRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  useEffect(() => {
    if (isCanvasDragging) {
      document.body.classList.add("canvas-global-dragging");
    } else {
      document.body.classList.remove("canvas-global-dragging");
    }
    return () => {
      document.body.classList.remove("canvas-global-dragging");
    };
  }, [isCanvasDragging]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    viewport.style.setProperty("--canvas-translate-x", `${translate.x}px`);
    viewport.style.setProperty("--canvas-translate-y", `${translate.y}px`);
    viewport.style.setProperty("--canvas-scale", `${scale}`);
    viewport.style.setProperty(
      "--canvas-topic-title-font-size",
      `${getZoomAdjustedTopicTitleFontSize(scale)}px`,
    );
  }, [scale, translate.x, translate.y]);

  const cancelPendingCanvasTransform = useCallback(() => {
    if (transformFrameRef.current) {
      window.cancelAnimationFrame(transformFrameRef.current);
      transformFrameRef.current = 0;
    }
    pendingTransformRef.current = null;
  }, []);

  const setCanvasTransformNow = useCallback(
    (nextScale, nextTranslate) => {
      cancelPendingCanvasTransform();
      scaleRef.current = nextScale;
      translateRef.current = nextTranslate;
      setScale(nextScale);
      setTranslate(nextTranslate);
    },
    [cancelPendingCanvasTransform],
  );

  const scheduleCanvasTransform = useCallback((nextScale, nextTranslate) => {
    scaleRef.current = nextScale;
    translateRef.current = nextTranslate;
    pendingTransformRef.current = {
      scale: nextScale,
      translate: nextTranslate,
    };

    if (transformFrameRef.current) return;

    transformFrameRef.current = window.requestAnimationFrame(() => {
      transformFrameRef.current = 0;
      const pendingTransform = pendingTransformRef.current;
      pendingTransformRef.current = null;
      if (!pendingTransform) return;

      setScale(pendingTransform.scale);
      setTranslate(pendingTransform.translate);
    });
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      if (cleanupDragRef.current) {
        cleanupDragRef.current();
        cleanupDragRef.current = null;
      }

      setIsFocusingHighlight(false);
      setIsCanvasDragging(true);
      isDragging.current = true;
      userMovedCanvasRef.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();

      const onWindowMouseMove = (moveEvent) => {
        if (!isDragging.current) return;
        const dx = moveEvent.clientX - lastMouse.current.x;
        const dy = moveEvent.clientY - lastMouse.current.y;
        lastMouse.current = { x: moveEvent.clientX, y: moveEvent.clientY };
        scheduleCanvasTransform(scaleRef.current || 1, {
          x: translateRef.current.x + dx,
          y: translateRef.current.y + dy,
        });
      };

      const onWindowMouseUp = () => {
        isDragging.current = false;
        setIsCanvasDragging(false);
        window.removeEventListener("mousemove", onWindowMouseMove);
        window.removeEventListener("mouseup", onWindowMouseUp);
        cleanupDragRef.current = null;
      };

      window.addEventListener("mousemove", onWindowMouseMove);
      window.addEventListener("mouseup", onWindowMouseUp);
      cleanupDragRef.current = () => {
        window.removeEventListener("mousemove", onWindowMouseMove);
        window.removeEventListener("mouseup", onWindowMouseUp);
      };
    },
    [scheduleCanvasTransform],
  );

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const wrap = canvasWrapRef.current;
      if (!wrap) return;

      const currentScale = scaleRef.current || 1;
      const delta = e.deltaY > 0 ? WHEEL_ZOOM_OUT_FACTOR : WHEEL_ZOOM_IN_FACTOR;
      const nextScale = clampCanvasScale(currentScale * delta);
      if (nextScale === currentScale) return;

      const wrapRect = wrap.getBoundingClientRect();
      const nextTranslate = getCursorAnchoredTranslate({
        cursor: {
          x: e.clientX - wrapRect.left,
          y: e.clientY - wrapRect.top,
        },
        translate: translateRef.current,
        currentScale,
        nextScale,
      });

      setIsFocusingHighlight(false);
      userMovedCanvasRef.current = true;
      scheduleCanvasTransform(nextScale, nextTranslate);
    },
    [scheduleCanvasTransform],
  );

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    const viewport = canvasViewportRef.current;
    if (!wrap || !viewport) return;
    const update = () => {
      viewport.style.setProperty(
        "--canvas-area-height",
        `${wrap.clientHeight}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const getTouchDistance = useCallback((touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getTouchMidpoint = useCallback(
    (touches) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    }),
    [],
  );

  const handleTouchStart = useCallback(
    (e) => {
      const touches = e.touches;
      if (touches.length === 1) {
        touchDragStart.current = {
          x: touches[0].clientX,
          y: touches[0].clientY,
        };
        lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
        isTouchDragging.current = true;
        touchHasMoved.current = false;
        setIsFocusingHighlight(false);
        userMovedCanvasRef.current = true;
      } else if (touches.length === 2) {
        isTouchDragging.current = false;
        touchHasMoved.current = false;
        setIsCanvasDragging(false);
        pinchState.current = {
          startDistance: getTouchDistance(touches),
          startScale: scaleRef.current || 1,
          startTranslate: { ...translateRef.current },
        };
        setIsFocusingHighlight(false);
        userMovedCanvasRef.current = true;
      }
    },
    [getTouchDistance],
  );

  const handleTouchMove = useCallback(
    (e) => {
      const touches = e.touches;
      if (pinchState.current && touches.length === 2) {
        e.preventDefault();
        const { startDistance, startScale, startTranslate } =
          pinchState.current;
        const newDistance = getTouchDistance(touches);
        if (startDistance === 0) return;
        const nextScale = clampCanvasScale(
          startScale * (newDistance / startDistance),
        );
        const wrap = canvasWrapRef.current;
        if (!wrap) return;
        const wrapRect = wrap.getBoundingClientRect();
        const midpoint = getTouchMidpoint(touches);
        const cursor = {
          x: midpoint.x - wrapRect.left,
          y: midpoint.y - wrapRect.top,
        };
        const nextTranslate = getCursorAnchoredTranslate({
          cursor,
          translate: startTranslate,
          currentScale: startScale,
          nextScale,
        });
        scheduleCanvasTransform(nextScale, nextTranslate);
      } else if (isTouchDragging.current && touches.length === 1) {
        const dx = touches[0].clientX - touchDragStart.current.x;
        const dy = touches[0].clientY - touchDragStart.current.y;
        if (!touchHasMoved.current) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 6) return;
          touchHasMoved.current = true;
          setIsCanvasDragging(true);
        }
        e.preventDefault();
        const moveDx = touches[0].clientX - lastTouch.current.x;
        const moveDy = touches[0].clientY - lastTouch.current.y;
        lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
        scheduleCanvasTransform(scaleRef.current || 1, {
          x: translateRef.current.x + moveDx,
          y: translateRef.current.y + moveDy,
        });
      }
    },
    [getTouchDistance, getTouchMidpoint, scheduleCanvasTransform],
  );

  const handleTouchEnd = useCallback((e) => {
    const touches = e.touches;
    if (touches.length === 0) {
      isTouchDragging.current = false;
      setIsCanvasDragging(false);
      pinchState.current = null;
      touchHasMoved.current = false;
    } else if (touches.length === 1 && pinchState.current) {
      pinchState.current = null;
      isTouchDragging.current = true;
      touchHasMoved.current = false;
      touchDragStart.current = {
        x: touches[0].clientX,
        y: touches[0].clientY,
      };
      lastTouch.current = { x: touches[0].clientX, y: touches[0].clientY };
    } else if (touches.length < 2) {
      pinchState.current = null;
    }
  }, []);

  const flashFocus = useCallback(() => {
    setIsFocusingHighlight(true);
    if (smoothZoomTimerRef.current) {
      clearTimeout(smoothZoomTimerRef.current);
    }
    smoothZoomTimerRef.current = setTimeout(() => {
      setIsFocusingHighlight(false);
    }, 380);
  }, []);

  const navigateCanvas = useCallback(
    (pos) => {
      const wrap = canvasWrapRef.current;
      if (!wrap) return;

      const currentScale = scaleRef.current || 1;
      const wrapRect = wrap.getBoundingClientRect();
      const viewportHeight = wrap.clientHeight || wrapRect.height || 0;
      const pageStep = Math.max(120, viewportHeight * 0.8);
      const topY = 40;

      userMovedCanvasRef.current = true;
      const currentTranslate = translateRef.current;
      let nextY = currentTranslate.y;
      if (pos === "top") {
        nextY = topY;
      } else if (pos === "bottom") {
        const viewport = canvasViewportRef.current;
        // `contentRef` is expected to point at whichever element currently
        // hosts the article body (the regular article view OR the summary
        // view — both attach the same ref). Don't add a separate
        // summaryWrapRef fallback here; that historical fallback was dead.
        const content = contentRef?.current;
        if (viewport && content) {
          const viewportRect = viewport.getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          const scaledContentBottom = contentRect.bottom - viewportRect.top;
          nextY = Math.min(topY, viewportHeight - scaledContentBottom - topY);
        } else {
          nextY = currentTranslate.y - pageStep;
        }
      } else if (pos === "prev") {
        nextY = currentTranslate.y + pageStep;
      } else if (pos === "next") {
        nextY = currentTranslate.y - pageStep;
      }

      setCanvasTransformNow(currentScale, { ...currentTranslate, y: nextY });
      flashFocus();
    },
    [setCanvasTransformNow, contentRef, flashFocus],
  );

  const panByStep = useCallback(
    (dx, dy) => {
      const currentScale = scaleRef.current || 1;
      const currentTranslate = translateRef.current;
      userMovedCanvasRef.current = true;
      setCanvasTransformNow(currentScale, {
        x: currentTranslate.x + dx,
        y: currentTranslate.y + dy,
      });
      flashFocus();
    },
    [setCanvasTransformNow, flashFocus],
  );

  useEffect(() => {
    const ARROW_STEP = 80;
    const handleKeyDownGlobal = (e) => {
      const target = e.target;
      const tagName = target?.tagName;
      const isEditable =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.isContentEditable;
      if (isEditable) return;

      if (e.key === "Home") {
        e.preventDefault();
        navigateCanvas("top");
      } else if (e.key === "End") {
        e.preventDefault();
        navigateCanvas("bottom");
      } else if (e.key === "PageUp") {
        e.preventDefault();
        navigateCanvas("prev");
      } else if (e.key === "PageDown") {
        e.preventDefault();
        navigateCanvas("next");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        panByStep(0, ARROW_STEP);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        panByStep(0, -ARROW_STEP);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        panByStep(ARROW_STEP, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        panByStep(-ARROW_STEP, 0);
      }
    };
    window.addEventListener("keydown", handleKeyDownGlobal);
    return () => window.removeEventListener("keydown", handleKeyDownGlobal);
  }, [navigateCanvas, panByStep]);

  /**
   * Centers the canvas viewport on `targetRect` (a DOM client rect) and
   * optionally zooms in. Passing `zoomLevel <= currentScale` keeps the
   * current scale; otherwise zooms to `zoomLevel` (clamped). Triggers
   * `flashFocus` so the focus-highlight CSS plays.
   */
  const zoomToTarget = useCallback(
    (targetRect, zoomLevel = 1.4) => {
      const wrap = canvasWrapRef.current;
      const viewport = canvasViewportRef.current;
      if (!wrap || !viewport || !targetRect) return;

      const wrapRect = wrap.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const currentScale = scaleRef.current || 1;
      const nextScale = clampCanvasScale(Math.max(currentScale, zoomLevel));

      const localTargetY =
        (targetRect.top + targetRect.height / 2 - viewportRect.top) /
        currentScale;

      let nextX;
      const content = contentRef?.current;
      if (content) {
        // Deterministic horizontal positioning: align the article/content
        // left edge to a fixed margin (e.g. 40px) so it's always ready to read.
        const contentRect = content.getBoundingClientRect();
        const localContentX =
          (contentRect.left - viewportRect.left) / currentScale;
        nextX = 40 - localContentX * nextScale;
      } else {
        // Fallback: center horizontally on the target
        const localTargetX =
          (targetRect.left + targetRect.width / 2 - viewportRect.left) /
          currentScale;
        nextX = wrapRect.width / 2 - localTargetX * nextScale;
      }

      setCanvasTransformNow(nextScale, {
        x: nextX,
        y: wrapRect.height * 0.2 - localTargetY * nextScale,
      });
      flashFocus();
    },
    [setCanvasTransformNow, flashFocus, contentRef],
  );

  return {
    // State
    translate,
    scale,
    isCanvasDragging,
    isFocusingHighlight,
    userMovedCanvasRef,
    // Refs
    canvasWrapRef,
    canvasViewportRef,
    scaleRef,
    translateRef,
    // Mouse handlers
    handleMouseDown,
    // Touch handlers
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    // Actions
    setCanvasTransformNow,
    scheduleCanvasTransform,
    cancelPendingCanvasTransform,
    navigateCanvas,
    zoomToTarget,
    flashFocus,
  };
}
