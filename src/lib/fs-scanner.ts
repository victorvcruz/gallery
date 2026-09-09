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

export async function scanFolder(
  relativePath: string,
  sort: SortOrder = "captureDate",
  direction: SortDirection = "asc"
): Promise<{ folders: FolderInfo[]; images: ImageInfo[] }> {
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
    mapWithConcurrency(imageFiles, METADATA_CONCURRENCY, ({ filePath, relPath }) =>
      getImageInfo(filePath, relPath)
    ),
  ]);

  const images = imageResults.filter((img): img is ImageInfo => img !== null);

  folders.sort((a, b) => a.name.localeCompare(b.name));
  sortImages(images, sort, direction);

  return { folders, images };
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
export async function walkAllImages(
  relativePath: string
): Promise<{ images: ImageInfo[]; folderCount: number }> {
  const root = getGalleryRoot();
  const acc = { images: [] as ImageInfo[], folderCount: 0 };
  await walkDirForImages(root, relativePath, acc);
  return acc;
}

async function walkDirForImages(
  root: string,
  relativePath: string,
  acc: { images: ImageInfo[]; folderCount: number }
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
    ({ filePath, relPath }) => getImageInfo(filePath, relPath)
  );
  for (const info of infos) {
    if (info) acc.images.push(info);
  }

  for (const sub of subDirs) {
    await walkDirForImages(root, path.join(relativePath, sub), acc);
  }
}
