"use client";

import { useEffect, useState } from "react";
import type { BucketCount, StatsResult } from "@/lib/stats-aggregator";

interface StatsModalProps {
  path: string;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  for (const unit of units) {
    if (v < 1024) return `${v.toFixed(v < 10 ? 2 : 1)} ${unit}`;
    v /= 1024;
  }
  return `${v.toFixed(1)} PB`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function BarRow({
  label,
  count,
  max,
  suffix,
}: {
  label: string;
  count: number;
  max: number;
  suffix?: string;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-28 shrink-0 truncate text-right text-[var(--text-muted)]">
        {label}
      </span>
      <div className="flex-1 bg-[var(--bg-tertiary)] rounded overflow-hidden h-4">
        <div
          className="bg-blue-500/80 h-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-[var(--text-secondary)] tabular-nums">
        {count.toLocaleString()}
        {suffix ? ` ${suffix}` : ""}
      </span>
    </div>
  );
}

function Section({
  title,
  buckets,
  emptyLabel,
}: {
  title: string;
  buckets: BucketCount[];
  emptyLabel?: string;
}) {
  if (buckets.length === 0) {
    return (
      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
          {title}
        </h3>
        <p className="text-xs text-[var(--text-muted)] italic">
          {emptyLabel ?? "Sem dados"}
        </p>
      </div>
    );
  }
  const max = Math.max(...buckets.map((b) => b.count));
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">
        {buckets.map((b) => (
          <BarRow key={b.label} label={b.label} count={b.count} max={max} />
        ))}
      </div>
    </div>
  );
}

export default function StatsModal({ path, onClose }: StatsModalProps) {
  const [data, setData] = useState<StatsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = path ? `/api/stats/${path}` : `/api/stats`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return (await r.json()) as StatsResult;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro");
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const scopeLabel = path
    ? `/${path
        .split("/")
        .map((s) => decodeURIComponent(s))
        .join(" / ")}`
    : "raiz";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">
              Estatísticas
            </h2>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              Escopo: <span className="text-[var(--text-secondary)]">{scopeLabel}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer p-1"
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="text-xs text-red-400">
              Falha ao carregar: {error}
            </p>
          )}
          {!data && !error && (
            <div className="flex items-center justify-center h-40">
              <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-[var(--text-muted)] border-t-transparent animate-spin" />
                Analisando fotos…
              </div>
            </div>
          )}
          {data && (
            <div className="flex flex-col gap-6">
              {/* Summary strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Fotos", value: data.totalPhotos.toLocaleString() },
                  { label: "Pastas", value: data.totalFolders.toLocaleString() },
                  { label: "Tamanho", value: formatBytes(data.totalBytes) },
                  {
                    label: "Período",
                    value: `${formatDate(data.dateRange.earliest)} → ${formatDate(
                      data.dateRange.latest
                    )}`,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-[var(--bg-tertiary)] rounded px-3 py-2"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      {s.label}
                    </p>
                    <p className="text-sm text-[var(--text-primary)] mt-0.5 truncate">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Two-column layout for equipment vs distributions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Câmeras" buckets={data.cameras} />
                <Section title="Lentes" buckets={data.lenses} />
                <Section title="Distância focal" buckets={data.focalLengths} />
                <Section title="Abertura" buckets={data.apertures} />
                <Section title="Velocidade do obturador" buckets={data.shutterSpeeds} />
                <Section title="ISO" buckets={data.isos} />
                <Section title="Fotos por mês" buckets={data.byMonth} />
                <Section title="Dia da semana" buckets={data.byWeekday} />
              </div>

              <Section title="Hora do dia" buckets={data.byHour} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
