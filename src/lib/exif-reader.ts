import exifReader from "exif-reader";

export interface ExifData {
  aperture?: number;
  shutterSpeed?: string;
  iso?: number;
  focalLength?: number;
  captureDate?: string;
  camera?: string;
  lens?: string;
}

export function parseExifBuffer(buffer: Buffer): ExifData {
  try {
    const parsed = exifReader(buffer);
    const result: ExifData = {};

    if (parsed.Photo) {
      if (parsed.Photo.FNumber) {
        result.aperture = parsed.Photo.FNumber;
      }
      if (parsed.Photo.ExposureTime) {
        const val = parsed.Photo.ExposureTime;
        if (val >= 1) {
          result.shutterSpeed = `${val}s`;
        } else {
          result.shutterSpeed = `1/${Math.round(1 / val)}s`;
        }
      }
      if (parsed.Photo.ISOSpeedRatings) {
        result.iso = parsed.Photo.ISOSpeedRatings;
      }
      if (parsed.Photo.FocalLength) {
        result.focalLength = parsed.Photo.FocalLength;
      }
      if (parsed.Photo.DateTimeOriginal) {
        const d = parsed.Photo.DateTimeOriginal;
        if (d instanceof Date) {
          result.captureDate = d.toISOString();
        }
      }
      if (parsed.Photo.LensModel) {
        result.lens = parsed.Photo.LensModel;
      }
    }

    if (parsed.Image) {
      const make = parsed.Image.Make || "";
      const model = parsed.Image.Model || "";
      if (model) {
        result.camera = model.startsWith(make)
          ? model
          : `${make} ${model}`.trim();
      }
    }

    return result;
  } catch {
    return {};
  }
}
