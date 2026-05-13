"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "./Header";
import AlbumGrid from "./AlbumGrid";
import JustifiedGrid from "./JustifiedGrid";
import SortControl from "./SortControl";
import ImageViewer from "./ImageViewer";
import { FolderData, ImageInfo, SortOrder, SortDirection } from "@/lib/types";

interface FolderViewProps {
  path: string;
}

export default function FolderView({ path }: FolderViewProps) {
  const [data, setData] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOrder>("captureDate");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = path
        ? `/api/folders/${path}?sort=${sort}&dir=${direction}`
        : `/api/folders?sort=${sort}&dir=${direction}`;
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch folder data:", err);
    } finally {
      setLoading(false);
    }
  }, [path, sort, direction]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSortChange = (newSort: SortOrder, newDirection: SortDirection) => {
    setSort(newSort);
    setDirection(newDirection);
  };

  const handleImageClick = (index: number) => {
    setViewerIndex(index);
  };

  const handleViewerClose = () => {
    setViewerIndex(null);
  };

  const handleViewerNavigate = (index: number) => {
    setViewerIndex(index);
  };

  const hasImages = data && data.images.length > 0;

  return (
    <div className="min-h-screen">
      <Header path={path} />
      <main className="max-w-[1800px] mx-auto">
        {loading && !data && (
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[var(--gap)]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] shimmer rounded" />
              ))}
            </div>
          </div>
        )}

        {data && (
          <>
            {data.folders.length > 0 && (
              <section className="p-4 sm:p-6">
                <AlbumGrid folders={data.folders} />
              </section>
            )}

            {hasImages && (
              <section>
                <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">
                    {data.images.length} photo{data.images.length !== 1 ? "s" : ""}
                  </span>
                  <SortControl
                    sort={sort}
                    direction={direction}
                    onChange={handleSortChange}
                  />
                </div>
                <JustifiedGrid
                  images={data.images}
                  onImageClick={handleImageClick}
                />
              </section>
            )}

            {!data.folders.length && !data.images.length && (
              <div className="flex items-center justify-center h-[60vh]">
                <p className="text-[var(--text-muted)] text-lg">
                  This folder is empty
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {viewerIndex !== null && data && (
        <ImageViewer
          images={data.images}
          currentIndex={viewerIndex}
          onClose={handleViewerClose}
          onNavigate={handleViewerNavigate}
        />
      )}
    </div>
  );
}
