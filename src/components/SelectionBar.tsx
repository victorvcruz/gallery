"use client";

import DownloadMenu from "./DownloadMenu";
import { DownloadFormat } from "@/lib/download-client";

interface SelectionBarProps {
  count: number;
  starredInSelection?: number;
  onDownload: (format: DownloadFormat) => void;
  onStarAll?: () => void;
  onUnstarAll?: () => void;
  onClear: () => void;
  onSelectAll?: () => void;
}

export default function SelectionBar({
  count,
  starredInSelection = 0,
  onDownload,
  onStarAll,
  onUnstarAll,
  onClear,
  onSelectAll,
}: SelectionBarProps) {
  const allStarred = starredInSelection === count && count > 0;
  const anyStarred = starredInSelection > 0;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-lg rounded-full">
      <span className="text-xs text-[var(--text-primary)] px-2">
        <span className="font-medium">{count}</span>{" "}
        <span className="text-[var(--text-muted)]">
          selecionada{count !== 1 ? "s" : ""}
        </span>
        {anyStarred && (
          <span className="ml-1 text-[var(--text-muted)]">
            · {starredInSelection} ★
          </span>
        )}
      </span>

      {onSelectAll && (
        <button
          onClick={onSelectAll}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer px-2 py-1"
        >
          Selecionar todas
        </button>
      )}

      {onStarAll && !allStarred && (
        <button
          onClick={onStarAll}
          title="Marcar como pick"
          aria-label="Marcar todas como pick"
          className="flex items-center gap-1 text-xs text-[var(--text-primary)] hover:text-yellow-400 transition-colors cursor-pointer px-2 py-1"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Marcar
        </button>
      )}

      {onUnstarAll && anyStarred && (
        <button
          onClick={onUnstarAll}
          title="Remover pick"
          aria-label="Remover pick de todas"
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer px-2 py-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            />
          </svg>
          Desmarcar
        </button>
      )}

      <DownloadMenu
        onDownload={onDownload}
        align="right"
        direction="up"
        buttonClassName="flex items-center gap-1.5 text-xs text-[var(--text-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] transition-colors cursor-pointer px-3 py-1.5 rounded-full"
      >
        <svg
          className="w-4 h-4"
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
        Baixar
      </DownloadMenu>

      <button
        onClick={onClear}
        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer px-2 py-1"
        aria-label="Cancelar seleção"
      >
        Cancelar
      </button>
    </div>
  );
}
