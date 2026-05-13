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
  return path.join(getGalleryRoot(), ".gallery-cache");
}

export function getThumbCacheDir(): string {
  return path.join(getCacheDir(), "thumb");
}

export function getPreviewCacheDir(): string {
  return path.join(getCacheDir(), "preview");
}

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

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
  ".arw",
  ".cr2",
  ".cr3",
  ".nef",
  ".dng",
  ".raf",
  ".orf",
  ".rw2",
]);

export function isImageFile(filename: string): boolean {
  if (filename.startsWith(".")) return false;
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}
