import { ImageInfo } from "./types";
import { walkAllImages } from "./fs-scanner";

export interface BucketCount {
  label: string;
  count: number;
}

export interface StatsResult {
  totalPhotos: number;
  totalFolders: number;
  totalBytes: number;
  dateRange: { earliest?: string; latest?: string };
  cameras: BucketCount[];
  lenses: BucketCount[];
  focalLengths: BucketCount[];
  apertures: BucketCount[];
  shutterSpeeds: BucketCount[];
  isos: BucketCount[];
  byMonth: BucketCount[];
  byWeekday: BucketCount[];
  byHour: BucketCount[];
}

const FOCAL_ORDER = [
  "< 16 mm",
  "16–24 mm",
  "24–35 mm",
  "35–50 mm",
  "50–85 mm",
  "85–135 mm",
  "135–200 mm",
  "200 mm+",
] as const;

const APERTURE_ORDER = [
  "< f/1.8",
  "f/1.8–2.8",
  "f/2.8–4",
  "f/4–5.6",
  "f/5.6–8",
  "f/8–11",
  "f/11+",
] as const;

const SHUTTER_ORDER = [
  "≥ 1/1000 s",
  "1/1000–1/250 s",
  "1/250–1/60 s",
  "1/60–1/15 s",
  "1/15–1 s",
  "1–30 s",
  "30 s+",
] as const;

const ISO_ORDER = [
  "≤ 100",
  "100–400",
  "400–1600",
  "1600–6400",
  "6400+",
] as const;

const WEEKDAY_ORDER = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

function bucketFocal(mm: number): string {
  if (mm < 16) return FOCAL_ORDER[0];
  if (mm < 24) return FOCAL_ORDER[1];
  if (mm < 35) return FOCAL_ORDER[2];
  if (mm < 50) return FOCAL_ORDER[3];
  if (mm < 85) return FOCAL_ORDER[4];
  if (mm < 135) return FOCAL_ORDER[5];
  if (mm < 200) return FOCAL_ORDER[6];
  return FOCAL_ORDER[7];
}

function bucketAperture(f: number): string {
  if (f < 1.8) return APERTURE_ORDER[0];
  if (f < 2.8) return APERTURE_ORDER[1];
  if (f < 4) return APERTURE_ORDER[2];
  if (f < 5.6) return APERTURE_ORDER[3];
  if (f < 8) return APERTURE_ORDER[4];
  if (f < 11) return APERTURE_ORDER[5];
  return APERTURE_ORDER[6];
}

function shutterToSeconds(s: string): number | null {
  const frac = /^1\/(\d+)s$/.exec(s);
  if (frac) return 1 / Number(frac[1]);
  const whole = /^(\d+(?:\.\d+)?)s$/.exec(s);
  if (whole) return Number(whole[1]);
  return null;
}

function bucketShutter(s: string): string | null {
  const secs = shutterToSeconds(s);
  if (secs === null) return null;
  if (secs <= 1 / 1000) return SHUTTER_ORDER[0];
  if (secs <= 1 / 250) return SHUTTER_ORDER[1];
  if (secs <= 1 / 60) return SHUTTER_ORDER[2];
  if (secs <= 1 / 15) return SHUTTER_ORDER[3];
  if (secs <= 1) return SHUTTER_ORDER[4];
  if (secs <= 30) return SHUTTER_ORDER[5];
  return SHUTTER_ORDER[6];
}

function bucketIso(iso: number): string {
  if (iso <= 100) return ISO_ORDER[0];
  if (iso <= 400) return ISO_ORDER[1];
  if (iso <= 1600) return ISO_ORDER[2];
  if (iso <= 6400) return ISO_ORDER[3];
  return ISO_ORDER[4];
}

function orderedFromFixed(
  counts: Map<string, number>,
  order: readonly string[]
): BucketCount[] {
  return order
    .map((label) => ({ label, count: counts.get(label) ?? 0 }))
    .filter((b) => b.count > 0);
}

function orderedByCountDesc(counts: Map<string, number>): BucketCount[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function aggregate(images: ImageInfo[], folderCount: number): StatsResult {
  const cameras = new Map<string, number>();
  const lenses = new Map<string, number>();
  const focal = new Map<string, number>();
  const aperture = new Map<string, number>();
  const shutter = new Map<string, number>();
  const iso = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const byWeekday = new Map<number, number>();
  const byHour = new Map<number, number>();

  let totalBytes = 0;
  let earliest: string | undefined;
  let latest: string | undefined;

  const inc = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const img of images) {
    if (img.fileSize) totalBytes += img.fileSize;

    if (img.exif.camera) inc(cameras, img.exif.camera);
    if (img.exif.lens) inc(lenses, img.exif.lens);
    if (img.exif.focalLength) inc(focal, bucketFocal(img.exif.focalLength));
    if (img.exif.aperture) inc(aperture, bucketAperture(img.exif.aperture));
    if (img.exif.shutterSpeed) {
      const b = bucketShutter(img.exif.shutterSpeed);
      if (b) inc(shutter, b);
    }
    if (img.exif.iso) inc(iso, bucketIso(img.exif.iso));

    const dateStr = img.captureDate || img.createdDate;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        inc(byMonth, monthKey);
        inc(byWeekday, d.getDay());
        inc(byHour, d.getHours());

        if (!earliest || dateStr < earliest) earliest = dateStr;
        if (!latest || dateStr > latest) latest = dateStr;
      }
    }
  }

  return {
    totalPhotos: images.length,
    totalFolders: folderCount,
    totalBytes,
    dateRange: { earliest, latest },
    cameras: orderedByCountDesc(cameras),
    lenses: orderedByCountDesc(lenses),
    focalLengths: orderedFromFixed(focal, FOCAL_ORDER),
    apertures: orderedFromFixed(aperture, APERTURE_ORDER),
    shutterSpeeds: orderedFromFixed(shutter, SHUTTER_ORDER),
    isos: orderedFromFixed(iso, ISO_ORDER),
    byMonth: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, count })),
    byWeekday: [...byWeekday.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, count]) => ({ label: WEEKDAY_ORDER[day], count })),
    byHour: [...byHour.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, count]) => ({ label: `${String(hour).padStart(2, "0")}h`, count })),
  };
}

export async function computeStats(relativePath: string): Promise<StatsResult> {
  const { images, folderCount } = await walkAllImages(relativePath);
  return aggregate(images, folderCount);
}
