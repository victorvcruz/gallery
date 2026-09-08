import fs from "fs/promises";
import sharp from "sharp";

export interface DngPreview {
  buffer: Buffer;
  width: number;
  height: number;
  /** EXIF orientation from the DNG's IFD0 (1-8). The extracted preview
   *  buffer itself usually doesn't carry orientation EXIF, so callers must
   *  apply this rotation explicitly. */
  orientation: number;
}

interface CacheEntry {
  mtime: number;
  preview: DngPreview | null;
}

const MAX_CACHE_ENTRIES = 24;
const cache = new Map<string, CacheEntry>();

const SOI_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);
const EOI = Buffer.from([0xff, 0xd9]);

/** Read the Orientation tag (0x0112) from a DNG/TIFF's IFD0 without decoding
 *  the whole file. Returns 1 (normal) on parse failure. */
function readTiffOrientation(buf: Buffer): number {
  try {
    const byteOrder = buf.readUInt16LE(0);
    const le = byteOrder === 0x4949;
    const r16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
    const r32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
    if (r16(2) !== 0x2a) return 1;
    const ifd0 = r32(4);
    const n = r16(ifd0);
    for (let i = 0; i < n; i++) {
      const entry = ifd0 + 2 + i * 12;
      if (r16(entry) === 0x0112) return r16(entry + 8);
    }
  } catch {
    // fall through
  }
  return 1;
}

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
  const orientation = readTiffOrientation(buf);
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
          orientation,
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
