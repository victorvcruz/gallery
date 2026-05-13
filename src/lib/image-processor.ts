import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  getGalleryRoot,
  getThumbCacheDir,
  getPreviewCacheDir,
  CACHE_TTL_MS,
} from "./gallery-config";

export type ImageSize = "thumb" | "preview" | "full";

interface SizeConfig {
  maxDimension: number;
  quality: number;
  cacheDir: () => string;
}

const SIZE_CONFIGS: Record<Exclude<ImageSize, "full">, SizeConfig> = {
  thumb: { maxDimension: 800, quality: 80, cacheDir: getThumbCacheDir },
  preview: { maxDimension: 2400, quality: 85, cacheDir: getPreviewCacheDir },
};

function getCachePath(relativePath: string, size: Exclude<ImageSize, "full">): string {
  const config = SIZE_CONFIGS[size];
  const normalized = relativePath.replace(/[/\\]/g, "__");
  const baseName = path.basename(normalized, path.extname(normalized));
  return path.join(config.cacheDir(), `${baseName}__${normalized.length}.jpg`);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
}

export async function getProcessedImage(
  relativePath: string,
  size: ImageSize
): Promise<ProcessedImage> {
  const root = getGalleryRoot();
  const absPath = path.join(root, relativePath);

  await fs.access(absPath);

  if (size === "full") {
    const buffer = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    return { buffer, contentType: getContentType(ext) };
  }

  const cachePath = getCachePath(relativePath, size);

  try {
    const [cacheStat, sourceStat] = await Promise.all([
      fs.stat(cachePath),
      fs.stat(absPath),
    ]);

    const cacheAge = Date.now() - cacheStat.mtimeMs;
    const cacheIsStale = cacheStat.mtimeMs < sourceStat.mtimeMs;

    if (!cacheIsStale && cacheAge < CACHE_TTL_MS) {
      const buffer = await fs.readFile(cachePath);
      return { buffer, contentType: "image/jpeg" };
    }

    await fs.unlink(cachePath).catch(() => {});
  } catch {
    // Cache miss
  }

  const config = SIZE_CONFIGS[size];
  await ensureDir(config.cacheDir());

  const buffer = await sharp(absPath, { failOn: "none" })
    .rotate()
    .resize(config.maxDimension, config.maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: config.quality, mozjpeg: true })
    .toBuffer();

  await fs.writeFile(cachePath, buffer);

  return { buffer, contentType: "image/jpeg" };
}

export async function cleanExpiredCache(): Promise<void> {
  const dirs = [getThumbCacheDir(), getPreviewCacheDir()];
  const now = Date.now();

  for (const dir of dirs) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > CACHE_TTL_MS) {
            await fs.unlink(filePath);
          }
        } catch {
          // skip
        }
      }
    } catch {
      // dir doesn't exist yet
    }
  }
}

export async function clearAllCache(): Promise<void> {
  const { getCacheDir } = await import("./gallery-config");
  await fs.rm(getCacheDir(), { recursive: true, force: true });
}

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".heic": "image/heic",
    ".heif": "image/heif",
  };
  return types[ext] || "application/octet-stream";
}
