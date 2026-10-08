"use client";

import {
  useState,
  useCallback,
  useRef,
  MouseEvent,
  WheelEvent,
  TouchEvent,
} from "react";

interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

interface UseImageZoomOptions {
  /**
   * Returns the natural pixel dimensions of the currently displayed image.
   * When provided, double-tap / double-click zoom targets actual 1:1 pixels
   * (true 100%) instead of a fixed multiplier.
   */
  getNaturalSize?: () => { width: number; height: number } | null;
}

const MIN_SCALE = 1;
const DEFAULT_MAX_SCALE = 8;
const ZOOM_SENSITIVITY = 0.002;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST_PX = 30;

export function useImageZoom(options: UseImageZoomOptions = {}) {
  const [zoomState, setZoomState] = useState<ZoomState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Two-finger pinch anchor: distance + midpoint + scale/translate at the
  // moment the second finger first went down. All subsequent moves derive
  // from this baseline so the zoom tracks the fingers exactly.
  const pinchStart = useRef<{
    distance: number;
    midX: number;
    midY: number;
    scale: number;
    translateX: number;
    translateY: number;
  } | null>(null);
  // One-finger pan while zoomed.
  const touchPan = useRef<{ x: number; y: number } | null>(null);
  // Previous tap info — if the next tap lands close in space and time, it's
  // a double-tap and we zoom.
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  const isZoomed = zoomState.scale > 1.01;

  const getMaxScale = useCallback(() => {
    const natural = options.getNaturalSize?.();
    const container = containerRef.current;
    if (!natural || !container) return DEFAULT_MAX_SCALE;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return DEFAULT_MAX_SCALE;
    const fit = Math.min(
      rect.width / natural.width,
      rect.height / natural.height
    );
    // Allow at least enough zoom to reach true 1:1 pixels; keep the default
    // ceiling for small images where 1/fit is tiny.
    const oneToOne = fit > 0 ? 1 / fit : DEFAULT_MAX_SCALE;
    return Math.max(DEFAULT_MAX_SCALE, oneToOne);
  }, [options]);

  const resetZoom = useCallback(() => {
    setZoomState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const zoomAroundPoint = useCallback(
    (nextScaleRaw: number, clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relX = clientX - rect.left;
      const relY = clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      setZoomState((prev) => {
        const bounded = Math.min(
          getMaxScale(),
          Math.max(MIN_SCALE, nextScaleRaw)
        );
        if (bounded <= 1.001) {
          return { scale: 1, translateX: 0, translateY: 0 };
        }
        const ratio = bounded / prev.scale;
        return {
          scale: bounded,
          translateX:
            (prev.translateX - (relX - centerX)) * ratio + (relX - centerX),
          translateY:
            (prev.translateY - (relY - centerY)) * ratio + (relY - centerY),
        };
      });
    },
    [getMaxScale]
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = -e.deltaY * ZOOM_SENSITIVITY;
      setZoomState((prev) => {
        const container = containerRef.current;
        if (!container) return prev;
        const rect = container.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const next = Math.min(
          getMaxScale(),
          Math.max(MIN_SCALE, prev.scale * (1 + delta))
        );
        if (next <= 1.001) {
          return { scale: 1, translateX: 0, translateY: 0 };
        }
        const ratio = next / prev.scale;
        return {
          scale: next,
          translateX:
            (prev.translateX - (relX - centerX)) * ratio + (relX - centerX),
          translateY:
            (prev.translateY - (relY - centerY)) * ratio + (relY - centerY),
        };
      });
    },
    [getMaxScale]
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!isZoomed) return;
      e.preventDefault();
      isDragging.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
    },
    [isZoomed]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current || !isZoomed) return;

      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };

      setZoomState((prev) => ({
        ...prev,
        translateX: prev.translateX + dx,
        translateY: prev.translateY + dy,
      }));
    },
    [isZoomed]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Toggle: zoomed → reset; not zoomed → jump to 100% centered on the tap
  // point (or 2.5x fallback if we don't know the natural size).
  const toggleAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (isZoomed) {
        resetZoom();
        return;
      }
      const natural = options.getNaturalSize?.();
      const container = containerRef.current;
      let target = 2.5;
      if (natural && container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const fit = Math.min(
            rect.width / natural.width,
            rect.height / natural.height
          );
          if (fit > 0) target = 1 / fit;
        }
      }
      zoomAroundPoint(target, clientX, clientY);
    },
    [isZoomed, resetZoom, zoomAroundPoint, options]
  );

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      toggleAtPoint(e.clientX, e.clientY);
    },
    [toggleAtPoint]
  );

  /**
   * Touch handlers return `true` when the gesture is "ours" (pinch, pan,
   * double-tap) so the host component can skip its own swipe / nav logic.
   * Returning `false` means the touch is a plain single-finger drag on a
   * non-zoomed image — the parent is free to interpret it as a swipe.
   */
  const handleTouchStart = useCallback(
    (e: TouchEvent): boolean => {
      if (e.touches.length >= 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t1.clientX - t0.clientX;
        const dy = t1.clientY - t0.clientY;
        pinchStart.current = {
          distance: Math.hypot(dx, dy) || 1,
          midX: (t0.clientX + t1.clientX) / 2,
          midY: (t0.clientY + t1.clientY) / 2,
          scale: zoomState.scale,
          translateX: zoomState.translateX,
          translateY: zoomState.translateY,
        };
        touchPan.current = null;
        lastTap.current = null;
        return true;
      }
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const now = Date.now();
        const prev = lastTap.current;
        if (
          prev &&
          now - prev.time < DOUBLE_TAP_MS &&
          Math.hypot(t.clientX - prev.x, t.clientY - prev.y) <
            DOUBLE_TAP_DIST_PX
        ) {
          lastTap.current = null;
          toggleAtPoint(t.clientX, t.clientY);
          return true;
        }
        lastTap.current = { time: now, x: t.clientX, y: t.clientY };

        if (isZoomed) {
          touchPan.current = { x: t.clientX, y: t.clientY };
          return true;
        }
      }
      return false;
    },
    [zoomState, isZoomed, toggleAtPoint]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent): boolean => {
      if (e.touches.length >= 2 && pinchStart.current) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t1.clientX - t0.clientX;
        const dy = t1.clientY - t0.clientY;
        const distance = Math.hypot(dx, dy) || 1;

        const container = containerRef.current;
        if (!container) return true;
        const rect = container.getBoundingClientRect();
        const relX = pinchStart.current.midX - rect.left;
        const relY = pinchStart.current.midY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const max = getMaxScale();
        const nextRaw =
          pinchStart.current.scale * (distance / pinchStart.current.distance);
        const next = Math.min(max, Math.max(MIN_SCALE, nextRaw));
        const ratio = next / pinchStart.current.scale;
        setZoomState({
          scale: next,
          translateX:
            (pinchStart.current.translateX - (relX - centerX)) * ratio +
            (relX - centerX),
          translateY:
            (pinchStart.current.translateY - (relY - centerY)) * ratio +
            (relY - centerY),
        });
        return true;
      }
      if (e.touches.length === 1 && touchPan.current) {
        const t = e.touches[0];
        const dx = t.clientX - touchPan.current.x;
        const dy = t.clientY - touchPan.current.y;
        touchPan.current = { x: t.clientX, y: t.clientY };
        setZoomState((prev) => ({
          ...prev,
          translateX: prev.translateX + dx,
          translateY: prev.translateY + dy,
        }));
        return true;
      }
      return false;
    },
    [getMaxScale]
  );

  const handleTouchEnd = useCallback((e: TouchEvent): boolean => {
    const wasActive = !!pinchStart.current || !!touchPan.current;
    if (e.touches.length < 2) pinchStart.current = null;
    if (e.touches.length === 0) touchPan.current = null;
    // Pinch-out below the minimum scale → snap cleanly back to 1x and
    // recentered, instead of leaving a near-1 scale with stale translation.
    setZoomState((prev) =>
      prev.scale <= 1.01 ? { scale: 1, translateX: 0, translateY: 0 } : prev
    );
    return wasActive;
  }, []);

  return {
    zoomState,
    isZoomed,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    resetZoom,
    containerRef,
  };
}
