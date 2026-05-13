"use client";

import Link from "next/link";

interface FolderInfo {
  name: string;
  path: string;
  bannerImage?: string;
}

interface AlbumGridProps {
  folders: FolderInfo[];
}

export default function AlbumGrid({ folders }: AlbumGridProps) {
  if (folders.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[var(--gap)]">
      {folders.map((folder) => (
        <Link
          key={folder.path}
          href={`/${folder.path}`}
          className="group relative aspect-[4/3] overflow-hidden bg-[var(--bg-secondary)]"
        >
          {folder.bannerImage ? (
            <img
              src={`/api/image/${folder.bannerImage}?size=thumb`}
              alt={folder.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-[var(--text-muted)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h2 className="text-white text-lg font-medium truncate">
              {folder.name}
            </h2>
          </div>
        </Link>
      ))}
    </div>
  );
}
