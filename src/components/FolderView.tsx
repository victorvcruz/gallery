"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  /** When present, open the viewer on this image once the folder data
   *  has loaded. Comes from the URL (/folder/image.ext deep links). */
  initialImage?: string;
}

function folderUrl(path: string): string {
  return path ? `/${path}` : "/";
}

function imageUrl(path: string, imageName: string): string {
  const encoded = encodeURIComponent(imageName);
  return path ? `/${path}/${encoded}` : `/${encoded}`;
}

// Client-side check for image extension. Kept in sync with server-side
// isImageFile — only used for parsing the current URL after popstate.
const IMAGE_EXT_RE = /\.(jpe?g|png|dng|arw|cr2|cr3|nef|raf|orf|rw2|tiff?|webp|avif|heif?)$/i;

function extractImageFromUrl(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const last = parts[parts.length - 1] ?? "";
  return IMAGE_EXT_RE.test(last) ? last : null;
}

export default function FolderView({ path, initialImage }: FolderViewProps) {
  const [data, setData] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOrder>("captureDate");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [statsOpen, setStatsOpen] = useState(false);
  // Track whether the currently-open viewer was opened via pushState (a
  // click), so closing can `back()` and pop the entry cleanly. If we got
  // here via deep-link (server render) instead, there's no entry to pop.
  const openedViaPushRef = useRef(false);
  const initialImageAppliedRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = path
        ? `/api/folders/${path}?sort=${sort}&dir=${direction}`
        : `/api/folders?sort=${sort}&dir=${direction}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Guard against error-shaped responses that would set data.folders =
      // undefined and blow up the render.
      if (!json || !Array.isArray(json.folders) || !Array.isArray(json.images)) {
        throw new Error("Malformed folder response");
      }
      setData(json);
    } catch (err) {
      console.error("Failed to fetch folder data:", err);
      setData({ folders: [], images: [] });
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
    const img = flatImages[index];
    if (!img) return;
    setViewerName(img.name);
    // window.history bypasses Next's router entirely — no RSC re-fetch,
    // no re-render flash. The URL is still deep-linkable because
    // page.tsx parses it on real page loads / refreshes.
    window.history.pushState(null, "", imageUrl(path, img.name));
    openedViaPushRef.current = true;
  };

  const handleViewerClose = () => {
    setViewerName(null);
    if (openedViaPushRef.current) {
      openedViaPushRef.current = false;
      // Pops the pushState entry we added on open. popstate handler runs
      // but its state update is a no-op since we already cleared it.
      window.history.back();
    } else {
      // Deep-link entry — strip the image segment without adding history.
      window.history.replaceState(null, "", folderUrl(path));
    }
  };

  const handleViewerNavigate = (index: number) => {
    const img = flatImages[index];
    if (!img) return;
    setViewerName(img.name);
    // replace so arrow-key spam doesn't grow the history stack.
    window.history.replaceState(null, "", imageUrl(path, img.name));
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

  // On first data load only, apply the deep-linked initialImage to the
  // viewer. After that, viewerName is driven purely by user actions and
  // popstate — we never re-derive from props (which would misfire on every
  // sort/group change even though the URL / image hasn't changed).
  useEffect(() => {
    if (initialImageAppliedRef.current) return;
    if (!data) return;
    initialImageAppliedRef.current = true;
    if (initialImage) setViewerName(initialImage);
  }, [data, initialImage]);

  // Browser back/forward: sync viewer to whatever the URL now points at.
  useEffect(() => {
    const onPop = () => {
      const name = extractImageFromUrl(window.location.pathname);
      setViewerName(name);
      // History entry we may have pushed has been popped by this navigation.
      openedViaPushRef.current = false;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Derive current viewer index from the name each render — automatically
  // stays correct when sort/group reorders flatImages.
  const viewerIndex = useMemo(() => {
    if (!viewerName) return null;
    const idx = flatImages.findIndex((img) => img.name === viewerName);
    return idx >= 0 ? idx : null;
  }, [viewerName, flatImages]);

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
