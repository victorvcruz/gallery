"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Header from "./Header";
import AlbumGrid from "./AlbumGrid";
import JustifiedGrid from "./JustifiedGrid";
import SortControl from "./SortControl";
import GroupControl from "./GroupControl";
import ImageViewer from "./ImageViewer";
import {
  FolderData,
  GroupBy,
  SortDirection,
  SortOrder,
} from "@/lib/types";
import { groupImages } from "@/lib/date-groups";

interface FolderViewProps {
  path: string;
}

export default function FolderView({ path }: FolderViewProps) {
  const [data, setData] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOrder>("captureDate");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
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

  const groups = useMemo(
    () => (data ? groupImages(data.images, groupBy, direction) : []),
    [data, groupBy, direction]
  );

  const flatImages = useMemo(
    () => groups.flatMap((g) => g.images),
    [groups]
  );

  // Precompute the flat-index offset for each group so a local click within
  // a group can be translated to the ImageViewer's global index.
  const groupOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const g of groups) {
      offsets.push(running);
      running += g.images.length;
    }
    return offsets;
  }, [groups]);

  const hasImages = flatImages.length > 0;

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
                <div className="sticky top-14 z-30 bg-[var(--bg-primary)]/95 backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
                  <span className="text-xs text-[var(--text-muted)]">
                    {flatImages.length} foto{flatImages.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-4 flex-wrap">
                    <GroupControl groupBy={groupBy} onChange={setGroupBy} />
                    <SortControl
                      sort={sort}
                      direction={direction}
                      onChange={handleSortChange}
                    />
                  </div>
                </div>

                {groupBy === "none" ? (
                  <JustifiedGrid
                    images={flatImages}
                    onImageClick={handleImageClick}
                  />
                ) : (
                  groups.map((group, gi) => (
                    <div key={group.key} className="mb-8">
                      <div className="sticky top-[104px] z-20 bg-[var(--bg-primary)]/90 backdrop-blur-sm px-4 sm:px-6 py-2 flex items-baseline gap-3 border-b border-[var(--border-color)]">
                        <h2 className="text-sm font-medium text-[var(--text-primary)]">
                          {group.label}
                        </h2>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {group.images.length} foto{group.images.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <JustifiedGrid
                        images={group.images}
                        onImageClick={(localIdx) =>
                          handleImageClick(groupOffsets[gi] + localIdx)
                        }
                      />
                    </div>
                  ))
                )}
              </section>
            )}

            {!data.folders.length && !hasImages && (
              <div className="flex items-center justify-center h-[60vh]">
                <p className="text-[var(--text-muted)] text-lg">
                  This folder is empty
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {viewerIndex !== null && hasImages && (
        <ImageViewer
          images={flatImages}
          currentIndex={viewerIndex}
          onClose={handleViewerClose}
          onNavigate={handleViewerNavigate}
        />
      )}
    </div>
  );
}
