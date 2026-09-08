import path from "path";
import { getGalleryRoot } from "./gallery-config";

export type DownloadFormat = "original" | "jpeg";

/** Reject any path that tries to escape the gallery root via traversal or
 *  absolute segments. Returns the resolved absolute path when safe. */
export function resolveSafeGalleryPath(relativePath: string): string | null {
  if (!relativePath || relativePath.includes("\0")) return null;
  const root = getGalleryRoot();
  const abs = path.resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** Filename to present to the user for a given source path + download format. */
export function downloadFileName(
  relativePath: string,
  format: DownloadFormat
): string {
  const base = path.basename(relativePath);
  if (format === "original") return base;
  const stem = base.slice(0, base.length - path.extname(base).length);
  return `${stem}.jpg`;
}

/** RFC 5987 / 6266 compatible Content-Disposition value. Keeps a plain
 *  ASCII fallback for older browsers and a UTF-8 filename* for the rest. */
export function contentDispositionAttachment(name: string): string {
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
