import fs from "fs/promises";
import sharp from "sharp";

export interface DngPreview {
  buffer: Buffer;
  width: number;
  height: number;
}

interface CacheEntry {
  mtime: number;
  preview: DngPreview | null;
}

const MAX_CACHE_ENTRIES = 24;
const cache = new Map<string, CacheEntry>();

const SOI_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);
const EOI = Buffer.from([0xff, 0xd9]);

function findEmbeddedJpegChunks(buf: Buffer): { offset: number; size: number }[] {
  const chunks: { offset: number; size: number }[] = [];
  let searchStart = 0;
  while (searchStart < buf.length - 4) {
    const soi = buf.indexOf(SOI_PREFIX, searchStart);
    if (soi < 0) break;
    const marker = buf[soi + 3];
    // Skip lossless JPEG (SOF3/SOF7 → raw sensor tiles) and corrupt double-SOI
    if (marker === 0xc3 || marker === 0xc7 || marker === 0xd8) {
      searchStart = soi + 4;
      continue;
    }
    const eoi = buf.indexOf(EOI, soi + 4);
    if (eoi < 0) break;
    const size = eoi + 2 - soi;
    if (size > 5000) chunks.push({ offset: soi, size });
    searchStart = eoi + 2;
  }
  return chunks;
}

/**
 * Extract the largest embedded JPEG preview from a DNG file.
 * DNGs store multiple JPEG-encoded regions: tiny EXIF thumbs, medium/full previews,
 * and (lossless) raw sensor tiles. We skip lossless-JPEG markers and pick the
 * candidate that decodes to the largest pixel count.
 */
export async function extractDngPreview(
  filePath: string,
  mtime: number
): Promise<DngPreview | null> {
  const cached = cache.get(filePath);
  if (cached && cached.mtime === mtime) return cached.preview;

  const buf = await fs.readFile(filePath);
  const candidates = findEmbeddedJpegChunks(buf);

  let best: DngPreview | null = null;
  // Try up to 20 largest byte-size candidates to cap work.
  const sorted = [...candidates].sort((a, b) => b.size - a.size).slice(0, 20);
  for (const c of sorted) {
    const chunk = buf.subarray(c.offset, c.offset + c.size);
    try {
      const m = await sharp(chunk).metadata();
      if (!m.width || !m.height) continue;
      if (!best || m.width * m.height > best.width * best.height) {
        // Copy the slice so it survives the parent buffer being GC'd.
        best = {
          buffer: Buffer.from(chunk),
          width: m.width,
          height: m.height,
        };
      }
    } catch {
      // not a valid standalone JPEG — skip
    }
  }

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(filePath, { mtime, preview: best });

  return best;
}
