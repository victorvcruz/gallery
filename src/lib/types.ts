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
