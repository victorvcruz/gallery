export interface ExifData {
  aperture?: number;
  shutterSpeed?: string;
  iso?: number;
  focalLength?: number;
  captureDate?: string;
  camera?: string;
  lens?: string;
}

export interface ImageInfo {
  name: string;
  path: string;
  width: number;
  height: number;
  exif: ExifData;
  captureDate?: string;
  createdDate?: string;
  /** Original file size in bytes. */
  fileSize?: number;
  /** True when this record is a lightweight placeholder (dimensions are
   *  a stand-in and EXIF is empty) because the metadata hasn't been
   *  computed yet. The background queue will fill it in and a future
   *  scan will return the real values. */
  pending?: boolean;
}

export interface FolderInfo {
  name: string;
  path: string;
  bannerImage?: string;
}

export interface FolderData {
  folders: FolderInfo[];
  images: ImageInfo[];
}

export type SortOrder = "captureDate" | "createdDate" | "fileName";
export type SortDirection = "asc" | "desc";
export type GroupBy = "none" | "day" | "month" | "year";

export interface ImageGroup {
  key: string;
  label: string;
  images: ImageInfo[];
}
