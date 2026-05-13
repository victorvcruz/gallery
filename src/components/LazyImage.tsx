"use client";

import { useRef, useState, useEffect } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export default function LazyImage({ src, alt, width, height }: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "400px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[var(--bg-secondary)]"
    >
      {!isLoaded && <div className="absolute inset-0 shimmer" />}
      {isVisible && (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setIsLoaded(true)}
          draggable={false}
        />
      )}
    </div>
  );
}
