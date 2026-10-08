"use client";

import { useEffect, useRef, useState } from "react";
import type { GroupBy, SortDirection, SortOrder } from "@/lib/types";
import type { PickFilter } from "./PickFilter";

interface ViewOptionsMenuProps {
  pickFilter: PickFilter;
  onPickFilterChange: (v: PickFilter) => void;
  groupBy: GroupBy;
  onGroupByChange: (v: GroupBy) => void;
  sort: SortOrder;
  direction: SortDirection;
  onSortChange: (sort: SortOrder, direction: SortDirection) => void;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  pickCount: number;
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "captureDate", label: "Captura" },
  { value: "createdDate", label: "Criação" },
  { value: "fileName", label: "Nome" },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "day", label: "Dia" },
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
];

const PICK_OPTIONS: { value: PickFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "picks", label: "★ Picks" },
  { value: "not-picks", label: "Sem pick" },
];

export default function ViewOptionsMenu({
  pickFilter,
  onPickFilterChange,
  groupBy,
  onGroupByChange,
  sort,
  direction,
  onSortChange,
  selectionMode,
  onToggleSelectionMode,
  pickCount,
}: ViewOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Opções de visualização"
        title="Opções"
        className={`p-1.5 rounded transition-colors cursor-pointer ${
          open
            ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 6h18M3 12h18M3 18h18"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl z-50 overflow-hidden"
        >
          <Section title="Mostrar">
            {PICK_OPTIONS.map((opt) => (
              <RadioRow
                key={opt.value}
                active={pickFilter === opt.value}
                onClick={() => onPickFilterChange(opt.value)}
                label={opt.label}
                suffix={
                  opt.value === "picks" && pickCount > 0
                    ? `${pickCount}`
                    : undefined
                }
              />
            ))}
          </Section>

          <Section title="Agrupar">
            {GROUP_OPTIONS.map((opt) => (
              <RadioRow
                key={opt.value}
                active={groupBy === opt.value}
                onClick={() => onGroupByChange(opt.value)}
                label={opt.label}
              />
            ))}
          </Section>

          <Section title="Ordenar">
            {SORT_OPTIONS.map((opt) => {
              const isActive = sort === opt.value;
              return (
                <button
                  key={opt.value}
                  role="menuitemradio"
                  aria-checked={isActive}
                  onClick={() => {
                    if (isActive) {
                      onSortChange(sort, direction === "asc" ? "desc" : "asc");
                    } else {
                      onSortChange(opt.value, "asc");
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer ${
                    isActive
                      ? "text-[var(--text-primary)] bg-[var(--bg-tertiary)]/50"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/30"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <RadioDot active={isActive} />
                    {opt.label}
                  </span>
                  {isActive && (
                    <span className="text-[var(--text-muted)] text-[10px]">
                      {direction === "asc" ? "↑ Crescente" : "↓ Decrescente"}
                    </span>
                  )}
                </button>
              );
            })}
          </Section>

          <Section title="Seleção">
            <button
              role="menuitemcheckbox"
              aria-checked={selectionMode}
              onClick={() => {
                onToggleSelectionMode();
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/30 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <CheckboxBox active={selectionMode} />
                Modo seleção
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {selectionMode ? "Ativo" : "Clique nas fotos"}
              </span>
            </button>
          </Section>

          {pickCount > 0 && (
            <div className="border-t border-[var(--border-color)]">
              <a
                href="/api/picks/export"
                download
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/30 cursor-pointer no-underline"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
                  />
                </svg>
                Baixar picks (CSV)
                <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                  {pickCount}
                </span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t first:border-t-0 border-[var(--border-color)]">
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </div>
      <div className="pb-1">{children}</div>
    </div>
  );
}

function RadioRow({
  active,
  onClick,
  label,
  suffix,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  suffix?: string;
}) {
  return (
    <button
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer ${
        active
          ? "text-[var(--text-primary)] bg-[var(--bg-tertiary)]/50"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/30"
      }`}
    >
      <span className="flex items-center gap-2">
        <RadioDot active={active} />
        {label}
      </span>
      {suffix && (
        <span className="text-[10px] text-[var(--text-muted)]">{suffix}</span>
      )}
    </button>
  );
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block w-3 h-3 rounded-full border transition-colors ${
        active
          ? "border-blue-400 bg-blue-400/40"
          : "border-[var(--text-muted)]"
      }`}
    />
  );
}

function CheckboxBox({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-3 h-3 rounded-sm border transition-colors ${
        active
          ? "border-blue-400 bg-blue-400 text-white"
          : "border-[var(--text-muted)]"
      }`}
    >
      {active && (
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </span>
  );
}
