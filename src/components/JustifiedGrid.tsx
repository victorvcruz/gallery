"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import justifiedLayout from "justified-layout";
import LazyImage from "./LazyImage";
import { ImageInfo } from "@/lib/types";

interface JustifiedGridProps {
  images: ImageInfo[];
  onImageClick: (index: number) => void;
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

export default function JustifiedGrid({ images, onImageClick }: JustifiedGridProps) {
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
          {layout.boxes.map((box, index) => (
            <div
              key={images[index].path}
              className="absolute cursor-pointer"
              style={{
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
              }}
              onClick={() => onImageClick(index)}
            >
              <LazyImage
                src={`/api/image/${images[index].path}?size=thumb`}
                alt={images[index].name}
                width={box.width}
                height={box.height}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
