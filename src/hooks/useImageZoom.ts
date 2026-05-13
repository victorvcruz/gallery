"use client";

import { useState, useCallback, useRef, MouseEvent, WheelEvent } from "react";

interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

interface UseImageZoomReturn {
  zoomState: ZoomState;
  isZoomed: boolean;
  handleWheel: (e: WheelEvent) => void;
  handleMouseDown: (e: MouseEvent) => void;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: () => void;
  handleDoubleClick: (e: MouseEvent) => void;
  resetZoom: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_SENSITIVITY = 0.002;

export function useImageZoom(): UseImageZoomReturn {
  const [zoomState, setZoomState] = useState<ZoomState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const isZoomed = zoomState.scale > 1.01;

  const resetZoom = useCallback(() => {
    setZoomState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setZoomState((prev) => {
      const delta = -e.deltaY * ZOOM_SENSITIVITY;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * (1 + delta)));

      if (newScale <= 1) {
        return { scale: 1, translateX: 0, translateY: 0 };
      }

      const scaleRatio = newScale / prev.scale;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const newTranslateX =
        (prev.translateX - (mouseX - centerX)) * scaleRatio + (mouseX - centerX);
      const newTranslateY =
        (prev.translateY - (mouseY - centerY)) * scaleRatio + (mouseY - centerY);

      return {
        scale: newScale,
        translateX: newTranslateX,
        translateY: newTranslateY,
      };
    });
  }, []);

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

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      if (isZoomed) {
        resetZoom();
      } else {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const newScale = 2.5;
        const newTranslateX = (centerX - mouseX) * (newScale - 1);
        const newTranslateY = (centerY - mouseY) * (newScale - 1);

        setZoomState({
          scale: newScale,
          translateX: newTranslateX,
          translateY: newTranslateY,
        });
      }
    },
    [isZoomed, resetZoom]
  );

  return {
    zoomState,
    isZoomed,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    resetZoom,
    containerRef,
  };
}
