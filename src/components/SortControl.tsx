"use client";

import { SortOrder, SortDirection } from "@/lib/types";

interface SortControlProps {
  sort: SortOrder;
  direction: SortDirection;
  onChange: (sort: SortOrder, direction: SortDirection) => void;
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "captureDate", label: "Capture Date" },
  { value: "createdDate", label: "Created Date" },
  { value: "fileName", label: "File Name" },
];

export default function SortControl({ sort, direction, onChange }: SortControlProps) {
  const handleSortClick = (value: SortOrder) => {
    if (value === sort) {
      onChange(sort, direction === "asc" ? "desc" : "asc");
    } else {
      onChange(value, "asc");
    }
  };

  return (
    <div className="flex items-center gap-1">
      {SORT_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => handleSortClick(option.value)}
          className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer ${
            sort === option.value
              ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {option.label}
          {sort === option.value && (
            <span className="ml-1 inline-block">
              {direction === "asc" ? "↑" : "↓"}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
