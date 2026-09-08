import { DownloadFormat } from "./download-helpers";

function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  // Empty download attribute lets the server's Content-Disposition filename win.
  a.setAttribute("download", "");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadSingle(imagePath: string, format: DownloadFormat) {
  const segments = imagePath.split("/").map(encodeURIComponent).join("/");
  triggerDownload(`/api/download/${segments}?format=${format}`);
}

export function downloadZip(
  paths: string[],
  format: DownloadFormat,
  zipName?: string
) {
  const params = new URLSearchParams({
    paths: JSON.stringify(paths),
    format,
  });
  if (zipName) params.set("filename", zipName);
  triggerDownload(`/api/download-zip?${params.toString()}`);
}

export { type DownloadFormat };
