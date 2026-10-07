import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {
  getGalleryRoot,
  getMetadataCacheDir,
  isImageFile,
  isRawFile,
} from "./gallery-config";
import { parseExifBuffer, ExifData } from "./exif-reader";
import { readTiffExifFromFile } from "./tiff-exif";
import { extractRawPreview } from "./raw-preview";
import type {
  FolderInfo,
  ImageInfo,
  SortDirection,
  SortOrder,
} from "./types";

// Re-export for callers that still import shared types from here.
export type { FolderInfo, ImageInfo, SortDirection, SortOrder };

interface CacheEntry {
  mtime: number;
  data: ImageInfo;
}

// Bump when the shape of persisted ImageInfo changes so stale caches don't
// hide missing fields (v2: DNG captureDate, v3: fileSize, v4: RAW extension
// coverage — previously ARW/CR2/etc. silently dropped when sharp threw).
const META_VERSION = 4;
const METADATA_CONCURRENCY = 8;
const metadataCache = new Map<string, CacheEntry>();
let metadataDirEnsured = false;

/**
 * Placeholder dimensions used when a photo's real metadata hasn't been
 * computed yet. 3:2 is the dominant aspect ratio for the DNG/ARW library
 * this app targets, so the justified grid lays out reasonably on first
 * render and only reflows for the actual portrait shots once their real
 * dims come in from the background worker.
 */
const PLACEHOLDER_WIDTH = 3000;
const PLACEHOLDER_HEIGHT = 2000;

// ─────────────────────────────────────────────────────────────────────
// Background metadata worker
//
// scanFolder/walkAllImages used to synchronously process every photo's
// sharp.metadata() + EXIF before returning. On a cold first visit to a
// 5000-photo folder that's a ~60s wall of blank screen. The lite mode
// returns placeholder dims immediately for cache-miss photos and enqueues
// them here; a singleton worker drains the queue with limited concurrency
// so sharp doesn't thrash the CPU/disk.
//
// Progress is tracked globally (`workDone`/`workTotal`) rather than
// per-path because the per-request walk already builds a precise count
// of pending items in its response — the global counters just give the
// client a cheap polling signal.
// ─────────────────────────────────────────────────────────────────────

interface QueuedJob {
  filePath: string;
  relPath: string;
}

const pendingJobs = new Map<string, QueuedJob>();
let workerActive = 0;
let workDone = 0;
let workTotal = 0;

function enqueueMetadata(filePath: string, relPath: string): void {
  if (metadataCache.has(filePath)) return;
  if (pendingJobs.has(filePath)) return;
  pendingJobs.set(filePath, { filePath, relPath });
  workTotal++;
  spawnWorkers();
}

function spawnWorkers(): void {
  while (workerActive < METADATA_CONCURRENCY && pendingJobs.size > 0) {
    workerActive++;
    runWorker().finally(() => {
      workerActive--;
    });
  }
}

async function runWorker(): Promise<void> {
  while (true) {
    const next = pendingJobs.values().next();
    if (next.done) return;
    const job = next.value;
    pendingJobs.delete(job.filePath);
    try {
      await getImageInfo(job.filePath, job.relPath);
    } catch {
      // getImageInfo already swallows per-file errors; this is belt-and-suspenders
    }
    workDone++;
    // Reset counters once everything is drained so the number stays bounded
    // across the lifetime of the process.
    if (pendingJobs.size === 0 && workerActive === 1) {
      workDone = 0;
      workTotal = 0;
    }
  }
}

export interface ScanProgress {
  /** Items ever enqueued since the counters were last reset. */
  total: number;
  /** Items processed by the worker. */
  done: number;
  /** Items currently in the queue (yet to be processed). */
  pending: number;
}

export function getScanProgress(): ScanProgress {
  return { total: workTotal, done: workDone, pending: pendingJobs.size };
}

async function ensureMetadataDir() {
  if (metadataDirEnsured) return;
  await fs.mkdir(getMetadataCacheDir(), { recursive: true });
  metadataDirEnsured = true;
}

function metaCachePath(relativePath: string): string {
  const hash = crypto.createHash("sha1").update(relativePath).digest("hex");
  return path.join(getMetadataCacheDir(), `${hash}.json`);
}

async function readDiskMeta(
  relativePath: string,
  mtime: number
): Promise<ImageInfo | null> {
  try {
    const raw = await fs.readFile(metaCachePath(relativePath), "utf-8");
    const parsed = JSON.parse(raw) as {
      v?: number;
      mtime: number;
      data: ImageInfo;
    };
    if (parsed.v !== META_VERSION) return null;
    if (parsed.mtime === mtime) return parsed.data;
  } catch {
    // miss
  }
  return null;
}

async function writeDiskMeta(
  relativePath: string,
  mtime: number,
  data: ImageInfo
): Promise<void> {
  try {
    await ensureMetadataDir();
    await fs.writeFile(
      metaCachePath(relativePath),
      JSON.stringify({ v: META_VERSION, mtime, data })
    );
  } catch {
    // best-effort
  }
}

async function getImageInfo(
  filePath: string,
  relativePath: string
): Promise<ImageInfo | null> {
  try {
    const stat = await fs.stat(filePath);

    const cached = metadataCache.get(filePath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.data;
    }

    const disk = await readDiskMeta(relativePath, stat.mtimeMs);
    if (disk) {
      metadataCache.set(filePath, { mtime: stat.mtimeMs, data: disk });
      return disk;
    }

    // sharp may throw for RAW formats libvips can't decode (e.g. Sony ARW).
    // Fall through to the embedded-preview fallback below when that happens.
    let sharpWidth = 0;
    let sharpHeight = 0;
    let sharpOrientation = 1;
    let sharpExifBuf: Buffer | undefined;
    try {
      const metadata = await sharp(filePath).metadata();
      sharpWidth = metadata.width ?? 0;
      sharpHeight = metadata.height ?? 0;
      sharpOrientation = metadata.orientation ?? 1;
      sharpExifBuf = metadata.exif;
    } catch {
      // libvips couldn't open this format — we'll try our own path below.
    }

    let exif: ExifData = {};
    if (sharpExifBuf) {
      exif = parseExifBuffer(sharpExifBuf);
    } else if (isRawFile(filePath)) {
      // libvips doesn't surface an EXIF buffer for RAW containers — parse
      // the TIFF IFDs ourselves so we get the real capture date, aperture,
      // etc. Works for DNG, ARW, CR2, NEF, ORF, RW2.
      exif = await readTiffExifFromFile(filePath);
    }

    let width = sharpWidth;
    let height = sharpHeight;
    let orientation = sharpOrientation;

    // If sharp couldn't read dimensions (unsupported RAW), extract the
    // embedded JPEG preview just to learn the aspect ratio + orientation.
    // The full preview extraction is cached in-memory, so a later thumb
    // request reuses the same buffer.
    if (!width || !height) {
      const preview = await extractRawPreview(filePath, stat.mtimeMs);
      if (preview) {
        width = preview.width;
        height = preview.height;
        orientation = preview.orientation;
      }
    }

    if (!width || !height) return null;

    // sharp.metadata() reports stored (pre-rotation) dimensions. If EXIF
    // orientation implies a 90°/270° rotation, the displayed aspect ratio is
    // transposed — swap so the justified grid lays out portrait shots correctly.
    if (orientation >= 5 && orientation <= 8) {
      [width, height] = [height, width];
    }

    // For RAW files sharp/libvips (when it works at all) only surfaces the
    // tiny embedded EXIF thumbnail (e.g. 256x171). Its aspect ratio matches
    // the full sensor — that's all the justified grid needs. Keeping the
    // numbers small avoids extracting the multi-MB preview during folder
    // scans; getProcessedImage extracts it lazily on first render.
    const info: ImageInfo = {
      name: path.basename(filePath),
      path: relativePath,
      width,
      height,
      exif,
      captureDate: exif.captureDate || undefined,
      createdDate: stat.birthtime.toISOString(),
      fileSize: stat.size,
    };

    metadataCache.set(filePath, { mtime: stat.mtimeMs, data: info });
    writeDiskMeta(relativePath, stat.mtimeMs, info).catch(() => {});
    return info;
  } catch {
    metadataCache.delete(filePath);
    return null;
  }
}

/**
 * Fast variant: hits in-memory + disk metadata caches only. If both miss,
 * enqueues the file for background processing and returns a placeholder
 * record so the UI can render immediately. The placeholder uses a generic
 * 3:2 aspect ratio; the real dims will show up on the next scan after
 * the worker finishes.
 */
async function getImageInfoFast(
  filePath: string,
  relativePath: string
): Promise<ImageInfo | null> {
  try {
    const stat = await fs.stat(filePath);

    const cached = metadataCache.get(filePath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.data;
    }

    const disk = await readDiskMeta(relativePath, stat.mtimeMs);
    if (disk) {
      metadataCache.set(filePath, { mtime: stat.mtimeMs, data: disk });
      return disk;
    }

    enqueueMetadata(filePath, relativePath);
    return {
      name: path.basename(filePath),
      path: relativePath,
      width: PLACEHOLDER_WIDTH,
      height: PLACEHOLDER_HEIGHT,
      exif: {},
      createdDate: stat.birthtime.toISOString(),
      fileSize: stat.size,
      pending: true,
    };
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export interface ScanOptions {
  /** When true, cache-miss photos return placeholder records and are
   *  queued for background processing instead of blocking the scan. */
  lite?: boolean;
}

/**
 * On a lite scan, how many of the directory's first files we process
 * synchronously (full sharp + EXIF) before falling back to placeholders.
 * This covers roughly the first screenful + preload margin of a cold
 * grid open, so photos the user sees immediately already have real
 * aspect ratios — the placeholder reflow only ever happens for shots
 * further down that the user has to scroll to.
 */
const LITE_EAGER_HEAD = 24;

export interface ScanFolderResult {
  folders: FolderInfo[];
  images: ImageInfo[];
  /** Count of images in the response that are still placeholders. */
  pendingCount: number;
}

export async function scanFolder(
  relativePath: string,
  sort: SortOrder = "captureDate",
  direction: SortDirection = "asc",
  opts: ScanOptions = {}
): Promise<ScanFolderResult> {
  const root = getGalleryRoot();
  const absPath = path.join(root, relativePath);

  const entries = await fs.readdir(absPath, { withFileTypes: true });

  const folderEntries: string[] = [];
  const imageFiles: { filePath: string; relPath: string }[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      folderEntries.push(entry.name);
    } else if (entry.isFile() && isImageFile(entry.name)) {
      imageFiles.push({
        filePath: path.join(absPath, entry.name),
        relPath: path.join(relativePath, entry.name),
      });
    }
  }

  const [folders, imageResults] = await Promise.all([
    mapWithConcurrency(folderEntries, 4, async (name) => {
      const folderRelPath = path.join(relativePath, name);
      const banner = await findBannerImage(
        path.join(absPath, name),
        folderRelPath
      );
      return {
        name,
        path: folderRelPath,
        bannerImage: banner || undefined,
      } as FolderInfo;
    }),
    (async () => {
      if (!opts.lite) {
        // Full mode: everything resolves inline, same as before.
        return mapWithConcurrency(
          imageFiles,
          METADATA_CONCURRENCY,
          ({ filePath, relPath }) => getImageInfo(filePath, relPath)
        );
      }
      // Lite mode: resolve the first N files for real so the top of the
      // grid never shows placeholder aspect ratios. Everything after N
      // falls back to the fast path (placeholder + enqueue).
      const head = imageFiles.slice(0, LITE_EAGER_HEAD);
      const tail = imageFiles.slice(LITE_EAGER_HEAD);
      const [eager, lazy] = await Promise.all([
        mapWithConcurrency(head, METADATA_CONCURRENCY, ({ filePath, relPath }) =>
          getImageInfo(filePath, relPath)
        ),
        mapWithConcurrency(tail, METADATA_CONCURRENCY, ({ filePath, relPath }) =>
          getImageInfoFast(filePath, relPath)
        ),
      ]);
      return [...eager, ...lazy];
    })(),
  ]);

  const images = imageResults.filter((img): img is ImageInfo => img !== null);
  const pendingCount = images.reduce((n, i) => (i.pending ? n + 1 : n), 0);

  folders.sort((a, b) => a.name.localeCompare(b.name));
  sortImages(images, sort, direction);

  return { folders, images, pendingCount };
}

function sortImages(
  images: ImageInfo[],
  sort: SortOrder,
  direction: SortDirection
): void {
  const multiplier = direction === "asc" ? 1 : -1;

  images.sort((a, b) => {
    switch (sort) {
      case "captureDate": {
        const dateA = a.captureDate || a.createdDate || "";
        const dateB = b.captureDate || b.createdDate || "";
        return multiplier * dateA.localeCompare(dateB);
      }
      case "createdDate": {
        const dateA = a.createdDate || "";
        const dateB = b.createdDate || "";
        return multiplier * dateA.localeCompare(dateB);
      }
      case "fileName":
        return multiplier * a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });
}

async function findBannerImage(
  folderAbsPath: string,
  folderRelPath: string
): Promise<string | null> {
  try {
    const entries = await fs.readdir(folderAbsPath, { withFileTypes: true });

    const imageFiles = entries
      .filter((e) => e.isFile() && isImageFile(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (imageFiles.length > 0) {
      return path.join(folderRelPath, imageFiles[0].name);
    }

    const subdirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dir of subdirs) {
      const sub = await findBannerImage(
        path.join(folderAbsPath, dir.name),
        path.join(folderRelPath, dir.name)
      );
      if (sub) return sub;
    }
  } catch {
    // ignore errors (permission denied, broken symlinks, etc.)
  }
  return null;
}

/**
 * Recursively walk from `relativePath` and return every image's metadata
 * plus a folder count. Uses the same disk metadata cache as scanFolder, so
 * a second call over the same tree is nearly free.
 *
 * Unlike scanFolder this deliberately skips the per-folder banner hunt —
 * stats/analytics consumers only need the images themselves.
 */
export interface WalkResult {
  images: ImageInfo[];
  folderCount: number;
  /** Images in the walk that are still placeholders. */
  pendingCount: number;
}

export async function walkAllImages(
  relativePath: string,
  opts: ScanOptions = {}
): Promise<WalkResult> {
  const root = getGalleryRoot();
  const acc: WalkResult = { images: [], folderCount: 0, pendingCount: 0 };
  // walk uses only the fast or only the slow path — the eager-head
  // optimisation in scanFolder is for the folder-list route where the
  // user is staring at a grid. Stats blocks on everything anyway.
  const infoFn = opts.lite ? getImageInfoFast : getImageInfo;
  await walkDirForImages(root, relativePath, acc, infoFn);
  return acc;
}

type InfoFn = (filePath: string, relPath: string) => Promise<ImageInfo | null>;

async function walkDirForImages(
  root: string,
  relativePath: string,
  acc: WalkResult,
  infoFn: InfoFn
): Promise<void> {
  const absPath = path.join(root, relativePath);
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(absPath, { withFileTypes: true });
  } catch {
    return;
  }

  const imageJobs: { filePath: string; relPath: string }[] = [];
  const subDirs: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      subDirs.push(entry.name);
    } else if (entry.isFile() && isImageFile(entry.name)) {
      imageJobs.push({
        filePath: path.join(absPath, entry.name),
        relPath: path.join(relativePath, entry.name),
      });
    }
  }

  acc.folderCount += subDirs.length;

  const infos = await mapWithConcurrency(
    imageJobs,
    METADATA_CONCURRENCY,
    ({ filePath, relPath }) => infoFn(filePath, relPath)
  );
  for (const info of infos) {
    if (info) {
      acc.images.push(info);
      if (info.pending) acc.pendingCount++;
    }
  }

  for (const sub of subDirs) {
    await walkDirForImages(root, path.join(relativePath, sub), acc, infoFn);
  }
}
