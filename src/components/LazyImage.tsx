"use client";

import { useRef, useState, useEffect } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
}

/**
 * How long a thumb has to stay in the pre-load zone before we actually
 * issue the HTTP request. On fast fling-scrolls, cells enter and leave
 * the IntersectionObserver's rootMargin band in a few dozen ms, so a
 * short grace window is enough to skip loading thumbs the user is
 * clearly scrolling PAST — but short enough to feel instant on normal
 * scroll (which lingers hundreds of ms within the 400 px pre-load zone
 * before the cell even reaches the viewport).
 *
 * 180 ms is the sweet spot in testing: fling scrolls skip almost
 * everything, controlled drags still prefetch ahead of the viewport.
 */
const LOAD_DEBOUNCE_MS = 180;

export default function LazyImage({ src, alt, width, height }: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
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

  // Scroll-velocity-aware loader: only fire the fetch after the cell has
  // been in the pre-load zone for LOAD_DEBOUNCE_MS. Fling-scrolling past
  // a cell never triggers a request; stopping on it still feels instant
  // because the 400 px pre-load margin fires the IO well before the
  // thumb is on screen.
  //
  // Once a thumb has actually loaded (isLoaded), it stays mounted —
  // we don't want to tear it down just because the user scrolled a bit
  // and the cell left the margin; the <img> is already in browser cache
  // so re-render is free.
  useEffect(() => {
    if (isLoaded) return;
    if (!isVisible) {
      // Left the zone before load started → cancel the pending fire.
      // Also drop shouldLoad so an in-flight request can be aborted by
      // unmounting the <img>.
      setShouldLoad(false);
      return;
    }
    const timer = setTimeout(() => setShouldLoad(true), LOAD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isVisible, isLoaded]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[var(--bg-secondary)]"
    >
      {!isLoaded && <div className="absolute inset-0 shimmer" />}
      {shouldLoad && (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          // Thumbs are decorative payload for a scrolling grid — low
          // priority lets the browser schedule them around any higher-
          // priority fetches without stealing connection slots.
          fetchPriority="low"
          decoding="async"
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
