"use client";

import Link from "next/link";

interface HeaderProps {
  path?: string;
}

export default function Header({ path }: HeaderProps) {
  const segments = path ? path.split("/").filter(Boolean) : [];

  return (
    <header className="sticky top-0 z-40 bg-[var(--bg-primary)]/95 backdrop-blur-sm border-b border-[var(--border-color)]">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <nav className="flex items-center gap-2 text-sm min-w-0">
          <Link
            href="/"
            className="text-[var(--text-primary)] hover:text-white font-medium shrink-0 transition-colors"
          >
            Gallery
          </Link>
          {segments.map((segment, index) => {
            const href = "/" + segments.slice(0, index + 1).join("/");
            const isLast = index === segments.length - 1;
            return (
              <span key={href} className="flex items-center gap-2 min-w-0">
                <span className="text-[var(--text-muted)]">/</span>
                {isLast ? (
                  <span className="text-[var(--text-secondary)] truncate">
                    {decodeURIComponent(segment)}
                  </span>
                ) : (
                  <Link
                    href={href}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] truncate transition-colors"
                  >
                    {decodeURIComponent(segment)}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
