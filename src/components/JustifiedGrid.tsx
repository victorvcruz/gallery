"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import justifiedLayout from "justified-layout";
import LazyImage from "./LazyImage";
import { ImageInfo } from "@/lib/types";

interface JustifiedGridProps {
  images: ImageInfo[];
  onImageClick: (index: number) => void;
  selectionMode?: boolean;
  selectedPaths?: Set<string>;
  onToggleSelect?: (path: string) => void;
  starredPaths?: Set<string>;
}

interface LayoutBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface LayoutResult {
  containerHeight: number;
  boxes: LayoutBox[];
}

export default function JustifiedGrid({
  images,
  onImageClick,
  selectionMode = false,
  selectedPaths,
  onToggleSelect,
  starredPaths,
}: JustifiedGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    setContainerWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  const layout = useMemo((): LayoutResult | null => {
    if (!containerWidth || images.length === 0) return null;

    const aspectRatios = images.map((img) => img.width / img.height);

    const targetRowHeight = Math.round(
      Math.max(140, Math.min(260, containerWidth / 9))
    );

    const result = justifiedLayout(aspectRatios, {
      containerWidth,
      targetRowHeight,
      containerPadding: 0,
      boxSpacing: 4,
    });

    return result as LayoutResult;
  }, [images, containerWidth]);

  return (
    <div ref={containerRef} className="relative w-full">
      {layout && (
        <div style={{ height: layout.containerHeight, position: "relative" }}>
          {layout.boxes.map((box, index) => {
            const img = images[index];
            const selected = selectedPaths?.has(img.path) ?? false;
            const starred = starredPaths?.has(img.path) ?? false;
            const handleTileClick = () => {
              if (selectionMode) {
                onToggleSelect?.(img.path);
              } else {
                onImageClick(index);
              }
            };
            return (
              <div
                key={img.path}
                className="group absolute cursor-pointer"
                style={{
                  top: box.top,
                  left: box.left,
                  width: box.width,
                  height: box.height,
                }}
                onClick={handleTileClick}
              >
                <LazyImage
                  src={`/api/image/${img.path}?size=thumb`}
                  alt={img.name}
                  width={box.width}
                  height={box.height}
                />
                {selected && (
                  <div className="absolute inset-0 ring-4 ring-inset ring-blue-500 bg-blue-500/20 pointer-events-none" />
                )}
                {starred && (
                  <div className="absolute top-2 right-2 pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    <svg
                      className="w-5 h-5 text-yellow-400"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                )}
                {(selectionMode || selected) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect?.(img.path);
                    }}
                    aria-label={selected ? "Desmarcar" : "Selecionar"}
                    className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selected
                        ? "bg-blue-500 text-white opacity-100"
                        : "bg-black/40 text-white/70 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {selected ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <span className="w-3 h-3 rounded-full border-2 border-white/80" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
