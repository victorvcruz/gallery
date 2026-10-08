"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageInfo } from "@/lib/types";

interface CullingModeProps {
  images: ImageInfo[];
  /** When provided (viewer was open at this index), start here instead of
   *  auto-resuming from the last starred position. */
  startIndex?: number | null;
  starredPaths: Set<string>;
  onToggleStar: (path: string) => void;
  onClose: () => void;
}

type Decision = "star" | "skip";

// Swipe threshold: 25% of container width. Below this, the card snaps back.
const SWIPE_COMMIT_FRACTION = 0.25;
// Max rotation while dragging (degrees).
const MAX_TILT_DEG = 12;

/**
 * Fullscreen Tinder-style culling mode.
 *
 *  ← swipe / arrow  → não starrar, avança
 *  → swipe / arrow  → starrar, avança
 *  ↑ / Z            → desfazer (volta 1 foto e reverte a decisão)
 *  Esc / X          → sair
 *
 * On desktop the same left/right buttons work with mouse. On tap devices
 * you can also just tap the big buttons at the bottom.
 */
export default function CullingMode({
  images,
  startIndex,
  starredPaths,
  onToggleStar,
  onClose,
}: CullingModeProps) {
  // Where to resume:
  //  1. Explicit startIndex from parent (viewer was open at this photo).
  //  2. Otherwise walk the list from the END and find the last position
  //     that has a star — resume from the one AFTER it. This respects
  //     visual order, not decision time: if you starred #3 then went back
  //     and starred #1, the "furthest" progress is still #3, so we resume
  //     at #4.
  //  3. No stars in this list → start at 0.
  const [index, setIndex] = useState(() => {
    if (typeof startIndex === "number") {
      return Math.max(0, Math.min(images.length - 1, startIndex));
    }
    for (let i = images.length - 1; i >= 0; i--) {
      if (starredPaths.has(images[i].path)) {
        return Math.min(i + 1, images.length);
      }
    }
    return 0;
  });
  const [resumedFromLastStar] = useState(
    () => typeof startIndex !== "number" && index > 0
  );
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [flying, setFlying] = useState<"left" | "right" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const history = useRef<{ index: number; decision: Decision }[]>([]);

  const current = images[index];
  const containerWidth = containerRef.current?.clientWidth ?? 1;

  const applyDecision = useCallback(
    (decision: Decision) => {
      if (!current) return;
      if (decision === "star" && !starredPaths.has(current.path)) {
        onToggleStar(current.path);
      } else if (decision === "skip" && starredPaths.has(current.path)) {
        // Explicit "no" removes an existing star so you can revise mid-cull.
        onToggleStar(current.path);
      }
      history.current.push({ index, decision });
      // Fly-off animation, then advance.
      setFlying(decision === "star" ? "right" : "left");
      window.setTimeout(() => {
        setFlying(null);
        setDrag(null);
        setIndex((i) => Math.min(images.length, i + 1));
      }, 180);
    },
    [current, index, images.length, starredPaths, onToggleStar]
  );

  const undo = useCallback(() => {
    const last = history.current.pop();
    if (!last) return;
    // Revert the star state, then jump back to that photo.
    const target = images[last.index];
    if (target) {
      const isStarredNow = starredPaths.has(target.path);
      const shouldBeStarred = last.decision === "star";
      // If our decision matches the current state, undoing means flipping it back.
      if (isStarredNow === shouldBeStarred) {
        onToggleStar(target.path);
      }
    }
    setIndex(last.index);
    setDrag(null);
    setFlying(null);
  }, [images, starredPaths, onToggleStar]);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          applyDecision("star");
          break;
        case "ArrowLeft":
          e.preventDefault();
          applyDecision("skip");
          break;
        case "ArrowUp":
        case "z":
        case "Z":
          e.preventDefault();
          undo();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyDecision, undo, onClose]);

  // Lock scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Preload next 5 previews so the animation lands on a decoded image.
  useEffect(() => {
    for (let d = 1; d <= 5; d++) {
      const next = images[index + d];
      if (!next) break;
      const img = new Image();
      img.src = `/api/image/${next.path}?size=preview`;
    }
  }, [index, images]);

  // Touch handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (flying) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    setDrag({ dx: 0, dy: 0 });
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current || flying) return;
    const t = e.touches[0];
    setDrag({
      dx: t.clientX - touchStart.current.x,
      dy: t.clientY - touchStart.current.y,
    });
  };
  const onTouchEnd = () => {
    if (!drag || flying) return;
    const threshold = containerWidth * SWIPE_COMMIT_FRACTION;
    if (Math.abs(drag.dx) > threshold) {
      applyDecision(drag.dx > 0 ? "star" : "skip");
    } else {
      setDrag(null); // snap back
    }
    touchStart.current = null;
  };

  // Progress
  const total = images.length;
  const decided = history.current.length;
  const starredCount = useMemo(
    () =>
      images
        .slice(0, index)
        .reduce((n, i) => (starredPaths.has(i.path) ? n + 1 : n), 0),
    [images, index, starredPaths]
  );
  // Last few photos the user starred while moving forward through this
  // cull. Walking backward from the current index keeps the ordering
  // "newest first" which matches how the dock reads left→right (latest
  // on the left, oldest on the right). Capped at 6 to leave room for
  // the main card on even the narrowest mobile viewport.
  const RECENT_PICKS_LIMIT = 6;
  const recentPicks = useMemo(() => {
    const picks: ImageInfo[] = [];
    for (let i = index - 1; i >= 0 && picks.length < RECENT_PICKS_LIMIT; i--) {
      if (starredPaths.has(images[i].path)) picks.push(images[i]);
    }
    return picks;
  }, [images, index, starredPaths]);
  const done = index >= images.length;

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-black text-white flex items-center justify-center p-6">
        <div className="text-center flex flex-col gap-4 max-w-sm">
          <p className="text-2xl">✓ Culling finalizado</p>
          <p className="text-sm text-white/70">
            {decided} decisões · {starredCount} pick{starredCount !== 1 ? "s" : ""}
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm cursor-pointer"
          >
            Voltar à galeria
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  // Compute transform for the currently-dragged / flying card.
  let transform = "translate(0, 0) rotate(0deg)";
  let transition = "transform 0.18s ease-out";
  if (flying) {
    const off = flying === "right" ? window.innerWidth : -window.innerWidth;
    const rot = flying === "right" ? MAX_TILT_DEG : -MAX_TILT_DEG;
    transform = `translate(${off}px, 0) rotate(${rot}deg)`;
  } else if (drag) {
    const rot = (drag.dx / containerWidth) * MAX_TILT_DEG;
    transform = `translate(${drag.dx}px, ${drag.dy * 0.2}px) rotate(${rot}deg)`;
    transition = "none";
  }

  const dxRatio = drag ? drag.dx / (containerWidth * SWIPE_COMMIT_FRACTION) : 0;
  const rightHint = Math.max(0, Math.min(1, dxRatio));
  const leftHint = Math.max(0, Math.min(1, -dxRatio));

  const thumbSrc = `/api/image/${current.path}?size=thumb`;
  const previewSrc = `/api/image/${current.path}?size=preview`;

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 sm:px-6">
        <span className="text-[11px] text-white/60 tabular-nums">
          {index + 1} / {total} · {starredCount} pick{starredCount !== 1 ? "s" : ""}
          {resumedFromLastStar && (
            <>
              <span className="ml-2 text-yellow-400/80">↺ retomado</span>
              <button
                onClick={() => {
                  history.current = [];
                  setIndex(0);
                  setDrag(null);
                  setFlying(null);
                }}
                className="ml-2 text-white/50 hover:text-white underline underline-offset-2 cursor-pointer"
              >
                começar do início
              </button>
            </>
          )}
        </span>
        <button
          onClick={onClose}
          aria-label="Sair"
          className="text-white/60 hover:text-white p-1 cursor-pointer"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Card area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Card itself */}
        <div
          className="absolute inset-4 rounded-xl overflow-hidden bg-neutral-900"
          style={{ transform, transition, willChange: "transform" }}
        >
          <img
            src={thumbSrc}
            aria-hidden
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
          <img
            src={previewSrc}
            alt={current.name}
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
          {/* Decision hints overlay */}
          <div
            className="absolute top-6 left-6 border-4 border-red-500 text-red-500 text-2xl font-bold px-3 py-1 rounded rotate-[-12deg] pointer-events-none transition-opacity"
            style={{ opacity: leftHint }}
          >
            NOPE
          </div>
          <div
            className="absolute top-6 right-6 border-4 border-yellow-400 text-yellow-400 text-2xl font-bold px-3 py-1 rounded rotate-[12deg] pointer-events-none transition-opacity"
            style={{ opacity: rightHint }}
          >
            ★ PICK
          </div>
        </div>
      </div>

      {/* Recent picks dock — tap a thumb to instantly un-star it. Lets
          the user "take back" a star when a better shot of the same
          scene shows up a few photos later, without having to swipe
          back through the deck. */}
      {recentPicks.length > 0 && (
        <div className="px-3 pt-2 pb-1 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] uppercase tracking-wider text-white/40 shrink-0 pl-1">
            Picks
          </span>
          {recentPicks.map((img) => (
            <button
              key={img.path}
              onClick={() => onToggleStar(img.path)}
              aria-label={`Remover pick de ${img.name}`}
              title={`Tap para remover pick · ${img.name}`}
              className="relative shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded overflow-hidden ring-2 ring-yellow-400 cursor-pointer active:scale-90 transition-transform group"
            >
              <img
                src={`/api/image/${img.path}?size=thumb`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />
              {/* Remove indicator — subtle on desktop (hover), tap-tap
                  obvious on mobile via the active:scale animation. */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <span className="absolute top-0.5 right-0.5 text-yellow-300 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] text-[10px]">
                ★
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-center gap-8 py-4 sm:py-6 pb-[env(safe-area-inset-bottom,16px)]">
        <button
          onClick={() => applyDecision("skip")}
          aria-label="Sem pick"
          title="Sem pick (←)"
          className="w-16 h-16 rounded-full border-2 border-white/30 flex items-center justify-center text-white/80 hover:text-white hover:border-white/60 active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <button
          onClick={undo}
          disabled={history.current.length === 0}
          aria-label="Desfazer"
          title="Desfazer (↑ ou Z)"
          className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-white/40 active:scale-95 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v1M3 10l4 4m-4-4l4-4" />
          </svg>
        </button>
        <button
          onClick={() => applyDecision("star")}
          aria-label="Marcar pick"
          title="Marcar pick (→)"
          className="w-16 h-16 rounded-full border-2 border-yellow-400/50 bg-yellow-400/10 flex items-center justify-center text-yellow-400 hover:bg-yellow-400/20 hover:border-yellow-400 active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
