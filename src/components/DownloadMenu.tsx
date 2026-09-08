"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadFormat } from "@/lib/download-client";

interface DownloadMenuProps {
  onDownload: (format: DownloadFormat) => void;
  /** Optional label shown as a header inside the menu (e.g. photo name). */
  hint?: string;
  /** Rendered as the toggle button — defaults to a plain download icon. */
  children?: React.ReactNode;
  align?: "left" | "right";
  /** Whether the popover opens above or below the trigger. Use "up" when
   *  the trigger sits near the bottom of the viewport. */
  direction?: "up" | "down";
  buttonClassName?: string;
}

export default function DownloadMenu({
  onDownload,
  hint,
  children,
  align = "right",
  direction = "down",
  buttonClassName,
}: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = (format: DownloadFormat) => {
    setOpen(false);
    onDownload(format);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={
          buttonClassName ??
          "text-white/70 hover:text-white transition-colors cursor-pointer p-1"
        }
        aria-label="Baixar"
      >
        {children ?? (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
            />
          </svg>
        )}
      </button>

      {open && (
        <div
          className={`absolute min-w-[180px] rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-lg z-50 overflow-hidden ${
            align === "right" ? "right-0" : "left-0"
          } ${direction === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {hint && (
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)] truncate">
              {hint}
            </div>
          )}
          <button
            onClick={() => pick("original")}
            className="w-full text-left px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] cursor-pointer flex flex-col"
          >
            <span>Original</span>
            <span className="text-[10px] text-[var(--text-muted)]">
              arquivo fonte (.dng, .arw, .jpg…)
            </span>
          </button>
          <button
            onClick={() => pick("jpeg")}
            className="w-full text-left px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] cursor-pointer flex flex-col"
          >
            <span>JPEG</span>
            <span className="text-[10px] text-[var(--text-muted)]">
              qualidade máxima
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
