"use client";

import { GroupBy } from "@/lib/types";

interface GroupControlProps {
  groupBy: GroupBy;
  onChange: (groupBy: GroupBy) => void;
}

const OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "Sem grupo" },
  { value: "day", label: "Dia" },
  { value: "month", label: "Mês" },
  { value: "year", label: "Ano" },
];

export default function GroupControl({ groupBy, onChange }: GroupControlProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mr-1">
        Agrupar
      </span>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer ${
            groupBy === option.value
              ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
