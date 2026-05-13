"use client";

import { useEffect } from "react";

interface UseKeyboardNavigationOptions {
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  enabled: boolean;
}

export function useKeyboardNavigation({
  onPrev,
  onNext,
  onClose,
  enabled,
}: UseKeyboardNavigationOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          onPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          onNext();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext, onClose, enabled]);
}
