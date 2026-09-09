import fs from "fs/promises";
import { ExifData } from "./exif-reader";

/*
 * Minimal TIFF/EXIF parser. libvips exposes an EXIF buffer only for
 * JPEG-family inputs — for TIFF-based containers (DNG, ARW, CR2, NEF,
 * ORF, RW2) it doesn't, so we walk IFD0 and the EXIF SubIFD ourselves.
 *
 * Only the tags the app consumes (date, aperture, shutter, ISO, focal,
 * camera, lens) are extracted.
 */

// IFD0 tags
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD_POINTER = 0x8769;

// EXIF SubIFD tags
const TAG_EXPOSURE_TIME = 0x829a;
const TAG_F_NUMBER = 0x829d;
const TAG_ISO = 0x8827;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_FOCAL_LENGTH = 0x920a;
const TAG_LENS_MODEL = 0xa434;

interface Entry {
  tag: number;
  type: number;
  count: number;
  dataOffset: number;
}

function typeSize(t: number): number {
  switch (t) {
    case 1: case 2: case 6: case 7: return 1;
    case 3: case 8: return 2;
    case 4: case 9: case 11: return 4;
    case 5: case 10: case 12: return 8;
    default: return 0;
  }
}

function readEntries(
  buf: Buffer,
  ifdOffset: number,
  le: boolean
): Map<number, Entry> {
  const r16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const r32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const out = new Map<number, Entry>();
  if (ifdOffset + 2 > buf.length) return out;
  const count = r16(ifdOffset);
  for (let i = 0; i < count; i++) {
    const e = ifdOffset + 2 + i * 12;
    if (e + 12 > buf.length) break;
    const type = r16(e + 2);
    const cnt = r32(e + 4);
    const size = typeSize(type) * cnt;
    const dataOffset = size <= 4 ? e + 8 : r32(e + 8);
    out.set(r16(e), { tag: r16(e), type, count: cnt, dataOffset });
  }
  return out;
}

function readAscii(buf: Buffer, e: Entry): string {
  const end = Math.min(buf.length, e.dataOffset + e.count);
  return buf.subarray(e.dataOffset, end).toString("utf-8").replace(/\0+$/, "").trim();
}

function readShort(buf: Buffer, e: Entry, le: boolean): number {
  return le ? buf.readUInt16LE(e.dataOffset) : buf.readUInt16BE(e.dataOffset);
}

function readLong(buf: Buffer, e: Entry, le: boolean): number {
  return le ? buf.readUInt32LE(e.dataOffset) : buf.readUInt32BE(e.dataOffset);
}

function readRational(buf: Buffer, e: Entry, le: boolean): number {
  const num = le ? buf.readUInt32LE(e.dataOffset) : buf.readUInt32BE(e.dataOffset);
  const den = le
    ? buf.readUInt32LE(e.dataOffset + 4)
    : buf.readUInt32BE(e.dataOffset + 4);
  return den === 0 ? 0 : num / den;
}

// Convert EXIF "YYYY:MM:DD HH:MM:SS" (local time, no TZ) to an ISO string.
// We construct a Date in local time then serialize — mirrors what the
// exif-reader library does for JPEG so date grouping is consistent.
function parseExifDate(s: string): string | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se] = m;
  const dateObj = new Date(+y, +mo - 1, +d, +h, +mi, +se);
  return isNaN(dateObj.getTime()) ? undefined : dateObj.toISOString();
}

export function readTiffExif(buf: Buffer): ExifData {
  const result: ExifData = {};
  try {
    if (buf.length < 8) return result;
    const bo = buf.readUInt16LE(0);
    const le = bo === 0x4949;
    const r16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
    const r32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
    if (r16(2) !== 0x2a) return result;

    const ifd0 = readEntries(buf, r32(4), le);

    // Camera make/model from IFD0
    const makeE = ifd0.get(TAG_MAKE);
    const modelE = ifd0.get(TAG_MODEL);
    const make = makeE ? readAscii(buf, makeE) : "";
    const model = modelE ? readAscii(buf, modelE) : "";
    if (model) {
      result.camera = model.startsWith(make) ? model : `${make} ${model}`.trim();
    }

    // DateTime from IFD0 as a fallback (usually the file-write time)
    const dtE = ifd0.get(TAG_DATETIME);
    if (dtE) {
      const dt = parseExifDate(readAscii(buf, dtE));
      if (dt) result.captureDate = dt;
    }

    // Traverse into EXIF SubIFD for the real shot data
    const exifPtr = ifd0.get(TAG_EXIF_IFD_POINTER);
    if (exifPtr) {
      const exifIfdOffset = readLong(buf, exifPtr, le);
      const exif = readEntries(buf, exifIfdOffset, le);

      const dto = exif.get(TAG_DATETIME_ORIGINAL);
      if (dto) {
        const dt = parseExifDate(readAscii(buf, dto));
        if (dt) result.captureDate = dt;
      }

      const fnumber = exif.get(TAG_F_NUMBER);
      if (fnumber) {
        result.aperture = Math.round(readRational(buf, fnumber, le) * 10) / 10;
      }

      const expTime = exif.get(TAG_EXPOSURE_TIME);
      if (expTime) {
        const t = readRational(buf, expTime, le);
        if (t >= 1) result.shutterSpeed = `${t}s`;
        else if (t > 0) result.shutterSpeed = `1/${Math.round(1 / t)}s`;
      }

      const iso = exif.get(TAG_ISO);
      if (iso) result.iso = readShort(buf, iso, le);

      const focal = exif.get(TAG_FOCAL_LENGTH);
      if (focal) result.focalLength = Math.round(readRational(buf, focal, le));

      const lens = exif.get(TAG_LENS_MODEL);
      if (lens) result.lens = readAscii(buf, lens);
    }
  } catch {
    // fall through with whatever we managed to parse
  }
  return result;
}

/**
 * Read just the first `bytes` of a file so we can parse the TIFF header +
 * IFDs without loading a 30MB+ RAW for every folder scan. Sony ARWs and
 * Lightroom DNGs keep IFD0 and the EXIF SubIFD well under 1MB into the file.
 */
export async function readTiffExifFromFile(
  filePath: string,
  bytes = 1024 * 1024
): Promise<ExifData> {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const buf = Buffer.allocUnsafe(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return readTiffExif(buf.subarray(0, bytesRead));
  } catch {
    return {};
  } finally {
    await handle?.close();
  }
}
