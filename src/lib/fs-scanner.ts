import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {
  getGalleryRoot,
  getMetadataCacheDir,
  isImageFile,
} from "./gallery-config";
import { parseExifBuffer, ExifData } from "./exif-reader";
import { readDngExifFromFile } from "./dng-exif";

export interface ImageInfo {
  name: string;
  path: string;
  width: number;
  height: number;
  exif: ExifData;
  captureDate?: string;
  createdDate?: string;
}

export interface FolderInfo {
  name: string;
  path: string;
  bannerImage?: string;
}

export type SortOrder = "captureDate" | "createdDate" | "fileName";
export type SortDirection = "asc" | "desc";

interface CacheEntry {
  mtime: number;
  data: ImageInfo;
}

// Bump when the shape of persisted ImageInfo changes so stale caches don't
// hide missing fields (e.g. captureDate for DNGs added in v2).
const META_VERSION = 2;
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

    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) return null;

    let exif: ExifData = {};
    if (metadata.exif) {
      exif = parseExifBuffer(metadata.exif);
    } else if (path.extname(filePath).toLowerCase() === ".dng") {
      // libvips doesn't surface an EXIF buffer for DNGs — parse the TIFF
      // IFDs ourselves so we get the real capture date, aperture, etc.
      exif = await readDngExifFromFile(filePath);
    }

    // sharp.metadata() reports stored (pre-rotation) dimensions. If EXIF
    // orientation implies a 90°/270° rotation, the displayed aspect ratio is
    // transposed — swap so the justified grid lays out portrait shots correctly.
    let width = metadata.width;
    let height = metadata.height;
    const orientation = metadata.orientation ?? 1;
    if (orientation >= 5 && orientation <= 8) {
      [width, height] = [height, width];
    }

    // For DNGs sharp only surfaces the tiny embedded EXIF thumbnail (e.g. 256x171),
    // but its aspect ratio matches the full sensor — that's all the justified grid
    // needs. Keeping the numbers small avoids extracting the multi-MB preview
    // during folder scans; getProcessedImage extracts it lazily on first render.
    const info: ImageInfo = {
      name: path.basename(filePath),
      path: relativePath,
      width,
      height,
      exif,
      captureDate: exif.captureDate || undefined,
      createdDate: stat.birthtime.toISOString(),
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
