"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ImageInfo } from "@/lib/types";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { useImageZoom } from "@/hooks/useImageZoom";
import DownloadMenu from "./DownloadMenu";
import { downloadSingle, DownloadFormat } from "@/lib/download-client";

interface ImageViewerProps {
  images: ImageInfo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function ImageViewer({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: ImageViewerProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [isFullLoaded, setIsFullLoaded] = useState(false);
  const currentImage = images[currentIndex];

  const {
    zoomState,
    isZoomed,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    resetZoom,
    containerRef,
  } = useImageZoom();

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      resetZoom();
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate, resetZoom]);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      resetZoom();
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, images.length, onNavigate, resetZoom]);

  const handleClose = useCallback(() => {
    resetZoom();
    onClose();
  }, [onClose, resetZoom]);

  useKeyboardNavigation({
    onPrev: goToPrev,
    onNext: goToNext,
    onClose: handleClose,
    enabled: true,
  });

  // Touch/swipe support
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isZoomed) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, [isZoomed]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isZoomed || !touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && dt < 400) {
      if (dx > 0) goToPrev();
      else goToNext();
    }
  }, [isZoomed, goToPrev, goToNext]);

  useEffect(() => {
    setLoadedSrc(null);
    setIsFullLoaded(false);
  }, [currentIndex]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Preload adjacent images
  useEffect(() => {
    const preload = (idx: number) => {
      if (idx >= 0 && idx < images.length) {
        const img = new Image();
        img.src = `/api/image/${images[idx].path}?size=preview`;
      }
    };
    preload(currentIndex + 1);
    preload(currentIndex - 1);
  }, [currentIndex, images]);

  const previewSrc = `/api/image/${currentImage.path}?size=preview`;
  const fullSrc = `/api/image/${currentImage.path}?size=full`;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isZoomed) {
      handleClose();
    }
  };

  const handleNavClick = (e: React.MouseEvent, direction: "prev" | "next") => {
    e.stopPropagation();
    if (direction === "prev") goToPrev();
    else goToNext();
  };

  const exif = currentImage.exif;
  const exifParts: string[] = [];
  if (exif.aperture) exifParts.push(`f/${exif.aperture}`);
  if (exif.shutterSpeed) exifParts.push(exif.shutterSpeed);
  if (exif.iso) exifParts.push(`ISO ${exif.iso}`);
  if (exif.focalLength) exifParts.push(`${exif.focalLength}mm`);
  if (exif.captureDate) {
    const d = new Date(exif.captureDate);
    if (!isNaN(d.getTime())) {
      exifParts.push(d.toLocaleDateString());
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Navigation areas */}
      {currentIndex > 0 && !isZoomed && (
        <button
          className="absolute left-0 top-0 bottom-0 w-20 z-10 flex items-center justify-start pl-4 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
          onClick={(e) => handleNavClick(e, "prev")}
          aria-label="Previous image"
        >
          <svg className="w-8 h-8 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {currentIndex < images.length - 1 && !isZoomed && (
        <button
          className="absolute right-0 top-0 bottom-0 w-20 z-10 flex items-center justify-end pr-4 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
          onClick={(e) => handleNavClick(e, "next")}
          aria-label="Next image"
        >
          <svg className="w-8 h-8 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Top-right actions */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <DownloadMenu
          hint={currentImage.name}
          onDownload={(format: DownloadFormat) =>
            downloadSingle(currentImage.path, format)
          }
          buttonClassName="text-white/60 hover:text-white transition-colors cursor-pointer p-1"
        />
        <button
          className="text-white/60 hover:text-white transition-colors cursor-pointer"
          onClick={handleClose}
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className={`relative w-full h-full flex items-center justify-center select-none ${
          isZoomed ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={isFullLoaded ? fullSrc : (loadedSrc || previewSrc)}
          alt={currentImage.name}
          className="w-full h-full object-contain transition-transform duration-100"
          style={{
            transform: `translate(${zoomState.translateX}px, ${zoomState.translateY}px) scale(${zoomState.scale})`,
            willChange: "transform",
          }}
          onLoad={() => {
            if (!loadedSrc) setLoadedSrc(previewSrc);
          }}
          draggable={false}
        />
        {/* Load full resolution on first zoom */}
        {isZoomed && !isFullLoaded && (
          <img
            src={fullSrc}
            className="hidden"
            onLoad={() => setIsFullLoaded(true)}
            alt=""
          />
        )}
      </div>

      {/* EXIF info bar */}
      {exifParts.length > 0 && !isZoomed && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-black/60 backdrop-blur-sm rounded-full">
          <p className="text-[11px] text-white/70 tracking-wide">
            {exifParts.join("  \u2022  ")}
          </p>
        </div>
      )}

      {/* Image counter */}
      {!isZoomed && (
        <div className="absolute top-4 left-4 z-20">
          <p className="text-xs text-white/50">
            {currentIndex + 1} / {images.length}
          </p>
        </div>
      )}
    </div>
  );
}
