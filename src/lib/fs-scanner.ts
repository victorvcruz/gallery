import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getGalleryRoot, isImageFile } from "./gallery-config";
import { parseExifBuffer, ExifData } from "./exif-reader";

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
  cachedAt: number;
}

const METADATA_TTL_MS = 60 * 60 * 1000; // 1 hour in-memory TTL
const metadataCache = new Map<string, CacheEntry>();

function pruneStaleCache() {
  const now = Date.now();
  for (const [key, entry] of metadataCache) {
    if (now - entry.cachedAt > METADATA_TTL_MS) {
      metadataCache.delete(key);
    }
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

    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) return null;

    let exif: ExifData = {};
    if (metadata.exif) {
      exif = parseExifBuffer(metadata.exif);
    }

    const info: ImageInfo = {
      name: path.basename(filePath),
      path: relativePath,
      width: metadata.width,
      height: metadata.height,
      exif,
      captureDate: exif.captureDate || undefined,
      createdDate: stat.birthtime.toISOString(),
    };

    metadataCache.set(filePath, { mtime: stat.mtimeMs, data: info, cachedAt: Date.now() });
    return info;
  } catch {
    metadataCache.delete(filePath);
    return null;
  }
}

export async function scanFolder(
  relativePath: string,
  sort: SortOrder = "captureDate",
  direction: SortDirection = "asc"
): Promise<{ folders: FolderInfo[]; images: ImageInfo[] }> {
  pruneStaleCache();

  const root = getGalleryRoot();
  const absPath = path.join(root, relativePath);

  const entries = await fs.readdir(absPath, { withFileTypes: true });

  const folders: FolderInfo[] = [];
  const imagePromises: Promise<ImageInfo | null>[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      const folderRelPath = path.join(relativePath, entry.name);
      const banner = await findBannerImage(
        path.join(absPath, entry.name),
        folderRelPath
      );
      folders.push({
        name: entry.name,
        path: folderRelPath,
        bannerImage: banner || undefined,
      });
    } else if (entry.isFile() && isImageFile(entry.name)) {
      const fileRelPath = path.join(relativePath, entry.name);
      const filePath = path.join(absPath, entry.name);
      imagePromises.push(getImageInfo(filePath, fileRelPath));
    }
  }

  const imageResults = await Promise.all(imagePromises);
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
