import path from "path";

export function getGalleryRoot(): string {
  const root = process.env.GALLERY_ROOT;
  if (!root) {
    throw new Error(
      "GALLERY_ROOT environment variable is not set. " +
        "Set it to the absolute path of your photos directory."
    );
  }
  return path.resolve(root);
}

export function getCacheDir(): string {
  // Allow overriding via env so the photos volume can be mounted read-only
  // (as recommended in the README) while the cache goes to a separate,
  // writable location — required in Docker where /photos is typically :ro.
  const override = process.env.GALLERY_CACHE_DIR;
  if (override) return path.resolve(override);
  return path.join(getGalleryRoot(), ".gallery-cache");
}

export function getThumbCacheDir(): string {
  return path.join(getCacheDir(), "thumb");
}

export function getPreviewCacheDir(): string {
  return path.join(getCacheDir(), "preview");
}

export function getFullCacheDir(): string {
  return path.join(getCacheDir(), "full");
}

export function getMetadataCacheDir(): string {
  return path.join(getCacheDir(), "metadata");
}

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export const RAW_EXTENSIONS = new Set([
  ".arw",
  ".cr2",
  ".cr3",
  ".nef",
  ".dng",
  ".raf",
  ".orf",
  ".rw2",
]);

export const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
  ".webp",
  ".avif",
  ".heic",
  ".heif",
  ...RAW_EXTENSIONS,
]);

export function isImageFile(filename: string): boolean {
  if (filename.startsWith(".")) return false;
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function isRawFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return RAW_EXTENSIONS.has(ext);
}
