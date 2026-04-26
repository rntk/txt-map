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
 * drag handling, wheel zoom, and keyboard navigation.
 */
export function useCanvasTransform() {
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

  useEffect(() => {
    return () => {
      if (transformFrameRef.current) {
        window.cancelAnimationFrame(transformFrameRef.current);
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

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setIsFocusingHighlight(false);
    setIsCanvasDragging(true);
    isDragging.current = true;
    userMovedCanvasRef.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      scheduleCanvasTransform(scaleRef.current || 1, {
        x: translateRef.current.x + dx,
        y: translateRef.current.y + dy,
      });
    },
    [scheduleCanvasTransform],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    setIsCanvasDragging(false);
  }, []);

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

  const navigateCanvas = useCallback(
    (pos) => {
      const wrap = canvasWrapRef.current;
      if (!wrap) return;

      const currentScale = scaleRef.current || 1;
      const wrapRect = wrap.getBoundingClientRect();
      const viewportHeight = wrap.clientHeight || wrapRect.height || 0;
      const pageStep = Math.max(120, viewportHeight * 0.8);
      const topY = 40;

      setIsFocusingHighlight(false);
      userMovedCanvasRef.current = true;
      const currentTranslate = translateRef.current;
      let nextY = currentTranslate.y;
      if (pos === "top") nextY = topY;
      else if (pos === "bottom") nextY = currentTranslate.y - pageStep * 4;
      else if (pos === "prev") nextY = currentTranslate.y + pageStep;
      else if (pos === "next") nextY = currentTranslate.y - pageStep;

      setCanvasTransformNow(currentScale, { ...currentTranslate, y: nextY });
    },
    [setCanvasTransformNow],
  );

  useEffect(() => {
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
      }
    };
    window.addEventListener("keydown", handleKeyDownGlobal);
    return () => window.removeEventListener("keydown", handleKeyDownGlobal);
  }, [navigateCanvas]);

  const zoomToTarget = useCallback(
    (targetRect, zoomLevel = 1.4) => {
      const wrap = canvasWrapRef.current;
      const viewport = canvasViewportRef.current;
      if (!wrap || !viewport) return;

      const wrapRect = wrap.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const currentScale = scaleRef.current || 1;
      const nextScale = clampCanvasScale(Math.max(currentScale, zoomLevel));

      const localTargetX =
        (targetRect.left + targetRect.width / 2 - viewportRect.left) /
        currentScale;
      const localTargetY =
        (targetRect.top + targetRect.height / 2 - viewportRect.top) /
        currentScale;

      setIsFocusingHighlight(true);
      setCanvasTransformNow(nextScale, {
        x: wrapRect.width / 2 - localTargetX * nextScale,
        y: wrapRect.height / 2 - localTargetY * nextScale,
      });

      if (smoothZoomTimerRef.current) {
        clearTimeout(smoothZoomTimerRef.current);
      }
      smoothZoomTimerRef.current = setTimeout(() => {
        setIsFocusingHighlight(false);
      }, 380);
    },
    [setCanvasTransformNow],
  );

  return {
    // State
    translate,
    scale,
    isCanvasDragging,
    isFocusingHighlight,
    userMovedCanvasRef,
    smoothZoomTimerRef,
    // Refs
    canvasWrapRef,
    canvasViewportRef,
    scaleRef,
    translateRef,
    // Actions
    setCanvasTransformNow,
    scheduleCanvasTransform,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    navigateCanvas,
    zoomToTarget,
    setIsFocusingHighlight,
  };
}
