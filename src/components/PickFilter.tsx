"use client";

export type PickFilter = "all" | "picks" | "not-picks";

interface PickFilterProps {
  value: PickFilter;
  onChange: (next: PickFilter) => void;
  pickCount: number;
}

const OPTIONS: { value: PickFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "picks", label: "★ Picks" },
  { value: "not-picks", label: "Sem pick" },
];

export default function PickFilter({
  value,
  onChange,
  pickCount,
}: PickFilterProps) {
  return (
    <div className="flex items-center gap-1">
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={
              opt.value === "picks"
                ? `${pickCount} foto${pickCount !== 1 ? "s" : ""} marcada${pickCount !== 1 ? "s" : ""}`
                : undefined
            }
            className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer ${
              active
                ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
