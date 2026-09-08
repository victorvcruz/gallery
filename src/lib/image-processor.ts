import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {
  getGalleryRoot,
  getThumbCacheDir,
  getPreviewCacheDir,
  getFullCacheDir,
  CACHE_TTL_MS,
  isRawFile,
} from "./gallery-config";
import { extractDngPreview } from "./dng-preview";

sharp.cache({ memory: 512, files: 200, items: 500 });

export type ImageSize = "thumb" | "preview" | "full";

interface SizeConfig {
  maxDimension: number | null;
  quality: number;
  cacheDir: () => string;
}

const SIZE_CONFIGS: Record<ImageSize, SizeConfig> = {
  thumb: { maxDimension: 800, quality: 85, cacheDir: getThumbCacheDir },
  preview: { maxDimension: 3200, quality: 92, cacheDir: getPreviewCacheDir },
  full: { maxDimension: null, quality: 95, cacheDir: getFullCacheDir },
};

function getCachePath(relativePath: string, size: ImageSize): string {
  const config = SIZE_CONFIGS[size];
  const hash = crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 16);
  const baseName = path.basename(relativePath, path.extname(relativePath));
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return path.join(config.cacheDir(), `${safeName}__${hash}.jpg`);
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

  const isRaw = isRawFile(absPath);

  // For non-RAW originals, stream the source bytes directly on "full".
  if (size === "full" && !isRaw) {
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

  let source: string | Buffer = absPath;
  if (isRaw && path.extname(absPath).toLowerCase() === ".dng") {
    const srcStat = await fs.stat(absPath);
    const preview = await extractDngPreview(absPath, srcStat.mtimeMs);
    if (preview) source = preview.buffer;
  }

  let pipeline = sharp(source, { failOn: "none" }).rotate();

  if (config.maxDimension) {
    pipeline = pipeline.resize(config.maxDimension, config.maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buffer = await pipeline
    .jpeg({
      quality: config.quality,
      mozjpeg: true,
      chromaSubsampling: size === "thumb" ? "4:2:0" : "4:4:4",
    })
    .toBuffer();

  await fs.writeFile(cachePath, buffer);

  return { buffer, contentType: "image/jpeg" };
}

export async function cleanExpiredCache(): Promise<void> {
  const dirs = [getThumbCacheDir(), getPreviewCacheDir(), getFullCacheDir()];
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
