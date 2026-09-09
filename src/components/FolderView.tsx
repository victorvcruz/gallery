"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Header from "./Header";
import AlbumGrid from "./AlbumGrid";
import JustifiedGrid from "./JustifiedGrid";
import SortControl from "./SortControl";
import GroupControl from "./GroupControl";
import ImageViewer from "./ImageViewer";
import SelectionBar from "./SelectionBar";
import StatsModal from "./StatsModal";
import {
  FolderData,
  GroupBy,
  SortDirection,
  SortOrder,
} from "@/lib/types";
import { groupImages } from "@/lib/date-groups";
import {
  DownloadFormat,
  downloadSingle,
  downloadZip,
} from "@/lib/download-client";

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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [statsOpen, setStatsOpen] = useState(false);

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

  const groupOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const g of groups) {
      offsets.push(running);
      running += g.images.length;
    }
    return offsets;
  }, [groups]);

  const toggleSelect = useCallback((p: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setSelectionMode(false);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedPaths(new Set(flatImages.map((i) => i.path)));
  }, [flatImages]);

  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
  }, []);

  const handleZipDownload = useCallback(
    (format: DownloadFormat) => {
      if (selectedPaths.size === 0) return;
      // Preserve visual order of the flat list rather than iteration order of the Set.
      const ordered = flatImages
        .map((i) => i.path)
        .filter((p) => selectedPaths.has(p));
      if (ordered.length === 1) {
        downloadSingle(ordered[0], format);
        return;
      }
      const folderLabel = path || "gallery";
      const safeName = folderLabel.replace(/[\\/]/g, "_") || "gallery";
      downloadZip(ordered, format, `${safeName}.zip`);
    },
    [selectedPaths, flatImages, path]
  );

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
            {(data.folders.length > 0 || hasImages) && (
              <div className="sticky top-14 z-30 bg-[var(--bg-primary)]/95 backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
                <span className="text-xs text-[var(--text-muted)]">
                  {[
                    data.folders.length > 0
                      ? `${data.folders.length} pasta${data.folders.length !== 1 ? "s" : ""}`
                      : null,
                    hasImages
                      ? `${flatImages.length} foto${flatImages.length !== 1 ? "s" : ""}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <div className="flex items-center gap-4 flex-wrap">
                  <button
                    onClick={() => setStatsOpen(true)}
                    aria-label="Ver estatísticas"
                    title="Estatísticas"
                    className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer p-1"
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
                        d="M3 3v18h18M7 15l4-4 3 3 5-6"
                      />
                    </svg>
                  </button>
                  {hasImages && (
                    <>
                      <button
                        onClick={
                          selectionMode ? clearSelection : enterSelectionMode
                        }
                        className={`text-[11px] px-2 py-1 rounded transition-colors cursor-pointer ${
                          selectionMode
                            ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        }`}
                      >
                        {selectionMode ? "Cancelar seleção" : "Selecionar"}
                      </button>
                      <GroupControl groupBy={groupBy} onChange={setGroupBy} />
                      <SortControl
                        sort={sort}
                        direction={direction}
                        onChange={handleSortChange}
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {data.folders.length > 0 && (
              <section className="p-4 sm:p-6">
                <AlbumGrid folders={data.folders} />
              </section>
            )}

            {hasImages && (
              <section>

                {groupBy === "none" ? (
                  <JustifiedGrid
                    images={flatImages}
                    onImageClick={handleImageClick}
                    selectionMode={selectionMode}
                    selectedPaths={selectedPaths}
                    onToggleSelect={toggleSelect}
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
                        selectionMode={selectionMode}
                        selectedPaths={selectedPaths}
                        onToggleSelect={toggleSelect}
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

      {selectedPaths.size > 0 && (
        <SelectionBar
          count={selectedPaths.size}
          onDownload={handleZipDownload}
          onClear={clearSelection}
          onSelectAll={
            selectedPaths.size < flatImages.length ? selectAll : undefined
          }
        />
      )}

      {statsOpen && (
        <StatsModal path={path} onClose={() => setStatsOpen(false)} />
      )}
    </div>
  );
}
