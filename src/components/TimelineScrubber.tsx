"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ImageInfo } from "@/lib/types";

interface TimelineScrubberProps {
  /** Images in display order. The scrubber uses position-in-list, not real
   *  time, so clumps of photos (bursts) land at the same spot on the bar. */
  images: ImageInfo[];
}

type Granularity = "day" | "month" | "year";

interface Bucket {
  key: string;
  label: string;      // compact label painted on the track
  longLabel: string;  // tooltip label while scrubbing
  startIndex: number; // global index of first image in this bucket
}

/**
 * Enough vertical space to clear the main sticky toolbar (~100px) and any
 * group-level sticky header (~56px). This is used both for the scroll target
 * offset and for the elementFromPoint probe that reads the active index.
 */
const SCROLL_OFFSET_PX = 170;

/** Max labels we actually paint on the track; everything above this count
 *  gets thinned out so the labels don't visually collide. */
const MAX_LABELS = 22;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function monthShort(d: Date): string {
  const s = new Intl.DateTimeFormat(undefined, { month: "short" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, "");
}

function monthLong(d: Date): string {
  const l = new Intl.DateTimeFormat(undefined, { month: "long" }).format(d);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function imgDate(img: ImageInfo): Date | null {
  const s = img.captureDate || img.createdDate;
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function pickGranularity(start: Date, end: Date): Granularity {
  const diffDays = (end.getTime() - start.getTime()) / 86400000;
  // ~2 months of range → days still fit; up to 2 years → months; else years.
  if (diffDays <= 62) return "day";
  if (diffDays <= 730) return "month";
  return "year";
}

function keyAndLabel(
  d: Date,
  g: Granularity
): { key: string; label: string; longLabel: string } {
  const y = d.getFullYear();
  if (g === "day") {
    return {
      key: `${y}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`,
      longLabel: `${pad2(d.getDate())} ${monthLong(d)} ${y}`,
    };
  }
  if (g === "month") {
    return {
      key: `${y}-${pad2(d.getMonth() + 1)}`,
      label: monthShort(d),
      longLabel: `${monthLong(d)} ${y}`,
    };
  }
  return { key: String(y), label: String(y), longLabel: String(y) };
}

// Buckets are startIndex-sorted; binary-search the last whose startIndex <= idx.
function bucketIndexForImage(buckets: Bucket[], imageIdx: number): number {
  if (buckets.length === 0) return -1;
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (buckets[mid].startIndex <= imageIdx) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export default function TimelineScrubber({ images }: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [hover, setHover] = useState<{ y: number; label: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  const total = images.length;

  const buckets = useMemo(() => {
    const dated: { idx: number; date: Date }[] = [];
    for (let i = 0; i < images.length; i++) {
      const d = imgDate(images[i]);
      if (d) dated.push({ idx: i, date: d });
    }
    if (dated.length === 0) return [] as Bucket[];

    let min = dated[0].date.getTime();
    let max = min;
    for (const { date } of dated) {
      const t = date.getTime();
      if (t < min) min = t;
      if (t > max) max = t;
    }
    const g = pickGranularity(new Date(min), new Date(max));

    const out: Bucket[] = [];
    let prevKey = "";
    for (const { idx, date } of dated) {
      const kl = keyAndLabel(date, g);
      if (kl.key !== prevKey) {
        out.push({ ...kl, startIndex: idx });
        prevKey = kl.key;
      }
    }
    return out;
  }, [images]);

  // Visible subset of buckets: evenly spaced, with the last always included
  // so the bottom of the track is anchored to a real date.
  const visibleBuckets = useMemo(() => {
    if (buckets.length === 0) return [] as (Bucket & { bucketIdx: number })[];
    const step = Math.max(1, Math.ceil(buckets.length / MAX_LABELS));
    const out: (Bucket & { bucketIdx: number })[] = [];
    for (let i = 0; i < buckets.length; i += step) {
      out.push({ ...buckets[i], bucketIdx: i });
    }
    const lastIdx = buckets.length - 1;
    if (out.length > 0 && out[out.length - 1].bucketIdx !== lastIdx) {
      out.push({ ...buckets[lastIdx], bucketIdx: lastIdx });
    }
    return out;
  }, [buckets]);

  // Track which image is currently near the top of the viewport. Reading
  // via a single elementFromPoint call per rAF keeps this O(1) regardless
  // of how many thousand tiles are mounted.
  useEffect(() => {
    if (buckets.length === 0) return;
    const read = () => {
      rafRef.current = null;
      // Probe just below the sticky header stack, slightly left of center
      // so we don't hit the scrubber itself.
      const x = Math.max(80, Math.min(window.innerWidth - 100, window.innerWidth / 2));
      const el = document.elementFromPoint(x, SCROLL_OFFSET_PX + 10);
      if (!el) return;
      const tile = el.closest?.("[data-image-index]");
      if (tile) {
        const n = Number(tile.getAttribute("data-image-index"));
        if (!Number.isNaN(n)) setActiveImageIndex(n);
      }
    };
    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [buckets]);

  const scrollToImageIndex = useCallback(
    (idx: number, instant: boolean) => {
      const el = document.querySelector<HTMLElement>(
        `[data-image-index="${idx}"]`
      );
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const target = window.scrollY + rect.top - SCROLL_OFFSET_PX;
      window.scrollTo({ top: Math.max(0, target), behavior: instant ? "auto" : "smooth" });
    },
    []
  );

  const indexFromY = useCallback(
    (clientY: number): number => {
      const track = trackRef.current;
      if (!track || total === 0) return 0;
      const r = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      return Math.min(total - 1, Math.floor(ratio * total));
    },
    [total]
  );

  // While dragging we jump to the bucket boundary rather than the exact
  // image index — this is what makes scrubbing feel snappy and date-aware
  // (every pixel of movement that crosses a bucket boundary jumps to that
  // bucket's first photo, not somewhere in the middle).
  const handleScrubAtY = useCallback(
    (clientY: number) => {
      const idx = indexFromY(clientY);
      const b = bucketIndexForImage(buckets, idx);
      const bucket = b >= 0 ? buckets[b] : null;
      setHover({ y: clientY, label: bucket?.longLabel ?? "" });
      scrollToImageIndex(bucket?.startIndex ?? idx, true);
    },
    [buckets, indexFromY, scrollToImageIndex]
  );

  // Pointer events cover both mouse and touch. `touch-action: none` on the
  // track prevents the browser from treating a drag as a page scroll.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    handleScrubAtY(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    handleScrubAtY(e.clientY);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture may have already been released; ignore.
    }
    setDragging(false);
    setHover(null);
  };

  // No point rendering a scrubber for a handful of photos or when the
  // dataset has no dates we can orient around.
  if (buckets.length < 2 || total < 20) return null;

  const activeBucket = bucketIndexForImage(buckets, activeImageIndex);
  const thumbRatio = total > 1 ? activeImageIndex / (total - 1) : 0;

  return (
    <>
      <div
        className="fixed right-0 top-24 bottom-4 z-20 w-10 sm:w-14 flex items-stretch pointer-events-none"
        aria-label="Timeline"
      >
        <div
          ref={trackRef}
          className="relative flex-1 touch-none pointer-events-auto rounded-l-md"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            background: dragging
              ? "rgba(0,0,0,0.35)"
              : "transparent",
            transition: "background-color 150ms",
          }}
        >
          {visibleBuckets.map((bucket) => {
            const ratio = total > 1 ? bucket.startIndex / (total - 1) : 0;
            const isActive = bucket.bucketIdx === activeBucket;
            return (
              <div
                key={bucket.key}
                className={`absolute right-1.5 -translate-y-1/2 text-[9px] sm:text-[10px] tabular-nums px-1 pointer-events-none transition-colors ${
                  isActive
                    ? "text-white font-semibold"
                    : "text-white/55"
                }`}
                style={{
                  top: `${ratio * 100}%`,
                  textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                }}
              >
                {bucket.label}
              </div>
            );
          })}

          {/* Position indicator: short bar on the right edge following the
              current scroll position. */}
          <div
            className="absolute right-0 h-0.5 w-3 bg-white rounded-l pointer-events-none transition-[top] duration-100"
            style={{
              top: `${thumbRatio * 100}%`,
              boxShadow: "0 0 4px rgba(0,0,0,0.6)",
            }}
          />
        </div>
      </div>

      {/* Floating date tooltip while scrubbing */}
      {dragging && hover && hover.label && (
        <div
          className="fixed right-14 sm:right-20 z-30 pointer-events-none px-3 py-1.5 rounded-md bg-black/85 text-white text-xs shadow-lg whitespace-nowrap"
          style={{ top: Math.max(60, hover.y - 14) }}
        >
          {hover.label}
        </div>
      )}
    </>
  );
}
